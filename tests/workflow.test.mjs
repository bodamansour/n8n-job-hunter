// Consistency checks between the workflow export and the docs/templates in
// this repo, without running n8n. Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const workflow = JSON.parse(read('workflow/job-hunter-all-in-one.json'));
const raw = JSON.stringify(workflow);
const schema = read('data-tables/schema.md');

/** Column names documented for a table in data-tables/schema.md. */
function documentedColumns(table) {
  const section = schema.split(`## ${table}`)[1].split('\n## ')[0];
  const fromTable = [...section.matchAll(/^\| ([a-z_ /]+) \|/gm)]
    .map((m) => m[1].trim())
    .filter((c) => c !== 'column')
    .flatMap((c) => c.split('/').map((s) => s.trim()));
  const fromList = [...section.matchAll(/`([a-z_]+)` (?:string|number|boolean|date)/g)].map((m) => m[1]);
  return new Set([...fromTable, ...fromList]);
}

test('every connection points at a node that exists', () => {
  const names = new Set(workflow.nodes.map((n) => n.name));
  for (const [source, outputs] of Object.entries(workflow.connections)) {
    assert.ok(names.has(source), `unknown source node: ${source}`);
    for (const branches of Object.values(outputs)) {
      for (const branch of branches) {
        for (const target of branch || []) assert.ok(names.has(target.node), `unknown target: ${target.node}`);
      }
    }
  }
});

test('the export carries no instance-specific IDs or test data', () => {
  assert.equal(workflow.meta?.instanceId, undefined);
  assert.equal(workflow.id, undefined);
  assert.deepEqual(workflow.pinData ?? {}, {});
  for (const node of workflow.nodes) {
    for (const credential of Object.values(node.credentials || {})) {
      assert.equal(credential.id, undefined, `${node.name} still has a credential ID`);
    }
  }
});

test('no email address or phone number is hard-coded', () => {
  assert.doesNotMatch(raw, /[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  assert.doesNotMatch(raw, /(?<![\w-])\+?\d{11,15}(?![\w-])/);
});

test('every setting the workflow reads exists in the jh_settings template', () => {
  const columns = new Set(read('data-tables/jh_settings.csv').split('\n')[0].split(','));
  const used = new Set([
    ...[...raw.matchAll(/Load Settings[^']*'\)\.first\(\)\.json\.(\w+)/g)].map((m) => m[1]),
    ...[...raw.matchAll(/\bS\.(\w+)/g)].map((m) => m[1]),
  ]);
  assert.ok(used.size > 10, 'expected the workflow to read its settings');
  for (const field of used) assert.ok(columns.has(field), `setting missing from jh_settings.csv: ${field}`);
  assert.deepEqual(new Set(columns), documentedColumns('jh_settings'));
});

test('every column the workflow writes is documented in schema.md', () => {
  for (const node of workflow.nodes) {
    const table = node.parameters?.dataTableId?.value;
    const written = Object.keys(node.parameters?.columns?.value || {});
    if (!table || !written.length) continue;
    const documented = documentedColumns(table);
    for (const column of written) {
      assert.ok(documented.has(column), `${node.name} writes ${table}.${column}, which schema.md doesn't list`);
    }
  }
});

test("every $('Node') reference points at a node in the export", () => {
  const names = new Set(workflow.nodes.map((n) => n.name));
  const referenced = new Set([...raw.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));
  for (const name of referenced) {
    assert.ok(names.has(name), `the workflow reads $('${name}'), which isn't a node`);
  }
});

/** Target node names of one output (0 = main/true, 1 = false/error) of a node. */
const targets = (name, output = 0) =>
  (workflow.connections[name]?.main?.[output] || []).map((c) => c.node);

test('auto-apply sends the cover letter with the CV, and only then marks the job as sent', () => {
  assert.deepEqual(targets('Write Cover Letter'), ['Download CV PDF']);
  assert.deepEqual(targets('Download CV PDF'), ['Create Application Email']);
  assert.deepEqual(targets('Create Application Email'), ['Send Application Email']);
  assert.deepEqual(targets('Send Application Email'), ['Email Sent?']);
  assert.deepEqual(targets('Email Sent?', 0), ['Mark Email Sent']);
  assert.deepEqual(targets('Mark Email Sent'), ['Loop Jobs']);

  const draft = workflow.nodes.find((n) => n.name === 'Create Application Email');
  assert.equal(draft.type, 'n8n-nodes-base.microsoftOutlook');
  assert.equal(draft.parameters.resource, 'draft');
  assert.equal(draft.parameters.operation, 'create');
  assert.match(draft.parameters.bodyContent, /\$\('Write Cover Letter'\)\.item\.json\.text/);
  assert.match(draft.parameters.additionalFields.toRecipients, /\$\('Loop Jobs'\)\.item\.json\.apply_email/);
  assert.deepEqual(draft.parameters.additionalFields.attachments, { attachments: [{ binaryPropertyName: 'data' }] });

  const send = workflow.nodes.find((n) => n.name === 'Send Application Email');
  assert.equal(send.parameters.resource, 'draft');
  assert.equal(send.parameters.operation, 'send');
  assert.equal(send.parameters.draftId.value, '={{ $json.id }}');

  // Mark Email Sent stores the conversation ID that Check Outlook Replies matches on.
  const mark = workflow.nodes.find((n) => n.name === 'Mark Email Sent');
  assert.match(mark.parameters.columns.value.gmail_thread_id, /\$\('Create Application Email'\)\.item\.json\.conversationId/);
  const check = workflow.nodes.find((n) => n.name === 'Email Sent?');
  assert.equal(check.parameters.conditions.conditions[0].leftValue, '={{ $json.success === true }}');
});

test('if any auto-apply step fails, the job falls back to the manual list and the loop goes on', () => {
  for (const name of ['Download CV PDF', 'Create Application Email', 'Send Application Email']) {
    const n = workflow.nodes.find((x) => x.name === name);
    assert.equal(n.onError, 'continueErrorOutput', `${name} must keep going on error`);
    assert.deepEqual(targets(name, 1), ['Fall Back To Manual'], `${name} error output`);
  }
  assert.deepEqual(targets('Email Sent?', 1), ['Fall Back To Manual']);
  assert.deepEqual(targets('Fall Back To Manual'), ['Save Score & Status']);
  assert.deepEqual(targets('Save Score & Status'), ['Loop Jobs']);

  const values = Object.fromEntries(
    workflow.nodes.find((n) => n.name === 'Fall Back To Manual').parameters.assignments.assignments
      .map((a) => [a.name, a.value])
  );
  assert.equal(values.status, 'needs_manual');
  for (const field of ['row_id', 'score', 'reason']) {
    assert.match(values[field], new RegExp(`\\$\\('Loop Jobs'\\)\\.item\\.json\\.${field}`), field);
  }
});

test('the Outlook nodes stay disabled until a Microsoft credential is connected', () => {
  for (const node of workflow.nodes.filter((n) => n.type === 'n8n-nodes-base.microsoftOutlook')) {
    assert.equal(node.disabled, true, `${node.name} should be disabled in the export`);
    assert.deepEqual(Object.keys(node.credentials || {}), ['microsoftOutlookOAuth2Api'], node.name);
  }
});

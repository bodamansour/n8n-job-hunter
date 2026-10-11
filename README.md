# n8n Job Hunter 🔎

An n8n workflow that searches for entry-level tech jobs every morning, scores each one against your CV with Google Gemini, and sends you a daily summary on WhatsApp through the WhatsApp Business Cloud API.

> 🇪🇬 النسخة العربية تحت.

## What it does

| Time (Africa/Cairo) | Stage | Details |
|---|---|---|
| 08:00 | **Collect** | Pulls jobs from Remotive, RemoteOK, Arbeitnow and WeWorkRemotely, plus optional Greenhouse/Lever company boards and custom RSS feeds. |
| | **Filter** | Keeps titles that match your keywords and drops senior roles. Accepts only your locations or remote roles open to your region, and only jobs posted within the last 30 days. |
| | **Deduplicate** | Stores every job in an n8n Data Table so it is never processed twice. |
| | **Score** | Gemini rates each fresh job 0–100 using **only your CV text**, plus a one-line reason in Arabic. Jobs that fail to score are retried on the next run. |
| | **Route** | Strong matches go to a "needs manual application" list, with the apply link or the email address to send your CV to. Optional email auto-apply (Outlook) is off by default; see [Auto-apply](#auto-apply-optional-off-by-default). |
| 09:00 | **Analyse** | Shows the most requested skills across the last 30 days and the average advertised salary. The average is grouped by currency and period and lists its sources. If fewer than 5 postings mention a salary, the report says the data is insufficient instead of guessing. |
| | **News** | Top Egypt tech / job-market headlines from the last 72 hours (Arabic + English), deduplicated. |
| | **Report** | Sends an approved WhatsApp template with the summary, then the full details as a follow-up message whenever the 24-hour chat window is open. On a busy day the job lists in the details are shortened (ending with `…`) so the message stays under WhatsApp's 4,096-character limit. |
| anytime | **Errors** | Every run and failure is logged to a `jh_runs` table, and failures trigger a WhatsApp alert. |

## Stack
- **n8n**: self-hosted, with Data Tables.
- **Google Gemini**: scoring uses `gemini-3.1-flash-lite`. Cover letters use `gemini-3-flash-preview` and are only needed for auto-apply.
- **WhatsApp Business Cloud API** for the daily report.
- **Public job APIs and RSS**, plus Google News RSS.

## Setup
1. **Import** `workflow/job-hunter-all-in-one.json` into n8n (*Workflows → Import from File*).
2. **Create the three data tables** described in [`data-tables/schema.md`](data-tables/schema.md). Add one row to `jh_settings` using [`data-tables/jh_settings.csv`](data-tables/jh_settings.csv) as a template, and paste your CV text into `cv_text`.
3. **Add credentials** in n8n:
   - **Google Gemini (PaLM) API** key from [Google AI Studio](https://aistudio.google.com/apikey).
   - **WhatsApp API**, using a permanent System User token and your WhatsApp Business Account ID. See [`docs/whatsapp-template.md`](docs/whatsapp-template.md).

   The export contains only credential *names*, never keys, so after importing, open each Gemini and WhatsApp node and pick your credential.
4. **Create and approve** the `daily_job_report` template ([`docs/whatsapp-template.md`](docs/whatsapp-template.md)), and put your Phone Number ID in `wa_phone_number_id`.
5. Open *Workflow settings → Error workflow* and select **this same workflow**.
6. **Test:** run the *Test Search* trigger and check `jh_jobs` for scores. Then run the *Daily 9 AM Report* trigger and check WhatsApp.
7. **Publish** the workflow. It runs daily as long as your n8n instance is online.

### Auto-apply (optional, off by default)
When a strong match has an apply email in the posting and `auto_apply_enabled = true`, the workflow goes:

*Write Cover Letter → Download CV PDF → **Create Application Email** (Outlook draft to the apply email, cover letter as the body, CV attached) → **Send Application Email** → **Email Sent?** → Mark Email Sent*

The job is marked `email_sent_awaiting_confirmation` only after Outlook confirms the send, and the draft's `conversationId` is saved so **Check Outlook Replies** can match the employer's reply the next morning. If the CV download, the draft, or the send fails (or the Outlook nodes are still disabled), **Fall Back To Manual** puts the job on the "needs manual application" list with the email address, and the loop moves on to the next job.

To turn it on:
1. Connect a **Microsoft Outlook OAuth2** credential and select it in **Create Application Email**, **Send Application Email**, **Check Outlook Replies**, and (optionally) **Email Error Alert**.
2. Enable those nodes. They are disabled in the export so the workflow can be published before the credential exists.
3. In `jh_settings`, set `cv_pdf_url` (a direct link to your CV PDF), `applicant_name`, `applicant_email`, and `auto_apply_enabled = true`. `max_daily_applications` (default 5) caps how many emails go out per day.
4. Start with `max_daily_applications = 1`, run *Test Search*, and read the email in Outlook's Sent folder. Cover letters use only your CV text, but check a few before you raise the cap.

## Customize the scoring
The **Score Job Match** node's prompt describes the candidate's level ("university student (penultimate year) seeking internship / entry-level / junior / graduate roles"). Edit that line if it doesn't describe you; everything else comes from `cv_text` and the other `jh_settings` columns.

## Check the files
```bash
node --test tests/*.test.mjs   # Node.js 21 or newer
```
- `tests/workflow.test.mjs` checks that every connection and every `$('Node')` reference points to a real node, that auto-apply marks a job as sent only after the send succeeds and falls back to the manual list on any failure, that the export has no credential IDs or hard-coded emails/phone numbers, that every setting the workflow reads is in `jh_settings.csv`, and that every column it writes is documented in `data-tables/schema.md`.
- `tests/code-nodes.test.mjs` runs the Code nodes from the export with sample jobs: filtering by title, level, location and age, de-duplication, salary and apply-email parsing, the scoring queue, the manual/auto-apply routing and its daily cap, the report's salary and skills rules, the WhatsApp length limits, and reply matching.

Run them after re-exporting the workflow. GitHub Actions runs them on every pull request and push to `main`.

## Design principles
- **No invented experience.** Scoring and cover letters are grounded strictly in the CV text.
- **No fake numbers.** Salary averages show their sample size, currency and period, or say the data is insufficient.
- **"Applied" means confirmed.** A job is marked `applied_confirmed` only after a real reply from the employer.
- **Secrets stay in n8n Credentials.** None are stored in the workflow JSON.

---

## 🇪🇬 بالعربي

Workflow على n8n بيدوّر كل يوم الصبح على وظائف تقنية للمبتدئين والمتدربين. بيقيّم كل وظيفة على أساس الـCV بتاعك باستخدام Gemini، ويبعتلك ملخص يومي على واتساب.

**المراحل:**
- **الساعة 8**:
  - يجمع الوظائف من مواقع عالمية مجانية.
  - يفلترها بالمسمى والمكان ويستبعد الـSenior.
  - يمنع التكرار.
  - يقيّم كل وظيفة من 0 لـ100 بناءً على الـCV بس، ومعاها سبب مختصر.
- **الساعة 9**:
  - يحلل المهارات الأكثر طلبًا ومتوسط الرواتب في آخر 30 يوم. لو البيانات قليلة بيقول كده صراحة.
  - يجمع أهم أخبار سوق العمل والتقنية في مصر خلال آخر 72 ساعة.
  - يبعت التقرير على واتساب بقالب معتمد.
- **أي وقت**: أي خطأ بيتسجل، ويوصلك تنبيه بيه على واتساب.

**التقديم التلقائي (اختياري):** مقفول افتراضيًا. لو فعّلته وربطت حساب Outlook، بيبعت إيميل التقديم ومعاه الـCV للوظايف القوية اللي في إعلانها إيميل، وبيعلّم الوظيفة إنها اتبعتت بس لما الإرسال ينجح فعلًا. لو أي خطوة فشلت، الوظيفة بترجع لقايمة "محتاجة تقديم يدوي".

**التشغيل:** اتبع خطوات Setup اللي فوق: استورد الملف، واعمل الجداول، واربط Gemini وواتساب، واعمل القالب، وجرّب، وبعدين انشر.

## License
MIT

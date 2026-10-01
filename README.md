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
| | **Route** | Strong matches go to a "needs manual application" list, with the apply link or the email address to send your CV to. Optional email auto-apply is built in but off by default. |
| 09:00 | **Analyse** | Shows the most requested skills across the last 30 days and the average advertised salary. The average is grouped by currency and period and lists its sources. If fewer than 5 postings mention a salary, the report says the data is insufficient instead of guessing. |
| | **News** | Top Egypt tech / job-market headlines from the last 72 hours (Arabic + English), deduplicated. |
| | **Report** | Sends an approved WhatsApp template with the summary, then the full details as a follow-up message whenever the 24-hour chat window is open. |
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
4. **Create and approve** the `daily_job_report` template ([`docs/whatsapp-template.md`](docs/whatsapp-template.md)), and put your Phone Number ID in `wa_phone_number_id`.
5. Open *Workflow settings → Error workflow* and select **this same workflow**.
6. **Test:** run the *Test Search* trigger and check `jh_jobs` for scores. Then run the *Daily 9 AM Report* trigger and check WhatsApp.
7. **Publish** the workflow. It runs daily as long as your n8n instance is online.

> Email (Outlook) nodes for auto-apply and reply tracking are included but disabled. Enable them only after connecting a Microsoft OAuth2 credential and setting `auto_apply_enabled = true` and `cv_pdf_url`.

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

**التشغيل:** اتبع خطوات Setup اللي فوق: استورد الملف، واعمل الجداول، واربط Gemini وواتساب، واعمل القالب، وجرّب، وبعدين انشر.

## License
MIT

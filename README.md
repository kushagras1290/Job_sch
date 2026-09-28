# Job Scout Agent

A deployable, find-only job-search agent for the existing India-remote AI job workflow. It runs on Cloudflare Workers with the Agents SDK, keeps its own durable state, and exposes an authenticated API for manual runs, scheduled runs, records, and CSV export.

It **does not apply to jobs**. It has no browser login, resume-upload, email, account-creation, or application-submission code. The agent can only create `New` or `Hold` research records. A role becomes `New` only when the supplied listing explicitly supports India-resident eligibility and India/EU-compatible hours; otherwise it remains `Hold`.

## What runs in the cloud

`JobScoutAgent` uses a durable Cloudflare Agent instance named `primary`. Its persisted schedule is:

| India time | UTC cron used by the agent |
| --- | --- |
| 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00 IST | `30 18,21,0,3,6,9,12,15 * * *` |

Cloudflare persists scheduled Agent tasks across restarts. The agent searches through Tavily, asks the OpenAI Responses API for a constrained structured assessment, then applies deterministic eligibility, score-bound, and duplicate safeguards before storing a record. The LLM is not allowed to apply or contact anyone.

## Run locally

1. Install Node 20+.
2. Copy `.dev.vars.example` to `.dev.vars` and set a long `CRON_SECRET`. Set `TAVILY_API_KEY` and `OPENAI_API_KEY` to enable autonomous discovery.
3. Install and verify:

   ```powershell
   npm install
   npm run check
   npm test
   npm run dev
   ```

4. In a second terminal, run the agent now:

   ```powershell
   $headers = @{ Authorization = "Bearer YOUR_CRON_SECRET" }
   Invoke-RestMethod -Method Post -Headers $headers http://localhost:8787/api/run
   ```

Without the two provider keys, `/api/run` safely reports a skipped run and makes no job claims.

## Cloud deployment

1. Log in to the Cloudflare account that should own the app:

   ```powershell
   npx wrangler login
   ```

2. Store secrets. They never belong in Git:

   ```powershell
   npx wrangler secret put CRON_SECRET
   npx wrangler secret put TAVILY_API_KEY
   npx wrangler secret put OPENAI_API_KEY
   npx wrangler secret put OPENAI_MODEL
   ```

3. Deploy:

   ```powershell
   npm run deploy
   ```

4. Confirm it is live:

   ```powershell
   Invoke-RestMethod https://job-scout-agent.YOUR_SUBDOMAIN.workers.dev/health
   ```

The first authenticated request creates the durable `primary` agent and registers its recurring schedule. Use `POST /api/run` once after deployment to both initialize it and perform the first run.

## Calling the agent

All endpoints except `/health` require `Authorization: Bearer <CRON_SECRET>`.

| Request | Purpose |
| --- | --- |
| `POST /api/run` | Run discovery immediately. Safe to call repeatedly; duplicate records are blocked. |
| `GET /api/status` | Last run, schedule, tracked-record count, and the find-only policy. |
| `GET /api/jobs` | Every cloud-tracked job, including Holds. |
| `GET /api/export.csv` | Download records for Excel. |
| `POST /api/jobs` | Add a human-verified job JSON record. Validation still enforces Hold for unknown/incompatible eligibility or hours. |

Example after deployment:

```powershell
$headers = @{ Authorization = "Bearer YOUR_CRON_SECRET" }
Invoke-RestMethod -Method Post -Headers $headers https://job-scout-agent.YOUR_SUBDOMAIN.workers.dev/api/run
Invoke-RestMethod -Headers $headers https://job-scout-agent.YOUR_SUBDOMAIN.workers.dev/api/status
Invoke-WebRequest -Headers $headers -OutFile .\job-scout-export.csv https://job-scout-agent.YOUR_SUBDOMAIN.workers.dev/api/export.csv
```

## Relationship to the local tracker

The cloud agent has durable Cloudflare state and its own CSV export. It deliberately does **not** edit `D:\Job Automation\Remote_Job_Application_Tracker.xlsx`, because a cloud worker cannot safely write to a private Windows drive. Export the CSV and import/review it in the local workbook, or add a separately authenticated storage integration later. This avoids silent overwrites of your local tracker and preserves the current review-before-application workflow.

## Costs and operating limits

Every scheduled run can call Tavily and OpenAI, so use API-provider spending limits and start with a low result limit. Review the first manual run before relying on the schedule. The agent only treats source text as evidence; search snippets or inaccessible pages are retained as `Hold`, not actionable recommendations.

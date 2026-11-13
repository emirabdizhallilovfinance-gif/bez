# Bez

Учёт денег по проектам. The admin gives money to workers on a project, workers send expenses, and the admin approves or rejects them. Each project can have a contract (budget) that only the admin sees.

Plain HTML, CSS and JavaScript with [Supabase](https://supabase.com) for login and data. No build step.

## Files

| Path | What it is |
|---|---|
| `index.html` | The page. Loads Supabase, `config.js` and `app.js`. |
| `app.js` | The whole app: login, admin views, worker views, charts, CSV. |
| `style.css` | Styles, light and dark theme. |
| `config.js` | Supabase address and **publishable** key. Not in git (see below). |
| `sql/` | Database changes, numbered in the order they were applied. |
| `NOTES.md` | Current plan, open decisions and reminders. |

## Setup

Create `config.js` next to `index.html`:

```js
window.BEZ_CONFIG = {
  SUPABASE_URL: "https://sthkgkxnphjtlngopvlh.supabase.co",
  SUPABASE_KEY: "<publishable key>"
};
```

Only the publishable key goes here. Never the secret or `service_role` key.

Then open `index.html` through any static web server.

## Database (`sql/`)

All six files are **already applied** to the Bez Supabase project. They are kept as a record. The base tables (`profiles`, `projects`, `project_members`, `transfers`, `expenses`, the `balances` view) were created before these files and are not in this folder.

| File | What it does |
|---|---|
| `01-add-proof-columns.sql` | Adds `proof_path` to transfers and expenses. |
| `02-fix-worker-upload-policy.sql` | Lets workers upload proofs into their own folder. |
| `03-proof-storage-policy.sql` | Private proofs bucket, storage rules, proof check trigger. **Do not run again**: it makes photos required. |
| `04-project-contract.sql` | `project_contracts` table, admin only. |
| `05-optional-proof.sql` | Makes photos optional; a description is enough. |
| `06-lock-down-api-functions.sql` | Blocks direct API calls to internal functions. |

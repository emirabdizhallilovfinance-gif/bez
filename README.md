# Bez
**Every som handed out, accounted for.**

On a job site the boss hands workers cash for fuel, food and materials. By the end of the week nobody remembers who got what or where it went. Bez keeps one running count that the boss and every worker can trust, so there's nothing left to argue about.

## How it works
1. **Set up.** The boss creates a project (Кайнар, 100 000 сом), sets the contract amount and adds the crew.
2. **Fund.** The boss tops up a worker, and that worker's balance goes up.
3. **Spend.** The worker logs each expense with an amount, a reason and a **required photo of the receipt**. Their balance goes down right away.
4. **No approval step.** Expenses are final when sent. If a worker makes a mistake, the boss corrects it with a deduction.

## Who sees what
| | Boss | Worker |
|---|---|---|
| Projects | All of them; only the boss can delete one | Only the ones they're on |
| Money | Every balance, contract remaining, overview charts | Their own balance and history |
| Tools | CSV report, top-ups, deductions | Expense form (with receipt photo) |

## Rules Bez enforces
- Nobody spends money they don't have.
- Money only goes to people on the project.
- A worker's expense must come with a PNG or JPEG receipt photo (up to 10 MB). Boss top-ups and deductions need only a description.
- Every expense counts against the contract right away.
- Workers can't see the contract or anyone else's money, and can't change an expense after sending it. The database enforces this, not just the screen.

## Under the hood
Plain JavaScript on Supabase, which handles login, the database and private photo storage. Row-level security keeps boss data on the server. The interface is in Russian and amounts are in som. It works on a phone and has a dark mode.

## Database scripts
Run in this order in the Supabase SQL Editor: `add-proof-columns.sql`, `proof-storage-policy.sql`, `fix-worker-upload-policy.sql`, `project-contract.sql`, `optional-proof.sql`, `worker-proof-no-approval.sql`. `add-fk-indexes.sql` can be run any time after.

## Status
- ✅ Contracts, redesign, receipt photos and no-approval expenses are done.
- ✅ Live at https://bez-navy.vercel.app (Vercel project `bez`, team abdizhalilcorp). Every merge into `main` redeploys it automatically.
- ⏭️ Next: try the phone layout on a real phone with real logins.

**Open question:** should a top-up reduce what's left of the contract? Right now it doesn't.

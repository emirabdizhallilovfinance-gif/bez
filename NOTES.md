# Bez — notes (14.11.2026)

## Done today
- PR #1 merged: project contracts, adding workers, warning badges, CSV, charts, black-and-white redesign.
- PR #2 merged: photos are no longer required. Top-ups, deductions and expenses need only an amount and a description. Old photos can still be opened.
- Supabase: blocked direct API calls to 3 internal functions. Made `proof_path` optional (`sql/05-optional-proof.sql`, already applied).
- Tested with real accounts: top-up 10, deduction 5, worker expense 3. Balance is correct (1 002 сом).
- Local Bez folder is synced with GitHub `main`. `app-recovery-copy.js` deleted (it's in the Recycle Bin).

## Next time: plan (in order)
1. **Fix the test data**
   - "test project" contract is 100 000 000 сом. Change it to the real amount.
   - "kainar" has no contract. Set one.
   - Delete the test entries ("test", 10/5/3 сом) or leave them.
2. **Test the rejection comment once:** worker sends an expense, admin rejects it with a comment, worker sees the comment.
3. **Turn on leaked-password protection:** Supabase → Authentication → password settings.
4. **Go live on Vercel**
   - `config.js` is not on GitHub (it's in `.gitignore`). Either commit it (the publishable key is safe to share) or have Vercel create it.
   - New Vercel project for the `bez` repo, no build step.
   - Turn OFF Vercel's login wall ("SSO / Deployment Protection"), or workers can't open the app.
   - Log in on the live address as admin and as worker.
5. **Give workers the link.**

## Later (optional)
- Admin page reloads all data after every action (slow, but works).
- Supabase performance hints: missing indexes, small policy tweaks.
- Archive the old Claude sessions "Bez project inspection" and "BEZ project inspection" (right-click in the sidebar → Archive), then delete their branches on GitHub: `claude/bez-project-inspection-44f66a` (merged) and `claude/bez-project-inspection-b687e8` (an older attempt that was never merged; everything useful is already on `main`).
- After the NOTES/cleanup PR is merged, delete `claude/bez-project-contracts-ebad89` too.

## Decisions I still need to make
- Should money given to workers (Пополнение) come off the project contract? Right now it does NOT. Only expenses and deductions do.
- Vercel address/name for the live app.
- Keep or delete the test entries.

## Remember
- Supabase project: **Bez** (`sthkgkxnphjtlngopvlh`). The other project ("…'s Project") is not Bez.
- GitHub repo: `emirabdizhallilovfinance-gif/bez`. Vercel `expancetracer` is a DIFFERENT app.
- Do NOT run `sql/03-proof-storage-policy.sql` again. It would make photos required again. `sql/05-optional-proof.sql` comes after it.
- Only the PUBLISHABLE key goes in `config.js`. Never the secret / service_role key.

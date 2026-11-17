-- Applied to Supabase (project sthkgkxnphjtlngopvlh) on 2026-11-17 as migration "add_foreign_key_indexes".
-- Adds covering indexes for the 6 foreign keys flagged by the performance advisor.
create index if not exists expenses_project_worker_idx on public.expenses (project_id, worker_id);
create index if not exists transfers_project_worker_idx on public.transfers (project_id, worker_id);
create index if not exists transfers_created_by_idx on public.transfers (created_by);
create index if not exists project_members_user_idx on public.project_members (user_id);
create index if not exists projects_created_by_idx on public.projects (created_by);
create index if not exists project_contracts_updated_by_idx on public.project_contracts (updated_by);

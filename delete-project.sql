-- Lets the boss delete a whole project from the app.
-- Deletes the project's expenses and top-ups first (the database refuses to
-- delete a project that still has them), then the project itself; members and
-- the contract are removed automatically. Only an admin can run it.
-- Receipt photos stay in the private "proofs" bucket (not reachable from the app).
create or replace function public.delete_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the boss can delete a project';
  end if;
  delete from public.expenses where project_id = p_project_id;
  delete from public.transfers where project_id = p_project_id;
  delete from public.projects where id = p_project_id;
end;
$$;

revoke all on function public.delete_project(uuid) from public, anon;
grant execute on function public.delete_project(uuid) to authenticated;

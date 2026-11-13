-- Project contract budget (e.g. "Кайнар" — 100 000 сом).
-- Only admins can read or change it. Workers never see this table.
-- Run once in the Supabase SQL editor. Safe to run again.

DO $$
DECLARE
  project_id_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO project_id_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.projects'::regclass
    AND a.attname = 'id'
    AND NOT a.attisdropped;

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.project_contracts (
      project_id %s PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
      amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
      updated_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  $sql$, project_id_type);
END
$$;

ALTER TABLE public.project_contracts ENABLE ROW LEVEL SECURITY;

-- No grants to anon at all; authenticated users pass through RLS below.
REVOKE ALL ON public.project_contracts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_contracts TO authenticated;

DROP POLICY IF EXISTS "project_contracts: admin only" ON public.project_contracts;
CREATE POLICY "project_contracts: admin only"
ON public.project_contracts
FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION public.touch_project_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS project_contracts_touch ON public.project_contracts;
CREATE TRIGGER project_contracts_touch
BEFORE INSERT OR UPDATE ON public.project_contracts
FOR EACH ROW EXECUTE FUNCTION public.touch_project_contract();

-- Money requests: a worker asks for money, the boss gives it or declines.
-- Run once in the Supabase SQL Editor (after the other scripts). Safe to run again.
--   * A worker can create a request for a project they belong to and read their own requests.
--   * The boss reads all requests and decides through decide_money_request().
--   * "Give" creates a normal top-up (transfers row), so it comes out of the contract
--     and shows up in the worker's balance. "Decline" only records the decision.
--   * Deleting a project deletes its requests too.
BEGIN;

CREATE TABLE IF NOT EXISTS public.money_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 300),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_comment text,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS money_requests_project_id_idx ON public.money_requests (project_id);
CREATE INDEX IF NOT EXISTS money_requests_worker_id_idx ON public.money_requests (worker_id);

ALTER TABLE public.money_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.money_requests FROM anon, authenticated;
GRANT SELECT, INSERT ON public.money_requests TO authenticated;

DROP POLICY IF EXISTS "money_requests: read own or admin" ON public.money_requests;
CREATE POLICY "money_requests: read own or admin"
ON public.money_requests
FOR SELECT
TO authenticated
USING (worker_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "money_requests: worker asks" ON public.money_requests;
CREATE POLICY "money_requests: worker asks"
ON public.money_requests
FOR INSERT
TO authenticated
WITH CHECK (
  worker_id = auth.uid()
  AND status = 'pending'
  AND admin_comment IS NULL
  AND decided_by IS NULL
  AND decided_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.project_members AS membership
    WHERE membership.project_id = money_requests.project_id
      AND membership.user_id = auth.uid()
  )
);

-- The boss's decision. Only an admin can run it; a request can be decided once.
CREATE OR REPLACE FUNCTION public.decide_money_request(
  p_request_id uuid,
  p_approve boolean,
  p_comment text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  req public.money_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the boss can decide a money request';
  END IF;

  SELECT * INTO req FROM public.money_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been decided';
  END IF;

  IF p_approve THEN
    INSERT INTO public.transfers (project_id, worker_id, amount, note, created_by)
    VALUES (req.project_id, req.worker_id, req.amount, 'По запросу: ' || req.reason, auth.uid());
  END IF;

  UPDATE public.money_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      admin_comment = NULLIF(btrim(p_comment), ''),
      decided_by = auth.uid(),
      decided_at = now()
  WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_money_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_money_request(uuid, boolean, text) TO authenticated;

COMMIT;

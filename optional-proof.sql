-- Proof photos are no longer required: a description is enough.
-- Run after proof-storage-policy.sql. Old proofs stay viewable; a proof that
-- is attached is still checked the same way as before.
BEGIN;

ALTER TABLE public.expenses ALTER COLUMN proof_path DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.require_private_transaction_proof()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $$
DECLARE
  path_parts text[];
  proof_mime text;
BEGIN
  -- Still enforced without a proof: money only moves for workers on the project.
  IF NOT EXISTS (
    SELECT 1
    FROM public.project_members AS membership
    WHERE membership.project_id = NEW.project_id
      AND membership.user_id = NEW.worker_id
  ) THEN
    RAISE EXCEPTION 'The worker is not assigned to this project';
  END IF;

  IF NEW.proof_path IS NULL OR btrim(NEW.proof_path) = '' THEN
    NEW.proof_path := NULL;
    RETURN NEW;
  END IF;

  path_parts := storage.foldername(NEW.proof_path);
  IF array_length(path_parts, 1) <> 2
     OR path_parts[1] IS DISTINCT FROM NEW.worker_id::text
     OR path_parts[2] IS DISTINCT FROM NEW.project_id::text
     OR NEW.proof_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg)$' THEN
    RAISE EXCEPTION 'Proof path must be worker_id/project_id/unique_filename.png, .jpg, or .jpeg';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.project_members AS membership
    WHERE membership.project_id = NEW.project_id
      AND membership.user_id = NEW.worker_id
  ) THEN
    RAISE EXCEPTION 'The worker is not assigned to this project';
  END IF;

  SELECT object.metadata->>'mimetype'
  INTO proof_mime
  FROM storage.objects AS object
  WHERE object.bucket_id = 'proofs'
    AND object.name = NEW.proof_path
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The proof must be uploaded to the private proofs bucket first';
  END IF;

  IF proof_mime IS NULL OR proof_mime NOT IN ('image/png', 'image/jpeg') THEN
    RAISE EXCEPTION 'Proof must be a PNG or JPEG image';
  END IF;

  IF (NEW.proof_path LIKE '%.png' AND proof_mime <> 'image/png')
     OR (NEW.proof_path LIKE '%.jpg' AND proof_mime <> 'image/jpeg')
     OR (NEW.proof_path LIKE '%.jpeg' AND proof_mime <> 'image/jpeg') THEN
    RAISE EXCEPTION 'Proof filename extension does not match its image type';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.proof_path)::bigint);

  IF (
    TG_TABLE_NAME = 'expenses'
    AND EXISTS (
      SELECT 1 FROM public.expenses AS expense
      WHERE expense.proof_path = NEW.proof_path
        AND (TG_OP = 'INSERT' OR expense.id IS DISTINCT FROM NEW.id)
    )
  ) OR (
    TG_TABLE_NAME = 'transfers'
    AND EXISTS (
      SELECT 1 FROM public.transfers AS transfer
      WHERE transfer.proof_path = NEW.proof_path
        AND (TG_OP = 'INSERT' OR transfer.id IS DISTINCT FROM NEW.id)
    )
  ) OR (
    EXISTS (
      SELECT 1 FROM public.expenses AS expense WHERE expense.proof_path = NEW.proof_path
    )
    AND TG_TABLE_NAME <> 'expenses'
  ) OR (
    EXISTS (
      SELECT 1 FROM public.transfers AS transfer WHERE transfer.proof_path = NEW.proof_path
    )
    AND TG_TABLE_NAME <> 'transfers'
  ) THEN
    RAISE EXCEPTION 'A proof file can only be linked to one transaction';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_private_transaction_proof() FROM PUBLIC, anon, authenticated;

COMMIT;

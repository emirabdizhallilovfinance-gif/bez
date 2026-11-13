BEGIN;

DO $$
DECLARE
  policy_cmd text;
  policy_using text;
  policy_check text;
BEGIN
  IF to_regclass('public.transfers') IS NULL
     OR to_regclass('public.expenses') IS NULL
     OR to_regclass('public.project_members') IS NULL
     OR to_regclass('storage.objects') IS NULL
     OR to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'Required transaction or Supabase Storage tables are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'proofs'
  ) THEN
    RAISE EXCEPTION 'The existing proofs bucket does not exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public', 'transfers'),
      ('public', 'expenses'),
      ('public', 'project_members'),
      ('storage', 'objects')
    ) AS required(schema_name, table_name)
    JOIN pg_class AS relation
      ON relation.oid = to_regclass(required.schema_name || '.' || required.table_name)
    WHERE NOT relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Row-level security must be enabled on transactions, project_members, and Storage objects';
  END IF;

  IF EXISTS (
    SELECT required.table_name
    FROM (VALUES
      ('transfers', 'project_id'),
      ('transfers', 'worker_id'),
      ('transfers', 'amount'),
      ('transfers', 'created_by'),
      ('transfers', 'id'),
      ('expenses', 'project_id'),
      ('expenses', 'worker_id'),
      ('expenses', 'amount'),
      ('expenses', 'reason'),
      ('expenses', 'proof_path'),
      ('expenses', 'status'),
      ('expenses', 'admin_comment'),
      ('expenses', 'id'),
      ('project_members', 'project_id'),
      ('project_members', 'user_id')
    ) AS required(table_name, column_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_attribute AS attribute
      WHERE attribute.attrelid = to_regclass('public.' || required.table_name)
        AND attribute.attname = required.column_name
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    )
  ) THEN
    RAISE EXCEPTION 'A required transaction or membership column is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.transfers'::regclass
      AND attribute.attname = 'proof_path'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.atttypid <> 'text'::regtype
  ) THEN
    RAISE EXCEPTION 'public.transfers.proof_path exists but is not text';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'transfers'
      AND cmd IN ('ALL', 'SELECT', 'INSERT')
      AND policyname NOT IN (
        'transfers: admin read',
        'transfers: admin send',
        'transfers: worker reads own'
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected transfers read/insert policy found; inspect it before applying this migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'expenses'
      AND cmd IN ('ALL', 'SELECT', 'INSERT')
      AND policyname NOT IN (
        'expenses: admin read',
        'expenses: worker reads own',
        'expenses: worker adds own',
        'expenses: admin creates deductions'
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected expenses read/insert policy found; inspect it before applying this migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd IN ('ALL', 'SELECT', 'INSERT')
      AND policyname NOT IN (
        'proofs: read own or admin',
        'proofs: worker uploads into own folder',
        'proofs: admin uploads assigned proof'
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected Storage read/insert policy found; inspect it before applying this migration';
  END IF;

  SELECT cmd, qual, with_check
  INTO policy_cmd, policy_using, policy_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'transfers'
    AND policyname = 'transfers: admin read';
  IF NOT FOUND OR policy_cmd <> 'SELECT'
     OR regexp_replace(lower(coalesce(policy_using, '')), '[[:space:]()]', '', 'g') <> 'is_admin' THEN
    RAISE EXCEPTION 'Expected transfers admin-read policy is missing or differs from the verified policy';
  END IF;

  SELECT cmd, qual, with_check
  INTO policy_cmd, policy_using, policy_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'transfers'
    AND policyname = 'transfers: admin send';
  IF NOT FOUND OR policy_cmd <> 'INSERT'
     OR regexp_replace(lower(coalesce(policy_check, '')), '[[:space:]()]', '', 'g')
        <> 'is_adminandcreated_by=auth.uid' THEN
    RAISE EXCEPTION 'Expected transfers admin-insert policy is missing or differs from the verified policy';
  END IF;

  SELECT cmd, qual, with_check
  INTO policy_cmd, policy_using, policy_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'transfers'
    AND policyname = 'transfers: worker reads own';
  IF NOT FOUND OR policy_cmd <> 'SELECT'
     OR regexp_replace(lower(coalesce(policy_using, '')), '[[:space:]()]', '', 'g')
        <> 'worker_id=auth.uid' THEN
    RAISE EXCEPTION 'Expected own-transfer worker-read policy is missing or differs from the verified policy';
  END IF;

  SELECT cmd, qual, with_check
  INTO policy_cmd, policy_using, policy_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'expenses'
    AND policyname = 'expenses: worker adds own';
  IF NOT FOUND OR policy_cmd <> 'INSERT'
     OR lower(coalesce(policy_check, '')) NOT LIKE '%worker_id%'
     OR lower(coalesce(policy_check, '')) NOT LIKE '%auth.uid%'
     OR lower(coalesce(policy_check, '')) NOT LIKE '%status%'
     OR lower(coalesce(policy_check, '')) NOT LIKE '%pending%'
     OR lower(coalesce(policy_check, '')) NOT LIKE '%admin_comment%' THEN
    RAISE EXCEPTION 'Expected worker expense-insert policy is missing or differs from the verified policy';
  END IF;

  SELECT cmd, qual
  INTO policy_cmd, policy_using
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'expenses'
    AND policyname = 'expenses: admin read';
  IF NOT FOUND OR policy_cmd <> 'SELECT'
     OR regexp_replace(lower(coalesce(policy_using, '')), '[[:space:]()]', '', 'g') <> 'is_admin' THEN
    RAISE EXCEPTION 'Expected expense admin-read policy is missing or differs from the verified policy';
  END IF;

  SELECT cmd, qual
  INTO policy_cmd, policy_using
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'expenses'
    AND policyname = 'expenses: worker reads own';
  IF NOT FOUND OR policy_cmd <> 'SELECT'
     OR regexp_replace(lower(coalesce(policy_using, '')), '[[:space:]()]', '', 'g') <> 'worker_id=auth.uid' THEN
    RAISE EXCEPTION 'Expected own-expense worker-read policy is missing or differs from the verified policy';
  END IF;

  SELECT cmd, qual, with_check
  INTO policy_cmd, policy_using, policy_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'expenses'
    AND policyname = 'expenses: admin approves or rejects';
  IF NOT FOUND OR policy_cmd <> 'UPDATE'
     OR regexp_replace(lower(coalesce(policy_using, '')), '[[:space:]()]', '', 'g') <> 'is_admin'
     OR regexp_replace(lower(coalesce(policy_check, '')), '[[:space:]()]', '', 'g') <> 'is_admin' THEN
    RAISE EXCEPTION 'Expected expense admin-review policy is missing or differs from the verified policy';
  END IF;

  SELECT cmd, qual, with_check
  INTO policy_cmd, policy_using, policy_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'project_members'
    AND policyname = 'members: admin full access';
  IF NOT FOUND OR policy_cmd <> 'ALL'
     OR regexp_replace(lower(coalesce(policy_using, '')), '[[:space:]()]', '', 'g') <> 'is_admin'
     OR regexp_replace(lower(coalesce(policy_check, '')), '[[:space:]()]', '', 'g') <> 'is_admin' THEN
    RAISE EXCEPTION 'Expected admin project-membership policy is missing or differs from the verified policy';
  END IF;

  SELECT cmd, qual
  INTO policy_cmd, policy_using
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'project_members'
    AND policyname = 'members: read own rows';
  IF NOT FOUND OR policy_cmd <> 'SELECT'
     OR regexp_replace(lower(coalesce(policy_using, '')), '[[:space:]()]', '', 'g') <> 'user_id=auth.uid' THEN
    RAISE EXCEPTION 'Expected own project-membership read policy is missing or differs from the verified policy';
  END IF;

  SELECT cmd, qual
  INTO policy_cmd, policy_using
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'proofs: read own or admin';
  IF NOT FOUND OR policy_cmd <> 'SELECT'
     OR lower(coalesce(policy_using, '')) NOT LIKE '%is_admin()%'
     OR lower(coalesce(policy_using, '')) NOT LIKE '%auth.uid%' THEN
    RAISE EXCEPTION 'Expected private proof-read policy is missing or differs from the verified policy';
  END IF;

  SELECT cmd, with_check
  INTO policy_cmd, policy_check
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'proofs: worker uploads into own folder';
  IF NOT FOUND OR policy_cmd <> 'INSERT'
     OR lower(coalesce(policy_check, '')) NOT LIKE '%auth.uid%'
     OR lower(coalesce(policy_check, '')) NOT LIKE '%project_members%' THEN
    RAISE EXCEPTION 'Expected worker proof-upload policy is missing or differs from the verified policy';
  END IF;
END;
$$;

UPDATE storage.buckets
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg']::text[]
WHERE id = 'proofs';

ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS proof_path text;

ALTER POLICY "expenses: worker adds own"
ON public.expenses
WITH CHECK (
  worker_id = auth.uid()
  AND status = 'pending'
  AND admin_comment IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.project_members AS membership
    WHERE membership.project_id = expenses.project_id
      AND membership.user_id = auth.uid()
  )
);

ALTER POLICY "proofs: read own or admin"
ON storage.objects
USING (
  bucket_id = 'proofs'
  AND (
    is_admin()
    OR (
      (storage.foldername(name))[1] = auth.uid()::text
      AND (
        EXISTS (
          SELECT 1
          FROM public.expenses AS expense
          JOIN public.project_members AS membership
            ON membership.project_id = expense.project_id
          WHERE expense.proof_path = name
            AND expense.worker_id = auth.uid()
            AND membership.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.transfers AS transfer
          JOIN public.project_members AS membership
            ON membership.project_id = transfer.project_id
          WHERE transfer.proof_path = name
            AND transfer.worker_id = auth.uid()
            AND membership.user_id = auth.uid()
        )
      )
    )
  )
);

ALTER POLICY "proofs: worker uploads into own folder"
ON storage.objects
WITH CHECK (
  bucket_id = 'proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.project_members AS membership
    WHERE membership.user_id = auth.uid()
      AND membership.project_id::text = (storage.foldername(name))[2]
  )
);

DO $$
DECLARE
  existing_check text;
  existing_cmd text;
BEGIN
  SELECT cmd, with_check
  INTO existing_cmd, existing_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'expenses'
    AND policyname = 'expenses: admin creates deductions';

  IF FOUND THEN
    IF existing_cmd <> 'INSERT'
       OR lower(coalesce(existing_check, '')) NOT LIKE '%is_admin()%'
       OR lower(coalesce(existing_check, '')) NOT LIKE '%approved%'
       OR lower(coalesce(existing_check, '')) NOT LIKE '%worker_id%'
       OR lower(coalesce(existing_check, '')) NOT LIKE '%project_id%'
       OR lower(coalesce(existing_check, '')) NOT LIKE '%project_members%'
       OR lower(coalesce(existing_check, '')) LIKE '% or %' THEN
      RAISE EXCEPTION 'Existing admin-deduction policy differs from the expected restricted policy';
    END IF;
  ELSE
    CREATE POLICY "expenses: admin creates deductions"
    ON public.expenses
    FOR INSERT
    TO authenticated
    WITH CHECK (
      is_admin()
      AND status = 'approved'
      AND EXISTS (
        SELECT 1
        FROM public.project_members AS membership
        WHERE membership.project_id = expenses.project_id
          AND membership.user_id = expenses.worker_id
      )
    );
  END IF;
END;
$$;

DO $$
DECLARE
  existing_check text;
  existing_cmd text;
BEGIN
  SELECT cmd, with_check
  INTO existing_cmd, existing_check
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'proofs: admin uploads assigned proof';

  IF FOUND THEN
    IF existing_cmd <> 'INSERT'
       OR lower(coalesce(existing_check, '')) NOT LIKE '%is_admin()%'
       OR lower(coalesce(existing_check, '')) NOT LIKE '%project_members%'
       OR lower(coalesce(existing_check, '')) NOT LIKE '%bucket_id%'
       OR lower(coalesce(existing_check, '')) NOT LIKE '%proofs%'
       OR lower(coalesce(existing_check, '')) LIKE '% or %' THEN
      RAISE EXCEPTION 'Existing admin proof-upload policy differs from the expected restricted policy';
    END IF;
  ELSE
    CREATE POLICY "proofs: admin uploads assigned proof"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'proofs'
      AND is_admin()
      AND EXISTS (
        SELECT 1
        FROM public.project_members AS membership
        WHERE membership.user_id::text = (storage.foldername(name))[1]
          AND membership.project_id::text = (storage.foldername(name))[2]
      )
    );
  END IF;
END;
$$;

DO $$
DECLARE
  existing_using text;
  existing_cmd text;
BEGIN
  SELECT cmd, qual
  INTO existing_cmd, existing_using
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'proofs: remove unlinked assigned upload';

  IF FOUND THEN
    IF existing_cmd <> 'DELETE'
       OR lower(coalesce(existing_using, '')) NOT LIKE '%project_members%'
       OR lower(coalesce(existing_using, '')) NOT LIKE '%expenses%'
       OR lower(coalesce(existing_using, '')) NOT LIKE '%transfers%'
       OR lower(coalesce(existing_using, '')) NOT LIKE '%bucket_id%'
       OR lower(coalesce(existing_using, '')) NOT LIKE '%not%'
       OR lower(coalesce(existing_using, '')) NOT LIKE '%is_admin()%'
       OR lower(coalesce(existing_using, '')) NOT LIKE '%auth.uid%' THEN
      RAISE EXCEPTION 'Existing proof cleanup policy differs from the expected restricted policy';
    END IF;
  ELSE
    CREATE POLICY "proofs: remove unlinked assigned upload"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'proofs'
      AND EXISTS (
        SELECT 1
        FROM public.project_members AS membership
        WHERE membership.user_id::text = (storage.foldername(name))[1]
          AND membership.project_id::text = (storage.foldername(name))[2]
          AND (is_admin() OR membership.user_id = auth.uid())
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.expenses AS expense WHERE expense.proof_path = name
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.transfers AS transfer WHERE transfer.proof_path = name
      )
    );
  END IF;
END;
$$;

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
  IF NEW.proof_path IS NULL OR btrim(NEW.proof_path) = '' THEN
    RAISE EXCEPTION 'A proof attachment is required';
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

DROP TRIGGER IF EXISTS expenses_require_private_proof ON public.expenses;
DROP TRIGGER IF EXISTS expenses_require_private_proof_insert ON public.expenses;
CREATE TRIGGER expenses_require_private_proof_insert
BEFORE INSERT ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.require_private_transaction_proof();

DROP TRIGGER IF EXISTS expenses_require_private_proof_update ON public.expenses;
CREATE TRIGGER expenses_require_private_proof_update
BEFORE UPDATE OF proof_path, project_id, worker_id ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.require_private_transaction_proof();

DROP TRIGGER IF EXISTS transfers_require_private_proof ON public.transfers;
DROP TRIGGER IF EXISTS transfers_require_private_proof_insert ON public.transfers;
CREATE TRIGGER transfers_require_private_proof_insert
BEFORE INSERT ON public.transfers
FOR EACH ROW
EXECUTE FUNCTION public.require_private_transaction_proof();

DROP TRIGGER IF EXISTS transfers_require_private_proof_update ON public.transfers;
CREATE TRIGGER transfers_require_private_proof_update
BEFORE UPDATE OF proof_path, project_id, worker_id ON public.transfers
FOR EACH ROW
EXECUTE FUNCTION public.require_private_transaction_proof();

COMMIT;

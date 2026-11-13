DROP POLICY IF EXISTS "proofs: worker uploads into own folder" ON storage.objects;

CREATE POLICY "proofs: worker uploads into own folder"
ON storage.objects
FOR INSERT
TO authenticated
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

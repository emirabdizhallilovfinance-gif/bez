ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS proof_path text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS proof_path text;
NOTIFY pgrst, 'reload schema';

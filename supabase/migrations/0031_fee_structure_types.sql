-- 0031_fee_structure_types.sql
ALTER TABLE public.fee_structures
  ADD COLUMN IF NOT EXISTS structure_type TEXT NOT NULL DEFAULT 'CLASS';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fee_structures_structure_type_chk'
  ) THEN
    ALTER TABLE public.fee_structures
      ADD CONSTRAINT fee_structures_structure_type_chk CHECK (structure_type IN ('CLASS','VEHICLE'));
  END IF;
END $$;

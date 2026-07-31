-- Add mandatory flag to forms table
ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN NOT NULL DEFAULT false;

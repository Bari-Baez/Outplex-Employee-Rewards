-- Google OAuth token storage for connected accounts
CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  google_email  TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own tokens
CREATE POLICY "users_own_google_token" ON public.google_oauth_tokens
  FOR ALL USING (auth.uid() = user_id);

-- Service role bypasses RLS (used by API routes with service client)

CREATE OR REPLACE FUNCTION update_google_token_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_google_token_updated_at
  BEFORE UPDATE ON public.google_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION update_google_token_updated_at();

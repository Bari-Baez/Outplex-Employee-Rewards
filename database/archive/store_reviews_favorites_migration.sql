-- Store reviews table (1-5 star ratings)
CREATE TABLE IF NOT EXISTS public.store_reviews (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id    UUID NOT NULL REFERENCES public.store_items(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (item_id, user_id)
);
ALTER TABLE public.store_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_own" ON public.store_reviews FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "reviews_select_all" ON public.store_reviews FOR SELECT USING (true);

-- Store favorites table
CREATE TABLE IF NOT EXISTS public.store_favorites (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id    UUID NOT NULL REFERENCES public.store_items(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (item_id, user_id)
);
ALTER TABLE public.store_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "favorites_own" ON public.store_favorites FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- Employee Store — Phase 2 migration
--
-- Employees run personal micro-stores priced in Dominican pesos.
-- Outplex acts ONLY as an intermediary — no payment processing.
-- Buyers place orders, then contact the seller directly (Slack
-- DM, WhatsApp opt-in, or copy email) to arrange delivery/pickup.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================== ENUMS ====================================
DO $$ BEGIN
  CREATE TYPE employee_store_request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE employee_store_status AS ENUM ('active', 'paused', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE employee_store_order_status AS ENUM ('pending', 'ready_for_pickup', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE employee_store_contact_method AS ENUM ('slack', 'whatsapp', 'email', 'none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE employee_store_pickup_mode AS ENUM ('immediate', 'scheduled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ================== USER CONTACT PREFERENCES =================
-- WhatsApp is OUT-OF-COMPANY contact. Both parties must opt-in
-- explicitly before the number is revealed in the UI.
CREATE TABLE IF NOT EXISTS public.user_contact_preferences (
  user_id              UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  whatsapp_number      TEXT,
  whatsapp_opt_in      BOOLEAN NOT NULL DEFAULT false,
  whatsapp_opt_in_at   TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.user_contact_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ucp_select_all" ON public.user_contact_preferences FOR SELECT USING (true);
CREATE POLICY "ucp_own_insert" ON public.user_contact_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ucp_own_update" ON public.user_contact_preferences FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ucp_own_delete" ON public.user_contact_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- ================== EMPLOYEE STORE REQUESTS ==================
-- A form submission asking moderators to open a personal store.
CREATE TABLE IF NOT EXISTS public.employee_store_requests (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  store_name        TEXT NOT NULL,
  description       TEXT NOT NULL,
  category          TEXT,
  policy_accepted   BOOLEAN NOT NULL DEFAULT false,
  status            employee_store_request_status NOT NULL DEFAULT 'pending',
  reviewed_by       UUID REFERENCES public.users(id),
  reviewed_at       TIMESTAMPTZ,
  review_notes      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_store_requests_user ON public.employee_store_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_store_requests_status ON public.employee_store_requests(status);

ALTER TABLE public.employee_store_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "esr_own_select" ON public.employee_store_requests FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "esr_own_insert" ON public.employee_store_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "esr_mod_all" ON public.employee_store_requests FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')));

-- ================== EMPLOYEE STORES ==========================
-- One active store per approved user. `slug` is the public section
-- handle inside the employees-store listing.
CREATE TABLE IF NOT EXISTS public.employee_stores (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id          UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  request_id        UUID REFERENCES public.employee_store_requests(id) ON DELETE SET NULL,
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  description       TEXT,
  category          TEXT,
  banner_image      TEXT,
  logo_image        TEXT,
  accent_color      TEXT,
  status            employee_store_status NOT NULL DEFAULT 'active',
  approved_by       UUID REFERENCES public.users(id),
  approved_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_stores_status ON public.employee_stores(status);

ALTER TABLE public.employee_stores ENABLE ROW LEVEL SECURITY;
-- Anyone authenticated can browse active stores; owners and mods always see theirs
CREATE POLICY "estores_select" ON public.employee_stores FOR SELECT
  USING (
    status = 'active'
    OR auth.uid() = owner_id
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin'))
  );
CREATE POLICY "estores_owner_update" ON public.employee_stores FOR UPDATE
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "estores_mod_all" ON public.employee_stores FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')));

-- ================== EMPLOYEE STORE PRODUCTS ==================
-- `price_dop` is stored as whole pesos (INTEGER). No fractional cents.
CREATE TABLE IF NOT EXISTS public.employee_store_products (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id          UUID NOT NULL REFERENCES public.employee_stores(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  price_dop         INTEGER NOT NULL CHECK (price_dop >= 0),
  image_url         TEXT,
  category          TEXT,
  stock             INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esp_store ON public.employee_store_products(store_id);
CREATE INDEX IF NOT EXISTS idx_esp_active ON public.employee_store_products(is_active);

ALTER TABLE public.employee_store_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "esp_select" ON public.employee_store_products FOR SELECT
  USING (
    is_active
    OR EXISTS (SELECT 1 FROM public.employee_stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin'))
  );
CREATE POLICY "esp_owner_insert" ON public.employee_store_products FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.employee_stores s WHERE s.id = store_id AND s.owner_id = auth.uid()));
CREATE POLICY "esp_owner_update" ON public.employee_store_products FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.employee_stores s WHERE s.id = store_id AND s.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.employee_stores s WHERE s.id = store_id AND s.owner_id = auth.uid()));
CREATE POLICY "esp_owner_delete" ON public.employee_store_products FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.employee_stores s WHERE s.id = store_id AND s.owner_id = auth.uid()));
CREATE POLICY "esp_mod_all" ON public.employee_store_products FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')));

-- ================== EMPLOYEE STORE ORDERS ====================
-- Status maps:
--   seller view: 'pending' -> "Pendiente", 'ready_for_pickup' -> "Listo para recoger"
--   buyer view:  'pending' -> "Pendiente", 'ready_for_pickup' -> "Aprobado"
CREATE TABLE IF NOT EXISTS public.employee_store_orders (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id              UUID NOT NULL REFERENCES public.employee_stores(id) ON DELETE CASCADE,
  seller_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  buyer_id              UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  total_dop             INTEGER NOT NULL CHECK (total_dop >= 0),
  status                employee_store_order_status NOT NULL DEFAULT 'pending',
  contact_method        employee_store_contact_method NOT NULL DEFAULT 'none',
  pickup_mode           employee_store_pickup_mode,
  pickup_at             TIMESTAMPTZ,
  pickup_note           TEXT,
  buyer_notes           TEXT,
  seller_notes          TEXT,
  status_history        JSONB NOT NULL DEFAULT '[]',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_eso_store ON public.employee_store_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_eso_buyer ON public.employee_store_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_eso_seller ON public.employee_store_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_eso_status ON public.employee_store_orders(status);

ALTER TABLE public.employee_store_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eso_buyer_select" ON public.employee_store_orders FOR SELECT
  USING (auth.uid() = buyer_id);
CREATE POLICY "eso_seller_select" ON public.employee_store_orders FOR SELECT
  USING (auth.uid() = seller_id);
CREATE POLICY "eso_buyer_insert" ON public.employee_store_orders FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);
-- Seller progresses status and fills pickup info
CREATE POLICY "eso_seller_update" ON public.employee_store_orders FOR UPDATE
  USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "eso_mod_all" ON public.employee_store_orders FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')));

-- ================== EMPLOYEE STORE ORDER ITEMS ===============
-- Snapshot product info at purchase time so later edits to the
-- product don't rewrite history.
CREATE TABLE IF NOT EXISTS public.employee_store_order_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id          UUID NOT NULL REFERENCES public.employee_store_orders(id) ON DELETE CASCADE,
  product_id        UUID REFERENCES public.employee_store_products(id) ON DELETE SET NULL,
  name_snapshot     TEXT NOT NULL,
  image_snapshot    TEXT,
  unit_price_dop    INTEGER NOT NULL CHECK (unit_price_dop >= 0),
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esoi_order ON public.employee_store_order_items(order_id);

ALTER TABLE public.employee_store_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "esoi_parties_select" ON public.employee_store_order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_store_orders o
      WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin'))
  );
CREATE POLICY "esoi_buyer_insert" ON public.employee_store_order_items FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employee_store_orders o WHERE o.id = order_id AND o.buyer_id = auth.uid())
  );
CREATE POLICY "esoi_mod_all" ON public.employee_store_order_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('moderator', 'admin')));

-- ================== updated_at triggers ======================
CREATE OR REPLACE FUNCTION public.employee_store_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_estores_updated_at ON public.employee_stores;
CREATE TRIGGER trg_estores_updated_at BEFORE UPDATE ON public.employee_stores
  FOR EACH ROW EXECUTE FUNCTION public.employee_store_set_updated_at();

DROP TRIGGER IF EXISTS trg_esp_updated_at ON public.employee_store_products;
CREATE TRIGGER trg_esp_updated_at BEFORE UPDATE ON public.employee_store_products
  FOR EACH ROW EXECUTE FUNCTION public.employee_store_set_updated_at();

DROP TRIGGER IF EXISTS trg_eso_updated_at ON public.employee_store_orders;
CREATE TRIGGER trg_eso_updated_at BEFORE UPDATE ON public.employee_store_orders
  FOR EACH ROW EXECUTE FUNCTION public.employee_store_set_updated_at();

DROP TRIGGER IF EXISTS trg_ucp_updated_at ON public.user_contact_preferences;
CREATE TRIGGER trg_ucp_updated_at BEFORE UPDATE ON public.user_contact_preferences
  FOR EACH ROW EXECUTE FUNCTION public.employee_store_set_updated_at();

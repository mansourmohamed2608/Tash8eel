--
-- PostgreSQL database dump
--

\restrict rcTypYKGE5qtBdneEtWTQ95ECxSryPJbN42t8sUN4sYUEeehvy0gajcCNgikUoo

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg12+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: customer_tags; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.customer_tags (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    customer_id character varying(100) NOT NULL,
    tag character varying(50) NOT NULL,
    source character varying(20) DEFAULT 'manual'::character varying NOT NULL,
    rule_id uuid,
    created_by character varying(100),
    expires_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.customer_tags OWNER TO neondb_owner;

--
-- Name: TABLE customer_tags; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.customer_tags IS 'Manual and auto-rule based customer tags (VIP, WHOLESALE, etc.)';


--
-- Name: merchant_addons; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_addons (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    addon_type character varying(50) NOT NULL,
    tier_id character varying(50) NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    price_cents integer NOT NULL,
    currency character varying(10) DEFAULT 'EGP'::character varying NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    payment_reference character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merchant_addons_addon_type_check CHECK (((addon_type)::text = ANY ((ARRAY['AI_CALLS'::character varying, 'MESSAGES'::character varying])::text[]))),
    CONSTRAINT merchant_addons_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'expired'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.merchant_addons OWNER TO neondb_owner;

--
-- Name: TABLE merchant_addons; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.merchant_addons IS 'Add-on purchases: extra AI calls or WhatsApp messages beyond base plan';


--
-- Name: COLUMN merchant_addons.addon_type; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.merchant_addons.addon_type IS 'AI_CALLS = extra AI calls/day, MESSAGES = extra WhatsApp messages/month';


--
-- Name: COLUMN merchant_addons.tier_id; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.merchant_addons.tier_id IS 'Tier from entitlements: BASIC, STANDARD, PROFESSIONAL, UNLIMITED';


--
-- Name: notification_preferences_legacy; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.notification_preferences_legacy (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    staff_id uuid,
    notification_type character varying(50) NOT NULL,
    channel character varying(20) NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notification_preferences_legacy OWNER TO neondb_owner;

--
-- Name: TABLE notification_preferences_legacy; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.notification_preferences_legacy IS 'Per-user notification preferences and settings';


--
-- Data for Name: customer_tags; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.customer_tags (id, merchant_id, customer_id, tag, source, rule_id, created_by, expires_at, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: merchant_addons; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.merchant_addons (id, merchant_id, addon_type, tier_id, quantity, price_cents, currency, status, starts_at, expires_at, payment_reference, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notification_preferences_legacy; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.notification_preferences_legacy (id, merchant_id, staff_id, notification_type, channel, enabled, config, created_at, updated_at) FROM stdin;
\.


--
-- Name: customer_tags customer_tags_merchant_id_customer_id_tag_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT customer_tags_merchant_id_customer_id_tag_key UNIQUE (merchant_id, customer_id, tag);


--
-- Name: customer_tags customer_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT customer_tags_pkey PRIMARY KEY (id);


--
-- Name: merchant_addons merchant_addons_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_addons
    ADD CONSTRAINT merchant_addons_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences_legacy notification_preferences_merchant_id_staff_id_notification__key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notification_preferences_legacy
    ADD CONSTRAINT notification_preferences_merchant_id_staff_id_notification__key UNIQUE (merchant_id, staff_id, notification_type, channel);


--
-- Name: notification_preferences_legacy notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notification_preferences_legacy
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: idx_customer_tags_lookup; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_customer_tags_lookup ON public.customer_tags USING btree (merchant_id, customer_id);


--
-- Name: idx_customer_tags_tag; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_customer_tags_tag ON public.customer_tags USING btree (merchant_id, tag);


--
-- Name: idx_merchant_addons_active; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_merchant_addons_active ON public.merchant_addons USING btree (merchant_id, addon_type) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_merchant_addons_expires; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_merchant_addons_expires ON public.merchant_addons USING btree (expires_at) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_merchant_addons_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_merchant_addons_merchant ON public.merchant_addons USING btree (merchant_id);


--
-- Name: idx_notif_prefs_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_notif_prefs_merchant ON public.notification_preferences_legacy USING btree (merchant_id);


--
-- Name: idx_notif_prefs_staff; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_notif_prefs_staff ON public.notification_preferences_legacy USING btree (staff_id);


--
-- Name: idx_notification_prefs_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_notification_prefs_merchant ON public.notification_preferences_legacy USING btree (merchant_id);


--
-- Name: idx_notification_prefs_staff; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_notification_prefs_staff ON public.notification_preferences_legacy USING btree (staff_id) WHERE (staff_id IS NOT NULL);


--
-- Name: idx_prefs_per_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_prefs_per_user ON public.notification_preferences_legacy USING btree (merchant_id, COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: merchant_addons tr_merchant_addons_updated; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER tr_merchant_addons_updated BEFORE UPDATE ON public.merchant_addons FOR EACH ROW EXECUTE FUNCTION public.update_wa_log_updated_at();


--
-- Name: notification_preferences_legacy update_notification_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences_legacy FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customer_tags customer_tags_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT customer_tags_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: customer_tags fk_customer_tags_rule_id; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT fk_customer_tags_rule_id FOREIGN KEY (rule_id) REFERENCES public.vip_rules(id) ON DELETE SET NULL;


--
-- Name: merchant_addons merchant_addons_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_addons
    ADD CONSTRAINT merchant_addons_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: notification_preferences_legacy notification_preferences_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notification_preferences_legacy
    ADD CONSTRAINT notification_preferences_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: notification_preferences_legacy notification_preferences_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notification_preferences_legacy
    ADD CONSTRAINT notification_preferences_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.merchant_staff(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict rcTypYKGE5qtBdneEtWTQ95ECxSryPJbN42t8sUN4sYUEeehvy0gajcCNgikUoo


--
-- PostgreSQL database dump
--

\restrict gedXUpmb7bENBCahh5rQuJjJvmUBKX7VXhxYhuxp5jcJSOQec3PgDZPMVYb0NoE

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

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: agent_type; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.agent_type AS ENUM (
    'ops',
    'inventory',
    'finance',
    'marketing',
    'content',
    'support'
);


ALTER TYPE public.agent_type OWNER TO neondb_owner;

--
-- Name: agent_type_v2; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.agent_type_v2 AS ENUM (
    'OPS_AGENT',
    'INVENTORY_AGENT',
    'FINANCE_AGENT',
    'MARKETING_AGENT',
    'CONTENT_AGENT',
    'SUPPORT_AGENT'
);


ALTER TYPE public.agent_type_v2 OWNER TO neondb_owner;

--
-- Name: audit_action; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.audit_action AS ENUM (
    'CREATE',
    'UPDATE',
    'DELETE',
    'LOGIN',
    'LOGOUT',
    'VIEW',
    'EXPORT',
    'IMPORT',
    'API_CALL',
    'SETTINGS_CHANGE',
    'TAKEOVER'
);


ALTER TYPE public.audit_action OWNER TO neondb_owner;

--
-- Name: audit_resource; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.audit_resource AS ENUM (
    'ORDER',
    'CONVERSATION',
    'CUSTOMER',
    'PRODUCT',
    'VARIANT',
    'MERCHANT',
    'STAFF',
    'WEBHOOK',
    'SETTINGS',
    'REPORT',
    'API_KEY'
);


ALTER TYPE public.audit_resource OWNER TO neondb_owner;

--
-- Name: bulk_operation_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.bulk_operation_status AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
);


ALTER TYPE public.bulk_operation_status OWNER TO neondb_owner;

--
-- Name: bulk_operation_type; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.bulk_operation_type AS ENUM (
    'IMPORT',
    'EXPORT',
    'UPDATE',
    'DELETE'
);


ALTER TYPE public.bulk_operation_type OWNER TO neondb_owner;

--
-- Name: conversation_state; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.conversation_state AS ENUM (
    'GREETING',
    'COLLECTING_ITEMS',
    'COLLECTING_VARIANTS',
    'COLLECTING_CUSTOMER_INFO',
    'COLLECTING_ADDRESS',
    'NEGOTIATING',
    'CONFIRMING_ORDER',
    'ORDER_PLACED',
    'TRACKING',
    'FOLLOWUP',
    'CLOSED',
    'HUMAN_TAKEOVER'
);


ALTER TYPE public.conversation_state OWNER TO neondb_owner;

--
-- Name: data_request_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.data_request_status AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED'
);


ALTER TYPE public.data_request_status OWNER TO neondb_owner;

--
-- Name: data_request_type; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.data_request_type AS ENUM (
    'EXPORT',
    'DELETE'
);


ALTER TYPE public.data_request_type OWNER TO neondb_owner;

--
-- Name: dlq_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.dlq_status AS ENUM (
    'PENDING',
    'RETRYING',
    'RESOLVED',
    'EXHAUSTED'
);


ALTER TYPE public.dlq_status OWNER TO neondb_owner;

--
-- Name: event_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.event_status AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED'
);


ALTER TYPE public.event_status OWNER TO neondb_owner;

--
-- Name: feature_request_category; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.feature_request_category AS ENUM (
    'AGENT',
    'FEATURE',
    'INTEGRATION',
    'UX',
    'OTHER',
    'QUOTE'
);


ALTER TYPE public.feature_request_category OWNER TO neondb_owner;

--
-- Name: feature_request_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.feature_request_status AS ENUM (
    'NEW',
    'UNDER_REVIEW',
    'PLANNED',
    'IN_PROGRESS',
    'DONE',
    'REJECTED'
);


ALTER TYPE public.feature_request_status OWNER TO neondb_owner;

--
-- Name: followup_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.followup_status AS ENUM (
    'PENDING',
    'SENT',
    'CANCELLED',
    'FAILED'
);


ALTER TYPE public.followup_status OWNER TO neondb_owner;

--
-- Name: followup_type; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.followup_type AS ENUM (
    'order_confirmation',
    'delivery_reminder',
    'feedback_request',
    'abandoned_cart',
    'reorder_suggestion',
    'custom'
);


ALTER TYPE public.followup_type OWNER TO neondb_owner;

--
-- Name: goal_period_type; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.goal_period_type AS ENUM (
    'WEEKLY',
    'MONTHLY',
    'QUARTERLY',
    'YEARLY'
);


ALTER TYPE public.goal_period_type OWNER TO neondb_owner;

--
-- Name: integration_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.integration_status AS ENUM (
    'ACTIVE',
    'DISABLED'
);


ALTER TYPE public.integration_status OWNER TO neondb_owner;

--
-- Name: invoice_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.invoice_status AS ENUM (
    'OPEN',
    'PAID',
    'VOID',
    'UNCOLLECTIBLE'
);


ALTER TYPE public.invoice_status OWNER TO neondb_owner;

--
-- Name: merchant_category; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.merchant_category AS ENUM (
    'CLOTHES',
    'FOOD',
    'SUPERMARKET',
    'GENERIC'
);


ALTER TYPE public.merchant_category OWNER TO neondb_owner;

--
-- Name: message_delivery_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.message_delivery_status AS ENUM (
    'QUEUED',
    'PENDING',
    'SENT',
    'DELIVERED',
    'READ',
    'FAILED'
);


ALTER TYPE public.message_delivery_status OWNER TO neondb_owner;

--
-- Name: message_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.message_status AS ENUM (
    'QUEUED',
    'SENT',
    'DELIVERED',
    'FAILED',
    'READ'
);


ALTER TYPE public.message_status OWNER TO neondb_owner;

--
-- Name: notification_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.notification_status AS ENUM (
    'PENDING',
    'SENT',
    'FAILED',
    'CANCELLED'
);


ALTER TYPE public.notification_status OWNER TO neondb_owner;

--
-- Name: order_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.order_status AS ENUM (
    'DRAFT',
    'CONFIRMED',
    'BOOKED',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'OUT_FOR_DELIVERY',
    'COMPLETED'
);


ALTER TYPE public.order_status OWNER TO neondb_owner;

--
-- Name: payment_link_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.payment_link_status AS ENUM (
    'PENDING',
    'VIEWED',
    'PAID',
    'EXPIRED',
    'CANCELLED'
);


ALTER TYPE public.payment_link_status OWNER TO neondb_owner;

--
-- Name: payment_method_type; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.payment_method_type AS ENUM (
    'COD',
    'INSTAPAY',
    'BANK_TRANSFER',
    'VODAFONE_CASH',
    'FAWRY',
    'CARD',
    'OTHER'
);


ALTER TYPE public.payment_method_type OWNER TO neondb_owner;

--
-- Name: payment_proof_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.payment_proof_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


ALTER TYPE public.payment_proof_status OWNER TO neondb_owner;

--
-- Name: quote_request_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.quote_request_status AS ENUM (
    'NEW',
    'UNDER_REVIEW',
    'QUOTED',
    'ACCEPTED',
    'REJECTED',
    'ACTIVE',
    'DONE'
);


ALTER TYPE public.quote_request_status OWNER TO neondb_owner;

--
-- Name: shift_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.shift_status AS ENUM (
    'OPEN',
    'CLOSED',
    'CANCELLED'
);


ALTER TYPE public.shift_status OWNER TO neondb_owner;

--
-- Name: staff_role; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.staff_role AS ENUM (
    'OWNER',
    'ADMIN',
    'MANAGER',
    'AGENT',
    'VIEWER'
);


ALTER TYPE public.staff_role OWNER TO neondb_owner;

--
-- Name: staff_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.staff_status AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'SUSPENDED',
    'PENDING_INVITE'
);


ALTER TYPE public.staff_status OWNER TO neondb_owner;

--
-- Name: subscription_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.subscription_status AS ENUM (
    'PENDING',
    'ACTIVE',
    'PAST_DUE',
    'CANCELED',
    'EXPIRED'
);


ALTER TYPE public.subscription_status OWNER TO neondb_owner;

--
-- Name: task_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.task_status AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'ASSIGNED',
    'RUNNING',
    'SKIPPED'
);


ALTER TYPE public.task_status OWNER TO neondb_owner;

--
-- Name: webhook_delivery_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.webhook_delivery_status AS ENUM (
    'PENDING',
    'SUCCESS',
    'FAILED',
    'RETRYING'
);


ALTER TYPE public.webhook_delivery_status OWNER TO neondb_owner;

--
-- Name: webhook_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.webhook_status AS ENUM (
    'ACTIVE',
    'PAUSED',
    'DISABLED',
    'FAILING'
);


ALTER TYPE public.webhook_status OWNER TO neondb_owner;

--
-- Name: add_customer_points(character varying, uuid, integer, character varying, character varying, character varying, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.add_customer_points(p_merchant_id character varying, p_customer_id uuid, p_points integer, p_type character varying, p_source character varying, p_reference_id character varying DEFAULT NULL::character varying, p_description text DEFAULT NULL::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_current_points INTEGER;
  v_lifetime_points INTEGER;
  v_new_tier_id UUID;
BEGIN
  -- Get or create customer points record
  INSERT INTO customer_points (merchant_id, customer_id, current_points, lifetime_points)
  VALUES (p_merchant_id, p_customer_id, 0, 0)
  ON CONFLICT (merchant_id, customer_id) DO NOTHING;
  
  -- Update points
  UPDATE customer_points
  SET 
    current_points = current_points + p_points,
    lifetime_points = CASE WHEN p_type = 'EARN' THEN lifetime_points + p_points ELSE lifetime_points END,
    last_activity_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE merchant_id = p_merchant_id AND customer_id = p_customer_id
  RETURNING current_points, lifetime_points INTO v_current_points, v_lifetime_points;
  
  -- Calculate new tier
  v_new_tier_id := calculate_customer_tier(p_merchant_id, v_lifetime_points);
  
  -- Update tier if changed
  UPDATE customer_points
  SET tier_id = v_new_tier_id
  WHERE merchant_id = p_merchant_id AND customer_id = p_customer_id;
  
  -- Record transaction
  INSERT INTO points_transactions (
    merchant_id, customer_id, type, points, balance_after,
    source, reference_id, description, expires_at
  ) VALUES (
    p_merchant_id, p_customer_id, p_type, p_points, v_current_points,
    p_source, p_reference_id, p_description, p_expires_at
  );
  
  RETURN v_current_points;
END;
$$;


ALTER FUNCTION public.add_customer_points(p_merchant_id character varying, p_customer_id uuid, p_points integer, p_type character varying, p_source character varying, p_reference_id character varying, p_description text, p_expires_at timestamp with time zone) OWNER TO neondb_owner;

--
-- Name: apply_vip_rules(character varying, character varying); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.apply_vip_rules(p_merchant_id character varying, p_customer_id character varying) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_rule RECORD;
  v_customer_stats RECORD;
  v_applied_tag TEXT := NULL;
BEGIN
  -- Get customer stats
  SELECT 
    COUNT(*) as order_count,
    COALESCE(SUM(total), 0) as total_spent,
    COALESCE(AVG(total), 0) as avg_order_value,
    MIN(created_at) as first_order,
    MAX(created_at) as last_order
  INTO v_customer_stats
  FROM orders
  WHERE merchant_id = p_merchant_id 
    AND customer_id = p_customer_id
    AND status NOT IN ('CANCELLED', 'REJECTED');
  
  -- Check each active rule in priority order
  FOR v_rule IN 
    SELECT * FROM vip_rules 
    WHERE merchant_id = p_merchant_id AND is_active = true
    ORDER BY priority DESC
  LOOP
    -- Check conditions
    IF (v_rule.conditions->>'minOrders' IS NULL OR v_customer_stats.order_count >= (v_rule.conditions->>'minOrders')::INTEGER)
       AND (v_rule.conditions->>'minSpent' IS NULL OR v_customer_stats.total_spent >= (v_rule.conditions->>'minSpent')::NUMERIC)
       AND (v_rule.conditions->>'minAvgOrderValue' IS NULL OR v_customer_stats.avg_order_value >= (v_rule.conditions->>'minAvgOrderValue')::NUMERIC)
       AND (v_rule.conditions->>'withinDays' IS NULL OR v_customer_stats.last_order >= NOW() - ((v_rule.conditions->>'withinDays')::INTEGER || ' days')::INTERVAL)
    THEN
      -- Apply tag
      INSERT INTO customer_tags (merchant_id, customer_id, tag, source, rule_id)
      VALUES (p_merchant_id, p_customer_id, v_rule.tag_to_apply, 'auto_rule', v_rule.id)
      ON CONFLICT (merchant_id, customer_id, tag) DO NOTHING;
      
      v_applied_tag := v_rule.tag_to_apply;
      
      -- Update customer VIP status cache
      IF v_rule.tag_to_apply = 'VIP' THEN
        UPDATE customers 
        SET vip_status = 'VIP', vip_since = COALESCE(vip_since, NOW())
        WHERE merchant_id = p_merchant_id AND id = p_customer_id;
      END IF;
      
      EXIT; -- Apply highest priority rule only
    END IF;
  END LOOP;
  
  RETURN v_applied_tag;
END;
$$;


ALTER FUNCTION public.apply_vip_rules(p_merchant_id character varying, p_customer_id character varying) OWNER TO neondb_owner;

--
-- Name: calculate_customer_risk_score(character varying, character varying); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.calculate_customer_risk_score(p_merchant_id character varying, p_customer_id character varying) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_failed_deliveries INTEGER;
  v_refusals INTEGER;
  v_returns INTEGER;
  v_avg_address_confidence INTEGER;
  v_risk_score INTEGER;
BEGIN
  -- Count failed deliveries
  SELECT COUNT(*) INTO v_failed_deliveries
  FROM delivery_outcomes
  WHERE merchant_id = p_merchant_id 
    AND customer_id = p_customer_id 
    AND outcome IN ('failed_address', 'failed_no_answer');
    
  -- Count refusals
  SELECT COUNT(*) INTO v_refusals
  FROM delivery_outcomes
  WHERE merchant_id = p_merchant_id 
    AND customer_id = p_customer_id 
    AND outcome = 'refused';
    
  -- Count returns
  SELECT COUNT(*) INTO v_returns
  FROM delivery_outcomes
  WHERE merchant_id = p_merchant_id 
    AND customer_id = p_customer_id 
    AND outcome = 'returned';
    
  -- Get average address confidence from conversations
  SELECT COALESCE(AVG(address_confidence), 100)::INTEGER INTO v_avg_address_confidence
  FROM conversations
  WHERE merchant_id = p_merchant_id 
    AND customer_id = p_customer_id
    AND address_confidence IS NOT NULL;
  
  -- Calculate risk score (0-100)
  -- Base score from address confidence (inverted: low confidence = high risk)
  v_risk_score := GREATEST(0, 100 - v_avg_address_confidence);
  
  -- Add points for negative outcomes
  v_risk_score := v_risk_score + (v_failed_deliveries * 15);
  v_risk_score := v_risk_score + (v_refusals * 25);
  v_risk_score := v_risk_score + (v_returns * 10);
  
  -- Cap at 100
  v_risk_score := LEAST(100, v_risk_score);
  
  -- Upsert risk score
  INSERT INTO customer_risk_scores (merchant_id, customer_id, risk_score, risk_factors, last_calculated_at)
  VALUES (
    p_merchant_id, 
    p_customer_id, 
    v_risk_score,
    jsonb_build_object(
      'failedDeliveries', v_failed_deliveries,
      'refusals', v_refusals,
      'returns', v_returns,
      'avgAddressConfidence', v_avg_address_confidence
    ),
    NOW()
  )
  ON CONFLICT (merchant_id, customer_id) DO UPDATE SET
    risk_score = EXCLUDED.risk_score,
    risk_factors = EXCLUDED.risk_factors,
    last_calculated_at = NOW(),
    updated_at = NOW();
    
  RETURN v_risk_score;
END;
$$;


ALTER FUNCTION public.calculate_customer_risk_score(p_merchant_id character varying, p_customer_id character varying) OWNER TO neondb_owner;

--
-- Name: calculate_customer_tier(character varying, integer); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.calculate_customer_tier(p_merchant_id character varying, p_lifetime_points integer) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_tier_id UUID;
BEGIN
  SELECT id INTO v_tier_id
  FROM loyalty_tiers
  WHERE merchant_id = p_merchant_id
    AND min_points <= p_lifetime_points
  ORDER BY min_points DESC
  LIMIT 1;
  
  RETURN v_tier_id;
END;
$$;


ALTER FUNCTION public.calculate_customer_tier(p_merchant_id character varying, p_lifetime_points integer) OWNER TO neondb_owner;

--
-- Name: check_recovered_cart(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.check_recovered_cart() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- When an order is created, check if it came from a followup conversation
  IF NEW.conversation_id IS NOT NULL THEN
    UPDATE recovered_carts
    SET 
      is_recovered = true,
      order_id = NEW.id,
      order_created_at = NEW.created_at,
      order_value = NEW.total
    WHERE conversation_id = NEW.conversation_id
      AND is_recovered = false
      AND followup_sent_at > NOW() - INTERVAL '48 hours';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.check_recovered_cart() OWNER TO neondb_owner;

--
-- Name: cleanup_expired_copilot_actions(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.cleanup_expired_copilot_actions() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    UPDATE copilot_pending_actions 
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending' AND expires_at < NOW();
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$;


ALTER FUNCTION public.cleanup_expired_copilot_actions() OWNER TO neondb_owner;

--
-- Name: cleanup_expired_notifications(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.cleanup_expired_notifications() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM notifications 
    WHERE expires_at < NOW() 
    AND is_read = true;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;


ALTER FUNCTION public.cleanup_expired_notifications() OWNER TO neondb_owner;

--
-- Name: cleanup_expired_rate_limits(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.cleanup_expired_rate_limits() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM rate_limit_counters WHERE window_end < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION public.cleanup_expired_rate_limits() OWNER TO neondb_owner;

--
-- Name: cleanup_expired_sessions(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.cleanup_expired_sessions() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM staff_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION public.cleanup_expired_sessions() OWNER TO neondb_owner;

--
-- Name: cleanup_old_audit_logs(integer); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.cleanup_old_audit_logs(days_to_keep integer DEFAULT 90) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM audit_logs WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION public.cleanup_old_audit_logs(days_to_keep integer) OWNER TO neondb_owner;

--
-- Name: cleanup_old_webhook_deliveries(integer); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.cleanup_old_webhook_deliveries(days_to_keep integer DEFAULT 30) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM webhook_deliveries WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION public.cleanup_old_webhook_deliveries(days_to_keep integer) OWNER TO neondb_owner;

--
-- Name: create_default_loyalty_tiers(character varying); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.create_default_loyalty_tiers(p_merchant_id character varying) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO loyalty_tiers (merchant_id, name, name_ar, min_points, discount_percentage, color, icon)
  VALUES
    (p_merchant_id, 'Bronze', 'برونزي', 0, 0, '#CD7F32', 'medal'),
    (p_merchant_id, 'Silver', 'فضي', 500, 5, '#C0C0C0', 'award'),
    (p_merchant_id, 'Gold', 'ذهبي', 2000, 10, '#FFD700', 'crown'),
    (p_merchant_id, 'Platinum', 'بلاتيني', 5000, 15, '#E5E4E2', 'gem')
  ON CONFLICT (merchant_id, name) DO NOTHING;
END;
$$;


ALTER FUNCTION public.create_default_loyalty_tiers(p_merchant_id character varying) OWNER TO neondb_owner;

--
-- Name: expire_old_product_ocr_confirmations(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.expire_old_product_ocr_confirmations() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE product_ocr_confirmations 
    SET status = 'EXPIRED'
    WHERE status = 'PENDING' 
      AND expires_at < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$;


ALTER FUNCTION public.expire_old_product_ocr_confirmations() OWNER TO neondb_owner;

--
-- Name: expire_points(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.expire_points() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_expired_count INTEGER := 0;
  v_record RECORD;
BEGIN
  FOR v_record IN
    SELECT id, merchant_id, customer_id, points
    FROM points_transactions
    WHERE type = 'EARN'
      AND expires_at IS NOT NULL
      AND expires_at < CURRENT_TIMESTAMP
      AND id NOT IN (
        SELECT reference_id::UUID FROM points_transactions WHERE type = 'EXPIRE' AND reference_id IS NOT NULL
      )
  LOOP
    PERFORM add_customer_points(
      v_record.merchant_id,
      v_record.customer_id,
      -v_record.points,
      'EXPIRE',
      'EXPIRATION',
      v_record.id::VARCHAR,
      'Points expired'
    );
    v_expired_count := v_expired_count + 1;
  END LOOP;
  
  RETURN v_expired_count;
END;
$$;


ALTER FUNCTION public.expire_points() OWNER TO neondb_owner;

--
-- Name: fn_check_order_total(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.fn_check_order_total() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  expected DECIMAL(12,2);
BEGIN
  -- Only validate when all four monetary columns are populated.
  -- During partial UPDATE (e.g. status-only change) the NEW values retain
  -- the previous row values so the invariant will still be checked.
  IF NEW.subtotal IS NOT NULL
     AND NEW.discount IS NOT NULL
     AND NEW.delivery_fee IS NOT NULL
     AND NEW.total IS NOT NULL
  THEN
    expected := ROUND(NEW.subtotal - NEW.discount + NEW.delivery_fee, 2);
    IF ABS(ROUND(NEW.total, 2) - expected) > 0.01 THEN
      RAISE EXCEPTION
        'Order total invariant violated for order %: total=% but subtotal(%)  - discount(%) + delivery_fee(%) = %',
        NEW.id,
        ROUND(NEW.total, 2),
        NEW.subtotal,
        NEW.discount,
        NEW.delivery_fee,
        expected;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.fn_check_order_total() OWNER TO neondb_owner;

--
-- Name: generate_api_key(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.generate_api_key() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
  key VARCHAR(64);
BEGIN
  key := encode(gen_random_bytes(32), 'hex');
  RETURN 'mapi_' || key;
END;
$$;


ALTER FUNCTION public.generate_api_key() OWNER TO neondb_owner;

--
-- Name: generate_payment_link_code(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.generate_payment_link_code() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
  code VARCHAR(20);
  exists_count INTEGER;
BEGIN
  LOOP
    -- Generate format: PAY-XXXXXX (6 alphanumeric chars)
    code := 'PAY-' || upper(substring(md5(random()::text) from 1 for 6));
    
    SELECT COUNT(*) INTO exists_count FROM payment_links WHERE link_code = code;
    EXIT WHEN exists_count = 0;
  END LOOP;
  
  RETURN code;
END;
$$;


ALTER FUNCTION public.generate_payment_link_code() OWNER TO neondb_owner;

--
-- Name: generate_referral_code(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.generate_referral_code() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
END;
$$;


ALTER FUNCTION public.generate_referral_code() OWNER TO neondb_owner;

--
-- Name: get_unread_notification_count(character varying, uuid); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.get_unread_notification_count(p_merchant_id character varying, p_staff_id uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF p_staff_id IS NOT NULL THEN
        RETURN (
            SELECT COUNT(*) FROM notifications 
            WHERE merchant_id = p_merchant_id 
            AND (staff_id IS NULL OR staff_id = p_staff_id)
            AND is_read = false
            AND (expires_at IS NULL OR expires_at > NOW())
        );
    ELSE
        RETURN (
            SELECT COUNT(*) FROM notifications 
            WHERE merchant_id = p_merchant_id 
            AND is_read = false
            AND (expires_at IS NULL OR expires_at > NOW())
        );
    END IF;
END;
$$;


ALTER FUNCTION public.get_unread_notification_count(p_merchant_id character varying, p_staff_id uuid) OWNER TO neondb_owner;

--
-- Name: log_entitlement_change(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.log_entitlement_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  old_agents TEXT[];
  new_agents TEXT[];
  old_features TEXT[];
  new_features TEXT[];
  agent TEXT;
  feature TEXT;
BEGIN
  old_agents := COALESCE(OLD.enabled_agents, ARRAY[]::TEXT[]);
  new_agents := COALESCE(NEW.enabled_agents, ARRAY[]::TEXT[]);
  old_features := COALESCE(OLD.enabled_features, ARRAY[]::TEXT[]);
  new_features := COALESCE(NEW.enabled_features, ARRAY[]::TEXT[]);
  
  -- Check for new agents enabled
  FOREACH agent IN ARRAY new_agents LOOP
    IF NOT agent = ANY(old_agents) THEN
      INSERT INTO entitlement_changes (merchant_id, change_type, entity_type, entity_name, previous_value, new_value)
      VALUES (NEW.id, 'AGENT_ENABLED', 'AGENT', agent, false, true);
    END IF;
  END LOOP;
  
  -- Check for agents disabled
  FOREACH agent IN ARRAY old_agents LOOP
    IF NOT agent = ANY(new_agents) THEN
      INSERT INTO entitlement_changes (merchant_id, change_type, entity_type, entity_name, previous_value, new_value)
      VALUES (NEW.id, 'AGENT_DISABLED', 'AGENT', agent, true, false);
    END IF;
  END LOOP;
  
  -- Check for new features enabled
  FOREACH feature IN ARRAY new_features LOOP
    IF NOT feature = ANY(old_features) THEN
      INSERT INTO entitlement_changes (merchant_id, change_type, entity_type, entity_name, previous_value, new_value)
      VALUES (NEW.id, 'FEATURE_ENABLED', 'FEATURE', feature, false, true);
    END IF;
  END LOOP;
  
  -- Check for features disabled
  FOREACH feature IN ARRAY old_features LOOP
    IF NOT feature = ANY(new_features) THEN
      INSERT INTO entitlement_changes (merchant_id, change_type, entity_type, entity_name, previous_value, new_value)
      VALUES (NEW.id, 'FEATURE_DISABLED', 'FEATURE', feature, true, false);
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.log_entitlement_change() OWNER TO neondb_owner;

--
-- Name: prevent_monthly_close_ledger_mutations(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.prevent_monthly_close_ledger_mutations() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'monthly_close_governance_ledger is immutable';
END;
$$;


ALTER FUNCTION public.prevent_monthly_close_ledger_mutations() OWNER TO neondb_owner;

--
-- Name: set_payment_link_code(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.set_payment_link_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.link_code IS NULL THEN
    NEW.link_code := generate_payment_link_code();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_payment_link_code() OWNER TO neondb_owner;

--
-- Name: sync_catalog_items_active_flags(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.sync_catalog_items_active_flags() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.is_active := COALESCE(NEW.is_active, NEW.is_available, true);
    NEW.is_available := COALESCE(NEW.is_available, NEW.is_active, true);
    RETURN NEW;
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     AND NEW.is_available IS NOT DISTINCT FROM OLD.is_available THEN
    NEW.is_available := NEW.is_active;
  ELSIF NEW.is_available IS DISTINCT FROM OLD.is_available
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
    NEW.is_active := NEW.is_available;
  ELSE
    NEW.is_active := COALESCE(NEW.is_active, NEW.is_available, true);
    NEW.is_available := COALESCE(NEW.is_available, NEW.is_active, true);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_catalog_items_active_flags() OWNER TO neondb_owner;

--
-- Name: sync_expenses_date_compat(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.sync_expenses_date_compat() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.expense_date := COALESCE(NEW.expense_date, NEW.date, CURRENT_DATE);
  NEW.date := COALESCE(NEW.date, NEW.expense_date, CURRENT_DATE);
  NEW.status := COALESCE(NEW.status, 'APPROVED');
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_expenses_date_compat() OWNER TO neondb_owner;

--
-- Name: sync_merchant_agent_subscriptions_compat(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.sync_merchant_agent_subscriptions_compat() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
BEGIN
  NEW.agent_type := COALESCE(
    NEW.agent_type,
    CASE
      WHEN upper(COALESCE(NEW.agent_name, '')) IN ('OPS_AGENT', 'OPERATIONS', 'OPS') THEN 'OPS_AGENT'
      WHEN upper(COALESCE(NEW.agent_name, '')) IN ('INVENTORY_AGENT', 'INVENTORY') THEN 'INVENTORY_AGENT'
      WHEN upper(COALESCE(NEW.agent_name, '')) IN ('FINANCE_AGENT', 'FINANCE') THEN 'FINANCE_AGENT'
      WHEN upper(COALESCE(NEW.agent_name, '')) IN ('MARKETING_AGENT', 'MARKETING') THEN 'MARKETING_AGENT'
      WHEN upper(COALESCE(NEW.agent_name, '')) IN ('CONTENT_AGENT', 'CONTENT') THEN 'CONTENT_AGENT'
      WHEN upper(COALESCE(NEW.agent_name, '')) IN ('SUPPORT_AGENT', 'SUPPORT') THEN 'SUPPORT_AGENT'
      WHEN NEW.agent_name IS NULL OR btrim(NEW.agent_name) = '' THEN 'OPS_AGENT'
      ELSE upper(regexp_replace(NEW.agent_name, '[^A-Za-z0-9]+', '_', 'g')) || '_AGENT'
    END
  );

  NEW.agent_name := COALESCE(
    NEW.agent_name,
    CASE
      WHEN NEW.agent_type = 'OPS_AGENT' THEN 'operations'
      WHEN NEW.agent_type = 'INVENTORY_AGENT' THEN 'inventory'
      WHEN NEW.agent_type = 'FINANCE_AGENT' THEN 'finance'
      WHEN NEW.agent_type = 'MARKETING_AGENT' THEN 'marketing'
      WHEN NEW.agent_type = 'CONTENT_AGENT' THEN 'content'
      WHEN NEW.agent_type = 'SUPPORT_AGENT' THEN 'support'
      ELSE lower(regexp_replace(COALESCE(NEW.agent_type, 'ops_agent'), '_agent$', '', 'i'))
    END
  );

  NEW.is_enabled := COALESCE(NEW.is_enabled, NEW.enabled, false);
  NEW.enabled := COALESCE(NEW.enabled, NEW.is_enabled, false);

  NEW.config := COALESCE(NEW.config, NEW.settings, '{}'::jsonb);
  NEW.settings := COALESCE(NEW.settings, NEW.config, '{}'::jsonb);

  NEW.updated_at := COALESCE(NEW.updated_at, NOW());
  NEW.created_at := COALESCE(NEW.created_at, NEW.updated_at, NOW());

  IF NEW.is_enabled THEN
    NEW.enabled_at := COALESCE(NEW.enabled_at, NEW.updated_at, NOW());
    NEW.disabled_at := NULL;
  ELSE
    NEW.disabled_at := COALESCE(NEW.disabled_at, NEW.updated_at, NOW());
  END IF;

  RETURN NEW;
END;
$_$;


ALTER FUNCTION public.sync_merchant_agent_subscriptions_compat() OWNER TO neondb_owner;

--
-- Name: sync_orders_total_compat(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.sync_orders_total_compat() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.total := COALESCE(NEW.total, NEW.total_amount, 0);
  NEW.total_amount := COALESCE(NEW.total_amount, NEW.total, 0);
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_orders_total_compat() OWNER TO neondb_owner;

--
-- Name: update_control_plane_replay_consumptions_updated_at(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.update_control_plane_replay_consumptions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_control_plane_replay_consumptions_updated_at() OWNER TO neondb_owner;

--
-- Name: update_copilot_approvals_updated_at(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.update_copilot_approvals_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_copilot_approvals_updated_at() OWNER TO neondb_owner;

--
-- Name: update_copilot_updated_at(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.update_copilot_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_copilot_updated_at() OWNER TO neondb_owner;

--
-- Name: update_dead_stock_status(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.update_dead_stock_status() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE inventory_items
  SET 
    days_without_sale = COALESCE(
      EXTRACT(DAY FROM (NOW() - last_sold_at))::INTEGER,
      EXTRACT(DAY FROM (NOW() - created_at))::INTEGER
    ),
    is_dead_stock = CASE 
      WHEN last_sold_at IS NULL AND created_at < NOW() - INTERVAL '30 days' THEN true
      WHEN last_sold_at < NOW() - INTERVAL '30 days' THEN true
      ELSE false
    END,
    updated_at = NOW()
  WHERE quantity_available > 0;
END;
$$;


ALTER FUNCTION public.update_dead_stock_status() OWNER TO neondb_owner;

--
-- Name: update_subscription_offers_updated_at(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.update_subscription_offers_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_subscription_offers_updated_at() OWNER TO neondb_owner;

--
-- Name: update_twilio_updated_at(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.update_twilio_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_twilio_updated_at() OWNER TO neondb_owner;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO neondb_owner;

--
-- Name: update_wa_log_updated_at(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.update_wa_log_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_wa_log_updated_at() OWNER TO neondb_owner;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accountant_exports; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.accountant_exports (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    export_type character varying(30) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    includes jsonb DEFAULT '[]'::jsonb,
    csv_url text,
    pdf_url text,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    generated_by character varying(100),
    download_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.accountant_exports OWNER TO neondb_owner;

--
-- Name: TABLE accountant_exports; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.accountant_exports IS 'Exported accountant packs (CSV/PDF)';


--
-- Name: add_on_prices; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.add_on_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    addon_id uuid NOT NULL,
    region_code character varying(8) NOT NULL,
    currency character varying(8) NOT NULL,
    cycle_months integer DEFAULT 1 NOT NULL,
    base_price_cents integer NOT NULL,
    discount_percent numeric(5,2) DEFAULT 0 NOT NULL,
    total_price_cents integer NOT NULL,
    effective_monthly_cents integer NOT NULL,
    vat_included boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.add_on_prices OWNER TO neondb_owner;

--
-- Name: add_ons; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.add_ons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(64) NOT NULL,
    name character varying(160) NOT NULL,
    category character varying(40) DEFAULT 'FEATURE'::character varying NOT NULL,
    description text,
    is_subscription boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scope character varying(20) DEFAULT 'BYO'::character varying NOT NULL,
    addon_type character varying(20) DEFAULT 'FEATURE'::character varying NOT NULL,
    feature_enables text[] DEFAULT ARRAY[]::text[] NOT NULL,
    limit_floor_updates jsonb DEFAULT '{}'::jsonb NOT NULL,
    limit_increments jsonb DEFAULT '{}'::jsonb NOT NULL
);


ALTER TABLE public.add_ons OWNER TO neondb_owner;

--
-- Name: address_cache; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.address_cache (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    raw_text text NOT NULL,
    city character varying(100),
    area character varying(255),
    street character varying(255),
    building character varying(100),
    floor character varying(50),
    apartment character varying(50),
    landmark text,
    google_maps_url text,
    latitude numeric(10,8),
    longitude numeric(11,8),
    confidence numeric(5,4),
    missing_fields text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.address_cache OWNER TO neondb_owner;

--
-- Name: agent_actions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.agent_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    agent_type character varying(40) NOT NULL,
    action_type character varying(60) NOT NULL,
    severity character varying(10) DEFAULT 'INFO'::character varying NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    auto_resolved boolean DEFAULT false,
    merchant_ack boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.agent_actions OWNER TO neondb_owner;

--
-- Name: agent_results; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.agent_results (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    task_id uuid NOT NULL,
    success boolean NOT NULL,
    output jsonb,
    error text,
    execution_time_ms integer,
    tokens_used integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_type public.agent_type_v2
);


ALTER TABLE public.agent_results OWNER TO neondb_owner;

--
-- Name: agent_subscription_audit; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.agent_subscription_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    action character varying(20) NOT NULL,
    agent_type character varying(50) NOT NULL,
    changed_by character varying(100),
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.agent_subscription_audit OWNER TO neondb_owner;

--
-- Name: agent_tasks; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.agent_tasks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    task_type character varying(100) NOT NULL,
    merchant_id character varying(50),
    conversation_id character varying(100),
    order_id uuid,
    input jsonb NOT NULL,
    status public.task_status DEFAULT 'PENDING'::public.task_status NOT NULL,
    priority integer DEFAULT 5,
    max_retries integer DEFAULT 3,
    retry_count integer DEFAULT 0,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    correlation_id character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_name character varying(100),
    event_type character varying(100),
    event_id uuid,
    next_run_at timestamp with time zone,
    last_error text,
    result jsonb,
    payload jsonb,
    timeout_at timestamp with time zone,
    output jsonb,
    error text,
    assigned_at timestamp with time zone,
    agent_type public.agent_type_v2 NOT NULL
);


ALTER TABLE public.agent_tasks OWNER TO neondb_owner;

--
-- Name: ai_call_metrics; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.ai_call_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_name character varying(100) NOT NULL,
    method_name character varying(100) NOT NULL,
    merchant_id uuid,
    outcome character varying(50) NOT NULL,
    tokens_used integer,
    latency_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ai_call_metrics OWNER TO neondb_owner;

--
-- Name: ai_decision_log; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.ai_decision_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    agent_type character varying(50) NOT NULL,
    decision_type character varying(100) NOT NULL,
    input_summary text,
    decision text NOT NULL,
    reasoning text,
    confidence numeric(3,2),
    entity_type character varying(50),
    entity_id character varying(100),
    was_overridden boolean DEFAULT false,
    overridden_by character varying(100),
    override_reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.ai_decision_log OWNER TO neondb_owner;

--
-- Name: ai_routing_log; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.ai_routing_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    plan_name character varying(50),
    message_type character varying(30),
    complexity_score integer,
    routing_decision character varying(30) NOT NULL,
    model_used character varying(30),
    estimated_cost_usd numeric(10,6) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ai_routing_log OWNER TO neondb_owner;

--
-- Name: analytics_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.analytics_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(100) NOT NULL,
    staff_id uuid,
    event_name character varying(120) NOT NULL,
    event_properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    session_id character varying(120),
    source character varying(50) DEFAULT 'portal'::character varying,
    path character varying(255),
    user_agent text,
    ip_address character varying(45),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.analytics_events OWNER TO neondb_owner;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    staff_id uuid,
    action public.audit_action NOT NULL,
    resource public.audit_resource NOT NULL,
    resource_id character varying(255),
    old_values jsonb,
    new_values jsonb,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip_address character varying(45),
    user_agent text,
    correlation_id character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO neondb_owner;

--
-- Name: automation_run_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.automation_run_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    automation_type character varying(60) NOT NULL,
    status character varying(20) DEFAULT 'success'::character varying NOT NULL,
    messages_sent integer DEFAULT 0 NOT NULL,
    targets_found integer DEFAULT 0 NOT NULL,
    error_message text,
    run_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.automation_run_logs OWNER TO neondb_owner;

--
-- Name: billing_invoices; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.billing_invoices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(100) NOT NULL,
    subscription_id uuid,
    amount_cents integer DEFAULT 0 NOT NULL,
    currency character varying(10) DEFAULT 'EGP'::character varying,
    status public.invoice_status DEFAULT 'OPEN'::public.invoice_status NOT NULL,
    due_date timestamp with time zone,
    paid_at timestamp with time zone,
    provider_invoice_id character varying(255),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.billing_invoices OWNER TO neondb_owner;

--
-- Name: billing_overages; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.billing_overages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    billing_period date NOT NULL,
    metric_type character varying(50) DEFAULT 'conversations'::character varying NOT NULL,
    included_amount integer NOT NULL,
    actual_amount integer NOT NULL,
    overage_amount integer NOT NULL,
    rate_per_unit numeric(10,4) NOT NULL,
    currency character varying(3) NOT NULL,
    total_charge numeric(10,2) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT billing_overages_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'invoiced'::character varying, 'paid'::character varying, 'waived'::character varying])::text[])))
);


ALTER TABLE public.billing_overages OWNER TO neondb_owner;

--
-- Name: billing_plans; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.billing_plans (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    price_cents integer,
    currency character varying(10) DEFAULT 'EGP'::character varying,
    billing_period character varying(20) DEFAULT 'monthly'::character varying,
    description text,
    features jsonb DEFAULT '[]'::jsonb NOT NULL,
    agents jsonb DEFAULT '[]'::jsonb NOT NULL,
    limits jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.billing_plans OWNER TO neondb_owner;

--
-- Name: branch_goals; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.branch_goals (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    branch_id uuid NOT NULL,
    period_type public.goal_period_type DEFAULT 'MONTHLY'::public.goal_period_type NOT NULL,
    target_revenue numeric(14,2),
    target_orders integer,
    start_date date NOT NULL,
    end_date date NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT branch_goals_check CHECK ((end_date >= start_date))
);


ALTER TABLE public.branch_goals OWNER TO neondb_owner;

--
-- Name: branch_shifts; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.branch_shifts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    branch_id uuid NOT NULL,
    shift_number integer NOT NULL,
    opened_by uuid,
    closed_by uuid,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    opening_cash numeric(12,2) DEFAULT 0 NOT NULL,
    closing_cash numeric(12,2),
    expected_cash numeric(12,2),
    cash_difference numeric(12,2) GENERATED ALWAYS AS (
CASE
    WHEN ((closing_cash IS NOT NULL) AND (expected_cash IS NOT NULL)) THEN (closing_cash - expected_cash)
    ELSE NULL::numeric
END) STORED,
    total_orders integer DEFAULT 0,
    total_revenue numeric(14,2) DEFAULT 0,
    notes text,
    closing_notes text,
    status public.shift_status DEFAULT 'OPEN'::public.shift_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.branch_shifts OWNER TO neondb_owner;

--
-- Name: branch_shifts_shift_number_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.branch_shifts_shift_number_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.branch_shifts_shift_number_seq OWNER TO neondb_owner;

--
-- Name: branch_shifts_shift_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.branch_shifts_shift_number_seq OWNED BY public.branch_shifts.shift_number;


--
-- Name: branch_staff_assignments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.branch_staff_assignments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    branch_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    role character varying(50) DEFAULT 'AGENT'::character varying NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.branch_staff_assignments OWNER TO neondb_owner;

--
-- Name: bulk_operations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.bulk_operations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    staff_id uuid,
    operation_type public.bulk_operation_type NOT NULL,
    resource_type character varying(50) NOT NULL,
    status public.bulk_operation_status DEFAULT 'PENDING'::public.bulk_operation_status NOT NULL,
    file_url character varying(2048),
    result_url character varying(2048),
    total_records integer,
    processed_records integer DEFAULT 0 NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    errors jsonb DEFAULT '[]'::jsonb NOT NULL,
    options jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bulk_operations OWNER TO neondb_owner;

--
-- Name: call_followup_workflow_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.call_followup_workflow_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    call_id uuid NOT NULL,
    action character varying(20) NOT NULL,
    from_state character varying(20) NOT NULL,
    to_state character varying(20) NOT NULL,
    actor_id character varying(120) NOT NULL,
    claimed_by character varying(120),
    assigned_to character varying(120),
    disposition character varying(40),
    note text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT call_followup_workflow_events_action_check CHECK (((action)::text = ANY ((ARRAY['CLAIM'::character varying, 'ASSIGN'::character varying, 'RESOLVE'::character varying])::text[]))),
    CONSTRAINT call_followup_workflow_events_disposition_check CHECK (((disposition IS NULL) OR ((disposition)::text = ANY ((ARRAY['ORDER_CREATED'::character varying, 'CALLBACK_REQUESTED'::character varying, 'NO_ANSWER'::character varying, 'NOT_INTERESTED'::character varying, 'ESCALATED'::character varying])::text[])))),
    CONSTRAINT call_followup_workflow_events_from_state_check CHECK (((from_state)::text = ANY ((ARRAY['OPEN'::character varying, 'CLAIMED'::character varying, 'ASSIGNED'::character varying, 'RESOLVED'::character varying])::text[]))),
    CONSTRAINT call_followup_workflow_events_to_state_check CHECK (((to_state)::text = ANY ((ARRAY['OPEN'::character varying, 'CLAIMED'::character varying, 'ASSIGNED'::character varying, 'RESOLVED'::character varying])::text[])))
);


ALTER TABLE public.call_followup_workflow_events OWNER TO neondb_owner;

--
-- Name: call_followup_workflows; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.call_followup_workflows (
    call_id uuid NOT NULL,
    merchant_id character varying(50) NOT NULL,
    state character varying(20) DEFAULT 'OPEN'::character varying NOT NULL,
    claimed_by character varying(120),
    assigned_to character varying(120),
    disposition character varying(40),
    resolution_note text,
    callback_due_at timestamp with time zone,
    claimed_at timestamp with time zone,
    assigned_at timestamp with time zone,
    resolved_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT call_followup_workflows_disposition_check CHECK (((disposition IS NULL) OR ((disposition)::text = ANY ((ARRAY['ORDER_CREATED'::character varying, 'CALLBACK_REQUESTED'::character varying, 'NO_ANSWER'::character varying, 'NOT_INTERESTED'::character varying, 'ESCALATED'::character varying])::text[])))),
    CONSTRAINT call_followup_workflows_state_check CHECK (((state)::text = ANY ((ARRAY['OPEN'::character varying, 'CLAIMED'::character varying, 'ASSIGNED'::character varying, 'RESOLVED'::character varying])::text[])))
);


ALTER TABLE public.call_followup_workflows OWNER TO neondb_owner;

--
-- Name: callback_campaign_bridge_items; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.callback_campaign_bridge_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bridge_id uuid NOT NULL,
    merchant_id character varying(50) NOT NULL,
    call_id uuid NOT NULL,
    workflow_event_id uuid,
    customer_phone character varying(30) NOT NULL,
    customer_name character varying(255),
    callback_due_at timestamp with time zone,
    sent boolean DEFAULT false NOT NULL,
    sent_at timestamp with time zone,
    send_error text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.callback_campaign_bridge_items OWNER TO neondb_owner;

--
-- Name: callback_campaign_bridges; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.callback_campaign_bridges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    created_by character varying(120) NOT NULL,
    approved_by character varying(120),
    executed_by character varying(120),
    approval_note text,
    message_template text NOT NULL,
    discount_code character varying(80),
    inactive_days integer DEFAULT 30 NOT NULL,
    callback_due_before timestamp with time zone,
    target_count integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    executed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT callback_campaign_bridges_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'APPROVED'::character varying, 'EXECUTING'::character varying, 'EXECUTED'::character varying, 'CANCELLED'::character varying])::text[])))
);


ALTER TABLE public.callback_campaign_bridges OWNER TO neondb_owner;

--
-- Name: cash_flow_forecasts; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.cash_flow_forecasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    forecast_date date NOT NULL,
    projected_income numeric(14,2) DEFAULT 0,
    projected_expenses numeric(14,2) DEFAULT 0,
    projected_cod_collections numeric(14,2) DEFAULT 0,
    projected_net numeric(14,2) DEFAULT 0,
    actual_income numeric(14,2),
    actual_expenses numeric(14,2),
    confidence_pct integer DEFAULT 70,
    generated_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public.cash_flow_forecasts OWNER TO neondb_owner;

--
-- Name: catalog_embedding_jobs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.catalog_embedding_jobs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    catalog_item_id uuid NOT NULL,
    merchant_id character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);


ALTER TABLE public.catalog_embedding_jobs OWNER TO neondb_owner;

--
-- Name: catalog_items; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.catalog_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    sku character varying(100),
    name_ar character varying(500) NOT NULL,
    name_en character varying(500),
    description_ar text,
    description_en text,
    category character varying(100),
    base_price numeric(10,2) NOT NULL,
    min_price numeric(10,2),
    variants jsonb DEFAULT '[]'::jsonb NOT NULL,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags text[],
    embedding public.vector(1536),
    is_available boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    stock_quantity integer,
    low_stock_threshold integer DEFAULT 5,
    track_inventory boolean DEFAULT false NOT NULL,
    allow_backorder boolean DEFAULT false NOT NULL,
    has_recipe boolean DEFAULT false,
    expiry_date date,
    shelf_life_days integer,
    is_perishable boolean DEFAULT false,
    is_active boolean DEFAULT true
);


ALTER TABLE public.catalog_items OWNER TO neondb_owner;

--
-- Name: cod_collections; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.cod_collections (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    order_id uuid,
    expected_amount numeric(10,2) NOT NULL,
    collected_amount numeric(10,2),
    collection_date date,
    collector_name character varying(100),
    status character varying(20) DEFAULT 'pending'::character varying,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid
);


ALTER TABLE public.cod_collections OWNER TO neondb_owner;

--
-- Name: TABLE cod_collections; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.cod_collections IS 'Cash on Delivery collection tracking';


--
-- Name: cod_finance_actions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.cod_finance_actions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    action_type character varying(40) NOT NULL,
    statement_id uuid,
    order_id uuid,
    expected_amount numeric(12,2),
    actual_amount numeric(12,2),
    variance_amount numeric(12,2),
    confidence_score integer DEFAULT 0 NOT NULL,
    requires_approval boolean DEFAULT false NOT NULL,
    approval_granted boolean DEFAULT false NOT NULL,
    approval_actor character varying(100),
    approval_reason text,
    action_notes text,
    acted_by character varying(100),
    acted_role character varying(30),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cod_finance_actions_action_type_check CHECK (((action_type)::text = ANY ((ARRAY['ORDER_RECONCILE'::character varying, 'ORDER_DISPUTE'::character varying, 'STATEMENT_CLOSE'::character varying])::text[])))
);


ALTER TABLE public.cod_finance_actions OWNER TO neondb_owner;

--
-- Name: cod_reminders; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.cod_reminders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    order_id uuid NOT NULL,
    customer_id character varying(100),
    customer_phone character varying(50),
    amount_due numeric(10,2) NOT NULL,
    reminder_type character varying(30) NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    sent_at timestamp with time zone,
    status character varying(20) DEFAULT 'pending'::character varying,
    message_template character varying(50),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.cod_reminders OWNER TO neondb_owner;

--
-- Name: TABLE cod_reminders; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.cod_reminders IS 'Scheduled COD collection reminders';


--
-- Name: cod_statement_imports; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.cod_statement_imports (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    courier_name character varying(100) NOT NULL,
    filename character varying(255) NOT NULL,
    statement_date date NOT NULL,
    total_orders integer DEFAULT 0,
    total_collected numeric(12,2) DEFAULT 0,
    total_fees numeric(10,2) DEFAULT 0,
    net_amount numeric(12,2) DEFAULT 0,
    matched_orders integer DEFAULT 0,
    unmatched_orders integer DEFAULT 0,
    discrepancies jsonb DEFAULT '[]'::jsonb,
    status character varying(20) DEFAULT 'pending'::character varying,
    reconciled_at timestamp with time zone,
    imported_by character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.cod_statement_imports OWNER TO neondb_owner;

--
-- Name: TABLE cod_statement_imports; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.cod_statement_imports IS 'Courier COD statement imports for reconciliation';


--
-- Name: cod_statement_lines; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.cod_statement_lines (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    statement_id uuid NOT NULL,
    merchant_id character varying(50) NOT NULL,
    tracking_number character varying(100),
    order_number character varying(100),
    order_id uuid,
    customer_name character varying(200),
    collected_amount numeric(10,2),
    delivery_fee numeric(10,2),
    cod_fee numeric(10,2),
    net_amount numeric(10,2),
    delivery_date date,
    status character varying(30),
    match_status character varying(20) DEFAULT 'pending'::character varying,
    our_amount numeric(10,2),
    discrepancy_amount numeric(10,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.cod_statement_lines OWNER TO neondb_owner;

--
-- Name: TABLE cod_statement_lines; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.cod_statement_lines IS 'Individual lines from COD statements';


--
-- Name: complaint_playbooks; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.complaint_playbooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50),
    complaint_type character varying(50) NOT NULL,
    step_number integer NOT NULL,
    action_type character varying(30) NOT NULL,
    message_template_ar text NOT NULL,
    message_template_en text,
    requires_photo boolean DEFAULT false,
    requires_confirmation boolean DEFAULT false,
    auto_compensation_pct numeric(5,2),
    next_step_on_yes integer,
    next_step_on_no integer,
    escalate_after_step boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.complaint_playbooks OWNER TO neondb_owner;

--
-- Name: connector_reconciliation_items; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.connector_reconciliation_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    merchant_id character varying(50) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_key character varying(255) NOT NULL,
    source_hash text,
    target_hash text,
    drift_type character varying(32) NOT NULL,
    status character varying(20) DEFAULT 'OPEN'::character varying NOT NULL,
    resolution_note text,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT connector_reconciliation_items_status_check CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'RESOLVED'::character varying, 'IGNORED'::character varying])::text[])))
);


ALTER TABLE public.connector_reconciliation_items OWNER TO neondb_owner;

--
-- Name: connector_reconciliation_runs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.connector_reconciliation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    endpoint_id uuid,
    scope character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    drift_count integer DEFAULT 0 NOT NULL,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_by character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT connector_reconciliation_runs_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'RUNNING'::character varying, 'COMPLETED'::character varying, 'FAILED'::character varying])::text[])))
);


ALTER TABLE public.connector_reconciliation_runs OWNER TO neondb_owner;

--
-- Name: connector_runtime_dlq; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.connector_runtime_dlq (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    runtime_event_id uuid NOT NULL,
    endpoint_id uuid,
    merchant_id character varying(50) NOT NULL,
    event_type character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    last_error text,
    attempt_count integer DEFAULT 0 NOT NULL,
    first_failed_at timestamp with time zone,
    moved_to_dlq_at timestamp with time zone DEFAULT now() NOT NULL,
    replayed_at timestamp with time zone,
    replay_count integer DEFAULT 0 NOT NULL,
    status character varying(16) DEFAULT 'OPEN'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT connector_runtime_dlq_status_check CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'REPLAYED'::character varying, 'DISCARDED'::character varying])::text[])))
);


ALTER TABLE public.connector_runtime_dlq OWNER TO neondb_owner;

--
-- Name: connector_runtime_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.connector_runtime_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    endpoint_id uuid,
    merchant_id character varying(50) NOT NULL,
    event_type character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    next_retry_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT connector_runtime_events_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'PROCESSING'::character varying, 'PROCESSED'::character varying, 'RETRY'::character varying, 'DEAD_LETTER'::character varying])::text[])))
);


ALTER TABLE public.connector_runtime_events OWNER TO neondb_owner;

--
-- Name: connector_runtime_worker_cycle_outcomes; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.connector_runtime_worker_cycle_outcomes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid NOT NULL,
    merchant_id character varying(50) NOT NULL,
    lock_acquired boolean DEFAULT false NOT NULL,
    queue_total_picked integer DEFAULT 0 NOT NULL,
    queue_processed integer DEFAULT 0 NOT NULL,
    queue_retried integer DEFAULT 0 NOT NULL,
    queue_moved_to_dlq integer DEFAULT 0 NOT NULL,
    recovered_stuck_count integer DEFAULT 0 NOT NULL,
    reconciliation_attempted boolean DEFAULT false NOT NULL,
    reconciliation_succeeded boolean DEFAULT false NOT NULL,
    reconciliation_skipped_by_depth boolean DEFAULT false NOT NULL,
    reconciliation_run_id character varying(64),
    reconciliation_error text,
    outcome_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.connector_runtime_worker_cycle_outcomes OWNER TO neondb_owner;

--
-- Name: connector_runtime_worker_cycles; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.connector_runtime_worker_cycles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trigger_source character varying(32) DEFAULT 'scheduler'::character varying NOT NULL,
    worker_instance character varying(120),
    run_status character varying(20) NOT NULL,
    cycle_options jsonb DEFAULT '{}'::jsonb NOT NULL,
    cycle_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone NOT NULL,
    duration_ms integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT connector_runtime_worker_cycles_run_status_check CHECK (((run_status)::text = ANY ((ARRAY['COMPLETED'::character varying, 'FAILED'::character varying, 'SKIPPED'::character varying])::text[])))
);


ALTER TABLE public.connector_runtime_worker_cycles OWNER TO neondb_owner;

--
-- Name: control_plane_replay_token_consumptions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.control_plane_replay_token_consumptions (
    id bigint NOT NULL,
    merchant_id character varying(50) NOT NULL,
    source_run_id uuid NOT NULL,
    replay_run_id uuid,
    preview_token_hash character varying(64) NOT NULL,
    preview_context_hash character varying(64) NOT NULL,
    operator_note character varying(240) NOT NULL,
    consumed_by character varying(64),
    consumed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.control_plane_replay_token_consumptions OWNER TO neondb_owner;

--
-- Name: TABLE control_plane_replay_token_consumptions; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.control_plane_replay_token_consumptions IS 'Single-use replay preview token consumption ledger with operator note evidence';


--
-- Name: control_plane_replay_token_consumptions_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.control_plane_replay_token_consumptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.control_plane_replay_token_consumptions_id_seq OWNER TO neondb_owner;

--
-- Name: control_plane_replay_token_consumptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.control_plane_replay_token_consumptions_id_seq OWNED BY public.control_plane_replay_token_consumptions.id;


--
-- Name: control_plane_triage_acknowledgements; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.control_plane_triage_acknowledgements (
    id bigint NOT NULL,
    merchant_id character varying(50) NOT NULL,
    run_id uuid NOT NULL,
    trigger_type character varying(20) NOT NULL,
    trigger_key character varying(120) NOT NULL,
    recommended_action character varying(64) NOT NULL,
    ack_status character varying(20) DEFAULT 'acknowledged'::character varying NOT NULL,
    ack_note character varying(240) NOT NULL,
    acked_by character varying(64),
    acked_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT control_plane_triage_acknowledgements_ack_status_check CHECK (((ack_status)::text = ANY ((ARRAY['acknowledged'::character varying, 'deferred'::character varying])::text[])))
);


ALTER TABLE public.control_plane_triage_acknowledgements OWNER TO neondb_owner;

--
-- Name: TABLE control_plane_triage_acknowledgements; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.control_plane_triage_acknowledgements IS 'Operator triage acknowledgement history for control-plane recommended actions';


--
-- Name: control_plane_triage_acknowledgements_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.control_plane_triage_acknowledgements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.control_plane_triage_acknowledgements_id_seq OWNER TO neondb_owner;

--
-- Name: control_plane_triage_acknowledgements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.control_plane_triage_acknowledgements_id_seq OWNED BY public.control_plane_triage_acknowledgements.id;


--
-- Name: control_policy_sets; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.control_policy_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    name character varying(120) NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    policy_dsl jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by character varying(64),
    activated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT control_policy_sets_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'ACTIVE'::character varying, 'ARCHIVED'::character varying])::text[])))
);


ALTER TABLE public.control_policy_sets OWNER TO neondb_owner;

--
-- Name: control_policy_simulations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.control_policy_simulations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    policy_set_id uuid,
    simulation_input jsonb NOT NULL,
    simulation_result jsonb NOT NULL,
    created_by character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.control_policy_simulations OWNER TO neondb_owner;

--
-- Name: conversation_locks; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.conversation_locks (
    conversation_id character varying(100) NOT NULL,
    locked_by character varying(100) NOT NULL,
    locked_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


ALTER TABLE public.conversation_locks OWNER TO neondb_owner;

--
-- Name: conversations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.conversations (
    id character varying(100) NOT NULL,
    merchant_id character varying(50) NOT NULL,
    customer_id uuid,
    sender_id character varying(255) NOT NULL,
    state public.conversation_state DEFAULT 'GREETING'::public.conversation_state NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    cart jsonb DEFAULT '{"items": [], "total": 0, "discount": 0, "subtotal": 0}'::jsonb NOT NULL,
    collected_info jsonb DEFAULT '{}'::jsonb NOT NULL,
    missing_slots text[] DEFAULT '{}'::text[] NOT NULL,
    compressed_history jsonb,
    last_message_at timestamp with time zone,
    followup_count integer DEFAULT 0 NOT NULL,
    next_followup_at timestamp with time zone,
    human_takeover boolean DEFAULT false NOT NULL,
    human_takeover_at timestamp with time zone,
    human_operator_id character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_human_takeover boolean DEFAULT false,
    taken_over_by character varying(100),
    taken_over_at timestamp with time zone,
    conversation_summary text,
    summary_updated_at timestamp with time zone,
    structured_address jsonb DEFAULT '{}'::jsonb,
    delivery_fee numeric(10,2),
    delivery_notes text,
    lead_score character varying(10) DEFAULT NULL::character varying,
    lead_score_signals jsonb DEFAULT '{}'::jsonb,
    nba_text text,
    nba_type character varying(50) DEFAULT NULL::character varying,
    address_confidence integer,
    address_missing_fields text[] DEFAULT '{}'::text[],
    objection_type character varying(50) DEFAULT NULL::character varying,
    requires_confirmation boolean DEFAULT false,
    confirmed_at timestamp with time zone,
    recovered_from_followup boolean DEFAULT false,
    recovery_followup_id character varying(100) DEFAULT NULL::character varying,
    branch_id uuid,
    channel character varying(20) DEFAULT 'whatsapp'::character varying
);


ALTER TABLE public.conversations OWNER TO neondb_owner;

--
-- Name: copilot_action_approvals; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.copilot_action_approvals (
    action_id uuid NOT NULL,
    merchant_id character varying(50) NOT NULL,
    intent character varying(50) NOT NULL,
    source character varying(20) DEFAULT 'portal'::character varying NOT NULL,
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    pending_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    denied_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    expired_at timestamp with time zone,
    executing_at timestamp with time zone,
    executed_at timestamp with time zone,
    actor_role character varying(20),
    actor_id character varying(64),
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    execution_result jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT copilot_action_approvals_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'denied'::character varying, 'cancelled'::character varying, 'expired'::character varying, 'executing'::character varying, 'executed_success'::character varying, 'executed_failed'::character varying])::text[])))
);


ALTER TABLE public.copilot_action_approvals OWNER TO neondb_owner;

--
-- Name: TABLE copilot_action_approvals; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.copilot_action_approvals IS 'Timestamped approval and execution lifecycle for copilot pending actions';


--
-- Name: copilot_history; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.copilot_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    source character varying(20) NOT NULL,
    input_type character varying(10) NOT NULL,
    input_text text NOT NULL,
    intent character varying(50),
    command jsonb,
    action_taken boolean DEFAULT false,
    action_result jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT copilot_history_input_type_check CHECK (((input_type)::text = ANY ((ARRAY['text'::character varying, 'voice'::character varying])::text[]))),
    CONSTRAINT copilot_history_source_check CHECK (((source)::text = ANY ((ARRAY['portal'::character varying, 'whatsapp'::character varying])::text[])))
);


ALTER TABLE public.copilot_history OWNER TO neondb_owner;

--
-- Name: TABLE copilot_history; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.copilot_history IS 'History of all Copilot interactions';


--
-- Name: copilot_pending_actions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.copilot_pending_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    intent character varying(50) NOT NULL,
    command jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    source character varying(20) DEFAULT 'portal'::character varying,
    execution_result jsonb,
    CONSTRAINT copilot_pending_actions_source_check CHECK (((source)::text = ANY ((ARRAY['portal'::character varying, 'whatsapp'::character varying])::text[]))),
    CONSTRAINT copilot_pending_actions_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying, 'cancelled'::character varying, 'expired'::character varying])::text[])))
);


ALTER TABLE public.copilot_pending_actions OWNER TO neondb_owner;

--
-- Name: TABLE copilot_pending_actions; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.copilot_pending_actions IS 'Pending actions awaiting merchant confirmation via Copilot';


--
-- Name: custom_segments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.custom_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    match_type character varying(10) DEFAULT 'all'::character varying NOT NULL,
    customer_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.custom_segments OWNER TO neondb_owner;

--
-- Name: customer_memory; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.customer_memory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    customer_id uuid NOT NULL,
    memory_type character varying(50) NOT NULL,
    memory_key character varying(100) NOT NULL,
    memory_value text NOT NULL,
    confidence numeric(3,2) DEFAULT 1.00,
    source character varying(50) DEFAULT 'conversation'::character varying,
    last_used_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.customer_memory OWNER TO neondb_owner;

--
-- Name: customer_points; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.customer_points (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(255) NOT NULL,
    customer_id uuid NOT NULL,
    current_points integer DEFAULT 0 NOT NULL,
    lifetime_points integer DEFAULT 0 NOT NULL,
    tier_id uuid,
    points_expiring_at timestamp with time zone,
    last_activity_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.customer_points OWNER TO neondb_owner;

--
-- Name: TABLE customer_points; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.customer_points IS 'Customer points balance and tier';


--
-- Name: customer_referrals; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.customer_referrals (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(255) NOT NULL,
    referrer_customer_id uuid NOT NULL,
    referred_customer_id uuid NOT NULL,
    referral_code character varying(20) NOT NULL,
    status character varying(50) DEFAULT 'PENDING'::character varying,
    referrer_points integer DEFAULT 0,
    referred_points integer DEFAULT 0,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.customer_referrals OWNER TO neondb_owner;

--
-- Name: customer_risk_scores; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.customer_risk_scores (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    customer_id character varying(100) NOT NULL,
    risk_score integer DEFAULT 0 NOT NULL,
    risk_factors jsonb DEFAULT '{}'::jsonb,
    last_calculated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.customer_risk_scores OWNER TO neondb_owner;

--
-- Name: TABLE customer_risk_scores; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.customer_risk_scores IS 'Return/delivery risk scores based on customer history';


--
-- Name: customer_segments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.customer_segments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(255) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    type character varying(50) DEFAULT 'DYNAMIC'::character varying,
    conditions jsonb DEFAULT '{}'::jsonb,
    customer_count integer DEFAULT 0,
    last_calculated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.customer_segments OWNER TO neondb_owner;

--
-- Name: TABLE customer_segments; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.customer_segments IS 'Customer segments for targeted marketing';


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
-- Name: customers; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.customers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    sender_id character varying(255) NOT NULL,
    phone character varying(50),
    name character varying(255),
    address jsonb,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    total_orders integer DEFAULT 0 NOT NULL,
    last_interaction_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_order_items jsonb DEFAULT '[]'::jsonb,
    favorite_items jsonb DEFAULT '[]'::jsonb,
    reorder_count integer DEFAULT 0,
    vip_status character varying(20) DEFAULT NULL::character varying,
    vip_since timestamp with time zone,
    welcome_sent_at timestamp with time zone
);


ALTER TABLE public.customers OWNER TO neondb_owner;

--
-- Name: data_requests; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.data_requests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    customer_id uuid,
    request_type public.data_request_type NOT NULL,
    status public.data_request_status DEFAULT 'PENDING'::public.data_request_status NOT NULL,
    requester_email character varying(255),
    requester_phone character varying(50),
    verification_code character varying(10),
    verified_at timestamp with time zone,
    result_url character varying(2048),
    expires_at timestamp with time zone,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.data_requests OWNER TO neondb_owner;

--
-- Name: delivery_drivers; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.delivery_drivers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(50) NOT NULL,
    whatsapp_number character varying(50),
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    vehicle_type character varying(50),
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT delivery_drivers_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying, 'ON_DELIVERY'::character varying])::text[])))
);


ALTER TABLE public.delivery_drivers OWNER TO neondb_owner;

--
-- Name: delivery_eta_config; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.delivery_eta_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    area_name character varying(100) NOT NULL,
    avg_delivery_hours numeric(5,1) DEFAULT 24 NOT NULL,
    sample_count integer DEFAULT 0,
    last_updated timestamp with time zone DEFAULT now()
);


ALTER TABLE public.delivery_eta_config OWNER TO neondb_owner;

--
-- Name: delivery_execution_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.delivery_execution_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    order_id uuid NOT NULL,
    shipment_id character varying(255),
    event_type character varying(64) NOT NULL,
    source character varying(32) DEFAULT 'system'::character varying NOT NULL,
    status character varying(32) DEFAULT 'RECORDED'::character varying NOT NULL,
    event_time timestamp with time zone DEFAULT now() NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    correlation_id character varying(128),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.delivery_execution_events OWNER TO neondb_owner;

--
-- Name: delivery_location_timeline; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.delivery_location_timeline (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    order_id uuid NOT NULL,
    shipment_id character varying(255),
    latitude numeric(10,7) NOT NULL,
    longitude numeric(10,7) NOT NULL,
    accuracy_meters numeric(10,2),
    speed_kmh numeric(10,2),
    heading_deg numeric(10,2),
    source character varying(32) DEFAULT 'driver_app'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.delivery_location_timeline OWNER TO neondb_owner;

--
-- Name: delivery_outcomes; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.delivery_outcomes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    order_id uuid NOT NULL,
    customer_id character varying(100) NOT NULL,
    outcome character varying(30) NOT NULL,
    notes text,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    recorded_by character varying(100)
);


ALTER TABLE public.delivery_outcomes OWNER TO neondb_owner;

--
-- Name: TABLE delivery_outcomes; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.delivery_outcomes IS 'Tracks delivery success/failure for risk scoring';


--
-- Name: delivery_pod_records; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.delivery_pod_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    order_id uuid NOT NULL,
    shipment_id character varying(255),
    proof_type character varying(32) DEFAULT 'note'::character varying NOT NULL,
    proof_url text,
    proof_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    captured_by character varying(64),
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    dispute_status character varying(20) DEFAULT 'NONE'::character varying NOT NULL,
    disputed_at timestamp with time zone,
    dispute_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.delivery_pod_records OWNER TO neondb_owner;

--
-- Name: delivery_sla_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.delivery_sla_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    order_id uuid NOT NULL,
    shipment_id character varying(255),
    sla_type character varying(32) NOT NULL,
    status character varying(16) NOT NULL,
    target_at timestamp with time zone,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    minutes_delta integer,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT delivery_sla_events_status_check CHECK (((status)::text = ANY ((ARRAY['OK'::character varying, 'AT_RISK'::character varying, 'BREACHED'::character varying])::text[])))
);


ALTER TABLE public.delivery_sla_events OWNER TO neondb_owner;

--
-- Name: demand_forecast_history; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.demand_forecast_history (
    merchant_id character varying NOT NULL,
    product_id uuid NOT NULL,
    sales_date date NOT NULL,
    units_sold integer DEFAULT 0 NOT NULL,
    units_returned integer DEFAULT 0 NOT NULL,
    net_units integer GENERATED ALWAYS AS ((units_sold - units_returned)) STORED,
    stockout_day boolean DEFAULT false NOT NULL,
    promo_active boolean DEFAULT false NOT NULL,
    price_on_day numeric(12,2)
);


ALTER TABLE public.demand_forecast_history OWNER TO neondb_owner;

--
-- Name: demand_forecasts; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.demand_forecasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    current_stock integer DEFAULT 0 NOT NULL,
    avg_daily_orders numeric(10,2) DEFAULT 0 NOT NULL,
    days_until_stockout numeric(10,1),
    trend_pct numeric(8,2),
    forecast_7d integer,
    forecast_30d integer,
    reorder_suggestion integer,
    urgency text DEFAULT 'low'::text NOT NULL,
    ai_summary_ar text,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    forecast_14d integer,
    lower_bound_7d integer,
    upper_bound_7d integer,
    lower_bound_30d integer,
    upper_bound_30d integer,
    reorder_point integer,
    safety_stock integer,
    lead_time_days integer DEFAULT 3,
    est_stockout_date date,
    mape_7d numeric(8,4),
    model_version text DEFAULT '1.0'::text,
    reason_codes jsonb DEFAULT '[]'::jsonb
);


ALTER TABLE public.demand_forecasts OWNER TO neondb_owner;

--
-- Name: dlq_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.dlq_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    original_event_id uuid,
    event_type character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    error text NOT NULL,
    stack text,
    correlation_id character varying(100),
    merchant_id character varying(50),
    status public.dlq_status DEFAULT 'PENDING'::public.dlq_status NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    max_retries integer DEFAULT 5 NOT NULL,
    next_retry_at timestamp with time zone,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dlq_events OWNER TO neondb_owner;

--
-- Name: entitlement_changes; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.entitlement_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    change_type character varying(20) NOT NULL,
    entity_type character varying(20) NOT NULL,
    entity_name character varying(50) NOT NULL,
    previous_value boolean,
    new_value boolean,
    changed_by character varying(100),
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.entitlement_changes OWNER TO neondb_owner;

--
-- Name: TABLE entitlement_changes; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.entitlement_changes IS 'Audit log for agent and feature entitlement changes per merchant.';


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.expenses (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    category character varying(50) NOT NULL,
    description text,
    amount numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'EGP'::character varying,
    frequency character varying(20) DEFAULT 'one_time'::character varying,
    expense_date date DEFAULT CURRENT_DATE NOT NULL,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    subcategory character varying(50),
    is_recurring boolean DEFAULT false,
    recurring_day integer,
    receipt_url text,
    approved_by character varying(100),
    approved_at timestamp with time zone,
    date date,
    status character varying(20) DEFAULT 'APPROVED'::character varying,
    branch_id uuid
);


ALTER TABLE public.expenses OWNER TO neondb_owner;

--
-- Name: TABLE expenses; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.expenses IS 'Merchant expense tracking for finance management';


--
-- Name: expiry_alerts; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.expiry_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    item_id uuid NOT NULL,
    variant_id uuid,
    expiry_date date NOT NULL,
    alert_type character varying(20) DEFAULT 'WARNING'::character varying NOT NULL,
    days_until_expiry integer NOT NULL,
    quantity_at_risk integer DEFAULT 0,
    action_taken character varying(50),
    acknowledged boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.expiry_alerts OWNER TO neondb_owner;

--
-- Name: feature_requests; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.feature_requests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(100) NOT NULL,
    staff_id uuid,
    title character varying(255) NOT NULL,
    description text,
    category public.feature_request_category DEFAULT 'FEATURE'::public.feature_request_category NOT NULL,
    status public.feature_request_status DEFAULT 'NEW'::public.feature_request_status NOT NULL,
    priority character varying(10) DEFAULT 'MEDIUM'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT feature_requests_priority_check CHECK (((priority)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying, 'URGENT'::character varying])::text[])))
);


ALTER TABLE public.feature_requests OWNER TO neondb_owner;

--
-- Name: finance_insights; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.finance_insights (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    insight_type character varying(50) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    title_ar text NOT NULL,
    title_en text,
    body_ar text NOT NULL,
    body_en text,
    actions jsonb DEFAULT '[]'::jsonb,
    severity character varying(20) DEFAULT 'info'::character varying,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.finance_insights OWNER TO neondb_owner;

--
-- Name: TABLE finance_insights; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.finance_insights IS 'AI-generated financial insights and recommendations';


--
-- Name: finance_snapshots; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.finance_snapshots (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    snapshot_date date NOT NULL,
    total_revenue numeric(12,2) DEFAULT 0,
    total_cogs numeric(12,2) DEFAULT 0,
    gross_profit numeric(12,2) DEFAULT 0,
    total_expenses numeric(12,2) DEFAULT 0,
    net_profit numeric(12,2) DEFAULT 0,
    orders_count integer DEFAULT 0,
    avg_order_value numeric(10,2) DEFAULT 0,
    cod_expected numeric(12,2) DEFAULT 0,
    cod_collected numeric(12,2) DEFAULT 0,
    delivery_fees_collected numeric(10,2) DEFAULT 0,
    refunds_total numeric(10,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid
);


ALTER TABLE public.finance_snapshots OWNER TO neondb_owner;

--
-- Name: TABLE finance_snapshots; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.finance_snapshots IS 'Daily financial aggregates for reporting';


--
-- Name: followups; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.followups (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    conversation_id character varying(100),
    order_id uuid,
    customer_id uuid,
    type public.followup_type NOT NULL,
    status public.followup_status DEFAULT 'PENDING'::public.followup_status NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    sent_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    message_template text,
    custom_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.followups OWNER TO neondb_owner;

--
-- Name: forecast_model_metrics; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.forecast_model_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying NOT NULL,
    forecast_type text NOT NULL,
    entity_id text,
    model_version text DEFAULT '1.0'::text NOT NULL,
    mape numeric(8,4),
    wmape numeric(8,4),
    bias numeric(8,4),
    mae numeric(14,4),
    sample_size integer,
    evaluation_window text DEFAULT '30d'::text NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.forecast_model_metrics OWNER TO neondb_owner;

--
-- Name: forecast_predictions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.forecast_predictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying NOT NULL,
    forecast_type text NOT NULL,
    entity_id text NOT NULL,
    entity_name text,
    horizon_days integer DEFAULT 7 NOT NULL,
    predicted_value numeric(14,4) NOT NULL,
    lower_bound numeric(14,4),
    upper_bound numeric(14,4),
    confidence_score numeric(5,4),
    trend_direction text,
    reason_codes jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.forecast_predictions OWNER TO neondb_owner;

--
-- Name: forecast_runs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.forecast_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying NOT NULL,
    forecast_type text NOT NULL,
    status text DEFAULT 'ok'::text NOT NULL,
    items_computed integer DEFAULT 0 NOT NULL,
    duration_ms integer,
    error_message text,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.forecast_runs OWNER TO neondb_owner;

--
-- Name: gift_card_transactions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.gift_card_transactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    gift_card_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    amount numeric(10,2) NOT NULL,
    balance_after numeric(10,2) NOT NULL,
    order_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.gift_card_transactions OWNER TO neondb_owner;

--
-- Name: gift_cards; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.gift_cards (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(255) NOT NULL,
    code character varying(20) NOT NULL,
    initial_balance numeric(10,2) NOT NULL,
    current_balance numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'EGP'::character varying,
    purchaser_customer_id uuid,
    recipient_email character varying(255),
    recipient_name character varying(255),
    message text,
    is_active boolean DEFAULT true,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.gift_cards OWNER TO neondb_owner;

--
-- Name: TABLE gift_cards; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.gift_cards IS 'Store gift cards with balances';


--
-- Name: idempotency_records; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.idempotency_records (
    key character varying(512) NOT NULL,
    merchant_id uuid,
    response_body jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL
);


ALTER TABLE public.idempotency_records OWNER TO neondb_owner;

--
-- Name: inbound_webhook_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.inbound_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider character varying(50) NOT NULL,
    message_id character varying(512) NOT NULL,
    merchant_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.inbound_webhook_events OWNER TO neondb_owner;

--
-- Name: integration_endpoints; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.integration_endpoints (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    provider character varying(100) NOT NULL,
    type character varying(50) DEFAULT 'INBOUND_WEBHOOK'::character varying NOT NULL,
    secret character varying(255) NOT NULL,
    status public.integration_status DEFAULT 'ACTIVE'::public.integration_status NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_event_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.integration_endpoints OWNER TO neondb_owner;

--
-- Name: integration_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.integration_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    endpoint_id uuid NOT NULL,
    merchant_id character varying(50) NOT NULL,
    event_type character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    status character varying(20) DEFAULT 'RECEIVED'::character varying NOT NULL,
    error text,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.integration_events OWNER TO neondb_owner;

--
-- Name: inventory_alerts; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.inventory_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(255) NOT NULL,
    variant_id uuid,
    alert_type character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'active'::character varying,
    severity character varying(20) DEFAULT 'warning'::character varying,
    message text NOT NULL,
    quantity_at_alert integer,
    threshold integer,
    acknowledged_at timestamp without time zone,
    acknowledged_by character varying(255),
    resolved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.inventory_alerts OWNER TO neondb_owner;

--
-- Name: inventory_cost_layers; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.inventory_cost_layers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    item_id uuid NOT NULL,
    variant_id uuid,
    lot_id uuid,
    quantity_remaining integer NOT NULL,
    unit_cost numeric(12,2) NOT NULL,
    received_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.inventory_cost_layers OWNER TO neondb_owner;

--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.inventory_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(255) NOT NULL,
    catalog_item_id uuid,
    sku character varying(100) NOT NULL,
    barcode character varying(100),
    track_inventory boolean DEFAULT true,
    allow_backorder boolean DEFAULT false,
    low_stock_threshold integer DEFAULT 5,
    reorder_point integer DEFAULT 10,
    reorder_quantity integer DEFAULT 20,
    location character varying(255),
    weight_grams integer,
    dimensions jsonb DEFAULT '{}'::jsonb,
    cost_price numeric(12,2),
    supplier_id character varying(255),
    supplier_sku character varying(100),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    name character varying(255),
    description text,
    price numeric(12,2),
    category character varying(100),
    last_sold_at timestamp with time zone,
    days_without_sale integer DEFAULT 0,
    is_dead_stock boolean DEFAULT false,
    suggested_promo jsonb
);


ALTER TABLE public.inventory_items OWNER TO neondb_owner;

--
-- Name: inventory_lots; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.inventory_lots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    item_id uuid NOT NULL,
    variant_id uuid,
    lot_number character varying(100) NOT NULL,
    batch_id character varying(100),
    quantity integer DEFAULT 0 NOT NULL,
    cost_price numeric(12,2),
    received_date date DEFAULT CURRENT_DATE,
    expiry_date date,
    supplier_id uuid,
    notes text,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.inventory_lots OWNER TO neondb_owner;

--
-- Name: inventory_movements; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.inventory_movements (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    product_id character varying(100) NOT NULL,
    sku character varying(100),
    movement_type character varying(30) NOT NULL,
    quantity integer NOT NULL,
    previous_quantity integer,
    new_quantity integer,
    reason text,
    reference_id character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.inventory_movements OWNER TO neondb_owner;

--
-- Name: TABLE inventory_movements; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.inventory_movements IS 'Detailed inventory movement history for analytics';


--
-- Name: inventory_stock_by_location; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.inventory_stock_by_location (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(255) NOT NULL,
    variant_id uuid NOT NULL,
    location_id uuid NOT NULL,
    quantity_on_hand integer DEFAULT 0,
    quantity_reserved integer DEFAULT 0,
    quantity_available integer GENERATED ALWAYS AS ((quantity_on_hand - quantity_reserved)) STORED,
    bin_location character varying(100),
    last_counted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.inventory_stock_by_location OWNER TO neondb_owner;

--
-- Name: inventory_top_movers; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.inventory_top_movers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    period character varying(20) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    top_sellers jsonb DEFAULT '[]'::jsonb,
    slow_movers jsonb DEFAULT '[]'::jsonb,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.inventory_top_movers OWNER TO neondb_owner;

--
-- Name: TABLE inventory_top_movers; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.inventory_top_movers IS 'Cached top sellers and slow movers reports';


--
-- Name: inventory_variants; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.inventory_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inventory_item_id uuid NOT NULL,
    merchant_id character varying(255) NOT NULL,
    sku character varying(100) NOT NULL,
    barcode character varying(100),
    name character varying(255) NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb,
    quantity_on_hand integer DEFAULT 0,
    quantity_reserved integer DEFAULT 0,
    quantity_available integer GENERATED ALWAYS AS ((quantity_on_hand - quantity_reserved)) STORED,
    low_stock_threshold integer,
    cost_price numeric(12,2),
    price_modifier numeric(12,2) DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.inventory_variants OWNER TO neondb_owner;

--
-- Name: item_recipes; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.item_recipes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(255) NOT NULL,
    catalog_item_id uuid NOT NULL,
    ingredient_inventory_item_id uuid,
    ingredient_catalog_item_id uuid,
    ingredient_name character varying(255) NOT NULL,
    quantity_required numeric(10,3) DEFAULT 1 NOT NULL,
    unit character varying(50) DEFAULT 'piece'::character varying NOT NULL,
    is_optional boolean DEFAULT false NOT NULL,
    waste_factor numeric(5,3) DEFAULT 1.0,
    notes text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT item_recipes_check CHECK (((ingredient_inventory_item_id IS NOT NULL) OR (ingredient_catalog_item_id IS NOT NULL)))
);


ALTER TABLE public.item_recipes OWNER TO neondb_owner;

--
-- Name: job_failure_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.job_failure_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_name character varying(100) NOT NULL,
    error_message text,
    error_stack text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.job_failure_events OWNER TO neondb_owner;

--
-- Name: kb_embedding_jobs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.kb_embedding_jobs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    chunk_id uuid NOT NULL,
    merchant_id character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);


ALTER TABLE public.kb_embedding_jobs OWNER TO neondb_owner;

--
-- Name: known_areas; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.known_areas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    city character varying(100) NOT NULL,
    area_name_ar character varying(255) NOT NULL,
    area_name_en character varying(255),
    area_aliases text[] DEFAULT '{}'::text[] NOT NULL,
    delivery_zone character varying(50),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.known_areas OWNER TO neondb_owner;

--
-- Name: loyalty_tiers; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.loyalty_tiers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(255) NOT NULL,
    name character varying(100) NOT NULL,
    name_ar character varying(100) NOT NULL,
    min_points integer DEFAULT 0 NOT NULL,
    discount_percentage numeric(5,2) DEFAULT 0,
    free_shipping boolean DEFAULT false,
    priority_support boolean DEFAULT false,
    exclusive_access boolean DEFAULT false,
    multiplier numeric(3,2) DEFAULT 1.0,
    color character varying(7) DEFAULT '#6B7280'::character varying,
    icon character varying(50) DEFAULT 'star'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.loyalty_tiers OWNER TO neondb_owner;

--
-- Name: TABLE loyalty_tiers; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.loyalty_tiers IS 'Loyalty program tiers with benefits';


--
-- Name: loyalty_analytics; Type: VIEW; Schema: public; Owner: neondb_owner
--

CREATE VIEW public.loyalty_analytics AS
 SELECT cp.merchant_id,
    count(*) AS total_members,
    count(*) FILTER (WHERE (cp.current_points > 0)) AS active_members,
    sum(cp.current_points) AS total_outstanding_points,
    sum(cp.lifetime_points) AS total_earned_points,
    avg(cp.lifetime_points) AS avg_lifetime_points,
    lt.name AS tier_name,
    count(*) FILTER (WHERE (lt.id IS NOT NULL)) AS tier_count
   FROM (public.customer_points cp
     LEFT JOIN public.loyalty_tiers lt ON ((cp.tier_id = lt.id)))
  GROUP BY cp.merchant_id, lt.name, lt.id;


ALTER VIEW public.loyalty_analytics OWNER TO neondb_owner;

--
-- Name: margin_alerts; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.margin_alerts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    alert_type character varying(50) NOT NULL,
    threshold_value numeric(10,2),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.margin_alerts OWNER TO neondb_owner;

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
-- Name: merchant_agent_subscriptions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_agent_subscriptions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    agent_name character varying(100) NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    plan_tier character varying(50) DEFAULT 'basic'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_type character varying(50),
    is_enabled boolean DEFAULT false,
    config jsonb DEFAULT '{}'::jsonb,
    enabled_at timestamp with time zone,
    disabled_at timestamp with time zone
);


ALTER TABLE public.merchant_agent_subscriptions OWNER TO neondb_owner;

--
-- Name: merchant_agent_subscriptions_bak_20260419_hotfix; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_agent_subscriptions_bak_20260419_hotfix (
    id uuid,
    merchant_id character varying(50),
    agent_name character varying(100),
    enabled boolean,
    settings jsonb,
    plan_tier character varying(50),
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE public.merchant_agent_subscriptions_bak_20260419_hotfix OWNER TO neondb_owner;

--
-- Name: merchant_api_keys; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_api_keys (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    key_hash character varying(255) NOT NULL,
    key_prefix character varying(10) NOT NULL,
    name character varying(100),
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.merchant_api_keys OWNER TO neondb_owner;

--
-- Name: merchant_automations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_automations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    automation_type character varying(60) NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_run_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    check_interval_hours integer DEFAULT 24 NOT NULL,
    last_checked_at timestamp with time zone
);


ALTER TABLE public.merchant_automations OWNER TO neondb_owner;

--
-- Name: merchant_branches; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_branches (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    name_en character varying(255),
    city character varying(100),
    address text,
    phone character varying(50),
    manager_name character varying(255),
    is_active boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    whatsapp_number character varying(50),
    description text,
    opening_hours jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public.merchant_branches OWNER TO neondb_owner;

--
-- Name: merchant_business_rules; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_business_rules (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    rule_type character varying(50) NOT NULL,
    rule_name character varying(200) NOT NULL,
    rule_description text,
    condition text,
    action text,
    confidence_required character varying(20) DEFAULT 'high'::character varying NOT NULL,
    human_review_required boolean DEFAULT false NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.merchant_business_rules OWNER TO neondb_owner;

--
-- Name: merchant_command_channels; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_command_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    phone_number character varying(20) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    verified_at timestamp with time zone
);


ALTER TABLE public.merchant_command_channels OWNER TO neondb_owner;

--
-- Name: TABLE merchant_command_channels; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.merchant_command_channels IS 'WhatsApp numbers mapped for merchant command channel';


--
-- Name: merchant_deletion_requests; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_deletion_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    requested_by_staff_id uuid NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    scheduled_for timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    processed_at timestamp with time zone,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    cancellation_reason text,
    CONSTRAINT merchant_deletion_requests_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'CANCELLED'::character varying, 'COMPLETED'::character varying])::text[])))
);


ALTER TABLE public.merchant_deletion_requests OWNER TO neondb_owner;

--
-- Name: merchant_kb_chunks; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_kb_chunks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    source_type character varying(30) NOT NULL,
    source_id character varying(100),
    business_type character varying(50),
    module character varying(50),
    category character varying(100),
    locale character varying(10) DEFAULT 'ar'::character varying NOT NULL,
    visibility character varying(20) DEFAULT 'public'::character varying NOT NULL,
    confidence_level character varying(20) DEFAULT 'high'::character varying NOT NULL,
    requires_manual_review boolean DEFAULT false NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    content text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    embedding public.vector(1536),
    is_active boolean DEFAULT true NOT NULL,
    last_updated timestamp with time zone DEFAULT now() NOT NULL,
    source_reference text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.merchant_kb_chunks OWNER TO neondb_owner;

--
-- Name: merchant_notifications; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.merchant_notifications OWNER TO neondb_owner;

--
-- Name: merchant_org_policy_bindings; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_org_policy_bindings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    unit_id uuid NOT NULL,
    policy_key character varying(100) NOT NULL,
    policy_value jsonb DEFAULT '{}'::jsonb NOT NULL,
    inheritance_mode character varying(20) DEFAULT 'OVERRIDE'::character varying NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merchant_org_policy_bindings_inheritance_mode_check CHECK (((inheritance_mode)::text = ANY ((ARRAY['MERGE'::character varying, 'OVERRIDE'::character varying, 'LOCKED'::character varying])::text[])))
);


ALTER TABLE public.merchant_org_policy_bindings OWNER TO neondb_owner;

--
-- Name: merchant_org_staff_scopes; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_org_staff_scopes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    unit_id uuid NOT NULL,
    staff_id character varying(64) NOT NULL,
    role_scope character varying(20) DEFAULT 'MEMBER'::character varying NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merchant_org_staff_scopes_role_scope_check CHECK (((role_scope)::text = ANY ((ARRAY['OWNER'::character varying, 'ADMIN'::character varying, 'MANAGER'::character varying, 'ANALYST'::character varying, 'MEMBER'::character varying])::text[]))),
    CONSTRAINT merchant_org_staff_scopes_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])))
);


ALTER TABLE public.merchant_org_staff_scopes OWNER TO neondb_owner;

--
-- Name: merchant_org_units; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_org_units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    parent_id uuid,
    unit_type character varying(16) NOT NULL,
    name character varying(255) NOT NULL,
    code character varying(64) NOT NULL,
    branch_id character varying(64),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merchant_org_units_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[]))),
    CONSTRAINT merchant_org_units_unit_type_check CHECK (((unit_type)::text = ANY ((ARRAY['HQ'::character varying, 'BRAND'::character varying, 'REGION'::character varying, 'BRANCH'::character varying])::text[])))
);


ALTER TABLE public.merchant_org_units OWNER TO neondb_owner;

--
-- Name: merchant_phone_numbers; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_phone_numbers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    phone_number character varying(50) NOT NULL,
    whatsapp_number character varying(50) NOT NULL,
    provider character varying(50) DEFAULT 'meta'::character varying NOT NULL,
    display_name character varying(255),
    is_active boolean DEFAULT true NOT NULL,
    is_sandbox boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.merchant_phone_numbers OWNER TO neondb_owner;

--
-- Name: TABLE merchant_phone_numbers; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.merchant_phone_numbers IS 'Maps WhatsApp phone numbers to merchants for inbound routing';


--
-- Name: COLUMN merchant_phone_numbers.whatsapp_number; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.merchant_phone_numbers.whatsapp_number IS 'E.164 phone number: +201234567890 (Meta Cloud API format)';


--
-- Name: COLUMN merchant_phone_numbers.is_sandbox; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.merchant_phone_numbers.is_sandbox IS 'True when using Meta test number for testing';


--
-- Name: merchant_reports; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_reports (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    report_date date NOT NULL,
    summary jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    period_type character varying(20) DEFAULT 'daily'::character varying NOT NULL,
    period_start date,
    period_end date
);


ALTER TABLE public.merchant_reports OWNER TO neondb_owner;

--
-- Name: merchant_sales_playbooks; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_sales_playbooks (
    merchant_id character varying(50) NOT NULL,
    slot_graph jsonb DEFAULT '[]'::jsonb NOT NULL,
    constraint_dims jsonb DEFAULT '[]'::jsonb NOT NULL,
    next_question_templates jsonb DEFAULT '{}'::jsonb NOT NULL,
    intent_examples jsonb DEFAULT '{}'::jsonb NOT NULL,
    slot_extractors jsonb DEFAULT '{}'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.merchant_sales_playbooks OWNER TO neondb_owner;

--
-- Name: merchant_staff; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_staff (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    email character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    password_hash character varying(255),
    role public.staff_role DEFAULT 'AGENT'::public.staff_role NOT NULL,
    status public.staff_status DEFAULT 'PENDING_INVITE'::public.staff_status NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    invite_token character varying(255),
    invite_expires_at timestamp with time zone,
    last_login_at timestamp with time zone,
    last_activity_at timestamp with time zone,
    mfa_enabled boolean DEFAULT false NOT NULL,
    mfa_secret character varying(255),
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL,
    temp_password_set_at timestamp with time zone,
    custom_permissions jsonb
);


ALTER TABLE public.merchant_staff OWNER TO neondb_owner;

--
-- Name: merchant_subscriptions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_subscriptions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(100) NOT NULL,
    plan_id uuid NOT NULL,
    status public.subscription_status DEFAULT 'PENDING'::public.subscription_status NOT NULL,
    provider character varying(50) DEFAULT 'manual'::character varying,
    provider_subscription_id character varying(255),
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.merchant_subscriptions OWNER TO neondb_owner;

--
-- Name: merchant_tax_config; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_tax_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    vat_rate numeric(5,2) DEFAULT 14.00,
    vat_registration_number character varying(50),
    tax_enabled boolean DEFAULT false,
    include_vat_in_price boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.merchant_tax_config OWNER TO neondb_owner;

--
-- Name: merchant_token_usage; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchant_token_usage (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    usage_date date NOT NULL,
    tokens_used integer DEFAULT 0 NOT NULL,
    llm_calls integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.merchant_token_usage OWNER TO neondb_owner;

--
-- Name: merchants; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.merchants (
    id character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    category public.merchant_category DEFAULT 'GENERIC'::public.merchant_category NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    branding jsonb DEFAULT '{}'::jsonb NOT NULL,
    negotiation_rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    delivery_rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    daily_token_budget integer DEFAULT 100000 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    api_key character varying(64),
    trade_name character varying(255),
    city character varying(100) DEFAULT 'cairo'::character varying,
    currency character varying(10) DEFAULT 'EGP'::character varying,
    language character varying(10) DEFAULT 'ar-EG'::character varying,
    default_delivery_fee numeric(10,2) DEFAULT 30,
    auto_book_delivery boolean DEFAULT false,
    enable_followups boolean DEFAULT true,
    greeting_template text,
    working_hours jsonb DEFAULT '{}'::jsonb,
    timezone character varying(50) DEFAULT 'Africa/Cairo'::character varying,
    auto_response_enabled boolean DEFAULT true,
    followup_delay_minutes integer DEFAULT 60,
    payment_reminders_enabled boolean DEFAULT true,
    low_stock_alerts_enabled boolean DEFAULT true,
    whatsapp_reports_enabled boolean DEFAULT false NOT NULL,
    report_periods_enabled text[] DEFAULT ARRAY['daily'::text] NOT NULL,
    notification_phone character varying(50),
    inventory_agent_enabled boolean DEFAULT false,
    inventory_config jsonb DEFAULT '{}'::jsonb,
    enabled_agents text[] DEFAULT ARRAY['OPS_AGENT'::text],
    enabled_features text[] DEFAULT ARRAY['CONVERSATIONS'::text, 'ORDERS'::text, 'CATALOG'::text],
    knowledge_base jsonb DEFAULT '{}'::jsonb,
    auto_payment_link_on_confirm boolean DEFAULT false,
    require_customer_contact_for_payment_link boolean DEFAULT true,
    payment_link_channel character varying(20) DEFAULT 'WHATSAPP'::character varying,
    payout_instapay_alias character varying(100),
    payout_vodafone_cash character varying(20),
    payout_bank_name character varying(100),
    payout_bank_account character varying(50),
    payout_bank_iban character varying(50),
    payout_preferred_method character varying(30) DEFAULT 'INSTAPAY'::character varying,
    payout_bank_account_holder character varying(200),
    plan character varying(50) DEFAULT 'STARTER'::character varying,
    plan_limits jsonb DEFAULT '{}'::jsonb,
    custom_price integer,
    auto_assign_delivery boolean DEFAULT false,
    delivery_assignment_mode character varying(20) DEFAULT 'round_robin'::character varying,
    notify_customer_on_assign boolean DEFAULT true,
    limits jsonb DEFAULT '{}'::jsonb,
    notification_email character varying(255),
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    CONSTRAINT merchants_plan_canonical CHECK (((plan)::text = ANY ((ARRAY['TRIAL'::character varying, 'STARTER'::character varying, 'CHAT_ONLY'::character varying, 'BASIC'::character varying, 'GROWTH'::character varying, 'PRO'::character varying, 'ENTERPRISE'::character varying, 'CUSTOM'::character varying])::text[])))
);


ALTER TABLE public.merchants OWNER TO neondb_owner;

--
-- Name: COLUMN merchants.enabled_agents; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.merchants.enabled_agents IS 'Array of agent types enabled for this merchant. Orchestrator will skip tasks for disabled agents.';


--
-- Name: COLUMN merchants.enabled_features; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.merchants.enabled_features IS 'Array of feature types enabled for this merchant. Controllers check this for feature-gating.';


--
-- Name: COLUMN merchants.knowledge_base; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.merchants.knowledge_base IS 'Knowledge base data used by AI agents (FAQs, business info, policies).';


--
-- Name: COLUMN merchants.payout_instapay_alias; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.merchants.payout_instapay_alias IS 'InstaPay alias for receiving payments';


--
-- Name: COLUMN merchants.payout_vodafone_cash; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.merchants.payout_vodafone_cash IS 'Vodafone Cash phone number for receiving payments';


--
-- Name: COLUMN merchants.payout_bank_name; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.merchants.payout_bank_name IS 'Bank name for bank transfer payouts';


--
-- Name: COLUMN merchants.payout_bank_account; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.merchants.payout_bank_account IS 'Bank account number';


--
-- Name: COLUMN merchants.payout_bank_iban; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.merchants.payout_bank_iban IS 'IBAN for international transfers';


--
-- Name: COLUMN merchants.payout_preferred_method; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.merchants.payout_preferred_method IS 'Preferred payout method: INSTAPAY, VODAFONE_CASH, BANK_TRANSFER';


--
-- Name: COLUMN merchants.payout_bank_account_holder; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.merchants.payout_bank_account_holder IS 'Bank account holder name';


--
-- Name: message_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.message_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    message_id uuid NOT NULL,
    merchant_id character varying(50) NOT NULL,
    event_type character varying(50) NOT NULL,
    provider character varying(50),
    provider_message_id character varying(255),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.message_events OWNER TO neondb_owner;

--
-- Name: messages; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    conversation_id character varying(100) NOT NULL,
    merchant_id character varying(50) NOT NULL,
    provider_message_id character varying(255),
    direction character varying(10) NOT NULL,
    sender_id character varying(255) NOT NULL,
    text text,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    delivery_status public.message_delivery_status DEFAULT 'PENDING'::public.message_delivery_status NOT NULL,
    delivery_status_updated_at timestamp with time zone,
    llm_used boolean DEFAULT false NOT NULL,
    tokens_used integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status public.message_status DEFAULT 'QUEUED'::public.message_status,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    failed_at timestamp with time zone,
    read_at timestamp with time zone,
    retry_count integer DEFAULT 0,
    error text,
    max_retries integer DEFAULT 3 NOT NULL,
    next_retry_at timestamp with time zone,
    last_error text,
    provider_message_id_outbound character varying(255),
    channel character varying(20) DEFAULT 'whatsapp'::character varying,
    CONSTRAINT messages_direction_check CHECK (((direction)::text = ANY ((ARRAY['inbound'::character varying, 'outbound'::character varying])::text[])))
);


ALTER TABLE public.messages OWNER TO neondb_owner;

--
-- Name: migrations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.migrations OWNER TO neondb_owner;

--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.migrations_id_seq OWNER TO neondb_owner;

--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: monthly_close_governance_ledger; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.monthly_close_governance_ledger (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    close_id uuid,
    packet_id uuid,
    year integer NOT NULL,
    month integer NOT NULL,
    action_type character varying(24) NOT NULL,
    snapshot_hash character varying(64),
    confidence_score integer DEFAULT 0 NOT NULL,
    blockers jsonb DEFAULT '[]'::jsonb NOT NULL,
    requires_approval boolean DEFAULT false NOT NULL,
    approval_granted boolean DEFAULT false NOT NULL,
    approval_actor character varying(100),
    approval_reason text,
    acted_by character varying(100),
    acted_role character varying(30),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT monthly_close_governance_ledger_action_type_check CHECK (((action_type)::text = ANY ((ARRAY['PACKET_GENERATED'::character varying, 'CLOSE'::character varying, 'REOPEN'::character varying, 'LOCK'::character varying])::text[])))
);


ALTER TABLE public.monthly_close_governance_ledger OWNER TO neondb_owner;

--
-- Name: monthly_close_packets; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.monthly_close_packets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    snapshot_hash character varying(64) NOT NULL,
    confidence_score integer DEFAULT 0 NOT NULL,
    requires_approval boolean DEFAULT false NOT NULL,
    blockers jsonb DEFAULT '[]'::jsonb NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    generated_by character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.monthly_close_packets OWNER TO neondb_owner;

--
-- Name: monthly_closes; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.monthly_closes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    total_revenue numeric(12,2) DEFAULT 0,
    total_orders integer DEFAULT 0,
    completed_orders integer DEFAULT 0,
    cancelled_orders integer DEFAULT 0,
    total_cogs numeric(12,2) DEFAULT 0,
    gross_profit numeric(12,2) DEFAULT 0,
    gross_margin_pct numeric(5,2) DEFAULT 0,
    expenses_breakdown jsonb DEFAULT '{}'::jsonb,
    total_expenses numeric(12,2) DEFAULT 0,
    net_profit numeric(12,2) DEFAULT 0,
    net_margin_pct numeric(5,2) DEFAULT 0,
    cod_expected numeric(12,2) DEFAULT 0,
    cod_collected numeric(12,2) DEFAULT 0,
    cod_outstanding numeric(12,2) DEFAULT 0,
    total_refunds numeric(10,2) DEFAULT 0,
    refund_count integer DEFAULT 0,
    status character varying(20) DEFAULT 'open'::character varying,
    closed_at timestamp with time zone,
    closed_by character varying(100),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.monthly_closes OWNER TO neondb_owner;

--
-- Name: TABLE monthly_closes; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.monthly_closes IS 'Monthly financial close records';


--
-- Name: notification_delivery_log; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.notification_delivery_log (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    notification_id uuid NOT NULL,
    channel character varying(20) NOT NULL,
    status character varying(20) NOT NULL,
    error_message text,
    external_id character varying(255),
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notification_delivery_log_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'SENT'::character varying, 'DELIVERED'::character varying, 'FAILED'::character varying, 'BOUNCED'::character varying])::text[])))
);


ALTER TABLE public.notification_delivery_log OWNER TO neondb_owner;

--
-- Name: TABLE notification_delivery_log; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.notification_delivery_log IS 'Audit trail for notification delivery attempts';


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(100) NOT NULL,
    staff_id uuid,
    email_enabled boolean DEFAULT true,
    push_enabled boolean DEFAULT true,
    whatsapp_enabled boolean DEFAULT false,
    quiet_hours_start character varying(5),
    quiet_hours_end character varying(5),
    enabled_types text[] DEFAULT ARRAY['ORDER_PLACED'::text, 'ORDER_CONFIRMED'::text, 'ORDER_SHIPPED'::text, 'ORDER_DELIVERED'::text, 'LOW_STOCK'::text, 'ESCALATED_CONVERSATION'::text, 'PAYMENT_RECEIVED'::text, 'DAILY_SUMMARY'::text, 'SECURITY_ALERT'::text],
    email_address character varying(255),
    whatsapp_number character varying(20),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.notification_preferences OWNER TO neondb_owner;

--
-- Name: TABLE notification_preferences; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.notification_preferences IS 'Per-user notification preferences and settings';


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
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.notification_templates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(100),
    name character varying(100) NOT NULL,
    type character varying(50) NOT NULL,
    title_template character varying(255) NOT NULL,
    title_ar_template character varying(255) NOT NULL,
    message_template text NOT NULL,
    message_ar_template text NOT NULL,
    default_priority character varying(20) DEFAULT 'MEDIUM'::character varying,
    default_channels text[] DEFAULT ARRAY['IN_APP'::text],
    is_active boolean DEFAULT true,
    is_system boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.notification_templates OWNER TO neondb_owner;

--
-- Name: TABLE notification_templates; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.notification_templates IS 'Customizable notification templates with variable support';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(100) NOT NULL,
    staff_id uuid,
    type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    title_ar character varying(255) NOT NULL,
    message text NOT NULL,
    message_ar text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb,
    priority character varying(20) DEFAULT 'MEDIUM'::character varying,
    channels text[] DEFAULT ARRAY['IN_APP'::text],
    is_read boolean DEFAULT false,
    read_at timestamp with time zone,
    action_url character varying(500),
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notifications_priority_check CHECK (((priority)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying, 'URGENT'::character varying])::text[])))
);


ALTER TABLE public.notifications OWNER TO neondb_owner;

--
-- Name: TABLE notifications; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.notifications IS 'Multi-channel notification system for merchants and staff';


--
-- Name: objection_templates; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.objection_templates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    objection_type character varying(50) NOT NULL,
    keywords text[] DEFAULT '{}'::text[] NOT NULL,
    response_template_ar text NOT NULL,
    response_template_en text,
    is_active boolean DEFAULT true,
    usage_count integer DEFAULT 0,
    success_rate numeric(5,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.objection_templates OWNER TO neondb_owner;

--
-- Name: TABLE objection_templates; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.objection_templates IS 'Templates for handling common customer objections with success tracking';


--
-- Name: ocr_verification_rules; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.ocr_verification_rules (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50),
    payment_method character varying(30) NOT NULL,
    rule_name character varying(100) NOT NULL,
    patterns jsonb NOT NULL,
    validation_fields text[] DEFAULT '{}'::text[],
    confidence_threshold numeric(3,2) DEFAULT 0.80,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ocr_verification_rules OWNER TO neondb_owner;

--
-- Name: TABLE ocr_verification_rules; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.ocr_verification_rules IS 'OCR patterns for payment proof verification by method';


--
-- Name: order_ingredient_deductions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.order_ingredient_deductions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    merchant_id character varying(255) NOT NULL,
    catalog_item_id uuid NOT NULL,
    ingredient_inventory_item_id uuid,
    ingredient_name character varying(255) NOT NULL,
    quantity_deducted numeric(10,3) NOT NULL,
    unit character varying(50) DEFAULT 'piece'::character varying NOT NULL,
    status character varying(20) DEFAULT 'deducted'::character varying NOT NULL,
    restored_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.order_ingredient_deductions OWNER TO neondb_owner;

--
-- Name: order_payments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.order_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(255) NOT NULL,
    order_id uuid NOT NULL,
    method character varying(50) NOT NULL,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    reference text,
    status character varying(20) DEFAULT 'PAID'::character varying NOT NULL,
    collected_by character varying(255),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    legacy_order_id text
);


ALTER TABLE public.order_payments OWNER TO neondb_owner;

--
-- Name: orders; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    conversation_id character varying(100) NOT NULL,
    customer_id uuid,
    order_number character varying(50) NOT NULL,
    status public.order_status DEFAULT 'DRAFT'::public.order_status NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    discount numeric(10,2) DEFAULT 0 NOT NULL,
    delivery_fee numeric(10,2) DEFAULT 0 NOT NULL,
    total numeric(10,2) NOT NULL,
    customer_name character varying(255),
    customer_phone character varying(50),
    delivery_address jsonb,
    delivery_notes text,
    delivery_preference character varying(50),
    idempotency_key character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_method public.payment_method_type DEFAULT 'COD'::public.payment_method_type,
    payment_status character varying(50) DEFAULT 'PENDING'::character varying,
    payment_link_id uuid,
    payment_proof_id uuid,
    paid_at timestamp with time zone,
    assigned_driver_id uuid,
    cod_collected boolean DEFAULT false,
    cod_collected_at timestamp with time zone,
    cod_collected_amount numeric(12,2),
    stock_deducted boolean DEFAULT false,
    source_channel character varying(50) DEFAULT 'whatsapp'::character varying,
    discount_amount numeric(12,2) DEFAULT 0,
    discount_code character varying(50),
    discount_type character varying(20),
    total_amount numeric(10,2),
    branch_id uuid,
    shift_id uuid,
    review_requested_at timestamp with time zone,
    sla_breach_notified_at timestamp with time zone
);


ALTER TABLE public.orders OWNER TO neondb_owner;

--
-- Name: COLUMN orders.stock_deducted; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.orders.stock_deducted IS 'Tracks whether stock was deducted for this order. True = stock was frozen/deducted on order placement. Set false when cancelled and stock is restored.';


--
-- Name: outbox_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.outbox_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    event_type character varying(100) NOT NULL,
    aggregate_type character varying(100) NOT NULL,
    aggregate_id character varying(255) NOT NULL,
    merchant_id character varying(50),
    payload jsonb NOT NULL,
    correlation_id character varying(100),
    status public.event_status DEFAULT 'PENDING'::public.event_status NOT NULL,
    processed_at timestamp with time zone,
    error text,
    retry_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.outbox_events OWNER TO neondb_owner;

--
-- Name: payment_links; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.payment_links (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    order_id uuid,
    conversation_id character varying(100),
    customer_id uuid,
    link_code character varying(20) NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'EGP'::character varying NOT NULL,
    description text,
    status public.payment_link_status DEFAULT 'PENDING'::public.payment_link_status NOT NULL,
    viewed_at timestamp with time zone,
    paid_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    customer_phone character varying(50),
    customer_name character varying(255),
    allowed_methods public.payment_method_type[] DEFAULT '{INSTAPAY,BANK_TRANSFER,VODAFONE_CASH}'::public.payment_method_type[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.payment_links OWNER TO neondb_owner;

--
-- Name: payment_proofs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.payment_proofs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    payment_link_id uuid,
    order_id uuid,
    conversation_id character varying(100),
    proof_type character varying(50) DEFAULT 'receipt_image'::character varying NOT NULL,
    image_url text,
    image_base64 text,
    reference_number character varying(100),
    ocr_result jsonb,
    extracted_amount numeric(10,2),
    extracted_reference character varying(100),
    extracted_sender character varying(255),
    extracted_date date,
    ocr_confidence numeric(5,4),
    status public.payment_proof_status DEFAULT 'PENDING'::public.payment_proof_status NOT NULL,
    verified_at timestamp with time zone,
    verified_by character varying(100),
    rejection_reason text,
    auto_verified boolean DEFAULT false,
    auto_verification_score numeric(5,4),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    image_phash character varying(64),
    duplicate_of_proof_id uuid,
    duplicate_distance integer,
    risk_score integer DEFAULT 0,
    risk_level character varying(20) DEFAULT 'LOW'::character varying,
    risk_flags jsonb DEFAULT '[]'::jsonb,
    manual_review_required boolean DEFAULT true,
    review_notes text,
    reviewed_by_staff_id character varying(100),
    review_outcome character varying(20),
    ocr_provider character varying(50),
    ocr_guaranteed boolean DEFAULT false
);


ALTER TABLE public.payment_proofs OWNER TO neondb_owner;

--
-- Name: permission_templates; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.permission_templates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50),
    name character varying(100) NOT NULL,
    description text,
    permissions jsonb NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.permission_templates OWNER TO neondb_owner;

--
-- Name: plan_entitlements; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.plan_entitlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    feature_key character varying(80) NOT NULL,
    feature_label character varying(160),
    feature_tier character varying(40),
    is_included boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.plan_entitlements OWNER TO neondb_owner;

--
-- Name: plan_limits; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.plan_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    messages_per_month integer NOT NULL,
    whatsapp_numbers integer NOT NULL,
    team_members integer NOT NULL,
    ai_calls_per_day integer NOT NULL,
    token_budget_daily integer NOT NULL,
    paid_templates_per_month integer NOT NULL,
    payment_proof_scans_per_month integer NOT NULL,
    voice_minutes_per_month integer NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    maps_lookups_per_month integer DEFAULT 0 NOT NULL,
    pos_connections integer DEFAULT 0 NOT NULL,
    branches integer DEFAULT 1 NOT NULL,
    retention_days integer DEFAULT 0 NOT NULL,
    alert_rules integer DEFAULT 0 NOT NULL,
    automations integer DEFAULT 0 NOT NULL,
    auto_runs_per_day integer DEFAULT 0 NOT NULL,
    monthly_conversations_egypt integer,
    monthly_conversations_gulf integer,
    monthly_conversations_included integer,
    daily_ai_responses integer,
    monthly_ai_capacity integer,
    monthly_copilot_calls integer,
    monthly_voice_minutes integer,
    monthly_payment_proofs integer,
    monthly_broadcasts integer,
    monthly_map_searches integer,
    overage_rate_aed numeric(10,4),
    overage_rate_sar numeric(10,4)
);


ALTER TABLE public.plan_limits OWNER TO neondb_owner;

--
-- Name: plan_prices; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.plan_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    region_code character varying(8) NOT NULL,
    currency character varying(8) NOT NULL,
    cycle_months integer DEFAULT 1 NOT NULL,
    base_price_cents integer NOT NULL,
    discount_percent numeric(5,2) DEFAULT 0 NOT NULL,
    total_price_cents integer NOT NULL,
    effective_monthly_cents integer NOT NULL,
    vat_included boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.plan_prices OWNER TO neondb_owner;

--
-- Name: planner_run_ledger; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.planner_run_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    trigger_type character varying(20) NOT NULL,
    trigger_key character varying(120) NOT NULL,
    requested_by character varying(64),
    budget_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    run_status character varying(20) DEFAULT 'STARTED'::character varying NOT NULL,
    reason text,
    context_digest jsonb DEFAULT '{}'::jsonb NOT NULL,
    cost_tokens integer DEFAULT 0 NOT NULL,
    cost_ai_calls integer DEFAULT 0 NOT NULL,
    correlation_id character varying(128),
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT planner_run_ledger_run_status_check CHECK (((run_status)::text = ANY ((ARRAY['STARTED'::character varying, 'COMPLETED'::character varying, 'FAILED'::character varying, 'SKIPPED'::character varying])::text[])))
);


ALTER TABLE public.planner_run_ledger OWNER TO neondb_owner;

--
-- Name: planner_trigger_policies; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.planner_trigger_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    trigger_type character varying(20) NOT NULL,
    trigger_key character varying(120) NOT NULL,
    budget_ai_calls_daily integer DEFAULT 0 NOT NULL,
    budget_tokens_daily integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT planner_trigger_policies_trigger_type_check CHECK (((trigger_type)::text = ANY ((ARRAY['EVENT'::character varying, 'SCHEDULED'::character varying, 'ON_DEMAND'::character varying, 'ESCALATION'::character varying])::text[])))
);


ALTER TABLE public.planner_trigger_policies OWNER TO neondb_owner;

--
-- Name: plans; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(40) NOT NULL,
    name character varying(120) NOT NULL,
    tier_rank integer DEFAULT 0 NOT NULL,
    description text,
    is_bundle boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.plans OWNER TO neondb_owner;

--
-- Name: points_transactions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.points_transactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(255) NOT NULL,
    customer_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    points integer NOT NULL,
    balance_after integer NOT NULL,
    source character varying(100),
    reference_id character varying(255),
    description text,
    expires_at timestamp with time zone,
    staff_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.points_transactions OWNER TO neondb_owner;

--
-- Name: TABLE points_transactions; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.points_transactions IS 'Points earning and redemption history';


--
-- Name: pos_integrations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.pos_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    provider character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'INACTIVE'::character varying,
    config jsonb DEFAULT '{}'::jsonb,
    credentials jsonb DEFAULT '{}'::jsonb,
    last_sync_at timestamp with time zone,
    sync_interval_minutes integer DEFAULT 15,
    field_mapping jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pos_integrations_provider_check CHECK (((provider)::text = ANY ((ARRAY['ODOO'::character varying, 'FOODICS'::character varying, 'ORACLE_MICROS'::character varying, 'SHOPIFY'::character varying, 'SQUARE'::character varying, 'CUSTOM'::character varying])::text[]))),
    CONSTRAINT pos_integrations_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying, 'ERROR'::character varying])::text[])))
);


ALTER TABLE public.pos_integrations OWNER TO neondb_owner;

--
-- Name: proactive_alert_configs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.proactive_alert_configs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    expiry_threshold_days integer DEFAULT 7 NOT NULL,
    cash_flow_forecast_days integer DEFAULT 14 NOT NULL,
    demand_spike_multiplier numeric(5,2) DEFAULT 2.00 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    no_orders_threshold_minutes integer DEFAULT 120 NOT NULL,
    low_cash_threshold numeric(12,2) DEFAULT NULL::numeric,
    alert_email text,
    alert_whatsapp text
);


ALTER TABLE public.proactive_alert_configs OWNER TO neondb_owner;

--
-- Name: product_cogs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.product_cogs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    product_id character varying(100) NOT NULL,
    sku character varying(100),
    cost numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'EGP'::character varying,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    effective_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.product_cogs OWNER TO neondb_owner;

--
-- Name: TABLE product_cogs; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.product_cogs IS 'Cost of Goods Sold for profit margin calculations';


--
-- Name: product_media; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.product_media (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    catalog_item_id uuid NOT NULL,
    variant_sku character varying(100),
    url text NOT NULL,
    caption_ar text,
    caption_en text,
    display_order integer DEFAULT 0 NOT NULL,
    channel_flags jsonb DEFAULT '{"whatsapp": true, "instagram": true, "messenger": true}'::jsonb NOT NULL,
    send_on character varying(30) DEFAULT 'on_request'::character varying NOT NULL,
    fallback_text text,
    hash character varying(128),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_product_media_send_on CHECK (((send_on)::text = ANY ((ARRAY['variant_ask'::character varying, 'confirm'::character varying, 'on_request'::character varying, 'always'::character varying])::text[])))
);


ALTER TABLE public.product_media OWNER TO neondb_owner;

--
-- Name: product_ocr_confirmations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.product_ocr_confirmations (
    id character varying(50) NOT NULL,
    merchant_id character varying(50) NOT NULL,
    customer_id character varying(255) NOT NULL,
    conversation_id character varying(100),
    ocr_result jsonb NOT NULL,
    catalog_matches jsonb DEFAULT '[]'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    selected_item_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone NOT NULL,
    responded_at timestamp with time zone,
    CONSTRAINT product_ocr_confirmations_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'CONFIRMED'::character varying, 'REJECTED'::character varying, 'EXPIRED'::character varying])::text[])))
);


ALTER TABLE public.product_ocr_confirmations OWNER TO neondb_owner;

--
-- Name: TABLE product_ocr_confirmations; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.product_ocr_confirmations IS 'Stores pending product OCR confirmations awaiting customer response';


--
-- Name: promotion_performance; Type: VIEW; Schema: public; Owner: neondb_owner
--

CREATE VIEW public.promotion_performance AS
SELECT
    NULL::uuid AS id,
    NULL::character varying(255) AS merchant_id,
    NULL::character varying(255) AS name,
    NULL::character varying(50) AS type,
    NULL::character varying(50) AS code,
    NULL::timestamp with time zone AS start_date,
    NULL::timestamp with time zone AS end_date,
    NULL::integer AS usage_limit,
    NULL::integer AS current_usage,
    NULL::bigint AS actual_usage,
    NULL::numeric AS total_discount_given,
    NULL::numeric AS avg_discount;


ALTER VIEW public.promotion_performance OWNER TO neondb_owner;

--
-- Name: promotion_usage; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.promotion_usage (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    promotion_id uuid NOT NULL,
    merchant_id character varying(255) NOT NULL,
    customer_id uuid NOT NULL,
    order_id uuid,
    discount_amount numeric(10,2) NOT NULL,
    used_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.promotion_usage OWNER TO neondb_owner;

--
-- Name: promotions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.promotions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    name_ar character varying(255),
    description text,
    type character varying(50) NOT NULL,
    value numeric(10,2) NOT NULL,
    code character varying(50),
    auto_apply boolean DEFAULT false,
    min_order_amount numeric(10,2) DEFAULT 0,
    max_discount_amount numeric(10,2),
    usage_limit integer,
    usage_per_customer integer DEFAULT 1,
    current_usage integer DEFAULT 0,
    target_audience jsonb DEFAULT '{}'::jsonb,
    applicable_products jsonb DEFAULT '[]'::jsonb,
    excluded_products jsonb DEFAULT '[]'::jsonb,
    tier_restriction character varying(50)[],
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.promotions OWNER TO neondb_owner;

--
-- Name: TABLE promotions; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.promotions IS 'Discount campaigns and promo codes';


--
-- Name: proof_requests; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.proof_requests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    conversation_id character varying(100),
    order_id uuid,
    payment_link_id uuid,
    customer_phone character varying(50),
    amount numeric(10,2),
    payment_method character varying(30),
    message_sent_at timestamp with time zone DEFAULT now() NOT NULL,
    proof_received_at timestamp with time zone,
    proof_id uuid,
    status character varying(20) DEFAULT 'awaiting'::character varying,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.proof_requests OWNER TO neondb_owner;

--
-- Name: TABLE proof_requests; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.proof_requests IS 'Payment proof requests sent to customers';


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(100) NOT NULL,
    staff_id uuid,
    endpoint text NOT NULL,
    keys jsonb NOT NULL,
    user_agent character varying(500),
    is_active boolean DEFAULT true,
    last_used_at timestamp with time zone,
    failed_attempts integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    provider character varying(20) DEFAULT 'WEB_PUSH'::character varying NOT NULL,
    platform character varying(20),
    device_token text
);


ALTER TABLE public.push_subscriptions OWNER TO neondb_owner;

--
-- Name: TABLE push_subscriptions; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.push_subscriptions IS 'Web Push API subscriptions for browser notifications';


--
-- Name: quote_request_events; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.quote_request_events (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    quote_request_id uuid NOT NULL,
    actor_type character varying(20) DEFAULT 'SYSTEM'::character varying NOT NULL,
    actor_id character varying(100),
    action character varying(50) DEFAULT 'NOTE'::character varying NOT NULL,
    note text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.quote_request_events OWNER TO neondb_owner;

--
-- Name: quote_requests; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.quote_requests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(100) NOT NULL,
    feature_request_id uuid,
    requested_agents text[] DEFAULT ARRAY[]::text[],
    requested_features text[] DEFAULT ARRAY[]::text[],
    limits jsonb DEFAULT '{}'::jsonb NOT NULL,
    quoted_price_cents integer,
    currency character varying(10) DEFAULT 'EGP'::character varying,
    status public.quote_request_status DEFAULT 'NEW'::public.quote_request_status NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.quote_requests OWNER TO neondb_owner;

--
-- Name: rate_limit_counters; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.rate_limit_counters (
    id character varying(255) NOT NULL,
    merchant_id character varying(50),
    counter integer DEFAULT 0 NOT NULL,
    window_start timestamp with time zone NOT NULL,
    window_end timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.rate_limit_counters OWNER TO neondb_owner;

--
-- Name: rate_limit_violations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.rate_limit_violations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50),
    identifier character varying(255) NOT NULL,
    limit_type character varying(50) NOT NULL,
    limit_value integer NOT NULL,
    current_value integer NOT NULL,
    endpoint character varying(255),
    ip_address character varying(45),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.rate_limit_violations OWNER TO neondb_owner;

--
-- Name: recovered_carts; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.recovered_carts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    conversation_id character varying(100) NOT NULL,
    order_id uuid,
    followup_sent_at timestamp with time zone NOT NULL,
    order_created_at timestamp with time zone,
    cart_value numeric(10,2) NOT NULL,
    order_value numeric(10,2),
    recovery_window_hours integer DEFAULT 48,
    is_recovered boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.recovered_carts OWNER TO neondb_owner;

--
-- Name: TABLE recovered_carts; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.recovered_carts IS 'Tracks carts recovered through followup messages for KPI reporting';


--
-- Name: replenishment_recommendations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.replenishment_recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying NOT NULL,
    product_id uuid NOT NULL,
    product_name text,
    supplier_id uuid,
    supplier_name text,
    recommended_qty integer NOT NULL,
    reorder_point integer NOT NULL,
    safety_stock integer NOT NULL,
    lead_time_days integer DEFAULT 3 NOT NULL,
    est_stockout_date date,
    urgency text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_by text,
    approved_at timestamp with time zone,
    po_reference text,
    notes text,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.replenishment_recommendations OWNER TO neondb_owner;

--
-- Name: segment_memberships; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.segment_memberships (
    segment_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.segment_memberships OWNER TO neondb_owner;

--
-- Name: shipments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.shipments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    order_id uuid NOT NULL,
    merchant_id character varying(50) NOT NULL,
    tracking_id character varying(100),
    courier character varying(100),
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    status_description text,
    status_history jsonb DEFAULT '[]'::jsonb NOT NULL,
    estimated_delivery timestamp with time zone,
    actual_delivery timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    failure_reason text
);


ALTER TABLE public.shipments OWNER TO neondb_owner;

--
-- Name: shrinkage_records; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.shrinkage_records (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    variant_id uuid,
    sku character varying(100),
    product_name character varying(200),
    expected_qty integer NOT NULL,
    actual_qty integer NOT NULL,
    shrinkage_qty integer GENERATED ALWAYS AS ((expected_qty - actual_qty)) STORED,
    shrinkage_value numeric(10,2),
    reason character varying(50),
    notes text,
    audit_date date DEFAULT CURRENT_DATE NOT NULL,
    recorded_by character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.shrinkage_records OWNER TO neondb_owner;

--
-- Name: TABLE shrinkage_records; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.shrinkage_records IS 'Inventory shrinkage tracking (expected vs actual)';


--
-- Name: sku_merge_log; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.sku_merge_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    source_sku character varying(100) NOT NULL,
    target_sku character varying(100) NOT NULL,
    source_item_id uuid NOT NULL,
    target_item_id uuid NOT NULL,
    merged_quantity integer DEFAULT 0,
    merged_by character varying(100),
    reason text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.sku_merge_log OWNER TO neondb_owner;

--
-- Name: staff_sessions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.staff_sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    staff_id uuid NOT NULL,
    refresh_token_hash character varying(255) NOT NULL,
    device_info jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip_address character varying(45),
    expires_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.staff_sessions OWNER TO neondb_owner;

--
-- Name: stock_alerts; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.stock_alerts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    catalog_item_id uuid NOT NULL,
    alert_type character varying(50) NOT NULL,
    current_quantity integer NOT NULL,
    threshold integer,
    acknowledged boolean DEFAULT false NOT NULL,
    acknowledged_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.stock_alerts OWNER TO neondb_owner;

--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.stock_movements (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    catalog_item_id uuid NOT NULL,
    movement_type character varying(50) NOT NULL,
    quantity integer NOT NULL,
    reference_type character varying(50),
    reference_id character varying(255),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    variant_id uuid,
    quantity_before integer,
    quantity_after integer,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_by character varying(255),
    lot_number character varying(100),
    batch_id character varying(100),
    expiry_date date
);


ALTER TABLE public.stock_movements OWNER TO neondb_owner;

--
-- Name: stock_reservations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.stock_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(255) NOT NULL,
    variant_id uuid NOT NULL,
    order_id uuid,
    conversation_id character varying(255),
    quantity integer NOT NULL,
    status character varying(50) DEFAULT 'active'::character varying,
    expires_at timestamp without time zone NOT NULL,
    confirmed_at timestamp without time zone,
    released_at timestamp without time zone,
    release_reason text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.stock_reservations OWNER TO neondb_owner;

--
-- Name: subscription_add_ons; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.subscription_add_ons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid NOT NULL,
    addon_id uuid NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscription_add_ons_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'CANCELLED'::character varying, 'EXPIRED'::character varying, 'PENDING'::character varying])::text[])))
);


ALTER TABLE public.subscription_add_ons OWNER TO neondb_owner;

--
-- Name: subscription_offers; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.subscription_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50),
    name character varying(255) NOT NULL,
    name_ar character varying(255),
    description text,
    description_ar text,
    discount_type character varying(20) DEFAULT 'PERCENT'::character varying NOT NULL,
    discount_value numeric(12,2) DEFAULT 0 NOT NULL,
    currency character varying(10) DEFAULT 'EGP'::character varying,
    applies_to_plan character varying(50),
    starts_at timestamp with time zone DEFAULT now(),
    ends_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.subscription_offers OWNER TO neondb_owner;

--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(100) NOT NULL,
    plan_id uuid NOT NULL,
    region_code character varying(8) DEFAULT 'EG'::character varying NOT NULL,
    cycle_months integer DEFAULT 1 NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    provider character varying(40) DEFAULT 'manual'::character varying NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    auto_renew boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscriptions_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ACTIVE'::character varying, 'CANCELLED'::character varying, 'EXPIRED'::character varying, 'PAST_DUE'::character varying])::text[])))
);


ALTER TABLE public.subscriptions OWNER TO neondb_owner;

--
-- Name: substitution_suggestions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.substitution_suggestions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    conversation_id character varying(100),
    original_product_id character varying(100) NOT NULL,
    original_sku character varying(100),
    suggested_products jsonb NOT NULL,
    customer_message_ar text,
    customer_accepted boolean,
    accepted_product_id character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.substitution_suggestions OWNER TO neondb_owner;

--
-- Name: TABLE substitution_suggestions; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.substitution_suggestions IS 'Log of AI-generated product substitution suggestions';


--
-- Name: supplier_discovery_results; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.supplier_discovery_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying NOT NULL,
    query text NOT NULL,
    results jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.supplier_discovery_results OWNER TO neondb_owner;

--
-- Name: supplier_imports; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.supplier_imports (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    supplier_id uuid,
    filename character varying(255) NOT NULL,
    import_type character varying(30) NOT NULL,
    rows_total integer DEFAULT 0 NOT NULL,
    rows_success integer DEFAULT 0 NOT NULL,
    rows_failed integer DEFAULT 0 NOT NULL,
    errors jsonb DEFAULT '[]'::jsonb,
    status character varying(20) DEFAULT 'pending'::character varying,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    imported_by character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.supplier_imports OWNER TO neondb_owner;

--
-- Name: TABLE supplier_imports; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.supplier_imports IS 'Log of supplier CSV imports';


--
-- Name: supplier_products; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.supplier_products (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    supplier_id uuid NOT NULL,
    inventory_item_id uuid,
    variant_id uuid,
    supplier_sku character varying(100),
    supplier_name character varying(200),
    cost_price numeric(10,2) NOT NULL,
    min_order_qty integer DEFAULT 1,
    is_preferred boolean DEFAULT false,
    last_order_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    unit_cost numeric(12,2),
    notes text
);


ALTER TABLE public.supplier_products OWNER TO neondb_owner;

--
-- Name: TABLE supplier_products; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.supplier_products IS 'Product-supplier mapping with cost prices';


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    contact_name character varying(100),
    phone character varying(50),
    email character varying(100),
    address text,
    payment_terms character varying(50),
    lead_time_days integer DEFAULT 7,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    whatsapp_phone character varying(50),
    auto_notify_low_stock boolean DEFAULT false NOT NULL,
    notify_threshold character varying(20) DEFAULT 'critical'::character varying NOT NULL,
    last_auto_notified_at timestamp with time zone
);


ALTER TABLE public.suppliers OWNER TO neondb_owner;

--
-- Name: TABLE suppliers; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.suppliers IS 'Supplier master data for inventory management';


--
-- Name: system_health_log; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.system_health_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type character varying(50) NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.system_health_log OWNER TO neondb_owner;

--
-- Name: tax_reports; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.tax_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    total_sales numeric(14,2) DEFAULT 0,
    total_vat_collected numeric(14,2) DEFAULT 0,
    total_input_vat numeric(14,2) DEFAULT 0,
    net_vat_payable numeric(14,2) DEFAULT 0,
    total_exempt_sales numeric(14,2) DEFAULT 0,
    order_count integer DEFAULT 0,
    status character varying(20) DEFAULT 'DRAFT'::character varying,
    generated_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.tax_reports OWNER TO neondb_owner;

--
-- Name: team_tasks; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.team_tasks (
    id text NOT NULL,
    merchant_id text NOT NULL,
    correlation_id text,
    title text NOT NULL,
    title_ar text,
    description text,
    priority text DEFAULT 'MEDIUM'::text,
    status text DEFAULT 'PLANNING'::text,
    strategy text DEFAULT 'PARALLEL'::text,
    failure_policy text DEFAULT 'CONTINUE_ON_ERROR'::text,
    subtasks jsonb DEFAULT '[]'::jsonb NOT NULL,
    aggregated_result jsonb,
    reply_ar text,
    total_subtasks integer DEFAULT 0 NOT NULL,
    completed_subtasks integer DEFAULT 0,
    failed_subtasks integer DEFAULT 0,
    progress_percent integer DEFAULT 0,
    timeout_ms integer DEFAULT 120000,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);


ALTER TABLE public.team_tasks OWNER TO neondb_owner;

--
-- Name: twilio_message_log; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.twilio_message_log (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    message_id uuid,
    message_sid character varying(50) NOT NULL,
    account_sid character varying(50) NOT NULL,
    direction character varying(20) NOT NULL,
    from_number character varying(50) NOT NULL,
    to_number character varying(50) NOT NULL,
    body text,
    num_media integer DEFAULT 0,
    media_urls jsonb DEFAULT '[]'::jsonb,
    media_content_types jsonb DEFAULT '[]'::jsonb,
    status character varying(30) DEFAULT 'received'::character varying,
    error_code character varying(10),
    error_message text,
    price numeric(10,6),
    price_unit character varying(10),
    latitude numeric(10,8),
    longitude numeric(11,8),
    location_label text,
    webhook_received_at timestamp with time zone,
    status_callback_received_at timestamp with time zone,
    raw_webhook_payload jsonb,
    raw_status_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT twilio_message_log_direction_check CHECK (((direction)::text = ANY ((ARRAY['inbound'::character varying, 'outbound'::character varying])::text[])))
);


ALTER TABLE public.twilio_message_log OWNER TO neondb_owner;

--
-- Name: TABLE twilio_message_log; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.twilio_message_log IS 'Complete Twilio message lifecycle log for debugging and analytics';


--
-- Name: COLUMN twilio_message_log.message_sid; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.twilio_message_log.message_sid IS 'Twilio unique message identifier';


--
-- Name: COLUMN twilio_message_log.status; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.twilio_message_log.status IS 'Twilio message status: received, queued, sending, sent, delivered, failed, undelivered, read';


--
-- Name: upsell_rules; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.upsell_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    rule_type character varying(20) DEFAULT 'CROSS_SELL'::character varying NOT NULL,
    source_item_id uuid,
    source_category character varying(100),
    target_item_id uuid NOT NULL,
    priority integer DEFAULT 0,
    discount_pct numeric(5,2) DEFAULT 0,
    message_ar text,
    is_active boolean DEFAULT true,
    impressions integer DEFAULT 0,
    conversions integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.upsell_rules OWNER TO neondb_owner;

--
-- Name: usage_ledger; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.usage_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(100) NOT NULL,
    subscription_id uuid,
    metric_key character varying(60) NOT NULL,
    quantity numeric(12,3) NOT NULL,
    unit character varying(20),
    period_type character varying(20) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT usage_ledger_period_type_check CHECK (((period_type)::text = ANY ((ARRAY['DAILY'::character varying, 'MONTHLY'::character varying])::text[])))
);


ALTER TABLE public.usage_ledger OWNER TO neondb_owner;

--
-- Name: usage_pack_prices; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.usage_pack_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usage_pack_id uuid NOT NULL,
    region_code character varying(8) NOT NULL,
    currency character varying(8) NOT NULL,
    price_cents integer NOT NULL,
    vat_included boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.usage_pack_prices OWNER TO neondb_owner;

--
-- Name: usage_packs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.usage_packs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(80) NOT NULL,
    name character varying(160) NOT NULL,
    metric_key character varying(60) NOT NULL,
    tier_code character varying(20) NOT NULL,
    included_units integer,
    included_ai_calls_per_day integer,
    included_token_budget_daily integer,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    limit_deltas jsonb DEFAULT '{}'::jsonb NOT NULL
);


ALTER TABLE public.usage_packs OWNER TO neondb_owner;

--
-- Name: usage_period_aggregates; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.usage_period_aggregates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(100) NOT NULL,
    subscription_id uuid,
    metric_key character varying(60) NOT NULL,
    period_type character varying(20) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    used_quantity numeric(12,3) DEFAULT 0 NOT NULL,
    limit_quantity numeric(12,3),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT usage_period_aggregates_period_type_check CHECK (((period_type)::text = ANY ((ARRAY['DAILY'::character varying, 'MONTHLY'::character varying])::text[])))
);


ALTER TABLE public.usage_period_aggregates OWNER TO neondb_owner;

--
-- Name: vip_rules; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.vip_rules (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    tag_to_apply character varying(50) DEFAULT 'VIP'::character varying NOT NULL,
    conditions jsonb NOT NULL,
    is_active boolean DEFAULT true,
    priority integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.vip_rules OWNER TO neondb_owner;

--
-- Name: TABLE vip_rules; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.vip_rules IS 'Rules for automatic VIP tagging based on order history';


--
-- Name: voice_calls; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.voice_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    customer_phone character varying(30) NOT NULL,
    call_sid character varying(100) NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    duration_seconds integer,
    handled_by character varying(20) DEFAULT 'ai'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    transcript jsonb DEFAULT '[]'::jsonb,
    order_id character varying(100),
    recording_url text
);


ALTER TABLE public.voice_calls OWNER TO neondb_owner;

--
-- Name: voice_transcriptions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.voice_transcriptions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    message_id uuid NOT NULL,
    audio_url text NOT NULL,
    transcription text,
    language character varying(10) DEFAULT 'ar-EG'::character varying,
    confidence numeric(5,4),
    provider character varying(50) DEFAULT 'mock'::character varying,
    duration_seconds integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    conversation_id character varying(100),
    merchant_id character varying(50),
    original_media_url text,
    media_content_type character varying(100),
    segments jsonb,
    raw_response jsonb,
    processing_time_ms integer,
    error_message text,
    status character varying(20) DEFAULT 'completed'::character varying
);


ALTER TABLE public.voice_transcriptions OWNER TO neondb_owner;

--
-- Name: TABLE voice_transcriptions; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.voice_transcriptions IS 'Stores transcription results for voice messages with full audit trail';


--
-- Name: warehouse_locations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.warehouse_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    name_ar character varying(255),
    address text,
    city character varying(100),
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    branch_id uuid
);


ALTER TABLE public.warehouse_locations OWNER TO neondb_owner;

--
-- Name: webhook_deliveries; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.webhook_deliveries (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    webhook_id uuid NOT NULL,
    merchant_id character varying(50) NOT NULL,
    event_type character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    status public.webhook_delivery_status DEFAULT 'PENDING'::public.webhook_delivery_status NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    response_status integer,
    response_body text,
    response_time_ms integer,
    error text,
    next_retry_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.webhook_deliveries OWNER TO neondb_owner;

--
-- Name: webhooks; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.webhooks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    url character varying(2048) NOT NULL,
    secret character varying(255) NOT NULL,
    events text[] DEFAULT '{}'::text[] NOT NULL,
    headers jsonb DEFAULT '{}'::jsonb NOT NULL,
    status public.webhook_status DEFAULT 'ACTIVE'::public.webhook_status NOT NULL,
    retry_count integer DEFAULT 3 NOT NULL,
    timeout_ms integer DEFAULT 10000 NOT NULL,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    last_triggered_at timestamp with time zone,
    last_success_at timestamp with time zone,
    last_failure_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.webhooks OWNER TO neondb_owner;

--
-- Name: what_if_scenarios; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.what_if_scenarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying NOT NULL,
    scenario_type text NOT NULL,
    input_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    result_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.what_if_scenarios OWNER TO neondb_owner;

--
-- Name: whatsapp_conversation_windows; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.whatsapp_conversation_windows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id character varying(50) NOT NULL,
    customer_phone character varying(30) NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    message_count integer DEFAULT 1 NOT NULL,
    ai_replies_count integer DEFAULT 0 NOT NULL,
    instant_reply_count integer DEFAULT 0 NOT NULL,
    model_4o_count integer DEFAULT 0 NOT NULL,
    model_mini_count integer DEFAULT 0 NOT NULL,
    is_overage boolean DEFAULT false NOT NULL
);


ALTER TABLE public.whatsapp_conversation_windows OWNER TO neondb_owner;

--
-- Name: whatsapp_message_log; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.whatsapp_message_log (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    message_id uuid,
    wa_message_id character varying(100) NOT NULL,
    waba_id character varying(100),
    phone_number_id character varying(100),
    direction character varying(20) NOT NULL,
    from_number character varying(50) NOT NULL,
    to_number character varying(50) NOT NULL,
    body text,
    num_media integer DEFAULT 0,
    media_ids jsonb DEFAULT '[]'::jsonb,
    media_content_types jsonb DEFAULT '[]'::jsonb,
    status character varying(30) DEFAULT 'received'::character varying,
    error_code character varying(20),
    error_message text,
    latitude numeric(10,8),
    longitude numeric(11,8),
    location_label text,
    webhook_received_at timestamp with time zone,
    status_callback_received_at timestamp with time zone,
    raw_webhook_payload jsonb,
    raw_status_payload jsonb,
    conversation_id_meta character varying(100),
    conversation_origin character varying(50),
    is_billable boolean DEFAULT false,
    pricing_category character varying(50),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_message_log_direction_check CHECK (((direction)::text = ANY ((ARRAY['inbound'::character varying, 'outbound'::character varying])::text[])))
);


ALTER TABLE public.whatsapp_message_log OWNER TO neondb_owner;

--
-- Name: TABLE whatsapp_message_log; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON TABLE public.whatsapp_message_log IS 'Complete WhatsApp message lifecycle log — provider-agnostic (Meta Cloud API)';


--
-- Name: COLUMN whatsapp_message_log.wa_message_id; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.whatsapp_message_log.wa_message_id IS 'Meta wamid.xxx or legacy Twilio SID';


--
-- Name: COLUMN whatsapp_message_log.waba_id; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.whatsapp_message_log.waba_id IS 'WhatsApp Business Account ID from Meta';


--
-- Name: COLUMN whatsapp_message_log.phone_number_id; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.whatsapp_message_log.phone_number_id IS 'Meta Phone Number ID for the business line';


--
-- Name: COLUMN whatsapp_message_log.conversation_id_meta; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.whatsapp_message_log.conversation_id_meta IS 'Meta conversation ID for billing tracking';


--
-- Name: COLUMN whatsapp_message_log.is_billable; Type: COMMENT; Schema: public; Owner: neondb_owner
--

COMMENT ON COLUMN public.whatsapp_message_log.is_billable IS 'Whether this conversation was billable per Meta pricing';


--
-- Name: branch_shifts shift_number; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branch_shifts ALTER COLUMN shift_number SET DEFAULT nextval('public.branch_shifts_shift_number_seq'::regclass);


--
-- Name: control_plane_replay_token_consumptions id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.control_plane_replay_token_consumptions ALTER COLUMN id SET DEFAULT nextval('public.control_plane_replay_token_consumptions_id_seq'::regclass);


--
-- Name: control_plane_triage_acknowledgements id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.control_plane_triage_acknowledgements ALTER COLUMN id SET DEFAULT nextval('public.control_plane_triage_acknowledgements_id_seq'::regclass);


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: accountant_exports accountant_exports_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.accountant_exports
    ADD CONSTRAINT accountant_exports_pkey PRIMARY KEY (id);


--
-- Name: add_on_prices add_on_prices_addon_id_region_code_cycle_months_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.add_on_prices
    ADD CONSTRAINT add_on_prices_addon_id_region_code_cycle_months_key UNIQUE (addon_id, region_code, cycle_months);


--
-- Name: add_on_prices add_on_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.add_on_prices
    ADD CONSTRAINT add_on_prices_pkey PRIMARY KEY (id);


--
-- Name: add_ons add_ons_code_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.add_ons
    ADD CONSTRAINT add_ons_code_key UNIQUE (code);


--
-- Name: add_ons add_ons_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.add_ons
    ADD CONSTRAINT add_ons_pkey PRIMARY KEY (id);


--
-- Name: address_cache address_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.address_cache
    ADD CONSTRAINT address_cache_pkey PRIMARY KEY (id);


--
-- Name: address_cache address_cache_raw_text_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.address_cache
    ADD CONSTRAINT address_cache_raw_text_key UNIQUE (raw_text);


--
-- Name: agent_actions agent_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.agent_actions
    ADD CONSTRAINT agent_actions_pkey PRIMARY KEY (id);


--
-- Name: agent_results agent_results_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.agent_results
    ADD CONSTRAINT agent_results_pkey PRIMARY KEY (id);


--
-- Name: agent_subscription_audit agent_subscription_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.agent_subscription_audit
    ADD CONSTRAINT agent_subscription_audit_pkey PRIMARY KEY (id);


--
-- Name: agent_tasks agent_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_pkey PRIMARY KEY (id);


--
-- Name: ai_call_metrics ai_call_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.ai_call_metrics
    ADD CONSTRAINT ai_call_metrics_pkey PRIMARY KEY (id);


--
-- Name: ai_decision_log ai_decision_log_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.ai_decision_log
    ADD CONSTRAINT ai_decision_log_pkey PRIMARY KEY (id);


--
-- Name: ai_routing_log ai_routing_log_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.ai_routing_log
    ADD CONSTRAINT ai_routing_log_pkey PRIMARY KEY (id);


--
-- Name: analytics_events analytics_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: automation_run_logs automation_run_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.automation_run_logs
    ADD CONSTRAINT automation_run_logs_pkey PRIMARY KEY (id);


--
-- Name: billing_invoices billing_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_pkey PRIMARY KEY (id);


--
-- Name: billing_overages billing_overages_merchant_id_billing_period_metric_type_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.billing_overages
    ADD CONSTRAINT billing_overages_merchant_id_billing_period_metric_type_key UNIQUE (merchant_id, billing_period, metric_type);


--
-- Name: billing_overages billing_overages_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.billing_overages
    ADD CONSTRAINT billing_overages_pkey PRIMARY KEY (id);


--
-- Name: billing_plans billing_plans_code_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.billing_plans
    ADD CONSTRAINT billing_plans_code_key UNIQUE (code);


--
-- Name: billing_plans billing_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.billing_plans
    ADD CONSTRAINT billing_plans_pkey PRIMARY KEY (id);


--
-- Name: branch_goals branch_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branch_goals
    ADD CONSTRAINT branch_goals_pkey PRIMARY KEY (id);


--
-- Name: branch_shifts branch_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branch_shifts
    ADD CONSTRAINT branch_shifts_pkey PRIMARY KEY (id);


--
-- Name: branch_staff_assignments branch_staff_assignments_branch_id_staff_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branch_staff_assignments
    ADD CONSTRAINT branch_staff_assignments_branch_id_staff_id_key UNIQUE (branch_id, staff_id);


--
-- Name: branch_staff_assignments branch_staff_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branch_staff_assignments
    ADD CONSTRAINT branch_staff_assignments_pkey PRIMARY KEY (id);


--
-- Name: bulk_operations bulk_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bulk_operations
    ADD CONSTRAINT bulk_operations_pkey PRIMARY KEY (id);


--
-- Name: call_followup_workflow_events call_followup_workflow_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.call_followup_workflow_events
    ADD CONSTRAINT call_followup_workflow_events_pkey PRIMARY KEY (id);


--
-- Name: call_followup_workflows call_followup_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.call_followup_workflows
    ADD CONSTRAINT call_followup_workflows_pkey PRIMARY KEY (call_id);


--
-- Name: callback_campaign_bridge_items callback_campaign_bridge_items_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.callback_campaign_bridge_items
    ADD CONSTRAINT callback_campaign_bridge_items_pkey PRIMARY KEY (id);


--
-- Name: callback_campaign_bridge_items callback_campaign_bridge_items_unique_call_per_bridge; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.callback_campaign_bridge_items
    ADD CONSTRAINT callback_campaign_bridge_items_unique_call_per_bridge UNIQUE (bridge_id, call_id);


--
-- Name: callback_campaign_bridges callback_campaign_bridges_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.callback_campaign_bridges
    ADD CONSTRAINT callback_campaign_bridges_pkey PRIMARY KEY (id);


--
-- Name: cash_flow_forecasts cash_flow_forecasts_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cash_flow_forecasts
    ADD CONSTRAINT cash_flow_forecasts_pkey PRIMARY KEY (id);


--
-- Name: catalog_embedding_jobs catalog_embedding_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.catalog_embedding_jobs
    ADD CONSTRAINT catalog_embedding_jobs_pkey PRIMARY KEY (id);


--
-- Name: catalog_items catalog_items_merchant_id_sku_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.catalog_items
    ADD CONSTRAINT catalog_items_merchant_id_sku_key UNIQUE (merchant_id, sku);


--
-- Name: catalog_items catalog_items_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.catalog_items
    ADD CONSTRAINT catalog_items_pkey PRIMARY KEY (id);


--
-- Name: cod_collections cod_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cod_collections
    ADD CONSTRAINT cod_collections_pkey PRIMARY KEY (id);


--
-- Name: cod_finance_actions cod_finance_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cod_finance_actions
    ADD CONSTRAINT cod_finance_actions_pkey PRIMARY KEY (id);


--
-- Name: cod_reminders cod_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cod_reminders
    ADD CONSTRAINT cod_reminders_pkey PRIMARY KEY (id);


--
-- Name: cod_statement_imports cod_statement_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cod_statement_imports
    ADD CONSTRAINT cod_statement_imports_pkey PRIMARY KEY (id);


--
-- Name: cod_statement_lines cod_statement_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cod_statement_lines
    ADD CONSTRAINT cod_statement_lines_pkey PRIMARY KEY (id);


--
-- Name: complaint_playbooks complaint_playbooks_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.complaint_playbooks
    ADD CONSTRAINT complaint_playbooks_pkey PRIMARY KEY (id);


--
-- Name: connector_reconciliation_items connector_reconciliation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_reconciliation_items
    ADD CONSTRAINT connector_reconciliation_items_pkey PRIMARY KEY (id);


--
-- Name: connector_reconciliation_runs connector_reconciliation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_reconciliation_runs
    ADD CONSTRAINT connector_reconciliation_runs_pkey PRIMARY KEY (id);


--
-- Name: connector_runtime_dlq connector_runtime_dlq_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_runtime_dlq
    ADD CONSTRAINT connector_runtime_dlq_pkey PRIMARY KEY (id);


--
-- Name: connector_runtime_dlq connector_runtime_dlq_runtime_event_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_runtime_dlq
    ADD CONSTRAINT connector_runtime_dlq_runtime_event_id_key UNIQUE (runtime_event_id);


--
-- Name: connector_runtime_events connector_runtime_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_runtime_events
    ADD CONSTRAINT connector_runtime_events_pkey PRIMARY KEY (id);


--
-- Name: connector_runtime_worker_cycle_outcomes connector_runtime_worker_cycle_outcome_cycle_id_merchant_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_runtime_worker_cycle_outcomes
    ADD CONSTRAINT connector_runtime_worker_cycle_outcome_cycle_id_merchant_id_key UNIQUE (cycle_id, merchant_id);


--
-- Name: connector_runtime_worker_cycle_outcomes connector_runtime_worker_cycle_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_runtime_worker_cycle_outcomes
    ADD CONSTRAINT connector_runtime_worker_cycle_outcomes_pkey PRIMARY KEY (id);


--
-- Name: connector_runtime_worker_cycles connector_runtime_worker_cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_runtime_worker_cycles
    ADD CONSTRAINT connector_runtime_worker_cycles_pkey PRIMARY KEY (id);


--
-- Name: control_plane_replay_token_consumptions control_plane_replay_token_consumptions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.control_plane_replay_token_consumptions
    ADD CONSTRAINT control_plane_replay_token_consumptions_pkey PRIMARY KEY (id);


--
-- Name: control_plane_triage_acknowledgements control_plane_triage_acknowledgements_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.control_plane_triage_acknowledgements
    ADD CONSTRAINT control_plane_triage_acknowledgements_pkey PRIMARY KEY (id);


--
-- Name: control_policy_sets control_policy_sets_merchant_id_name_version_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.control_policy_sets
    ADD CONSTRAINT control_policy_sets_merchant_id_name_version_key UNIQUE (merchant_id, name, version);


--
-- Name: control_policy_sets control_policy_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.control_policy_sets
    ADD CONSTRAINT control_policy_sets_pkey PRIMARY KEY (id);


--
-- Name: control_policy_simulations control_policy_simulations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.control_policy_simulations
    ADD CONSTRAINT control_policy_simulations_pkey PRIMARY KEY (id);


--
-- Name: conversation_locks conversation_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.conversation_locks
    ADD CONSTRAINT conversation_locks_pkey PRIMARY KEY (conversation_id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: copilot_action_approvals copilot_action_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.copilot_action_approvals
    ADD CONSTRAINT copilot_action_approvals_pkey PRIMARY KEY (action_id);


--
-- Name: copilot_history copilot_history_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.copilot_history
    ADD CONSTRAINT copilot_history_pkey PRIMARY KEY (id);


--
-- Name: copilot_pending_actions copilot_pending_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.copilot_pending_actions
    ADD CONSTRAINT copilot_pending_actions_pkey PRIMARY KEY (id);


--
-- Name: custom_segments custom_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.custom_segments
    ADD CONSTRAINT custom_segments_pkey PRIMARY KEY (id);


--
-- Name: customer_memory customer_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_memory
    ADD CONSTRAINT customer_memory_pkey PRIMARY KEY (id);


--
-- Name: customer_points customer_points_merchant_id_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_points
    ADD CONSTRAINT customer_points_merchant_id_customer_id_key UNIQUE (merchant_id, customer_id);


--
-- Name: customer_points customer_points_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_points
    ADD CONSTRAINT customer_points_pkey PRIMARY KEY (id);


--
-- Name: customer_referrals customer_referrals_merchant_id_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_referrals
    ADD CONSTRAINT customer_referrals_merchant_id_referral_code_key UNIQUE (merchant_id, referral_code);


--
-- Name: customer_referrals customer_referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_referrals
    ADD CONSTRAINT customer_referrals_pkey PRIMARY KEY (id);


--
-- Name: customer_risk_scores customer_risk_scores_merchant_id_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_risk_scores
    ADD CONSTRAINT customer_risk_scores_merchant_id_customer_id_key UNIQUE (merchant_id, customer_id);


--
-- Name: customer_risk_scores customer_risk_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_risk_scores
    ADD CONSTRAINT customer_risk_scores_pkey PRIMARY KEY (id);


--
-- Name: customer_segments customer_segments_merchant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_segments
    ADD CONSTRAINT customer_segments_merchant_id_name_key UNIQUE (merchant_id, name);


--
-- Name: customer_segments customer_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_segments
    ADD CONSTRAINT customer_segments_pkey PRIMARY KEY (id);


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
-- Name: customers customers_merchant_id_sender_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_merchant_id_sender_id_key UNIQUE (merchant_id, sender_id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: data_requests data_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.data_requests
    ADD CONSTRAINT data_requests_pkey PRIMARY KEY (id);


--
-- Name: delivery_drivers delivery_drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_drivers
    ADD CONSTRAINT delivery_drivers_pkey PRIMARY KEY (id);


--
-- Name: delivery_eta_config delivery_eta_config_merchant_id_area_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_eta_config
    ADD CONSTRAINT delivery_eta_config_merchant_id_area_name_key UNIQUE (merchant_id, area_name);


--
-- Name: delivery_eta_config delivery_eta_config_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_eta_config
    ADD CONSTRAINT delivery_eta_config_pkey PRIMARY KEY (id);


--
-- Name: delivery_execution_events delivery_execution_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_execution_events
    ADD CONSTRAINT delivery_execution_events_pkey PRIMARY KEY (id);


--
-- Name: delivery_location_timeline delivery_location_timeline_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_location_timeline
    ADD CONSTRAINT delivery_location_timeline_pkey PRIMARY KEY (id);


--
-- Name: delivery_outcomes delivery_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_outcomes
    ADD CONSTRAINT delivery_outcomes_pkey PRIMARY KEY (id);


--
-- Name: delivery_pod_records delivery_pod_records_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_pod_records
    ADD CONSTRAINT delivery_pod_records_pkey PRIMARY KEY (id);


--
-- Name: delivery_sla_events delivery_sla_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_sla_events
    ADD CONSTRAINT delivery_sla_events_pkey PRIMARY KEY (id);


--
-- Name: demand_forecast_history demand_forecast_history_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.demand_forecast_history
    ADD CONSTRAINT demand_forecast_history_pkey PRIMARY KEY (merchant_id, product_id, sales_date);


--
-- Name: demand_forecasts demand_forecasts_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.demand_forecasts
    ADD CONSTRAINT demand_forecasts_pkey PRIMARY KEY (id);


--
-- Name: dlq_events dlq_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.dlq_events
    ADD CONSTRAINT dlq_events_pkey PRIMARY KEY (id);


--
-- Name: entitlement_changes entitlement_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.entitlement_changes
    ADD CONSTRAINT entitlement_changes_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: expiry_alerts expiry_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.expiry_alerts
    ADD CONSTRAINT expiry_alerts_pkey PRIMARY KEY (id);


--
-- Name: feature_requests feature_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.feature_requests
    ADD CONSTRAINT feature_requests_pkey PRIMARY KEY (id);


--
-- Name: finance_insights finance_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.finance_insights
    ADD CONSTRAINT finance_insights_pkey PRIMARY KEY (id);


--
-- Name: finance_snapshots finance_snapshots_merchant_id_snapshot_date_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.finance_snapshots
    ADD CONSTRAINT finance_snapshots_merchant_id_snapshot_date_key UNIQUE (merchant_id, snapshot_date);


--
-- Name: finance_snapshots finance_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.finance_snapshots
    ADD CONSTRAINT finance_snapshots_pkey PRIMARY KEY (id);


--
-- Name: followups followups_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_pkey PRIMARY KEY (id);


--
-- Name: forecast_model_metrics forecast_model_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.forecast_model_metrics
    ADD CONSTRAINT forecast_model_metrics_pkey PRIMARY KEY (id);


--
-- Name: forecast_predictions forecast_predictions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.forecast_predictions
    ADD CONSTRAINT forecast_predictions_pkey PRIMARY KEY (id);


--
-- Name: forecast_runs forecast_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.forecast_runs
    ADD CONSTRAINT forecast_runs_pkey PRIMARY KEY (id);


--
-- Name: gift_card_transactions gift_card_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.gift_card_transactions
    ADD CONSTRAINT gift_card_transactions_pkey PRIMARY KEY (id);


--
-- Name: gift_cards gift_cards_merchant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_merchant_id_code_key UNIQUE (merchant_id, code);


--
-- Name: gift_cards gift_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_pkey PRIMARY KEY (id);


--
-- Name: idempotency_records idempotency_records_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.idempotency_records
    ADD CONSTRAINT idempotency_records_pkey PRIMARY KEY (key);


--
-- Name: inbound_webhook_events inbound_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inbound_webhook_events
    ADD CONSTRAINT inbound_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: integration_endpoints integration_endpoints_merchant_id_provider_type_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.integration_endpoints
    ADD CONSTRAINT integration_endpoints_merchant_id_provider_type_key UNIQUE (merchant_id, provider, type);


--
-- Name: integration_endpoints integration_endpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.integration_endpoints
    ADD CONSTRAINT integration_endpoints_pkey PRIMARY KEY (id);


--
-- Name: integration_events integration_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.integration_events
    ADD CONSTRAINT integration_events_pkey PRIMARY KEY (id);


--
-- Name: inventory_alerts inventory_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_alerts
    ADD CONSTRAINT inventory_alerts_pkey PRIMARY KEY (id);


--
-- Name: inventory_cost_layers inventory_cost_layers_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_cost_layers
    ADD CONSTRAINT inventory_cost_layers_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_merchant_id_sku_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_merchant_id_sku_key UNIQUE (merchant_id, sku);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_lots inventory_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_lots
    ADD CONSTRAINT inventory_lots_pkey PRIMARY KEY (id);


--
-- Name: inventory_movements inventory_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);


--
-- Name: inventory_stock_by_location inventory_stock_by_location_merchant_id_variant_id_location_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_stock_by_location
    ADD CONSTRAINT inventory_stock_by_location_merchant_id_variant_id_location_key UNIQUE (merchant_id, variant_id, location_id);


--
-- Name: inventory_stock_by_location inventory_stock_by_location_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_stock_by_location
    ADD CONSTRAINT inventory_stock_by_location_pkey PRIMARY KEY (id);


--
-- Name: inventory_top_movers inventory_top_movers_merchant_id_period_period_start_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_top_movers
    ADD CONSTRAINT inventory_top_movers_merchant_id_period_period_start_key UNIQUE (merchant_id, period, period_start);


--
-- Name: inventory_top_movers inventory_top_movers_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_top_movers
    ADD CONSTRAINT inventory_top_movers_pkey PRIMARY KEY (id);


--
-- Name: inventory_variants inventory_variants_merchant_id_sku_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_variants
    ADD CONSTRAINT inventory_variants_merchant_id_sku_key UNIQUE (merchant_id, sku);


--
-- Name: inventory_variants inventory_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_variants
    ADD CONSTRAINT inventory_variants_pkey PRIMARY KEY (id);


--
-- Name: item_recipes item_recipes_merchant_id_catalog_item_id_ingredient_invento_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.item_recipes
    ADD CONSTRAINT item_recipes_merchant_id_catalog_item_id_ingredient_invento_key UNIQUE (merchant_id, catalog_item_id, ingredient_inventory_item_id);


--
-- Name: item_recipes item_recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.item_recipes
    ADD CONSTRAINT item_recipes_pkey PRIMARY KEY (id);


--
-- Name: job_failure_events job_failure_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.job_failure_events
    ADD CONSTRAINT job_failure_events_pkey PRIMARY KEY (id);


--
-- Name: kb_embedding_jobs kb_embedding_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.kb_embedding_jobs
    ADD CONSTRAINT kb_embedding_jobs_pkey PRIMARY KEY (id);


--
-- Name: known_areas known_areas_city_area_name_ar_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.known_areas
    ADD CONSTRAINT known_areas_city_area_name_ar_key UNIQUE (city, area_name_ar);


--
-- Name: known_areas known_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.known_areas
    ADD CONSTRAINT known_areas_pkey PRIMARY KEY (id);


--
-- Name: loyalty_tiers loyalty_tiers_merchant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.loyalty_tiers
    ADD CONSTRAINT loyalty_tiers_merchant_id_name_key UNIQUE (merchant_id, name);


--
-- Name: loyalty_tiers loyalty_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.loyalty_tiers
    ADD CONSTRAINT loyalty_tiers_pkey PRIMARY KEY (id);


--
-- Name: margin_alerts margin_alerts_merchant_id_alert_type_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.margin_alerts
    ADD CONSTRAINT margin_alerts_merchant_id_alert_type_key UNIQUE (merchant_id, alert_type);


--
-- Name: margin_alerts margin_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.margin_alerts
    ADD CONSTRAINT margin_alerts_pkey PRIMARY KEY (id);


--
-- Name: merchant_addons merchant_addons_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_addons
    ADD CONSTRAINT merchant_addons_pkey PRIMARY KEY (id);


--
-- Name: merchant_agent_subscriptions merchant_agent_subscriptions_merchant_id_agent_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_agent_subscriptions
    ADD CONSTRAINT merchant_agent_subscriptions_merchant_id_agent_name_key UNIQUE (merchant_id, agent_name);


--
-- Name: merchant_agent_subscriptions merchant_agent_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_agent_subscriptions
    ADD CONSTRAINT merchant_agent_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: merchant_api_keys merchant_api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_api_keys
    ADD CONSTRAINT merchant_api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: merchant_api_keys merchant_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_api_keys
    ADD CONSTRAINT merchant_api_keys_pkey PRIMARY KEY (id);


--
-- Name: merchant_automations merchant_automations_merchant_id_automation_type_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_automations
    ADD CONSTRAINT merchant_automations_merchant_id_automation_type_key UNIQUE (merchant_id, automation_type);


--
-- Name: merchant_automations merchant_automations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_automations
    ADD CONSTRAINT merchant_automations_pkey PRIMARY KEY (id);


--
-- Name: merchant_branches merchant_branches_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_branches
    ADD CONSTRAINT merchant_branches_pkey PRIMARY KEY (id);


--
-- Name: merchant_business_rules merchant_business_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_business_rules
    ADD CONSTRAINT merchant_business_rules_pkey PRIMARY KEY (id);


--
-- Name: merchant_command_channels merchant_command_channels_merchant_id_phone_number_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_command_channels
    ADD CONSTRAINT merchant_command_channels_merchant_id_phone_number_key UNIQUE (merchant_id, phone_number);


--
-- Name: merchant_command_channels merchant_command_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_command_channels
    ADD CONSTRAINT merchant_command_channels_pkey PRIMARY KEY (id);


--
-- Name: merchant_deletion_requests merchant_deletion_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_deletion_requests
    ADD CONSTRAINT merchant_deletion_requests_pkey PRIMARY KEY (id);


--
-- Name: merchant_kb_chunks merchant_kb_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_kb_chunks
    ADD CONSTRAINT merchant_kb_chunks_pkey PRIMARY KEY (id);


--
-- Name: merchant_notifications merchant_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_notifications
    ADD CONSTRAINT merchant_notifications_pkey PRIMARY KEY (id);


--
-- Name: merchant_org_policy_bindings merchant_org_policy_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_org_policy_bindings
    ADD CONSTRAINT merchant_org_policy_bindings_pkey PRIMARY KEY (id);


--
-- Name: merchant_org_staff_scopes merchant_org_staff_scopes_merchant_id_unit_id_staff_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_org_staff_scopes
    ADD CONSTRAINT merchant_org_staff_scopes_merchant_id_unit_id_staff_id_key UNIQUE (merchant_id, unit_id, staff_id);


--
-- Name: merchant_org_staff_scopes merchant_org_staff_scopes_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_org_staff_scopes
    ADD CONSTRAINT merchant_org_staff_scopes_pkey PRIMARY KEY (id);


--
-- Name: merchant_org_units merchant_org_units_merchant_id_unit_type_code_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_org_units
    ADD CONSTRAINT merchant_org_units_merchant_id_unit_type_code_key UNIQUE (merchant_id, unit_type, code);


--
-- Name: merchant_org_units merchant_org_units_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_org_units
    ADD CONSTRAINT merchant_org_units_pkey PRIMARY KEY (id);


--
-- Name: merchant_phone_numbers merchant_phone_numbers_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_phone_numbers
    ADD CONSTRAINT merchant_phone_numbers_pkey PRIMARY KEY (id);


--
-- Name: merchant_phone_numbers merchant_phone_numbers_whatsapp_number_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_phone_numbers
    ADD CONSTRAINT merchant_phone_numbers_whatsapp_number_key UNIQUE (whatsapp_number);


--
-- Name: merchant_reports merchant_reports_merchant_period_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_reports
    ADD CONSTRAINT merchant_reports_merchant_period_unique UNIQUE (merchant_id, report_date, period_type);


--
-- Name: merchant_reports merchant_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_reports
    ADD CONSTRAINT merchant_reports_pkey PRIMARY KEY (id);


--
-- Name: merchant_sales_playbooks merchant_sales_playbooks_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_sales_playbooks
    ADD CONSTRAINT merchant_sales_playbooks_pkey PRIMARY KEY (merchant_id);


--
-- Name: merchant_staff merchant_staff_invite_token_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_staff
    ADD CONSTRAINT merchant_staff_invite_token_key UNIQUE (invite_token);


--
-- Name: merchant_staff merchant_staff_merchant_id_email_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_staff
    ADD CONSTRAINT merchant_staff_merchant_id_email_key UNIQUE (merchant_id, email);


--
-- Name: merchant_staff merchant_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_staff
    ADD CONSTRAINT merchant_staff_pkey PRIMARY KEY (id);


--
-- Name: merchant_subscriptions merchant_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_subscriptions
    ADD CONSTRAINT merchant_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: merchant_tax_config merchant_tax_config_merchant_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_tax_config
    ADD CONSTRAINT merchant_tax_config_merchant_id_key UNIQUE (merchant_id);


--
-- Name: merchant_tax_config merchant_tax_config_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_tax_config
    ADD CONSTRAINT merchant_tax_config_pkey PRIMARY KEY (id);


--
-- Name: merchant_token_usage merchant_token_usage_merchant_id_usage_date_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_token_usage
    ADD CONSTRAINT merchant_token_usage_merchant_id_usage_date_key UNIQUE (merchant_id, usage_date);


--
-- Name: merchant_token_usage merchant_token_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_token_usage
    ADD CONSTRAINT merchant_token_usage_pkey PRIMARY KEY (id);


--
-- Name: merchants merchants_api_key_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_api_key_key UNIQUE (api_key);


--
-- Name: merchants merchants_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_pkey PRIMARY KEY (id);


--
-- Name: message_events message_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.message_events
    ADD CONSTRAINT message_events_pkey PRIMARY KEY (id);


--
-- Name: messages messages_merchant_id_provider_message_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_merchant_id_provider_message_id_key UNIQUE (merchant_id, provider_message_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: monthly_close_governance_ledger monthly_close_governance_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.monthly_close_governance_ledger
    ADD CONSTRAINT monthly_close_governance_ledger_pkey PRIMARY KEY (id);


--
-- Name: monthly_close_packets monthly_close_packets_merchant_id_year_month_snapshot_hash_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.monthly_close_packets
    ADD CONSTRAINT monthly_close_packets_merchant_id_year_month_snapshot_hash_key UNIQUE (merchant_id, year, month, snapshot_hash);


--
-- Name: monthly_close_packets monthly_close_packets_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.monthly_close_packets
    ADD CONSTRAINT monthly_close_packets_pkey PRIMARY KEY (id);


--
-- Name: monthly_closes monthly_closes_merchant_id_year_month_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.monthly_closes
    ADD CONSTRAINT monthly_closes_merchant_id_year_month_key UNIQUE (merchant_id, year, month);


--
-- Name: monthly_closes monthly_closes_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.monthly_closes
    ADD CONSTRAINT monthly_closes_pkey PRIMARY KEY (id);


--
-- Name: notification_delivery_log notification_delivery_log_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notification_delivery_log
    ADD CONSTRAINT notification_delivery_log_pkey PRIMARY KEY (id);


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
-- Name: notification_preferences notification_preferences_pkey1; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey1 PRIMARY KEY (id);


--
-- Name: notification_templates notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: objection_templates objection_templates_merchant_id_objection_type_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.objection_templates
    ADD CONSTRAINT objection_templates_merchant_id_objection_type_key UNIQUE (merchant_id, objection_type);


--
-- Name: objection_templates objection_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.objection_templates
    ADD CONSTRAINT objection_templates_pkey PRIMARY KEY (id);


--
-- Name: ocr_verification_rules ocr_verification_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.ocr_verification_rules
    ADD CONSTRAINT ocr_verification_rules_pkey PRIMARY KEY (id);


--
-- Name: order_ingredient_deductions order_ingredient_deductions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.order_ingredient_deductions
    ADD CONSTRAINT order_ingredient_deductions_pkey PRIMARY KEY (id);


--
-- Name: order_payments order_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.order_payments
    ADD CONSTRAINT order_payments_pkey PRIMARY KEY (id);


--
-- Name: orders orders_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: orders orders_merchant_id_order_number_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_merchant_id_order_number_key UNIQUE (merchant_id, order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: outbox_events outbox_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (id);


--
-- Name: payment_links payment_links_link_code_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_link_code_key UNIQUE (link_code);


--
-- Name: payment_links payment_links_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_pkey PRIMARY KEY (id);


--
-- Name: payment_proofs payment_proofs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payment_proofs
    ADD CONSTRAINT payment_proofs_pkey PRIMARY KEY (id);


--
-- Name: permission_templates permission_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.permission_templates
    ADD CONSTRAINT permission_templates_pkey PRIMARY KEY (id);


--
-- Name: plan_entitlements plan_entitlements_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.plan_entitlements
    ADD CONSTRAINT plan_entitlements_pkey PRIMARY KEY (id);


--
-- Name: plan_entitlements plan_entitlements_plan_id_feature_key_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.plan_entitlements
    ADD CONSTRAINT plan_entitlements_plan_id_feature_key_key UNIQUE (plan_id, feature_key);


--
-- Name: plan_limits plan_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.plan_limits
    ADD CONSTRAINT plan_limits_pkey PRIMARY KEY (id);


--
-- Name: plan_limits plan_limits_plan_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.plan_limits
    ADD CONSTRAINT plan_limits_plan_id_key UNIQUE (plan_id);


--
-- Name: plan_prices plan_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.plan_prices
    ADD CONSTRAINT plan_prices_pkey PRIMARY KEY (id);


--
-- Name: plan_prices plan_prices_plan_id_region_code_cycle_months_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.plan_prices
    ADD CONSTRAINT plan_prices_plan_id_region_code_cycle_months_key UNIQUE (plan_id, region_code, cycle_months);


--
-- Name: planner_run_ledger planner_run_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.planner_run_ledger
    ADD CONSTRAINT planner_run_ledger_pkey PRIMARY KEY (id);


--
-- Name: planner_trigger_policies planner_trigger_policies_merchant_id_trigger_type_trigger_k_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.planner_trigger_policies
    ADD CONSTRAINT planner_trigger_policies_merchant_id_trigger_type_trigger_k_key UNIQUE (merchant_id, trigger_type, trigger_key);


--
-- Name: planner_trigger_policies planner_trigger_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.planner_trigger_policies
    ADD CONSTRAINT planner_trigger_policies_pkey PRIMARY KEY (id);


--
-- Name: plans plans_code_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_code_key UNIQUE (code);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: points_transactions points_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.points_transactions
    ADD CONSTRAINT points_transactions_pkey PRIMARY KEY (id);


--
-- Name: pos_integrations pos_integrations_merchant_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pos_integrations
    ADD CONSTRAINT pos_integrations_merchant_id_provider_key UNIQUE (merchant_id, provider);


--
-- Name: pos_integrations pos_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pos_integrations
    ADD CONSTRAINT pos_integrations_pkey PRIMARY KEY (id);


--
-- Name: proactive_alert_configs proactive_alert_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.proactive_alert_configs
    ADD CONSTRAINT proactive_alert_configs_pkey PRIMARY KEY (id);


--
-- Name: product_cogs product_cogs_merchant_id_product_id_effective_from_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.product_cogs
    ADD CONSTRAINT product_cogs_merchant_id_product_id_effective_from_key UNIQUE (merchant_id, product_id, effective_from);


--
-- Name: product_cogs product_cogs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.product_cogs
    ADD CONSTRAINT product_cogs_pkey PRIMARY KEY (id);


--
-- Name: product_media product_media_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_pkey PRIMARY KEY (id);


--
-- Name: product_ocr_confirmations product_ocr_confirmations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.product_ocr_confirmations
    ADD CONSTRAINT product_ocr_confirmations_pkey PRIMARY KEY (id);


--
-- Name: promotion_usage promotion_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.promotion_usage
    ADD CONSTRAINT promotion_usage_pkey PRIMARY KEY (id);


--
-- Name: promotions promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_pkey PRIMARY KEY (id);


--
-- Name: proof_requests proof_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.proof_requests
    ADD CONSTRAINT proof_requests_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: quote_request_events quote_request_events_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.quote_request_events
    ADD CONSTRAINT quote_request_events_pkey PRIMARY KEY (id);


--
-- Name: quote_requests quote_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.quote_requests
    ADD CONSTRAINT quote_requests_pkey PRIMARY KEY (id);


--
-- Name: rate_limit_counters rate_limit_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.rate_limit_counters
    ADD CONSTRAINT rate_limit_counters_pkey PRIMARY KEY (id);


--
-- Name: rate_limit_violations rate_limit_violations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.rate_limit_violations
    ADD CONSTRAINT rate_limit_violations_pkey PRIMARY KEY (id);


--
-- Name: recovered_carts recovered_carts_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.recovered_carts
    ADD CONSTRAINT recovered_carts_pkey PRIMARY KEY (id);


--
-- Name: replenishment_recommendations replenishment_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.replenishment_recommendations
    ADD CONSTRAINT replenishment_recommendations_pkey PRIMARY KEY (id);


--
-- Name: segment_memberships segment_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.segment_memberships
    ADD CONSTRAINT segment_memberships_pkey PRIMARY KEY (segment_id, customer_id);


--
-- Name: shipments shipments_order_id_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_order_id_key UNIQUE (order_id);


--
-- Name: shipments shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);


--
-- Name: shrinkage_records shrinkage_records_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.shrinkage_records
    ADD CONSTRAINT shrinkage_records_pkey PRIMARY KEY (id);


--
-- Name: sku_merge_log sku_merge_log_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.sku_merge_log
    ADD CONSTRAINT sku_merge_log_pkey PRIMARY KEY (id);


--
-- Name: staff_sessions staff_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.staff_sessions
    ADD CONSTRAINT staff_sessions_pkey PRIMARY KEY (id);


--
-- Name: staff_sessions staff_sessions_refresh_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.staff_sessions
    ADD CONSTRAINT staff_sessions_refresh_token_hash_key UNIQUE (refresh_token_hash);


--
-- Name: stock_alerts stock_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.stock_alerts
    ADD CONSTRAINT stock_alerts_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: stock_reservations stock_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.stock_reservations
    ADD CONSTRAINT stock_reservations_pkey PRIMARY KEY (id);


--
-- Name: subscription_add_ons subscription_add_ons_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscription_add_ons
    ADD CONSTRAINT subscription_add_ons_pkey PRIMARY KEY (id);


--
-- Name: subscription_offers subscription_offers_code_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscription_offers
    ADD CONSTRAINT subscription_offers_code_key UNIQUE (code);


--
-- Name: subscription_offers subscription_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscription_offers
    ADD CONSTRAINT subscription_offers_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: substitution_suggestions substitution_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.substitution_suggestions
    ADD CONSTRAINT substitution_suggestions_pkey PRIMARY KEY (id);


--
-- Name: supplier_discovery_results supplier_discovery_results_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.supplier_discovery_results
    ADD CONSTRAINT supplier_discovery_results_pkey PRIMARY KEY (id);


--
-- Name: supplier_imports supplier_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.supplier_imports
    ADD CONSTRAINT supplier_imports_pkey PRIMARY KEY (id);


--
-- Name: supplier_products supplier_products_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.supplier_products
    ADD CONSTRAINT supplier_products_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: system_health_log system_health_log_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.system_health_log
    ADD CONSTRAINT system_health_log_pkey PRIMARY KEY (id);


--
-- Name: tax_reports tax_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tax_reports
    ADD CONSTRAINT tax_reports_pkey PRIMARY KEY (id);


--
-- Name: team_tasks team_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.team_tasks
    ADD CONSTRAINT team_tasks_pkey PRIMARY KEY (id);


--
-- Name: twilio_message_log twilio_message_log_message_sid_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.twilio_message_log
    ADD CONSTRAINT twilio_message_log_message_sid_key UNIQUE (message_sid);


--
-- Name: twilio_message_log twilio_message_log_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.twilio_message_log
    ADD CONSTRAINT twilio_message_log_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions unique_push_endpoint; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT unique_push_endpoint UNIQUE (endpoint);


--
-- Name: notification_templates unique_template_name; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT unique_template_name UNIQUE (merchant_id, name);


--
-- Name: upsell_rules upsell_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.upsell_rules
    ADD CONSTRAINT upsell_rules_pkey PRIMARY KEY (id);


--
-- Name: control_plane_replay_token_consumptions uq_control_plane_replay_token_consumptions_hash; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.control_plane_replay_token_consumptions
    ADD CONSTRAINT uq_control_plane_replay_token_consumptions_hash UNIQUE (merchant_id, preview_token_hash);


--
-- Name: quote_requests uq_quote_feature_request; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.quote_requests
    ADD CONSTRAINT uq_quote_feature_request UNIQUE (feature_request_id);


--
-- Name: usage_ledger usage_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usage_ledger
    ADD CONSTRAINT usage_ledger_pkey PRIMARY KEY (id);


--
-- Name: usage_pack_prices usage_pack_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usage_pack_prices
    ADD CONSTRAINT usage_pack_prices_pkey PRIMARY KEY (id);


--
-- Name: usage_pack_prices usage_pack_prices_usage_pack_id_region_code_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usage_pack_prices
    ADD CONSTRAINT usage_pack_prices_usage_pack_id_region_code_key UNIQUE (usage_pack_id, region_code);


--
-- Name: usage_packs usage_packs_code_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usage_packs
    ADD CONSTRAINT usage_packs_code_key UNIQUE (code);


--
-- Name: usage_packs usage_packs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usage_packs
    ADD CONSTRAINT usage_packs_pkey PRIMARY KEY (id);


--
-- Name: usage_period_aggregates usage_period_aggregates_merchant_id_metric_key_period_type__key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usage_period_aggregates
    ADD CONSTRAINT usage_period_aggregates_merchant_id_metric_key_period_type__key UNIQUE (merchant_id, metric_key, period_type, period_start);


--
-- Name: usage_period_aggregates usage_period_aggregates_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usage_period_aggregates
    ADD CONSTRAINT usage_period_aggregates_pkey PRIMARY KEY (id);


--
-- Name: notifications valid_type; Type: CHECK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE public.notifications
    ADD CONSTRAINT valid_type CHECK (((type)::text = ANY ((ARRAY['ORDER_PLACED'::character varying, 'ORDER_CONFIRMED'::character varying, 'ORDER_SHIPPED'::character varying, 'ORDER_DELIVERED'::character varying, 'LOW_STOCK'::character varying, 'OUT_OF_STOCK'::character varying, 'NEW_CONVERSATION'::character varying, 'ESCALATED_CONVERSATION'::character varying, 'PAYMENT_RECEIVED'::character varying, 'PAYMENT_FAILED'::character varying, 'NEW_REVIEW'::character varying, 'NEW_CUSTOMER'::character varying, 'DAILY_SUMMARY'::character varying, 'WEEKLY_REPORT'::character varying, 'PROMOTION_ENDING'::character varying, 'MILESTONE_REACHED'::character varying, 'SYSTEM_ALERT'::character varying, 'SECURITY_ALERT'::character varying, 'ANOMALY_ALERT'::character varying])::text[]))) NOT VALID;


--
-- Name: vip_rules vip_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vip_rules
    ADD CONSTRAINT vip_rules_pkey PRIMARY KEY (id);


--
-- Name: voice_calls voice_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.voice_calls
    ADD CONSTRAINT voice_calls_pkey PRIMARY KEY (id);


--
-- Name: voice_transcriptions voice_transcriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.voice_transcriptions
    ADD CONSTRAINT voice_transcriptions_pkey PRIMARY KEY (id);


--
-- Name: warehouse_locations warehouse_locations_merchant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.warehouse_locations
    ADD CONSTRAINT warehouse_locations_merchant_id_name_key UNIQUE (merchant_id, name);


--
-- Name: warehouse_locations warehouse_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.warehouse_locations
    ADD CONSTRAINT warehouse_locations_pkey PRIMARY KEY (id);


--
-- Name: webhook_deliveries webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);


--
-- Name: webhooks webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);


--
-- Name: what_if_scenarios what_if_scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.what_if_scenarios
    ADD CONSTRAINT what_if_scenarios_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_conversation_windows whatsapp_conversation_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.whatsapp_conversation_windows
    ADD CONSTRAINT whatsapp_conversation_windows_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_message_log whatsapp_message_log_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.whatsapp_message_log
    ADD CONSTRAINT whatsapp_message_log_pkey PRIMARY KEY (id);


--
-- Name: idx_addon_prices_addon_region_cycle; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_addon_prices_addon_region_cycle ON public.add_on_prices USING btree (addon_id, region_code, cycle_months);


--
-- Name: idx_address_cache_raw; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_address_cache_raw ON public.address_cache USING hash (raw_text);


--
-- Name: idx_agent_actions_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_actions_merchant ON public.agent_actions USING btree (merchant_id, created_at DESC);


--
-- Name: idx_agent_actions_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_actions_type ON public.agent_actions USING btree (merchant_id, agent_type, created_at DESC);


--
-- Name: idx_agent_actions_unack; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_actions_unack ON public.agent_actions USING btree (merchant_id) WHERE (merchant_ack = false);


--
-- Name: idx_agent_results_task; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_results_task ON public.agent_results USING btree (task_id);


--
-- Name: idx_agent_subs_enabled; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_subs_enabled ON public.merchant_agent_subscriptions USING btree (agent_name, enabled) WHERE (enabled = true);


--
-- Name: idx_agent_subs_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_subs_merchant ON public.merchant_agent_subscriptions USING btree (merchant_id);


--
-- Name: idx_agent_subscription_audit_changed_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_subscription_audit_changed_at ON public.agent_subscription_audit USING btree (changed_at);


--
-- Name: idx_agent_subscription_audit_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_subscription_audit_merchant ON public.agent_subscription_audit USING btree (merchant_id);


--
-- Name: idx_agent_tasks_agent_v3; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_tasks_agent_v3 ON public.agent_tasks USING btree (agent_type, status);


--
-- Name: idx_agent_tasks_correlation_v2; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_tasks_correlation_v2 ON public.agent_tasks USING btree (correlation_id) WHERE (correlation_id IS NOT NULL);


--
-- Name: idx_agent_tasks_event_v2; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_tasks_event_v2 ON public.agent_tasks USING btree (event_id) WHERE (event_id IS NOT NULL);


--
-- Name: idx_agent_tasks_merchant_v2; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_tasks_merchant_v2 ON public.agent_tasks USING btree (merchant_id, agent_name) WHERE (agent_name IS NOT NULL);


--
-- Name: idx_agent_tasks_scheduled; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_tasks_scheduled ON public.agent_tasks USING btree (scheduled_at) WHERE (status = 'PENDING'::public.task_status);


--
-- Name: idx_agent_tasks_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_tasks_status ON public.agent_tasks USING btree (status) WHERE (status = ANY (ARRAY['PENDING'::public.task_status, 'PROCESSING'::public.task_status]));


--
-- Name: idx_agent_tasks_status_pending; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_tasks_status_pending ON public.agent_tasks USING btree (status, created_at) WHERE (status = 'PENDING'::public.task_status);


--
-- Name: idx_agent_tasks_status_v2; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_tasks_status_v2 ON public.agent_tasks USING btree (status, next_run_at) WHERE (status = ANY (ARRAY['PENDING'::public.task_status, 'FAILED'::public.task_status]));


--
-- Name: idx_agent_tasks_timeout; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_agent_tasks_timeout ON public.agent_tasks USING btree (timeout_at) WHERE (timeout_at IS NOT NULL);


--
-- Name: idx_ai_decisions_entity; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_ai_decisions_entity ON public.ai_decision_log USING btree (entity_type, entity_id);


--
-- Name: idx_ai_decisions_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_ai_decisions_merchant ON public.ai_decision_log USING btree (merchant_id, created_at DESC);


--
-- Name: idx_ai_decisions_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_ai_decisions_type ON public.ai_decision_log USING btree (merchant_id, decision_type, created_at DESC);


--
-- Name: idx_ai_metrics_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_ai_metrics_merchant ON public.ai_call_metrics USING btree (merchant_id, created_at DESC);


--
-- Name: idx_ai_metrics_service; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_ai_metrics_service ON public.ai_call_metrics USING btree (service_name, created_at DESC);


--
-- Name: idx_analytics_events_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_analytics_events_created ON public.analytics_events USING btree (created_at DESC);


--
-- Name: idx_analytics_events_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_analytics_events_merchant ON public.analytics_events USING btree (merchant_id);


--
-- Name: idx_analytics_events_name; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_analytics_events_name ON public.analytics_events USING btree (event_name);


--
-- Name: idx_api_keys_hash; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_api_keys_hash ON public.merchant_api_keys USING btree (key_hash);


--
-- Name: idx_api_keys_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_api_keys_merchant ON public.merchant_api_keys USING btree (merchant_id);


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_audit_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_audit_created ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_audit_merchant ON public.audit_logs USING btree (merchant_id);


--
-- Name: idx_audit_merchant_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_audit_merchant_created ON public.audit_logs USING btree (merchant_id, created_at DESC);


--
-- Name: idx_audit_resource; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_audit_resource ON public.audit_logs USING btree (resource, resource_id);


--
-- Name: idx_audit_staff; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_audit_staff ON public.audit_logs USING btree (staff_id);


--
-- Name: idx_automation_run_logs_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_automation_run_logs_merchant ON public.automation_run_logs USING btree (merchant_id, automation_type, run_at DESC);


--
-- Name: idx_bg_branch; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_bg_branch ON public.branch_goals USING btree (branch_id);


--
-- Name: idx_bg_dates; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_bg_dates ON public.branch_goals USING btree (branch_id, start_date, end_date);


--
-- Name: idx_bg_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_bg_merchant ON public.branch_goals USING btree (merchant_id);


--
-- Name: idx_branches_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_branches_merchant ON public.merchant_branches USING btree (merchant_id);


--
-- Name: idx_branches_merchant_active; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_branches_merchant_active ON public.merchant_branches USING btree (merchant_id, is_active);


--
-- Name: idx_bsa_branch; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_bsa_branch ON public.branch_staff_assignments USING btree (branch_id);


--
-- Name: idx_bsa_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_bsa_merchant ON public.branch_staff_assignments USING btree (merchant_id);


--
-- Name: idx_bsa_staff; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_bsa_staff ON public.branch_staff_assignments USING btree (staff_id);


--
-- Name: idx_bulk_ops_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_bulk_ops_created ON public.bulk_operations USING btree (created_at);


--
-- Name: idx_bulk_ops_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_bulk_ops_merchant ON public.bulk_operations USING btree (merchant_id);


--
-- Name: idx_bulk_ops_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_bulk_ops_status ON public.bulk_operations USING btree (status);


--
-- Name: idx_business_rules_merchant_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_business_rules_merchant_type ON public.merchant_business_rules USING btree (merchant_id, rule_type) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_call_followup_workflow_events_call_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_call_followup_workflow_events_call_created ON public.call_followup_workflow_events USING btree (call_id, created_at DESC);


--
-- Name: idx_call_followup_workflow_events_merchant_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_call_followup_workflow_events_merchant_created ON public.call_followup_workflow_events USING btree (merchant_id, created_at DESC);


--
-- Name: idx_call_followup_workflows_callback_due; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_call_followup_workflows_callback_due ON public.call_followup_workflows USING btree (merchant_id, callback_due_at) WHERE (callback_due_at IS NOT NULL);


--
-- Name: idx_call_followup_workflows_merchant_state; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_call_followup_workflows_merchant_state ON public.call_followup_workflows USING btree (merchant_id, state, updated_at DESC);


--
-- Name: idx_callback_campaign_bridge_items_bridge; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_callback_campaign_bridge_items_bridge ON public.callback_campaign_bridge_items USING btree (bridge_id, created_at);


--
-- Name: idx_callback_campaign_bridge_items_merchant_call; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_callback_campaign_bridge_items_merchant_call ON public.callback_campaign_bridge_items USING btree (merchant_id, call_id);


--
-- Name: idx_callback_campaign_bridge_items_workflow_event; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_callback_campaign_bridge_items_workflow_event ON public.callback_campaign_bridge_items USING btree (workflow_event_id) WHERE (workflow_event_id IS NOT NULL);


--
-- Name: idx_callback_campaign_bridges_merchant_status_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_callback_campaign_bridges_merchant_status_created ON public.callback_campaign_bridges USING btree (merchant_id, status, created_at DESC);


--
-- Name: idx_cashflow_forecast; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cashflow_forecast ON public.cash_flow_forecasts USING btree (merchant_id, forecast_date);


--
-- Name: idx_catalog_available; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_catalog_available ON public.catalog_items USING btree (merchant_id, is_available);


--
-- Name: idx_catalog_category; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_catalog_category ON public.catalog_items USING btree (merchant_id, category);


--
-- Name: idx_catalog_embedding_hnsw; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_catalog_embedding_hnsw ON public.catalog_items USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_catalog_items_is_active; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_catalog_items_is_active ON public.catalog_items USING btree (merchant_id, is_active);


--
-- Name: idx_catalog_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_catalog_merchant ON public.catalog_items USING btree (merchant_id);


--
-- Name: idx_catalog_name_ar; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_catalog_name_ar ON public.catalog_items USING gin (name_ar public.gin_trgm_ops);


--
-- Name: idx_catalog_name_en; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_catalog_name_en ON public.catalog_items USING gin (name_en public.gin_trgm_ops);


--
-- Name: idx_catalog_tags; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_catalog_tags ON public.catalog_items USING gin (tags);


--
-- Name: idx_cod_collections_branch; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cod_collections_branch ON public.cod_collections USING btree (branch_id) WHERE (branch_id IS NOT NULL);


--
-- Name: idx_cod_collections_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cod_collections_date ON public.cod_collections USING btree (merchant_id, collection_date);


--
-- Name: idx_cod_collections_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cod_collections_merchant ON public.cod_collections USING btree (merchant_id, status);


--
-- Name: idx_cod_finance_actions_merchant_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cod_finance_actions_merchant_created ON public.cod_finance_actions USING btree (merchant_id, created_at DESC);


--
-- Name: idx_cod_finance_actions_merchant_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cod_finance_actions_merchant_type ON public.cod_finance_actions USING btree (merchant_id, action_type, created_at DESC);


--
-- Name: idx_cod_finance_actions_order; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cod_finance_actions_order ON public.cod_finance_actions USING btree (order_id, created_at DESC);


--
-- Name: idx_cod_finance_actions_statement; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cod_finance_actions_statement ON public.cod_finance_actions USING btree (statement_id, created_at DESC);


--
-- Name: idx_cod_lines_order; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cod_lines_order ON public.cod_statement_lines USING btree (order_id);


--
-- Name: idx_cod_lines_statement; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cod_lines_statement ON public.cod_statement_lines USING btree (statement_id);


--
-- Name: idx_cod_reminders_pending; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cod_reminders_pending ON public.cod_reminders USING btree (merchant_id, status, scheduled_at) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_cod_statements_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cod_statements_merchant ON public.cod_statement_imports USING btree (merchant_id, statement_date DESC);


--
-- Name: idx_connector_recon_items_run_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_connector_recon_items_run_status ON public.connector_reconciliation_items USING btree (run_id, status, created_at DESC);


--
-- Name: idx_connector_recon_runs_merchant_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_connector_recon_runs_merchant_status ON public.connector_reconciliation_runs USING btree (merchant_id, status, created_at DESC);


--
-- Name: idx_connector_runtime_dlq_merchant_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_connector_runtime_dlq_merchant_status ON public.connector_runtime_dlq USING btree (merchant_id, status, moved_to_dlq_at DESC);


--
-- Name: idx_connector_runtime_events_endpoint; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_connector_runtime_events_endpoint ON public.connector_runtime_events USING btree (endpoint_id, created_at DESC);


--
-- Name: idx_connector_runtime_events_merchant_status_retry; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_connector_runtime_events_merchant_status_retry ON public.connector_runtime_events USING btree (merchant_id, status, next_retry_at);


--
-- Name: idx_connector_runtime_worker_cycles_started_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_connector_runtime_worker_cycles_started_at ON public.connector_runtime_worker_cycles USING btree (started_at DESC);


--
-- Name: idx_connector_runtime_worker_cycles_status_started; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_connector_runtime_worker_cycles_status_started ON public.connector_runtime_worker_cycles USING btree (run_status, started_at DESC);


--
-- Name: idx_connector_runtime_worker_outcomes_cycle; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_connector_runtime_worker_outcomes_cycle ON public.connector_runtime_worker_cycle_outcomes USING btree (cycle_id, merchant_id);


--
-- Name: idx_connector_runtime_worker_outcomes_merchant_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_connector_runtime_worker_outcomes_merchant_created ON public.connector_runtime_worker_cycle_outcomes USING btree (merchant_id, created_at DESC);


--
-- Name: idx_control_policy_sets_merchant_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_control_policy_sets_merchant_status ON public.control_policy_sets USING btree (merchant_id, status, updated_at DESC);


--
-- Name: idx_control_policy_simulations_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_control_policy_simulations_merchant ON public.control_policy_simulations USING btree (merchant_id, created_at DESC);


--
-- Name: idx_conversation_locks_expires; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_conversation_locks_expires ON public.conversation_locks USING btree (expires_at);


--
-- Name: idx_conversations_address_confidence; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_conversations_address_confidence ON public.conversations USING btree (merchant_id, address_confidence) WHERE ((address_confidence IS NOT NULL) AND (address_confidence < 60));


--
-- Name: idx_conversations_branch; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_conversations_branch ON public.conversations USING btree (merchant_id, branch_id);


--
-- Name: idx_conversations_channel; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_conversations_channel ON public.conversations USING btree (merchant_id, channel);


--
-- Name: idx_conversations_created_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_conversations_created_at ON public.conversations USING btree (created_at DESC);


--
-- Name: idx_conversations_followup; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_conversations_followup ON public.conversations USING btree (next_followup_at) WHERE (next_followup_at IS NOT NULL);


--
-- Name: idx_conversations_lead_score; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_conversations_lead_score ON public.conversations USING btree (merchant_id, lead_score) WHERE (lead_score IS NOT NULL);


--
-- Name: idx_conversations_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_conversations_merchant ON public.conversations USING btree (merchant_id);


--
-- Name: idx_conversations_operator; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_conversations_operator ON public.conversations USING btree (human_operator_id) WHERE (human_operator_id IS NOT NULL);


--
-- Name: idx_conversations_sender; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_conversations_sender ON public.conversations USING btree (merchant_id, sender_id);


--
-- Name: idx_conversations_state; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_conversations_state ON public.conversations USING btree (state);


--
-- Name: idx_conversations_takeover; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_conversations_takeover ON public.conversations USING btree (human_takeover) WHERE (human_takeover = true);


--
-- Name: idx_copilot_approvals_intent; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_copilot_approvals_intent ON public.copilot_action_approvals USING btree (merchant_id, intent, updated_at DESC);


--
-- Name: idx_copilot_approvals_merchant_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_copilot_approvals_merchant_status ON public.copilot_action_approvals USING btree (merchant_id, status, updated_at DESC);


--
-- Name: idx_copilot_history_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_copilot_history_created ON public.copilot_history USING btree (merchant_id, created_at DESC);


--
-- Name: idx_copilot_history_intent; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_copilot_history_intent ON public.copilot_history USING btree (merchant_id, intent);


--
-- Name: idx_copilot_history_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_copilot_history_merchant ON public.copilot_history USING btree (merchant_id);


--
-- Name: idx_copilot_pending_expires; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_copilot_pending_expires ON public.copilot_pending_actions USING btree (expires_at) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_copilot_pending_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_copilot_pending_merchant ON public.copilot_pending_actions USING btree (merchant_id);


--
-- Name: idx_copilot_pending_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_copilot_pending_status ON public.copilot_pending_actions USING btree (merchant_id, status);


--
-- Name: idx_cost_layers_fifo; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cost_layers_fifo ON public.inventory_cost_layers USING btree (merchant_id, item_id, received_at) WHERE (quantity_remaining > 0);


--
-- Name: idx_cp_replay_consumptions_replay_run; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cp_replay_consumptions_replay_run ON public.control_plane_replay_token_consumptions USING btree (merchant_id, replay_run_id);


--
-- Name: idx_cp_replay_consumptions_source_run; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cp_replay_consumptions_source_run ON public.control_plane_replay_token_consumptions USING btree (merchant_id, source_run_id, consumed_at DESC);


--
-- Name: idx_cp_triage_ack_run; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cp_triage_ack_run ON public.control_plane_triage_acknowledgements USING btree (merchant_id, run_id, acked_at DESC);


--
-- Name: idx_cp_triage_ack_trigger; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_cp_triage_ack_trigger ON public.control_plane_triage_acknowledgements USING btree (merchant_id, trigger_type, trigger_key, acked_at DESC);


--
-- Name: idx_custom_segments_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_custom_segments_merchant ON public.custom_segments USING btree (merchant_id);


--
-- Name: idx_customer_memory_lookup; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_customer_memory_lookup ON public.customer_memory USING btree (merchant_id, customer_id);


--
-- Name: idx_customer_memory_unique; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_customer_memory_unique ON public.customer_memory USING btree (merchant_id, customer_id, memory_type, memory_key);


--
-- Name: idx_customer_risk_scores; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_customer_risk_scores ON public.customer_risk_scores USING btree (merchant_id, risk_score DESC);


--
-- Name: idx_customer_tags_lookup; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_customer_tags_lookup ON public.customer_tags USING btree (merchant_id, customer_id);


--
-- Name: idx_customer_tags_tag; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_customer_tags_tag ON public.customer_tags USING btree (merchant_id, tag);


--
-- Name: idx_customers_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_customers_merchant ON public.customers USING btree (merchant_id);


--
-- Name: idx_customers_phone; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_customers_phone ON public.customers USING btree (phone);


--
-- Name: idx_customers_sender; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_customers_sender ON public.customers USING btree (merchant_id, sender_id);


--
-- Name: idx_customers_welcome_sent; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_customers_welcome_sent ON public.customers USING btree (welcome_sent_at) WHERE (welcome_sent_at IS NULL);


--
-- Name: idx_data_requests_customer; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_data_requests_customer ON public.data_requests USING btree (customer_id);


--
-- Name: idx_data_requests_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_data_requests_merchant ON public.data_requests USING btree (merchant_id);


--
-- Name: idx_data_requests_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_data_requests_status ON public.data_requests USING btree (status);


--
-- Name: idx_delivery_drivers_active; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_delivery_drivers_active ON public.delivery_drivers USING btree (merchant_id, status) WHERE ((status)::text = 'ACTIVE'::text);


--
-- Name: idx_delivery_drivers_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_delivery_drivers_merchant ON public.delivery_drivers USING btree (merchant_id);


--
-- Name: idx_delivery_events_merchant_order_time; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_delivery_events_merchant_order_time ON public.delivery_execution_events USING btree (merchant_id, order_id, event_time DESC);


--
-- Name: idx_delivery_events_merchant_type_time; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_delivery_events_merchant_type_time ON public.delivery_execution_events USING btree (merchant_id, event_type, event_time DESC);


--
-- Name: idx_delivery_location_merchant_order_time; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_delivery_location_merchant_order_time ON public.delivery_location_timeline USING btree (merchant_id, order_id, recorded_at DESC);


--
-- Name: idx_delivery_log_notification; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_delivery_log_notification ON public.notification_delivery_log USING btree (notification_id);


--
-- Name: idx_delivery_log_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_delivery_log_status ON public.notification_delivery_log USING btree (status);


--
-- Name: idx_delivery_outcomes_customer; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_delivery_outcomes_customer ON public.delivery_outcomes USING btree (merchant_id, customer_id);


--
-- Name: idx_delivery_outcomes_order; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_delivery_outcomes_order ON public.delivery_outcomes USING btree (order_id);


--
-- Name: idx_delivery_pod_merchant_order; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_delivery_pod_merchant_order ON public.delivery_pod_records USING btree (merchant_id, order_id, captured_at DESC);


--
-- Name: idx_delivery_sla_merchant_order; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_delivery_sla_merchant_order ON public.delivery_sla_events USING btree (merchant_id, order_id, observed_at DESC);


--
-- Name: idx_demand_forecasts_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_demand_forecasts_merchant ON public.demand_forecasts USING btree (merchant_id, computed_at DESC);


--
-- Name: idx_demand_forecasts_urgency; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_demand_forecasts_urgency ON public.demand_forecasts USING btree (merchant_id, urgency);


--
-- Name: idx_dfh_merchant_product; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_dfh_merchant_product ON public.demand_forecast_history USING btree (merchant_id, product_id, sales_date DESC);


--
-- Name: idx_dlq_next_retry; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_dlq_next_retry ON public.dlq_events USING btree (next_retry_at) WHERE (status = ANY (ARRAY['PENDING'::public.dlq_status, 'RETRYING'::public.dlq_status]));


--
-- Name: idx_dlq_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_dlq_status ON public.dlq_events USING btree (status);


--
-- Name: idx_embedding_jobs_item; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_embedding_jobs_item ON public.catalog_embedding_jobs USING btree (catalog_item_id);


--
-- Name: idx_embedding_jobs_pending; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_embedding_jobs_pending ON public.catalog_embedding_jobs USING btree (created_at) WHERE ((status)::text = 'PENDING'::text);


--
-- Name: idx_entitlement_changes_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_entitlement_changes_created ON public.entitlement_changes USING btree (created_at);


--
-- Name: idx_entitlement_changes_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_entitlement_changes_merchant ON public.entitlement_changes USING btree (merchant_id);


--
-- Name: idx_expenses_branch; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_expenses_branch ON public.expenses USING btree (merchant_id, branch_id);


--
-- Name: idx_expenses_category; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_expenses_category ON public.expenses USING btree (merchant_id, category);


--
-- Name: idx_expenses_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_expenses_date ON public.expenses USING btree (merchant_id, expense_date);


--
-- Name: idx_expenses_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_expenses_merchant ON public.expenses USING btree (merchant_id);


--
-- Name: idx_expiry_alerts_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_expiry_alerts_date ON public.expiry_alerts USING btree (expiry_date);


--
-- Name: idx_expiry_alerts_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_expiry_alerts_merchant ON public.expiry_alerts USING btree (merchant_id, alert_type);


--
-- Name: idx_feature_requests_category; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_feature_requests_category ON public.feature_requests USING btree (category);


--
-- Name: idx_feature_requests_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_feature_requests_merchant ON public.feature_requests USING btree (merchant_id);


--
-- Name: idx_feature_requests_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_feature_requests_status ON public.feature_requests USING btree (status);


--
-- Name: idx_finance_insights_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_finance_insights_merchant ON public.finance_insights USING btree (merchant_id, created_at DESC);


--
-- Name: idx_finance_snapshots_branch; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_finance_snapshots_branch ON public.finance_snapshots USING btree (merchant_id, branch_id, snapshot_date);


--
-- Name: idx_finance_snapshots_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_finance_snapshots_merchant ON public.finance_snapshots USING btree (merchant_id, snapshot_date);


--
-- Name: idx_followups_conversation; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_followups_conversation ON public.followups USING btree (conversation_id);


--
-- Name: idx_followups_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_followups_merchant ON public.followups USING btree (merchant_id);


--
-- Name: idx_followups_scheduled; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_followups_scheduled ON public.followups USING btree (scheduled_at) WHERE (status = 'PENDING'::public.followup_status);


--
-- Name: idx_forecast_metrics_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_forecast_metrics_merchant ON public.forecast_model_metrics USING btree (merchant_id, forecast_type, computed_at DESC);


--
-- Name: idx_forecast_predictions_merchant_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_forecast_predictions_merchant_type ON public.forecast_predictions USING btree (merchant_id, forecast_type, entity_id, computed_at DESC);


--
-- Name: idx_forecast_predictions_type_entity; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_forecast_predictions_type_entity ON public.forecast_predictions USING btree (forecast_type, entity_id);


--
-- Name: idx_forecast_runs_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_forecast_runs_merchant ON public.forecast_runs USING btree (merchant_id, forecast_type, computed_at DESC);


--
-- Name: idx_idempotency_expires; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_idempotency_expires ON public.idempotency_records USING btree (expires_at);


--
-- Name: idx_inbound_webhook_dedup; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_inbound_webhook_dedup ON public.inbound_webhook_events USING btree (provider, message_id);


--
-- Name: idx_integration_endpoints_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_integration_endpoints_merchant ON public.integration_endpoints USING btree (merchant_id);


--
-- Name: idx_integration_events_endpoint; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_integration_events_endpoint ON public.integration_events USING btree (endpoint_id);


--
-- Name: idx_integration_events_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_integration_events_merchant ON public.integration_events USING btree (merchant_id);


--
-- Name: idx_inventory_alerts_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_inventory_alerts_merchant ON public.inventory_alerts USING btree (merchant_id);


--
-- Name: idx_inventory_alerts_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_inventory_alerts_status ON public.inventory_alerts USING btree (status);


--
-- Name: idx_inventory_alerts_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_inventory_alerts_type ON public.inventory_alerts USING btree (alert_type);


--
-- Name: idx_inventory_alerts_variant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_inventory_alerts_variant ON public.inventory_alerts USING btree (variant_id) WHERE (variant_id IS NOT NULL);


--
-- Name: idx_inventory_items_catalog; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_inventory_items_catalog ON public.inventory_items USING btree (catalog_item_id);


--
-- Name: idx_inventory_items_category; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_inventory_items_category ON public.inventory_items USING btree (category);


--
-- Name: idx_inventory_items_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_inventory_items_merchant ON public.inventory_items USING btree (merchant_id);


--
-- Name: idx_inventory_items_name; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_inventory_items_name ON public.inventory_items USING btree (name);


--
-- Name: idx_inventory_items_sku; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_inventory_items_sku ON public.inventory_items USING btree (sku);


--
-- Name: idx_inventory_movements_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_inventory_movements_merchant ON public.inventory_movements USING btree (merchant_id, created_at DESC);


--
-- Name: idx_inventory_movements_product; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_inventory_movements_product ON public.inventory_movements USING btree (merchant_id, product_id);


--
-- Name: idx_inventory_movements_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_inventory_movements_type ON public.inventory_movements USING btree (merchant_id, movement_type);


--
-- Name: idx_inventory_variants_item; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_inventory_variants_item ON public.inventory_variants USING btree (inventory_item_id);


--
-- Name: idx_inventory_variants_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_inventory_variants_merchant ON public.inventory_variants USING btree (merchant_id);


--
-- Name: idx_inventory_variants_quantity; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_inventory_variants_quantity ON public.inventory_variants USING btree (quantity_available);


--
-- Name: idx_inventory_variants_sku; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_inventory_variants_sku ON public.inventory_variants USING btree (sku);


--
-- Name: idx_invoices_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_invoices_merchant ON public.billing_invoices USING btree (merchant_id);


--
-- Name: idx_item_recipes_catalog_item; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_item_recipes_catalog_item ON public.item_recipes USING btree (catalog_item_id);


--
-- Name: idx_item_recipes_ingredient; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_item_recipes_ingredient ON public.item_recipes USING btree (ingredient_inventory_item_id);


--
-- Name: idx_item_recipes_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_item_recipes_merchant ON public.item_recipes USING btree (merchant_id);


--
-- Name: idx_job_failures_name; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_job_failures_name ON public.job_failure_events USING btree (job_name, created_at DESC);


--
-- Name: idx_kb_chunks_embedding_hnsw; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_kb_chunks_embedding_hnsw ON public.merchant_kb_chunks USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_kb_chunks_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_kb_chunks_merchant ON public.merchant_kb_chunks USING btree (merchant_id) WHERE (is_active = true);


--
-- Name: idx_kb_chunks_merchant_source_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_kb_chunks_merchant_source_type ON public.merchant_kb_chunks USING btree (merchant_id, source_type) WHERE (is_active = true);


--
-- Name: idx_kb_chunks_no_embedding; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_kb_chunks_no_embedding ON public.merchant_kb_chunks USING btree (merchant_id, created_at) WHERE ((embedding IS NULL) AND (is_active = true));


--
-- Name: idx_kb_chunks_tags; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_kb_chunks_tags ON public.merchant_kb_chunks USING gin (tags);


--
-- Name: idx_kb_embedding_jobs_chunk; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_kb_embedding_jobs_chunk ON public.kb_embedding_jobs USING btree (chunk_id);


--
-- Name: idx_kb_embedding_jobs_pending; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_kb_embedding_jobs_pending ON public.kb_embedding_jobs USING btree (created_at) WHERE ((status)::text = 'PENDING'::text);


--
-- Name: idx_known_areas_aliases; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_known_areas_aliases ON public.known_areas USING gin (area_aliases);


--
-- Name: idx_known_areas_city; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_known_areas_city ON public.known_areas USING btree (city);


--
-- Name: idx_lots_expiry; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_lots_expiry ON public.inventory_lots USING btree (expiry_date) WHERE ((status)::text = 'ACTIVE'::text);


--
-- Name: idx_lots_lot_number; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_lots_lot_number ON public.inventory_lots USING btree (merchant_id, lot_number);


--
-- Name: idx_lots_merchant_item; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_lots_merchant_item ON public.inventory_lots USING btree (merchant_id, item_id);


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
-- Name: idx_merchant_automations_due; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_merchant_automations_due ON public.merchant_automations USING btree (is_enabled, last_checked_at) WHERE (is_enabled = true);


--
-- Name: idx_merchant_automations_lookup; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_merchant_automations_lookup ON public.merchant_automations USING btree (merchant_id, automation_type, is_enabled);


--
-- Name: idx_merchant_command_phone; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_merchant_command_phone ON public.merchant_command_channels USING btree (phone_number) WHERE (is_active = true);


--
-- Name: idx_merchant_deletion_requests_merchant_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_merchant_deletion_requests_merchant_id ON public.merchant_deletion_requests USING btree (merchant_id);


--
-- Name: idx_merchant_deletion_requests_status_scheduled_for; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_merchant_deletion_requests_status_scheduled_for ON public.merchant_deletion_requests USING btree (status, scheduled_for);


--
-- Name: idx_merchant_phones_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_merchant_phones_merchant ON public.merchant_phone_numbers USING btree (merchant_id);


--
-- Name: idx_merchant_phones_phone; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_merchant_phones_phone ON public.merchant_phone_numbers USING btree (phone_number) WHERE (is_active = true);


--
-- Name: idx_merchant_phones_whatsapp; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_merchant_phones_whatsapp ON public.merchant_phone_numbers USING btree (whatsapp_number) WHERE (is_active = true);


--
-- Name: idx_merchant_sales_playbooks_version; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_merchant_sales_playbooks_version ON public.merchant_sales_playbooks USING btree (version);


--
-- Name: idx_merchants_enabled_agents; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_merchants_enabled_agents ON public.merchants USING gin (enabled_agents);


--
-- Name: idx_merchants_enabled_features; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_merchants_enabled_features ON public.merchants USING gin (enabled_features);


--
-- Name: idx_message_events_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_message_events_merchant ON public.message_events USING btree (merchant_id, created_at);


--
-- Name: idx_message_events_message; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_message_events_message ON public.message_events USING btree (message_id);


--
-- Name: idx_message_events_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_message_events_type ON public.message_events USING btree (event_type, created_at);


--
-- Name: idx_messages_conversation; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_messages_conversation ON public.messages USING btree (conversation_id);


--
-- Name: idx_messages_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_messages_created ON public.messages USING btree (created_at);


--
-- Name: idx_messages_delivery_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_messages_delivery_status ON public.messages USING btree (delivery_status) WHERE (delivery_status <> ALL (ARRAY['DELIVERED'::public.message_delivery_status, 'READ'::public.message_delivery_status]));


--
-- Name: idx_messages_failed; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_messages_failed ON public.messages USING btree (merchant_id, delivery_status, created_at) WHERE (delivery_status = 'FAILED'::public.message_delivery_status);


--
-- Name: idx_messages_provider_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_messages_provider_id ON public.messages USING btree (merchant_id, provider_message_id);


--
-- Name: idx_messages_retry; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_messages_retry ON public.messages USING btree (next_retry_at, delivery_status) WHERE ((delivery_status = ANY (ARRAY['QUEUED'::public.message_delivery_status, 'PENDING'::public.message_delivery_status])) AND (next_retry_at IS NOT NULL));


--
-- Name: idx_monthly_close_ledger_close; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_monthly_close_ledger_close ON public.monthly_close_governance_ledger USING btree (close_id, created_at DESC);


--
-- Name: idx_monthly_close_ledger_merchant_period; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_monthly_close_ledger_merchant_period ON public.monthly_close_governance_ledger USING btree (merchant_id, year DESC, month DESC, created_at DESC);


--
-- Name: idx_monthly_close_packets_merchant_period; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_monthly_close_packets_merchant_period ON public.monthly_close_packets USING btree (merchant_id, year DESC, month DESC, created_at DESC);


--
-- Name: idx_monthly_closes; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_monthly_closes ON public.monthly_closes USING btree (merchant_id, year DESC, month DESC);


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
-- Name: idx_notifications_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_notifications_created ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_expires; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_notifications_expires ON public.notifications USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_notifications_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_notifications_merchant ON public.merchant_notifications USING btree (merchant_id);


--
-- Name: idx_notifications_merchant_unread; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_notifications_merchant_unread ON public.notifications USING btree (merchant_id) WHERE (is_read = false);


--
-- Name: idx_notifications_priority; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_notifications_priority ON public.notifications USING btree (priority);


--
-- Name: idx_notifications_staff; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_notifications_staff ON public.notifications USING btree (staff_id) WHERE (staff_id IS NOT NULL);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_notifications_unread ON public.merchant_notifications USING btree (merchant_id, is_read) WHERE (is_read = false);


--
-- Name: idx_ocr_verification_rules_unique; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_ocr_verification_rules_unique ON public.ocr_verification_rules USING btree (COALESCE(merchant_id, 'global'::character varying), payment_method, rule_name);


--
-- Name: idx_ocr_verification_rules_unique_lookup; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_ocr_verification_rules_unique_lookup ON public.ocr_verification_rules USING btree (COALESCE(merchant_id, 'global'::character varying), payment_method, rule_name);


--
-- Name: idx_order_ingredient_deductions_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_order_ingredient_deductions_merchant ON public.order_ingredient_deductions USING btree (merchant_id);


--
-- Name: idx_order_ingredient_deductions_order; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_order_ingredient_deductions_order ON public.order_ingredient_deductions USING btree (order_id);


--
-- Name: idx_order_payments_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_order_payments_merchant ON public.order_payments USING btree (merchant_id, created_at DESC);


--
-- Name: idx_order_payments_order; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_order_payments_order ON public.order_payments USING btree (order_id, created_at DESC);


--
-- Name: idx_orders_branch; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_orders_branch ON public.orders USING btree (merchant_id, branch_id);


--
-- Name: idx_orders_conversation; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_orders_conversation ON public.orders USING btree (conversation_id);


--
-- Name: idx_orders_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_orders_created ON public.orders USING btree (created_at);


--
-- Name: idx_orders_customer; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_orders_customer ON public.orders USING btree (customer_id);


--
-- Name: idx_orders_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_orders_merchant ON public.orders USING btree (merchant_id);


--
-- Name: idx_orders_payment_method; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_orders_payment_method ON public.orders USING btree (payment_method);


--
-- Name: idx_orders_payment_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_orders_payment_status ON public.orders USING btree (payment_status);


--
-- Name: idx_orders_review_requested; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_orders_review_requested ON public.orders USING btree (review_requested_at) WHERE (review_requested_at IS NULL);


--
-- Name: idx_orders_shift; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_orders_shift ON public.orders USING btree (shift_id) WHERE (shift_id IS NOT NULL);


--
-- Name: idx_orders_sla_breach_notified; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_orders_sla_breach_notified ON public.orders USING btree (merchant_id, status, sla_breach_notified_at) WHERE (status = ANY (ARRAY['CONFIRMED'::public.order_status, 'SHIPPED'::public.order_status]));


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_orders_stock_deducted; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_orders_stock_deducted ON public.orders USING btree (merchant_id, stock_deducted) WHERE (stock_deducted = true);


--
-- Name: idx_orders_unassigned; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_orders_unassigned ON public.orders USING btree (merchant_id, created_at) WHERE ((assigned_driver_id IS NULL) AND (status <> ALL (ARRAY['DELIVERED'::public.order_status, 'CANCELLED'::public.order_status])));


--
-- Name: idx_org_policy_bindings_unit_key; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_org_policy_bindings_unit_key ON public.merchant_org_policy_bindings USING btree (merchant_id, unit_id, policy_key, version DESC);


--
-- Name: idx_org_staff_scopes_staff; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_org_staff_scopes_staff ON public.merchant_org_staff_scopes USING btree (merchant_id, staff_id, status);


--
-- Name: idx_org_units_merchant_branch; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_org_units_merchant_branch ON public.merchant_org_units USING btree (merchant_id, branch_id);


--
-- Name: idx_org_units_merchant_parent; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_org_units_merchant_parent ON public.merchant_org_units USING btree (merchant_id, parent_id);


--
-- Name: idx_outbox_correlation; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_outbox_correlation ON public.outbox_events USING btree (correlation_id);


--
-- Name: idx_outbox_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_outbox_created ON public.outbox_events USING btree (created_at);


--
-- Name: idx_outbox_events_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_outbox_events_status ON public.outbox_events USING btree (status);


--
-- Name: idx_outbox_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_outbox_merchant ON public.outbox_events USING btree (merchant_id);


--
-- Name: idx_outbox_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_outbox_status ON public.outbox_events USING btree (status) WHERE (status = 'PENDING'::public.event_status);


--
-- Name: idx_overages_merchant_period; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_overages_merchant_period ON public.billing_overages USING btree (merchant_id, billing_period);


--
-- Name: idx_overages_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_overages_status ON public.billing_overages USING btree (status) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_pac_merchant_branch; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_pac_merchant_branch ON public.proactive_alert_configs USING btree (merchant_id, COALESCE((branch_id)::text, '00000000-0000-0000-0000-000000000000'::text));


--
-- Name: idx_payment_links_code; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_payment_links_code ON public.payment_links USING btree (link_code);


--
-- Name: idx_payment_links_expires; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_payment_links_expires ON public.payment_links USING btree (expires_at) WHERE (status = 'PENDING'::public.payment_link_status);


--
-- Name: idx_payment_links_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_payment_links_merchant ON public.payment_links USING btree (merchant_id);


--
-- Name: idx_payment_links_order; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_payment_links_order ON public.payment_links USING btree (order_id);


--
-- Name: idx_payment_links_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_payment_links_status ON public.payment_links USING btree (status) WHERE (status = ANY (ARRAY['PENDING'::public.payment_link_status, 'VIEWED'::public.payment_link_status]));


--
-- Name: idx_payment_proofs_image_phash; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_payment_proofs_image_phash ON public.payment_proofs USING btree (merchant_id, image_phash) WHERE (image_phash IS NOT NULL);


--
-- Name: idx_payment_proofs_link; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_payment_proofs_link ON public.payment_proofs USING btree (payment_link_id);


--
-- Name: idx_payment_proofs_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_payment_proofs_merchant ON public.payment_proofs USING btree (merchant_id);


--
-- Name: idx_payment_proofs_order; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_payment_proofs_order ON public.payment_proofs USING btree (order_id);


--
-- Name: idx_payment_proofs_ref; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_payment_proofs_ref ON public.payment_proofs USING btree (extracted_reference) WHERE (extracted_reference IS NOT NULL);


--
-- Name: idx_payment_proofs_risk; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_payment_proofs_risk ON public.payment_proofs USING btree (merchant_id, status, risk_score DESC, created_at DESC);


--
-- Name: idx_payment_proofs_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_payment_proofs_status ON public.payment_proofs USING btree (status) WHERE (status = 'PENDING'::public.payment_proof_status);


--
-- Name: idx_plan_prices_plan_region_cycle; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_plan_prices_plan_region_cycle ON public.plan_prices USING btree (plan_id, region_code, cycle_months);


--
-- Name: idx_planner_run_ledger_merchant_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_planner_run_ledger_merchant_status ON public.planner_run_ledger USING btree (merchant_id, run_status, started_at DESC);


--
-- Name: idx_planner_trigger_policies_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_planner_trigger_policies_merchant ON public.planner_trigger_policies USING btree (merchant_id, trigger_type, trigger_key);


--
-- Name: idx_playbooks_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_playbooks_type ON public.complaint_playbooks USING btree (merchant_id, complaint_type, step_number);


--
-- Name: idx_points_transactions_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_points_transactions_created ON public.points_transactions USING btree (created_at DESC);


--
-- Name: idx_points_transactions_customer; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_points_transactions_customer ON public.points_transactions USING btree (merchant_id, customer_id);


--
-- Name: idx_pos_integrations_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_pos_integrations_merchant ON public.pos_integrations USING btree (merchant_id);


--
-- Name: idx_prefs_per_user; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_prefs_per_user ON public.notification_preferences_legacy USING btree (merchant_id, COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: idx_proactive_alert_configs_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_proactive_alert_configs_merchant ON public.proactive_alert_configs USING btree (merchant_id);


--
-- Name: idx_product_cogs_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_product_cogs_merchant ON public.product_cogs USING btree (merchant_id);


--
-- Name: idx_product_cogs_product; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_product_cogs_product ON public.product_cogs USING btree (merchant_id, product_id);


--
-- Name: idx_product_media_catalog_item; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_product_media_catalog_item ON public.product_media USING btree (catalog_item_id, display_order);


--
-- Name: idx_product_media_send_on; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_product_media_send_on ON public.product_media USING btree (send_on);


--
-- Name: idx_product_ocr_confirmations_customer; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_product_ocr_confirmations_customer ON public.product_ocr_confirmations USING btree (merchant_id, customer_id, status);


--
-- Name: idx_product_ocr_confirmations_expires; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_product_ocr_confirmations_expires ON public.product_ocr_confirmations USING btree (expires_at) WHERE ((status)::text = 'PENDING'::text);


--
-- Name: idx_promotion_usage_customer; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_promotion_usage_customer ON public.promotion_usage USING btree (promotion_id, customer_id);


--
-- Name: idx_promotions_active; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_promotions_active ON public.promotions USING btree (merchant_id, is_active, start_date, end_date);


--
-- Name: idx_promotions_code; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_promotions_code ON public.promotions USING btree (merchant_id, code) WHERE (code IS NOT NULL);


--
-- Name: idx_proof_requests_awaiting; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_proof_requests_awaiting ON public.proof_requests USING btree (merchant_id, status) WHERE ((status)::text = 'awaiting'::text);


--
-- Name: idx_push_subs_active; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_push_subs_active ON public.push_subscriptions USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_push_subs_device_token; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_push_subs_device_token ON public.push_subscriptions USING btree (device_token);


--
-- Name: idx_push_subs_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_push_subs_merchant ON public.push_subscriptions USING btree (merchant_id);


--
-- Name: idx_push_subs_provider; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_push_subs_provider ON public.push_subscriptions USING btree (provider);


--
-- Name: idx_quote_events_quote; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_quote_events_quote ON public.quote_request_events USING btree (quote_request_id);


--
-- Name: idx_quote_requests_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_quote_requests_merchant ON public.quote_requests USING btree (merchant_id);


--
-- Name: idx_quote_requests_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_quote_requests_status ON public.quote_requests USING btree (status);


--
-- Name: idx_rate_limit_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_rate_limit_merchant ON public.rate_limit_counters USING btree (merchant_id);


--
-- Name: idx_rate_limit_window; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_rate_limit_window ON public.rate_limit_counters USING btree (window_end);


--
-- Name: idx_rate_violations_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_rate_violations_created ON public.rate_limit_violations USING btree (created_at);


--
-- Name: idx_rate_violations_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_rate_violations_merchant ON public.rate_limit_violations USING btree (merchant_id);


--
-- Name: idx_recovered_carts_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_recovered_carts_date ON public.recovered_carts USING btree (merchant_id, created_at);


--
-- Name: idx_recovered_carts_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_recovered_carts_merchant ON public.recovered_carts USING btree (merchant_id, is_recovered);


--
-- Name: idx_replenishment_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_replenishment_merchant ON public.replenishment_recommendations USING btree (merchant_id, urgency, status, computed_at DESC);


--
-- Name: idx_reports_merchant_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_reports_merchant_date ON public.merchant_reports USING btree (merchant_id, report_date);


--
-- Name: idx_reports_period_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_reports_period_type ON public.merchant_reports USING btree (merchant_id, period_type, report_date DESC);


--
-- Name: idx_routing_decision_day; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_routing_decision_day ON public.ai_routing_log USING btree (routing_decision, created_at);


--
-- Name: idx_routing_merchant_day; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_routing_merchant_day ON public.ai_routing_log USING btree (merchant_id, created_at);


--
-- Name: idx_sessions_expires; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_sessions_expires ON public.staff_sessions USING btree (expires_at);


--
-- Name: idx_sessions_refresh; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_sessions_refresh ON public.staff_sessions USING btree (refresh_token_hash);


--
-- Name: idx_sessions_staff; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_sessions_staff ON public.staff_sessions USING btree (staff_id);


--
-- Name: idx_shifts_branch; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_shifts_branch ON public.branch_shifts USING btree (branch_id);


--
-- Name: idx_shifts_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_shifts_merchant ON public.branch_shifts USING btree (merchant_id);


--
-- Name: idx_shifts_opened_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_shifts_opened_at ON public.branch_shifts USING btree (branch_id, opened_at DESC);


--
-- Name: idx_shifts_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_shifts_status ON public.branch_shifts USING btree (branch_id, status);


--
-- Name: idx_shipments_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_shipments_merchant ON public.shipments USING btree (merchant_id);


--
-- Name: idx_shipments_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_shipments_status ON public.shipments USING btree (status);


--
-- Name: idx_shipments_tracking; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_shipments_tracking ON public.shipments USING btree (tracking_id);


--
-- Name: idx_shrinkage_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_shrinkage_merchant ON public.shrinkage_records USING btree (merchant_id, audit_date DESC);


--
-- Name: idx_shrinkage_variant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_shrinkage_variant ON public.shrinkage_records USING btree (variant_id);


--
-- Name: idx_staff_email; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_staff_email ON public.merchant_staff USING btree (email);


--
-- Name: idx_staff_invite_token; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_staff_invite_token ON public.merchant_staff USING btree (invite_token) WHERE (invite_token IS NOT NULL);


--
-- Name: idx_staff_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_staff_merchant ON public.merchant_staff USING btree (merchant_id);


--
-- Name: idx_staff_merchant_email; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_staff_merchant_email ON public.merchant_staff USING btree (merchant_id, email);


--
-- Name: idx_staff_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_staff_status ON public.merchant_staff USING btree (status);


--
-- Name: idx_stock_alerts_item; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_stock_alerts_item ON public.stock_alerts USING btree (catalog_item_id);


--
-- Name: idx_stock_alerts_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_stock_alerts_merchant ON public.stock_alerts USING btree (merchant_id, acknowledged, created_at);


--
-- Name: idx_stock_by_location_location; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_stock_by_location_location ON public.inventory_stock_by_location USING btree (location_id);


--
-- Name: idx_stock_by_location_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_stock_by_location_merchant ON public.inventory_stock_by_location USING btree (merchant_id);


--
-- Name: idx_stock_by_location_variant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_stock_by_location_variant ON public.inventory_stock_by_location USING btree (variant_id);


--
-- Name: idx_stock_movements_item; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_stock_movements_item ON public.stock_movements USING btree (catalog_item_id, created_at);


--
-- Name: idx_stock_movements_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_stock_movements_merchant ON public.stock_movements USING btree (merchant_id, created_at);


--
-- Name: idx_stock_movements_reference; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_stock_movements_reference ON public.stock_movements USING btree (reference_type, reference_id);


--
-- Name: idx_stock_movements_type_v2; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_stock_movements_type_v2 ON public.stock_movements USING btree (movement_type);


--
-- Name: idx_stock_movements_variant_v2; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_stock_movements_variant_v2 ON public.stock_movements USING btree (variant_id) WHERE (variant_id IS NOT NULL);


--
-- Name: idx_stock_reservations_expires; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_stock_reservations_expires ON public.stock_reservations USING btree (expires_at);


--
-- Name: idx_stock_reservations_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_stock_reservations_merchant ON public.stock_reservations USING btree (merchant_id);


--
-- Name: idx_stock_reservations_order; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_stock_reservations_order ON public.stock_reservations USING btree (order_id);


--
-- Name: idx_stock_reservations_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_stock_reservations_status ON public.stock_reservations USING btree (status);


--
-- Name: idx_stock_reservations_variant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_stock_reservations_variant ON public.stock_reservations USING btree (variant_id);


--
-- Name: idx_subscription_addons_subscription_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_subscription_addons_subscription_status ON public.subscription_add_ons USING btree (subscription_id, status);


--
-- Name: idx_subscription_offers_active; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_subscription_offers_active ON public.subscription_offers USING btree (is_active, starts_at, ends_at);


--
-- Name: idx_subscription_offers_plan; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_subscription_offers_plan ON public.subscription_offers USING btree (applies_to_plan);


--
-- Name: idx_subscriptions_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_subscriptions_merchant ON public.merchant_subscriptions USING btree (merchant_id);


--
-- Name: idx_subscriptions_merchant_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_subscriptions_merchant_status ON public.subscriptions USING btree (merchant_id, status, created_at DESC);


--
-- Name: idx_substitution_suggestions_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_substitution_suggestions_merchant ON public.substitution_suggestions USING btree (merchant_id, created_at DESC);


--
-- Name: idx_supplier_discovery_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_supplier_discovery_merchant ON public.supplier_discovery_results USING btree (merchant_id, created_at DESC);


--
-- Name: idx_supplier_products_unique_lookup; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_supplier_products_unique_lookup ON public.supplier_products USING btree (merchant_id, supplier_id, COALESCE((variant_id)::text, (inventory_item_id)::text, (supplier_sku)::text));


--
-- Name: idx_suppliers_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_suppliers_merchant ON public.suppliers USING btree (merchant_id, is_active);


--
-- Name: idx_system_health_log_event_type_created_at; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_system_health_log_event_type_created_at ON public.system_health_log USING btree (event_type, created_at DESC);


--
-- Name: idx_tax_reports_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_tax_reports_merchant ON public.tax_reports USING btree (merchant_id, period_start);


--
-- Name: idx_team_tasks_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_team_tasks_created ON public.team_tasks USING btree (created_at DESC);


--
-- Name: idx_team_tasks_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_team_tasks_merchant ON public.team_tasks USING btree (merchant_id);


--
-- Name: idx_team_tasks_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_team_tasks_status ON public.team_tasks USING btree (status);


--
-- Name: idx_token_usage_merchant_date; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_token_usage_merchant_date ON public.merchant_token_usage USING btree (merchant_id, usage_date);


--
-- Name: idx_transcriptions_message; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_transcriptions_message ON public.voice_transcriptions USING btree (message_id);


--
-- Name: idx_twilio_log_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_twilio_log_created ON public.twilio_message_log USING btree (created_at);


--
-- Name: idx_twilio_log_from; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_twilio_log_from ON public.twilio_message_log USING btree (from_number);


--
-- Name: idx_twilio_log_message_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_twilio_log_message_id ON public.twilio_message_log USING btree (message_id);


--
-- Name: idx_twilio_log_message_sid; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_twilio_log_message_sid ON public.twilio_message_log USING btree (message_sid);


--
-- Name: idx_twilio_log_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_twilio_log_status ON public.twilio_message_log USING btree (status) WHERE ((status)::text <> ALL ((ARRAY['delivered'::character varying, 'read'::character varying])::text[]));


--
-- Name: idx_upsell_category; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_upsell_category ON public.upsell_rules USING btree (merchant_id, source_category) WHERE (is_active = true);


--
-- Name: idx_upsell_source; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_upsell_source ON public.upsell_rules USING btree (merchant_id, source_item_id) WHERE (is_active = true);


--
-- Name: idx_usage_agg_merchant_metric_period; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_usage_agg_merchant_metric_period ON public.usage_period_aggregates USING btree (merchant_id, metric_key, period_type, period_start DESC);


--
-- Name: idx_usage_ledger_merchant_metric_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_usage_ledger_merchant_metric_created ON public.usage_ledger USING btree (merchant_id, metric_key, created_at DESC);


--
-- Name: idx_usage_pack_prices_pack_region; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_usage_pack_prices_pack_region ON public.usage_pack_prices USING btree (usage_pack_id, region_code);


--
-- Name: idx_voice_calls_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_voice_calls_merchant ON public.voice_calls USING btree (merchant_id, started_at DESC);


--
-- Name: idx_voice_transcriptions_conversation; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_voice_transcriptions_conversation ON public.voice_transcriptions USING btree (conversation_id);


--
-- Name: idx_voice_transcriptions_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_voice_transcriptions_merchant ON public.voice_transcriptions USING btree (merchant_id);


--
-- Name: idx_voice_transcriptions_message; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_voice_transcriptions_message ON public.voice_transcriptions USING btree (message_id);


--
-- Name: idx_voice_transcriptions_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_voice_transcriptions_status ON public.voice_transcriptions USING btree (status) WHERE ((status)::text <> 'completed'::text);


--
-- Name: idx_wa_conv_cleanup; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_wa_conv_cleanup ON public.whatsapp_conversation_windows USING btree (expires_at);


--
-- Name: idx_wa_conv_lookup; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_wa_conv_lookup ON public.whatsapp_conversation_windows USING btree (merchant_id, customer_phone, expires_at DESC);


--
-- Name: idx_wa_conv_merchant_month; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_wa_conv_merchant_month ON public.whatsapp_conversation_windows USING btree (merchant_id, opened_at);


--
-- Name: idx_wa_log_created; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_wa_log_created ON public.whatsapp_message_log USING btree (created_at);


--
-- Name: idx_wa_log_from; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_wa_log_from ON public.whatsapp_message_log USING btree (from_number);


--
-- Name: idx_wa_log_message_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_wa_log_message_id ON public.whatsapp_message_log USING btree (message_id);


--
-- Name: idx_wa_log_message_id_unique; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX idx_wa_log_message_id_unique ON public.whatsapp_message_log USING btree (wa_message_id) WHERE ((direction)::text = 'inbound'::text);


--
-- Name: idx_wa_log_phone_number_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_wa_log_phone_number_id ON public.whatsapp_message_log USING btree (phone_number_id);


--
-- Name: idx_wa_log_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_wa_log_status ON public.whatsapp_message_log USING btree (status) WHERE ((status)::text <> ALL ((ARRAY['delivered'::character varying, 'read'::character varying])::text[]));


--
-- Name: idx_wa_log_wa_message_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_wa_log_wa_message_id ON public.whatsapp_message_log USING btree (wa_message_id);


--
-- Name: idx_wa_log_waba; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_wa_log_waba ON public.whatsapp_message_log USING btree (waba_id);


--
-- Name: idx_warehouse_branch; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_warehouse_branch ON public.warehouse_locations USING btree (branch_id) WHERE (branch_id IS NOT NULL);


--
-- Name: idx_warehouse_locations_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_warehouse_locations_merchant ON public.warehouse_locations USING btree (merchant_id);


--
-- Name: idx_webhook_deliveries_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_webhook_deliveries_merchant ON public.webhook_deliveries USING btree (merchant_id, created_at DESC);


--
-- Name: idx_webhook_deliveries_retry; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_webhook_deliveries_retry ON public.webhook_deliveries USING btree (next_retry_at) WHERE (status = 'RETRYING'::public.webhook_delivery_status);


--
-- Name: idx_webhook_deliveries_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_webhook_deliveries_status ON public.webhook_deliveries USING btree (status);


--
-- Name: idx_webhook_deliveries_webhook; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_webhook_deliveries_webhook ON public.webhook_deliveries USING btree (webhook_id);


--
-- Name: idx_webhooks_events; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_webhooks_events ON public.webhooks USING gin (events);


--
-- Name: idx_webhooks_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_webhooks_merchant ON public.webhooks USING btree (merchant_id);


--
-- Name: idx_webhooks_status; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_webhooks_status ON public.webhooks USING btree (status);


--
-- Name: idx_what_if_merchant; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_what_if_merchant ON public.what_if_scenarios USING btree (merchant_id, scenario_type, created_at DESC);


--
-- Name: merchant_agent_subscriptions_merchant_id_agent_type_key; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX merchant_agent_subscriptions_merchant_id_agent_type_key ON public.merchant_agent_subscriptions USING btree (merchant_id, agent_type);


--
-- Name: uidx_branches_default; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX uidx_branches_default ON public.merchant_branches USING btree (merchant_id) WHERE (is_default = true);


--
-- Name: uidx_kb_chunks_merchant_type_singleton; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX uidx_kb_chunks_merchant_type_singleton ON public.merchant_kb_chunks USING btree (merchant_id, source_type) WHERE (source_id IS NULL);


--
-- Name: uidx_kb_chunks_merchant_type_source; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX uidx_kb_chunks_merchant_type_source ON public.merchant_kb_chunks USING btree (merchant_id, source_type, source_id) WHERE (source_id IS NOT NULL);


--
-- Name: promotion_performance _RETURN; Type: RULE; Schema: public; Owner: neondb_owner
--

CREATE OR REPLACE VIEW public.promotion_performance AS
 SELECT p.id,
    p.merchant_id,
    p.name,
    p.type,
    p.code,
    p.start_date,
    p.end_date,
    p.usage_limit,
    p.current_usage,
    count(pu.id) AS actual_usage,
    COALESCE(sum(pu.discount_amount), (0)::numeric) AS total_discount_given,
    avg(pu.discount_amount) AS avg_discount
   FROM (public.promotions p
     LEFT JOIN public.promotion_usage pu ON ((p.id = pu.promotion_id)))
  GROUP BY p.id;


--
-- Name: payment_links payment_link_code_trigger; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER payment_link_code_trigger BEFORE INSERT ON public.payment_links FOR EACH ROW EXECUTE FUNCTION public.set_payment_link_code();


--
-- Name: merchants tr_log_entitlement_changes; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER tr_log_entitlement_changes AFTER UPDATE OF enabled_agents, enabled_features ON public.merchants FOR EACH ROW EXECUTE FUNCTION public.log_entitlement_change();


--
-- Name: merchant_addons tr_merchant_addons_updated; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER tr_merchant_addons_updated BEFORE UPDATE ON public.merchant_addons FOR EACH ROW EXECUTE FUNCTION public.update_wa_log_updated_at();


--
-- Name: merchant_phone_numbers tr_merchant_phone_numbers_updated; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER tr_merchant_phone_numbers_updated BEFORE UPDATE ON public.merchant_phone_numbers FOR EACH ROW EXECUTE FUNCTION public.update_twilio_updated_at();


--
-- Name: twilio_message_log tr_twilio_message_log_updated; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER tr_twilio_message_log_updated BEFORE UPDATE ON public.twilio_message_log FOR EACH ROW EXECUTE FUNCTION public.update_twilio_updated_at();


--
-- Name: whatsapp_message_log tr_whatsapp_message_log_updated; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER tr_whatsapp_message_log_updated BEFORE UPDATE ON public.whatsapp_message_log FOR EACH ROW EXECUTE FUNCTION public.update_wa_log_updated_at();


--
-- Name: orders trg_check_order_total; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER trg_check_order_total BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.fn_check_order_total();


--
-- Name: orders trg_check_recovered_cart; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER trg_check_recovered_cart AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.check_recovered_cart();


--
-- Name: copilot_action_approvals trg_copilot_approvals_updated; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER trg_copilot_approvals_updated BEFORE UPDATE ON public.copilot_action_approvals FOR EACH ROW EXECUTE FUNCTION public.update_copilot_approvals_updated_at();


--
-- Name: copilot_pending_actions trg_copilot_pending_updated; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER trg_copilot_pending_updated BEFORE UPDATE ON public.copilot_pending_actions FOR EACH ROW EXECUTE FUNCTION public.update_copilot_updated_at();


--
-- Name: control_plane_replay_token_consumptions trg_cp_replay_consumptions_updated; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER trg_cp_replay_consumptions_updated BEFORE UPDATE ON public.control_plane_replay_token_consumptions FOR EACH ROW EXECUTE FUNCTION public.update_control_plane_replay_consumptions_updated_at();


--
-- Name: monthly_close_governance_ledger trg_monthly_close_ledger_immutable; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER trg_monthly_close_ledger_immutable BEFORE DELETE OR UPDATE ON public.monthly_close_governance_ledger FOR EACH ROW EXECUTE FUNCTION public.prevent_monthly_close_ledger_mutations();


--
-- Name: subscription_offers trg_subscription_offers_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER trg_subscription_offers_updated_at BEFORE UPDATE ON public.subscription_offers FOR EACH ROW EXECUTE FUNCTION public.update_subscription_offers_updated_at();


--
-- Name: catalog_items trg_sync_catalog_items_active_flags; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER trg_sync_catalog_items_active_flags BEFORE INSERT OR UPDATE ON public.catalog_items FOR EACH ROW EXECUTE FUNCTION public.sync_catalog_items_active_flags();


--
-- Name: expenses trg_sync_expenses_date_compat; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER trg_sync_expenses_date_compat BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.sync_expenses_date_compat();


--
-- Name: merchant_agent_subscriptions trg_sync_merchant_agent_subscriptions_compat; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER trg_sync_merchant_agent_subscriptions_compat BEFORE INSERT OR UPDATE ON public.merchant_agent_subscriptions FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_agent_subscriptions_compat();


--
-- Name: orders trg_sync_orders_total_compat; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER trg_sync_orders_total_compat BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.sync_orders_total_compat();


--
-- Name: agent_tasks update_agent_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_agent_tasks_updated_at BEFORE UPDATE ON public.agent_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: billing_plans update_billing_plans_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_billing_plans_updated_at BEFORE UPDATE ON public.billing_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bulk_operations update_bulk_operations_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_bulk_operations_updated_at BEFORE UPDATE ON public.bulk_operations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: call_followup_workflows update_call_followup_workflows_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_call_followup_workflows_updated_at BEFORE UPDATE ON public.call_followup_workflows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: callback_campaign_bridges update_callback_campaign_bridges_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_callback_campaign_bridges_updated_at BEFORE UPDATE ON public.callback_campaign_bridges FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: catalog_embedding_jobs update_catalog_embedding_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_catalog_embedding_jobs_updated_at BEFORE UPDATE ON public.catalog_embedding_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: catalog_items update_catalog_items_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_catalog_items_updated_at BEFORE UPDATE ON public.catalog_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: conversations update_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customers update_customers_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: dlq_events update_dlq_events_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_dlq_events_updated_at BEFORE UPDATE ON public.dlq_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: feature_requests update_feature_requests_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_feature_requests_updated_at BEFORE UPDATE ON public.feature_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: followups update_followups_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_followups_updated_at BEFORE UPDATE ON public.followups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: kb_embedding_jobs update_kb_embedding_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_kb_embedding_jobs_updated_at BEFORE UPDATE ON public.kb_embedding_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: merchant_agent_subscriptions update_merchant_agent_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_merchant_agent_subscriptions_updated_at BEFORE UPDATE ON public.merchant_agent_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: merchant_business_rules update_merchant_business_rules_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_merchant_business_rules_updated_at BEFORE UPDATE ON public.merchant_business_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: merchant_kb_chunks update_merchant_kb_chunks_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_merchant_kb_chunks_updated_at BEFORE UPDATE ON public.merchant_kb_chunks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: merchant_sales_playbooks update_merchant_sales_playbooks_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_merchant_sales_playbooks_updated_at BEFORE UPDATE ON public.merchant_sales_playbooks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: merchant_staff update_merchant_staff_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_merchant_staff_updated_at BEFORE UPDATE ON public.merchant_staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: merchant_subscriptions update_merchant_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_merchant_subscriptions_updated_at BEFORE UPDATE ON public.merchant_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: merchant_token_usage update_merchant_token_usage_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_merchant_token_usage_updated_at BEFORE UPDATE ON public.merchant_token_usage FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: merchants update_merchants_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_merchants_updated_at BEFORE UPDATE ON public.merchants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: notification_preferences update_notification_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: notification_preferences_legacy update_notification_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences_legacy FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: orders update_orders_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payment_links update_payment_links_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_payment_links_updated_at BEFORE UPDATE ON public.payment_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payment_proofs update_payment_proofs_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_payment_proofs_updated_at BEFORE UPDATE ON public.payment_proofs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_media update_product_media_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_product_media_updated_at BEFORE UPDATE ON public.product_media FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: quote_requests update_quote_requests_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_quote_requests_updated_at BEFORE UPDATE ON public.quote_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: shipments update_shipments_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_shipments_updated_at BEFORE UPDATE ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: webhooks update_webhooks_updated_at; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON public.webhooks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: accountant_exports accountant_exports_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.accountant_exports
    ADD CONSTRAINT accountant_exports_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: add_on_prices add_on_prices_addon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.add_on_prices
    ADD CONSTRAINT add_on_prices_addon_id_fkey FOREIGN KEY (addon_id) REFERENCES public.add_ons(id) ON DELETE CASCADE;


--
-- Name: agent_actions agent_actions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.agent_actions
    ADD CONSTRAINT agent_actions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: agent_results agent_results_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.agent_results
    ADD CONSTRAINT agent_results_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.agent_tasks(id) ON DELETE CASCADE;


--
-- Name: agent_subscription_audit agent_subscription_audit_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.agent_subscription_audit
    ADD CONSTRAINT agent_subscription_audit_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: agent_tasks agent_tasks_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: agent_tasks agent_tasks_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE SET NULL;


--
-- Name: agent_tasks agent_tasks_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: ai_decision_log ai_decision_log_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.ai_decision_log
    ADD CONSTRAINT ai_decision_log_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: ai_routing_log ai_routing_log_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.ai_routing_log
    ADD CONSTRAINT ai_routing_log_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: analytics_events analytics_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: analytics_events analytics_events_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.merchant_staff(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: automation_run_logs automation_run_logs_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.automation_run_logs
    ADD CONSTRAINT automation_run_logs_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: billing_invoices billing_invoices_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: billing_invoices billing_invoices_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.merchant_subscriptions(id) ON DELETE SET NULL;


--
-- Name: billing_overages billing_overages_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.billing_overages
    ADD CONSTRAINT billing_overages_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: branch_goals branch_goals_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branch_goals
    ADD CONSTRAINT branch_goals_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.merchant_branches(id) ON DELETE CASCADE;


--
-- Name: branch_goals branch_goals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branch_goals
    ADD CONSTRAINT branch_goals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.merchant_staff(id) ON DELETE SET NULL;


--
-- Name: branch_goals branch_goals_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branch_goals
    ADD CONSTRAINT branch_goals_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: branch_shifts branch_shifts_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branch_shifts
    ADD CONSTRAINT branch_shifts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.merchant_branches(id) ON DELETE CASCADE;


--
-- Name: branch_shifts branch_shifts_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branch_shifts
    ADD CONSTRAINT branch_shifts_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.merchant_staff(id) ON DELETE SET NULL;


--
-- Name: branch_shifts branch_shifts_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branch_shifts
    ADD CONSTRAINT branch_shifts_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: branch_shifts branch_shifts_opened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branch_shifts
    ADD CONSTRAINT branch_shifts_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES public.merchant_staff(id) ON DELETE SET NULL;


--
-- Name: branch_staff_assignments branch_staff_assignments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branch_staff_assignments
    ADD CONSTRAINT branch_staff_assignments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.merchant_branches(id) ON DELETE CASCADE;


--
-- Name: branch_staff_assignments branch_staff_assignments_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branch_staff_assignments
    ADD CONSTRAINT branch_staff_assignments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: branch_staff_assignments branch_staff_assignments_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.branch_staff_assignments
    ADD CONSTRAINT branch_staff_assignments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.merchant_staff(id) ON DELETE CASCADE;


--
-- Name: bulk_operations bulk_operations_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bulk_operations
    ADD CONSTRAINT bulk_operations_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: bulk_operations bulk_operations_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.bulk_operations
    ADD CONSTRAINT bulk_operations_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.merchant_staff(id) ON DELETE SET NULL;


--
-- Name: call_followup_workflow_events call_followup_workflow_events_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.call_followup_workflow_events
    ADD CONSTRAINT call_followup_workflow_events_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.voice_calls(id) ON DELETE CASCADE;


--
-- Name: call_followup_workflow_events call_followup_workflow_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.call_followup_workflow_events
    ADD CONSTRAINT call_followup_workflow_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: call_followup_workflows call_followup_workflows_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.call_followup_workflows
    ADD CONSTRAINT call_followup_workflows_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.voice_calls(id) ON DELETE CASCADE;


--
-- Name: call_followup_workflows call_followup_workflows_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.call_followup_workflows
    ADD CONSTRAINT call_followup_workflows_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: callback_campaign_bridge_items callback_campaign_bridge_items_bridge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.callback_campaign_bridge_items
    ADD CONSTRAINT callback_campaign_bridge_items_bridge_id_fkey FOREIGN KEY (bridge_id) REFERENCES public.callback_campaign_bridges(id) ON DELETE CASCADE;


--
-- Name: callback_campaign_bridge_items callback_campaign_bridge_items_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.callback_campaign_bridge_items
    ADD CONSTRAINT callback_campaign_bridge_items_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.voice_calls(id) ON DELETE CASCADE;


--
-- Name: callback_campaign_bridge_items callback_campaign_bridge_items_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.callback_campaign_bridge_items
    ADD CONSTRAINT callback_campaign_bridge_items_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: callback_campaign_bridge_items callback_campaign_bridge_items_workflow_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.callback_campaign_bridge_items
    ADD CONSTRAINT callback_campaign_bridge_items_workflow_event_id_fkey FOREIGN KEY (workflow_event_id) REFERENCES public.call_followup_workflow_events(id) ON DELETE SET NULL;


--
-- Name: callback_campaign_bridges callback_campaign_bridges_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.callback_campaign_bridges
    ADD CONSTRAINT callback_campaign_bridges_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: cash_flow_forecasts cash_flow_forecasts_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cash_flow_forecasts
    ADD CONSTRAINT cash_flow_forecasts_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: catalog_embedding_jobs catalog_embedding_jobs_catalog_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.catalog_embedding_jobs
    ADD CONSTRAINT catalog_embedding_jobs_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(id) ON DELETE CASCADE;


--
-- Name: catalog_embedding_jobs catalog_embedding_jobs_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.catalog_embedding_jobs
    ADD CONSTRAINT catalog_embedding_jobs_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: catalog_items catalog_items_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.catalog_items
    ADD CONSTRAINT catalog_items_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: cod_collections cod_collections_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cod_collections
    ADD CONSTRAINT cod_collections_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.merchant_branches(id) ON DELETE SET NULL;


--
-- Name: cod_collections cod_collections_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cod_collections
    ADD CONSTRAINT cod_collections_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: cod_collections cod_collections_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cod_collections
    ADD CONSTRAINT cod_collections_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: cod_finance_actions cod_finance_actions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cod_finance_actions
    ADD CONSTRAINT cod_finance_actions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: cod_finance_actions cod_finance_actions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cod_finance_actions
    ADD CONSTRAINT cod_finance_actions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: cod_finance_actions cod_finance_actions_statement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cod_finance_actions
    ADD CONSTRAINT cod_finance_actions_statement_id_fkey FOREIGN KEY (statement_id) REFERENCES public.cod_statement_imports(id) ON DELETE SET NULL;


--
-- Name: cod_reminders cod_reminders_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cod_reminders
    ADD CONSTRAINT cod_reminders_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: cod_reminders cod_reminders_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cod_reminders
    ADD CONSTRAINT cod_reminders_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: cod_statement_imports cod_statement_imports_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cod_statement_imports
    ADD CONSTRAINT cod_statement_imports_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: cod_statement_lines cod_statement_lines_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cod_statement_lines
    ADD CONSTRAINT cod_statement_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: cod_statement_lines cod_statement_lines_statement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.cod_statement_lines
    ADD CONSTRAINT cod_statement_lines_statement_id_fkey FOREIGN KEY (statement_id) REFERENCES public.cod_statement_imports(id) ON DELETE CASCADE;


--
-- Name: complaint_playbooks complaint_playbooks_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.complaint_playbooks
    ADD CONSTRAINT complaint_playbooks_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: connector_reconciliation_items connector_reconciliation_items_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_reconciliation_items
    ADD CONSTRAINT connector_reconciliation_items_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: connector_reconciliation_items connector_reconciliation_items_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_reconciliation_items
    ADD CONSTRAINT connector_reconciliation_items_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.connector_reconciliation_runs(id) ON DELETE CASCADE;


--
-- Name: connector_reconciliation_runs connector_reconciliation_runs_endpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_reconciliation_runs
    ADD CONSTRAINT connector_reconciliation_runs_endpoint_id_fkey FOREIGN KEY (endpoint_id) REFERENCES public.integration_endpoints(id) ON DELETE SET NULL;


--
-- Name: connector_reconciliation_runs connector_reconciliation_runs_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_reconciliation_runs
    ADD CONSTRAINT connector_reconciliation_runs_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: connector_runtime_dlq connector_runtime_dlq_endpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_runtime_dlq
    ADD CONSTRAINT connector_runtime_dlq_endpoint_id_fkey FOREIGN KEY (endpoint_id) REFERENCES public.integration_endpoints(id) ON DELETE SET NULL;


--
-- Name: connector_runtime_dlq connector_runtime_dlq_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_runtime_dlq
    ADD CONSTRAINT connector_runtime_dlq_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: connector_runtime_dlq connector_runtime_dlq_runtime_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_runtime_dlq
    ADD CONSTRAINT connector_runtime_dlq_runtime_event_id_fkey FOREIGN KEY (runtime_event_id) REFERENCES public.connector_runtime_events(id) ON DELETE CASCADE;


--
-- Name: connector_runtime_events connector_runtime_events_endpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_runtime_events
    ADD CONSTRAINT connector_runtime_events_endpoint_id_fkey FOREIGN KEY (endpoint_id) REFERENCES public.integration_endpoints(id) ON DELETE SET NULL;


--
-- Name: connector_runtime_events connector_runtime_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_runtime_events
    ADD CONSTRAINT connector_runtime_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: connector_runtime_worker_cycle_outcomes connector_runtime_worker_cycle_outcomes_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_runtime_worker_cycle_outcomes
    ADD CONSTRAINT connector_runtime_worker_cycle_outcomes_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.connector_runtime_worker_cycles(id) ON DELETE CASCADE;


--
-- Name: connector_runtime_worker_cycle_outcomes connector_runtime_worker_cycle_outcomes_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.connector_runtime_worker_cycle_outcomes
    ADD CONSTRAINT connector_runtime_worker_cycle_outcomes_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: control_plane_replay_token_consumptions control_plane_replay_token_consumptions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.control_plane_replay_token_consumptions
    ADD CONSTRAINT control_plane_replay_token_consumptions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: control_plane_replay_token_consumptions control_plane_replay_token_consumptions_replay_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.control_plane_replay_token_consumptions
    ADD CONSTRAINT control_plane_replay_token_consumptions_replay_run_id_fkey FOREIGN KEY (replay_run_id) REFERENCES public.planner_run_ledger(id) ON DELETE SET NULL;


--
-- Name: control_plane_replay_token_consumptions control_plane_replay_token_consumptions_source_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.control_plane_replay_token_consumptions
    ADD CONSTRAINT control_plane_replay_token_consumptions_source_run_id_fkey FOREIGN KEY (source_run_id) REFERENCES public.planner_run_ledger(id) ON DELETE CASCADE;


--
-- Name: control_plane_triage_acknowledgements control_plane_triage_acknowledgements_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.control_plane_triage_acknowledgements
    ADD CONSTRAINT control_plane_triage_acknowledgements_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: control_plane_triage_acknowledgements control_plane_triage_acknowledgements_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.control_plane_triage_acknowledgements
    ADD CONSTRAINT control_plane_triage_acknowledgements_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.planner_run_ledger(id) ON DELETE CASCADE;


--
-- Name: control_policy_sets control_policy_sets_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.control_policy_sets
    ADD CONSTRAINT control_policy_sets_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: control_policy_simulations control_policy_simulations_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.control_policy_simulations
    ADD CONSTRAINT control_policy_simulations_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: control_policy_simulations control_policy_simulations_policy_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.control_policy_simulations
    ADD CONSTRAINT control_policy_simulations_policy_set_id_fkey FOREIGN KEY (policy_set_id) REFERENCES public.control_policy_sets(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.merchant_branches(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: copilot_action_approvals copilot_action_approvals_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.copilot_action_approvals
    ADD CONSTRAINT copilot_action_approvals_action_id_fkey FOREIGN KEY (action_id) REFERENCES public.copilot_pending_actions(id) ON DELETE CASCADE;


--
-- Name: copilot_action_approvals copilot_action_approvals_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.copilot_action_approvals
    ADD CONSTRAINT copilot_action_approvals_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: copilot_history copilot_history_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.copilot_history
    ADD CONSTRAINT copilot_history_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: copilot_pending_actions copilot_pending_actions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.copilot_pending_actions
    ADD CONSTRAINT copilot_pending_actions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: custom_segments custom_segments_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.custom_segments
    ADD CONSTRAINT custom_segments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: customer_memory customer_memory_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_memory
    ADD CONSTRAINT customer_memory_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: customer_points customer_points_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_points
    ADD CONSTRAINT customer_points_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: customer_points customer_points_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_points
    ADD CONSTRAINT customer_points_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.loyalty_tiers(id);


--
-- Name: customer_referrals customer_referrals_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_referrals
    ADD CONSTRAINT customer_referrals_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: customer_risk_scores customer_risk_scores_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_risk_scores
    ADD CONSTRAINT customer_risk_scores_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: customer_segments customer_segments_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_segments
    ADD CONSTRAINT customer_segments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: customer_tags customer_tags_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT customer_tags_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: customers customers_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: data_requests data_requests_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.data_requests
    ADD CONSTRAINT data_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: data_requests data_requests_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.data_requests
    ADD CONSTRAINT data_requests_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: delivery_drivers delivery_drivers_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_drivers
    ADD CONSTRAINT delivery_drivers_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: delivery_eta_config delivery_eta_config_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_eta_config
    ADD CONSTRAINT delivery_eta_config_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: delivery_execution_events delivery_execution_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_execution_events
    ADD CONSTRAINT delivery_execution_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: delivery_execution_events delivery_execution_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_execution_events
    ADD CONSTRAINT delivery_execution_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: delivery_location_timeline delivery_location_timeline_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_location_timeline
    ADD CONSTRAINT delivery_location_timeline_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: delivery_location_timeline delivery_location_timeline_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_location_timeline
    ADD CONSTRAINT delivery_location_timeline_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: delivery_outcomes delivery_outcomes_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_outcomes
    ADD CONSTRAINT delivery_outcomes_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: delivery_outcomes delivery_outcomes_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_outcomes
    ADD CONSTRAINT delivery_outcomes_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: delivery_pod_records delivery_pod_records_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_pod_records
    ADD CONSTRAINT delivery_pod_records_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: delivery_pod_records delivery_pod_records_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_pod_records
    ADD CONSTRAINT delivery_pod_records_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: delivery_sla_events delivery_sla_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_sla_events
    ADD CONSTRAINT delivery_sla_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: delivery_sla_events delivery_sla_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.delivery_sla_events
    ADD CONSTRAINT delivery_sla_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: demand_forecast_history demand_forecast_history_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.demand_forecast_history
    ADD CONSTRAINT demand_forecast_history_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: demand_forecasts demand_forecasts_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.demand_forecasts
    ADD CONSTRAINT demand_forecasts_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: dlq_events dlq_events_original_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.dlq_events
    ADD CONSTRAINT dlq_events_original_event_id_fkey FOREIGN KEY (original_event_id) REFERENCES public.outbox_events(id) ON DELETE SET NULL;


--
-- Name: entitlement_changes entitlement_changes_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.entitlement_changes
    ADD CONSTRAINT entitlement_changes_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: expenses expenses_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.merchant_branches(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: expiry_alerts expiry_alerts_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.expiry_alerts
    ADD CONSTRAINT expiry_alerts_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: feature_requests feature_requests_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.feature_requests
    ADD CONSTRAINT feature_requests_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: feature_requests feature_requests_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.feature_requests
    ADD CONSTRAINT feature_requests_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.merchant_staff(id) ON DELETE SET NULL;


--
-- Name: finance_insights finance_insights_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.finance_insights
    ADD CONSTRAINT finance_insights_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: finance_snapshots finance_snapshots_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.finance_snapshots
    ADD CONSTRAINT finance_snapshots_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.merchant_branches(id) ON DELETE SET NULL;


--
-- Name: finance_snapshots finance_snapshots_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.finance_snapshots
    ADD CONSTRAINT finance_snapshots_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: customer_tags fk_customer_tags_rule_id; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT fk_customer_tags_rule_id FOREIGN KEY (rule_id) REFERENCES public.vip_rules(id) ON DELETE SET NULL;


--
-- Name: followups followups_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: followups followups_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: followups followups_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: followups followups_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: forecast_model_metrics forecast_model_metrics_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.forecast_model_metrics
    ADD CONSTRAINT forecast_model_metrics_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: forecast_predictions forecast_predictions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.forecast_predictions
    ADD CONSTRAINT forecast_predictions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: forecast_runs forecast_runs_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.forecast_runs
    ADD CONSTRAINT forecast_runs_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: gift_card_transactions gift_card_transactions_gift_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.gift_card_transactions
    ADD CONSTRAINT gift_card_transactions_gift_card_id_fkey FOREIGN KEY (gift_card_id) REFERENCES public.gift_cards(id) ON DELETE CASCADE;


--
-- Name: gift_cards gift_cards_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: integration_endpoints integration_endpoints_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.integration_endpoints
    ADD CONSTRAINT integration_endpoints_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: integration_events integration_events_endpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.integration_events
    ADD CONSTRAINT integration_events_endpoint_id_fkey FOREIGN KEY (endpoint_id) REFERENCES public.integration_endpoints(id) ON DELETE CASCADE;


--
-- Name: integration_events integration_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.integration_events
    ADD CONSTRAINT integration_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: inventory_alerts inventory_alerts_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_alerts
    ADD CONSTRAINT inventory_alerts_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: inventory_alerts inventory_alerts_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_alerts
    ADD CONSTRAINT inventory_alerts_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.inventory_variants(id) ON DELETE CASCADE;


--
-- Name: inventory_cost_layers inventory_cost_layers_lot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_cost_layers
    ADD CONSTRAINT inventory_cost_layers_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.inventory_lots(id);


--
-- Name: inventory_cost_layers inventory_cost_layers_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_cost_layers
    ADD CONSTRAINT inventory_cost_layers_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: inventory_items inventory_items_catalog_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(id) ON DELETE CASCADE;


--
-- Name: inventory_items inventory_items_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: inventory_lots inventory_lots_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_lots
    ADD CONSTRAINT inventory_lots_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: inventory_movements inventory_movements_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: inventory_stock_by_location inventory_stock_by_location_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_stock_by_location
    ADD CONSTRAINT inventory_stock_by_location_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.warehouse_locations(id) ON DELETE CASCADE;


--
-- Name: inventory_stock_by_location inventory_stock_by_location_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_stock_by_location
    ADD CONSTRAINT inventory_stock_by_location_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: inventory_stock_by_location inventory_stock_by_location_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_stock_by_location
    ADD CONSTRAINT inventory_stock_by_location_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.inventory_variants(id) ON DELETE CASCADE;


--
-- Name: inventory_top_movers inventory_top_movers_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_top_movers
    ADD CONSTRAINT inventory_top_movers_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: inventory_variants inventory_variants_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_variants
    ADD CONSTRAINT inventory_variants_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;


--
-- Name: inventory_variants inventory_variants_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.inventory_variants
    ADD CONSTRAINT inventory_variants_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: item_recipes item_recipes_catalog_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.item_recipes
    ADD CONSTRAINT item_recipes_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(id) ON DELETE CASCADE;


--
-- Name: item_recipes item_recipes_ingredient_catalog_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.item_recipes
    ADD CONSTRAINT item_recipes_ingredient_catalog_item_id_fkey FOREIGN KEY (ingredient_catalog_item_id) REFERENCES public.catalog_items(id) ON DELETE SET NULL;


--
-- Name: item_recipes item_recipes_ingredient_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.item_recipes
    ADD CONSTRAINT item_recipes_ingredient_inventory_item_id_fkey FOREIGN KEY (ingredient_inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;


--
-- Name: item_recipes item_recipes_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.item_recipes
    ADD CONSTRAINT item_recipes_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: kb_embedding_jobs kb_embedding_jobs_chunk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.kb_embedding_jobs
    ADD CONSTRAINT kb_embedding_jobs_chunk_id_fkey FOREIGN KEY (chunk_id) REFERENCES public.merchant_kb_chunks(id) ON DELETE CASCADE;


--
-- Name: kb_embedding_jobs kb_embedding_jobs_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.kb_embedding_jobs
    ADD CONSTRAINT kb_embedding_jobs_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: loyalty_tiers loyalty_tiers_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.loyalty_tiers
    ADD CONSTRAINT loyalty_tiers_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: margin_alerts margin_alerts_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.margin_alerts
    ADD CONSTRAINT margin_alerts_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_addons merchant_addons_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_addons
    ADD CONSTRAINT merchant_addons_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_agent_subscriptions merchant_agent_subscriptions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_agent_subscriptions
    ADD CONSTRAINT merchant_agent_subscriptions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_api_keys merchant_api_keys_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_api_keys
    ADD CONSTRAINT merchant_api_keys_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_automations merchant_automations_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_automations
    ADD CONSTRAINT merchant_automations_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_branches merchant_branches_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_branches
    ADD CONSTRAINT merchant_branches_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_business_rules merchant_business_rules_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_business_rules
    ADD CONSTRAINT merchant_business_rules_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_command_channels merchant_command_channels_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_command_channels
    ADD CONSTRAINT merchant_command_channels_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_deletion_requests merchant_deletion_requests_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_deletion_requests
    ADD CONSTRAINT merchant_deletion_requests_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_kb_chunks merchant_kb_chunks_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_kb_chunks
    ADD CONSTRAINT merchant_kb_chunks_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_notifications merchant_notifications_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_notifications
    ADD CONSTRAINT merchant_notifications_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_org_policy_bindings merchant_org_policy_bindings_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_org_policy_bindings
    ADD CONSTRAINT merchant_org_policy_bindings_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_org_policy_bindings merchant_org_policy_bindings_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_org_policy_bindings
    ADD CONSTRAINT merchant_org_policy_bindings_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.merchant_org_units(id) ON DELETE CASCADE;


--
-- Name: merchant_org_staff_scopes merchant_org_staff_scopes_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_org_staff_scopes
    ADD CONSTRAINT merchant_org_staff_scopes_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_org_staff_scopes merchant_org_staff_scopes_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_org_staff_scopes
    ADD CONSTRAINT merchant_org_staff_scopes_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.merchant_org_units(id) ON DELETE CASCADE;


--
-- Name: merchant_org_units merchant_org_units_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_org_units
    ADD CONSTRAINT merchant_org_units_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_org_units merchant_org_units_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_org_units
    ADD CONSTRAINT merchant_org_units_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.merchant_org_units(id) ON DELETE SET NULL;


--
-- Name: merchant_phone_numbers merchant_phone_numbers_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_phone_numbers
    ADD CONSTRAINT merchant_phone_numbers_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_reports merchant_reports_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_reports
    ADD CONSTRAINT merchant_reports_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_sales_playbooks merchant_sales_playbooks_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_sales_playbooks
    ADD CONSTRAINT merchant_sales_playbooks_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_staff merchant_staff_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_staff
    ADD CONSTRAINT merchant_staff_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_subscriptions merchant_subscriptions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_subscriptions
    ADD CONSTRAINT merchant_subscriptions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchant_subscriptions merchant_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_subscriptions
    ADD CONSTRAINT merchant_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.billing_plans(id) ON DELETE RESTRICT;


--
-- Name: merchant_tax_config merchant_tax_config_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_tax_config
    ADD CONSTRAINT merchant_tax_config_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: merchant_token_usage merchant_token_usage_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.merchant_token_usage
    ADD CONSTRAINT merchant_token_usage_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: message_events message_events_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.message_events
    ADD CONSTRAINT message_events_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: message_events message_events_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.message_events
    ADD CONSTRAINT message_events_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: monthly_close_governance_ledger monthly_close_governance_ledger_close_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.monthly_close_governance_ledger
    ADD CONSTRAINT monthly_close_governance_ledger_close_id_fkey FOREIGN KEY (close_id) REFERENCES public.monthly_closes(id) ON DELETE SET NULL;


--
-- Name: monthly_close_governance_ledger monthly_close_governance_ledger_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.monthly_close_governance_ledger
    ADD CONSTRAINT monthly_close_governance_ledger_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: monthly_close_governance_ledger monthly_close_governance_ledger_packet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.monthly_close_governance_ledger
    ADD CONSTRAINT monthly_close_governance_ledger_packet_id_fkey FOREIGN KEY (packet_id) REFERENCES public.monthly_close_packets(id) ON DELETE SET NULL;


--
-- Name: monthly_close_packets monthly_close_packets_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.monthly_close_packets
    ADD CONSTRAINT monthly_close_packets_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: monthly_closes monthly_closes_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.monthly_closes
    ADD CONSTRAINT monthly_closes_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: notification_delivery_log notification_delivery_log_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notification_delivery_log
    ADD CONSTRAINT notification_delivery_log_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE;


--
-- Name: notification_preferences_legacy notification_preferences_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notification_preferences_legacy
    ADD CONSTRAINT notification_preferences_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_merchant_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_merchant_id_fkey1 FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.merchant_staff(id) ON DELETE CASCADE;


--
-- Name: notification_preferences_legacy notification_preferences_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notification_preferences_legacy
    ADD CONSTRAINT notification_preferences_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.merchant_staff(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_staff_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_staff_id_fkey1 FOREIGN KEY (staff_id) REFERENCES public.merchant_staff(id) ON DELETE CASCADE;


--
-- Name: notification_templates notification_templates_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.merchant_staff(id) ON DELETE CASCADE;


--
-- Name: objection_templates objection_templates_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.objection_templates
    ADD CONSTRAINT objection_templates_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: ocr_verification_rules ocr_verification_rules_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.ocr_verification_rules
    ADD CONSTRAINT ocr_verification_rules_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: order_ingredient_deductions order_ingredient_deductions_catalog_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.order_ingredient_deductions
    ADD CONSTRAINT order_ingredient_deductions_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(id);


--
-- Name: order_ingredient_deductions order_ingredient_deductions_ingredient_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.order_ingredient_deductions
    ADD CONSTRAINT order_ingredient_deductions_ingredient_inventory_item_id_fkey FOREIGN KEY (ingredient_inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: order_ingredient_deductions order_ingredient_deductions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.order_ingredient_deductions
    ADD CONSTRAINT order_ingredient_deductions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_payments order_payments_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.order_payments
    ADD CONSTRAINT order_payments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: order_payments order_payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.order_payments
    ADD CONSTRAINT order_payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_assigned_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_assigned_driver_id_fkey FOREIGN KEY (assigned_driver_id) REFERENCES public.delivery_drivers(id);


--
-- Name: orders orders_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.merchant_branches(id) ON DELETE SET NULL;


--
-- Name: orders orders_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: orders orders_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: orders orders_payment_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_payment_link_id_fkey FOREIGN KEY (payment_link_id) REFERENCES public.payment_links(id) ON DELETE SET NULL;


--
-- Name: orders orders_payment_proof_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_payment_proof_id_fkey FOREIGN KEY (payment_proof_id) REFERENCES public.payment_proofs(id) ON DELETE SET NULL;


--
-- Name: orders orders_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.branch_shifts(id) ON DELETE SET NULL;


--
-- Name: payment_links payment_links_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: payment_links payment_links_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: payment_links payment_links_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: payment_links payment_links_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payment_links
    ADD CONSTRAINT payment_links_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: payment_proofs payment_proofs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payment_proofs
    ADD CONSTRAINT payment_proofs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: payment_proofs payment_proofs_duplicate_of_proof_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payment_proofs
    ADD CONSTRAINT payment_proofs_duplicate_of_proof_id_fkey FOREIGN KEY (duplicate_of_proof_id) REFERENCES public.payment_proofs(id) ON DELETE SET NULL;


--
-- Name: payment_proofs payment_proofs_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payment_proofs
    ADD CONSTRAINT payment_proofs_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: payment_proofs payment_proofs_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payment_proofs
    ADD CONSTRAINT payment_proofs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: payment_proofs payment_proofs_payment_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.payment_proofs
    ADD CONSTRAINT payment_proofs_payment_link_id_fkey FOREIGN KEY (payment_link_id) REFERENCES public.payment_links(id) ON DELETE SET NULL;


--
-- Name: permission_templates permission_templates_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.permission_templates
    ADD CONSTRAINT permission_templates_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: plan_entitlements plan_entitlements_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.plan_entitlements
    ADD CONSTRAINT plan_entitlements_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE CASCADE;


--
-- Name: plan_limits plan_limits_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.plan_limits
    ADD CONSTRAINT plan_limits_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE CASCADE;


--
-- Name: plan_prices plan_prices_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.plan_prices
    ADD CONSTRAINT plan_prices_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE CASCADE;


--
-- Name: planner_run_ledger planner_run_ledger_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.planner_run_ledger
    ADD CONSTRAINT planner_run_ledger_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: planner_trigger_policies planner_trigger_policies_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.planner_trigger_policies
    ADD CONSTRAINT planner_trigger_policies_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: points_transactions points_transactions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.points_transactions
    ADD CONSTRAINT points_transactions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: pos_integrations pos_integrations_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.pos_integrations
    ADD CONSTRAINT pos_integrations_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: proactive_alert_configs proactive_alert_configs_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.proactive_alert_configs
    ADD CONSTRAINT proactive_alert_configs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.merchant_branches(id) ON DELETE CASCADE;


--
-- Name: proactive_alert_configs proactive_alert_configs_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.proactive_alert_configs
    ADD CONSTRAINT proactive_alert_configs_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: product_cogs product_cogs_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.product_cogs
    ADD CONSTRAINT product_cogs_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: product_media product_media_catalog_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(id) ON DELETE CASCADE;


--
-- Name: product_ocr_confirmations product_ocr_confirmations_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.product_ocr_confirmations
    ADD CONSTRAINT product_ocr_confirmations_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: product_ocr_confirmations product_ocr_confirmations_selected_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.product_ocr_confirmations
    ADD CONSTRAINT product_ocr_confirmations_selected_item_id_fkey FOREIGN KEY (selected_item_id) REFERENCES public.catalog_items(id);


--
-- Name: promotion_usage promotion_usage_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.promotion_usage
    ADD CONSTRAINT promotion_usage_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- Name: promotions promotions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: proof_requests proof_requests_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.proof_requests
    ADD CONSTRAINT proof_requests_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: proof_requests proof_requests_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.proof_requests
    ADD CONSTRAINT proof_requests_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: proof_requests proof_requests_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.proof_requests
    ADD CONSTRAINT proof_requests_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: proof_requests proof_requests_payment_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.proof_requests
    ADD CONSTRAINT proof_requests_payment_link_id_fkey FOREIGN KEY (payment_link_id) REFERENCES public.payment_links(id) ON DELETE SET NULL;


--
-- Name: proof_requests proof_requests_proof_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.proof_requests
    ADD CONSTRAINT proof_requests_proof_id_fkey FOREIGN KEY (proof_id) REFERENCES public.payment_proofs(id) ON DELETE SET NULL;


--
-- Name: push_subscriptions push_subscriptions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.merchant_staff(id) ON DELETE CASCADE;


--
-- Name: quote_request_events quote_request_events_quote_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.quote_request_events
    ADD CONSTRAINT quote_request_events_quote_request_id_fkey FOREIGN KEY (quote_request_id) REFERENCES public.quote_requests(id) ON DELETE CASCADE;


--
-- Name: quote_requests quote_requests_feature_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.quote_requests
    ADD CONSTRAINT quote_requests_feature_request_id_fkey FOREIGN KEY (feature_request_id) REFERENCES public.feature_requests(id) ON DELETE SET NULL;


--
-- Name: quote_requests quote_requests_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.quote_requests
    ADD CONSTRAINT quote_requests_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: rate_limit_counters rate_limit_counters_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.rate_limit_counters
    ADD CONSTRAINT rate_limit_counters_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: rate_limit_violations rate_limit_violations_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.rate_limit_violations
    ADD CONSTRAINT rate_limit_violations_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: recovered_carts recovered_carts_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.recovered_carts
    ADD CONSTRAINT recovered_carts_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: recovered_carts recovered_carts_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.recovered_carts
    ADD CONSTRAINT recovered_carts_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: recovered_carts recovered_carts_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.recovered_carts
    ADD CONSTRAINT recovered_carts_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: replenishment_recommendations replenishment_recommendations_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.replenishment_recommendations
    ADD CONSTRAINT replenishment_recommendations_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: replenishment_recommendations replenishment_recommendations_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.replenishment_recommendations
    ADD CONSTRAINT replenishment_recommendations_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: segment_memberships segment_memberships_segment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.segment_memberships
    ADD CONSTRAINT segment_memberships_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.customer_segments(id) ON DELETE CASCADE;


--
-- Name: shipments shipments_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: shipments shipments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: shrinkage_records shrinkage_records_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.shrinkage_records
    ADD CONSTRAINT shrinkage_records_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: shrinkage_records shrinkage_records_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.shrinkage_records
    ADD CONSTRAINT shrinkage_records_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.inventory_variants(id) ON DELETE SET NULL;


--
-- Name: sku_merge_log sku_merge_log_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.sku_merge_log
    ADD CONSTRAINT sku_merge_log_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: staff_sessions staff_sessions_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.staff_sessions
    ADD CONSTRAINT staff_sessions_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.merchant_staff(id) ON DELETE CASCADE;


--
-- Name: stock_alerts stock_alerts_catalog_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.stock_alerts
    ADD CONSTRAINT stock_alerts_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(id) ON DELETE CASCADE;


--
-- Name: stock_alerts stock_alerts_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.stock_alerts
    ADD CONSTRAINT stock_alerts_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_catalog_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: stock_reservations stock_reservations_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.stock_reservations
    ADD CONSTRAINT stock_reservations_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: stock_reservations stock_reservations_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.stock_reservations
    ADD CONSTRAINT stock_reservations_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: stock_reservations stock_reservations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.stock_reservations
    ADD CONSTRAINT stock_reservations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: stock_reservations stock_reservations_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.stock_reservations
    ADD CONSTRAINT stock_reservations_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.inventory_variants(id) ON DELETE CASCADE;


--
-- Name: subscription_add_ons subscription_add_ons_addon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscription_add_ons
    ADD CONSTRAINT subscription_add_ons_addon_id_fkey FOREIGN KEY (addon_id) REFERENCES public.add_ons(id) ON DELETE RESTRICT;


--
-- Name: subscription_add_ons subscription_add_ons_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscription_add_ons
    ADD CONSTRAINT subscription_add_ons_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE RESTRICT;


--
-- Name: substitution_suggestions substitution_suggestions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.substitution_suggestions
    ADD CONSTRAINT substitution_suggestions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: substitution_suggestions substitution_suggestions_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.substitution_suggestions
    ADD CONSTRAINT substitution_suggestions_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: supplier_discovery_results supplier_discovery_results_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.supplier_discovery_results
    ADD CONSTRAINT supplier_discovery_results_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: supplier_imports supplier_imports_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.supplier_imports
    ADD CONSTRAINT supplier_imports_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: supplier_imports supplier_imports_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.supplier_imports
    ADD CONSTRAINT supplier_imports_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: supplier_products supplier_products_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.supplier_products
    ADD CONSTRAINT supplier_products_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE SET NULL;


--
-- Name: supplier_products supplier_products_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.supplier_products
    ADD CONSTRAINT supplier_products_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: supplier_products supplier_products_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.supplier_products
    ADD CONSTRAINT supplier_products_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_products supplier_products_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.supplier_products
    ADD CONSTRAINT supplier_products_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.inventory_variants(id) ON DELETE SET NULL;


--
-- Name: suppliers suppliers_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: tax_reports tax_reports_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.tax_reports
    ADD CONSTRAINT tax_reports_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: team_tasks team_tasks_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.team_tasks
    ADD CONSTRAINT team_tasks_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: twilio_message_log twilio_message_log_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.twilio_message_log
    ADD CONSTRAINT twilio_message_log_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: upsell_rules upsell_rules_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.upsell_rules
    ADD CONSTRAINT upsell_rules_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id);


--
-- Name: usage_ledger usage_ledger_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usage_ledger
    ADD CONSTRAINT usage_ledger_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: usage_ledger usage_ledger_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usage_ledger
    ADD CONSTRAINT usage_ledger_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;


--
-- Name: usage_pack_prices usage_pack_prices_usage_pack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usage_pack_prices
    ADD CONSTRAINT usage_pack_prices_usage_pack_id_fkey FOREIGN KEY (usage_pack_id) REFERENCES public.usage_packs(id) ON DELETE CASCADE;


--
-- Name: usage_period_aggregates usage_period_aggregates_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usage_period_aggregates
    ADD CONSTRAINT usage_period_aggregates_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: usage_period_aggregates usage_period_aggregates_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.usage_period_aggregates
    ADD CONSTRAINT usage_period_aggregates_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;


--
-- Name: vip_rules vip_rules_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.vip_rules
    ADD CONSTRAINT vip_rules_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: voice_transcriptions voice_transcriptions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.voice_transcriptions
    ADD CONSTRAINT voice_transcriptions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: warehouse_locations warehouse_locations_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.warehouse_locations
    ADD CONSTRAINT warehouse_locations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.merchant_branches(id) ON DELETE SET NULL;


--
-- Name: warehouse_locations warehouse_locations_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.warehouse_locations
    ADD CONSTRAINT warehouse_locations_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: webhook_deliveries webhook_deliveries_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: webhook_deliveries webhook_deliveries_webhook_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES public.webhooks(id) ON DELETE CASCADE;


--
-- Name: webhooks webhooks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.merchant_staff(id) ON DELETE SET NULL;


--
-- Name: webhooks webhooks_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: what_if_scenarios what_if_scenarios_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.what_if_scenarios
    ADD CONSTRAINT what_if_scenarios_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: whatsapp_conversation_windows whatsapp_conversation_windows_merchant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.whatsapp_conversation_windows
    ADD CONSTRAINT whatsapp_conversation_windows_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: whatsapp_message_log whatsapp_message_log_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.whatsapp_message_log
    ADD CONSTRAINT whatsapp_message_log_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict gedXUpmb7bENBCahh5rQuJjJvmUBKX7VXhxYhuxp5jcJSOQec3PgDZPMVYb0NoE


-- Migration: 010_notifications_system.sql
-- Description: Notifications system for multi-channel alerts
-- Created: 2024

-- =============================================
-- STAFF MEMBERS TABLE (if not exists)
-- =============================================
CREATE TABLE IF NOT EXISTS staff_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(50) DEFAULT 'STAFF' CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'STAFF', 'VIEWER')),
    permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_staff_email UNIQUE (merchant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_staff_merchant ON staff_members(merchant_id);
CREATE INDEX IF NOT EXISTS idx_staff_email ON staff_members(email);

-- =============================================
-- NOTIFICATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
    
    -- Notification content
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    title_ar VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    message_ar TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    
    -- Priority and delivery
    priority VARCHAR(20) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    channels TEXT[] DEFAULT ARRAY['IN_APP'],
    
    -- Status
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    
    -- Navigation
    action_url VARCHAR(500),
    
    -- Expiration
    expires_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_type CHECK (type IN (
        'ORDER_PLACED', 'ORDER_CONFIRMED', 'ORDER_SHIPPED', 'ORDER_DELIVERED',
        'LOW_STOCK', 'OUT_OF_STOCK',
        'NEW_CONVERSATION', 'ESCALATED_CONVERSATION',
        'PAYMENT_RECEIVED', 'PAYMENT_FAILED',
        'NEW_REVIEW', 'NEW_CUSTOMER',
        'DAILY_SUMMARY', 'WEEKLY_REPORT',
        'PROMOTION_ENDING', 'MILESTONE_REACHED',
        'SYSTEM_ALERT', 'SECURITY_ALERT'
    ))
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_merchant ON notifications(merchant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_merchant_unread ON notifications(merchant_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_staff ON notifications(staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_expires ON notifications(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- =============================================
-- NOTIFICATION PREFERENCES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
    
    -- Channel settings
    email_enabled BOOLEAN DEFAULT true,
    push_enabled BOOLEAN DEFAULT true,
    whatsapp_enabled BOOLEAN DEFAULT false,
    
    -- Quiet hours (format: HH:MM)
    quiet_hours_start VARCHAR(5),
    quiet_hours_end VARCHAR(5),
    
    -- Type-specific preferences
    enabled_types TEXT[] DEFAULT ARRAY[
        'ORDER_PLACED', 'ORDER_CONFIRMED', 'ORDER_SHIPPED', 'ORDER_DELIVERED',
        'LOW_STOCK', 'ESCALATED_CONVERSATION', 'PAYMENT_RECEIVED',
        'DAILY_SUMMARY', 'SECURITY_ALERT'
    ],
    
    -- Contact info
    email_address VARCHAR(255),
    whatsapp_number VARCHAR(20),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint per merchant/staff combo using unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_prefs_per_user ON notification_preferences(merchant_id, COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Indexes for preferences
CREATE INDEX IF NOT EXISTS idx_notification_prefs_merchant ON notification_preferences(merchant_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_staff ON notification_preferences(staff_id) WHERE staff_id IS NOT NULL;

-- =============================================
-- PUSH SUBSCRIPTIONS TABLE (for Web Push)
-- =============================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
    
    -- Web Push subscription details
    endpoint TEXT NOT NULL,
    keys JSONB NOT NULL,
    user_agent VARCHAR(500),
    
    -- Tracking
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ,
    failed_attempts INT DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_push_endpoint UNIQUE (endpoint)
);

-- Indexes for push subscriptions
CREATE INDEX IF NOT EXISTS idx_push_subs_merchant ON push_subscriptions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_active ON push_subscriptions(is_active) WHERE is_active = true;

-- =============================================
-- NOTIFICATION DELIVERY LOG
-- =============================================
CREATE TABLE IF NOT EXISTS notification_delivery_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED')),
    error_message TEXT,
    external_id VARCHAR(255),
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for delivery log
CREATE INDEX IF NOT EXISTS idx_delivery_log_notification ON notification_delivery_log(notification_id);
CREATE INDEX IF NOT EXISTS idx_delivery_log_status ON notification_delivery_log(status);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Function to clean up expired notifications
CREATE OR REPLACE FUNCTION cleanup_expired_notifications()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM notifications 
    WHERE expires_at < NOW() 
    AND is_read = true;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get unread count efficiently
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_merchant_id VARCHAR, p_staff_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
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
$$ LANGUAGE plpgsql;

-- =============================================
-- NOTIFICATION TEMPLATES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id VARCHAR(100) REFERENCES merchants(id) ON DELETE CASCADE,
    
    -- Template details
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    
    -- Content templates (with {{variable}} placeholders)
    title_template VARCHAR(255) NOT NULL,
    title_ar_template VARCHAR(255) NOT NULL,
    message_template TEXT NOT NULL,
    message_ar_template TEXT NOT NULL,
    
    -- Default settings
    default_priority VARCHAR(20) DEFAULT 'MEDIUM',
    default_channels TEXT[] DEFAULT ARRAY['IN_APP'],
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_template_name UNIQUE (merchant_id, name)
);

-- Insert default system templates
INSERT INTO notification_templates (merchant_id, name, type, title_template, title_ar_template, message_template, message_ar_template, default_priority, default_channels, is_system)
VALUES 
    (NULL, 'order_placed', 'ORDER_PLACED', 
     'New Order #{{order_id}}', 'طلب جديد #{{order_id}}',
     '{{customer_name}} placed an order for {{total}} EGP', '{{customer_name}} قدم طلباً بقيمة {{total}} جنيه',
     'HIGH', ARRAY['IN_APP', 'PUSH'], true),
    
    (NULL, 'low_stock', 'LOW_STOCK',
     'Low Stock Alert: {{product_name}}', 'تنبيه انخفاض المخزون: {{product_name}}',
     'Only {{current_stock}} units left (threshold: {{threshold}})', 'بقي {{current_stock}} وحدة فقط (الحد الأدنى: {{threshold}})',
     'HIGH', ARRAY['IN_APP', 'EMAIL'], true),
    
    (NULL, 'escalation', 'ESCALATED_CONVERSATION',
     'Conversation Needs Attention', 'محادثة تحتاج انتباهك',
     'Customer {{customer_phone}} conversation escalated: {{reason}}', 'تم تصعيد محادثة العميل {{customer_phone}}: {{reason}}',
     'URGENT', ARRAY['IN_APP', 'PUSH', 'WHATSAPP'], true),
    
    (NULL, 'daily_summary', 'DAILY_SUMMARY',
     'Today''s Summary', 'ملخص اليوم',
     '{{orders_count}} orders, {{revenue}} EGP revenue, {{new_customers}} new customers', '{{orders_count}} طلبات، {{revenue}} جنيه إيرادات، {{new_customers}} عملاء جدد',
     'LOW', ARRAY['IN_APP', 'EMAIL'], true),
    
    (NULL, 'security_alert', 'SECURITY_ALERT',
     'Security Alert: {{alert_type}}', 'تنبيه أمني: {{alert_type}}',
     '{{details}}', '{{details}}',
     'URGENT', ARRAY['IN_APP', 'EMAIL', 'PUSH'], true)
ON CONFLICT DO NOTHING;

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON TABLE notifications IS 'Multi-channel notification system for merchants and staff';
COMMENT ON TABLE notification_preferences IS 'Per-user notification preferences and settings';
COMMENT ON TABLE push_subscriptions IS 'Web Push API subscriptions for browser notifications';
COMMENT ON TABLE notification_delivery_log IS 'Audit trail for notification delivery attempts';
COMMENT ON TABLE notification_templates IS 'Customizable notification templates with variable support';

-- Feature/Agent suggestions from merchants

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feature_request_status') THEN
    CREATE TYPE feature_request_status AS ENUM ('NEW', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'DONE', 'REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feature_request_category') THEN
    CREATE TYPE feature_request_category AS ENUM ('AGENT', 'FEATURE', 'INTEGRATION', 'UX', 'OTHER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS feature_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES merchant_staff(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category feature_request_category NOT NULL DEFAULT 'FEATURE',
  status feature_request_status NOT NULL DEFAULT 'NEW',
  priority VARCHAR(10) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_requests_merchant ON feature_requests(merchant_id);
CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON feature_requests(status);
CREATE INDEX IF NOT EXISTS idx_feature_requests_category ON feature_requests(category);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER update_feature_requests_updated_at BEFORE UPDATE ON feature_requests
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

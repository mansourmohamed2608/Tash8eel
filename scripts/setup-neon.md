# Neon Database Setup Guide

## Step 1: Get Your Connection String

1. Go to your Neon Dashboard: https://console.neon.tech/
2. Select your project "TashBeel"
3. Click **"Connection string"** button
4. Copy the connection string (it looks like):
   ```
   postgresql://neondb_owner:xxxxx@ep-xxx-xxx-12345678.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

## Step 2: Update Environment Files

### API (.env in apps/api/)

```env
DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-XXXX.us-east-1.aws.neon.tech/neondb?sslmode=require
DATABASE_HOST=ep-XXXX.us-east-1.aws.neon.tech
DATABASE_PORT=5432
DATABASE_NAME=neondb
DATABASE_USER=neondb_owner
DATABASE_PASSWORD=YOUR_PASSWORD
DATABASE_SSL=true
```

### Worker (.env in apps/worker/)

```env
DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-XXXX.us-east-1.aws.neon.tech/neondb?sslmode=require
DATABASE_HOST=ep-XXXX.us-east-1.aws.neon.tech
DATABASE_PORT=5432
DATABASE_NAME=neondb
DATABASE_USER=neondb_owner
DATABASE_PASSWORD=YOUR_PASSWORD
DATABASE_SSL=true
```

## Step 3: Run Migrations on Neon

You can run migrations directly from the Neon SQL Editor or using psql:

### Option A: Using Neon SQL Editor

1. Go to Neon Dashboard → SQL Editor
2. Copy and paste the contents of each migration file in order:
   - `apps/api/migrations/001_init.sql`
   - `apps/api/migrations/002_production_features.sql`
   - ... (and so on)

### Option B: Using psql (if installed)

```bash
# Set your connection string
export DATABASE_URL="postgresql://neondb_owner:YOUR_PASSWORD@ep-XXXX.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Run migrations in order
psql $DATABASE_URL -f apps/api/migrations/001_init.sql
psql $DATABASE_URL -f apps/api/migrations/002_production_features.sql
# ... continue for all migration files
```

### Option C: Using the setup script

```bash
npm run db:migrate:neon
```

## Step 4: Seed Demo Data

After running migrations, seed the demo data:

```sql
-- Insert demo merchant
INSERT INTO merchants (id, name, api_key, is_active, category)
VALUES ('demo-merchant', 'متجر تجريبي', 'mkey_demo_1234567890abcdef1234567890abcdef12345678', true, 'GENERAL')
ON CONFLICT (id) DO UPDATE SET api_key = EXCLUDED.api_key, is_active = true;

-- Insert demo staff user
INSERT INTO merchant_staff (id, merchant_id, email, name, role, password_hash, status)
VALUES (
  gen_random_uuid(),
  'demo-merchant',
  'demo@tash8eel.com',
  'صاحب المتجر',
  'OWNER',
  '$2b$10$demo.password.hash.placeholder',
  'ACTIVE'
) ON CONFLICT (merchant_id, email) DO NOTHING;
```

## Step 5: Verify Connection

Start your app and check the logs:

```bash
npm run dev
```

You should see:

```
[DatabaseModule] Database connection established
```

## Troubleshooting

### SSL Connection Error

Make sure `DATABASE_SSL=true` is set in your .env file.

### Connection Timeout

Neon has cold starts. The first connection might take a few seconds.

### IP Restrictions

Neon allows all IPs by default. If you've restricted IPs, add your current IP.

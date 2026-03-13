#!/usr/bin/env ts-node
/**
 * Create demo staff login for the seeded demo merchant
 * Run from apps/api:
 *   npx ts-node -r tsconfig-paths/register src/database/seeds/create-demo-staff.ts
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, '../../../../../apps/api/.env') });
}

const MERCHANT_ID = 'bayt-aljamaal';
const EMAIL = 'demo@baytaljamaal.com';
const PASSWORD = 'Demo123!';

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');

  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Delete existing if present (idempotent)
  await c.query(
    'DELETE FROM merchant_staff WHERE merchant_id = $1 AND email = $2',
    [MERCHANT_ID, EMAIL],
  );

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const id = uuidv4();

  await c.query(
    `INSERT INTO merchant_staff
       (id, merchant_id, email, name, role, password_hash, status, permissions, must_change_password)
     VALUES ($1, $2, $3, 'صاحب المتجر التجريبي', 'OWNER', $4, 'ACTIVE', '{}', false)`,
    [id, MERCHANT_ID, EMAIL, passwordHash],
  );

  console.log('\n✅ Demo staff account created!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Merchant ID :', MERCHANT_ID);
  console.log('  Email       :', EMAIL);
  console.log('  Password    :', PASSWORD);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await c.end();
}

run().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });

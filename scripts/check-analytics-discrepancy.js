const { Pool } = require('pg');
require('dotenv').config({ path: __dirname + '/../apps/api/.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const merchantRes = await pool.query('SELECT id, name FROM merchants LIMIT 1');
  const merchantId = merchantRes.rows[0]?.id;
  console.log('=== MERCHANT ===', merchantId, merchantRes.rows[0]?.name);

  // Check orders and their statuses
  const orders = await pool.query(
    'SELECT order_number, status, payment_status, payment_method, created_at FROM orders WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 15',
    [merchantId]
  );
  console.log('\n=== ORDERS ===');
  orders.rows.forEach(r => console.log(r.order_number, '|', r.status, '|', r.payment_status, '|', r.payment_method));

  // Check conversations and their states
  const convs = await pool.query(
    'SELECT id, state, created_at FROM conversations WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 10',
    [merchantId]
  );
  console.log('\n=== CONVERSATIONS ===');
  convs.rows.forEach(r => console.log(r.id.substring(0,12), '|', r.state));

  // Count delivered/completed orders
  const delivered = await pool.query(
    "SELECT COUNT(*) FROM orders WHERE merchant_id = $1 AND UPPER(status::text) IN ('DELIVERED','COMPLETED')",
    [merchantId]
  );
  console.log('\n=== DELIVERED/COMPLETED ORDERS ===', delivered.rows[0].count);

  // Count ORDER_PLACED conversations
  const placed = await pool.query(
    "SELECT COUNT(*) FROM conversations WHERE merchant_id = $1 AND UPPER(state::text) = 'ORDER_PLACED'",
    [merchantId]
  );
  console.log('=== ORDER_PLACED CONVERSATIONS ===', placed.rows[0].count);

  // Run the actual funnel query (same as getConversionAnalytics)
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  console.log('\n=== FUNNEL QUERY (last 30 days) ===');
  try {
    const funnel = await pool.query(
      `WITH scoped_conversations AS (
         SELECT UPPER(COALESCE(state::text, '')) as state_norm
         FROM conversations
         WHERE merchant_id = $1
           AND COALESCE(last_message_at, updated_at, created_at) >= $2
       ),
       actual_orders AS (
         SELECT COUNT(*) as delivered_count
         FROM orders
         WHERE merchant_id = $1
           AND created_at >= $2
           AND UPPER(status::text) IN ('DELIVERED', 'COMPLETED')
       )
       SELECT
         COUNT(*) FILTER (WHERE state_norm <> '') as total_conversations,
         COUNT(*) FILTER (WHERE state_norm IN (
           'COLLECTING_ITEMS', 'COLLECTING_VARIANTS', 'COLLECTING_CUSTOMER_INFO',
           'COLLECTING_ADDRESS', 'NEGOTIATING', 'CONFIRMING_ORDER', 'ORDER_PLACED'
         )) as added_to_cart,
         COUNT(*) FILTER (WHERE state_norm IN (
           'COLLECTING_CUSTOMER_INFO', 'COLLECTING_ADDRESS', 'NEGOTIATING',
           'CONFIRMING_ORDER', 'ORDER_PLACED'
         )) as started_checkout,
         GREATEST(
           COUNT(*) FILTER (WHERE state_norm = 'ORDER_PLACED'),
           (SELECT delivered_count FROM actual_orders)
         ) as completed_order
       FROM scoped_conversations`,
      [merchantId, startDate]
    );
    console.log('Funnel result:', funnel.rows[0]);
  } catch (e) {
    console.log('Funnel query error:', e.message);
  }

  // Check if status column is an enum type
  const colType = await pool.query(
    `SELECT column_name, data_type, udt_name 
     FROM information_schema.columns 
     WHERE table_name = 'orders' AND column_name = 'status'`
  );
  console.log('\n=== orders.status column type ===', colType.rows[0]);

  const convColType = await pool.query(
    `SELECT column_name, data_type, udt_name 
     FROM information_schema.columns 
     WHERE table_name = 'conversations' AND column_name = 'state'`
  );
  console.log('=== conversations.state column type ===', convColType.rows[0]);

  // Check followups data
  const followups = await pool.query(
    'SELECT id, type, status, order_id, conversation_id, scheduled_at, created_at FROM followups WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 10',
    [merchantId]
  );
  console.log('\n=== FOLLOWUPS ===');
  followups.rows.forEach(r => console.log(r.id?.substring(0,12), '|', r.type, '|', r.status, '|', r.order_id?.substring(0,12), '|', r.scheduled_at));

  // Check abandoned cart conversations
  const abandoned = await pool.query(
    `SELECT cv.id, cv.state, cv.last_message_at, cv.next_followup_at,
            COALESCE(cv.cart->>'total', '0') as cart_total
     FROM conversations cv
     WHERE cv.merchant_id = $1
       AND UPPER(COALESCE(cv.state::text, '')) IN (
         'COLLECTING_ITEMS','COLLECTING_VARIANTS','COLLECTING_CUSTOMER_INFO',
         'COLLECTING_ADDRESS','NEGOTIATING','CONFIRMING_ORDER'
       )
     ORDER BY cv.last_message_at DESC LIMIT 5`,
    [merchantId]
  );
  console.log('\n=== ABANDONED CART CONVERSATIONS ===');
  abandoned.rows.forEach(r => console.log(r.id?.substring(0,12), '|', r.state, '|', r.cart_total, '|', r.last_message_at));

  await pool.end();
}

check().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

const { Pool } = require('pg');
require('dotenv').config({ path: 'Tash8eel/apps/api/.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  // Check conversations that would be abandoned carts
  const convs = await pool.query(`
    SELECT cv.id, cv.state, cv.sender_id, cv.cart, cv.last_message_at, cv.created_at,
           c.name as customer_name, c.phone as customer_phone
    FROM conversations cv
    LEFT JOIN customers c ON c.id = cv.customer_id AND c.merchant_id = cv.merchant_id
    WHERE cv.merchant_id = 'demo-merchant-001'
    ORDER BY cv.created_at DESC
  `);
  
  console.log('=== ALL CONVERSATIONS ===');
  for (const c of convs.rows) {
    const cartItems = c.cart?.items ? c.cart.items.length : 0;
    const cartTotal = c.cart?.total || 0;
    console.log(`  ${c.id} | state=${c.state} | sender=${c.sender_id} | customer=${c.customer_name || 'N/A'} | phone=${c.customer_phone || 'N/A'} | cartItems=${cartItems} | cartTotal=${cartTotal}`);
  }

  // Check followups table
  const followups = await pool.query(`
    SELECT f.*, o.order_number
    FROM followups f
    LEFT JOIN orders o ON o.id = f.order_id
    WHERE f.merchant_id = 'demo-merchant-001'
  `);
  
  console.log('\n=== FOLLOWUPS TABLE ===');
  for (const f of followups.rows) {
    console.log(`  ${f.id} | type=${f.type} | status=${f.status} | order=${f.order_number || 'N/A'} | conv=${f.conversation_id || 'N/A'}`);
  }

  // Check what the followups endpoint would return
  const result = await pool.query(`
    WITH pending_followups AS (
      SELECT
        f.id::text as id,
        COALESCE(
          o.order_number,
          CONCAT('CONV-', LEFT(COALESCE(f.conversation_id::text, f.id::text), 8))
        ) as order_number,
        COALESCE(o.customer_name, c.name, cv.sender_id, 'عميل') as customer_name,
        COALESCE(o.customer_phone, c.phone, cv.sender_id, '') as customer_phone,
        'pending_followup' as source
      FROM followups f
      LEFT JOIN orders o ON o.id = f.order_id AND o.merchant_id = f.merchant_id
      LEFT JOIN conversations cv ON cv.id = f.conversation_id AND cv.merchant_id = f.merchant_id
      LEFT JOIN customers c ON c.id = COALESCE(f.customer_id, cv.customer_id) AND c.merchant_id = f.merchant_id
      WHERE f.merchant_id = 'demo-merchant-001'
        AND UPPER(COALESCE(f.status::text, '')) = 'PENDING'
    ),
    derived_conversation_followups AS (
      SELECT
        cv.id::text as id,
        CONCAT('CONV-', LEFT(cv.id::text, 8)) as order_number,
        COALESCE(c.name, cv.sender_id, 'عميل') as customer_name,
        COALESCE(c.phone, cv.sender_id, '') as customer_phone,
        'abandoned_cart' as source
      FROM conversations cv
      LEFT JOIN customers c ON c.id = cv.customer_id AND c.merchant_id = cv.merchant_id
      WHERE cv.merchant_id = 'demo-merchant-001'
        AND UPPER(COALESCE(cv.state::text, '')) IN (
          'COLLECTING_ITEMS', 'COLLECTING_VARIANTS', 'COLLECTING_CUSTOMER_INFO',
          'COLLECTING_ADDRESS', 'NEGOTIATING', 'CONFIRMING_ORDER'
        )
        AND COALESCE(
          jsonb_array_length(
            CASE
              WHEN jsonb_typeof(cv.cart->'items') = 'array' THEN cv.cart->'items'
              ELSE '[]'::jsonb
            END
          ), 0
        ) > 0
        AND COALESCE(cv.last_message_at, cv.updated_at, cv.created_at) < NOW() - INTERVAL '30 minutes'
        AND (cv.context IS NULL OR cv.context->>'followup_resolved' IS NULL OR cv.context->>'followup_resolved' = 'false')
        AND NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.merchant_id = cv.merchant_id AND o.conversation_id = cv.id
            AND UPPER(COALESCE(o.status::text, '')) NOT IN ('DRAFT', 'CANCELLED')
        )
        AND NOT EXISTS (
          SELECT 1 FROM followups f
          WHERE f.merchant_id = cv.merchant_id AND f.conversation_id = cv.id
            AND UPPER(COALESCE(f.status::text, '')) = 'PENDING'
        )
    )
    SELECT * FROM pending_followups
    UNION ALL
    SELECT * FROM derived_conversation_followups
  `);

  console.log('\n=== FOLLOWUP RESULTS (what API returns) ===');
  for (const r of result.rows) {
    console.log(`  ${r.id} | order_number=${r.order_number} | customer=${r.customer_name} | phone=${r.customer_phone} | source=${r.source}`);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/**
 * CLI for replaying DLQ events
 * 
 * Usage:
 *   npx ts-node src/cli/dlq-replay.ts <eventId>
 *   npx ts-node src/cli/dlq-replay.ts --all
 *   npx ts-node src/cli/dlq-replay.ts --merchant <merchantId>
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/operations_agent';

interface DlqEvent {
  id: string;
  original_event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: any;
  error_message: string;
  retry_count: number;
  merchant_id: string;
  correlation_id: string;
  original_created_at: Date;
  replayed_at: Date | null;
  created_at: Date;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
DLQ Replay CLI

Usage:
  npx ts-node src/cli/dlq-replay.ts <eventId>        - Replay single event
  npx ts-node src/cli/dlq-replay.ts --all            - Replay all pending events
  npx ts-node src/cli/dlq-replay.ts --merchant <id>  - Replay all for merchant
  npx ts-node src/cli/dlq-replay.ts --list           - List pending events
  npx ts-node src/cli/dlq-replay.ts --stats          - Show DLQ statistics
    `);
    process.exit(0);
  }

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    if (args[0] === '--list') {
      await listEvents(pool);
    } else if (args[0] === '--stats') {
      await showStats(pool);
    } else if (args[0] === '--all') {
      await replayAll(pool);
    } else if (args[0] === '--merchant' && args[1]) {
      await replayForMerchant(pool, args[1]);
    } else {
      await replaySingle(pool, args[0]);
    }
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function listEvents(pool: Pool): Promise<void> {
  const result = await pool.query<DlqEvent>(`
    SELECT * FROM dlq_events 
    WHERE replayed_at IS NULL 
    ORDER BY created_at DESC 
    LIMIT 50
  `);

  if (result.rows.length === 0) {
    console.log('✅ No pending DLQ events');
    return;
  }

  console.log(`\n📋 Pending DLQ Events (${result.rows.length}):\n`);
  console.log('ID'.padEnd(40) + 'Type'.padEnd(25) + 'Merchant'.padEnd(20) + 'Age');
  console.log('-'.repeat(100));

  for (const event of result.rows) {
    const ageHours = Math.round((Date.now() - new Date(event.created_at).getTime()) / (1000 * 60 * 60));
    console.log(
      event.id.padEnd(40) +
      event.event_type.padEnd(25) +
      event.merchant_id.slice(0, 18).padEnd(20) +
      `${ageHours}h`
    );
  }
}

async function showStats(pool: Pool): Promise<void> {
  const statsResult = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE replayed_at IS NULL) as pending,
      COUNT(*) FILTER (WHERE replayed_at IS NOT NULL) as replayed,
      MIN(created_at) as oldest,
      MAX(created_at) as newest
    FROM dlq_events
  `);

  const byTypeResult = await pool.query(`
    SELECT event_type, COUNT(*) as count
    FROM dlq_events
    WHERE replayed_at IS NULL
    GROUP BY event_type
    ORDER BY count DESC
  `);

  const stats = statsResult.rows[0];

  console.log('\n📊 DLQ Statistics\n');
  console.log(`Total events:     ${stats.total}`);
  console.log(`Pending:          ${stats.pending}`);
  console.log(`Replayed:         ${stats.replayed}`);
  
  if (stats.oldest) {
    console.log(`Oldest event:     ${new Date(stats.oldest).toISOString()}`);
    console.log(`Newest event:     ${new Date(stats.newest).toISOString()}`);
  }

  if (byTypeResult.rows.length > 0) {
    console.log('\nPending by event type:');
    for (const row of byTypeResult.rows) {
      console.log(`  ${row.event_type}: ${row.count}`);
    }
  }
}

async function replaySingle(pool: Pool, eventId: string): Promise<void> {
  console.log(`\n🔄 Replaying event ${eventId}...`);

  const result = await pool.query<DlqEvent>(
    `SELECT * FROM dlq_events WHERE id = $1`,
    [eventId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Event ${eventId} not found`);
  }

  const event = result.rows[0];

  if (event.replayed_at) {
    throw new Error('Event has already been replayed');
  }

  await replayEvent(pool, event);
  console.log('✅ Event replayed successfully');
}

async function replayAll(pool: Pool): Promise<void> {
  const result = await pool.query<DlqEvent>(`
    SELECT * FROM dlq_events 
    WHERE replayed_at IS NULL 
    ORDER BY created_at ASC
  `);

  if (result.rows.length === 0) {
    console.log('✅ No pending events to replay');
    return;
  }

  console.log(`\n🔄 Replaying ${result.rows.length} events...\n`);

  let succeeded = 0;
  let failed = 0;

  for (const event of result.rows) {
    try {
      await replayEvent(pool, event);
      succeeded++;
      console.log(`  ✅ ${event.id} (${event.event_type})`);
    } catch (error: any) {
      failed++;
      console.log(`  ❌ ${event.id}: ${error.message}`);
    }
  }

  console.log(`\n📊 Results: ${succeeded} succeeded, ${failed} failed`);
}

async function replayForMerchant(pool: Pool, merchantId: string): Promise<void> {
  const result = await pool.query<DlqEvent>(`
    SELECT * FROM dlq_events 
    WHERE replayed_at IS NULL AND merchant_id = $1
    ORDER BY created_at ASC
  `, [merchantId]);

  if (result.rows.length === 0) {
    console.log(`✅ No pending events for merchant ${merchantId}`);
    return;
  }

  console.log(`\n🔄 Replaying ${result.rows.length} events for merchant ${merchantId}...\n`);

  let succeeded = 0;
  let failed = 0;

  for (const event of result.rows) {
    try {
      await replayEvent(pool, event);
      succeeded++;
      console.log(`  ✅ ${event.id} (${event.event_type})`);
    } catch (error: any) {
      failed++;
      console.log(`  ❌ ${event.id}: ${error.message}`);
    }
  }

  console.log(`\n📊 Results: ${succeeded} succeeded, ${failed} failed`);
}

async function replayEvent(pool: Pool, event: DlqEvent): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Create new outbox event
    const newEventId = uuidv4();
    await client.query(`
      INSERT INTO outbox_events (
        id, event_type, aggregate_type, aggregate_id, 
        payload, status, merchant_id, correlation_id,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, NOW(), NOW())
    `, [
      newEventId,
      event.event_type,
      event.aggregate_type,
      event.aggregate_id,
      event.payload,
      event.merchant_id,
      event.correlation_id,
    ]);

    // Mark DLQ event as replayed
    await client.query(`
      UPDATE dlq_events
      SET replayed_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [event.id]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main();

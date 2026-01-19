// Jest setup file
// Add any global test setup here
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env file FIRST before setting defaults
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock environment variables for tests (only set defaults if not already set)
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/operations_agent_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
// Don't override OPENAI_API_KEY if it's set in .env
process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'test-admin-key';

// Suppress console logs during tests
if (process.env.SUPPRESS_LOGS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

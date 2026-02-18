#!/usr/bin/env node
/**
 * E2E Test Runner
 * Supports both Neon (no Docker) and Docker PostgreSQL modes.
 *
 * Usage:
 *   npm run test:e2e:ci          # Auto-detects: uses Neon if DATABASE_URL is set, else Docker
 *   SKIP_DOCKER=true npm run test:e2e:ci   # Force Neon mode (no Docker)
 */

const { execSync, spawnSync } = require("child_process");
const path = require("path");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

function log(color, message) {
  console.log(`${color}${message}${RESET}`);
}

function exec(command, options = {}) {
  return execSync(command, {
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });
}

function isDockerAvailable() {
  try {
    execSync("docker info", { stdio: "pipe", encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

function isNeonConfigured() {
  // Check if DATABASE_URL in .env points to Neon
  try {
    const fs = require("fs");
    const envPath = path.join(__dirname, "..", ".env");
    const envContent = fs.readFileSync(envPath, "utf8");
    return (
      envContent.includes("neon.tech") &&
      !envContent.match(/^#.*DATABASE_URL.*neon/m)
    );
  } catch {
    return false;
  }
}

async function runWithNeon() {
  log(CYAN, "▶ Using Neon PostgreSQL (no Docker required)");
  log(YELLOW, "  Redis is disabled for tests\n");

  // Load .env to get the Neon connection string
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

  const maskedUrl =
    process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":****@") || "not set";
  log(CYAN, `▶ Database: ${maskedUrl}\n`);

  log(CYAN, "▶ Running E2E tests...\n");

  // Use proper jest-e2e.json config (not testPathPattern) and NO --forceExit
  // Clean exit relies on proper teardown in afterAll hooks
  const result = spawnSync(
    "npx",
    ["jest", "--config", "apps/api/test/jest-e2e.json", "--runInBand"],
    {
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        NODE_ENV: "test",
        REDIS_ENABLED: "false",
      },
    },
  );

  return result.status || 0;
}

async function runWithDocker() {
  log(CYAN, "▶ Using Docker PostgreSQL + Redis");

  try {
    // Step 1: Start test containers
    log(CYAN, "\n▶ Starting test containers...");
    exec("docker compose -f docker-compose.test.yml up -d --wait");
    log(GREEN, "✓ Test containers started\n");

    // Step 2: Wait for services to be ready
    log(CYAN, "▶ Waiting for PostgreSQL...");
    let retries = 30;
    while (retries > 0) {
      try {
        exec(
          "docker compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U test_user -d operations_test",
          { stdio: "pipe" },
        );
        break;
      } catch {
        retries--;
        if (retries === 0) throw new Error("PostgreSQL failed to start");
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    log(GREEN, "✓ PostgreSQL ready\n");

    // Step 3: Run E2E tests
    // Use proper jest-e2e.json config (not testPathPattern) and NO --forceExit
    log(CYAN, "▶ Running E2E tests...\n");
    const result = spawnSync(
      "npx",
      ["jest", "--config", "apps/api/test/jest-e2e.json", "--runInBand"],
      {
        stdio: "inherit",
        shell: true,
        env: {
          ...process.env,
          DATABASE_URL:
            "postgres://test_user:test_password@localhost:5433/operations_test",
          REDIS_URL: "redis://localhost:6380",
          REDIS_ENABLED: "true",
          NODE_ENV: "test",
        },
      },
    );

    return result.status || 0;
  } finally {
    // Step 4: Cleanup
    log(CYAN, "\n▶ Stopping test containers...");
    try {
      exec("docker compose -f docker-compose.test.yml down -v", {
        stdio: "pipe",
      });
      log(GREEN, "✓ Test containers stopped");
    } catch (e) {
      log(YELLOW, `⚠ Cleanup warning: ${e.message}`);
    }
  }
}

async function main() {
  log(CYAN, "═══════════════════════════════════════════════════════════");
  log(CYAN, "                    E2E TEST RUNNER                        ");
  log(CYAN, "═══════════════════════════════════════════════════════════\n");

  let exitCode = 0;

  try {
    const skipDocker = process.env.SKIP_DOCKER === "true";
    const dockerAvailable = isDockerAvailable();
    const neonConfigured = isNeonConfigured();

    // Decision logic:
    // 1. If SKIP_DOCKER=true or Docker unavailable, use Neon
    // 2. If Neon is configured in .env, use Neon (simpler, no Docker needed)
    // 3. Otherwise, try Docker

    if (skipDocker || !dockerAvailable || neonConfigured) {
      if (!dockerAvailable && !neonConfigured) {
        log(RED, "✗ Docker is not available and Neon is not configured");
        log(
          YELLOW,
          "  Either start Docker Desktop or configure DATABASE_URL in .env to point to Neon",
        );
        process.exit(1);
      }
      exitCode = await runWithNeon();
    } else {
      exitCode = await runWithDocker();
    }
  } catch (error) {
    log(RED, `\n✗ Error: ${error.message}`);
    exitCode = 1;
  }

  log(CYAN, "\n═══════════════════════════════════════════════════════════");
  if (exitCode === 0) {
    log(GREEN, "                    E2E TESTS: PASSED                       ");
  } else {
    log(RED, "                    E2E TESTS: FAILED                       ");
  }
  log(CYAN, "═══════════════════════════════════════════════════════════\n");

  process.exit(exitCode);
}

main();

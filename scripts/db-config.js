// Shared database configuration for scripts
// Uses environment variable DATABASE_URL or prompts for it

const { Client } = require("pg");

function getConnectionString() {
  const connString = process.env.DATABASE_URL;
  if (!connString) {
    console.error("❌ DATABASE_URL environment variable is not set!");
    console.error("");
    console.error("Set it with:");
    console.error(
      '  $env:DATABASE_URL = "postgresql://user:pass@host/db?sslmode=require"',
    );
    console.error("");
    console.error("Or create a .env file in the project root.");
    process.exit(1);
  }
  return connString;
}

function createClient() {
  return new Client({
    connectionString: getConnectionString(),
  });
}

module.exports = { createClient, getConnectionString };

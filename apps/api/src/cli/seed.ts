#!/usr/bin/env node
/**
 * CLI for seeding demo data via NestJS SeedService
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/cli/seed.ts [--clean]
 *   npm run db:seed
 *   npm run db:seed:clean
 */

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { SeedService } from "../application/services/seed.service";

async function main(): Promise<void> {
  const isClean = process.argv.includes("--clean");

  console.log(
    isClean ? "🧹 Cleaning demo data...\n" : "🌱 Seeding full demo data...\n",
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const seedService = app.get(SeedService);

    if (isClean) {
      const result = await seedService.cleanDemo();
      console.log(`\n✅ Demo data cleaned in ${result.duration}ms`);
    } else {
      const result = await seedService.seedDemo();
      console.log(
        `\n✅ Seeding completed: ${result.tables} tables in ${result.duration}ms`,
      );
      console.log("\nDemo credentials:");
      console.log("  Merchant ID: demo-merchant");
      console.log("  Staff login: owner@tash8eel.com / Demo@1234");
      console.log("  API endpoint: POST /internal/seed/demo");
    }
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main();

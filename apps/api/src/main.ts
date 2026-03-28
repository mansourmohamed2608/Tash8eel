import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import { json, urlencoded } from "express";
import { Pool } from "pg";
import { AppModule } from "./app.module";
import { initTelemetry } from "./shared/telemetry/opentelemetry";
import { runPendingSqlMigrations } from "./infrastructure/database/sql-migrations";
import { DATABASE_POOL } from "./infrastructure/database/database.module";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");

  // Validate required environment variables in production
  if (process.env.NODE_ENV === "production") {
    const requiredEnvVars = [
      "DATABASE_URL",
      "JWT_SECRET",
      "JWT_REFRESH_SECRET",
      "ADMIN_API_KEY",
      "OPENAI_API_KEY",
      "CORS_ORIGINS",
      "INTERNAL_API_KEY",
    ];

    const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(", ")}`,
      );
    }

    // Validate secret lengths
    if (process.env.JWT_SECRET!.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters long");
    }
    if (process.env.ADMIN_API_KEY!.length < 32) {
      throw new Error("ADMIN_API_KEY must be at least 32 characters long");
    }
  }

  const shouldRunSqlMigrations =
    process.env.RUN_SQL_MIGRATIONS_ON_BOOT !== "false";
  if (shouldRunSqlMigrations) {
    logger.log("Checking pending SQL migrations...");
    const migrationsRun = await runPendingSqlMigrations(logger);
    logger.log(`SQL migrations ready (${migrationsRun} executed on boot)`);
  }

  await initTelemetry("tash8eel-api");

  // Create app with default logger
  const app = await NestFactory.create(AppModule);

  // Body size limits (support image payloads for vision endpoints)
  app.use(json({ limit: "20mb" }));
  app.use(urlencoded({ extended: true, limit: "20mb" }));

  // Security headers — explicit HSTS (1 year + includeSubDomains; override helmet default of 180 days)
  app.use(
    helmet({
      hsts: {
        maxAge: 31536000, // 1 year in seconds
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  // CORS - Secure configuration
  const corsOrigins = process.env.CORS_ORIGINS?.split(",").map((o) => o.trim());
  app.enableCors({
    origin:
      process.env.NODE_ENV === "production"
        ? corsOrigins || false // Require explicit origins in production
        : corsOrigins || true, // Allow all in development
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-correlation-id",
      "x-admin-api-key",
      "x-api-key",
      "x-page-path",
      "x-page-name",
      "x-page-name-b64",
    ],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // API prefix
  app.setGlobalPrefix("api", {
    exclude: ["health", "ready"],
  });

  // Swagger documentation
  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("Operations Agent API")
      .setDescription(
        `
# Operations Agent API

Multi-tenant conversational commerce agent for Egyptian SMBs.

## Features
- **Arabic-first**: All replies in Egyptian Arabic (ار-EG)
- **Order extraction**: Automatic cart building from conversation
- **Negotiation**: Category-specific negotiation policies
- **Delivery booking**: Integration with courier services
- **Tracking**: Real-time order and delivery tracking
- **Follow-ups**: Automated abandoned cart recovery

## Authentication
- Regular endpoints: Use merchant API key
- Admin endpoints: Require x-admin-api-key header

## Rate Limits
- Inbox endpoint: 100 requests/minute per merchant
- Admin endpoints: 10 requests/minute
      `,
      )
      .setVersion("1.0")
      .addApiKey(
        { type: "apiKey", name: "x-admin-api-key", in: "header" },
        "admin-api-key",
      )
      .addTag("Inbox", "Process incoming customer messages")
      .addTag("Merchants", "Merchant configuration")
      .addTag("Catalog", "Product catalog management")
      .addTag("Conversations", "Conversation history")
      .addTag("Orders", "Order management")
      .addTag("Admin", "Admin operations (requires admin API key)")
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("docs", app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: "none",
        filter: true,
        tagsSorter: "alpha",
        operationsSorter: "alpha",
      },
    });

    logger.log("Swagger docs available at /docs");
  }

  // Health check endpoints
  app.use("/health", (req: any, res: any) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Readiness probe: verify DB (and optionally Redis) are reachable before
  // accepting traffic. Kubernetes / load balancers will mark the pod as
  // NOT READY if this returns non-2xx.
  app.use("/ready", async (req: any, res: any) => {
    try {
      const pool = app.get<Pool>(DATABASE_POOL, { strict: false });
      if (!pool) {
        return res.status(503).json({
          status: "not ready",
          error: "database pool not initialized",
          timestamp: new Date().toISOString(),
        });
      }
      await pool.query("SELECT 1");
      res
        .status(200)
        .json({ status: "ready", timestamp: new Date().toISOString() });
    } catch (err: any) {
      logger.error(`Readiness probe failed: ${err?.message}`);
      res.status(503).json({
        status: "not ready",
        error: "database unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Start server
  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`🚀 Operations Agent running on port ${port}`);
  logger.log(`📚 Environment: ${process.env.NODE_ENV || "development"}`);
  logger.log(`🔗 API base: http://localhost:${port}/api/v1`);

  if (process.env.NODE_ENV !== "production") {
    logger.log(`📖 Swagger: http://localhost:${port}/docs`);
  }

  // Graceful shutdown
  const signals = ["SIGTERM", "SIGINT"];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.log(`Received ${signal}, shutting down gracefully...`);
      await app.close();
      process.exit(0);
    });
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});

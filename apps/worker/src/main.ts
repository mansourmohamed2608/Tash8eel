import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import * as http from "http";
import { WorkerModule } from "./worker.module";
import { createLogger } from "@tash8eel/shared";
import { initTelemetry } from "./shared/telemetry/opentelemetry";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Worker");
  const pinoLogger = createLogger("Worker");

  await initTelemetry("tash8eel-worker");

  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["error", "warn", "log", "debug", "verbose"],
  });

  // Minimal HTTP health endpoint for Docker/k8s liveness probes
  const healthPort = parseInt(process.env.WORKER_HEALTH_PORT || "3002", 10);
  const healthServer = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "worker",
          uptime: process.uptime(),
        }),
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  healthServer.listen(healthPort, () => {
    logger.log(`🏥 Health endpoint listening on :${healthPort}/health`);
  });

  // Graceful shutdown
  const signals = ["SIGTERM", "SIGINT"];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.log(`Received ${signal}, shutting down gracefully...`);
      healthServer.close();
      await app.close();
      process.exit(0);
    });
  });

  pinoLogger.info("Worker started successfully");
  logger.log("🚀 Worker is running");
  logger.log("📦 Outbox poller: Active");
  logger.log("🤖 Agent orchestrator: Active");
  logger.log("📅 Followup scheduler: Active");
  logger.log("📊 Daily report scheduler: Active");
}

bootstrap().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});

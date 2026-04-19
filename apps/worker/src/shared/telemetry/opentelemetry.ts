import { Logger } from "@nestjs/common";

export async function initTelemetry(serviceName: string): Promise<void> {
  if (process.env.OTEL_ENABLED !== "true") {
    return;
  }

  const logger = new Logger("Telemetry");

  try {
    const sdkNode = await import("@opentelemetry/sdk-node");
    const autoInstr = await import("@opentelemetry/auto-instrumentations-node");
    const resources = await import("@opentelemetry/resources");
    const semantic = await import("@opentelemetry/semantic-conventions");
    const traceExporterMod =
      await import("@opentelemetry/exporter-trace-otlp-http");
    const metricExporterMod =
      await import("@opentelemetry/exporter-metrics-otlp-http");
    const metricsMod = await import("@opentelemetry/sdk-metrics");

    const resource = new resources.Resource({
      [semantic.SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [semantic.SemanticResourceAttributes.SERVICE_VERSION]:
        process.env.APP_VERSION || "dev",
    });

    const traceExporter = new traceExporterMod.OTLPTraceExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    });

    const metricExporter = new metricExporterMod.OTLPMetricExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ||
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    });

    const sdk = new sdkNode.NodeSDK({
      resource,
      traceExporter,
      // Type cast needed due to version mismatch between @opentelemetry packages
      metricReader: new metricsMod.PeriodicExportingMetricReader({
        exporter: metricExporter,
      }) as any,
      instrumentations: [autoInstr.getNodeAutoInstrumentations()],
    });

    await sdk.start();
    logger.log("OpenTelemetry started");

    const shutdown = async () => {
      try {
        await sdk.shutdown();
        logger.log("OpenTelemetry shut down");
      } catch (error) {
        logger.warn(
          `OpenTelemetry shutdown failed: ${(error as Error).message}`,
        );
      }
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (error) {
    logger.warn(`OpenTelemetry disabled: ${(error as Error).message}`);
  }
}

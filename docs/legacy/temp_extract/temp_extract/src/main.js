"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const helmet_1 = __importDefault(require("helmet"));
const app_module_1 = require("./app.module");
async function bootstrap() {
    const logger = new common_1.Logger("Bootstrap");
    // Create app with default logger
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    // Security headers
    app.use((0, helmet_1.default)());
    // CORS
    app.enableCors({
        origin: process.env.CORS_ORIGINS?.split(",") || "*",
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "x-correlation-id",
            "x-admin-api-key",
        ],
    });
    // Global validation pipe
    app.useGlobalPipes(new common_1.ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
    }));
    // API prefix
    app.setGlobalPrefix("api", {
        exclude: ["health", "ready"],
    });
    // Swagger documentation
    if (process.env.NODE_ENV !== "production") {
        const config = new swagger_1.DocumentBuilder()
            .setTitle("Operations Agent API")
            .setDescription(`
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
      `)
            .setVersion("1.0")
            .addApiKey({ type: "apiKey", name: "x-admin-api-key", in: "header" }, "admin-api-key")
            .addTag("Inbox", "Process incoming customer messages")
            .addTag("Merchants", "Merchant configuration")
            .addTag("Catalog", "Product catalog management")
            .addTag("Conversations", "Conversation history")
            .addTag("Orders", "Order management")
            .addTag("Admin", "Admin operations (requires admin API key)")
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, config);
        swagger_1.SwaggerModule.setup("docs", app, document, {
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
    app.use("/health", (req, res) => {
        res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
    });
    app.use("/ready", (req, res) => {
        res
            .status(200)
            .json({ status: "ready", timestamp: new Date().toISOString() });
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

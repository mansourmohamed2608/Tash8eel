"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const redlock_1 = __importDefault(require("redlock"));
const logger_1 = require("../../shared/logging/logger");
const logger = (0, logger_1.createLogger)("RedisService");
let RedisService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var RedisService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            RedisService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        configService;
        client = null;
        redlock = null;
        isEnabled = false;
        // In-memory locks for fallback when Redis is disabled
        inMemoryLocks = new Map();
        constructor(configService) {
            this.configService = configService;
        }
        async onModuleInit() {
            const host = this.configService.get("REDIS_HOST");
            const redisEnabled = this.configService.get("REDIS_ENABLED", "false");
            if (!host || redisEnabled === "false") {
                logger.info("Redis disabled or not configured, using fallback locking");
                return;
            }
            try {
                this.client = new ioredis_1.default({
                    host,
                    port: this.configService.get("REDIS_PORT", 6379),
                    password: this.configService.get("REDIS_PASSWORD") || undefined,
                    db: this.configService.get("REDIS_DB", 0),
                    maxRetriesPerRequest: 1,
                    retryStrategy: () => null, // Don't retry - fail fast
                    lazyConnect: true,
                });
                // Suppress connection error events
                this.client.on("error", () => { });
                await this.client.connect();
                await this.client.ping();
                this.redlock = new redlock_1.default([this.client], {
                    driftFactor: 0.01,
                    retryCount: 3,
                    retryDelay: 200,
                    retryJitter: 200,
                });
                this.isEnabled = true;
                logger.info("Redis connected successfully");
            }
            catch (error) {
                logger.warn("Redis connection failed, using fallback locking", { error });
                if (this.client) {
                    this.client.disconnect();
                }
                this.client = null;
                this.redlock = null;
            }
        }
        async onModuleDestroy() {
            if (this.client) {
                await this.client.quit();
            }
        }
        get enabled() {
            return this.isEnabled;
        }
        async acquireLock(resource, ttlMs = 30000) {
            // If Redis is disabled, use in-memory locking (single instance only)
            if (!this.redlock || !this.isEnabled) {
                return this.acquireInMemoryLock(resource, ttlMs);
            }
            try {
                const lock = await this.redlock.acquire([`lock:${resource}`], ttlMs);
                return {
                    release: async () => {
                        try {
                            await lock.release();
                        }
                        catch (error) {
                            logger.warn("Failed to release lock", { resource, error });
                        }
                    },
                };
            }
            catch (error) {
                logger.warn("Failed to acquire lock", { resource, error });
                return null;
            }
        }
        acquireInMemoryLock(resource, ttlMs) {
            const now = Date.now();
            const existing = this.inMemoryLocks.get(resource);
            // Check if existing lock is still valid
            if (existing && existing.expiresAt > now) {
                return null; // Lock is held
            }
            // Acquire the lock
            this.inMemoryLocks.set(resource, { expiresAt: now + ttlMs });
            return {
                release: async () => {
                    this.inMemoryLocks.delete(resource);
                },
            };
        }
        async get(key) {
            if (!this.client || !this.isEnabled)
                return null;
            return this.client.get(key);
        }
        async set(key, value, expirySeconds) {
            if (!this.client || !this.isEnabled)
                return false;
            if (expirySeconds) {
                await this.client.setex(key, expirySeconds, value);
            }
            else {
                await this.client.set(key, value);
            }
            return true;
        }
        async del(key) {
            if (!this.client || !this.isEnabled)
                return false;
            await this.client.del(key);
            return true;
        }
        async incr(key) {
            if (!this.client || !this.isEnabled)
                return 0;
            return this.client.incr(key);
        }
        async expire(key, seconds) {
            if (!this.client || !this.isEnabled)
                return false;
            await this.client.expire(key, seconds);
            return true;
        }
        async releaseLock(lock) {
            if (lock) {
                await lock.release();
            }
        }
    };
    return RedisService = _classThis;
})();
exports.RedisService = RedisService;

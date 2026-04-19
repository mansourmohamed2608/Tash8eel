import { OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
export interface Lock {
    release(): Promise<void>;
}
export declare class RedisService implements OnModuleInit, OnModuleDestroy {
    private configService;
    private client;
    private redlock;
    private isEnabled;
    private readonly inMemoryLocks;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    get enabled(): boolean;
    acquireLock(resource: string, ttlMs?: number): Promise<Lock | null>;
    private acquireInMemoryLock;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, expirySeconds?: number): Promise<boolean>;
    del(key: string): Promise<boolean>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<boolean>;
    releaseLock(lock: {
        release: () => Promise<void>;
    } | null): Promise<void>;
}

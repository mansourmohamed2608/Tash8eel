import { Pool } from "pg";
import { IKnownAreaRepository } from "../../domain/ports/known-area.repository";
import { KnownArea } from "../../domain/entities/known-area.entity";
export declare class KnownAreaRepository implements IKnownAreaRepository {
    private pool;
    constructor(pool: Pool);
    findByCity(city: string): Promise<KnownArea[]>;
    findByAreaName(city: string, areaName: string): Promise<KnownArea | null>;
    searchByAlias(alias: string): Promise<KnownArea[]>;
    findAll(): Promise<KnownArea[]>;
    private mapToEntity;
}

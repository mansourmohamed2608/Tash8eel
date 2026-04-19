import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../database/database.module";
import { IKnownAreaRepository } from "../../domain/ports/known-area.repository";
import { KnownArea } from "../../domain/entities/known-area.entity";

@Injectable()
export class KnownAreaRepository implements IKnownAreaRepository {
  constructor(@Inject(DATABASE_POOL) private pool: Pool) {}

  async findByCity(city: string): Promise<KnownArea[]> {
    const result = await this.pool.query(
      `SELECT * FROM known_areas WHERE city = $1 ORDER BY area_name_ar`,
      [city],
    );
    return result.rows.map((row: Record<string, unknown>) =>
      this.mapToEntity(row),
    );
  }

  async findByAreaName(
    city: string,
    areaName: string,
  ): Promise<KnownArea | null> {
    const result = await this.pool.query(
      `SELECT * FROM known_areas WHERE city = $1 AND area_name_ar = $2`,
      [city, areaName],
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async searchByAlias(alias: string): Promise<KnownArea[]> {
    const result = await this.pool.query(
      `SELECT * FROM known_areas 
       WHERE area_name_ar ILIKE $1 
          OR area_name_en ILIKE $1 
          OR $1 = ANY(area_aliases)
          OR EXISTS (SELECT 1 FROM unnest(area_aliases) a WHERE a ILIKE $1)`,
      [`%${alias}%`],
    );
    return result.rows.map((row: Record<string, unknown>) =>
      this.mapToEntity(row),
    );
  }

  async findAll(): Promise<KnownArea[]> {
    const result = await this.pool.query(
      `SELECT * FROM known_areas ORDER BY city, area_name_ar`,
    );
    return result.rows.map((row: Record<string, unknown>) =>
      this.mapToEntity(row),
    );
  }

  private mapToEntity(row: Record<string, unknown>): KnownArea {
    return {
      id: row.id as string,
      city: row.city as string,
      areaNameAr: row.area_name_ar as string,
      areaNameEn: row.area_name_en as string | undefined,
      areaAliases: row.area_aliases as string[],
      deliveryZone: row.delivery_zone as string | undefined,
      createdAt: new Date(row.created_at as string),
    };
  }
}

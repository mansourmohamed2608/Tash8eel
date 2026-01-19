import { KnownArea } from '../entities/known-area.entity';

export interface IKnownAreaRepository {
  findByCity(city: string): Promise<KnownArea[]>;
  findByAreaName(city: string, areaName: string): Promise<KnownArea | null>;
  searchByAlias(alias: string): Promise<KnownArea[]>;
  findAll(): Promise<KnownArea[]>;
}

export const KNOWN_AREA_REPOSITORY = Symbol('IKnownAreaRepository');

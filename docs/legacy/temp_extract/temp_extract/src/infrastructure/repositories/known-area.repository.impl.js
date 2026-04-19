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
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnownAreaRepository = void 0;
const common_1 = require("@nestjs/common");
let KnownAreaRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var KnownAreaRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            KnownAreaRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        constructor(pool) {
            this.pool = pool;
        }
        async findByCity(city) {
            const result = await this.pool.query(`SELECT * FROM known_areas WHERE city = $1 ORDER BY area_name_ar`, [city]);
            return result.rows.map((row) => this.mapToEntity(row));
        }
        async findByAreaName(city, areaName) {
            const result = await this.pool.query(`SELECT * FROM known_areas WHERE city = $1 AND area_name_ar = $2`, [city, areaName]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async searchByAlias(alias) {
            const result = await this.pool.query(`SELECT * FROM known_areas 
       WHERE area_name_ar ILIKE $1 
          OR area_name_en ILIKE $1 
          OR $1 = ANY(area_aliases)
          OR EXISTS (SELECT 1 FROM unnest(area_aliases) a WHERE a ILIKE $1)`, [`%${alias}%`]);
            return result.rows.map((row) => this.mapToEntity(row));
        }
        async findAll() {
            const result = await this.pool.query(`SELECT * FROM known_areas ORDER BY city, area_name_ar`);
            return result.rows.map((row) => this.mapToEntity(row));
        }
        mapToEntity(row) {
            return {
                id: row.id,
                city: row.city,
                areaNameAr: row.area_name_ar,
                areaNameEn: row.area_name_en,
                areaAliases: row.area_aliases,
                deliveryZone: row.delivery_zone,
                createdAt: new Date(row.created_at),
            };
        }
    };
    return KnownAreaRepository = _classThis;
})();
exports.KnownAreaRepository = KnownAreaRepository;

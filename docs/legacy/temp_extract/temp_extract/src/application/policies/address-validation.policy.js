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
exports.AddressValidationPolicyFactory = exports.DefaultAddressValidator = exports.AlexandriaAddressValidator = exports.GizaAddressValidator = exports.CairoAddressValidator = void 0;
const common_1 = require("@nestjs/common");
const templates_1 = require("../../shared/constants/templates");
class BaseAddressValidator {
    validate(extracted, knownAreas) {
        const address = {
            city: extracted.city || this.city,
            area: undefined,
            street: extracted.street,
            building: extracted.building,
            floor: extracted.floor,
            apartment: extracted.apartment,
            landmark: extracted.landmark,
            raw_text: extracted.raw_text,
            confidence: 0,
            missing_fields: [],
        };
        // Normalize area
        if (extracted.area) {
            const normalization = this.normalizeArea(extracted.area, knownAreas);
            if (normalization) {
                address.area = normalization.normalized;
                address.confidence = normalization.confidence;
            }
            else {
                address.area = extracted.area;
                address.confidence = 0.5;
            }
        }
        // Check missing fields
        const missingFields = [];
        if (!address.city)
            missingFields.push("city");
        if (!address.area)
            missingFields.push("area");
        if (!address.street)
            missingFields.push("street");
        if (!address.building)
            missingFields.push("building");
        address.missing_fields = missingFields;
        // Calculate overall confidence
        const filledFields = 4 - missingFields.length;
        address.confidence = Math.max(address.confidence, filledFields / 4);
        // Generate clarifying question for first missing field
        let clarifyingQuestion;
        if (missingFields.length > 0) {
            const firstMissing = missingFields[0];
            clarifyingQuestion = this.getQuestionForField(firstMissing);
        }
        return {
            address,
            missingFields,
            confidence: address.confidence,
            clarifyingQuestion,
            normalizedArea: address.area,
            isComplete: missingFields.length === 0,
        };
    }
    normalizeArea(areaName, knownAreas) {
        const normalized = areaName.trim();
        // Direct match
        const directMatch = knownAreas.find((ka) => ka.areaNameAr === normalized ||
            ka.areaNameEn?.toLowerCase() === normalized.toLowerCase());
        if (directMatch) {
            return { normalized: directMatch.areaNameAr, confidence: 1.0 };
        }
        // Alias match
        const aliasMatch = knownAreas.find((ka) => ka.areaAliases.some((alias) => alias.toLowerCase() === normalized.toLowerCase() ||
            normalized.includes(alias)));
        if (aliasMatch) {
            return { normalized: aliasMatch.areaNameAr, confidence: 0.9 };
        }
        // Partial match
        const partialMatch = knownAreas.find((ka) => normalized.includes(ka.areaNameAr) ||
            ka.areaNameAr.includes(normalized));
        if (partialMatch) {
            return { normalized: partialMatch.areaNameAr, confidence: 0.7 };
        }
        return null;
    }
    isKnownAreaName(text, knownAreas) {
        const trimmed = text.trim();
        return knownAreas.some((ka) => ka.areaNameAr === trimmed ||
            ka.areaNameEn?.toLowerCase() === trimmed.toLowerCase() ||
            ka.areaAliases.some((alias) => alias.toLowerCase() === trimmed.toLowerCase()));
    }
    getQuestionForField(field) {
        const questions = {
            city: templates_1.ARABIC_TEMPLATES.ASK_ADDRESS_CITY,
            area: templates_1.ARABIC_TEMPLATES.ASK_ADDRESS_AREA,
            street: templates_1.ARABIC_TEMPLATES.ASK_ADDRESS_STREET,
            building: templates_1.ARABIC_TEMPLATES.ASK_ADDRESS_BUILDING,
            floor: templates_1.ARABIC_TEMPLATES.ASK_ADDRESS_FLOOR,
            landmark: templates_1.ARABIC_TEMPLATES.ASK_ADDRESS_LANDMARK,
        };
        return questions[field] || templates_1.ARABIC_TEMPLATES.ASK_ADDRESS_AREA;
    }
}
let CairoAddressValidator = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseAddressValidator;
    var CairoAddressValidator = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            CairoAddressValidator = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        city = "القاهرة";
    };
    return CairoAddressValidator = _classThis;
})();
exports.CairoAddressValidator = CairoAddressValidator;
let GizaAddressValidator = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseAddressValidator;
    var GizaAddressValidator = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            GizaAddressValidator = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        city = "الجيزة";
    };
    return GizaAddressValidator = _classThis;
})();
exports.GizaAddressValidator = GizaAddressValidator;
let AlexandriaAddressValidator = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseAddressValidator;
    var AlexandriaAddressValidator = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            AlexandriaAddressValidator = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        city = "الإسكندرية";
    };
    return AlexandriaAddressValidator = _classThis;
})();
exports.AlexandriaAddressValidator = AlexandriaAddressValidator;
let DefaultAddressValidator = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseAddressValidator;
    var DefaultAddressValidator = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            DefaultAddressValidator = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        city = "";
    };
    return DefaultAddressValidator = _classThis;
})();
exports.DefaultAddressValidator = DefaultAddressValidator;
// Factory service
let AddressValidationPolicyFactory = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var AddressValidationPolicyFactory = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            AddressValidationPolicyFactory = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        validators;
        defaultValidator;
        constructor(cairoValidator, gizaValidator, alexandriaValidator, defaultValidator) {
            this.validators = new Map();
            this.validators.set("القاهرة", cairoValidator);
            this.validators.set("الجيزة", gizaValidator);
            this.validators.set("الإسكندرية", alexandriaValidator);
            this.validators.set("cairo", cairoValidator);
            this.validators.set("giza", gizaValidator);
            this.validators.set("alexandria", alexandriaValidator);
            this.defaultValidator = defaultValidator;
        }
        getValidator(city) {
            if (!city)
                return this.defaultValidator;
            return (this.validators.get(city.toLowerCase()) ||
                this.validators.get(city) ||
                this.defaultValidator);
        }
    };
    return AddressValidationPolicyFactory = _classThis;
})();
exports.AddressValidationPolicyFactory = AddressValidationPolicyFactory;

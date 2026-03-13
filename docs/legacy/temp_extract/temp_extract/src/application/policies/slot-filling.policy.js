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
exports.SlotFillingPolicyFactory = exports.GenericSlotFillingPolicy = exports.SupermarketSlotFillingPolicy = exports.FoodSlotFillingPolicy = exports.ClothesSlotFillingPolicy = void 0;
const common_1 = require("@nestjs/common");
const enums_1 = require("../../shared/constants/enums");
const templates_1 = require("../../shared/constants/templates");
class BaseSlotFillingPolicy {
    evaluate(cart, collectedInfo, catalogItems) {
        const missingSlots = [];
        const priority = this.getSlotPriority();
        // Check product/items
        if (cart.items.length === 0) {
            missingSlots.push("product");
        }
        else {
            // Check item-level requirements
            for (const item of cart.items) {
                if (!item.quantity || item.quantity <= 0) {
                    missingSlots.push("quantity");
                    break;
                }
            }
        }
        // Check category-specific slots
        this.checkCategorySpecificSlots(cart, collectedInfo, missingSlots);
        // Check customer info
        if (!collectedInfo.customerName) {
            missingSlots.push("customer_name");
        }
        if (!collectedInfo.phone) {
            missingSlots.push("phone");
        }
        // Check address
        this.checkAddressSlots(collectedInfo, missingSlots);
        // Find the highest priority missing slot
        let nextQuestion = templates_1.ARABIC_TEMPLATES.FALLBACK;
        let highestPrioritySlot = "";
        for (const slot of priority) {
            if (missingSlots.includes(slot)) {
                highestPrioritySlot = slot;
                nextQuestion = templates_1.SLOT_QUESTIONS[slot] || templates_1.ARABIC_TEMPLATES.FALLBACK;
                break;
            }
        }
        return {
            missingSlots,
            nextQuestion,
            isComplete: missingSlots.length === 0,
            priority: highestPrioritySlot,
        };
    }
    checkCategorySpecificSlots(_cart, _collectedInfo, _missingSlots) {
        // Override in subclasses
    }
    checkAddressSlots(collectedInfo, missingSlots) {
        const address = collectedInfo.address;
        if (!address) {
            missingSlots.push("address_city");
            return;
        }
        if (!address.city) {
            missingSlots.push("address_city");
        }
        else if (!address.area) {
            missingSlots.push("address_area");
        }
        else if (!address.street) {
            missingSlots.push("address_street");
        }
        else if (!address.building) {
            missingSlots.push("address_building");
        }
    }
}
let ClothesSlotFillingPolicy = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseSlotFillingPolicy;
    var ClothesSlotFillingPolicy = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ClothesSlotFillingPolicy = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        category = enums_1.MerchantCategory.CLOTHES;
        getRequiredSlots() {
            return [
                "product",
                "quantity",
                "size",
                "color",
                "customer_name",
                "phone",
                "address_city",
                "address_area",
                "address_street",
                "address_building",
            ];
        }
        getSlotPriority() {
            return [
                "product",
                "quantity",
                "size",
                "color",
                "customer_name",
                "phone",
                "address_city",
                "address_area",
                "address_street",
                "address_building",
            ];
        }
        checkCategorySpecificSlots(cart, _collectedInfo, missingSlots) {
            // For clothes, check if size/color are needed
            for (const item of cart.items) {
                if (!item.variant?.size) {
                    missingSlots.push("size");
                    break;
                }
                if (!item.variant?.color) {
                    missingSlots.push("color");
                    break;
                }
            }
        }
    };
    return ClothesSlotFillingPolicy = _classThis;
})();
exports.ClothesSlotFillingPolicy = ClothesSlotFillingPolicy;
let FoodSlotFillingPolicy = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseSlotFillingPolicy;
    var FoodSlotFillingPolicy = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            FoodSlotFillingPolicy = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        category = enums_1.MerchantCategory.FOOD;
        getRequiredSlots() {
            return [
                "product",
                "quantity",
                "options",
                "customer_name",
                "phone",
                "address_city",
                "address_area",
                "address_street",
            ];
        }
        getSlotPriority() {
            return [
                "product",
                "quantity",
                "options",
                "customer_name",
                "phone",
                "address_city",
                "address_area",
                "address_street",
                "address_building",
            ];
        }
        checkCategorySpecificSlots(_cart, _collectedInfo, _missingSlots) {
            // Food: Options are optional by default
        }
    };
    return FoodSlotFillingPolicy = _classThis;
})();
exports.FoodSlotFillingPolicy = FoodSlotFillingPolicy;
let SupermarketSlotFillingPolicy = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseSlotFillingPolicy;
    var SupermarketSlotFillingPolicy = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            SupermarketSlotFillingPolicy = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        category = enums_1.MerchantCategory.SUPERMARKET;
        getRequiredSlots() {
            return [
                "product",
                "quantity",
                "substitution_preference",
                "customer_name",
                "phone",
                "address_city",
                "address_area",
                "address_street",
                "address_building",
            ];
        }
        getSlotPriority() {
            return [
                "product",
                "quantity",
                "customer_name",
                "phone",
                "substitution_preference",
                "address_city",
                "address_area",
                "address_street",
                "address_building",
            ];
        }
        checkCategorySpecificSlots(_cart, collectedInfo, missingSlots) {
            // Supermarket: Check substitution preference
            if (collectedInfo.substitutionAllowed === undefined) {
                missingSlots.push("substitution_preference");
            }
        }
    };
    return SupermarketSlotFillingPolicy = _classThis;
})();
exports.SupermarketSlotFillingPolicy = SupermarketSlotFillingPolicy;
let GenericSlotFillingPolicy = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseSlotFillingPolicy;
    var GenericSlotFillingPolicy = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            GenericSlotFillingPolicy = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        category = enums_1.MerchantCategory.GENERIC;
        getRequiredSlots() {
            return [
                "product",
                "quantity",
                "customer_name",
                "phone",
                "address_city",
                "address_area",
            ];
        }
        getSlotPriority() {
            return [
                "product",
                "quantity",
                "customer_name",
                "phone",
                "address_city",
                "address_area",
                "address_street",
                "address_building",
            ];
        }
    };
    return GenericSlotFillingPolicy = _classThis;
})();
exports.GenericSlotFillingPolicy = GenericSlotFillingPolicy;
// Factory service
let SlotFillingPolicyFactory = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var SlotFillingPolicyFactory = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            SlotFillingPolicyFactory = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        policies;
        constructor(clothesPolicy, foodPolicy, supermarketPolicy, genericPolicy) {
            this.policies = new Map();
            this.policies.set(enums_1.MerchantCategory.CLOTHES, clothesPolicy);
            this.policies.set(enums_1.MerchantCategory.FOOD, foodPolicy);
            this.policies.set(enums_1.MerchantCategory.SUPERMARKET, supermarketPolicy);
            this.policies.set(enums_1.MerchantCategory.GENERIC, genericPolicy);
        }
        getPolicy(category) {
            return (this.policies.get(category) ||
                this.policies.get(enums_1.MerchantCategory.GENERIC));
        }
    };
    return SlotFillingPolicyFactory = _classThis;
})();
exports.SlotFillingPolicyFactory = SlotFillingPolicyFactory;

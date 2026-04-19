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
exports.NegotiationPolicyFactory = exports.GenericNegotiationPolicy = exports.SupermarketNegotiationPolicy = exports.FoodNegotiationPolicy = exports.ClothesNegotiationPolicy = void 0;
const common_1 = require("@nestjs/common");
const enums_1 = require("../../shared/constants/enums");
class BaseNegotiationPolicy {
    evaluate(request, rules, cart, catalogItem) {
        // Check if negotiation is allowed
        if (!rules.allowNegotiation) {
            return {
                approved: false,
                finalDiscount: 0,
                offerText: "للأسف مش بنعمل خصومات على المنتجات دي",
                reason: "Negotiation disabled",
            };
        }
        const requestedDiscount = request.requestedDiscount || 0;
        const maxDiscount = rules.maxDiscountPercent || 10;
        // Check if requested discount exceeds max
        if (requestedDiscount > maxDiscount) {
            return {
                approved: false,
                finalDiscount: maxDiscount,
                offerText: `للأسف مقدرش أعمل خصم ${requestedDiscount}%، لكن ممكن أعملك ${maxDiscount}%`,
                reason: "Exceeds max discount",
            };
        }
        // Check min margin if catalog item available
        if (catalogItem && catalogItem.minPrice) {
            const minMargin = rules.minMarginPercent || 20;
            const priceAfterDiscount = catalogItem.basePrice * (1 - requestedDiscount / 100);
            if (priceAfterDiscount < catalogItem.minPrice) {
                const maxPossibleDiscount = ((catalogItem.basePrice - catalogItem.minPrice) /
                    catalogItem.basePrice) *
                    100;
                const safeDiscount = Math.floor(maxPossibleDiscount);
                return {
                    approved: false,
                    finalDiscount: safeDiscount,
                    finalPrice: catalogItem.basePrice * (1 - safeDiscount / 100),
                    offerText: `أقصى خصم أقدر أعمله على المنتج ده ${safeDiscount}%`,
                    reason: "Would violate min margin",
                };
            }
        }
        // Approved
        return {
            approved: true,
            finalDiscount: requestedDiscount,
            finalPrice: catalogItem
                ? catalogItem.basePrice * (1 - requestedDiscount / 100)
                : undefined,
            offerText: `تمام! عملتلك خصم ${requestedDiscount}%! 🎉`,
        };
    }
    calculateBundleDiscount(rules, cart) {
        if (!rules.bundleDiscounts || rules.bundleDiscounts.length === 0) {
            return 0;
        }
        const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
        // Sort bundles by minItems descending to find best applicable discount
        const sortedBundles = [...rules.bundleDiscounts].sort((a, b) => b.minItems - a.minItems);
        for (const bundle of sortedBundles) {
            if (totalItems >= bundle.minItems) {
                return bundle.discountPercent;
            }
        }
        return 0;
    }
    checkFreeDelivery(rules, cartTotal) {
        const threshold = rules.freeDeliveryThreshold;
        if (!threshold) {
            return { eligible: false };
        }
        if (cartTotal >= threshold) {
            return { eligible: true };
        }
        return {
            eligible: false,
            amountNeeded: threshold - cartTotal,
        };
    }
}
let ClothesNegotiationPolicy = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseNegotiationPolicy;
    var ClothesNegotiationPolicy = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ClothesNegotiationPolicy = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        category = enums_1.MerchantCategory.CLOTHES;
        evaluate(request, rules, cart, catalogItem) {
            // Clothes: More flexible with bundles
            const result = super.evaluate(request, rules, cart, catalogItem);
            if (!result.approved && cart.items.length >= 3) {
                // Offer bundle discount for 3+ items
                const bundleDiscount = Math.min(rules.maxDiscountPercent || 10, 15);
                return {
                    approved: true,
                    finalDiscount: bundleDiscount,
                    offerText: `بما إنك بتاخد ${cart.items.length} حاجات، هعملك خصم ${bundleDiscount}%! 🎁`,
                };
            }
            return result;
        }
    };
    return ClothesNegotiationPolicy = _classThis;
})();
exports.ClothesNegotiationPolicy = ClothesNegotiationPolicy;
let FoodNegotiationPolicy = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseNegotiationPolicy;
    var FoodNegotiationPolicy = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            FoodNegotiationPolicy = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        category = enums_1.MerchantCategory.FOOD;
        evaluate(request, rules, cart, catalogItem) {
            // Food: Less negotiation flexibility, focus on combos
            const maxDiscount = Math.min(rules.maxDiscountPercent || 5, 10); // Cap at 10% for food
            if ((request.requestedDiscount || 0) > maxDiscount) {
                return {
                    approved: false,
                    finalDiscount: 0,
                    offerText: "للأسف مفيش خصومات على الأكل، لكن ممكن تشوف العروض والكومبوهات! 🍕",
                    reason: "Food discount limited",
                };
            }
            return super.evaluate(request, { ...rules, maxDiscountPercent: maxDiscount }, cart, catalogItem);
        }
    };
    return FoodNegotiationPolicy = _classThis;
})();
exports.FoodNegotiationPolicy = FoodNegotiationPolicy;
let SupermarketNegotiationPolicy = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseNegotiationPolicy;
    var SupermarketNegotiationPolicy = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            SupermarketNegotiationPolicy = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        category = enums_1.MerchantCategory.SUPERMARKET;
        evaluate(request, rules, cart, catalogItem) {
            // Supermarket: Minimal negotiation, bulk discounts
            const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
            if (totalItems >= 10) {
                return {
                    approved: true,
                    finalDiscount: 5,
                    offerText: "بما إن الطلب كبير، هعملك خصم 5%! 🛒",
                };
            }
            if ((request.requestedDiscount || 0) > 0) {
                return {
                    approved: false,
                    finalDiscount: 0,
                    offerText: "أسعارنا ثابتة، لكن التوصيل مجاني للطلبات الكبيرة!",
                    reason: "Supermarket fixed prices",
                };
            }
            return { approved: true, finalDiscount: 0, offerText: "" };
        }
    };
    return SupermarketNegotiationPolicy = _classThis;
})();
exports.SupermarketNegotiationPolicy = SupermarketNegotiationPolicy;
let GenericNegotiationPolicy = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseNegotiationPolicy;
    var GenericNegotiationPolicy = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            GenericNegotiationPolicy = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        category = enums_1.MerchantCategory.GENERIC;
    };
    return GenericNegotiationPolicy = _classThis;
})();
exports.GenericNegotiationPolicy = GenericNegotiationPolicy;
// Factory service
let NegotiationPolicyFactory = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var NegotiationPolicyFactory = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            NegotiationPolicyFactory = _classThis = _classDescriptor.value;
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
        // Static factory method for standalone use
        static create(category) {
            switch (category) {
                case enums_1.MerchantCategory.CLOTHES:
                    return new ClothesNegotiationPolicy();
                case enums_1.MerchantCategory.FOOD:
                    return new FoodNegotiationPolicy();
                case enums_1.MerchantCategory.SUPERMARKET:
                    return new SupermarketNegotiationPolicy();
                default:
                    return new GenericNegotiationPolicy();
            }
        }
    };
    return NegotiationPolicyFactory = _classThis;
})();
exports.NegotiationPolicyFactory = NegotiationPolicyFactory;

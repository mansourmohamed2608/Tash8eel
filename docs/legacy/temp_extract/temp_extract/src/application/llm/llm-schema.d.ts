import { z } from "zod";
import { ActionType } from "../../shared/constants/enums";
export declare const LLM_RESPONSE_JSON_SCHEMA: {
    name: string;
    strict: boolean;
    schema: {
        type: string;
        properties: {
            actionType: {
                type: string;
                enum: string[];
                description: string;
            };
            reply_ar: {
                type: string;
                description: string;
            };
            extracted_entities: {
                type: string[];
                properties: {
                    products: {
                        type: string[];
                        items: {
                            type: string;
                            properties: {
                                name: {
                                    type: string;
                                };
                                quantity: {
                                    type: string[];
                                };
                                size: {
                                    type: string[];
                                };
                                color: {
                                    type: string[];
                                };
                                options: {
                                    type: string[];
                                    items: {
                                        type: string;
                                    };
                                };
                                notes: {
                                    type: string[];
                                };
                            };
                            required: string[];
                            additionalProperties: boolean;
                        };
                    };
                    customerName: {
                        type: string[];
                    };
                    phone: {
                        type: string[];
                    };
                    address: {
                        type: string[];
                        properties: {
                            city: {
                                type: string[];
                            };
                            area: {
                                type: string[];
                            };
                            street: {
                                type: string[];
                            };
                            building: {
                                type: string[];
                            };
                            floor: {
                                type: string[];
                            };
                            apartment: {
                                type: string[];
                            };
                            landmark: {
                                type: string[];
                            };
                            raw_text: {
                                type: string[];
                            };
                        };
                        required: string[];
                        additionalProperties: boolean;
                    };
                    substitutionAllowed: {
                        type: string[];
                    };
                    deliveryPreference: {
                        type: string[];
                    };
                };
                required: string[];
                additionalProperties: boolean;
            };
            missing_slots: {
                type: string[];
                items: {
                    type: string;
                };
                description: string;
            };
            negotiation: {
                type: string[];
                properties: {
                    requestedDiscount: {
                        type: string[];
                        description: string;
                    };
                    approved: {
                        type: string;
                    };
                    offerText: {
                        type: string[];
                    };
                    finalPrices: {
                        type: string[];
                        items: {
                            type: string;
                            properties: {
                                productName: {
                                    type: string;
                                };
                                originalPrice: {
                                    type: string;
                                };
                                finalPrice: {
                                    type: string;
                                };
                            };
                            required: string[];
                            additionalProperties: boolean;
                        };
                    };
                };
                required: string[];
                additionalProperties: boolean;
            };
            delivery_fee: {
                type: string[];
                description: string;
            };
            confidence: {
                type: string;
                minimum: number;
                maximum: number;
                description: string;
            };
            reasoning: {
                type: string[];
                description: string;
            };
        };
        required: string[];
        additionalProperties: boolean;
    };
};
export declare const LlmResponseValidationSchema: z.ZodObject<{
    actionType: z.ZodNativeEnum<typeof ActionType>;
    reply_ar: z.ZodString;
    extracted_entities: z.ZodNullable<z.ZodObject<{
        products: z.ZodNullable<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            quantity: z.ZodNullable<z.ZodNumber>;
            size: z.ZodNullable<z.ZodString>;
            color: z.ZodNullable<z.ZodString>;
            options: z.ZodNullable<z.ZodArray<z.ZodString, "many">>;
            notes: z.ZodNullable<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            size: string | null;
            color: string | null;
            quantity: number | null;
            name: string;
            options: string[] | null;
            notes: string | null;
        }, {
            size: string | null;
            color: string | null;
            quantity: number | null;
            name: string;
            options: string[] | null;
            notes: string | null;
        }>, "many">>;
        customerName: z.ZodNullable<z.ZodString>;
        phone: z.ZodNullable<z.ZodString>;
        address: z.ZodNullable<z.ZodObject<{
            city: z.ZodNullable<z.ZodString>;
            area: z.ZodNullable<z.ZodString>;
            street: z.ZodNullable<z.ZodString>;
            building: z.ZodNullable<z.ZodString>;
            floor: z.ZodNullable<z.ZodString>;
            apartment: z.ZodNullable<z.ZodString>;
            landmark: z.ZodNullable<z.ZodString>;
            raw_text: z.ZodNullable<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            city: string | null;
            area: string | null;
            street: string | null;
            building: string | null;
            landmark: string | null;
            floor: string | null;
            apartment: string | null;
            raw_text: string | null;
        }, {
            city: string | null;
            area: string | null;
            street: string | null;
            building: string | null;
            landmark: string | null;
            floor: string | null;
            apartment: string | null;
            raw_text: string | null;
        }>>;
        substitutionAllowed: z.ZodNullable<z.ZodBoolean>;
        deliveryPreference: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        customerName: string | null;
        phone: string | null;
        address: {
            city: string | null;
            area: string | null;
            street: string | null;
            building: string | null;
            landmark: string | null;
            floor: string | null;
            apartment: string | null;
            raw_text: string | null;
        } | null;
        products: {
            size: string | null;
            color: string | null;
            quantity: number | null;
            name: string;
            options: string[] | null;
            notes: string | null;
        }[] | null;
        substitutionAllowed: boolean | null;
        deliveryPreference: string | null;
    }, {
        customerName: string | null;
        phone: string | null;
        address: {
            city: string | null;
            area: string | null;
            street: string | null;
            building: string | null;
            landmark: string | null;
            floor: string | null;
            apartment: string | null;
            raw_text: string | null;
        } | null;
        products: {
            size: string | null;
            color: string | null;
            quantity: number | null;
            name: string;
            options: string[] | null;
            notes: string | null;
        }[] | null;
        substitutionAllowed: boolean | null;
        deliveryPreference: string | null;
    }>>;
    missing_slots: z.ZodNullable<z.ZodArray<z.ZodString, "many">>;
    negotiation: z.ZodNullable<z.ZodObject<{
        requestedDiscount: z.ZodNullable<z.ZodNumber>;
        approved: z.ZodBoolean;
        offerText: z.ZodNullable<z.ZodString>;
        finalPrices: z.ZodNullable<z.ZodArray<z.ZodObject<{
            productName: z.ZodString;
            originalPrice: z.ZodNumber;
            finalPrice: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            originalPrice: number;
            productName: string;
            finalPrice: number;
        }, {
            originalPrice: number;
            productName: string;
            finalPrice: number;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        approved: boolean;
        requestedDiscount: number | null;
        offerText: string | null;
        finalPrices: {
            originalPrice: number;
            productName: string;
            finalPrice: number;
        }[] | null;
    }, {
        approved: boolean;
        requestedDiscount: number | null;
        offerText: string | null;
        finalPrices: {
            originalPrice: number;
            productName: string;
            finalPrice: number;
        }[] | null;
    }>>;
    delivery_fee: z.ZodNullable<z.ZodNumber>;
    confidence: z.ZodNumber;
    reasoning: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    confidence: number;
    actionType: ActionType;
    reply_ar: string;
    extracted_entities: {
        customerName: string | null;
        phone: string | null;
        address: {
            city: string | null;
            area: string | null;
            street: string | null;
            building: string | null;
            landmark: string | null;
            floor: string | null;
            apartment: string | null;
            raw_text: string | null;
        } | null;
        products: {
            size: string | null;
            color: string | null;
            quantity: number | null;
            name: string;
            options: string[] | null;
            notes: string | null;
        }[] | null;
        substitutionAllowed: boolean | null;
        deliveryPreference: string | null;
    } | null;
    missing_slots: string[] | null;
    negotiation: {
        approved: boolean;
        requestedDiscount: number | null;
        offerText: string | null;
        finalPrices: {
            originalPrice: number;
            productName: string;
            finalPrice: number;
        }[] | null;
    } | null;
    reasoning: string | null;
    delivery_fee: number | null;
}, {
    confidence: number;
    actionType: ActionType;
    reply_ar: string;
    extracted_entities: {
        customerName: string | null;
        phone: string | null;
        address: {
            city: string | null;
            area: string | null;
            street: string | null;
            building: string | null;
            landmark: string | null;
            floor: string | null;
            apartment: string | null;
            raw_text: string | null;
        } | null;
        products: {
            size: string | null;
            color: string | null;
            quantity: number | null;
            name: string;
            options: string[] | null;
            notes: string | null;
        }[] | null;
        substitutionAllowed: boolean | null;
        deliveryPreference: string | null;
    } | null;
    missing_slots: string[] | null;
    negotiation: {
        approved: boolean;
        requestedDiscount: number | null;
        offerText: string | null;
        finalPrices: {
            originalPrice: number;
            productName: string;
            finalPrice: number;
        }[] | null;
    } | null;
    reasoning: string | null;
    delivery_fee: number | null;
}>;
export type ValidatedLlmResponse = z.infer<typeof LlmResponseValidationSchema>;

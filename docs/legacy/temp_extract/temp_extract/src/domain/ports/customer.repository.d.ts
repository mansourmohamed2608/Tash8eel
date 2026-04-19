import { Customer, CreateCustomerInput, UpdateCustomerInput } from "../entities/customer.entity";
export interface ICustomerRepository {
    findById(id: string): Promise<Customer | null>;
    findByMerchantAndSender(merchantId: string, senderId: string): Promise<Customer | null>;
    findByPhone(merchantId: string, phone: string): Promise<Customer | null>;
    create(input: CreateCustomerInput): Promise<Customer>;
    update(id: string, input: UpdateCustomerInput): Promise<Customer | null>;
}
export declare const CUSTOMER_REPOSITORY: unique symbol;

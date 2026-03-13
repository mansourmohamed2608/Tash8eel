import { Pool } from "pg";
import { ICustomerRepository } from "../../domain/ports/customer.repository";
import { Customer, CreateCustomerInput, UpdateCustomerInput } from "../../domain/entities/customer.entity";
export declare class CustomerRepository implements ICustomerRepository {
    private pool;
    constructor(pool: Pool);
    findById(id: string): Promise<Customer | null>;
    findByMerchantAndSender(merchantId: string, senderId: string): Promise<Customer | null>;
    findByPhone(merchantId: string, phone: string): Promise<Customer | null>;
    create(input: CreateCustomerInput): Promise<Customer>;
    update(id: string, input: UpdateCustomerInput): Promise<Customer | null>;
    private mapToEntity;
}

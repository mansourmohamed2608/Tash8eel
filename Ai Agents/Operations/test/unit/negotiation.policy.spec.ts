import { NegotiationPolicyFactory } from '../../src/application/policies/negotiation.policy';
import { MerchantCategory } from '../../src/shared/constants/enums';

describe('NegotiationPolicyFactory', () => {
  describe('ClotheNegotiationPolicy', () => {
    const policy = NegotiationPolicyFactory.create(MerchantCategory.CLOTHES);

    it('should allow negotiation', () => {
      expect(policy.canNegotiate()).toBe(true);
    });

    it('should have max discount of 15%', () => {
      expect(policy.getMaxDiscountPercent()).toBe(15);
    });

    it('should allow discount on bulk quantity (3+)', () => {
      const result = policy.evaluateOffer(400, 350, 3);
      expect(result.isAcceptable).toBe(true);
    });

    it('should reject excessive discount request', () => {
      const result = policy.evaluateOffer(1000, 500, 1);
      expect(result.isAcceptable).toBe(false);
      expect(result.counterOffer).toBeGreaterThan(500);
    });

    it('should generate counter offer in Arabic', () => {
      const result = policy.evaluateOffer(500, 300, 1);
      expect(result.message).toBeTruthy();
      expect(result.counterOffer).toBeGreaterThan(300);
    });

    it('should accept reasonable discount', () => {
      const result = policy.evaluateOffer(200, 180, 1);
      expect(result.isAcceptable).toBe(true);
    });
  });

  describe('FoodNegotiationPolicy', () => {
    const policy = NegotiationPolicyFactory.create(MerchantCategory.FOOD);

    it('should not allow negotiation', () => {
      expect(policy.canNegotiate()).toBe(false);
    });

    it('should have max discount of 0%', () => {
      expect(policy.getMaxDiscountPercent()).toBe(0);
    });

    it('should reject any negotiation attempt', () => {
      const result = policy.evaluateOffer(100, 90, 1);
      expect(result.isAcceptable).toBe(false);
    });
  });

  describe('SupermarketNegotiationPolicy', () => {
    const policy = NegotiationPolicyFactory.create(MerchantCategory.SUPERMARKET);

    it('should allow negotiation', () => {
      expect(policy.canNegotiate()).toBe(true);
    });

    it('should have max discount of 5%', () => {
      expect(policy.getMaxDiscountPercent()).toBe(5);
    });

    it('should reject high discount request', () => {
      const result = policy.evaluateOffer(100, 80, 1);
      expect(result.isAcceptable).toBe(false);
    });

    it('should accept discount within 5%', () => {
      const result = policy.evaluateOffer(100, 96, 1);
      expect(result.isAcceptable).toBe(true);
    });
  });

  describe('GenericNegotiationPolicy', () => {
    const policy = NegotiationPolicyFactory.create(MerchantCategory.GENERIC);

    it('should allow negotiation', () => {
      expect(policy.canNegotiate()).toBe(true);
    });

    it('should have max discount of 10%', () => {
      expect(policy.getMaxDiscountPercent()).toBe(10);
    });
  });
});

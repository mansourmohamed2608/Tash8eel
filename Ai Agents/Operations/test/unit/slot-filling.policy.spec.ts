import { SlotFillingPolicyFactory } from '../../src/application/policies/slot-filling.policy';
import { MerchantCategory } from '../../src/shared/constants/enums';

describe('SlotFillingPolicyFactory', () => {
  describe('ClothesSlotFillingPolicy', () => {
    const policy = SlotFillingPolicyFactory.create(MerchantCategory.CLOTHES);

    it('should require name, phone, and address', () => {
      const slots = policy.getRequiredSlots();
      expect(slots).toContain('الاسم');
      expect(slots).toContain('رقم الهاتف');
      expect(slots).toContain('العنوان');
    });

    it('should return missing slots', () => {
      const context = { customerName: 'أحمد' };
      const missing = policy.getMissingSlots(context);
      expect(missing).toContain('رقم الهاتف');
      expect(missing).toContain('العنوان');
      expect(missing).not.toContain('الاسم');
    });

    it('should generate Arabic prompt for missing slots', () => {
      const context = { customerName: 'أحمد', phone: '01234567890' };
      const prompt = policy.getNextPrompt(context);
      expect(prompt).toBeTruthy();
      expect(prompt).toContain('العنوان');
    });

    it('should return null when all slots filled', () => {
      const context = {
        customerName: 'أحمد',
        phone: '01234567890',
        address: 'مدينة نصر',
      };
      const prompt = policy.getNextPrompt(context);
      expect(prompt).toBeNull();
    });

    it('should indicate completion when all slots filled', () => {
      const context = {
        customerName: 'أحمد',
        phone: '01234567890',
        address: 'مدينة نصر',
      };
      expect(policy.isComplete(context)).toBe(true);
    });

    it('should not be complete with missing slots', () => {
      const context = { customerName: 'أحمد' };
      expect(policy.isComplete(context)).toBe(false);
    });
  });

  describe('FoodSlotFillingPolicy', () => {
    const policy = SlotFillingPolicyFactory.create(MerchantCategory.FOOD);

    it('should require phone and address (not name)', () => {
      const slots = policy.getRequiredSlots();
      expect(slots).toContain('رقم الهاتف');
      expect(slots).toContain('العنوان');
      expect(slots).not.toContain('الاسم');
    });

    it('should be complete without name', () => {
      const context = {
        phone: '01234567890',
        address: 'المهندسين',
      };
      expect(policy.isComplete(context)).toBe(true);
    });
  });

  describe('SupermarketSlotFillingPolicy', () => {
    const policy = SlotFillingPolicyFactory.create(MerchantCategory.SUPERMARKET);

    it('should require phone, address, and delivery time', () => {
      const slots = policy.getRequiredSlots();
      expect(slots).toContain('رقم الهاتف');
      expect(slots).toContain('العنوان');
      expect(slots).toContain('وقت التوصيل');
    });

    it('should not be complete without delivery time', () => {
      const context = {
        phone: '01234567890',
        address: 'الدقي',
      };
      expect(policy.isComplete(context)).toBe(false);
    });

    it('should be complete with all slots including delivery time', () => {
      const context = {
        phone: '01234567890',
        address: 'الدقي',
        deliveryTime: 'بعد الظهر',
      };
      expect(policy.isComplete(context)).toBe(true);
    });
  });
});

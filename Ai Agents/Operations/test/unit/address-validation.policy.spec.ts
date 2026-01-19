import { AddressValidationPolicyFactory } from '../../src/application/policies/address-validation.policy';

describe('AddressValidationPolicyFactory', () => {
  describe('CairoAddressValidator', () => {
    const validator = AddressValidationPolicyFactory.create('cairo');

    it('should recognize Maadi', () => {
      const result = validator.validate('المعادي', 'شارع 9 المعادي');
      expect(result.isValid).toBe(true);
      expect(result.normalizedArea).toBe('المعادي');
    });

    it('should recognize Nasr City', () => {
      const result = validator.validate('مدينة نصر', 'عمارة 5 مدينة نصر');
      expect(result.isValid).toBe(true);
      expect(result.normalizedArea).toBe('مدينة نصر');
    });

    it('should recognize transliterated area names', () => {
      const result = validator.validate('Heliopolis', 'شارع الميرغني مصر الجديدة');
      expect(result.isValid).toBe(true);
      expect(result.normalizedArea).toBe('مصر الجديدة');
    });

    it('should suggest areas for unknown addresses', () => {
      const result = validator.validate('منطقة غير معروفة', 'عنوان غير واضح');
      expect(result.isValid).toBe(false);
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions?.length).toBeGreaterThan(0);
    });

    it('should handle partial match', () => {
      const result = validator.validate('شارع في التجمع', 'التجمع الخامس');
      expect(result.isValid).toBe(true);
      expect(result.normalizedArea).toBe('التجمع الخامس');
    });
  });

  describe('AlexandriaAddressValidator', () => {
    const validator = AddressValidationPolicyFactory.create('alexandria');

    it('should recognize Smouha', () => {
      const result = validator.validate('سموحة', 'شارع فوزي معاذ سموحة');
      expect(result.isValid).toBe(true);
      expect(result.normalizedArea).toBe('سموحة');
    });

    it('should recognize Miami', () => {
      const result = validator.validate('ميامي', 'ميامي الإسكندرية');
      expect(result.isValid).toBe(true);
      expect(result.normalizedArea).toBe('ميامي');
    });

    it('should handle unknown Alexandria areas', () => {
      const result = validator.validate('منطقة بعيدة', 'عنوان غير معروف');
      expect(result.isValid).toBe(false);
    });
  });

  describe('GizaAddressValidator', () => {
    const validator = AddressValidationPolicyFactory.create('giza');

    it('should recognize Dokki', () => {
      const result = validator.validate('الدقي', 'شارع التحرير الدقي');
      expect(result.isValid).toBe(true);
      expect(result.normalizedArea).toBe('الدقي');
    });

    it('should recognize Mohandessin', () => {
      const result = validator.validate('المهندسين', 'شارع شهاب المهندسين');
      expect(result.isValid).toBe(true);
      expect(result.normalizedArea).toBe('المهندسين');
    });
  });

  describe('Default Validator', () => {
    const validator = AddressValidationPolicyFactory.create('unknown_city');

    it('should accept any non-empty address', () => {
      const result = validator.validate('أي منطقة', 'عنوان كامل');
      expect(result.isValid).toBe(true);
    });

    it('should reject empty address', () => {
      const result = validator.validate('', '');
      expect(result.isValid).toBe(false);
    });
  });
});

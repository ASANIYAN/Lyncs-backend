import { Base62Generator } from './base62.generator';

describe('Base62Generator', () => {
  let generator: Base62Generator;

  beforeEach(() => {
    generator = new Base62Generator();
  });

  it('should generate a string of the specified length', () => {
    const length = 6;
    const result = generator.generate(length);
    expect(result).toHaveLength(length);
  });

  it('should only contain valid Base62 characters', () => {
    const result = generator.generate(100);
    // Regex for 0-9, a-z, A-Z
    expect(result).toMatch(/^[0-9a-zA-Z]+$/);
  });

  it('should produce different strings on subsequent calls (randomness)', () => {
    const str1 = generator.generate(6);
    const str2 = generator.generate(6);
    expect(str1).not.toBe(str2);
  });
});

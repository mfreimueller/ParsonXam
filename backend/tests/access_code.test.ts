import { describe, it, expect } from 'vitest';
import { CODE_ALPHABET, CODE_LENGTH, formatCode, generateAccessCode, normaliseCode } from '../src/lib/access_code.js';

describe('access codes', () => {
  it('generates 6 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateAccessCode();
      expect(code).toHaveLength(CODE_LENGTH);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    }
    expect(CODE_ALPHABET).not.toMatch(/[O0I1]/);
  });

  it('normalises what students type', () => {
    expect(normaliseCode('k7m-2qx')).toBe('K7M2QX');
    expect(normaliseCode(' K7M 2QX ')).toBe('K7M2QX');
    expect(normaliseCode('K7M2QX')).toBe('K7M2QX');
  });

  it('rejects anything that cannot be a code', () => {
    expect(normaliseCode('K7M2Q')).toBeNull();
    expect(normaliseCode('K7M2QXX')).toBeNull();
    expect(normaliseCode('K7M-2Q0')).toBeNull(); // zero is not in the alphabet
    expect(normaliseCode('')).toBeNull();
  });

  it('formats with a dash', () => {
    expect(formatCode('K7M2QX')).toBe('K7M-2QX');
  });
});

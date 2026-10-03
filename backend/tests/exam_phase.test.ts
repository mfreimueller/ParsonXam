import { describe, it, expect } from 'vitest';
import { examPhase } from '../src/lib/exam_phase.js';

const opens = new Date('2026-10-17T07:00:00Z');
const closes = new Date('2026-10-17T10:00:00Z');
const published = new Date('2026-10-01T00:00:00Z');

describe('examPhase', () => {
  it('is draft until published, or while times are missing', () => {
    expect(examPhase({ publishedAt: null, opensAt: opens, closesAt: closes }, opens)).toBe('draft');
    expect(examPhase({ publishedAt: published, opensAt: null, closesAt: closes }, opens)).toBe('draft');
    expect(examPhase({ publishedAt: published, opensAt: opens, closesAt: null }, opens)).toBe('draft');
  });

  it('moves scheduled -> live -> over on the boundaries', () => {
    const e = { publishedAt: published, opensAt: opens, closesAt: closes };
    expect(examPhase(e, new Date(opens.getTime() - 1))).toBe('scheduled');
    expect(examPhase(e, opens)).toBe('live');
    expect(examPhase(e, new Date(closes.getTime() - 1))).toBe('live');
    expect(examPhase(e, closes)).toBe('over');
  });
});

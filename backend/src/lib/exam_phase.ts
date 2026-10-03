export type ExamPhase = 'draft' | 'scheduled' | 'live' | 'over';

export interface ExamTimes {
  publishedAt: Date | null;
  opensAt: Date | null;
  closesAt: Date | null;
}

// draft -> scheduled -> live -> over, derived from timestamps so nothing has to flip a flag.
export function examPhase(exam: ExamTimes, now: Date): ExamPhase {
  if (!exam.publishedAt || !exam.opensAt || !exam.closesAt) return 'draft';
  if (now >= exam.closesAt) return 'over';
  if (now < exam.opensAt) return 'scheduled';
  return 'live';
}

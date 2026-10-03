import { api } from './api.js';

export interface ExamInfo {
	title: string;
	className: string;
	instructions: string;
	puzzleCount: number;
	timeLimitSeconds: number;
	studentsIndent: boolean;
	opensAt: string | null;
	closesAt: string | null;
	phase: 'draft' | 'scheduled' | 'live' | 'over';
}

interface Base {
	serverNow: string;
	studentName: string;
	exam: ExamInfo;
}

export interface Piece {
	pieceId: string;
	code: string;
	indent?: number;
}

export interface Placed {
	pieceId: string;
	indent: number;
}

export interface PuzzleState {
	id: number;
	title: string;
	description: string;
	pieces: Piece[];
	placed: Placed[];
}

export interface ReviewPuzzle {
	id: number;
	title: string;
	description: string;
	scorePercent: number;
	submission: { code: string; indent: number; correct: boolean }[];
	solution: { code: string; indent: number }[];
	redHerrings: { code: string; indent: number }[];
}

export type AttemptView =
	| ({ status: 'joined' } & Base)
	| ({ status: 'in_progress'; startedAt: string; deadlineAt: string; puzzles: PuzzleState[] } & Base)
	| ({
			status: 'submitted';
			submittedAt: string;
			submitReason: 'manual' | 'timeout' | null;
			scorePercent: number;
			review?: { puzzles: ReviewPuzzle[] };
	  } & Base);

export const loadAttempt = () => api<AttemptView>('/student/attempt', { auth: true });

/** Where a student with this attempt belongs. */
export function routeFor(view: AttemptView): '/' | '/ready' | '/exam' | '/done' {
	if (view.status === 'joined') return '/ready';
	if (view.status === 'in_progress') return '/exam';
	return '/done';
}

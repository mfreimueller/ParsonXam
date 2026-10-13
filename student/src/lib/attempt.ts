import { api } from './api.js';
import type { Gaps, Tile } from './template_state.js';

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

export interface LinesPuzzleState {
	id: number;
	kind: 'lines';
	title: string;
	description: string;
	pieces: Piece[];
	placed: Placed[];
}

/** Fixed text, or the number of a gap (the server never says what belongs in it). */
export type Segment = { text: string } | { gap: number };

export interface TemplatePuzzleState {
	id: number;
	kind: 'template';
	title: string;
	description: string;
	lines: Segment[][];
	pieces: Tile[];
	placed: { gaps: Gaps };
}

export type PuzzleState = LinesPuzzleState | TemplatePuzzleState;

/** The body of an autosave request. */
export type SavedState = { placed: Placed[] } | { gaps: Gaps };

export const savedStateOf = (p: PuzzleState): SavedState => (p.kind === 'template' ? p.placed : { placed: p.placed });
export const isUntouched = (p: PuzzleState) => (p.kind === 'template' ? Object.keys(p.placed.gaps).length === 0 : p.placed.length === 0);

export interface LinesReviewPuzzle {
	id: number;
	kind: 'lines';
	title: string;
	description: string;
	scorePercent: number;
	submission: { code: string; indent: number; correct: boolean }[];
	solution: { code: string; indent: number }[];
	redHerrings: { code: string; indent: number }[];
}

export type ReviewSegment =
	| { text: string }
	| { gap: number; expected: string[]; submitted: { text: string; correct: boolean }[]; anyOrder: boolean };

export interface TemplateReviewPuzzle {
	id: number;
	kind: 'template';
	title: string;
	description: string;
	scorePercent: number;
	lines: ReviewSegment[][];
	redHerrings: string[];
	reusable: string[];
}

export type ReviewPuzzle = LinesReviewPuzzle | TemplateReviewPuzzle;

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

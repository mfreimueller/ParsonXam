export type Role = 'owner' | 'member';

export interface Member {
	teacherId: number;
	displayName: string;
	email: string;
	role: Role;
}

export interface ClassView {
	id: number;
	name: string;
	term: string;
	myRole: Role;
	examCount: number;
	studentCount: number;
	members: Member[];
}

export type ExamStatus = 'draft' | 'scheduled' | 'live' | 'over';

export interface ExamView {
	id: number;
	classId: number;
	title: string;
	instructions: string;
	timeLimitSeconds: number;
	opensAt: string | null;
	closesAt: string | null;
	studentsIndent: boolean;
	/** null: every student gets all puzzles. */
	puzzlesPerStudent: number | null;
	accessCode: string;
	status: ExamStatus;
	publishedAt: string | null;
	puzzleCount: number;
	attemptCount: number;
	submissionCount: number;
	createdBy: { id: number; displayName: string } | null;
}

export type PuzzleKind = 'lines' | 'template';

interface SummaryBase {
	id: number;
	position: number;
	title: string;
}

export type PuzzleSummary =
	| (SummaryBase & { kind: 'lines'; solutionLineCount: number; redHerringCount: number })
	| (SummaryBase & { kind: 'template'; pieceCount: number; gapCount: number });

export interface LineView {
	id: string;
	code: string;
	indent: number;
}

interface PuzzleBase {
	id: number;
	examId: number;
	position: number;
	title: string;
	description: string;
}

export interface LinesPuzzleView extends PuzzleBase {
	kind: 'lines';
	solution: LineView[];
	redHerrings: LineView[];
}

/** `template` is the teacher's source with {{ }} markers. */
export interface TemplatePuzzleView extends PuzzleBase {
	kind: 'template';
	template: string;
	redHerrings: string[];
	reusable: string[];
}

export type PuzzleView = LinesPuzzleView | TemplatePuzzleView;

export type AttemptStatus = 'joined' | 'in_progress' | 'submitted';
export type SubmitReason = 'manual' | 'timeout';

export interface ResultRow {
	id: number;
	studentName: string;
	status: AttemptStatus;
	joinedAt: string;
	startedAt: string | null;
	submittedAt: string | null;
	submitReason: SubmitReason | null;
	scorePercent: number | null;
	puzzles: { puzzleId: number; assigned: boolean; scorePercent: number | null }[];
}

export interface ResultsView {
	puzzles: { id: number; kind: PuzzleKind; title: string }[];
	stats: {
		joined: number;
		inProgress: number;
		submitted: number;
		timedOut: number;
		averagePercent: number | null;
		highestPercent: number | null;
		lowestPercent: number | null;
	};
	attempts: ResultRow[];
}

export interface ReviewLine {
	code: string;
	indent: number;
}

export type ReviewSegment =
	| { text: string }
	| { gap: number; expected: string[]; submitted: { text: string; correct: boolean }[]; anyOrder: boolean };

export type AttemptPuzzle =
	| {
			id: number;
			kind: 'lines';
			title: string;
			description: string;
			scorePercent: number;
			submission: (ReviewLine & { correct: boolean })[];
			solution: ReviewLine[];
			redHerrings: ReviewLine[];
	  }
	| {
			id: number;
			kind: 'template';
			title: string;
			description: string;
			scorePercent: number;
			lines: ReviewSegment[][];
			redHerrings: string[];
			reusable: string[];
	  };

export interface AttemptDetail {
	id: number;
	examId: number;
	studentName: string;
	status: AttemptStatus;
	startedAt: string | null;
	submittedAt: string | null;
	submitReason: SubmitReason | null;
	scorePercent: number | null;
	puzzles: AttemptPuzzle[];
}

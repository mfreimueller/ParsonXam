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

export interface PuzzleSummary {
	id: number;
	position: number;
	title: string;
	solutionLineCount: number;
	redHerringCount: number;
}

export interface LineView {
	id: string;
	code: string;
	indent: number;
}

export interface PuzzleView {
	id: number;
	examId: number;
	position: number;
	title: string;
	description: string;
	solution: LineView[];
	redHerrings: LineView[];
}

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
	puzzles: { id: number; title: string }[];
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

export interface AttemptDetail {
	id: number;
	examId: number;
	studentName: string;
	status: AttemptStatus;
	startedAt: string | null;
	submittedAt: string | null;
	submitReason: SubmitReason | null;
	scorePercent: number | null;
	puzzles: {
		id: number;
		title: string;
		description: string;
		scorePercent: number;
		submission: (ReviewLine & { correct: boolean })[];
		solution: ReviewLine[];
		redHerrings: ReviewLine[];
	}[];
}

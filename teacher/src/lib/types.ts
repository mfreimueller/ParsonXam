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
	accessCode: string;
	status: ExamStatus;
	publishedAt: string | null;
	puzzleCount: number;
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

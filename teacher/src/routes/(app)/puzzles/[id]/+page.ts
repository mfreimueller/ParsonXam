import { api, ApiError } from '#lib/api.js';
import type { ClassView, ExamView, PuzzleView } from '#lib/types.js';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	try {
		const puzzle = await api<{ puzzle: PuzzleView }>(`/teacher/puzzles/${params.id}`);
		const exam = await api<{ exam: ExamView }>(`/teacher/exams/${puzzle.puzzle.examId}`);
		const cls = await api<{ class: ClassView }>(`/teacher/classes/${exam.exam.classId}`);
		return { puzzle: puzzle.puzzle, exam: exam.exam, cls: cls.class };
	} catch (err) {
		if (err instanceof ApiError) error(err.status === 0 ? 503 : err.status, err.message);
		throw err;
	}
}

import { api, ApiError } from '#lib/api.js';
import type { ClassView, ExamView, PuzzleSummary } from '#lib/types.js';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	try {
		const [exam, puzzles] = await Promise.all([
			api<{ exam: ExamView }>(`/teacher/exams/${params.id}`),
			api<{ puzzles: PuzzleSummary[] }>(`/teacher/exams/${params.id}/puzzles`)
		]);
		const cls = await api<{ class: ClassView }>(`/teacher/classes/${exam.exam.classId}`);
		return { exam: exam.exam, puzzles: puzzles.puzzles, cls: cls.class };
	} catch (err) {
		if (err instanceof ApiError) error(err.status === 0 ? 503 : err.status, err.message);
		throw err;
	}
}

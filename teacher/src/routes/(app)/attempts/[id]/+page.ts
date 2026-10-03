import { api, ApiError } from '#lib/api.js';
import type { AttemptDetail, ClassView, ExamView, ResultsView } from '#lib/types.js';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	try {
		const { attempt } = await api<{ attempt: AttemptDetail }>(`/teacher/attempts/${params.id}`);
		const [exam, results] = await Promise.all([
			api<{ exam: ExamView }>(`/teacher/exams/${attempt.examId}`),
			api<ResultsView>(`/teacher/exams/${attempt.examId}/results`)
		]);
		const cls = await api<{ class: ClassView }>(`/teacher/classes/${exam.exam.classId}`);
		return { attempt, exam: exam.exam, cls: cls.class, siblings: results.attempts.map((a) => a.id) };
	} catch (err) {
		if (err instanceof ApiError) error(err.status === 0 ? 503 : err.status, err.message);
		throw err;
	}
}

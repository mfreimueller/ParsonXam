import { api, ApiError } from '#lib/api.js';
import type { ClassView, ExamView, ResultsView } from '#lib/types.js';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	try {
		const [exam, results] = await Promise.all([
			api<{ exam: ExamView }>(`/teacher/exams/${params.id}`),
			api<ResultsView>(`/teacher/exams/${params.id}/results`)
		]);
		const cls = await api<{ class: ClassView }>(`/teacher/classes/${exam.exam.classId}`);
		return { exam: exam.exam, cls: cls.class, results };
	} catch (err) {
		if (err instanceof ApiError) error(err.status === 0 ? 503 : err.status, err.message);
		throw err;
	}
}

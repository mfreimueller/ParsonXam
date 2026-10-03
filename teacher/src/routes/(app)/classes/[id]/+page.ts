import { api, ApiError } from '#lib/api.js';
import type { ClassView, ExamView } from '#lib/types.js';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	try {
		const [cls, exams] = await Promise.all([
			api<{ class: ClassView }>(`/teacher/classes/${params.id}`),
			api<{ exams: ExamView[] }>(`/teacher/classes/${params.id}/exams`)
		]);
		return { cls: cls.class, exams: exams.exams };
	} catch (err) {
		if (err instanceof ApiError) error(err.status === 0 ? 503 : err.status, err.message);
		throw err;
	}
}

import { api, ApiError } from '#lib/api.js';
import type { ClassView } from '#lib/types.js';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	try {
		const res = await api<{ class: ClassView }>(`/teacher/classes/${params.id}`);
		return { cls: res.class };
	} catch (err) {
		if (err instanceof ApiError) error(err.status === 0 ? 503 : err.status, err.message);
		throw err;
	}
}

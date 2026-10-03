import { api } from '#lib/api.js';
import type { ClassView } from '#lib/types.js';

export async function load() {
	const res = await api<{ classes: ClassView[] }>('/teacher/classes');
	return { classes: res.classes };
}

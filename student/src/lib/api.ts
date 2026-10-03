import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { session } from './session.svelte.js';

const API = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
		public data: Record<string, unknown> = {}
	) {
		super(message);
	}
}

interface Options {
	method?: 'GET' | 'POST' | 'PUT';
	body?: unknown;
	/** Send the attempt token. Default false: join and lookup have none yet. */
	auth?: boolean;
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
	const { method = 'GET', body, auth = false } = opts;
	const headers: Record<string, string> = {};
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	if (auth && session.token) headers.Authorization = `Bearer ${session.token}`;

	let res: Response;
	try {
		res = await fetch(`${API}${path}`, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body)
		});
	} catch {
		throw new ApiError(0, 'NETWORK', 'No connection. Check your Wi-Fi and try again.');
	}

	const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
	if (res.ok) return data as T;

	if (res.status === 401 && auth) {
		session.clear();
		await goto(resolve('/'));
	}
	throw new ApiError(res.status, data.error ?? 'ERROR', data.message ?? 'Something went wrong.', data);
}

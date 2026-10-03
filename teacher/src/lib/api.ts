import { goto } from '$app/navigation';
import { auth } from './auth.svelte.js';

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
	method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	body?: unknown;
	/** Send the session token and sign out on 401. Default true. */
	auth?: boolean;
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
	const { method = 'GET', body, auth: useAuth = true } = opts;
	const headers: Record<string, string> = {};
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	if (useAuth && auth.token) headers.Authorization = `Bearer ${auth.token}`;

	let res: Response;
	try {
		res = await fetch(`${API}${path}`, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body)
		});
	} catch {
		throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
	}

	const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
	if (res.ok) return data as T;

	if (res.status === 401 && useAuth) {
		auth.clear();
		await goto('/login');
	}
	throw new ApiError(res.status, data.error ?? 'ERROR', data.message ?? 'Something went wrong.', data);
}

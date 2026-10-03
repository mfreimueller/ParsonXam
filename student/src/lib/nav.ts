import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import type { AttemptView } from './attempt.js';
import { routeFor } from './attempt.js';

export type AppRoute = '/' | '/name' | '/ready' | '/exam' | '/done' | '/closed' | '/not-open';

// resolve() is typed per route id; a union of ids needs one cast, kept in this single place.
export function go(route: AppRoute, opts: { replaceState?: boolean } = {}) {
	return goto(resolve(route as '/'), opts);
}

export const goForAttempt = (view: AttemptView, opts: { replaceState?: boolean } = {}) => go(routeFor(view), opts);

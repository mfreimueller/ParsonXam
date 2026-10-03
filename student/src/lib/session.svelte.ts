// What the browser remembers: the attempt token (so a reload or a reboot resumes the exam) and
// what the join screens found out about the exam on the way.
const TOKEN_KEY = 'parsonxam.student.token';
const FLOW_KEY = 'parsonxam.student.flow';

export interface Found {
	code: string;
	examTitle: string;
	className: string;
	timeLimitSeconds: number;
	puzzleCount: number;
	closesAt: string;
}

export interface Notice {
	examTitle: string;
	opensAt?: string | null;
	closesAt?: string | null;
}

interface Flow {
	found: Found | null;
	notice: Notice | null;
}

function read<T>(storage: Storage | undefined, key: string): T | null {
	try {
		const raw = storage?.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

function write(storage: Storage | undefined, key: string, value: unknown) {
	try {
		if (value === null) storage?.removeItem(key);
		else storage?.setItem(key, JSON.stringify(value));
	} catch {
		// Storage blocked (private mode): the app still works until the page is reloaded.
	}
}

class Session {
	token = $state<string | null>(null);
	flow = $state<Flow>({ found: null, notice: null });

	constructor() {
		if (typeof localStorage === 'undefined') return;
		this.token = read<string>(localStorage, TOKEN_KEY);
		this.flow = read<Flow>(sessionStorage, FLOW_KEY) ?? { found: null, notice: null };
	}

	setToken(token: string) {
		this.token = token;
		write(localStorage, TOKEN_KEY, token);
	}

	setFound(found: Found | null) {
		this.flow = { ...this.flow, found };
		write(sessionStorage, FLOW_KEY, this.flow);
	}

	setNotice(notice: Notice | null) {
		this.flow = { ...this.flow, notice };
		write(sessionStorage, FLOW_KEY, this.flow);
	}

	/** Forget everything, for "not you?" and for expired tokens. */
	clear() {
		this.token = null;
		this.flow = { found: null, notice: null };
		write(localStorage, TOKEN_KEY, null);
		write(sessionStorage, FLOW_KEY, null);
	}
}

export const session = new Session();

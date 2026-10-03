<script lang="ts">
	import { go, goForAttempt } from '#lib/nav.js';
			import { onMount } from 'svelte';
	import { api, ApiError } from '#lib/api.js';
	import { loadAttempt } from '#lib/attempt.js';
	import Button from '#lib/components/Button.svelte';
	import Card from '#lib/components/Card.svelte';
	import { session, type Found } from '#lib/session.svelte.js';

	let code = $state('');
	let error = $state<string | null>(null);
	let checking = $state(false);
	let resuming = $state(session.token !== null);

	// A tablet that was closed mid-exam picks up where it was.
	onMount(async () => {
		if (!session.token) return;
		try {
			const view = await loadAttempt();
			await goForAttempt(view, { replaceState: true });
		} catch {
			// Expired or unreachable: show the code screen.
		} finally {
			resuming = false;
		}
	});

	// "k7m2qx" -> "K7M-2QX" while typing
	function format(raw: string): string {
		const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
		return clean.length > 3 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : clean;
	}

	function onInput(e: Event) {
		code = format((e.currentTarget as HTMLInputElement).value);
		error = null;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (code.replace('-', '').length < 6) {
			error = 'Codes have 6 characters, like ABC-123.';
			return;
		}
		checking = true;
		error = null;
		try {
			const res = await api<Omit<Found, 'code'>>('/student/lookup', { method: 'POST', body: { code } });
			session.setFound({ ...res, code });
			await go('/name');
		} catch (err) {
			if (err instanceof ApiError && err.code === 'EXAM_NOT_OPEN') {
				session.setNotice({ examTitle: err.data.examTitle as string, opensAt: err.data.opensAt as string });
				await go('/not-open');
			} else if (err instanceof ApiError && err.code === 'EXAM_CLOSED') {
				session.setNotice({ examTitle: err.data.examTitle as string, closesAt: err.data.closesAt as string });
				await go('/closed');
			} else {
				error = err instanceof ApiError && err.code === 'CODE_NOT_FOUND' ? 'notfound' : (err as Error).message;
			}
		} finally {
			checking = false;
		}
	}
</script>

<svelte:head><title>Join · ParsonXam</title></svelte:head>

<Card>
	{#if resuming}
		<p class="muted" role="status">Looking for your exam…</p>
	{:else}
		<div class="head">
			<h1>Join your revision</h1>
			<p>Enter the code your teacher gave you.</p>
		</div>
		<form onsubmit={submit} novalidate>
			<div class="field">
				<label class="sr" for="code">Exam code</label>
				<input
					id="code"
					class="code"
					class:bad={error !== null}
					value={code}
					oninput={onInput}
					placeholder="ABC-123"
					autocomplete="off"
					autocapitalize="characters"
					autocorrect="off"
					spellcheck="false"
					enterkeyhint="go"
					aria-invalid={error ? 'true' : undefined}
					aria-describedby={error ? 'code-error' : undefined}
				/>
				{#if error}
					<p class="error" id="code-error" role="alert">
						<span aria-hidden="true">⚠</span>
						{error === 'notfound' ? 'We couldn’t find an exam with this code.' : error}
					</p>
				{/if}
			</div>
			<Button type="submit" block loading={checking}>Continue</Button>
		</form>
		{#if error === 'notfound'}
			<div class="help">
				<strong>Things to check</strong>
				<ul>
					<li>The code has 6 characters, like ABC-123.</li>
					<li>The letter O and the digit 0 look alike.</li>
					<li>Still stuck? Ask your teacher for the code.</li>
				</ul>
			</div>
		{/if}
		<p class="hint">Codes look like ABC-123 and are not case-sensitive.</p>
	{/if}
</Card>

<style>
	.head {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	h1 {
		font-size: 26px;
		font-weight: 700;
	}
	.head p,
	.muted {
		color: var(--text-muted);
		font-size: 15px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.code {
		width: 100%;
		height: 72px;
		border: 2px solid var(--primary);
		border-radius: 12px;
		background: var(--surface);
		font: 700 32px var(--font-mono);
		letter-spacing: 0.05em;
		text-align: center;
		text-transform: uppercase;
	}
	.code::placeholder {
		color: var(--border-strong);
	}
	.code.bad {
		border-color: var(--danger);
		background: var(--danger-soft);
	}
	.error {
		color: var(--danger);
		font-size: 14px;
		font-weight: 500;
	}
	.help {
		padding: 16px;
		border-radius: 10px;
		background: var(--surface-alt);
		color: var(--text-muted);
		font-size: 13px;
	}
	.help strong {
		color: var(--text);
	}
	.help ul {
		margin: 8px 0 0;
		padding-left: 20px;
		line-height: 1.7;
	}
	.hint {
		color: var(--text-muted);
		font-size: 13px;
		text-align: center;
	}
</style>

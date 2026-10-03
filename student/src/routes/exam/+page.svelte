<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { api, ApiError } from '#lib/api.js';
	import { loadAttempt, type PuzzleState } from '#lib/attempt.js';
	import { Autosaver, type SaveStatus } from '#lib/autosave.js';
	import Button from '#lib/components/Button.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import Puzzle from '#lib/components/Puzzle.svelte';
	import { go, goForAttempt } from '#lib/nav.js';
	import { session } from '#lib/session.svelte.js';
	import { formatCountdown } from '#lib/time.js';

	const INDEX_KEY = 'parsonxam.student.puzzle';

	let puzzles = $state<PuzzleState[]>([]);
	let studentsIndent = $state(false);
	let index = $state(0);
	let loaded = $state(false);
	let loadError = $state<string | null>(null);

	let deadline = 0; // ms, server time
	let offset = 0; // server clock minus this device's clock
	let remaining = $state(0);
	let finishing = $state(false);
	let status = $state<SaveStatus>('saved');

	let confirming = $state(false);
	let submitting = $state(false);
	let submitError = $state<string | null>(null);

	let tick: ReturnType<typeof setInterval>;

	const saver = new Autosaver({
		send: (puzzleId, placed) => api(`/student/puzzles/${puzzleId}/state`, { method: 'PUT', body: { placed }, auth: true }),
		// Submitted or signed out: nothing more can be saved, so show where the student stands.
		isFatal: (err) => err instanceof ApiError && [401, 404, 409].includes(err.status),
		onFatal: () => void finish(),
		onStatus: (s) => (status = s)
	});

	onMount(async () => {
		if (!session.token) return void go('/', { replaceState: true });
		try {
			const view = await loadAttempt();
			if (view.status !== 'in_progress') return void goForAttempt(view, { replaceState: true });
			puzzles = view.puzzles;
			studentsIndent = view.exam.studentsIndent;
			deadline = Date.parse(view.deadlineAt);
			offset = Date.parse(view.serverNow) - Date.now();
			const saved = Number(sessionStorage.getItem(INDEX_KEY));
			index = Number.isInteger(saved) && saved >= 0 && saved < puzzles.length ? saved : 0;
			update();
			tick = setInterval(update, 250);
			loaded = true;
		} catch (err) {
			loadError = (err as Error).message;
		}
		window.addEventListener('beforeunload', warn);
		document.addEventListener('visibilitychange', onVisibility);
	});

	onDestroy(() => {
		clearInterval(tick);
		saver.stop();
		if (typeof window !== 'undefined') {
			window.removeEventListener('beforeunload', warn);
			document.removeEventListener('visibilitychange', onVisibility);
		}
	});

	function update() {
		remaining = deadline - (Date.now() + offset);
		if (remaining <= 0 && !finishing) void finish();
	}

	// The server settles the attempt when time is up; ask it what became of this one.
	async function finish() {
		if (finishing) return;
		finishing = true;
		clearInterval(tick);
		saver.stop();
		for (;;) {
			try {
				const view = await loadAttempt();
				await goForAttempt(view);
				return;
			} catch (err) {
				if (err instanceof ApiError && err.status === 401) return;
				await new Promise((r) => setTimeout(r, 2000));
			}
		}
	}

	function onVisibility() {
		if (document.visibilityState === 'hidden') void saver.flush();
	}

	function warn(e: BeforeUnloadEvent) {
		if (status !== 'saved' && !finishing) e.preventDefault();
	}

	function moved(placed: { pieceId: string; indent: number }[]) {
		const p = puzzles[index]!;
		p.placed = placed;
		saver.queue(p.id, placed);
	}

	async function show(i: number) {
		await saver.flush();
		index = i;
		sessionStorage.setItem(INDEX_KEY, String(i));
		window.scrollTo({ top: 0 });
	}

	const untouched = $derived(puzzles.filter((p) => p.placed.length === 0));

	async function submit() {
		submitting = true;
		submitError = null;
		try {
			await saver.flush();
			if (finishing) return;
			await api('/student/submit', { method: 'POST', body: {}, auth: true });
			finishing = true;
			clearInterval(tick);
			saver.stop();
			await go('/done');
		} catch (err) {
			submitError = (err as Error).message;
		} finally {
			submitting = false;
		}
	}

	const puzzle = $derived(puzzles[index]);
	const low = $derived(remaining <= 60_000);
</script>

<svelte:head><title>Puzzle {index + 1} · ParsonXam</title></svelte:head>

{#if loaded && puzzle}
	<div class="bar">
		<Logo compact />
		<div class="right">
			<div class="meta">
			<div class="progress" aria-label="Puzzle {index + 1} of {puzzles.length}">
				<span class="label">Puzzle {index + 1} of {puzzles.length}</span>
				{#each puzzles as _, i}<span class="dot" class:now={i === index} class:done={i < index}></span>{/each}
			</div>
			<span class="save" class:offline={status === 'offline'} role="status">
				{status === 'saved' ? 'Saved ✓' : status === 'saving' ? 'Saving…' : 'Offline – retrying…'}
			</span>
			</div>
			<div class="timer" class:low role="timer" aria-label="Time left">
				<span aria-hidden="true">⏱</span>
				<strong>{formatCountdown(remaining)}</strong>
			</div>
			<Button onclick={() => { submitError = null; confirming = true; }}>Submit exam</Button>
		</div>
	</div>

	{#if low}
		<p class="banner" role="alert">Less than a minute left – your answers are submitted automatically when time is up.</p>
	{/if}

	<main>
		<div class="task">
			<h1>Puzzle {index + 1}: {puzzle.title}</h1>
			{#if puzzle.description}<p>{puzzle.description}</p>{/if}
			{#if studentsIndent}<p class="tip">Use the ⇤ ⇥ buttons to indent each line.</p>{/if}
		</div>

		{#key puzzle.id}
			<Puzzle pieces={puzzle.pieces} placed={puzzle.placed} {studentsIndent} onchange={moved} />
		{/key}

		<div class="footer">
			{#if index > 0}
				<Button variant="secondary" onclick={() => show(index - 1)}>← Puzzle {index}</Button>
			{:else}<span></span>{/if}
			{#if index < puzzles.length - 1}
				<Button variant="secondary" onclick={() => show(index + 1)}>Puzzle {index + 2} →</Button>
			{:else}
				<Button onclick={() => { submitError = null; confirming = true; }}>Review and submit</Button>
			{/if}
		</div>
	</main>

	<Dialog bind:open={confirming} title="Submit your exam?" width={460}>
		<p class="confirm">
			{#if untouched.length === 0}
				You have placed pieces in all {puzzles.length} puzzles.
			{:else if untouched.length === 1}
				Puzzle {puzzles.indexOf(untouched[0]!) + 1} is still empty.
			{:else}
				{untouched.length} puzzles are still empty.
			{/if}
			Once you submit you can’t change your answers.
		</p>
		<p class="left">Time left <strong>{formatCountdown(remaining)}</strong></p>
		{#if submitError}<p class="error" role="alert">{submitError}</p>{/if}
		<div class="buttons">
			<Button variant="secondary" onclick={() => (confirming = false)}>Keep working</Button>
			<Button loading={submitting} onclick={submit}>Yes, submit</Button>
		</div>
	</Dialog>
{:else if loadError}
	<main><p class="error" role="alert">{loadError}</p><Button onclick={() => go('/')}>Back</Button></main>
{:else}
	<main><p class="muted" role="status">Loading your exam…</p></main>
{/if}

<style>
	.bar {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		min-height: 64px;
		padding: 8px 32px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.right {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.meta {
		display: contents;
	}
	.progress {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.label {
		color: var(--text-muted);
		font-size: 13px;
		font-weight: 600;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 4px;
		background: var(--border-strong);
	}
	.dot.done {
		background: var(--primary);
	}
	.dot.now {
		width: 24px;
		background: var(--primary);
	}
	.save {
		color: var(--text-muted);
		font-size: 12px;
	}
	.save.offline {
		color: var(--warn);
		font-weight: 600;
	}
	.timer {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		border-radius: 100px;
		background: var(--surface-alt);
		font: 16px var(--font-mono);
	}
	.timer.low {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.banner {
		margin: 0;
		padding: 10px 32px;
		background: var(--warn-soft);
		color: var(--warn);
		font-size: 14px;
		font-weight: 500;
	}
	main {
		display: flex;
		flex-direction: column;
		gap: 20px;
		width: 100%;
		max-width: 1200px;
		margin: 0 auto;
		padding: 32px;
	}
	.task {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	h1 {
		font-size: 22px;
		font-weight: 700;
	}
	.task p {
		color: var(--text-muted);
		font-size: 14px;
	}
	.tip {
		color: var(--primary) !important;
	}
	.footer {
		display: flex;
		justify-content: space-between;
	}
	.confirm,
	.left {
		color: var(--text-muted);
		font-size: 14px;
		line-height: 1.5;
	}
	.left {
		padding: 8px 12px;
		border-radius: 8px;
		background: var(--surface-alt);
		align-self: flex-start;
	}
	.left strong {
		color: var(--text);
		font-family: var(--font-mono);
	}
	.buttons {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}
	.error {
		color: var(--danger);
		font-size: 14px;
	}
	.muted {
		color: var(--text-muted);
	}
	@media (max-width: 800px) {
		.bar {
			padding: 8px 16px;
		}
		.label {
			display: none;
		}
		main {
			padding: 16px;
		}
		.banner {
			padding: 10px 16px;
		}
	}
	@media (max-width: 600px) {
		.bar {
			flex-wrap: wrap;
			row-gap: 4px;
			padding: 8px 16px;
		}
		.right {
			display: contents;
		}
		.meta {
			display: flex;
			order: 3;
			flex-basis: 100%;
			justify-content: space-between;
			align-items: center;
		}
		.label {
			display: inline;
		}
		.timer {
			margin-left: auto;
			padding: 6px 12px;
			font-size: 15px;
		}
	}
</style>

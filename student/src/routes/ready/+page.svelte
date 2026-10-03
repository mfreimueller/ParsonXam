<script lang="ts">
	import { resolve } from '$app/paths';
	import { go, goForAttempt } from '#lib/nav.js';
			import { onMount } from 'svelte';
	import { api, ApiError } from '#lib/api.js';
	import { loadAttempt, type AttemptView } from '#lib/attempt.js';
	import Button from '#lib/components/Button.svelte';
	import Card from '#lib/components/Card.svelte';
	import { session } from '#lib/session.svelte.js';
	import { formatDateTime } from '#lib/time.js';

	let view = $state<Extract<AttemptView, { status: 'joined' }> | null>(null);
	let error = $state<string | null>(null);
	let starting = $state(false);

	onMount(async () => {
		if (!session.token) return void go('/', { replaceState: true });
		try {
			const v = await loadAttempt();
			if (v.status !== 'joined') return void goForAttempt(v, { replaceState: true });
			if (v.exam.phase === 'over') {
				session.setNotice({ examTitle: v.exam.title, closesAt: v.exam.closesAt });
				return void go('/closed', { replaceState: true });
			}
			view = v;
		} catch (err) {
			error = (err as Error).message;
		}
	});

	const clock = (seconds: number) =>
		`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

	async function start() {
		starting = true;
		error = null;
		try {
			await api('/student/start', { method: 'POST', body: {}, auth: true });
			await go('/exam');
		} catch (err) {
			if (err instanceof ApiError && err.code === 'EXAM_CLOSED') {
				session.setNotice({ examTitle: view?.exam.title ?? '', closesAt: err.data.closesAt as string });
				await go('/closed');
			} else {
				error = (err as Error).message;
			}
		} finally {
			starting = false;
		}
	}

	function notMe() {
		session.clear();
		go('/');
	}
</script>

<svelte:head><title>Ready? · ParsonXam</title></svelte:head>

<Card width={560}>
	{#if view}
		<div class="head">
			<p class="hi">Hi {view.studentName.split(' ')[0]} 👋</p>
			<h1>{view.exam.title}</h1>
			{#if view.exam.instructions}<p class="instructions">{view.exam.instructions}</p>{/if}
		</div>

		<dl class="facts">
			<div><dd>{view.exam.puzzleCount}</dd><dt>Puzzles</dt></div>
			<div><dd>{clock(view.exam.timeLimitSeconds)}</dd><dt>Time limit</dt></div>
			<div><dd class="small">{formatDateTime(view.exam.closesAt)}</dd><dt>Exam over</dt></div>
		</dl>

		<ul class="rules">
			<li>Drag the code pieces into the right order.</li>
			<li>Some pieces do not belong – leave those out.</li>
			{#if view.exam.studentsIndent}<li>Use the ⇤ ⇥ buttons to indent each line.</li>{/if}
			<li>The timer starts as soon as you click “Take exam”.</li>
			<li>When time runs out, your current answer is submitted automatically.</li>
		</ul>

		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<Button block loading={starting} onclick={start}>Take exam</Button>
		<button class="link" onclick={notMe}>Not {view.studentName.split(' ')[0]}? Start over</button>
	{:else if error}
		<p class="error" role="alert">{error}</p>
		<Button variant="secondary" block href={resolve('/')}>Back</Button>
	{:else}
		<p class="muted" role="status">Loading…</p>
	{/if}
</Card>

<style>
	.head {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.hi,
	.muted,
	.instructions {
		color: var(--text-muted);
		font-size: 15px;
	}
	h1 {
		font-size: 26px;
		font-weight: 700;
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		margin: 0;
	}
	.facts div {
		display: flex;
		flex-direction: column-reverse;
		gap: 2px;
		padding: 16px;
		border-radius: 10px;
		background: var(--surface-alt);
	}
	dd {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
	}
	dd.small {
		font-size: 15px;
		line-height: 1.6;
	}
	dt {
		color: var(--text-muted);
		font-size: 12px;
	}
	.rules {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.rules li {
		display: flex;
		gap: 10px;
		line-height: 1.4;
	}
	.rules li::before {
		content: '✓';
		display: grid;
		flex: none;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--primary-soft);
		color: var(--primary);
		font-size: 11px;
		font-weight: 700;
	}
	.error {
		color: var(--danger);
		font-size: 14px;
	}
	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-muted);
		font-size: 13px;
		cursor: pointer;
		text-decoration: underline;
	}
	@media (max-width: 600px) {
		.facts {
			grid-template-columns: 1fr;
		}
	}
</style>

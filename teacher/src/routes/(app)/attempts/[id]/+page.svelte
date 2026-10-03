<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '#lib/api.js';
	import Badge from '#lib/components/Badge.svelte';
	import Button from '#lib/components/Button.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { formatPercent, scoreTone } from '#lib/score.js';
	import { formatDateTime, formatDuration } from '#lib/time.js';
	import type { ReviewLine } from '#lib/types.js';

	let { data } = $props();
	const attempt = $derived(data.attempt);

	let picked = $state(0);
	// A different student starts on puzzle 1 again.
	$effect(() => {
		void data.attempt.id;
		picked = 0;
	});
	const puzzle = $derived(attempt.puzzles[Math.min(picked, attempt.puzzles.length - 1)]);

	const at = $derived(data.siblings.indexOf(attempt.id));
	const prev = $derived(at > 0 ? data.siblings[at - 1] : undefined);
	const next = $derived(at >= 0 && at < data.siblings.length - 1 ? data.siblings[at + 1] : undefined);

	const key = (l: ReviewLine) => `${l.indent}:${l.code}`;
	/** Lines the student placed that do not belong, and solution lines they left out. */
	const problems = $derived.by(() => {
		if (!puzzle) return null;
		const wanted = new Map<string, number>();
		for (const l of puzzle.solution) wanted.set(key(l), (wanted.get(key(l)) ?? 0) + 1);
		const extra: ReviewLine[] = [];
		for (const l of puzzle.submission) {
			const n = wanted.get(key(l)) ?? 0;
			if (n > 0) wanted.set(key(l), n - 1);
			else extra.push(l);
		}
		const missing = puzzle.solution.filter((l) => (wanted.get(key(l)) ?? 0) > 0);
		const herringCodes = new Set(puzzle.redHerrings.map((l) => l.code));
		return { herrings: extra.filter((l) => herringCodes.has(l.code)), missing };
	});
	const note = $derived.by(() => {
		if (!problems) return null;
		const parts: string[] = [];
		if (problems.herrings.length)
			parts.push(`Red herring used: ${problems.herrings.map((l) => `“${l.code.trim()}”`).join(', ')} does not belong in the solution.`);
		if (problems.missing.length)
			parts.push(`${problems.missing.length === 1 ? 'The missing line is' : 'Missing lines:'} ${problems.missing.map((l) => l.code.trim()).join(', ')}.`);
		return parts.join(' ') || null;
	});
	const correct = $derived(puzzle ? puzzle.submission.filter((l) => l.correct).length : 0);

	let confirmDelete = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function remove() {
		if (!confirmDelete) {
			confirmDelete = true;
			return;
		}
		busy = true;
		error = null;
		try {
			await api(`/teacher/attempts/${attempt.id}`, { method: 'DELETE' });
			await goto(`/exams/${data.exam.id}/results`);
		} catch (err) {
			error = (err as Error).message;
			busy = false;
		}
	}

	const submittedLine = $derived(
		attempt.status === 'submitted'
			? [
					`Submitted ${formatDateTime(attempt.submittedAt)}`,
					attempt.submitReason === 'timeout' ? 'Time ran out' : `Took ${formatDuration(attempt.startedAt, attempt.submittedAt)}`
				].join(' · ')
			: attempt.status === 'in_progress'
				? 'Still working. The arrangement below is the last autosave.'
				: 'Joined but has not started yet.'
	);
</script>

<svelte:head><title>{attempt.studentName} · ParsonXam</title></svelte:head>

<PageHeader
	title={attempt.scorePercent === null ? attempt.studentName : `${attempt.studentName} · ${formatPercent(attempt.scorePercent)}`}
	subtitle={submittedLine}
	crumbs={[
		{ label: 'Classes', href: '/classes' },
		{ label: data.cls.name, href: `/classes/${data.cls.id}` },
		{ label: data.exam.title, href: `/exams/${data.exam.id}` },
		{ label: 'Results', href: `/exams/${data.exam.id}/results` }
	]}
>
	{#snippet actions()}
		{#if prev}<Button variant="secondary" href="/attempts/{prev}">← Previous</Button>{/if}
		{#if next}<Button variant="secondary" href="/attempts/{next}">Next →</Button>{/if}
	{/snippet}
</PageHeader>

{#if attempt.status === 'submitted' && attempt.submitReason === 'timeout'}
	<p class="timeout"><Badge tone="warn">Time ran out</Badge> Scored from the last autosaved arrangement.</p>
{/if}

{#if puzzle}
	<div class="tabs" role="tablist">
		{#each attempt.puzzles as p, i (p.id)}
			<button role="tab" aria-selected={i === picked} class:active={i === picked} onclick={() => (picked = i)}>
				Puzzle {i + 1} · {formatPercent(p.scorePercent)}
			</button>
		{/each}
	</div>

	<h2>Puzzle {picked + 1}: {puzzle.title}</h2>

	<div class="panels">
		<section>
			<header>
				<h3>Student submission</h3>
				<Badge tone={scoreTone(puzzle.scorePercent) === 'good' ? 'success' : 'warn'}>
					{correct} of {puzzle.solution.length} lines correct
				</Badge>
			</header>
			{#if puzzle.submission.length === 0}
				<p class="muted">Nothing was placed for this puzzle.</p>
			{:else}
				<ul>
					{#each puzzle.submission as l, i (i)}
						<li class={l.correct ? 'right' : 'wrong'}>
							<span class="grip" aria-hidden="true">⠿</span>
							<code style="padding-left: {l.indent * 28}px">{l.code}</code>
							<span class="sr">{l.correct ? 'Correct' : 'Wrong'}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
		<section>
			<header>
				<h3>Solution</h3>
				<Badge tone="success">Correct solution</Badge>
			</header>
			<ul>
				{#each puzzle.solution as l, i (i)}
					<li>
						<span class="grip" aria-hidden="true">⠿</span>
						<code style="padding-left: {l.indent * 28}px">{l.code}</code>
					</li>
				{/each}
			</ul>
		</section>
	</div>

	{#if note}<p class="note">{note}</p>{/if}
{/if}

{#if error}<p class="error" role="alert">{error}</p>{/if}

<div class="danger">
	<Button variant="danger" disabled={busy} onclick={remove}>{confirmDelete ? 'Click again to delete' : 'Delete attempt'}</Button>
	<span class="muted">Removes this submission so the student can join again with the same name.</span>
</div>

<style>
	.timeout {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: -12px 0 20px;
		color: var(--text-muted);
		font-size: 13px;
	}
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 28px;
	}
	.tabs button {
		padding: 8px 16px;
		border: 1px solid var(--border-strong);
		border-radius: 100px;
		background: var(--surface);
		color: var(--text-muted);
		font-weight: 600;
		cursor: pointer;
	}
	.tabs button.active {
		border-color: var(--primary);
		background: var(--primary);
		color: var(--text-inverse);
	}
	h2 {
		margin-bottom: 20px;
		font-size: 18px;
		font-weight: 600;
	}
	.panels {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 24px;
	}
	section {
		padding: 24px;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}
	section header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}
	h3 {
		font-size: 16px;
		font-weight: 600;
	}
	ul {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 12px;
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		background: var(--surface);
	}
	li.right {
		border-color: var(--success);
		background: var(--success-soft);
	}
	li.wrong {
		border-color: var(--danger);
		background: var(--danger-soft);
	}
	.grip {
		color: var(--text-muted);
	}
	code {
		font: 400 14px var(--font-mono);
		white-space: pre;
		overflow-x: auto;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.muted {
		color: var(--text-muted);
		font-size: 13px;
	}
	.note {
		margin-top: 24px;
		padding: 12px;
		border-radius: 6px;
		background: var(--warn-soft);
		color: var(--warn);
		font-size: 13px;
	}
	.danger {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-top: 40px;
	}
	.error {
		margin-top: 16px;
		color: var(--danger);
		font-size: 13px;
	}
	@media (max-width: 800px) {
		.panels {
			grid-template-columns: 1fr;
		}
	}
</style>

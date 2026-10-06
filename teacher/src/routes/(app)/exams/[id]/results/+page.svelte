<script lang="ts">
	import { download } from '#lib/api.js';
	import Button from '#lib/components/Button.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { formatPercent, scoreTone } from '#lib/score.js';
	import { formatClock, formatDateTime } from '#lib/time.js';
	import type { ResultRow } from '#lib/types.js';

	let { data } = $props();
	const exam = $derived(data.exam);
	const stats = $derived(data.results.stats);

	let exporting = $state(false);
	let error = $state<string | null>(null);

	async function exportJson() {
		exporting = true;
		error = null;
		try {
			await download(`/teacher/exams/${exam.id}/export`, 'exam.json');
		} catch (err) {
			error = (err as Error).message;
		} finally {
			exporting = false;
		}
	}

	const subtitle = $derived(
		[
			exam.status === 'over' ? `Exam over since ${formatDateTime(exam.closesAt)}` : exam.status === 'live' ? 'Exam is live' : null,
			`${stats.submitted} of ${stats.joined} ${stats.joined === 1 ? 'student' : 'students'} submitted`
		]
			.filter(Boolean)
			.join(' · ')
	);

	function submittedCell(r: ResultRow): { text: string; warn: boolean } {
		if (r.status === 'joined') return { text: 'Not started', warn: false };
		if (r.status === 'in_progress') return { text: 'In progress', warn: false };
		if (r.submitReason === 'timeout') return { text: 'Time ran out', warn: true };
		return { text: formatClock(r.submittedAt), warn: false };
	}
</script>

<svelte:head><title>Results · {exam.title} · ParsonXam</title></svelte:head>

<PageHeader
	title="Results"
	{subtitle}
	crumbs={[
		{ label: 'Classes', href: '/classes' },
		{ label: data.cls.name, href: `/classes/${data.cls.id}` },
		{ label: exam.title, href: `/exams/${exam.id}` }
	]}
>
	{#snippet actions()}
		<Button variant="secondary" loading={exporting} onclick={exportJson}>Export JSON</Button>
	{/snippet}
</PageHeader>

{#if error}<p class="error" role="alert">{error}</p>{/if}

<div class="stats">
	<div class="tile">
		<strong>{stats.submitted} / {stats.joined}</strong>
		<span>Submitted</span>
	</div>
	<div class="tile">
		<strong class="primary">{formatPercent(stats.averagePercent)}</strong>
		<span>Average score</span>
	</div>
	<div class="tile">
		<strong class="good">{formatPercent(stats.highestPercent)}</strong>
		<span>Highest</span>
	</div>
	<div class="tile">
		<strong class="bad">{formatPercent(stats.lowestPercent)}</strong>
		<span>Lowest</span>
	</div>
</div>

{#if data.results.attempts.length === 0}
	<div class="empty"><p>Nobody has joined yet. Students join with the code {exam.accessCode}.</p></div>
{:else}
	<div class="scroll">
		<table>
			<thead>
				<tr>
					<th>Student</th>
					<th>Submitted</th>
					<th>Puzzles ({data.results.puzzles.map((_, i) => i + 1).join(' · ')})</th>
					<th>Total score</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.results.attempts as r (r.id)}
					{@const cell = submittedCell(r)}
					<tr>
						<td class="name">{r.studentName}</td>
						<td class:warn={cell.warn} class="muted">{cell.text}</td>
						<td class="mono">
							{r.status === 'submitted' ? r.puzzles.map((p) => (p.assigned ? Math.round(p.scorePercent ?? 0) : '–')).join(' · ') : '–'}
						</td>
						<td>
							{#if r.scorePercent !== null}
								<div class="score">
									<div class="bar" role="img" aria-label="{formatPercent(r.scorePercent)}">
										<div class="fill {scoreTone(r.scorePercent)}" style="width: {r.scorePercent}%"></div>
									</div>
									<span>{formatPercent(r.scorePercent)}</span>
								</div>
							{:else}
								<span class="muted">–</span>
							{/if}
						</td>
						<td class="view"><a href="/attempts/{r.id}">View</a></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 16px;
		margin-bottom: 28px;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 20px 24px;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}
	.tile strong {
		font-size: 28px;
		font-weight: 700;
	}
	.tile span {
		color: var(--text-muted);
		font-size: 13px;
	}
	.primary {
		color: var(--primary);
	}
	.good {
		color: var(--success);
	}
	.bad {
		color: var(--danger);
	}
	.empty {
		padding: 32px;
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-lg);
		color: var(--text-muted);
	}
	.scroll {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th {
		padding: 12px 24px;
		background: var(--surface-alt);
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 600;
		text-align: left;
		white-space: nowrap;
	}
	td {
		padding: 20px 24px;
		border-top: 1px solid var(--border);
	}
	.name {
		font-weight: 600;
	}
	.muted {
		color: var(--text-muted);
		font-size: 13px;
	}
	td.warn {
		color: var(--warn);
		font-weight: 500;
	}
	.mono {
		color: var(--text-muted);
		font: 500 13px var(--font-mono);
		white-space: nowrap;
	}
	.score {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 600;
	}
	.bar {
		width: 90px;
		height: 8px;
		border-radius: 100px;
		background: var(--surface-alt);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		border-radius: 100px;
	}
	.fill.good {
		background: var(--success);
	}
	.fill.ok {
		background: var(--warn);
	}
	.fill.bad {
		background: var(--danger);
	}
	.view {
		text-align: right;
	}
	.view a {
		color: var(--primary);
		font-weight: 600;
		text-decoration: none;
	}
	.view a:hover {
		text-decoration: underline;
	}
	.error {
		margin-bottom: 16px;
		color: var(--danger);
		font-size: 13px;
	}
	@media (max-width: 800px) {
		.stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>

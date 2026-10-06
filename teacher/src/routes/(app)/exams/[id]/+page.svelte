<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import { api, ApiError } from '#lib/api.js';
	import Button from '#lib/components/Button.svelte';
	import Checkbox from '#lib/components/Checkbox.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Section from '#lib/components/Section.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import TextArea from '#lib/components/TextArea.svelte';
	import TextField from '#lib/components/TextField.svelte';
	import { formatDateTime, fromLocalInput, toLocalInput } from '#lib/time.js';
	import type { ExamView } from '#lib/types.js';

	let { data } = $props();
	const exam = $derived(data.exam);

	function toForm(e: ExamView) {
		return {
			title: e.title,
			instructions: e.instructions,
			minutes: String(Math.round(e.timeLimitSeconds / 60)),
			opensAt: toLocalInput(e.opensAt),
			closesAt: toLocalInput(e.closesAt),
			studentsIndent: e.studentsIndent
		};
	}

	let form = $state(untrack(() => toForm(data.exam)));
	// Start over from the server's copy whenever it reloads (after save, publish, ...).
	$effect(() => {
		form = toForm(data.exam);
	});

	const dirty = $derived(JSON.stringify(form) !== JSON.stringify(toForm(exam)));
	const isDraft = $derived(exam.status === 'draft');
	const isPublished = $derived(exam.publishedAt !== null);

	let busy = $state(false);
	let error = $state<string | null>(null);
	let problems = $state<string[]>([]);
	let copied = $state(false);
	let confirmDelete = $state(false);

	function payload() {
		return {
			title: form.title,
			instructions: form.instructions,
			timeLimitSeconds: Math.round(Number(form.minutes) * 60),
			opensAt: fromLocalInput(form.opensAt),
			closesAt: fromLocalInput(form.closesAt),
			...(isDraft ? { studentsIndent: form.studentsIndent } : {})
		};
	}

	function describe(err: unknown): string {
		if (err instanceof ApiError) {
			if (err.code === 'VALIDATION') return err.message.replace(/^[a-zA-Z.]+: /, '');
			return err.message;
		}
		return 'Something went wrong.';
	}

	async function save(): Promise<boolean> {
		error = null;
		try {
			await api(`/teacher/exams/${exam.id}`, { method: 'PATCH', body: payload() });
			await invalidateAll();
			return true;
		} catch (err) {
			error = describe(err);
			return false;
		}
	}

	async function onSave() {
		busy = true;
		problems = [];
		await save();
		busy = false;
	}

	async function publish() {
		busy = true;
		problems = [];
		try {
			if (dirty && !(await save())) return;
			await api(`/teacher/exams/${exam.id}/publish`, { method: 'POST', body: {} });
			await invalidateAll();
		} catch (err) {
			if (err instanceof ApiError && err.code === 'EXAM_NOT_READY') problems = err.data.problems as string[];
			else error = describe(err);
		} finally {
			busy = false;
		}
	}

	async function unpublish() {
		busy = true;
		error = null;
		try {
			await api(`/teacher/exams/${exam.id}/unpublish`, { method: 'POST', body: {} });
			await invalidateAll();
		} catch (err) {
			error = describe(err);
		} finally {
			busy = false;
		}
	}

	async function regenerate() {
		busy = true;
		try {
			await api(`/teacher/exams/${exam.id}/regenerate-code`, { method: 'POST', body: {} });
			await invalidateAll();
		} catch (err) {
			error = describe(err);
		} finally {
			busy = false;
		}
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(exam.accessCode);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			error = 'Could not copy. Select the code and copy it by hand.';
		}
	}

	async function movePuzzle(index: number, delta: number) {
		const ids = data.puzzles.map((p) => p.id);
		const target = index + delta;
		if (target < 0 || target >= ids.length) return;
		[ids[index], ids[target]] = [ids[target]!, ids[index]!];
		try {
			await api(`/teacher/exams/${exam.id}/puzzles/order`, { method: 'PUT', body: { puzzleIds: ids } });
			await invalidateAll();
		} catch (err) {
			error = describe(err);
		}
	}

	async function deletePuzzle(id: number) {
		try {
			await api(`/teacher/puzzles/${id}`, { method: 'DELETE' });
			await invalidateAll();
		} catch (err) {
			error = describe(err);
		}
	}

	let fileInput = $state<HTMLInputElement>();
	let imported = $state<string | null>(null);

	async function importFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		error = null;
		imported = null;
		let body: unknown;
		try {
			body = JSON.parse(await file.text());
		} catch {
			error = `${file.name} is not valid JSON.`;
			return;
		}
		try {
			const res = await api<{ imported: number }>(`/teacher/exams/${exam.id}/puzzles/import`, { method: 'POST', body });
			imported = `Imported ${res.imported} ${res.imported === 1 ? 'puzzle' : 'puzzles'} from ${file.name}.`;
			await invalidateAll();
		} catch (err) {
			error = `Nothing was imported. ${describe(err)}`;
		}
	}

	async function deleteExam() {
		if (!confirmDelete) {
			confirmDelete = true;
			return;
		}
		busy = true;
		try {
			await api(`/teacher/exams/${exam.id}`, { method: 'DELETE' });
			await goto(`/classes/${exam.classId}`);
		} catch (err) {
			error = describe(err);
			busy = false;
		}
	}

	const statusText = $derived(
		{
			draft: 'Not published yet',
			scheduled: `Opens ${formatDateTime(exam.opensAt)}`,
			live: `Open until ${formatDateTime(exam.closesAt)}`,
			over: `Over since ${formatDateTime(exam.closesAt)}`
		}[exam.status]
	);
</script>

<svelte:head><title>{exam.title} · ParsonXam</title></svelte:head>

<PageHeader
	title={exam.title}
	crumbs={[
		{ label: 'Classes', href: '/classes' },
		{ label: data.cls.name, href: `/classes/${data.cls.id}` },
		{ label: exam.title }
	]}
>
	{#snippet actions()}
		{#if isPublished}<Button variant="secondary" href="/exams/{exam.id}/results">Results</Button>{/if}
		<Button variant="secondary" disabled={!dirty} loading={busy} onclick={onSave}>Save</Button>
		{#if isPublished}
			<Button variant="secondary" disabled={busy} onclick={unpublish}>Unpublish</Button>
		{:else}
			<Button loading={busy} onclick={publish}>Publish exam</Button>
		{/if}
	{/snippet}
</PageHeader>

{#if error}<p class="banner error" role="alert">{error}</p>{/if}
{#if problems.length}
	<div class="banner problems" role="alert">
		<strong>This exam can’t be published yet:</strong>
		<ul>{#each problems as p}<li>{p}</li>{/each}</ul>
	</div>
{/if}

<div class="layout">
	<div class="main">
		<Section title="Details">
			<TextField label="Title" bind:value={form.title} />
			<TextArea label="Instructions for students" bind:value={form.instructions} />
		</Section>

		<Section title="Timing" subtitle="Control how long students get and when the exam is available. Times are in Vienna time.">
			<div class="row">
				<TextField label="Time limit (minutes)" type="number" min={1} max={240} bind:value={form.minutes} />
				<TextField label="Exam opens" type="datetime-local" bind:value={form.opensAt} />
				<TextField label="Exam over (results visible)" type="datetime-local" bind:value={form.closesAt} />
			</div>
			<p class="note">
				When time is up, a student’s current arrangement is submitted automatically. After “Exam over”, nobody can start the
				exam any more – students still working may finish – and everyone can see the solutions.
			</p>
		</Section>

		<Section title="Puzzle options" subtitle="Choose how much help students get.">
			<Checkbox label="Students set the indentation themselves" bind:checked={form.studentsIndent} disabled={!isDraft}>
				On: pieces arrive without indentation and students indent each line (⇤ ⇥) – for advanced classes. Off: indentation is
				already set and students only reorder the lines – better for beginners.
				{#if !isDraft}<br /><em>Locked once the exam is published.</em>{/if}
			</Checkbox>
		</Section>

		<Section title="Puzzles" subtitle="Students solve these in order.">
			{#if data.puzzles.length === 0}
				<p class="muted">No puzzles yet.</p>
			{:else}
				<ol class="puzzles">
					{#each data.puzzles as p, i (p.id)}
						<li>
							<span class="num">{i + 1}</span>
							<div class="grow">
								<strong>{p.title}</strong>
								<span class="muted">
									{p.solutionLineCount} lines · {p.redHerringCount === 0 ? 'no red herrings' : `${p.redHerringCount} red ${p.redHerringCount === 1 ? 'herring' : 'herrings'}`}
								</span>
							</div>
							<button class="icon" aria-label="Move up" disabled={i === 0} onclick={() => movePuzzle(i, -1)}>▲</button>
							<button class="icon" aria-label="Move down" disabled={i === data.puzzles.length - 1} onclick={() => movePuzzle(i, 1)}>▼</button>
							<Button variant="ghost" href="/puzzles/{p.id}">Edit</Button>
							<Button variant="danger" onclick={() => deletePuzzle(p.id)}>Delete</Button>
						</li>
					{/each}
				</ol>
			{/if}
			{#if imported}<p class="note" role="status">{imported}</p>{/if}
			<div class="buttons">
				<Button variant="secondary" href="/exams/{exam.id}/puzzles/new">+ Add puzzle</Button>
				<Button variant="secondary" onclick={() => fileInput?.click()}>Import from JSON</Button>
				<input bind:this={fileInput} type="file" accept=".json,application/json" hidden onchange={importFile} />
			</div>
		</Section>
	</div>

	<aside>
		<Section title="Access code" subtitle="Give this code to your students.">
			<div class="code" aria-label="Access code {exam.accessCode}">{exam.accessCode}</div>
			<div class="buttons">
				<Button variant="secondary" onclick={copy}>{copied ? 'Copied ✓' : 'Copy code'}</Button>
				<Button variant="ghost" disabled={busy} onclick={regenerate}>New code</Button>
			</div>
		</Section>
		<Section title="Status">
			<div class="status"><StatusBadge status={exam.status} /><span class="muted">{statusText}</span></div>
		</Section>
		<Section title="Delete exam">
			<Button variant="danger" disabled={busy} onclick={deleteExam}>{confirmDelete ? 'Click again to delete' : 'Delete exam'}</Button>
		</Section>
	</aside>
</div>

<style>
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		gap: 24px;
		align-items: start;
	}
	.main,
	aside {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.row {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
	}
	.note {
		padding: 12px;
		border-radius: 8px;
		background: var(--primary-soft);
		color: var(--primary-dark);
		font-size: 13px;
		line-height: 1.5;
	}
	.muted {
		color: var(--text-muted);
		font-size: 13px;
	}
	.puzzles {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.puzzles li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
	}
	.num {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--primary-soft);
		color: var(--primary);
		font-weight: 600;
		font-size: 13px;
	}
	.grow {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.icon {
		width: 32px;
		height: 32px;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: var(--surface);
		color: var(--text-muted);
		font-size: 11px;
		cursor: pointer;
	}
	.icon:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.code {
		padding: 18px 0;
		border-radius: 10px;
		background: var(--code-bg);
		color: var(--code-text);
		font: 700 30px var(--font-mono);
		text-align: center;
	}
	.buttons {
		display: flex;
		gap: 8px;
	}
	.status {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.banner {
		margin-bottom: 20px;
		padding: 12px 16px;
		border-radius: 10px;
		font-size: 14px;
	}
	.error {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.problems {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.problems ul {
		margin: 6px 0 0;
		padding-left: 20px;
	}
	@media (max-width: 1100px) {
		.layout {
			grid-template-columns: 1fr;
		}
		.row {
			grid-template-columns: 1fr;
		}
	}
</style>

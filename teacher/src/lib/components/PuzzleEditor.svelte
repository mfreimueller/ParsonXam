<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { tick, untrack } from 'svelte';
	import { api, ApiError } from '#lib/api.js';
	import { parsePastedCode } from '#lib/code_paste.js';
	import { shuffled } from '#lib/shuffle.js';
	import type { ClassView, ExamView, PuzzleView } from '#lib/types.js';
	import Button from './Button.svelte';
	import PageHeader from './PageHeader.svelte';
	import Section from './Section.svelte';
	import TextArea from './TextArea.svelte';
	import TextField from './TextField.svelte';

	interface Props {
		exam: ExamView;
		cls: ClassView;
		puzzle: PuzzleView | null;
	}
	let { exam, cls, puzzle }: Props = $props();

	interface Row {
		key: number;
		id?: string;
		code: string;
		indent: number;
	}
	let nextKey = 1;
	const toRows = (lines: { id: string; code: string; indent: number }[]): Row[] =>
		lines.map((l) => ({ key: nextKey++, id: l.id, code: l.code, indent: l.indent }));

	// The editor owns its state; it starts from the puzzle it was opened with.
	let title = $state(untrack(() => puzzle?.title ?? ''));
	let description = $state(untrack(() => puzzle?.description ?? ''));
	let solution = $state<Row[]>(
		untrack(() => (puzzle ? toRows(puzzle.solution) : [{ key: nextKey++, code: '', indent: 0 }]))
	);
	let herrings = $state<Row[]>(untrack(() => toRows(puzzle?.redHerrings ?? [])));

	let saving = $state(false);
	let saved = $state(false);
	let error = $state<string | null>(null);
	let seed = $state(1);

	const snapshot = () => JSON.stringify([title, description, solution, herrings]);
	let baseline = $state(untrack(snapshot));
	const dirty = $derived(snapshot() !== baseline);

	beforeNavigate((nav) => {
		if (dirty && !saving && !confirm('You have unsaved changes. Leave without saving?')) nav.cancel();
	});

	const blank = (r: Row) => r.code.trim() === '';
	const filled = $derived(solution.filter((r) => !blank(r)));
	const filledHerrings = $derived(herrings.filter((r) => !blank(r)));

	function focusRow(key: number) {
		tick().then(() => document.querySelector<HTMLInputElement>(`[data-row="${key}"]`)?.focus());
	}

	function addRow(list: Row[], at: number) {
		const row: Row = { key: nextKey++, code: '', indent: list[at]?.indent ?? 0 };
		list.splice(at + 1, 0, row);
		focusRow(row.key);
	}

	function remove(list: Row[], i: number) {
		list.splice(i, 1);
	}

	function move(list: Row[], i: number, delta: number) {
		const j = i + delta;
		if (j < 0 || j >= list.length) return;
		[list[i], list[j]] = [list[j]!, list[i]!];
	}

	function shift(row: Row, delta: number) {
		row.indent = Math.max(0, Math.min(6, row.indent + delta));
	}

	function transfer(from: Row[], to: Row[], i: number) {
		const [row] = from.splice(i, 1);
		if (row) to.push(row);
	}

	function onPaste(e: ClipboardEvent, list: Row[], i: number) {
		const text = e.clipboardData?.getData('text') ?? '';
		if (!/\r?\n/.test(text.trim())) return; // single line: normal paste
		e.preventDefault();
		const parsed = parsePastedCode(text);
		if (parsed.length === 0) return;
		const rows = parsed.map((p) => ({ key: nextKey++, code: p.code, indent: p.indent }));
		const replaceCurrent = blank(list[i]!);
		list.splice(replaceCurrent ? i : i + 1, replaceCurrent ? 1 : 0, ...rows);
	}

	function onKey(e: KeyboardEvent, list: Row[], i: number) {
		const row = list[i]!;
		if (e.key === 'Enter') {
			e.preventDefault();
			addRow(list, i);
		} else if (e.key === 'Backspace' && row.code === '' && list.length > 1) {
			e.preventDefault();
			remove(list, i);
			const prev = list[Math.max(0, i - 1)];
			if (prev) focusRow(prev.key);
		} else if (e.key === 'Tab' && !e.altKey) {
			e.preventDefault();
			shift(row, e.shiftKey ? -1 : 1);
		}
	}

	const preview = $derived(
		shuffled(
			[...filled, ...filledHerrings].map((r) => ({ key: r.key, code: r.code, indent: r.indent })),
			seed
		)
	);

	async function save() {
		error = null;
		if (title.trim() === '') {
			error = 'Please give the puzzle a title.';
			return;
		}
		saving = true;
		try {
			const body = {
				title,
				description,
				solution: filled.map((r) => ({ id: r.id, code: r.code, indent: r.indent })),
				redHerrings: filledHerrings.map((r) => ({ id: r.id, code: r.code, indent: r.indent }))
			};
			if (puzzle) {
				const res = await api<{ puzzle: PuzzleView }>(`/teacher/puzzles/${puzzle.id}`, { method: 'PUT', body });
				solution = toRows(res.puzzle.solution);
				herrings = toRows(res.puzzle.redHerrings);
				baseline = snapshot();
				saved = true;
				setTimeout(() => (saved = false), 2500);
			} else {
				await api(`/teacher/exams/${exam.id}/puzzles`, { method: 'POST', body });
				baseline = snapshot();
				await goto(`/exams/${exam.id}`);
			}
		} catch (err) {
			error = err instanceof ApiError ? err.message.replace(/^[a-zA-Z.\[\]0-9]+: /, '') : 'Something went wrong.';
		} finally {
			saving = false;
		}
	}
</script>

<PageHeader
	title={puzzle ? puzzle.title || 'Puzzle' : 'New puzzle'}
	crumbs={[
		{ label: 'Classes', href: '/classes' },
		{ label: cls.name, href: `/classes/${cls.id}` },
		{ label: exam.title, href: `/exams/${exam.id}` },
		{ label: puzzle ? 'Edit puzzle' : 'New puzzle' }
	]}
>
	{#snippet actions()}
		<Button variant="secondary" href="/exams/{exam.id}">{dirty ? 'Cancel' : 'Back'}</Button>
		<Button loading={saving} onclick={save}>{saved ? 'Saved ✓' : 'Save puzzle'}</Button>
	{/snippet}
</PageHeader>

{#if error}<p class="banner" role="alert">{error}</p>{/if}

{#snippet rowList(list: Row[], herring: boolean)}
	<ol class="lines">
		{#each list as row, i (row.key)}
			<li class:herring>
				<span class="num" aria-hidden="true">{herring ? '✕' : i + 1}</span>
				<input
					class="code"
					data-row={row.key}
					aria-label="{herring ? 'Red herring' : 'Line'} {i + 1}"
					placeholder={herring ? 'A line that looks right but does not belong' : 'Type a line of code'}
					spellcheck="false"
					autocomplete="off"
					style:padding-left="{12 + row.indent * 20}px"
					bind:value={row.code}
					onkeydown={(e) => onKey(e, list, i)}
					onpaste={(e) => onPaste(e, list, i)}
				/>
				<div class="tools">
					<button class="tool" aria-label="Move up" disabled={i === 0} onclick={() => move(list, i, -1)}>↑</button>
					<button class="tool" aria-label="Move down" disabled={i === list.length - 1} onclick={() => move(list, i, 1)}>↓</button>
					<button class="tool" aria-label="Indent less" disabled={row.indent === 0} onclick={() => shift(row, -1)}>⇤</button>
					<button class="tool" aria-label="Indent more" disabled={row.indent === 6} onclick={() => shift(row, 1)}>⇥</button>
					<button
						class="tool wide"
						aria-label={herring ? 'Move to solution' : 'Make red herring'}
						title={herring ? 'This line belongs in the solution' : 'This line does not belong'}
						onclick={() => (herring ? transfer(herrings, solution, i) : transfer(solution, herrings, i))}
						>{herring ? '→ Solution' : '→ Herring'}</button
					>
					<button class="tool del" aria-label="Delete line" onclick={() => remove(list, i)}>×</button>
				</div>
			</li>
		{/each}
	</ol>
{/snippet}

<div class="layout">
	<div class="main">
		<Section title="Task">
			<TextField label="Puzzle title" bind:value={title} placeholder="Sum of 1 to N with a for loop" />
			<TextArea label="Task description" bind:value={description} placeholder="Read n and print the sum of all numbers from 1 to n." />
		</Section>

		<Section
			title="Solution (correct order)"
			subtitle="Type each line and set its indentation. Students must rebuild exactly this order. Paste a whole program to split it into lines."
		>
			{@render rowList(solution, false)}
			<div><Button variant="secondary" onclick={() => addRow(solution, solution.length - 1)}>+ Add line</Button></div>
			{#if filled.length < 2}<p class="hint">A puzzle needs at least two lines before the exam can be published.</p>{/if}
		</Section>

		<Section title="Red herrings" subtitle="Extra lines that look plausible but do not belong. They are mixed in with the real pieces.">
			{@render rowList(herrings, true)}
			<div><Button variant="secondary" onclick={() => addRow(herrings, herrings.length - 1)}>+ Add red herring</Button></div>
		</Section>
	</div>

	<aside>
		<Section title="Student preview" subtitle="Pieces are shuffled for each student. Red herrings look identical.">
			<ul class="preview" aria-label="Preview of the shuffled pieces">
				{#each preview as p (p.key)}
					<li style:padding-left="{12 + (exam.studentsIndent ? 0 : p.indent) * 16}px"><span aria-hidden="true">⠿</span> {p.code}</li>
				{:else}
					<li class="empty">Add some lines to see the pieces.</li>
				{/each}
			</ul>
			<div class="meta">
				<span>{preview.length} pieces · {filled.length} needed</span>
				<button class="link" onclick={() => (seed += 1)}>Shuffle again</button>
			</div>
			<p class="note">
				{exam.studentsIndent
					? 'Students indent lines themselves (exam setting), so pieces are shown without indentation.'
					: 'Indentation is pre-set for students. Change this in the exam settings.'}
			</p>
		</Section>
	</aside>
</div>

<style>
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 380px;
		gap: 24px;
		align-items: start;
	}
	.main,
	aside {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.lines {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.num {
		width: 20px;
		color: var(--text-muted);
		font: 12px var(--font-mono);
		text-align: center;
	}
	.herring .num {
		color: var(--warn);
	}
	.code {
		flex: 1;
		min-width: 0;
		height: 40px;
		padding-right: 12px;
		border: 1px solid transparent;
		border-radius: 8px;
		background: var(--code-bg);
		color: var(--code-text);
		font: 13px var(--font-mono);
	}
	.herring .code {
		border: 1px dashed var(--warn);
		background: var(--warn-soft);
		color: var(--text);
	}
	.code::placeholder {
		color: var(--code-muted);
		font-family: var(--font-sans);
	}
	.herring .code::placeholder {
		color: var(--text-muted);
	}
	.tools {
		display: flex;
		gap: 4px;
	}
	.tool {
		min-width: 32px;
		height: 32px;
		padding: 0 6px;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: var(--surface);
		color: var(--text-muted);
		font-size: 14px;
		cursor: pointer;
	}
	.tool.wide {
		font-size: 11px;
		white-space: nowrap;
	}
	.tool:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.tool.del {
		border-color: transparent;
		background: var(--danger-soft);
		color: var(--danger);
		font-size: 18px;
	}
	.hint {
		color: var(--warn);
		font-size: 13px;
	}
	.preview {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.preview li {
		padding: 10px 12px;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: var(--surface);
		font: 13px var(--font-mono);
		white-space: pre;
	}
	.preview li span {
		margin-right: 8px;
		color: #9a9ca5;
	}
	.preview .empty {
		border-style: dashed;
		color: var(--text-muted);
		font-family: var(--font-sans);
		white-space: normal;
	}
	.meta {
		display: flex;
		justify-content: space-between;
		color: var(--text-muted);
		font-size: 12px;
	}
	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--primary);
		font-size: 12px;
		cursor: pointer;
	}
	.note {
		padding: 10px 12px;
		border-radius: 8px;
		background: var(--primary-soft);
		color: var(--primary-dark);
		font-size: 12px;
		line-height: 1.5;
	}
	.banner {
		margin-bottom: 20px;
		padding: 12px 16px;
		border-radius: 10px;
		background: var(--danger-soft);
		color: var(--danger);
	}
	@media (max-width: 1100px) {
		.layout {
			grid-template-columns: 1fr;
		}
		.tools .tool:not(.del):not(.wide) {
			display: none;
		}
	}
</style>

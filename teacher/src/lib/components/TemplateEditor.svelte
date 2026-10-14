<script lang="ts">
	import { tick } from 'svelte';
	import { shuffled } from '#lib/shuffle.js';
	import { buildPool, normalisePiece, parseTemplate } from '#lib/template.js';
	import { pieceRows, toggleAnyOrder, wrapSelection, type Edit } from '#lib/template_editor.js';
	import Button from './Button.svelte';
	import Section from './Section.svelte';

	interface Props {
		/** The source with {{ }} markers. */
		template: string;
		/** Red herrings, one per line. */
		herringText: string;
		/** Texts of the pieces that can be used more than once. */
		reusable: string[];
	}
	let { template = $bindable(), herringText = $bindable(), reusable = $bindable() }: Props = $props();

	let box = $state<HTMLTextAreaElement>();
	let seed = $state(1);

	const parsed = $derived(parseTemplate(template));
	const herrings = $derived(herringText.split('\n').map(normalisePiece).filter(Boolean));
	const rows = $derived(pieceRows(parsed.pieces, herrings));
	const pool = $derived(buildPool(parsed, herrings, reusable));
	const problems = $derived([
		...parsed.errors.map((e) => `Line ${e.line}: ${e.message}`),
		...pool.errors
	]);
	const preview = $derived(shuffled(pool.tiles.map((t, i) => ({ ...t, key: i })), seed));
	const gapCount = $derived(parsed.gaps.length);

	// A text that is no longer in the template or the red herrings cannot stay reusable.
	$effect(() => {
		const known = new Set(rows.map((r) => r.text));
		if (reusable.some((r) => !known.has(r))) reusable = reusable.filter((r) => known.has(r));
	});

	function toggleReusable(text: string, on: boolean) {
		reusable = on ? [...reusable, text] : reusable.filter((r) => r !== text);
	}

	async function apply(edit: Edit | null) {
		if (!edit || !box) return;
		template = edit.text;
		await tick();
		box.focus();
		box.setSelectionRange(edit.start, edit.end);
	}

	const mark = () => box && apply(wrapSelection(template, box.selectionStart, box.selectionEnd));
	const anyOrder = () => box && apply(toggleAnyOrder(template, box.selectionStart));

	let hasSelection = $state(false);
	const syncSelection = () => (hasSelection = !!box && box.selectionStart !== box.selectionEnd);
</script>

{#snippet code(mode: 'solution' | 'student')}
	<div class="code" role="group" aria-label={mode === 'solution' ? 'Solution' : 'Student view'}>
		{#each parsed.lines as line}
			<div class="line">
				{#each line as seg}
					{#if 'text' in seg}
						<span class="fixed">{seg.text}</span>
					{:else}
						{@const gap = parsed.gaps[seg.gap]!}
						<span class="gap" class:any={mode === 'solution' && gap.anyOrder} class:blank={mode === 'student' || gap.expected.length === 0}>
							{#if mode === 'solution'}
								{#if gap.anyOrder}<span class="tag" title="Any order">~</span>{/if}
								{#each gap.expected as e}<span class="chip">{e}</span>{:else}<span class="none">empty</span>{/each}
							{/if}
						</span>
					{/if}
				{/each}
				{#if line.length === 0}<span class="fixed">&nbsp;</span>{/if}
			</div>
		{/each}
	</div>
{/snippet}

<div class="layout">
	<div class="main">
		<Section
			title="Code template"
			subtitle="Write the real solution. Select a piece of code and press “Mark as piece”: it becomes a draggable piece and leaves a gap."
		>
			<div class="toolbar">
				<Button variant="secondary" disabled={!hasSelection} onclick={mark}>Mark as piece</Button>
				<Button variant="secondary" onclick={anyOrder}>Any order</Button>
				<span class="hint">“Any order” toggles ~ on the gap at the cursor: its pieces may be placed in any order.</span>
			</div>
			<textarea
				bind:this={box}
				bind:value={template}
				class="source"
				rows="16"
				aria-label="Code template"
				spellcheck="false"
				autocomplete="off"
				onselect={syncSelection}
				onkeyup={syncSelection}
				onmouseup={syncSelection}
				onblur={syncSelection}
				placeholder={'@Entity\npublic class Order {\n    {{~@Id}} {{@GeneratedValue}}\n    private Long id;\n}'}
			></textarea>
			{#if problems.length}
				<ul class="errors" role="alert">
					{#each problems as p}<li>{p}</li>{/each}
				</ul>
			{:else if template.trim() === ''}
				<p class="hint">Mark pieces with {'{{'}piece{'}}'}. {'{{}}'} is a gap that must stay empty. Markers next to each other form one gap.</p>
			{/if}
			<details>
				<summary>Syntax</summary>
				<ul class="syntax">
					<li><code>{'{{text}}'}</code> one piece; markers separated only by blanks form one gap.</li>
					<li><code>{'{{}}'}</code> a gap that stays empty (a decoy).</li>
					<li><code>{'{{~a}} {{b}}'}</code> any-order gap.</li>
					<li><code>\{'{{'}</code> a literal {'{{'} in fixed text; inside a marker <code>\{'}}'}</code> and a leading <code>\~</code>.</li>
					<li>Up to 80 lines, 30 gaps, 60 pieces.</li>
				</ul>
			</details>
		</Section>

		<Section title="Pieces" subtitle="Tick “reusable” for pieces students may place more than once, such as SELECT or a closing bracket.">
			{#if rows.length === 0}
				<p class="hint">No pieces yet.</p>
			{:else}
				<ul class="pieces">
					{#each rows as r (r.text)}
						<li>
							<code>{r.text}</code>
							{#if r.herring}<span class="badge herring">red herring</span>
							{:else if r.count > 1}<span class="badge">× {r.count}</span>{/if}
							<label>
								<input type="checkbox" checked={reusable.includes(r.text)} onchange={(e) => toggleReusable(r.text, e.currentTarget.checked)} />
								reusable
							</label>
						</li>
					{/each}
				</ul>
			{/if}
		</Section>

		<Section title="Red herrings" subtitle="Extra pieces that look plausible but belong nowhere. One per line.">
			<textarea
				bind:value={herringText}
				class="source small"
				rows="4"
				aria-label="Red herrings"
				spellcheck="false"
				placeholder={'GROUP BY\nHAVING'}
			></textarea>
		</Section>
	</div>

	<aside>
		<Section title="Solution preview" subtitle="Each gap with the pieces it expects.">
			{@render code('solution')}
			<p class="meta">{gapCount} {gapCount === 1 ? 'gap' : 'gaps'} · {parsed.pieces.length} solution pieces</p>
		</Section>
		<Section title="Student preview" subtitle="Students see empty gaps and a shuffled pool. ∞ marks reusable pieces.">
			{@render code('student')}
			<ul class="pool" aria-label="Preview of the pool">
				{#each preview as t (t.key)}
					<li class="chip">{t.text}{#if t.reusable}<span class="inf" aria-hidden="true">∞</span>{/if}</li>
				{:else}
					<li class="none">Mark some pieces to see the pool.</li>
				{/each}
			</ul>
			<div class="meta">
				<span>{preview.length} pieces in the pool</span>
				<button class="link" onclick={() => (seed += 1)}>Shuffle again</button>
			</div>
		</Section>
	</aside>
</div>

<style>
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 420px;
		gap: 24px;
		align-items: start;
	}
	.main,
	aside {
		display: flex;
		flex-direction: column;
		gap: 24px;
		min-width: 0;
	}
	.toolbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
	}
	.hint {
		color: var(--text-muted);
		font-size: 13px;
	}
	.source {
		width: 100%;
		padding: 12px;
		border: 1px solid transparent;
		border-radius: 8px;
		background: var(--code-bg);
		color: var(--code-text);
		font: 13px/1.6 var(--font-mono);
		tab-size: 4;
		white-space: pre;
		overflow: auto;
		resize: vertical;
	}
	.source.small {
		background: var(--warn-soft);
		border: 1px dashed var(--warn);
		color: var(--text);
	}
	.source::placeholder {
		color: var(--code-muted);
	}
	.errors {
		margin: 0;
		padding: 10px 12px 10px 28px;
		border-radius: 8px;
		background: var(--danger-soft);
		color: var(--danger);
		font-size: 13px;
	}
	details {
		color: var(--text-muted);
		font-size: 13px;
	}
	summary {
		cursor: pointer;
	}
	.syntax {
		margin: 8px 0 0;
		padding-left: 20px;
		line-height: 1.7;
	}
	code {
		font: 13px var(--font-mono);
	}
	.pieces {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.pieces li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: var(--surface);
	}
	.pieces code {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.pieces label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		cursor: pointer;
	}
	.badge {
		padding: 2px 8px;
		border-radius: 100px;
		background: var(--surface-alt);
		color: var(--text-muted);
		font-size: 11px;
		font-weight: 600;
	}
	.badge.herring {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.code {
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface);
		font: 13px/2.2 var(--font-mono);
		overflow-wrap: anywhere;
	}
	.line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		min-height: 2.2em;
	}
	.fixed {
		white-space: pre-wrap;
	}
	.gap {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
		min-width: 48px;
		min-height: 28px;
		margin: 0 3px;
		padding: 1px 4px;
		border: 1px solid var(--primary);
		border-radius: 6px;
		background: var(--primary-soft);
		line-height: 1.2;
	}
	.gap.blank {
		border: 1px dashed var(--border-strong);
		background: var(--bg);
	}
	.gap.any {
		border-style: dashed;
	}
	.tag {
		color: var(--primary);
		font-weight: 700;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 24px;
		padding: 0 8px;
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		background: var(--surface);
		font: 12px var(--font-mono);
	}
	.inf {
		color: var(--primary);
		font-weight: 700;
	}
	.none {
		color: var(--text-muted);
		font: italic 12px var(--font-sans);
	}
	.pool {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
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
	@media (max-width: 1100px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>

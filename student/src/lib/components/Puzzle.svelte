<script lang="ts">
	import { untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { dragHandle, dragHandleZone, setKeyboardDragTrigger } from 'svelte-dnd-action';
	import type { Piece, Placed } from '#lib/attempt.js';

	interface Props {
		pieces: Piece[];
		placed: Placed[];
		/** true: pieces arrive flat and the student indents them. false: indentation is part of the piece. */
		studentsIndent: boolean;
		disabled?: boolean;
		onchange: (placed: Placed[]) => void;
	}
	let { pieces, placed, studentsIndent, disabled = false, onchange }: Props = $props();

	interface Item {
		id: string;
		code: string;
		indent: number;
	}

	const MAX_INDENT = 6;
	const FLIP_MS = 150;

	// Space picks a piece up for keyboard dragging; Enter is free to move it between the lists.
	setKeyboardDragTrigger('space');

	function initial() {
		const byId = new Map(pieces.map((p) => [p.pieceId, p]));
		const used = new Set<string>();
		const inSolution: Item[] = [];
		for (const s of placed) {
			const p = byId.get(s.pieceId);
			if (!p || used.has(s.pieceId)) continue;
			used.add(s.pieceId);
			inSolution.push({ id: p.pieceId, code: p.code, indent: studentsIndent ? s.indent : (p.indent ?? 0) });
		}
		const inPool = pieces
			.filter((p) => !used.has(p.pieceId))
			.map((p) => ({ id: p.pieceId, code: p.code, indent: studentsIndent ? 0 : (p.indent ?? 0) }));
		return { inPool, inSolution };
	}

	const start = untrack(initial);
	let pool = $state<Item[]>(start.inPool);
	let solution = $state<Item[]>(start.inSolution);

	// During a drag the library adds a placeholder; it must not be counted or saved.
	const real = (items: Item[]) => items.filter((i) => !(i as Item & { isDndShadowItem?: boolean }).isDndShadowItem);

	function emit() {
		onchange(real(solution).map((i) => ({ pieceId: i.id, indent: i.indent })));
	}

	function resetPoolIndent(items: Item[]): Item[] {
		return studentsIndent ? items.map((i) => ({ ...i, indent: 0 })) : items;
	}

	const considerPool = (e: CustomEvent<{ items: Item[] }>) => (pool = e.detail.items);
	const finalizePool = (e: CustomEvent<{ items: Item[] }>) => {
		pool = resetPoolIndent(e.detail.items);
		emit();
	};
	const considerSolution = (e: CustomEvent<{ items: Item[] }>) => (solution = e.detail.items);
	const finalizeSolution = (e: CustomEvent<{ items: Item[] }>) => {
		solution = e.detail.items;
		emit();
	};

	function toSolution(item: Item) {
		if (disabled) return;
		pool = pool.filter((i) => i.id !== item.id);
		solution = [...solution, item];
		emit();
	}

	function toPool(item: Item) {
		if (disabled) return;
		solution = solution.filter((i) => i.id !== item.id);
		pool = [...pool, { ...item, indent: studentsIndent ? 0 : item.indent }];
		emit();
	}

	function shift(item: Item, delta: number) {
		if (disabled) return;
		item.indent = Math.max(0, Math.min(MAX_INDENT, item.indent + delta));
		emit();
	}

	function onKey(e: KeyboardEvent, item: Item, inSolution: boolean) {
		if (disabled || (e.target as HTMLElement).closest('.indent')) return;
		if (e.key === 'Enter') {
			e.preventDefault();
			if (inSolution) toPool(item);
			else toSolution(item);
		} else if (inSolution && studentsIndent && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.altKey) {
			e.preventDefault();
			shift(item, e.key === 'ArrowRight' ? 1 : -1);
		}
	}

	const zoneOptions = (items: Item[]) => ({
		items,
		flipDurationMs: FLIP_MS,
		type: 'piece',
		dragDisabled: disabled,
		delayTouchStart: true,
		dropTargetClasses: ['over'],
		dropTargetStyle: {}
	});
</script>

{#snippet inner(item: Item, inSolution: boolean, position: number)}
	<span class="grip" use:dragHandle aria-label="{item.code}{inSolution ? `, position ${position}` : ''}, drag handle">
		<svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true">
			<g fill="currentColor">
				<circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" />
				<circle cx="3" cy="8" r="1.5" /><circle cx="9" cy="8" r="1.5" />
				<circle cx="3" cy="13" r="1.5" /><circle cx="9" cy="13" r="1.5" />
			</g>
		</svg>
	</span>
	<span class="code" style:padding-left="{!studentsIndent || inSolution ? item.indent * 24 : 0}px">{item.code}</span>
	{#if studentsIndent && inSolution && !disabled}
		<span class="indent">
			<button type="button" aria-label="Indent less" disabled={item.indent === 0} onclick={(e) => { e.stopPropagation(); shift(item, -1); }}>⇤</button>
			<button type="button" aria-label="Indent more" disabled={item.indent === MAX_INDENT} onclick={(e) => { e.stopPropagation(); shift(item, 1); }}>⇥</button>
		</span>
	{/if}
{/snippet}

<p class="sr" id="dnd-help">
	Drag a piece by its handle, or tap it to move it between the lists. With a keyboard: focus a handle, press Space to pick
	a piece up, use the arrow keys to move it, Space to drop it, or Enter to move it to the other list.
</p>

<div class="columns">
	<section class="column" aria-labelledby="pool-title">
		<header>
			<h2 id="pool-title">Pieces</h2>
			<span>{real(pool).length} left</span>
		</header>
		<div
			class="zone pool"
			class:empty={pool.length === 0}
			aria-label="Pieces"
			data-testid="pool"
			use:dragHandleZone={zoneOptions(pool)}
			onconsider={considerPool}
			onfinalize={finalizePool}
		>
			{#each pool as item (item.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div
					class="piece"
					class:locked={disabled}
					aria-label={item.code}
					onclick={() => toSolution(item)}
					onkeydown={(e) => onKey(e, item, false)}
					animate:flip={{ duration: FLIP_MS }}
				>
					{@render inner(item, false, 0)}
				</div>
			{/each}
		</div>
	</section>

	<section class="column mine" aria-labelledby="solution-title">
		<header>
			<h2 id="solution-title">Your solution</h2>
			<span>{real(solution).length} placed</span>
		</header>
		<div
			class="zone solution"
			class:empty={solution.length === 0}
			aria-label="Your solution"
			data-testid="solution"
			use:dragHandleZone={zoneOptions(solution)}
			onconsider={considerSolution}
			onfinalize={finalizeSolution}
		>
			{#each solution as item, i (item.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div
					class="piece"
					class:locked={disabled}
					aria-label={item.code}
					onclick={() => toPool(item)}
					onkeydown={(e) => onKey(e, item, true)}
					animate:flip={{ duration: FLIP_MS }}
				>
					{@render inner(item, true, i + 1)}
				</div>
			{/each}
		</div>
	</section>
</div>

<style>
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.columns {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 24px;
		align-items: start;
	}
	.column {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 20px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--surface);
	}
	.column.mine {
		border: 1px dashed var(--primary);
		background: var(--bg);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	h2 {
		font-size: 15px;
		font-weight: 600;
	}
	header span {
		color: var(--text-muted);
		font-size: 12px;
	}
	.zone {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-height: 220px;
		padding-bottom: 4px;
		border-radius: 10px;
	}
	.zone.empty::before {
		content: attr(aria-label) '';
		display: none;
	}
	.solution.empty {
		display: grid;
		place-items: center;
		border: 1px dashed var(--primary);
		background: var(--primary-soft);
	}
	.solution.empty::after {
		content: 'Drop here';
		color: var(--primary);
		font-size: 13px;
		font-weight: 500;
	}
	.zone :global(.over) {
		outline: 2px dashed var(--primary);
		outline-offset: 2px;
	}
	.piece {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 48px;
		padding: 0 14px 0 0;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: var(--surface);
		font: 13px var(--font-mono);
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}
	.piece:has(.grip:focus-visible) {
		outline: 2px solid var(--primary);
	}
	.locked {
		cursor: default;
	}
	.grip {
		display: grid;
		place-items: center;
		flex: none;
		width: 40px;
		align-self: stretch;
		color: #9a9ca5;
		cursor: grab;
		touch-action: none;
	}
	.grip:active {
		cursor: grabbing;
	}
	.code {
		flex: 1;
		min-width: 0;
		white-space: pre;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.indent {
		display: flex;
		gap: 4px;
	}
	.indent button {
		width: 36px;
		height: 36px;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: var(--surface);
		color: var(--text-muted);
		font-size: 15px;
		cursor: pointer;
	}
	.indent button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	@media (max-width: 700px) {
		.columns {
			grid-template-columns: 1fr;
			gap: 12px;
		}
		.zone {
			min-height: 120px;
		}
	}
</style>

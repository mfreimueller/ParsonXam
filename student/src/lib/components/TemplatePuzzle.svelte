<script lang="ts">
	import { untrack } from 'svelte';
	import { dndzone, setKeyboardDragTrigger } from 'svelte-dnd-action';
	import type { Segment } from '#lib/attempt.js';
	import {
		addToGap,
		initBoard,
		moveInGap,
		real,
		refillPool,
		removeFromGap,
		setGap,
		tidyPool,
		toGaps,
		type Board,
		type Chip,
		type Gaps,
		type Tile
	} from '#lib/template_state.js';

	interface Props {
		lines: Segment[][];
		pieces: Tile[];
		placed: Gaps;
		onchange: (gaps: Gaps) => void;
	}
	let { lines, pieces, placed, onchange }: Props = $props();

	const FLIP_MS = 120;
	const gapCount = untrack(() => 1 + Math.max(-1, ...lines.flat().map((s) => ('gap' in s ? s.gap : -1))));

	// Space picks a chip up for keyboard dragging; Enter is free to move it between pool and gap.
	setKeyboardDragTrigger('space');

	let board = $state<Board>(untrack(() => initBoard(pieces, gapCount, placed)));
	// The gap that receives a chip when the student taps or presses Enter on a pool chip.
	let selected = $state(0);

	function commit(next: Board) {
		board = next;
		onchange(toGaps(next));
	}

	const considerPool = (e: CustomEvent<{ items: Chip[] }>) => (board = { ...board, pool: refillPool(board.pool, e.detail.items) });
	const finalizePool = (e: CustomEvent<{ items: Chip[] }>) => commit({ ...board, pool: tidyPool(e.detail.items) });
	const considerGap = (g: number, e: CustomEvent<{ items: Chip[] }>) => (board = setGap(board, g, e.detail.items));
	const finalizeGap = (g: number, e: CustomEvent<{ items: Chip[] }>) => commit(setGap(board, g, real(e.detail.items)));

	function onPoolKey(e: KeyboardEvent, chip: Chip) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		commit(addToGap(board, chip.id, selected));
	}

	function onPlacedKey(e: KeyboardEvent, g: number, chip: Chip) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commit(removeFromGap(board, g, chip.id));
		} else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
			e.preventDefault();
			commit(moveInGap(board, g, chip.id, e.key === 'ArrowRight' ? 1 : -1));
		}
	}

	const zone = (items: Chip[]) => ({
		items,
		flipDurationMs: FLIP_MS,
		type: 'chip',
		delayTouchStart: true,
		dropTargetClasses: ['over'],
		dropTargetStyle: {}
	});
</script>

<p class="sr">
	Tap a gap to select it, then tap a piece to put it there. Tap a placed piece to take it back. Or drag pieces into the gaps.
	With a keyboard: focus a gap or piece, press Enter to place or return a piece, Space to pick it up and the arrow keys to
	move it, and Alt with the left or right arrow to reorder pieces inside a gap.
</p>

<div class="layout">
	<div class="code" role="group" aria-label="Code with gaps">
		{#each lines as line}
			<div class="line">
				{#each line as seg}
					{#if 'text' in seg}
						<span class="fixed">{seg.text}</span>
					{:else}
						{@const g = seg.gap}
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
						<span
							class="gap"
							class:selected={selected === g}
							class:empty={board.gaps[g]?.length === 0}
							role="group"
							aria-label="Gap {g + 1}"
							data-testid="gap-{g}"
							use:dndzone={zone(board.gaps[g] ?? [])}
							onconsider={(e) => considerGap(g, e)}
							onfinalize={(e) => finalizeGap(g, e)}
							onclick={() => (selected = g)}
							onfocusin={() => (selected = g)}
						>
							{#each board.gaps[g] ?? [] as chip (chip.id)}
								<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
								<span
									class="chip placed"
									aria-label="{chip.text}, tap to take back"
									onclick={(e) => {
										e.stopPropagation();
										selected = g;
										commit(removeFromGap(board, g, chip.id));
									}}
									onkeydown={(e) => onPlacedKey(e, g, chip)}>{chip.text}</span
								>
							{/each}
						</span>
					{/if}
				{/each}
				{#if line.length === 0}<span class="fixed">&nbsp;</span>{/if}
			</div>
		{/each}
	</div>

	<section class="pool-box" aria-labelledby="pool-title">
		<header>
			<h2 id="pool-title">Pieces</h2>
			<span>∞ can be used more than once</span>
		</header>
		<div
			class="pool"
			aria-label="Pieces"
			data-testid="pool"
			use:dndzone={zone(board.pool)}
			onconsider={considerPool}
			onfinalize={finalizePool}
		>
			{#each board.pool as chip (chip.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<span
					class="chip"
					aria-label={chip.reusable ? `${chip.text}, reusable` : chip.text}
					onclick={() => commit(addToGap(board, chip.id, selected))}
					onkeydown={(e) => onPoolKey(e, chip)}
				>
					{chip.text}{#if chip.reusable}<span class="inf" aria-hidden="true">∞</span>{/if}
				</span>
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
	.layout {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.code {
		padding: 20px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--surface);
		font: 14px/2.4 var(--font-mono);
		overflow-wrap: anywhere;
	}
	.line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		min-height: 2.4em;
	}
	.fixed {
		white-space: pre-wrap;
	}
	.gap {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		min-width: 64px;
		min-height: 36px;
		margin: 0 4px;
		padding: 2px 6px;
		border: 1px dashed var(--border-strong);
		border-radius: 8px;
		background: var(--bg);
		line-height: 1.2;
	}
	.gap.selected {
		border-color: var(--primary);
		background: var(--primary-soft);
	}
	.gap :global(.over),
	.gap:global(.over),
	.pool:global(.over) {
		outline: 2px dashed var(--primary);
		outline-offset: 2px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 36px;
		padding: 0 12px;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: var(--surface);
		font: 13px var(--font-mono);
		line-height: 1.2;
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}
	.chip:focus-visible {
		outline: 2px solid var(--primary);
	}
	.chip.placed {
		border-color: var(--primary);
	}
	.inf {
		color: var(--primary);
		font-weight: 700;
	}
	.pool-box {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 20px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--surface);
	}
	.pool-box header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px;
	}
	h2 {
		font-size: 15px;
		font-weight: 600;
	}
	header span {
		color: var(--text-muted);
		font-size: 12px;
	}
	.pool {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		min-height: 52px;
		padding: 2px;
		border-radius: 10px;
	}
	@media (max-width: 700px) {
		.code {
			padding: 12px;
			font-size: 13px;
		}
		.chip {
			min-height: 44px;
		}
		.gap {
			min-height: 44px;
		}
	}
</style>

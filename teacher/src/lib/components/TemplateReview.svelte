<script lang="ts">
	import type { ReviewSegment } from '#lib/types.js';

	interface Props {
		lines: ReviewSegment[][];
		redHerrings: string[];
	}
	let { lines, redHerrings }: Props = $props();

	// A gap is right when everything in it is right and nothing is missing.
	const right = (seg: Extract<ReviewSegment, { gap: number }>) =>
		seg.submitted.length === seg.expected.length && seg.submitted.every((s) => s.correct);
</script>

<div class="code" role="group" aria-label="Your answer with the solution">
	{#each lines as line}
		<div class="line">
			{#each line as seg}
				{#if 'text' in seg}
					<span class="fixed">{seg.text}</span>
				{:else}
					<span class="gap" class:right={right(seg)} class:wrong={!right(seg)}>
						<span class="sr">{right(seg) ? 'correct' : 'wrong'}</span>
						<span class="mine">
							{#each seg.submitted as s}
								<span class="chip" class:ok={s.correct} class:bad={!s.correct}>{s.text}<b aria-hidden="true">{s.correct ? '✓' : '✕'}</b></span>
							{:else}
								<span class="none">nothing</span>
							{/each}
						</span>
						{#if !right(seg)}
							<span class="expected">
								<span class="label">expected{seg.anyOrder ? ' (any order)' : ''}</span>
								{#each seg.expected as e}<span class="chip want">{e}</span>{:else}<span class="none">leave empty</span>{/each}
							</span>
						{/if}
					</span>
				{/if}
			{/each}
			{#if line.length === 0}<span class="fixed">&nbsp;</span>{/if}
		</div>
	{/each}
</div>

{#if redHerrings.length}
	<p class="herrings">Red herrings (not part of the solution): {#each redHerrings as h, i}<code>{h}</code>{i < redHerrings.length - 1 ? ', ' : ''}{/each}</p>
{/if}

<style>
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
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
		gap: 8px;
		min-height: 36px;
		margin: 2px 4px;
		padding: 2px 6px;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		line-height: 1.2;
	}
	.gap.right {
		border-color: var(--success);
		background: var(--success-soft);
	}
	.gap.wrong {
		border-color: var(--danger);
		background: var(--danger-soft);
	}
	.mine,
	.expected {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.expected {
		padding-left: 8px;
		border-left: 1px solid var(--border-strong);
	}
	.label {
		color: var(--text-muted);
		font: 11px var(--font-sans);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 28px;
		padding: 0 10px;
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		background: var(--surface);
		font: 13px var(--font-mono);
	}
	.chip.ok {
		border-color: var(--success);
		color: var(--success);
	}
	.chip.bad {
		border-color: var(--danger);
		color: var(--danger);
	}
	.chip.want {
		border-style: dashed;
		color: var(--text-muted);
	}
	.none {
		color: var(--text-muted);
		font: italic 12px var(--font-sans);
	}
	.herrings {
		color: var(--text-muted);
		font-size: 13px;
	}
	.herrings code {
		font: 13px var(--font-mono);
	}
	@media (max-width: 700px) {
		.code {
			padding: 12px;
			font-size: 13px;
		}
	}
</style>

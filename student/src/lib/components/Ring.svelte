<script lang="ts">
	let { percent, size = 180 }: { percent: number; size?: number } = $props();
	const stroke = 12;
	const r = $derived((size - stroke) / 2);
	const c = $derived(2 * Math.PI * r);
</script>

<div class="ring" style:width="{size}px" style:height="{size}px" role="img" aria-label="Score: {Math.round(percent)} percent">
	<svg width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
		<circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="var(--surface-alt)" stroke-width={stroke} />
		<circle
			cx={size / 2}
			cy={size / 2}
			{r}
			fill="none"
			stroke="var(--primary)"
			stroke-width={stroke}
			stroke-linecap="round"
			stroke-dasharray="{(c * Math.min(100, Math.max(0, percent))) / 100} {c}"
			transform="rotate(-90 {size / 2} {size / 2})"
		/>
	</svg>
	<div class="label">
		<strong>{Math.round(percent)}%</strong>
		<span>first result</span>
	</div>
</div>

<style>
	.ring {
		position: relative;
	}
	svg {
		display: block;
	}
	.label {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}
	strong {
		font-size: 44px;
		line-height: 1;
	}
	span {
		margin-top: 4px;
		color: var(--text-muted);
		font-size: 12px;
	}
</style>

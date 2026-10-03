<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		subtitle?: string;
		children: Snippet;
	}
	let { title, subtitle, children }: Props = $props();
</script>

<section>
	<header>
		<h2>{title}</h2>
		{#if subtitle}<p>{subtitle}</p>{/if}
	</header>
	{@render children()}
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 24px;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}
	header {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	h2 {
		font-size: 16px;
		font-weight: 600;
	}
	p {
		color: var(--text-muted);
		font-size: 13px;
	}
</style>

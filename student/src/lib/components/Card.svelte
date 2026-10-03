<script lang="ts">
	import type { Snippet } from 'svelte';

	let { width = 480, children }: { width?: number; children: Snippet } = $props();
</script>

<main>
	<div class="card" style:max-width="{width}px">{@render children()}</div>
</main>

<style>
	main {
		display: grid;
		flex: 1;
		place-items: center;
		padding: 32px 16px;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 24px;
		width: 100%;
		padding: 40px;
		border: 1px solid var(--border);
		border-radius: 16px;
		background: var(--surface);
	}
	@media (max-width: 600px) {
		.card {
			padding: 24px;
		}
	}
</style>

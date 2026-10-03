<script lang="ts">
	import type { Snippet } from 'svelte';

	let { tone = 'neutral', children }: { tone?: 'neutral' | 'primary' | 'success' | 'warn'; children: Snippet } = $props();
</script>

<span class="badge {tone}">{@render children()}</span>

<style>
	.badge {
		display: inline-flex;
		padding: 3px 10px;
		border-radius: 100px;
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
	}
	.neutral {
		background: var(--surface-alt);
		color: var(--text-muted);
	}
	.primary {
		background: var(--primary-soft);
		color: var(--primary);
	}
	.success {
		background: var(--success-soft);
		color: var(--success);
	}
	.warn {
		background: var(--warn-soft);
		color: var(--warn);
	}
</style>

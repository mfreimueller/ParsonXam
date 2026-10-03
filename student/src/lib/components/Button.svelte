<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
	interface Props {
		variant?: Variant;
		type?: 'button' | 'submit';
		href?: string;
		disabled?: boolean;
		loading?: boolean;
		block?: boolean;
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
	}
	let {
		variant = 'primary',
		type = 'button',
		href,
		disabled = false,
		loading = false,
		block = false,
		onclick,
		children
	}: Props = $props();
</script>

{#if href}
	<a class="btn {variant}" class:block {href}>{@render children()}</a>
{:else}
	<button class="btn {variant}" class:block {type} disabled={disabled || loading} aria-busy={loading} {onclick}>
		{@render children()}
	</button>
{/if}

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 40px;
		padding: 10px 16px;
		border: 1px solid transparent;
		border-radius: var(--radius);
		font-weight: 600;
		font-size: 14px;
		line-height: 1.2;
		text-decoration: none;
		cursor: pointer;
		white-space: nowrap;
	}
	.block {
		display: flex;
		width: 100%;
	}
	.primary {
		background: var(--primary);
		color: var(--text-inverse);
	}
	.primary:hover:not(:disabled) {
		background: var(--primary-dark);
	}
	.secondary {
		background: var(--surface);
		border-color: var(--border-strong);
		color: var(--text);
	}
	.secondary:hover:not(:disabled) {
		background: var(--surface-alt);
	}
	.ghost {
		background: transparent;
		color: var(--primary);
	}
	.ghost:hover:not(:disabled) {
		background: var(--primary-soft);
	}
	.danger {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
</style>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		checked: boolean;
		disabled?: boolean;
		label: string;
		children?: Snippet;
	}
	let { checked = $bindable(), disabled = false, label, children }: Props = $props();
	const uid = $props.id();
</script>

<label class="option" class:on={checked} class:disabled for="{uid}-box">
	<input id="{uid}-box" type="checkbox" bind:checked {disabled} />
	<span class="text">
		<strong>{label}</strong>
		{#if children}<span class="help">{@render children()}</span>{/if}
	</span>
</label>

<style>
	.option {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		padding: 16px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		cursor: pointer;
	}
	.on {
		border-color: var(--primary);
	}
	.disabled {
		cursor: not-allowed;
		opacity: 0.7;
	}
	input {
		width: 22px;
		height: 22px;
		margin: 0;
		accent-color: var(--primary);
		flex: none;
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.help {
		color: var(--text-muted);
		font-size: 13px;
		line-height: 1.5;
	}
</style>

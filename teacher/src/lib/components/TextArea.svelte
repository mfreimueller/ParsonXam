<script lang="ts">
	interface Props {
		label: string;
		value: string;
		rows?: number;
		placeholder?: string;
		hint?: string;
	}
	let { label, value = $bindable(), rows = 3, placeholder, hint }: Props = $props();
	const uid = $props.id();
</script>

<div class="field">
	<label for="{uid}-input">{label}</label>
	<textarea id="{uid}-input" {rows} {placeholder} bind:value aria-describedby={hint ? `${uid}-hint` : undefined}></textarea>
	{#if hint}<p class="hint" id="{uid}-hint">{hint}</p>{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	label {
		font-size: 13px;
		font-weight: 500;
	}
	textarea {
		padding: 10px 12px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		font: inherit;
		resize: vertical;
	}
	.hint {
		color: var(--text-muted);
		font-size: 13px;
	}
</style>

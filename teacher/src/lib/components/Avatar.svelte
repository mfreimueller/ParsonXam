<script lang="ts">
	import { initials } from '#lib/initials.js';

	let { name, id = 0, size = 24, ring = false }: { name: string; id?: number; size?: number; ring?: boolean } = $props();
	const tone = $derived(['primary', 'success', 'warn'][id % 3]);
</script>

<span
	class="avatar {tone}"
	class:ring
	style:width="{size}px"
	style:height="{size}px"
	style:font-size="{size >= 32 ? 12 : 9}px"
	title={name}
	aria-hidden="true">{initials(name)}</span
>

<style>
	.avatar {
		display: inline-grid;
		place-items: center;
		flex: none;
		border-radius: 50%;
		font-weight: 600;
	}
	.ring {
		box-shadow: 0 0 0 2px var(--surface);
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

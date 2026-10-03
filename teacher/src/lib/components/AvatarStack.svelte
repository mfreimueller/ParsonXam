<script lang="ts">
	import type { Member } from '#lib/types.js';
	import Avatar from './Avatar.svelte';

	let { members, size = 24 }: { members: Member[]; size?: number } = $props();
</script>

<span class="stack">
	{#each members.slice(0, 4) as m (m.teacherId)}
		<Avatar name={m.displayName} id={m.teacherId} {size} ring />
	{/each}
</span>

<style>
	.stack {
		display: inline-flex;
	}
	.stack :global(.avatar + .avatar) {
		margin-left: -6px;
	}
</style>

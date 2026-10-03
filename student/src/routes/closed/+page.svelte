<script lang="ts">
	import { go } from '#lib/nav.js';
			import { onMount } from 'svelte';
	import Button from '#lib/components/Button.svelte';
	import Card from '#lib/components/Card.svelte';
	import { session } from '#lib/session.svelte.js';
	import { formatDateTime } from '#lib/time.js';

	const notice = session.flow.notice;

	onMount(() => {
		if (!notice) go('/', { replaceState: true });
	});

	function again() {
		session.clear();
		go('/');
	}
</script>

<svelte:head><title>This exam is over · ParsonXam</title></svelte:head>

{#if notice}
	<Card>
		<div class="center">
			<div class="icon warn" aria-hidden="true">⏲</div>
			<h1>This exam is over</h1>
			<p>
				{notice.examTitle} ended on {formatDateTime(notice.closesAt ?? null)}. It can no longer be started.
			</p>
		</div>
		<Button variant="secondary" block onclick={again}>{'Enter a different code'}</Button>
	</Card>
{/if}

<style>
	.center {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		text-align: center;
	}
	.icon {
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		border-radius: 50%;
		font-size: 30px;
	}
	.warn {
		background: var(--warn-soft);
		color: var(--warn);
	}
	h1 {
		font-size: 26px;
		font-weight: 700;
	}
	p {
		color: var(--text-muted);
		font-size: 15px;
		line-height: 1.5;
	}
</style>

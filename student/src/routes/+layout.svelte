<script lang="ts">
	import { page } from '$app/state';
	import '../app.css';
	import Logo from '#lib/components/Logo.svelte';
	import favicon from '#lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>ParsonXam</title>
</svelte:head>

<div class="page">
	{#if page.route.id !== '/exam'}
		<header><Logo /></header>
	{/if}
	{@render children()}
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		min-height: 100dvh;
	}
	header {
		display: flex;
		align-items: center;
		height: 64px;
		padding: 0 32px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	@media (max-width: 600px) {
		header {
			padding: 0 16px;
		}
	}
</style>

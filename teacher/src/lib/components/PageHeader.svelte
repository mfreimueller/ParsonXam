<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		subtitle?: string;
		crumbs?: { label: string; href?: string }[];
		actions?: Snippet;
	}
	let { title, subtitle, crumbs = [], actions }: Props = $props();
</script>

<header>
	<div class="titles">
		{#if crumbs.length}
			<nav aria-label="Breadcrumb">
				{#each crumbs as c, i}
					{#if c.href}<a href={c.href}>{c.label}</a>{:else}<span>{c.label}</span>{/if}
					{#if i < crumbs.length - 1}<span aria-hidden="true">/</span>{/if}
				{/each}
			</nav>
		{/if}
		<h1>{title}</h1>
		{#if subtitle}<p>{subtitle}</p>{/if}
	</div>
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 28px;
	}
	.titles {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	nav {
		display: flex;
		gap: 8px;
		color: var(--text-muted);
		font-size: 13px;
	}
	nav a {
		color: inherit;
		text-decoration: none;
	}
	nav a:hover {
		text-decoration: underline;
	}
	h1 {
		font-size: 28px;
		font-weight: 700;
		line-height: 1.2;
	}
	p {
		color: var(--text-muted);
	}
	.actions {
		display: flex;
		gap: 10px;
		align-items: center;
	}
</style>

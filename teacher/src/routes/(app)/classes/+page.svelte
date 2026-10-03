<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError } from '#lib/api.js';
	import AvatarStack from '#lib/components/AvatarStack.svelte';
	import Badge from '#lib/components/Badge.svelte';
	import Button from '#lib/components/Button.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import TextField from '#lib/components/TextField.svelte';
	import type { ClassView } from '#lib/types.js';

	let { data } = $props();

	let creating = $state(false);
	let name = $state('');
	let term = $state('');
	let error = $state<string | null>(null);
	let saving = $state(false);

	function teachersLine(c: ClassView): string {
		if (c.members.length === 1) return 'Only you';
		if (c.myRole === 'member') {
			return `Shared by ${c.members.find((m) => m.role === 'owner')?.displayName ?? 'a colleague'}`;
		}
		const others = c.members.filter((m) => m.role !== 'owner').map((m) => m.displayName);
		return `Shared with ${others[0]}${others.length > 1 ? ` +${others.length - 1}` : ''}`;
	}

	function openCreate() {
		name = '';
		term = '';
		error = null;
		creating = true;
	}

	async function create(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		saving = true;
		try {
			const res = await api<{ class: ClassView }>('/teacher/classes', { method: 'POST', body: { name, term } });
			creating = false;
			await goto(`/classes/${res.class.id}`);
		} catch (err) {
			error = err instanceof ApiError && err.code === 'VALIDATION' ? 'Please enter a class name.' : (err as Error).message;
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Classes · ParsonXam</title></svelte:head>

<PageHeader title="Classes" subtitle="Your classes and their revision exams.">
	{#snippet actions()}
		<Button onclick={openCreate}>+ New class</Button>
	{/snippet}
</PageHeader>

<ul class="grid">
	{#each data.classes as c (c.id)}
		<li>
			<a class="card" href="/classes/{c.id}">
				<div class="top">
					<h2>{c.name}</h2>
					{#if c.myRole === 'member'}<Badge tone="primary">Shared</Badge>{/if}
				</div>
				{#if c.term}<p class="term">{c.term}</p>{/if}
				<div class="teachers">
					<AvatarStack members={c.members} />
					<span>{teachersLine(c)}</span>
				</div>
			</a>
		</li>
	{/each}
	<li>
		<button class="card new" onclick={openCreate}>
			<span class="plus" aria-hidden="true">+</span>
			<span>Create a class</span>
		</button>
	</li>
</ul>

<Dialog bind:open={creating} title="New class" width={440}>
	<form onsubmit={create} novalidate>
		<TextField label="Class name" bind:value={name} placeholder="4AHIF · Programming" required />
		<TextField label="Term (optional)" bind:value={term} placeholder="Winter term 2026" />
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<div class="buttons">
			<Button variant="secondary" onclick={() => (creating = false)}>Cancel</Button>
			<Button type="submit" loading={saving}>Create class</Button>
		</div>
	</form>
</Dialog>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 20px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 100%;
		padding: 24px;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		color: inherit;
		text-decoration: none;
	}
	a.card:hover {
		border-color: var(--border-strong);
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	h2 {
		font-size: 17px;
		font-weight: 600;
	}
	.term {
		color: var(--text-muted);
		font-size: 13px;
	}
	.teachers {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: auto;
		color: var(--text-muted);
		font-size: 12px;
	}
	.new {
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-height: 120px;
		border: 1px dashed var(--border-strong);
		background: transparent;
		color: var(--text-muted);
		font-weight: 500;
		cursor: pointer;
	}
	.new:hover {
		background: var(--surface);
	}
	.plus {
		font-size: 28px;
		line-height: 1;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.buttons {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}
	.error {
		color: var(--danger);
		font-size: 13px;
	}
</style>

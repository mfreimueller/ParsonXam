<script lang="ts">
	import AvatarStack from '#lib/components/AvatarStack.svelte';
	import Button from '#lib/components/Button.svelte';
	import ClassSettingsDialog from '#lib/components/ClassSettingsDialog.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import TeachersDialog from '#lib/components/TeachersDialog.svelte';

	let { data } = $props();
	const cls = $derived(data.cls);

	let teachersOpen = $state(false);
	let settingsOpen = $state(false);
</script>

<svelte:head><title>{cls.name} · ParsonXam</title></svelte:head>

<PageHeader
	title={cls.name}
	subtitle={[cls.term, `${cls.members.length} ${cls.members.length === 1 ? 'teacher' : 'teachers'}`].filter(Boolean).join(' · ')}
	crumbs={[{ label: 'Classes', href: '/classes' }, { label: cls.name }]}
>
	{#snippet actions()}
		<button class="chip" onclick={() => (teachersOpen = true)}>
			<AvatarStack members={cls.members} />
			<span>Teachers</span>
		</button>
		{#if cls.myRole === 'owner'}
			<Button variant="secondary" onclick={() => (settingsOpen = true)}>Settings</Button>
		{/if}
	{/snippet}
</PageHeader>

<div class="empty">
	<p>No exams yet.</p>
</div>

<TeachersDialog {cls} bind:open={teachersOpen} />
{#if cls.myRole === 'owner'}<ClassSettingsDialog {cls} bind:open={settingsOpen} />{/if}

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		min-height: 40px;
		padding: 6px 12px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		font-weight: 600;
		cursor: pointer;
	}
	.chip:hover {
		background: var(--surface-alt);
	}
	.empty {
		padding: 32px;
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-lg);
		color: var(--text-muted);
	}
</style>

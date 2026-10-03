<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { api, ApiError } from '#lib/api.js';
	import { auth } from '#lib/auth.svelte.js';
	import type { ClassView } from '#lib/types.js';
	import Avatar from './Avatar.svelte';
	import Badge from './Badge.svelte';
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import TextField from './TextField.svelte';

	let { cls, open = $bindable() }: { cls: ClassView; open: boolean } = $props();

	const isOwner = $derived(cls.myRole === 'owner');
	let email = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);
	let confirmLeave = $state(false);

	$effect(() => {
		if (open) {
			email = '';
			error = null;
			confirmLeave = false;
		}
	});

	async function add(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		busy = true;
		try {
			await api(`/teacher/classes/${cls.id}/members`, { method: 'POST', body: { email } });
			email = '';
			await invalidateAll();
		} catch (err) {
			error = err instanceof ApiError && err.code === 'VALIDATION' ? 'Please enter a valid email address.' : (err as Error).message;
		} finally {
			busy = false;
		}
	}

	async function remove(teacherId: number) {
		error = null;
		busy = true;
		try {
			await api(`/teacher/classes/${cls.id}/members/${teacherId}`, { method: 'DELETE' });
			await invalidateAll();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}

	async function leave() {
		if (!confirmLeave) {
			confirmLeave = true;
			return;
		}
		busy = true;
		try {
			await api(`/teacher/classes/${cls.id}/members/${auth.teacher?.id}`, { method: 'DELETE' });
			open = false;
			await goto('/classes');
		} catch (err) {
			error = (err as Error).message;
			busy = false;
		}
	}
</script>

<Dialog bind:open title="Teachers in {cls.name}" width={560}>
	<p class="intro">
		Everyone here can create, edit and run exams and see the results.
		{#if isOwner}Only you, as the owner, can add or remove teachers and delete the class.{:else}Only the owner can add or remove teachers.{/if}
	</p>

	<ul class="members">
		{#each cls.members as m (m.teacherId)}
			<li>
				<Avatar name={m.displayName} id={m.teacherId} size={32} />
				<div class="who">
					<strong>{m.displayName}{m.teacherId === auth.teacher?.id ? ' (you)' : ''}</strong>
					<span>{m.email}</span>
				</div>
				<Badge tone={m.role === 'owner' ? 'primary' : 'neutral'}>{m.role === 'owner' ? 'Owner' : 'Member'}</Badge>
				<div class="slot">
					{#if isOwner && m.role !== 'owner'}
						<Button variant="danger" disabled={busy} onclick={() => remove(m.teacherId)}>Remove</Button>
					{/if}
				</div>
			</li>
		{/each}
	</ul>

	{#if isOwner}
		<form onsubmit={add} novalidate>
			<div class="grow"><TextField label="Add a teacher by email" type="email" bind:value={email} placeholder="colleague@school.edu" /></div>
			<Button type="submit" loading={busy}>Add teacher</Button>
		</form>
		<p class="hint">The teacher needs a ParsonXam account already. Ask the administrator if they don’t have one.</p>
	{/if}

	{#if error}<p class="error" role="alert">{error}</p>{/if}

	<div class="footer">
		{#if !isOwner}
			<Button variant="danger" disabled={busy} onclick={leave}>{confirmLeave ? 'Click again to leave' : 'Leave class'}</Button>
		{/if}
		<Button variant="secondary" onclick={() => (open = false)}>Done</Button>
	</div>
</Dialog>

<style>
	.intro,
	.hint {
		color: var(--text-muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.hint {
		font-size: 12px;
		margin-top: -8px;
	}
	.members {
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
	}
	li + li {
		border-top: 1px solid var(--border);
	}
	.who {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}
	.who span {
		overflow: hidden;
		color: var(--text-muted);
		font-size: 12px;
		text-overflow: ellipsis;
	}
	.slot {
		display: flex;
		justify-content: flex-end;
		width: 88px;
	}
	form {
		display: flex;
		align-items: flex-end;
		gap: 10px;
	}
	.grow {
		flex: 1;
	}
	.error {
		color: var(--danger);
		font-size: 13px;
	}
	.footer {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}
</style>

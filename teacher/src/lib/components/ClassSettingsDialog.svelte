<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { api, ApiError } from '#lib/api.js';
	import type { ClassView } from '#lib/types.js';
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import TextField from './TextField.svelte';

	let { cls, open = $bindable() }: { cls: ClassView; open: boolean } = $props();

	let name = $state('');
	let term = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);
	let confirmDelete = $state(false);

	$effect(() => {
		if (open) {
			name = cls.name;
			term = cls.term;
			error = null;
			confirmDelete = false;
		}
	});

	async function save(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = null;
		try {
			await api(`/teacher/classes/${cls.id}`, { method: 'PATCH', body: { name, term } });
			await invalidateAll();
			open = false;
		} catch (err) {
			error = err instanceof ApiError && err.code === 'VALIDATION' ? 'Please enter a class name.' : (err as Error).message;
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!confirmDelete) {
			confirmDelete = true;
			return;
		}
		busy = true;
		try {
			await api(`/teacher/classes/${cls.id}`, { method: 'DELETE' });
			open = false;
			await goto('/classes');
		} catch (err) {
			error = (err as Error).message;
			busy = false;
		}
	}
</script>

<Dialog bind:open title="Class settings" width={440}>
	<form onsubmit={save} novalidate>
		<TextField label="Class name" bind:value={name} required />
		<TextField label="Term (optional)" bind:value={term} />
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<div class="buttons">
			<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
			<Button type="submit" loading={busy}>Save</Button>
		</div>
	</form>
	<div class="danger">
		<div>
			<strong>Delete this class</strong>
			<p>
				{confirmDelete
					? 'This removes the class and all of its exams and results for every teacher. This cannot be undone.'
					: 'Remove the class for every teacher in it.'}
			</p>
		</div>
		<Button variant="danger" disabled={busy} onclick={remove}>{confirmDelete ? 'Yes, delete' : 'Delete class'}</Button>
	</div>
</Dialog>

<style>
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
	.danger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding-top: 20px;
		border-top: 1px solid var(--border);
	}
	.danger p {
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.5;
	}
</style>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '#lib/api.js';
	import AvatarStack from '#lib/components/AvatarStack.svelte';
	import Button from '#lib/components/Button.svelte';
	import ClassSettingsDialog from '#lib/components/ClassSettingsDialog.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import TeachersDialog from '#lib/components/TeachersDialog.svelte';
	import TextField from '#lib/components/TextField.svelte';
	import { formatDateTime, formatMinutes } from '#lib/time.js';
	import type { ExamView } from '#lib/types.js';

	let { data } = $props();
	const cls = $derived(data.cls);

	let teachersOpen = $state(false);
	let settingsOpen = $state(false);
	let creating = $state(false);
	let title = $state('');
	let error = $state<string | null>(null);
	let saving = $state(false);

	async function createExam(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		error = null;
		try {
			const res = await api<{ exam: ExamView }>(`/teacher/classes/${cls.id}/exams`, { method: 'POST', body: { title } });
			creating = false;
			await goto(`/exams/${res.exam.id}`);
		} catch (err) {
			error = (err as Error).message.includes('title') ? 'Please enter a title.' : (err as Error).message;
		} finally {
			saving = false;
		}
	}
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
		<Button
			onclick={() => {
				title = '';
				error = null;
				creating = true;
			}}>+ New exam</Button
		>
	{/snippet}
</PageHeader>

{#if data.exams.length === 0}
	<div class="empty">
		<p>No exams yet. Create the first one for this class.</p>
	</div>
{:else}
	<div class="scroll">
		<table>
			<thead>
				<tr>
					<th>Exam</th>
					<th>Status</th>
					<th>Access code</th>
					<th>Time limit</th>
					<th>Puzzles</th>
					<th>Exam over</th>
				</tr>
			</thead>
			<tbody>
				{#each data.exams as exam (exam.id)}
					<tr>
						<td><a href="/exams/{exam.id}">{exam.title}</a></td>
						<td><StatusBadge status={exam.status} /></td>
						<td><code>{exam.accessCode}</code></td>
						<td>{formatMinutes(exam.timeLimitSeconds)}</td>
						<td>{exam.puzzleCount}</td>
						<td class="muted">{formatDateTime(exam.closesAt)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<TeachersDialog {cls} bind:open={teachersOpen} />
{#if cls.myRole === 'owner'}<ClassSettingsDialog {cls} bind:open={settingsOpen} />{/if}

<Dialog bind:open={creating} title="New exam" width={440}>
	<form onsubmit={createExam} novalidate>
		<TextField label="Title" bind:value={title} placeholder="Midterm Revision: Loops" required />
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<div class="buttons">
			<Button variant="secondary" onclick={() => (creating = false)}>Cancel</Button>
			<Button type="submit" loading={saving}>Create exam</Button>
		</div>
	</form>
</Dialog>

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
	.scroll {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th {
		padding: 12px 24px;
		background: var(--surface-alt);
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 600;
		text-align: left;
	}
	td {
		padding: 16px 24px;
		border-top: 1px solid var(--border);
	}
	td a {
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}
	td a:hover {
		text-decoration: underline;
	}
	code {
		padding: 4px 8px;
		border-radius: 6px;
		background: var(--surface-alt);
		font: 500 13px var(--font-mono);
	}
	.muted {
		color: var(--text-muted);
		font-size: 13px;
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

<script lang="ts">
	import { resolve } from '$app/paths';
	import { go } from '#lib/nav.js';
			import { onMount } from 'svelte';
	import { api, ApiError } from '#lib/api.js';
	import Button from '#lib/components/Button.svelte';
	import Card from '#lib/components/Card.svelte';
	import TextField from '#lib/components/TextField.svelte';
	import { session } from '#lib/session.svelte.js';

	const found = session.flow.found;
	let name = $state('');
	let error = $state<string | null>(null);
	let joining = $state(false);

	onMount(() => {
		if (!found) go('/', { replaceState: true });
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!found) return;
		if (name.trim() === '') {
			error = 'Please enter your name.';
			return;
		}
		joining = true;
		error = null;
		try {
			const res = await api<{ token: string }>('/student/join', { method: 'POST', body: { code: found.code, name } });
			session.setToken(res.token);
			session.setFound(null);
			await go('/ready');
		} catch (err) {
			if (err instanceof ApiError && err.code === 'EXAM_CLOSED') {
				session.setNotice({ examTitle: err.data.examTitle as string, closesAt: err.data.closesAt as string });
				await go('/closed');
			} else if (err instanceof ApiError && err.code === 'EXAM_NOT_OPEN') {
				session.setNotice({ examTitle: err.data.examTitle as string, opensAt: err.data.opensAt as string });
				await go('/not-open');
			} else if (err instanceof ApiError && err.code === 'VALIDATION') {
				error = 'Please enter your name (up to 60 characters).';
			} else {
				error = (err as Error).message;
			}
		} finally {
			joining = false;
		}
	}
</script>

<svelte:head><title>Your name · ParsonXam</title></svelte:head>

{#if found}
	<Card>
		<div class="exam">
			<span>{found.className}</span>
			<strong>{found.examTitle}</strong>
		</div>
		<div class="head">
			<h1>Who are you?</h1>
			<p>Your teacher sees your name next to your results.</p>
		</div>
		<form onsubmit={submit} novalidate>
			<TextField label="Your full name" bind:value={name} autocomplete="name" {error} />
			<Button type="submit" block loading={joining}>Continue</Button>
		</form>
		<a class="back" href={resolve('/')}>Use a different code</a>
	</Card>
{/if}

<style>
	.exam {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 16px;
		border-radius: 10px;
		background: var(--primary-soft);
	}
	.exam span {
		color: var(--primary);
		font-size: 12px;
		font-weight: 600;
	}
	.exam strong {
		font-size: 18px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	h1 {
		font-size: 26px;
		font-weight: 700;
	}
	.head p {
		color: var(--text-muted);
		font-size: 15px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.back {
		color: var(--text-muted);
		font-size: 13px;
		text-align: center;
	}
</style>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { api, ApiError } from '#lib/api.js';
	import { auth, type Teacher } from '#lib/auth.svelte.js';
	import Button from '#lib/components/Button.svelte';

	let phase = $state<'checking' | 'expired' | 'invalid' | 'error'>('checking');
	let errorMessage = $state('');

	onMount(async () => {
		const token = page.url.searchParams.get('token');
		if (!token) {
			phase = 'invalid';
			return;
		}
		try {
			const res = await api<{ token: string; expiresAt: string; teacher: Teacher }>('/teacher/auth/verify', {
				method: 'POST',
				body: { token },
				auth: false
			});
			auth.set(res);
			await goto('/classes', { replaceState: true });
		} catch (err) {
			if (err instanceof ApiError && err.code === 'LINK_EXPIRED') phase = 'expired';
			else if (err instanceof ApiError && err.code === 'LINK_INVALID') phase = 'invalid';
			else {
				phase = 'error';
				errorMessage = err instanceof ApiError ? err.message : 'Something went wrong.';
			}
		}
	});
</script>

<svelte:head><title>Signing in · ParsonXam</title></svelte:head>

{#if phase === 'checking'}
	<p class="checking" role="status">Signing you in…</p>
{:else if phase === 'expired'}
	<div class="icon warn" aria-hidden="true">⏲</div>
	<div class="head">
		<h1>This link has expired</h1>
		<p>Sign-in links can be used once and are valid for 15 minutes. Request a new one to continue.</p>
	</div>
	<Button block href="/login">Send a new link</Button>
{:else if phase === 'invalid'}
	<div class="icon warn" aria-hidden="true">⏲</div>
	<div class="head">
		<h1>This link doesn’t work</h1>
		<p>It was already used or is not valid. Request a new one to continue.</p>
	</div>
	<Button block href="/login">Send a new link</Button>
{:else}
	<div class="head">
		<h1>We couldn’t sign you in</h1>
		<p>{errorMessage}</p>
	</div>
	<Button block href="/login">Back to sign in</Button>
{/if}

<style>
	.checking {
		color: var(--text-muted);
		font-size: 15px;
	}
	.icon {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		font-size: 26px;
	}
	.warn {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	h1 {
		font-size: 30px;
		font-weight: 700;
	}
	.head p {
		color: var(--text-muted);
		font-size: 15px;
	}
</style>

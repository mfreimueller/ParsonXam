<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { api, ApiError } from '#lib/api.js';
	import Button from '#lib/components/Button.svelte';

	const email = $derived(page.url.searchParams.get('email') ?? '');
	const COOLDOWN = 45;

	let seconds = $state(COOLDOWN);
	let message = $state<string | null>(null);
	let resending = $state(false);

	onMount(() => {
		const id = setInterval(() => {
			if (seconds > 0) seconds -= 1;
		}, 1000);
		return () => clearInterval(id);
	});

	async function resend() {
		resending = true;
		message = null;
		try {
			await api('/teacher/auth/request-link', { method: 'POST', body: { email }, auth: false });
			seconds = COOLDOWN;
			message = 'We sent another link.';
		} catch (err) {
			message = err instanceof ApiError ? err.message : 'Something went wrong.';
		} finally {
			resending = false;
		}
	}

	const label = $derived(seconds > 0 ? `Resend link in 0:${String(seconds).padStart(2, '0')}` : 'Resend link');
</script>

<svelte:head><title>Check your inbox · ParsonXam</title></svelte:head>

<div class="icon" aria-hidden="true">✉</div>
<div class="head">
	<h1>Check your inbox</h1>
	<p>
		If <strong>{email || 'your address'}</strong> is registered, a sign-in link is on its way. It works once and expires
		in 15 minutes.
	</p>
</div>
<p class="tip">Nothing yet? Check your spam folder.</p>
<div class="actions">
	<Button variant="secondary" block disabled={seconds > 0} loading={resending} onclick={resend}>{label}</Button>
	<Button variant="ghost" block href="/login">Use a different email</Button>
</div>
<p class="status" role="status">{message ?? ''}</p>

<style>
	.icon {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--primary-soft);
		color: var(--primary);
		font-size: 26px;
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
	.tip {
		padding: 14px;
		border-radius: 10px;
		background: var(--surface-alt);
		color: var(--text-muted);
		font-size: 13px;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.status {
		min-height: 1.5em;
		color: var(--text-muted);
		font-size: 13px;
	}
</style>

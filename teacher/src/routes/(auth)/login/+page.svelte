<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError } from '#lib/api.js';
	import Button from '#lib/components/Button.svelte';
	import TextField from '#lib/components/TextField.svelte';

	let email = $state('');
	let error = $state<string | null>(null);
	let sending = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		sending = true;
		try {
			await api('/teacher/auth/request-link', { method: 'POST', body: { email }, auth: false });
			await goto(`/login/sent?email=${encodeURIComponent(email.trim())}`);
		} catch (err) {
			error = err instanceof ApiError ? friendly(err) : 'Something went wrong.';
		} finally {
			sending = false;
		}
	}

	function friendly(err: ApiError): string {
		if (err.code === 'VALIDATION') return 'Please enter a valid email address.';
		return err.message;
	}
</script>

<svelte:head><title>Sign in · ParsonXam</title></svelte:head>

<div class="head">
	<h1>Sign in</h1>
	<p>Enter your school email and we’ll send you a one-time sign-in link. No password needed.</p>
</div>

<form onsubmit={submit} novalidate>
	<TextField label="Email address" type="email" autocomplete="email" bind:value={email} {error} required />
	<Button type="submit" block loading={sending}>Send sign-in link</Button>
</form>

<p class="note">Access is limited to registered teachers. Need an account? Contact your administrator.</p>

<style>
	.head {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	h1 {
		font-size: 30px;
		font-weight: 700;
	}
	.head p,
	.note {
		color: var(--text-muted);
		font-size: 15px;
		line-height: 1.5;
	}
	.note {
		font-size: 13px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
</style>

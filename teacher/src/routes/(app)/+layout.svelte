<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '#lib/api.js';
	import { auth } from '#lib/auth.svelte.js';
	import Logo from '#lib/components/Logo.svelte';

	let { children } = $props();

	const initials = $derived(
		(auth.teacher?.displayName ?? '')
			.split(/\s+/)
			.map((w) => w[0])
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);

	async function signOut() {
		try {
			await api('/teacher/auth/logout', { method: 'POST', body: {} });
		} catch {
			// Signing out locally is enough if the server cannot be reached.
		}
		auth.clear();
		await goto('/login');
	}
</script>

<div class="app">
	<aside>
		<Logo />
		<nav aria-label="Main">
			<a href="/classes" aria-current={page.url.pathname.startsWith('/classes') ? 'page' : undefined}>Classes</a>
		</nav>
		<div class="grow"></div>
		<div class="user">
			<span class="avatar" aria-hidden="true">{initials}</span>
			<div>
				<strong>{auth.teacher?.displayName}</strong>
				<button class="link" onclick={signOut}>Sign out</button>
			</div>
		</div>
	</aside>
	<main>{@render children()}</main>
</div>

<style>
	.app {
		display: grid;
		grid-template-columns: 240px minmax(0, 1fr);
		min-height: 100vh;
	}
	aside {
		display: flex;
		flex-direction: column;
		gap: 24px;
		padding: 20px;
		background: var(--surface);
		border-right: 1px solid var(--border);
	}
	nav {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	nav a {
		padding: 10px 12px;
		border-radius: var(--radius);
		color: var(--text-muted);
		font-weight: 500;
		text-decoration: none;
	}
	nav a[aria-current='page'] {
		background: var(--primary-soft);
		color: var(--primary);
		font-weight: 600;
	}
	.grow {
		flex: 1;
	}
	.user {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 13px;
	}
	.user div {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}
	.avatar {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--surface-alt);
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 600;
	}
	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-muted);
		font-size: 12px;
		cursor: pointer;
		text-decoration: underline;
	}
	main {
		padding: 40px;
	}
	@media (max-width: 900px) {
		.app {
			grid-template-columns: 1fr;
		}
		aside {
			flex-direction: row;
			align-items: center;
			border-right: 0;
			border-bottom: 1px solid var(--border);
		}
		main {
			padding: 24px 16px;
		}
	}
</style>

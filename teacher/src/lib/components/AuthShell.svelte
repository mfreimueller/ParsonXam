<script lang="ts">
	import type { Snippet } from 'svelte';
	import Logo from './Logo.svelte';

	let { children }: { children: Snippet } = $props();
	const pieces: [string, number, boolean][] = [
		['for i in range(3):', 0, false],
		['print(i)', 32, false],
		['print("done")', 0, false],
		['while True:', 0, true]
	];
</script>

<div class="shell">
	<aside class="brand">
		<Logo inverse />
		<div class="pitch">
			<h2>Revision exams that<br />students actually solve.</h2>
			<p>Build Parsons puzzles, share a code, and see every result.</p>
			<ul aria-hidden="true">
				{#each pieces as [code, indent, herring]}
					<li style:margin-left="{indent}px" class:herring>{code}</li>
				{/each}
			</ul>
		</div>
		<small>© 2026 ParsonXam</small>
	</aside>
	<main>
		<div class="form">{@render children()}</div>
	</main>
</div>

<style>
	.shell {
		display: grid;
		grid-template-columns: minmax(0, 4fr) minmax(0, 5fr);
		min-height: 100vh;
	}
	.brand {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 56px;
		background: var(--code-bg);
		color: var(--text-inverse);
	}
	.pitch {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	h2 {
		font-size: 36px;
		line-height: 1.22;
		font-weight: 700;
	}
	.pitch p {
		color: var(--code-muted);
		font-size: 16px;
	}
	ul {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: flex-start;
		margin: 16px 0 0;
		padding: 0;
		list-style: none;
	}
	li {
		padding: 10px 16px;
		border-radius: 8px;
		background: var(--surface);
		color: var(--text);
		font: 400 13px var(--font-mono);
	}
	li.herring {
		background: var(--warn-soft);
		border: 1px dashed var(--warn);
	}
	small {
		color: var(--code-muted);
	}
	main {
		display: grid;
		place-items: center;
		padding: 48px 24px;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 24px;
		width: 100%;
		max-width: 400px;
	}
	@media (max-width: 800px) {
		.shell {
			grid-template-columns: 1fr;
		}
		.brand {
			display: none;
		}
	}
</style>

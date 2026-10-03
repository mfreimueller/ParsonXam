<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { ApiError } from '#lib/api.js';
	import { loadAttempt, type AttemptView, type ReviewPuzzle } from '#lib/attempt.js';
	import Button from '#lib/components/Button.svelte';
	import Card from '#lib/components/Card.svelte';
	import Ring from '#lib/components/Ring.svelte';
	import { go, goForAttempt } from '#lib/nav.js';
	import { session } from '#lib/session.svelte.js';
	import { formatRemaining } from '#lib/time.js';

	type Submitted = Extract<AttemptView, { status: 'submitted' }>;

	let view = $state<Submitted | null>(null);
	let error = $state<string | null>(null);
	let tab = $state(0);
	let now = $state(Date.now());
	let offset = 0; // server clock minus this device's clock

	let clock: ReturnType<typeof setInterval>;
	let poll: ReturnType<typeof setInterval>;

	async function refresh() {
		try {
			const v = await loadAttempt();
			if (v.status !== 'submitted') return void goForAttempt(v, { replaceState: true });
			offset = Date.parse(v.serverNow) - Date.now();
			view = v;
			error = null;
		} catch (err) {
			if (err instanceof ApiError && err.status === 401) return;
			// Keep what is on screen; the next poll tries again.
			if (!view) error = (err as Error).message;
		}
	}

	onMount(async () => {
		if (!session.token) return void go('/', { replaceState: true });
		await refresh();
		clock = setInterval(() => {
			now = Date.now();
			// The moment the exam ends, fetch the solutions without waiting for the next poll.
			if (view && !view.review && closesAt && now + offset >= closesAt + 500 && Math.floor(now / 1000) % 3 === 0) void refresh();
		}, 1000);
		poll = setInterval(refresh, 15_000);
	});

	onDestroy(() => {
		clearInterval(clock);
		clearInterval(poll);
	});

	const closesAt = $derived(view?.exam.closesAt ? Date.parse(view.exam.closesAt) : null);
	const untilUnlock = $derived(closesAt ? closesAt - (now + offset) : 0);
	const review = $derived(view?.review);
	const current = $derived<ReviewPuzzle | undefined>(review?.puzzles[tab]);

	function finish() {
		session.clear();
		go('/');
	}

	const tone = (p: number) => (p >= 70 ? 'ok' : p >= 40 ? 'mid' : 'low');
</script>

<svelte:head><title>{review ? 'Your results' : 'Submitted'} · ParsonXam</title></svelte:head>

{#if view && !review}
	<Card width={520}>
		<div class="center">
			<span class="chip" class:timeout={view.submitReason === 'timeout'}>
				{view.submitReason === 'timeout' ? '⏱ Time ran out – submitted automatically' : '✓ Submitted'}
			</span>
			<Ring percent={view.scorePercent} />
			<h1>You got {Math.round(view.scorePercent)}%</h1>
			<p>Please wait – other students are still working. The solutions will appear once the exam is over.</p>
			<div class="wait" role="timer" aria-live="off">
				<span>Solutions unlock in</span>
				<strong>{formatRemaining(untilUnlock)}</strong>
			</div>
		</div>
	</Card>
{:else if view && review}
	<main>
		<div class="top">
			<div>
				<h1 class="title">{view.exam.title}</h1>
				<p class="muted">The exam is over. Compare your answers with the solutions.</p>
			</div>
			<div class="score">
				<strong>{Math.round(view.scorePercent)}%</strong>
				<span>Your score<br /><small>{view.exam.puzzleCount} puzzles</small></span>
			</div>
		</div>

		<div class="tabs" role="tablist" aria-label="Puzzles">
			{#each review.puzzles as p, i}
				<button role="tab" aria-selected={i === tab} class:on={i === tab} onclick={() => (tab = i)}>
					Puzzle {i + 1} · {Math.round(p.scorePercent)}%
				</button>
			{/each}
		</div>

		{#if current}
			<h2>Puzzle {tab + 1}: {current.title}</h2>
			{#if current.description}<p class="muted">{current.description}</p>{/if}
			<div class="panels">
				<section class="panel" aria-labelledby="mine">
					<header>
						<h3 id="mine">Your submission</h3>
						<span class="pill {tone(current.scorePercent)}">
							{current.submission.filter((l) => l.correct).length} of {current.solution.length} correct
						</span>
					</header>
					{#if current.submission.length === 0}
						<p class="empty">You didn’t place any pieces here.</p>
					{/if}
					<ol>
						{#each current.submission as line}
							<li class:right={line.correct} class:wrong={!line.correct}>
								<code style:padding-left="{line.indent * 24}px">{line.code}</code>
								<span class="sr">{line.correct ? 'correct' : 'wrong'}</span>
								<span aria-hidden="true" class="mark">{line.correct ? '✓' : '✕'}</span>
							</li>
						{/each}
					</ol>
				</section>
				<section class="panel" aria-labelledby="sol">
					<header>
						<h3 id="sol">Solution</h3>
						<span class="pill ok">Correct answer</span>
					</header>
					<ol>
						{#each current.solution as line}
							<li><code style:padding-left="{line.indent * 24}px">{line.code}</code></li>
						{/each}
					</ol>
					{#if current.redHerrings.length}
						<h4>Red herrings (not part of the solution)</h4>
						<ol>
							{#each current.redHerrings as line}
								<li class="herring"><code style:padding-left="{line.indent * 24}px">{line.code}</code></li>
							{/each}
						</ol>
					{/if}
				</section>
			</div>
		{/if}

		<div class="finish">
			<Button variant="secondary" onclick={finish}>I’m done – close this</Button>
			<span class="muted">This also removes your name from this device.</span>
		</div>
	</main>
{:else if error}
	<Card><p class="err" role="alert">{error}</p><Button onclick={() => go('/')}>Back</Button></Card>
{:else}
	<Card><p class="muted" role="status">Loading…</p></Card>
{/if}

<style>
	.center {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		text-align: center;
	}
	.chip {
		padding: 6px 12px;
		border-radius: 100px;
		background: var(--success-soft);
		color: var(--success);
		font-size: 13px;
		font-weight: 600;
	}
	.chip.timeout {
		background: var(--warn-soft);
		color: var(--warn);
	}
	h1 {
		font-size: 26px;
		font-weight: 700;
	}
	.center p,
	.muted {
		color: var(--text-muted);
		font-size: 15px;
		line-height: 1.5;
	}
	.wait {
		display: flex;
		justify-content: center;
		gap: 12px;
		width: 100%;
		padding: 16px;
		border-radius: 10px;
		background: var(--surface-alt);
		font-size: 13px;
	}
	.wait span {
		color: var(--text-muted);
	}
	.wait strong {
		font: 700 15px var(--font-mono);
	}
	main {
		display: flex;
		flex-direction: column;
		gap: 20px;
		width: 100%;
		max-width: 1200px;
		margin: 0 auto;
		padding: 32px;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
	}
	.title {
		font-size: 26px;
	}
	.score {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 14px 24px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--surface);
	}
	.score strong {
		color: var(--primary);
		font-size: 36px;
	}
	.score span {
		font-size: 13px;
		font-weight: 600;
		line-height: 1.3;
	}
	.score small {
		color: var(--text-muted);
		font-weight: 400;
		font-size: 12px;
	}
	.tabs {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.tabs button {
		padding: 9px 16px;
		border: 1px solid var(--border-strong);
		border-radius: 100px;
		background: var(--surface);
		color: var(--text-muted);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.tabs button.on {
		border-color: var(--primary);
		background: var(--primary);
		color: var(--text-inverse);
	}
	h2 {
		font-size: 18px;
		font-weight: 600;
	}
	.panels {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 24px;
		align-items: start;
	}
	.panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 24px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--surface);
	}
	.panel header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	h3 {
		font-size: 16px;
		font-weight: 600;
	}
	h4 {
		margin-top: 8px;
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 600;
	}
	.pill {
		padding: 4px 10px;
		border-radius: 100px;
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
	}
	.pill.ok {
		background: var(--success-soft);
		color: var(--success);
	}
	.pill.mid {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.pill.low {
		background: var(--danger-soft);
		color: var(--danger);
	}
	ol {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 44px;
		padding: 0 14px;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: var(--surface);
		font: 13px var(--font-mono);
	}
	li.right {
		border-color: var(--success);
		background: var(--success-soft);
	}
	li.wrong {
		border-color: var(--danger);
		background: var(--danger-soft);
	}
	li.herring {
		border: 1px dashed var(--warn);
		background: var(--warn-soft);
	}
	code {
		min-width: 0;
		font: inherit;
		white-space: pre;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.mark {
		font-weight: 700;
	}
	.right .mark {
		color: var(--success);
	}
	.wrong .mark {
		color: var(--danger);
	}
	.empty {
		padding: 12px;
		border: 1px dashed var(--border-strong);
		border-radius: 8px;
		color: var(--text-muted);
		font-size: 13px;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.finish {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		padding-top: 8px;
	}
	.finish .muted {
		font-size: 12px;
	}
	.err {
		color: var(--danger);
	}
	@media (max-width: 800px) {
		main {
			padding: 16px;
		}
		.panels {
			grid-template-columns: 1fr;
		}
	}
</style>

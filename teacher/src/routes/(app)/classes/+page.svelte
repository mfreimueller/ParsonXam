<svelte:head><title>Classes · ParsonXam</title></svelte:head>

<header>
	<h1>Classes</h1>
	<p>Your classes and their revision exams.</p>
</header>

<p class="empty">No classes yet.</p>

<style>
	header {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 28px;
	}
	h1 {
		font-size: 28px;
		font-weight: 700;
	}
	header p,
	.empty {
		color: var(--text-muted);
	}
</style>

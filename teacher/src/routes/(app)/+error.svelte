<script lang="ts">
	import { page } from '$app/state';
	import Button from '#lib/components/Button.svelte';
</script>

<div class="box">
	<h1>{page.status === 404 ? 'Not found' : 'Something went wrong'}</h1>
	<p>
		{page.status === 404
			? 'This page does not exist, or you do not have access to it.'
			: (page.error?.message ?? 'Please try again.')}
	</p>
	<Button href="/classes">Back to classes</Button>
</div>

<style>
	.box {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}
	h1 {
		font-size: 28px;
		font-weight: 700;
	}
	p {
		color: var(--text-muted);
	}
</style>

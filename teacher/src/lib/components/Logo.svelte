<script lang="ts">
	let { inverse = false }: { inverse?: boolean } = $props();
</script>

<div class="logo" class:inverse>
	<span class="mark" aria-hidden="true">{'{ }'}</span>
	<span class="name">ParsonXam</span>
</div>

<style>
	.logo {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 700;
		font-size: 17px;
	}
	.mark {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		background: var(--primary);
		color: var(--text-inverse);
		font: 700 13px var(--font-mono);
	}
	.inverse {
		color: var(--text-inverse);
	}
	.inverse .mark {
		background: var(--text-inverse);
		color: var(--primary);
	}
</style>

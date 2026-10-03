<script lang="ts">
	import PuzzleEditor from '#lib/components/PuzzleEditor.svelte';

	let { data } = $props();
</script>

<svelte:head><title>{data.puzzle.title} · ParsonXam</title></svelte:head>

<!-- Re-created when another puzzle is opened, so editor state never leaks between puzzles. -->
{#key data.puzzle.id}
	<PuzzleEditor exam={data.exam} cls={data.cls} puzzle={data.puzzle} />
{/key}

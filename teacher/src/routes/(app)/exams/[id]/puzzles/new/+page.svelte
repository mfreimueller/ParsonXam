<script lang="ts">
	import PuzzleEditor from '#lib/components/PuzzleEditor.svelte';

	let { data } = $props();
</script>

<svelte:head><title>New puzzle · ParsonXam</title></svelte:head>

<PuzzleEditor exam={data.exam} cls={data.cls} puzzle={null} />

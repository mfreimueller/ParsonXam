<script lang="ts">
	import type { ExamStatus } from '#lib/types.js';
	import Badge from './Badge.svelte';

	let { status }: { status: ExamStatus } = $props();
	const map = {
		draft: ['neutral', 'Draft'],
		scheduled: ['primary', 'Scheduled'],
		live: ['success', 'Live'],
		over: ['warn', 'Results open']
	} as const;
	const entry = $derived(map[status]);
</script>

<Badge tone={entry[0]}>● {entry[1]}</Badge>

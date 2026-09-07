<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Outpost Badge Studio</title>
	<meta
		name="description"
		content="Design and flash the Outpost e-ink name badge over USB — a 296×128 1-bit canvas studio."
	/>
</svelte:head>

{@render children()}

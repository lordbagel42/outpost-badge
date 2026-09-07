<script lang="ts">
	import { editor, LOGOS } from './store.svelte';
	import { PRESETS } from './presets';

	let fileInput: HTMLInputElement;

	async function onFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) await editor.addImageFile(file);
		input.value = '';
	}
</script>

<div class="grp">
	<span class="eyebrow">Add layer</span>
	<div class="btns">
		<button onclick={() => editor.addName()}>+ Name</button>
		<button onclick={() => editor.addText()}>+ Text</button>
		<button onclick={() => editor.addShape('rect')}>+ Rect</button>
		<button onclick={() => editor.addShape('ellipse')}>+ Ellipse</button>
		<button onclick={() => editor.addShape('line')}>+ Line</button>
		<button onclick={() => fileInput.click()}>+ Photo…</button>
	</div>
	<input
		bind:this={fileInput}
		type="file"
		accept="image/*"
		onchange={onFile}
		style="display:none"
	/>
</div>

<div class="grp">
	<span class="eyebrow">Logo library</span>
	<div class="logos">
		{#each LOGOS as lg (lg.id)}
			<button class="logo" title={lg.label} onclick={() => editor.addLogo(lg)}>
				<img src={lg.src} alt={lg.label} />
				<span>{lg.label}</span>
			</button>
		{/each}
	</div>
</div>

<div class="grp">
	<span class="eyebrow">Presets</span>
	<div class="btns">
		{#each PRESETS as p (p.id)}
			<button onclick={() => editor.applyPreset(p.id)}>{p.label}</button>
		{/each}
		<button class="danger" onclick={() => editor.reset()}>Reset</button>
	</div>
</div>

<style>
	.grp {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 12px;
	}
	.btns {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.logos {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
	}
	.logo {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 6px;
		height: auto;
	}
	.logo img {
		width: 100%;
		height: 34px;
		object-fit: contain;
		background: var(--paper);
		border: 1px solid var(--line-hi);
		image-rendering: auto;
	}
	.logo span {
		font-size: 10px;
		color: var(--fg-dim);
	}
</style>

<script lang="ts">
	import { editor } from './store.svelte';
	import type { Layer } from './types';

	const icons: Record<Layer['type'], string> = {
		image: '▨',
		logo: '◈',
		text: 'T',
		shape: '▧'
	};

	let dragIndex = $state<number | null>(null);
	let overIndex = $state<number | null>(null);

	// display top-to-bottom = topmost layer first (reverse of array order)
	const rows = $derived(editor.project.layers.map((l, i) => ({ l, i })).reverse());

	function onDragStart(i: number) {
		dragIndex = i;
	}
	function onDrop(target: number) {
		if (dragIndex !== null && dragIndex !== target) editor.reorder(dragIndex, target);
		dragIndex = null;
		overIndex = null;
	}
</script>

<div class="panel-head">
	<span class="eyebrow">Layers</span>
	<span class="count">{editor.project.layers.length}</span>
</div>
<div class="list">
	{#if editor.project.layers.length === 0}
		<div class="empty">no layers yet — add one below</div>
	{/if}
	{#each rows as { l, i } (l.id)}
		<div
			class="row"
			class:sel={editor.selectedId === l.id}
			class:over={overIndex === i}
			draggable="true"
			role="button"
			tabindex="0"
			ondragstart={() => onDragStart(i)}
			ondragover={(e) => {
				e.preventDefault();
				overIndex = i;
			}}
			ondrop={() => onDrop(i)}
			ondragend={() => {
				dragIndex = null;
				overIndex = null;
			}}
			onclick={() => editor.select(l.id)}
			onkeydown={(e) => e.key === 'Enter' && editor.select(l.id)}
		>
			<span class="ico">{icons[l.type]}</span>
			<span class="nm" title={l.name}>{l.name}</span>
			<button
				class="tiny ghost eye"
				title={l.visible ? 'Hide' : 'Show'}
				onclick={(e) => {
					e.stopPropagation();
					l.visible = !l.visible;
					editor.persist();
				}}>{l.visible ? '◉' : '○'}</button
			>
			<button
				class="tiny ghost"
				title="Duplicate"
				onclick={(e) => {
					e.stopPropagation();
					editor.duplicate(l.id);
				}}>⧉</button
			>
			<button
				class="tiny ghost danger"
				title="Delete"
				onclick={(e) => {
					e.stopPropagation();
					editor.remove(l.id);
				}}>✕</button
			>
		</div>
	{/each}
</div>
{#if editor.selected}
	<div class="zctl">
		<button class="tiny" title="To top" onclick={() => editor.move(editor.selectedId!, 'top')}
			>⤒</button
		>
		<button class="tiny" title="Up" onclick={() => editor.move(editor.selectedId!, 'up')}>↑</button>
		<button class="tiny" title="Down" onclick={() => editor.move(editor.selectedId!, 'down')}
			>↓</button
		>
		<button class="tiny" title="To bottom" onclick={() => editor.move(editor.selectedId!, 'bottom')}
			>⤓</button
		>
	</div>
{/if}

<style>
	.panel-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
	}
	.count {
		font-family: var(--mono);
		font-size: 10px;
		color: var(--fg-faint);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 240px;
		overflow-y: auto;
	}
	.empty {
		color: var(--fg-faint);
		font-size: 11px;
		padding: 8px 4px;
		font-style: italic;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 6px;
		border: 1px solid transparent;
		border-radius: var(--radius);
		background: var(--bg-1);
		cursor: pointer;
	}
	.row:hover {
		background: var(--bg-2);
	}
	.row.sel {
		border-color: var(--accent-dim);
		background: var(--bg-2);
		box-shadow: inset 2px 0 0 var(--accent);
	}
	.row.over {
		border-color: var(--accent);
	}
	.ico {
		font-family: var(--pixel);
		width: 16px;
		text-align: center;
		color: var(--accent);
		font-size: 12px;
	}
	.nm {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 12px;
	}
	.eye {
		color: var(--fg-dim);
	}
	.zctl {
		display: flex;
		gap: 4px;
		margin-top: 6px;
	}
	.zctl button {
		flex: 1;
	}
</style>

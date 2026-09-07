<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { badge } from '$lib/usb/badge.svelte';
	import BadgeLink from '$lib/usb/BadgeLink.svelte';
	import { editor } from './store.svelte';
	import { renderBits } from './render';
	import { BADGE_W, BADGE_H } from './types';
	import CanvasStage from './CanvasStage.svelte';
	import PreviewPanel from './PreviewPanel.svelte';
	import LayerList from './LayerList.svelte';
	import AddPanel from './AddPanel.svelte';
	import Inspector from './Inspector.svelte';
	import Toolbar from './Toolbar.svelte';

	const blank = new Uint8Array(BADGE_W * BADGE_H).fill(1);

	// Final 1-bit render, reactive to project + loaded images.
	const bits = $derived.by(() => {
		void editor.loadTick;
		if (!browser) return blank;
		return renderBits(editor.project, editor.resolve);
	});

	// keep image assets loading
	$effect(() => {
		editor.preloadAll();
	});

	onMount(() => {
		editor.load();
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
			if (!(e.ctrlKey || e.metaKey)) return;
			const k = e.key.toLowerCase();
			if (k === 'z' && !e.shiftKey) {
				e.preventDefault();
				editor.undo();
			} else if ((k === 'z' && e.shiftKey) || k === 'y') {
				e.preventDefault();
				editor.redo();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	// ---- toasts ----
	type ToastKind = 'info' | 'good' | 'bad';
	let toasts = $state<{ id: number; msg: string; kind: ToastKind }[]>([]);
	let toastId = 0;
	function notify(msg: string, kind: ToastKind = 'info') {
		const id = ++toastId;
		toasts.push({ id, msg, kind });
		setTimeout(() => {
			toasts = toasts.filter((t) => t.id !== id);
		}, 3200);
	}

	const statusMeta: Record<string, { label: string; color: string }> = {
		disconnected: { label: 'Disconnected', color: 'var(--fg-faint)' },
		connecting: { label: 'Connecting…', color: 'var(--warn)' },
		connected: { label: 'Connected', color: 'var(--good)' },
		bootsel: { label: 'BOOTSEL', color: 'var(--warn)' },
		error: { label: 'Error', color: 'var(--bad)' }
	};
	const sm = $derived(statusMeta[badge.status] ?? statusMeta.disconnected);
	const zooms = [2, 3, 4, 6, 8];
</script>

<div class="app">
	<header class="topbar">
		<div class="brand">
			<div class="logo-mark" aria-hidden="true">
				<span></span><span></span><span></span><span></span>
			</div>
			<div>
				<h1 class="pixel">OUTPOST<span class="accent">·</span>BADGE STUDIO</h1>
				<div class="sub">296×128 e-ink · 1bpp · RP2350 · Web Serial</div>
			</div>
		</div>
		<div class="status">
			<span class="pill">
				<span class="dot" style="background:{sm.color};color:{sm.color}"></span>
				{sm.label}
				{#if badge.id}<span class="idstr">{badge.id}</span>{/if}
			</span>
		</div>
	</header>

	<div class="actionbar">
		<Toolbar {bits} {notify} />
	</div>

	<main class="grid">
		<aside class="col left">
			<div class="card link">
				<BadgeLink />
			</div>
			<div class="card">
				<LayerList />
			</div>
			<div class="card">
				<AddPanel />
			</div>
		</aside>

		<section class="col center">
			<div class="stagebar">
				<span class="eyebrow">Canvas · {editor.zoom}× · WYSIWYG 1-bit</span>
				<div class="spacer"></div>
				<div class="zoomctl">
					{#each zooms as z (z)}
						<button class="tiny" class:on={editor.zoom === z} onclick={() => (editor.zoom = z)}
							>{z}×</button
						>
					{/each}
				</div>
				<label class="chk"
					><input type="checkbox" bind:checked={editor.showGrid} /> grid</label
				>
				<label class="chk"
					><input type="checkbox" bind:checked={editor.snapping} /> snap</label
				>
			</div>
			<div class="card stagecard">
				<CanvasStage {bits} />
			</div>
			<div class="card">
				<span class="eyebrow">Live preview · exactly what the badge shows</span>
				<div style="height:10px"></div>
				<PreviewPanel {bits} />
			</div>
		</section>

		<aside class="col right">
			<div class="card">
				<span class="eyebrow">Inspector</span>
				<Inspector />
			</div>
		</aside>
	</main>
</div>

<div class="toasts">
	{#each toasts as t (t.id)}
		<div class="toast {t.kind}">{t.msg}</div>
	{/each}
</div>

<style>
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 20px;
		border-bottom: 1px solid var(--line);
		background: linear-gradient(180deg, var(--bg-1), var(--bg-0));
		animation: riseIn 0.4s ease both;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.logo-mark {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2px;
		width: 26px;
		height: 26px;
	}
	.logo-mark span {
		background: var(--accent);
		border-radius: 1px;
	}
	.logo-mark span:nth-child(2),
	.logo-mark span:nth-child(3) {
		background: var(--accent-dim);
	}
	h1 {
		font-family: var(--pixel);
		font-size: 17px;
		letter-spacing: 1px;
		color: var(--fg);
	}
	h1 .accent {
		color: var(--accent);
	}
	.sub {
		font-family: var(--mono);
		font-size: 10px;
		color: var(--fg-faint);
		letter-spacing: 0.5px;
	}
	.idstr {
		color: var(--fg-faint);
		font-size: 10px;
		padding-left: 6px;
		border-left: 1px solid var(--line-hi);
	}
	.actionbar {
		padding: 12px 20px;
		border-bottom: 1px solid var(--line);
		background: var(--bg-1);
		animation: riseIn 0.45s ease both;
		animation-delay: 0.05s;
	}
	.grid {
		flex: 1;
		display: grid;
		grid-template-columns: 300px minmax(0, 1fr) 320px;
		gap: 14px;
		padding: 16px 20px;
		align-items: start;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.card {
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 12px;
		box-shadow: var(--shadow);
		animation: riseIn 0.5s ease both;
	}
	.left .card {
		animation-delay: 0.1s;
	}
	.center .card {
		animation-delay: 0.16s;
	}
	.right .card {
		animation-delay: 0.22s;
	}
	.stagecard {
		padding: 0;
		overflow: hidden;
	}
	.stagebar {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.spacer {
		flex: 1;
	}
	.zoomctl {
		display: flex;
		gap: 3px;
	}
	.zoomctl .on {
		background: var(--accent);
		color: var(--ink);
		border-color: var(--accent-hi);
	}
	.chk {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		cursor: pointer;
		font-size: 11px;
		color: var(--fg-dim);
	}
	.link :global(*) {
		font-size: 12px;
	}
	.toasts {
		position: fixed;
		bottom: 18px;
		right: 18px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		z-index: 100;
	}
	.toast {
		font-family: var(--mono);
		font-size: 12px;
		padding: 9px 14px;
		border: 1px solid var(--line-hi);
		background: var(--bg-2);
		border-left: 3px solid var(--fg-faint);
		box-shadow: var(--shadow);
		animation: riseIn 0.25s ease both;
		max-width: 320px;
	}
	.toast.good {
		border-left-color: var(--good);
		color: var(--good);
	}
	.toast.bad {
		border-left-color: var(--bad);
		color: var(--bad);
	}
	.toast.info {
		border-left-color: var(--accent);
	}
	@media (max-width: 1180px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>

<script lang="ts">
	import { badge } from '$lib/usb/badge.svelte';
	import { exportWireImage } from './exportWire';
	import { BADGE_W, BADGE_H } from './types';
	import { editor } from './store.svelte';

	type ToastKind = 'info' | 'good' | 'bad';
	let { bits, notify }: { bits: Uint8Array; notify: (msg: string, kind?: ToastKind) => void } =
		$props();

	let sending = $state(false);
	let busy = $state<string | null>(null);

	const connected = $derived(badge.status === 'connected');

	let photoInput: HTMLInputElement;
	async function onPhoto(e: Event) {
		const f = (e.target as HTMLInputElement).files?.[0];
		if (f) {
			await editor.uploadPhoto(f);
			notify('Photo added — tune the dither in the Inspector', 'good');
		}
		(e.target as HTMLInputElement).value = '';
	}

	async function send() {
		if (!connected || sending) return;
		sending = true;
		notify('Flashing image to badge…', 'info');
		try {
			const ok = await badge.setImage(exportWireImage());
			notify(ok ? 'Image written & displayed ✓' : 'Badge rejected the image', ok ? 'good' : 'bad');
		} catch (e) {
			notify(`Send failed: ${(e as Error).message}`, 'bad');
		} finally {
			sending = false;
		}
	}

	async function show(mode: 'badge' | 'doom' | 'help') {
		if (!connected || busy) return;
		busy = mode;
		try {
			await badge.show(mode);
			notify(`Showing ${mode.toUpperCase()}`, 'good');
		} catch (e) {
			notify(`Show failed: ${(e as Error).message}`, 'bad');
		} finally {
			busy = null;
		}
	}

	async function clearCustom() {
		if (!connected || busy) return;
		busy = 'clear';
		try {
			const ok = await badge.clearCustom();
			notify(ok ? 'Reverted to baked badge' : 'Clear failed', ok ? 'good' : 'bad');
		} catch (e) {
			notify(`Clear failed: ${(e as Error).message}`, 'bad');
		} finally {
			busy = null;
		}
	}

	function triggerDownload(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function downloadPng() {
		const c = document.createElement('canvas');
		c.width = BADGE_W;
		c.height = BADGE_H;
		const ctx = c.getContext('2d')!;
		const img = ctx.createImageData(BADGE_W, BADGE_H);
		for (let i = 0; i < bits.length; i++) {
			const v = bits[i] === 1 ? 255 : 0;
			img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
			img.data[i * 4 + 3] = 255;
		}
		ctx.putImageData(img, 0, 0);
		c.toBlob((b) => {
			if (b) triggerDownload(b, 'outpost-badge.png');
			notify('Downloaded PNG', 'good');
		});
	}

	function downloadBin() {
		const wire = exportWireImage();
		triggerDownload(new Blob([wire], { type: 'application/octet-stream' }), 'outpost-badge.bin');
		notify(`Downloaded ${wire.length}-byte wire image`, 'good');
	}
</script>

<div class="toolbar">
	<div class="grp">
		<span class="eyebrow">Edit</span>
		<div class="btns">
			<button disabled={!editor.canUndo} onclick={() => editor.undo()} title="Undo (Ctrl+Z)">↶ Undo</button>
			<button disabled={!editor.canRedo} onclick={() => editor.redo()} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
		</div>
	</div>
	<div class="grp">
		<span class="eyebrow">Device</span>
		<div class="btns">
			<button class="primary" disabled={!connected || sending} onclick={send}>
				{sending ? '◐ Sending…' : '⇪ Send to badge'}
			</button>
			<button disabled={!connected || !!busy} onclick={() => show('badge')}>Show badge</button>
			<button disabled={!connected || !!busy} onclick={() => show('doom')}>Show DOOM</button>
			<button disabled={!connected || !!busy} onclick={() => show('help')}>Show help</button>
			<button class="danger" disabled={!connected || !!busy} onclick={clearCustom}
				>Clear custom</button
			>
		</div>
	</div>
	<div class="grp">
		<span class="eyebrow">Export</span>
		<div class="btns">
			<button onclick={downloadPng}>↓ PNG</button>
			<button onclick={downloadBin}>↓ .bin (4736)</button>
		</div>
	</div>
	<div class="grp">
		<span class="eyebrow">Photo</span>
		<div class="btns">
			<button class="primary" onclick={() => photoInput.click()}>⇪ Upload photo</button>
		</div>
	</div>
	<input bind:this={photoInput} type="file" accept="image/*" onchange={onPhoto} style="display:none" />
</div>

<style>
	.toolbar {
		display: flex;
		gap: 22px;
		flex-wrap: wrap;
		align-items: flex-end;
	}
	.grp {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.btns {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
</style>

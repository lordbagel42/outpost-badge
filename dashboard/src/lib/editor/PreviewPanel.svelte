<script lang="ts">
	import { BADGE_W, BADGE_H } from './types';

	let { bits }: { bits: Uint8Array } = $props();

	let c1: HTMLCanvasElement;
	let c2: HTMLCanvasElement;
	let cInv: HTMLCanvasElement;

	function paint(
		canvas: HTMLCanvasElement | undefined,
		scale: number,
		invert: boolean,
		ink: boolean
	) {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const img = ctx.createImageData(BADGE_W, BADGE_H);
		const d = img.data;
		for (let i = 0; i < bits.length; i++) {
			let white = bits[i] === 1;
			if (invert) white = !white;
			let r: number, g: number, b: number;
			if (ink) {
				r = white ? 0xe9 : 0x0b;
				g = white ? 0xe4 : 0x0c;
				b = white ? 0xd6 : 0x0f;
			} else {
				r = g = b = white ? 255 : 0;
			}
			d[i * 4] = r;
			d[i * 4 + 1] = g;
			d[i * 4 + 2] = b;
			d[i * 4 + 3] = 255;
		}
		// scale via an offscreen 1:1 buffer
		const off = new OffscreenCanvas(BADGE_W, BADGE_H);
		off.getContext('2d')!.putImageData(img, 0, 0);
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(off, 0, 0, BADGE_W * scale, BADGE_H * scale);
	}

	$effect(() => {
		// re-read bits so the effect tracks it
		void bits;
		paint(c1, 1, false, true);
		paint(c2, 2, false, true);
		paint(cInv, 1, true, false);
	});
</script>

<div class="previews">
	<div class="pv">
		<span class="eyebrow">1:1 · true size</span>
		<div class="frame">
			<canvas bind:this={c1} width={BADGE_W} height={BADGE_H}></canvas>
		</div>
		<span class="dim">{BADGE_W}×{BADGE_H} · 1bpp</span>
	</div>
	<div class="pv">
		<span class="eyebrow">2× e-ink</span>
		<div class="frame">
			<canvas bind:this={c2} width={BADGE_W * 2} height={BADGE_H * 2}></canvas>
		</div>
	</div>
	<div class="pv">
		<span class="eyebrow">inverted</span>
		<div class="frame">
			<canvas bind:this={cInv} width={BADGE_W} height={BADGE_H}></canvas>
		</div>
	</div>
</div>

<style>
	.previews {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		align-items: flex-start;
	}
	.pv {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.frame {
		border: 1px solid var(--line-hi);
		background: var(--ink);
		padding: 5px;
		box-shadow: var(--shadow);
		line-height: 0;
	}
	canvas {
		display: block;
		image-rendering: pixelated;
	}
	.dim {
		font-size: 10px;
		color: var(--fg-faint);
		font-family: var(--mono);
	}
</style>

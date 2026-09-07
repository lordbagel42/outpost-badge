<script lang="ts">
	import { editor } from './store.svelte';
	import { BADGE_W, BADGE_H, type Layer, type TextLayer } from './types';

	let { bits }: { bits: Uint8Array } = $props();

	let base: HTMLCanvasElement;
	let overlay: HTMLCanvasElement;
	let wrap: HTMLDivElement;
	let dragOver = $state(false);

	const zoom = $derived(editor.zoom);
	const dispW = $derived(BADGE_W * zoom);
	const dispH = $derived(BADGE_H * zoom);

	// ---- paint the WYSIWYG 1-bit base, scaled up ----
	$effect(() => {
		void bits;
		void zoom;
		if (!base) return;
		const ctx = base.getContext('2d');
		if (!ctx) return;
		const img = ctx.createImageData(BADGE_W, BADGE_H);
		const d = img.data;
		for (let i = 0; i < bits.length; i++) {
			const white = bits[i] === 1;
			d[i * 4] = white ? 0xe9 : 0x0b;
			d[i * 4 + 1] = white ? 0xe4 : 0x0c;
			d[i * 4 + 2] = white ? 0xd6 : 0x0f;
			d[i * 4 + 3] = 255;
		}
		const off = new OffscreenCanvas(BADGE_W, BADGE_H);
		off.getContext('2d')!.putImageData(img, 0, 0);
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, base.width, base.height);
		ctx.drawImage(off, 0, 0, dispW, dispH);
	});

	// ---- geometry helpers (badge space) ----
	function center(l: Layer) {
		return { cx: l.x + l.width / 2, cy: l.y + l.height / 2 };
	}
	function rot(x: number, y: number, deg: number) {
		const a = (deg * Math.PI) / 180;
		const c = Math.cos(a);
		const s = Math.sin(a);
		return { x: x * c - y * s, y: x * s + y * c };
	}
	function invRot(x: number, y: number, deg: number) {
		return rot(x, y, -deg);
	}
	function corners(l: Layer) {
		const { cx, cy } = center(l);
		const hw = l.width / 2;
		const hh = l.height / 2;
		return [
			[-hw, -hh],
			[hw, -hh],
			[hw, hh],
			[-hw, hh]
		].map(([lx, ly]) => {
			const r = rot(lx, ly, l.rotation);
			return { x: cx + r.x, y: cy + r.y };
		});
	}
	function hitLayer(px: number, py: number): Layer | null {
		for (let i = editor.project.layers.length - 1; i >= 0; i--) {
			const l = editor.project.layers[i];
			if (!l.visible || l.locked) continue;
			const { cx, cy } = center(l);
			const lp = invRot(px - cx, py - cy, l.rotation);
			if (Math.abs(lp.x) <= l.width / 2 + 1 && Math.abs(lp.y) <= l.height / 2 + 1) return l;
		}
		return null;
	}

	// ---- overlay: grid, selection box, handles, snap guides ----
	let guides = $state<{ v: number[]; h: number[] }>({ v: [], h: [] });

	$effect(() => {
		void bits;
		void zoom;
		void editor.selectedId;
		void editor.showGrid;
		void guides;
		// touch selected geometry so overlay tracks live edits
		const sel = editor.selected;
		if (sel) void (sel.x + sel.y + sel.width + sel.height + sel.rotation);
		drawOverlay();
	});

	function drawOverlay() {
		if (!overlay) return;
		const ctx = overlay.getContext('2d');
		if (!ctx) return;
		ctx.clearRect(0, 0, overlay.width, overlay.height);
		const z = zoom;

		if (editor.showGrid && z >= 3) {
			ctx.lineWidth = 1;
			ctx.strokeStyle = 'rgba(120,130,145,0.14)';
			ctx.beginPath();
			for (let x = 0; x <= BADGE_W; x++) {
				ctx.moveTo(x * z + 0.5, 0);
				ctx.lineTo(x * z + 0.5, dispH);
			}
			for (let y = 0; y <= BADGE_H; y++) {
				ctx.moveTo(0, y * z + 0.5);
				ctx.lineTo(dispW, y * z + 0.5);
			}
			ctx.stroke();
			// 8px major grid
			ctx.strokeStyle = 'rgba(120,130,145,0.22)';
			ctx.beginPath();
			for (let x = 0; x <= BADGE_W; x += 8) {
				ctx.moveTo(x * z + 0.5, 0);
				ctx.lineTo(x * z + 0.5, dispH);
			}
			for (let y = 0; y <= BADGE_H; y += 8) {
				ctx.moveTo(0, y * z + 0.5);
				ctx.lineTo(dispW, y * z + 0.5);
			}
			ctx.stroke();
		}

		// snap guides
		if (guides.v.length || guides.h.length) {
			ctx.strokeStyle = 'var(--accent)';
			ctx.strokeStyle = '#f5a623';
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 3]);
			ctx.beginPath();
			for (const gx of guides.v) {
				ctx.moveTo(gx * z + 0.5, 0);
				ctx.lineTo(gx * z + 0.5, dispH);
			}
			for (const gy of guides.h) {
				ctx.moveTo(0, gy * z + 0.5);
				ctx.lineTo(dispW, gy * z + 0.5);
			}
			ctx.stroke();
			ctx.setLineDash([]);
		}

		const l = editor.selected;
		if (!l) return;
		const pts = corners(l).map((p) => ({ x: p.x * z, y: p.y * z }));
		ctx.strokeStyle = '#f5a623';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(pts[0].x, pts[0].y);
		for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
		ctx.closePath();
		ctx.stroke();

		// rotate handle stalk from top edge midpoint
		const midTop = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
		const { cx, cy } = center(l);
		const up = rot(0, -l.height / 2 - 18 / z, l.rotation);
		const rotPt = { x: (cx + up.x) * z, y: (cy + up.y) * z };
		ctx.beginPath();
		ctx.moveTo(midTop.x, midTop.y);
		ctx.lineTo(rotPt.x, rotPt.y);
		ctx.stroke();
		drawHandle(ctx, rotPt.x, rotPt.y, true);

		// corner handles
		for (const p of pts) drawHandle(ctx, p.x, p.y, false);
	}

	function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, round: boolean) {
		ctx.fillStyle = '#0a0b0d';
		ctx.strokeStyle = '#f5a623';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		if (round) ctx.arc(x, y, 5, 0, Math.PI * 2);
		else ctx.rect(x - 4.5, y - 4.5, 9, 9);
		ctx.fill();
		ctx.stroke();
	}

	// ---- pointer interaction ----
	type DragMode = 'move' | 'resize' | 'rotate' | null;
	let drag: {
		mode: DragMode;
		cornerSign: [number, number];
		fixedWorld: { x: number; y: number };
		start: { px: number; py: number };
		snap: Layer;
		startRotDeg: number;
		startPointerAngle: number;
	} | null = null;

	function toBadge(e: PointerEvent) {
		const r = base.getBoundingClientRect();
		return { px: (e.clientX - r.left) / zoom, py: (e.clientY - r.top) / zoom };
	}

	function handleAt(px: number, py: number, l: Layer): { mode: DragMode; sign: [number, number] } | null {
		const z = zoom;
		const tol = 8 / z;
		const cs = corners(l);
		const signs: [number, number][] = [
			[-1, -1],
			[1, -1],
			[1, 1],
			[-1, 1]
		];
		for (let i = 0; i < 4; i++) {
			if (Math.hypot(cs[i].x - px, cs[i].y - py) <= tol) return { mode: 'resize', sign: signs[i] };
		}
		// rotate handle
		const { cx, cy } = center(l);
		const up = rot(0, -l.height / 2 - 18 / z, l.rotation);
		if (Math.hypot(cx + up.x - px, cy + up.y - py) <= tol) return { mode: 'rotate', sign: [0, 0] };
		return null;
	}

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		(e.target as Element).setPointerCapture?.(e.pointerId);
		const { px, py } = toBadge(e);
		const sel = editor.selected;
		if (sel) {
			const h = handleAt(px, py, sel);
			if (h) {
				beginHandleDrag(sel, h.mode, h.sign, px, py);
				return;
			}
		}
		const hit = hitLayer(px, py);
		editor.select(hit ? hit.id : null);
		if (hit) beginMove(hit, px, py);
	}

	function beginMove(l: Layer, px: number, py: number) {
		drag = {
			mode: 'move',
			cornerSign: [0, 0],
			fixedWorld: { x: 0, y: 0 },
			start: { px, py },
			snap: structuredClone($state.snapshot(l)) as Layer,
			startRotDeg: l.rotation,
			startPointerAngle: 0
		};
	}

	function beginHandleDrag(l: Layer, mode: DragMode, sign: [number, number], px: number, py: number) {
		const { cx, cy } = center(l);
		// opposite corner world position (fixed during resize)
		const opp = rot((-sign[0] * l.width) / 2, (-sign[1] * l.height) / 2, l.rotation);
		drag = {
			mode,
			cornerSign: sign,
			fixedWorld: { x: cx + opp.x, y: cy + opp.y },
			start: { px, py },
			snap: structuredClone($state.snapshot(l)) as Layer,
			startRotDeg: l.rotation,
			startPointerAngle: (Math.atan2(py - cy, px - cx) * 180) / Math.PI
		};
	}

	function onPointerMove(e: PointerEvent) {
		if (!drag) return;
		const l = editor.selected;
		if (!l) return;
		const { px, py } = toBadge(e);

		if (drag.mode === 'move') {
			let nx = drag.snap.x + (px - drag.start.px);
			let ny = drag.snap.y + (py - drag.start.py);
			const g = { v: [] as number[], h: [] as number[] };
			if (editor.snapping) {
				const cxNow = nx + l.width / 2;
				const cyNow = ny + l.height / 2;
				const snapT = 3;
				const vTargets = [0, BADGE_W / 2, BADGE_W];
				const hTargets = [0, BADGE_H / 2, BADGE_H];
				// center snaps
				for (const t of vTargets)
					if (Math.abs(cxNow - t) < snapT) {
						nx = t - l.width / 2;
						g.v.push(t);
					}
				for (const t of hTargets)
					if (Math.abs(cyNow - t) < snapT) {
						ny = t - l.height / 2;
						g.h.push(t);
					}
				// edge snaps
				if (Math.abs(nx) < snapT) {
					nx = 0;
					g.v.push(0);
				}
				if (Math.abs(nx + l.width - BADGE_W) < snapT) {
					nx = BADGE_W - l.width;
					g.v.push(BADGE_W);
				}
				if (Math.abs(ny) < snapT) {
					ny = 0;
					g.h.push(0);
				}
				if (Math.abs(ny + l.height - BADGE_H) < snapT) {
					ny = BADGE_H - l.height;
					g.h.push(BADGE_H);
				}
			}
			l.x = Math.round(nx);
			l.y = Math.round(ny);
			guides = g;
		} else if (drag.mode === 'resize') {
			const d = invRot(px - drag.fixedWorld.x, py - drag.fixedWorld.y, drag.startRotDeg);
			let hw = (drag.cornerSign[0] * d.x) / 2;
			let hh = (drag.cornerSign[1] * d.y) / 2;
			hw = Math.max(2, hw);
			hh = Math.max(2, hh);
			const newW = hw * 2;
			const newH = hh * 2;
			// new center = midpoint between fixed corner and dragged pointer along local axes
			const half = rot(drag.cornerSign[0] * hw, drag.cornerSign[1] * hh, drag.startRotDeg);
			const ncx = drag.fixedWorld.x + half.x;
			const ncy = drag.fixedWorld.y + half.y;
			if (l.type === 'text') {
				const t = l as TextLayer;
				const scale = newH / drag.snap.height;
				t.fontSize = Math.max(4, Math.round((drag.snap as TextLayer).fontSize * scale));
				editor.syncTextSize(t);
				// reposition so the fixed corner stays put-ish
				t.x = Math.round(ncx - t.width / 2);
				t.y = Math.round(ncy - t.height / 2);
			} else {
				l.width = Math.round(newW);
				l.height = Math.round(newH);
				l.x = Math.round(ncx - l.width / 2);
				l.y = Math.round(ncy - l.height / 2);
			}
		} else if (drag.mode === 'rotate') {
			const { cx, cy } = center(l);
			const ang = (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
			let deg = drag.startRotDeg + (ang - drag.startPointerAngle);
			if (e.shiftKey) deg = Math.round(deg / 15) * 15;
			// snap near cardinals
			const near = Math.round(deg / 90) * 90;
			if (Math.abs(deg - near) < 3) deg = near;
			l.rotation = Math.round(deg);
		}
	}

	function onPointerUp() {
		if (drag) {
			guides = { v: [], h: [] };
			editor.persist();
			drag = null;
		}
	}

	// ---- keyboard nudge ----
	function onKey(e: KeyboardEvent) {
		const l = editor.selected;
		if (!l) return;
		const step = e.shiftKey ? 10 : 1;
		let handled = true;
		if (e.key === 'ArrowLeft') editor.nudge(l.id, -step, 0);
		else if (e.key === 'ArrowRight') editor.nudge(l.id, step, 0);
		else if (e.key === 'ArrowUp') editor.nudge(l.id, 0, -step);
		else if (e.key === 'ArrowDown') editor.nudge(l.id, 0, step);
		else if (e.key === 'Delete' || e.key === 'Backspace') editor.remove(l.id);
		else if ((e.key === 'd' || e.key === 'D') && (e.metaKey || e.ctrlKey)) editor.duplicate(l.id);
		else handled = false;
		if (handled) e.preventDefault();
	}

	// ---- drag & drop image ----
	async function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const file = e.dataTransfer?.files?.[0];
		if (file && file.type.startsWith('image/')) await editor.addImageFile(file);
	}
</script>

<svelte:window on:pointermove={onPointerMove} on:pointerup={onPointerUp} />

<div
	class="stage"
	bind:this={wrap}
	role="application"
	aria-label="Badge canvas editor"
	tabindex="0"
	onkeydown={onKey}
	ondragover={(e) => {
		e.preventDefault();
		dragOver = true;
	}}
	ondragleave={() => (dragOver = false)}
	ondrop={onDrop}
>
	<div class="canvas-box" style="width:{dispW}px;height:{dispH}px">
		<canvas
			bind:this={base}
			width={dispW}
			height={dispH}
			class="base"
			onpointerdown={onPointerDown}
		></canvas>
		<canvas bind:this={overlay} width={dispW} height={dispH} class="ovl"></canvas>
		{#if dragOver}
			<div class="dropz">drop image to add layer</div>
		{/if}
	</div>
</div>

<style>
	.stage {
		overflow: auto;
		padding: 20px;
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 0;
		background:
			radial-gradient(1200px 400px at 50% -10%, rgba(245, 166, 35, 0.05), transparent 60%),
			var(--bg-0);
		outline: none;
	}
	.canvas-box {
		position: relative;
		box-shadow:
			0 0 0 1px var(--line-hi),
			var(--shadow);
		background: var(--ink);
	}
	canvas {
		position: absolute;
		inset: 0;
		image-rendering: pixelated;
	}
	.base {
		z-index: 1;
	}
	.ovl {
		z-index: 2;
		pointer-events: none;
	}
	.dropz {
		position: absolute;
		inset: 0;
		z-index: 3;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(245, 166, 35, 0.12);
		border: 2px dashed var(--accent);
		color: var(--accent-hi);
		font-family: var(--pixel);
		font-size: 14px;
		text-transform: uppercase;
		letter-spacing: 1px;
	}
</style>

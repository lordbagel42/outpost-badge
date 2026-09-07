// Flatten the layer stack to a final 1-bit badge image.
// Everything here is browser-only (uses <canvas>); callers must guard with `browser`.
import {
	BADGE_W,
	BADGE_H,
	type Layer,
	type Project,
	type ImageLayer,
	type LogoLayer,
	type TextLayer,
	type ShapeLayer,
	type FitMode
} from './types';
import { dither } from './dither';

export type Resolver = (src: string) => HTMLImageElement | null;

let scratch: HTMLCanvasElement | null = null;
function scratchCtx(): CanvasRenderingContext2D {
	if (!scratch) {
		scratch = document.createElement('canvas');
		scratch.width = BADGE_W;
		scratch.height = BADGE_H;
	}
	const ctx = scratch.getContext('2d', { willReadFrequently: true })!;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, BADGE_W, BADGE_H);
	return ctx;
}

function fontString(l: TextLayer): string {
	const style = l.italic ? 'italic ' : '';
	return `${style}${l.weight} ${l.fontSize}px ${l.font}`;
}

// contain/cover source rectangle for image drawing
function fitRect(iw: number, ih: number, w: number, h: number, mode: FitMode) {
	if (mode === 'stretch' || iw === 0 || ih === 0) {
		return { dx: 0, dy: 0, dw: w, dh: h };
	}
	const ir = iw / ih;
	const br = w / h;
	let dw = w;
	let dh = h;
	if (mode === 'fit') {
		if (ir > br) {
			dw = w;
			dh = w / ir;
		} else {
			dh = h;
			dw = h * ir;
		}
	} else {
		// fill / cover
		if (ir > br) {
			dh = h;
			dw = h * ir;
		} else {
			dw = w;
			dh = w / ir;
		}
	}
	return { dx: (w - dw) / 2, dy: (h - dh) / 2, dw, dh };
}

/** Measure a text layer's bounding box in badge px. Browser only. */
export function measureTextLayer(l: TextLayer): { w: number; h: number } {
	const ctx = scratchCtx();
	ctx.font = fontString(l);
	try {
		(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
			`${l.letterSpacing}px`;
	} catch {
		/* older engines */
	}
	const lines = l.text.split('\n');
	let maxw = 0;
	for (const line of lines) {
		const m = ctx.measureText(line || ' ');
		let wpx = m.width;
		if (l.letterSpacing) wpx += l.letterSpacing * Math.max(0, line.length - 1);
		maxw = Math.max(maxw, wpx);
	}
	const lineH = l.fontSize * 1.15;
	return { w: Math.max(2, Math.ceil(maxw)), h: Math.max(2, Math.ceil(lineH * lines.length)) };
}

function drawLayerContent(ctx: CanvasRenderingContext2D, l: Layer, resolve: Resolver) {
	// ctx is already translated/rotated so the layer box is centered at origin,
	// spanning [-w/2,-h/2] .. [w/2,h/2].
	const w = l.width;
	const h = l.height;
	if (l.type === 'image' || l.type === 'logo') {
		const il = l as ImageLayer | LogoLayer;
		const img = resolve(il.src);
		if (!img || !img.complete || img.naturalWidth === 0) return;
		const r = fitRect(img.naturalWidth, img.naturalHeight, w, h, il.fit);
		if (il.fit === 'fill') {
			ctx.save();
			ctx.beginPath();
			ctx.rect(-w / 2, -h / 2, w, h);
			ctx.clip();
			ctx.drawImage(img, -w / 2 + r.dx, -h / 2 + r.dy, r.dw, r.dh);
			ctx.restore();
		} else {
			ctx.drawImage(img, -w / 2 + r.dx, -h / 2 + r.dy, r.dw, r.dh);
		}
	} else if (l.type === 'text') {
		const t = l as TextLayer;
		ctx.font = fontString(t);
		ctx.textBaseline = 'top';
		ctx.textAlign = t.align;
		ctx.fillStyle = t.color === 'white' ? '#fff' : '#000';
		try {
			(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
				`${t.letterSpacing}px`;
		} catch {
			/* ignore */
		}
		const lines = t.text.split('\n');
		const lineH = t.fontSize * 1.15;
		let ax = -w / 2;
		if (t.align === 'center') ax = 0;
		else if (t.align === 'right') ax = w / 2;
		lines.forEach((line, i) => {
			ctx.fillText(line, ax, -h / 2 + i * lineH);
		});
	} else if (l.type === 'shape') {
		const s = l as ShapeLayer;
		const fill = s.fill === 'none' ? null : s.fill === 'white' ? '#fff' : '#000';
		const stroke = s.stroke === 'none' ? null : s.stroke === 'white' ? '#fff' : '#000';
		ctx.lineWidth = s.strokeWidth;
		if (s.shape === 'rect') {
			ctx.beginPath();
			const rad = Math.min(s.radius, w / 2, h / 2);
			if (rad > 0 && ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, rad);
			else ctx.rect(-w / 2, -h / 2, w, h);
			if (fill) {
				ctx.fillStyle = fill;
				ctx.fill();
			}
			if (stroke) {
				ctx.strokeStyle = stroke;
				ctx.stroke();
			}
		} else if (s.shape === 'ellipse') {
			ctx.beginPath();
			ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
			if (fill) {
				ctx.fillStyle = fill;
				ctx.fill();
			}
			if (stroke) {
				ctx.strokeStyle = stroke;
				ctx.stroke();
			}
		} else {
			// line across the box
			ctx.beginPath();
			ctx.moveTo(-w / 2, -h / 2);
			ctx.lineTo(w / 2, h / 2);
			ctx.strokeStyle = stroke ?? '#000';
			ctx.stroke();
		}
	}
}

// Rasterize a single layer into a badge-size RGBA buffer.
function rasterizeLayer(l: Layer, resolve: Resolver): Uint8ClampedArray {
	const ctx = scratchCtx();
	ctx.save();
	ctx.translate(l.x + l.width / 2, l.y + l.height / 2);
	if (l.rotation) ctx.rotate((l.rotation * Math.PI) / 180);
	drawLayerContent(ctx, l, resolve);
	ctx.restore();
	return ctx.getImageData(0, 0, BADGE_W, BADGE_H).data;
}

function applyAdjust(g: number, brightness: number, contrast: number, gamma: number): number {
	let v = g + (brightness / 100) * 255;
	const C = (contrast / 100) * 128;
	const factor = (259 * (C + 255)) / (255 * (259 - C));
	v = factor * (v - 128) + 128;
	if (gamma !== 1) {
		const nv = Math.min(1, Math.max(0, v / 255));
		v = 255 * Math.pow(nv, 1 / gamma);
	}
	return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Render the whole project to a final 1-bit buffer.
 * Returns Uint8Array length BADGE_W*BADGE_H, 1 = WHITE, 0 = BLACK.
 */
export function renderBits(project: Project, resolve: Resolver): Uint8Array {
	const N = BADGE_W * BADGE_H;
	const acc = new Float32Array(N);
	const locked = new Uint8Array(N);
	const bg = project.background === 'black' ? 0 : 255;
	acc.fill(bg);

	for (const l of project.layers) {
		if (!l.visible || l.opacity <= 0) continue;
		const data = rasterizeLayer(l, resolve);
		const isImg = l.type === 'image' || l.type === 'logo';
		const adj = isImg ? (l as ImageLayer) : null;

		// gray + coverage for this layer
		const lg = new Float32Array(N);
		const la = new Float32Array(N);
		for (let i = 0; i < N; i++) {
			const a = (data[i * 4 + 3] / 255) * l.opacity;
			la[i] = a;
			if (a <= 0) continue;
			let g = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
			if (adj) g = applyAdjust(g, adj.brightness, adj.contrast, adj.gamma);
			lg[i] = g;
		}

		if (l.dither !== 'inherit') {
			// pre-dither this layer to 1-bit, composite as crisp ink/white where covered
			const lb = dither(lg, BADGE_W, BADGE_H, l.dither, l.threshold, l.invert);
			for (let i = 0; i < N; i++) {
				const a = la[i];
				if (a >= 0.5) {
					acc[i] = lb[i] ? 255 : 0;
					locked[i] = 1;
				} else if (a > 0) {
					acc[i] = acc[i] * (1 - a) + (lb[i] ? 255 : 0) * a;
				}
			}
		} else {
			for (let i = 0; i < N; i++) {
				const a = la[i];
				if (a <= 0) continue;
				acc[i] = acc[i] * (1 - a) + lg[i] * a;
			}
		}
	}

	return dither(
		acc,
		BADGE_W,
		BADGE_H,
		project.global.mode,
		project.global.threshold,
		project.global.invert,
		locked
	);
}

/** Build an ImageData (BADGE_W x BADGE_H) from 1-bit buffer. 1=white paper-ish, 0=ink. */
export function bitsToImageData(bits: Uint8Array, inkStyle = false): ImageData {
	const img = new ImageData(BADGE_W, BADGE_H);
	const d = img.data;
	for (let i = 0; i < bits.length; i++) {
		const white = bits[i] === 1;
		let r: number, g: number, b: number;
		if (inkStyle) {
			// e-ink tinted paper vs near-black ink
			r = white ? 0xe9 : 0x0a;
			g = white ? 0xe4 : 0x0b;
			b = white ? 0xd6 : 0x0d;
		} else {
			r = g = b = white ? 255 : 0;
		}
		d[i * 4] = r;
		d[i * 4 + 1] = g;
		d[i * 4 + 2] = b;
		d[i * 4 + 3] = 255;
	}
	return img;
}

import { browser } from '$app/environment';
import {
	BADGE_W,
	BADGE_H,
	uid,
	type Layer,
	type Project,
	type ImageLayer,
	type LogoLayer,
	type TextLayer,
	type ShapeLayer,
	type ShapeKind,
	type DitherMode
} from './types';
import { emptyProject, defaultGlobal, PRESETS } from './presets';
import { measureTextLayer } from './render';

export interface LogoDef {
	id: string;
	label: string;
	src: string;
	w: number;
	h: number;
}

export const LOGOS: LogoDef[] = [
	{ id: 'outpost', label: 'OUTPOST', src: '/logos/outpost-banner.png', w: 260, h: 88 },
	{ id: 'hackclub', label: 'Hack Club', src: '/logos/hackclub-flag.png', w: 96, h: 34 },
	{ id: 'opensauce', label: 'Open Sauce', src: '/logos/open-sauce.png', w: 44, h: 56 },
	{ id: 'raygen', label: 'Raygen', src: '/logos/raygen-avatar.png', w: 96, h: 103 },
];

const STORAGE_KEY = 'outpost-badge-studio.project.v1';

function commonDefaults() {
	return {
		rotation: 0,
		visible: true,
		opacity: 1,
		locked: false,
		dither: 'inherit' as const,
		threshold: 128,
		invert: false
	};
}

class EditorStore {
	project = $state<Project>(emptyProject());
	selectedId = $state<string | null>(null);
	zoom = $state(4);
	showGrid = $state(true);
	snapping = $state(true);
	loadTick = $state(0);

	#images = new Map<string, HTMLImageElement>();
	#loading = new Set<string>();

	get selected(): Layer | null {
		return this.project.layers.find((l) => l.id === this.selectedId) ?? null;
	}

	resolve = (src: string): HTMLImageElement | null => {
		return this.#images.get(src) ?? null;
	};

	ensureImage(src: string) {
		if (!browser || !src) return;
		if (this.#images.has(src) || this.#loading.has(src)) return;
		this.#loading.add(src);
		const img = new Image();
		img.onload = () => {
			this.#images.set(src, img);
			this.#loading.delete(src);
			this.loadTick++;
		};
		img.onerror = () => {
			this.#loading.delete(src);
		};
		img.src = src;
	}

	/** ensure every image/logo layer src is loading (call in an effect) */
	preloadAll() {
		for (const l of this.project.layers) {
			if (l.type === 'image' || l.type === 'logo') this.ensureImage((l as ImageLayer).src);
		}
	}

	select(id: string | null) {
		this.selectedId = id;
	}

	#add(layer: Layer, select = true) {
		this.project.layers.push(layer);
		if (select) this.selectedId = layer.id;
		this.persist();
		return layer;
	}

	addText() {
		const l: TextLayer = {
			...commonDefaults(),
			id: uid('t'),
			type: 'text',
			name: 'Text',
			x: 20,
			y: 48,
			width: 120,
			height: 34,
			text: 'TEXT',
			font: "'Space Mono', monospace",
			fontSize: 30,
			weight: 700,
			italic: false,
			letterSpacing: 0,
			align: 'left',
			color: 'black'
		};
		this.syncTextSize(l);
		return this.#add(l);
	}

	addName(name = 'YOUR NAME') {
		const l: TextLayer = {
			...commonDefaults(),
			id: uid('name'),
			type: 'text',
			name: 'Name',
			x: 16,
			y: 44,
			width: 200,
			height: 48,
			text: name,
			font: "'Silkscreen', monospace",
			fontSize: 40,
			weight: 700,
			italic: false,
			letterSpacing: 1,
			align: 'left',
			color: 'black'
		};
		this.syncTextSize(l);
		return this.#add(l);
	}

	addShape(shape: ShapeKind = 'rect') {
		const l: ShapeLayer = {
			...commonDefaults(),
			id: uid('s'),
			type: 'shape',
			name: shape === 'rect' ? 'Rect' : shape === 'ellipse' ? 'Ellipse' : 'Line',
			x: 40,
			y: 40,
			width: 80,
			height: 48,
			shape,
			fill: shape === 'line' ? 'none' : 'black',
			stroke: shape === 'line' ? 'black' : 'none',
			strokeWidth: 2,
			radius: 0
		};
		return this.#add(l);
	}

	addLogo(def: LogoDef) {
		const scale = Math.min(1, (BADGE_W - 20) / def.w, (BADGE_H - 20) / def.h);
		const w = Math.round(def.w * scale);
		const h = Math.round(def.h * scale);
		const l: LogoLayer = {
			...commonDefaults(),
			id: uid('lg'),
			type: 'logo',
			name: def.label,
			x: Math.round((BADGE_W - w) / 2),
			y: Math.round((BADGE_H - h) / 2),
			width: w,
			height: h,
			src: def.src,
			fit: 'fit',
			brightness: 0,
			contrast: 0,
			gamma: 1
		};
		this.ensureImage(def.src);
		return this.#add(l);
	}

	addImageDataUrl(dataUrl: string, name = 'Photo') {
		// size to a sensible default; will refine once the image loads
		const l: ImageLayer = {
			...commonDefaults(),
			id: uid('img'),
			type: 'image',
			name,
			x: 20,
			y: 12,
			width: 120,
			height: 104,
			src: dataUrl,
			fit: 'fit',
			brightness: 0,
			contrast: 0,
			gamma: 1
		};
		this.ensureImage(dataUrl);
		// refine aspect once loaded
		if (browser) {
			const probe = new Image();
			probe.onload = () => {
				const ar = probe.naturalWidth / probe.naturalHeight;
				const layer = this.project.layers.find((x) => x.id === l.id) as ImageLayer | undefined;
				if (!layer) return;
				let w = 120;
				let h = w / ar;
				if (h > 120) {
					h = 120;
					w = h * ar;
				}
				layer.width = Math.round(w);
				layer.height = Math.round(h);
				layer.x = Math.round((BADGE_W - layer.width) / 2);
				layer.y = Math.round((BADGE_H - layer.height) / 2);
				this.persist();
			};
			probe.src = dataUrl;
		}
		return this.#add(l);
	}

	async addImageFile(file: File) {
		const dataUrl = await fileToDataUrl(file);
		return this.addImageDataUrl(dataUrl, file.name.replace(/\.[^.]+$/, '') || 'Photo');
	}

	syncTextSize(l: TextLayer) {
		if (!browser) return;
		const m = measureTextLayer(l);
		l.width = m.w;
		l.height = m.h;
	}

	remove(id: string) {
		const i = this.project.layers.findIndex((l) => l.id === id);
		if (i < 0) return;
		this.project.layers.splice(i, 1);
		if (this.selectedId === id) this.selectedId = this.project.layers[Math.max(0, i - 1)]?.id ?? null;
		this.persist();
	}

	duplicate(id: string) {
		const l = this.project.layers.find((x) => x.id === id);
		if (!l) return;
		const copy = structuredClone($state.snapshot(l)) as Layer;
		copy.id = uid(l.type);
		copy.name = l.name + ' copy';
		copy.x += 6;
		copy.y += 6;
		const idx = this.project.layers.findIndex((x) => x.id === id);
		this.project.layers.splice(idx + 1, 0, copy);
		this.selectedId = copy.id;
		this.persist();
	}

	reorder(from: number, to: number) {
		const arr = this.project.layers;
		if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return;
		const [item] = arr.splice(from, 1);
		arr.splice(to, 0, item);
		this.persist();
	}

	move(id: string, dir: 'up' | 'down' | 'top' | 'bottom') {
		const i = this.project.layers.findIndex((l) => l.id === id);
		if (i < 0) return;
		const last = this.project.layers.length - 1;
		let to = i;
		if (dir === 'up') to = Math.min(last, i + 1);
		else if (dir === 'down') to = Math.max(0, i - 1);
		else if (dir === 'top') to = last;
		else to = 0;
		this.reorder(i, to);
	}

	nudge(id: string, dx: number, dy: number) {
		const l = this.project.layers.find((x) => x.id === id);
		if (!l) return;
		l.x += dx;
		l.y += dy;
		this.persist();
	}

	setGlobalDither(mode: DitherMode) {
		this.project.global.mode = mode;
		this.persist();
	}

	// ---- persistence ----
	persist = debounce(() => {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify($state.snapshot(this.project)));
		} catch {
			/* quota / private mode */
		}
	}, 250);

	load() {
		if (!browser) return;
		this.ensureFonts();
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const p = JSON.parse(raw) as Project;
				if (p && Array.isArray(p.layers)) {
					if (!p.global) p.global = defaultGlobal();
					if (!p.background) p.background = 'white';
					this.project = p;
					this.selectedId = p.layers[p.layers.length - 1]?.id ?? null;
					this.preloadAll();
					return;
				}
			}
		} catch {
			/* ignore malformed */
		}
		this.applyPreset('name-tag');
	}

	applyPreset(id: string) {
		const p = PRESETS.find((x) => x.id === id);
		if (!p) return;
		this.project = p.build();
		this.selectedId = this.project.layers[this.project.layers.length - 1]?.id ?? null;
		this.preloadAll();
		// text sizes need remeasure in-browser
		if (browser) {
			for (const l of this.project.layers) {
				if (l.type === 'text') this.syncTextSize(l as TextLayer);
			}
		}
		this.ensureFonts();
		this.persist();
	}

	ensureFonts() {
		if (!browser || typeof document === 'undefined' || !document.fonts) return;
		document.fonts
			.load("700 22px 'Phantom Sans'")
			.then(() => document.fonts.ready)
			.then(() => {
				for (const l of this.project.layers)
					if (l.type === 'text') this.syncTextSize(l as TextLayer);
				this.loadTick++;
			})
			.catch(() => {});
	}

	reset() {
		this.project = emptyProject();
		this.selectedId = null;
		this.persist();
	}
}

function fileToDataUrl(file: File): Promise<string> {
	const { promise, resolve, reject } = Promise.withResolvers<string>();
	const r = new FileReader();
	r.onload = () => resolve(r.result as string);
	r.onerror = reject;
	r.readAsDataURL(file);
	return promise;
}

function debounce<T extends (...a: never[]) => void>(fn: T, ms: number): T {
	let t: ReturnType<typeof setTimeout> | null = null;
	return ((...args: never[]) => {
		if (t) clearTimeout(t);
		t = setTimeout(() => fn(...args), ms);
	}) as T;
}

export const editor = new EditorStore();
export { BADGE_W, BADGE_H };

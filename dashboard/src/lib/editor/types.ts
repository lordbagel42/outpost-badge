// Editor data model for the Outpost Badge Studio.
// Target panel is 296 (X) x 128 (Y), 1bpp. bit=1 -> WHITE, bit=0 -> BLACK(ink).

export const BADGE_W = 296;
export const BADGE_H = 128;
export const WIRE_BYTES = (BADGE_W / 8) * BADGE_H; // 37 * 128 = 4736

export type DitherMode =
	| 'threshold'
	| 'bayer2'
	| 'bayer4'
	| 'bayer8'
	| 'floyd';

export type LayerType = 'image' | 'text' | 'logo' | 'shape';

export type ShapeKind = 'rect' | 'ellipse' | 'line';
export type FitMode = 'fit' | 'fill' | 'stretch';

export interface BaseLayer {
	id: string;
	type: LayerType;
	name: string;
	x: number; // top-left, badge coords
	y: number;
	width: number;
	height: number;
	rotation: number; // degrees, about layer center
	visible: boolean;
	opacity: number; // 0..1
	locked: boolean; // UI lock (not editable/selectable)
	// per-layer 1-bit conversion; 'inherit' -> participates in the global dither pass
	dither: DitherMode | 'inherit';
	threshold: number; // 0..255 used when this layer has its own dither mode
	invert: boolean;
}

export interface ImageLayer extends BaseLayer {
	type: 'image';
	src: string; // object URL or data URL
	fit: FitMode;
	brightness: number; // -100..100
	contrast: number; // -100..100
	gamma: number; // 0.2..3.0
}

export interface LogoLayer extends BaseLayer {
	type: 'logo';
	src: string; // /logos/*.svg|png
	fit: FitMode;
	brightness: number;
	contrast: number;
	gamma: number;
}

export interface TextLayer extends BaseLayer {
	type: 'text';
	text: string;
	font: string;
	fontSize: number; // px in badge space
	weight: 400 | 700;
	italic: boolean;
	letterSpacing: number;
	align: 'left' | 'center' | 'right';
	color: 'black' | 'white';
}

export interface ShapeLayer extends BaseLayer {
	type: 'shape';
	shape: ShapeKind;
	fill: 'black' | 'white' | 'none';
	stroke: 'black' | 'white' | 'none';
	strokeWidth: number;
	radius: number; // rect corner radius
}

export type Layer = ImageLayer | LogoLayer | TextLayer | ShapeLayer;

export interface GlobalDither {
	mode: DitherMode;
	threshold: number; // 0..255
	invert: boolean;
}

export interface Project {
	version: 1;
	layers: Layer[]; // index 0 = bottom
	global: GlobalDither;
	background: 'white' | 'black';
}

export const FONT_CHOICES = [
	{ label: 'Phantom Sans (Hack Club)', css: "'Phantom Sans', sans-serif" },
	{ label: 'Space Mono', css: "'Space Mono', monospace" },
	{ label: 'IBM Plex Mono', css: "'IBM Plex Mono', monospace" },
	{ label: 'Silkscreen (pixel)', css: "'Silkscreen', monospace" },
	{ label: 'System Sans', css: 'system-ui, sans-serif' },
	{ label: 'Serif', css: 'Georgia, serif' }
];

export const DITHER_LABELS: Record<DitherMode, string> = {
	threshold: 'Threshold',
	bayer2: 'Bayer 2×2',
	bayer4: 'Bayer 4×4',
	bayer8: 'Bayer 8×8',
	floyd: 'Floyd–Steinberg'
};

let counter = 0;
export function uid(prefix = 'l'): string {
	counter += 1;
	return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

import { uid, type Layer, type Project, type TextLayer } from './types';

export function defaultGlobal() {
	return { mode: 'floyd' as const, threshold: 128, invert: false };
}

function baseText(partial: Partial<TextLayer>): TextLayer {
	return {
		id: uid('t'),
		type: 'text',
		name: 'Text',
		x: 12,
		y: 12,
		width: 120,
		height: 40,
		rotation: 0,
		visible: true,
		opacity: 1,
		locked: false,
		dither: 'inherit',
		threshold: 128,
		invert: false,
		text: 'HELLO',
		font: "'Silkscreen', monospace",
		fontSize: 34,
		weight: 700,
		italic: false,
		letterSpacing: 0,
		align: 'left',
		color: 'black',
		...partial
	};
}

export function emptyProject(): Project {
	return {
		version: 1,
		layers: [],
		global: defaultGlobal(),
		background: 'white'
	};
}

export interface Preset {
	id: string;
	label: string;
	build: () => Project;
}

export const PRESETS: Preset[] = [
	{
		id: 'name-tag',
		label: 'Name Tag',
		build: () => ({
			version: 1,
			background: 'white',
			global: { mode: 'threshold', threshold: 128, invert: false },
			layers: [
				{
					id: uid('s'),
					type: 'shape',
					name: 'Frame',
					x: 4,
					y: 4,
					width: 288,
					height: 120,
					rotation: 0,
					visible: true,
					opacity: 1,
					locked: false,
					dither: 'inherit',
					threshold: 128,
					invert: false,
					shape: 'rect',
					fill: 'none',
					stroke: 'black',
					strokeWidth: 3,
					radius: 8
				} as Layer,
				baseText({
					name: 'HELLO badge',
					text: 'HELLO',
					x: 20,
					y: 16,
					fontSize: 26,
					font: "'Space Mono', monospace",
					letterSpacing: 4
				}),
				baseText({
					name: 'Name',
					text: 'my name is',
					x: 20,
					y: 44,
					fontSize: 14,
					weight: 400,
					font: "'IBM Plex Mono', monospace",
					color: 'black'
				}),
				baseText({
					name: 'Big name',
					text: 'ADA',
					x: 20,
					y: 62,
					fontSize: 48,
					font: "'Silkscreen', monospace"
				})
			]
		})
	},
	{
		id: 'outpost',
		label: 'Outpost Banner',
		build: () => ({
			version: 1,
			background: 'white',
			global: { mode: 'bayer4', threshold: 128, invert: false },
			layers: [
				{
					id: uid('lg'),
					type: 'logo',
					name: 'OUTPOST',
					x: 8,
					y: 20,
					width: 280,
					height: 94,
					rotation: 0,
					visible: true,
					opacity: 1,
					locked: false,
					dither: 'inherit',
					threshold: 128,
					invert: false,
					src: '/logos/outpost-banner.png',
					fit: 'fit',
					brightness: 0,
					contrast: 0,
					gamma: 1
				} as Layer
			]
		})
	},
	{
		id: 'blank',
		label: 'Blank',
		build: () => emptyProject()
	}
];

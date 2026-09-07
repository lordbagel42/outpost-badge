import { uid, type Layer, type LogoLayer, type Project, type TextLayer } from './types';

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

function baseLogo(partial: Partial<LogoLayer>): LogoLayer {
	return {
		id: uid('lg'),
		type: 'logo',
		name: 'Logo',
		x: 0,
		y: 0,
		width: 100,
		height: 60,
		rotation: 0,
		visible: true,
		opacity: 1,
		locked: false,
		dither: 'inherit',
		threshold: 128,
		invert: false,
		src: '',
		fit: 'fit',
		brightness: 0,
		contrast: 0,
		gamma: 1,
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
		id: 'namebadge',
		label: 'Name Badge (your photo)',
		build: () => ({
			version: 1,
			background: 'white',
			global: { mode: 'threshold', threshold: 128, invert: false },
			layers: [
				{
					id: uid('s'),
					type: 'shape',
					name: 'Photo frame',
					x: 168,
					y: 0,
					width: 128,
					height: 128,
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
					strokeWidth: 2,
					radius: 0
				} as Layer,
				baseText({
					name: 'Photo hint',
					text: 'UPLOAD PHOTO',
					x: 176,
					y: 58,
					width: 112,
					height: 14,
					fontSize: 12,
					font: "'IBM Plex Mono', monospace",
					weight: 400,
					align: 'center'
				}),
				{
					id: uid('s'),
					type: 'shape',
					name: 'Divider',
					x: 166,
					y: 0,
					width: 1,
					height: 128,
					rotation: 0,
					visible: true,
					opacity: 1,
					locked: false,
					dither: 'inherit',
					threshold: 128,
					invert: false,
					shape: 'rect',
					fill: 'black',
					stroke: 'none',
					strokeWidth: 0,
					radius: 0
				} as Layer,
				baseText({
					name: 'Name',
					text: 'YOUR NAME',
					x: 6,
					y: 4,
					width: 156,
					height: 24,
					fontSize: 22,
					font: "'Phantom Sans', sans-serif",
					weight: 700
				}),
				baseLogo({ name: 'OUTPOST', src: '/logos/outpost-banner.png', x: 6, y: 32, width: 148, height: 38 }),
				baseLogo({ name: 'Open Sauce', src: '/logos/open-sauce.png', x: 110, y: 74, width: 38, height: 48, dither: 'floyd' }),
				baseLogo({ name: 'Hack Club', src: '/logos/hackclub-flag.png', x: 4, y: 88, width: 94, height: 33 })
			]
		})
	},
	{
		id: 'raygen',
		label: 'Raygen Rupe',
		build: () => ({
			version: 1,
			background: 'white',
			global: { mode: 'threshold', threshold: 128, invert: false },
			layers: [
				baseLogo({
					name: 'Avatar',
					src: '/logos/raygen-avatar.png',
					x: 168,
					y: 0,
					width: 128,
					height: 128,
					fit: 'fill',
					dither: 'floyd'
				}),
				{
					id: uid('s'),
					type: 'shape',
					name: 'Divider',
					x: 166,
					y: 0,
					width: 1,
					height: 128,
					rotation: 0,
					visible: true,
					opacity: 1,
					locked: false,
					dither: 'inherit',
					threshold: 128,
					invert: false,
					shape: 'rect',
					fill: 'black',
					stroke: 'none',
					strokeWidth: 0,
					radius: 0
				} as Layer,
				baseText({
					name: 'Name',
					text: '@Raygen Rupe',
					x: 6,
					y: 4,
					width: 156,
					height: 24,
					fontSize: 22,
					font: "'Phantom Sans', sans-serif",
					weight: 700
				}),
				baseLogo({ name: 'OUTPOST', src: '/logos/outpost-banner.png', x: 6, y: 32, width: 148, height: 38 }),
				baseLogo({ name: 'Open Sauce', src: '/logos/open-sauce.png', x: 110, y: 74, width: 38, height: 48, dither: 'floyd' }),
				baseLogo({ name: 'Hack Club', src: '/logos/hackclub-flag.png', x: 4, y: 88, width: 94, height: 33 })
			]
		})
	},
	{
		id: 'blank',
		label: 'Blank',
		build: () => emptyProject()
	}
];

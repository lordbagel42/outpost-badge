// 1-bit conversion. Input: grayscale Float32Array (0=black..255=white), width x height.
// Optional `locked` mask (Uint8Array, 1 = pixel already decided, keep as-is in `out`).
// Output written into `out` Uint8Array: 1 = WHITE, 0 = BLACK.
import type { DitherMode } from './types';

const BAYER2 = [
	[0, 2],
	[3, 1]
];
const BAYER4 = [
	[0, 8, 2, 10],
	[12, 4, 14, 6],
	[3, 11, 1, 9],
	[15, 7, 13, 5]
];
const BAYER8 = [
	[0, 32, 8, 40, 2, 34, 10, 42],
	[48, 16, 56, 24, 50, 18, 58, 26],
	[12, 44, 4, 36, 14, 46, 6, 38],
	[60, 28, 52, 20, 62, 30, 54, 22],
	[3, 35, 11, 43, 1, 33, 9, 41],
	[51, 19, 59, 27, 49, 17, 57, 25],
	[15, 47, 7, 39, 13, 45, 5, 37],
	[63, 31, 55, 23, 61, 29, 53, 21]
];

function bayerThreshold(m: number[][], n: number, x: number, y: number): number {
	// normalized 0..255 threshold value for the ordered matrix cell
	const v = m[y % n][x % n];
	return ((v + 0.5) / (n * n)) * 255;
}

/**
 * Convert grayscale to 1-bit. Returns a new Uint8Array (1=white).
 * `gray` is not mutated (a working copy is made for error diffusion).
 */
export function dither(
	gray: Float32Array,
	w: number,
	h: number,
	mode: DitherMode,
	threshold: number,
	invert: boolean,
	locked?: Uint8Array,
	out?: Uint8Array
): Uint8Array {
	const n = w * h;
	const bits = out ?? new Uint8Array(n);

	if (mode === 'floyd') {
		// error diffusion on a mutable copy
		const buf = new Float32Array(gray);
		for (let y = 0; y < h; y++) {
			const ltr = true; // left-to-right (serpentine could be added; keep classic)
			for (let ix = 0; ix < w; ix++) {
				const x = ltr ? ix : w - 1 - ix;
				const i = y * w + x;
				if (locked && locked[i]) {
					bits[i] = gray[i] >= 128 ? 1 : 0;
					continue;
				}
				const old = buf[i];
				const white = old >= threshold;
				bits[i] = white ? 1 : 0;
				const newv = white ? 255 : 0;
				const err = old - newv;
				// Floyd–Steinberg kernel
				const push = (xx: number, yy: number, f: number) => {
					if (xx < 0 || xx >= w || yy < 0 || yy >= h) return;
					const j = yy * w + xx;
					if (locked && locked[j]) return;
					buf[j] += err * f;
				};
				push(x + 1, y, 7 / 16);
				push(x - 1, y + 1, 3 / 16);
				push(x, y + 1, 5 / 16);
				push(x + 1, y + 1, 1 / 16);
			}
		}
	} else {
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const i = y * w + x;
				if (locked && locked[i]) {
					bits[i] = gray[i] >= 128 ? 1 : 0;
					continue;
				}
				let t = threshold;
				if (mode === 'bayer2') t = bayerThreshold(BAYER2, 2, x, y);
				else if (mode === 'bayer4') t = bayerThreshold(BAYER4, 4, x, y);
				else if (mode === 'bayer8') t = bayerThreshold(BAYER8, 8, x, y);
				bits[i] = gray[i] >= t ? 1 : 0;
			}
		}
	}

	if (invert) {
		for (let i = 0; i < n; i++) {
			if (locked && locked[i]) continue;
			bits[i] = bits[i] ? 0 : 1;
		}
	}
	return bits;
}

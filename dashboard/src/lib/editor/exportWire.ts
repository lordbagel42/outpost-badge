// Wire-format export per protocol.md:
//   Screen-space, row-major by Y. 128 rows x 37 bytes = 4736 bytes.
//   MSB of each byte = leftmost pixel (smaller X). bit=1 -> WHITE, bit=0 -> BLACK.
import { BADGE_W, BADGE_H, WIRE_BYTES } from './types';
import { renderBits } from './render';
import { editor } from './store.svelte';

const ROW_BYTES = BADGE_W / 8; // 37

/** Pack a 1-bit buffer (len BADGE_W*BADGE_H, 1=white) into the 4736-byte wire image. */
export function packWire(bits: Uint8Array): Uint8Array {
	const out = new Uint8Array(WIRE_BYTES); // zero = black
	for (let y = 0; y < BADGE_H; y++) {
		const rowBase = y * ROW_BYTES;
		const pxBase = y * BADGE_W;
		for (let x = 0; x < BADGE_W; x++) {
			if (bits[pxBase + x] === 1) {
				// white -> set bit; MSB = leftmost pixel
				out[rowBase + (x >> 3)] |= 0x80 >> (x & 7);
			}
		}
	}
	return out;
}

/** Unpack a wire image back to a 1-bit buffer (1=white). Used by tests/round-trips. */
export function unpackWire(wire: Uint8Array): Uint8Array {
	const bits = new Uint8Array(BADGE_W * BADGE_H);
	for (let y = 0; y < BADGE_H; y++) {
		const rowBase = y * ROW_BYTES;
		const pxBase = y * BADGE_W;
		for (let x = 0; x < BADGE_W; x++) {
			bits[pxBase + x] = (wire[rowBase + (x >> 3)] >> (7 - (x & 7))) & 1;
		}
	}
	return bits;
}

/** Render the current editor project and return the 4736-byte wire image. Browser only. */
export function exportWireImage(): Uint8Array {
	const bits = renderBits(editor.project, editor.resolve);
	return packWire(bits);
}

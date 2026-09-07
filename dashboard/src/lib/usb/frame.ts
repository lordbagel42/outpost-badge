import { crc16ccitt } from './crc16';

// Frame layout:
//   'O'(0x4F) 'B'(0x42) | cmd:u8 | len:u16 LE | payload[len] | crc16:u16 LE
// crc16 is computed over: cmd, len_lo, len_hi, payload...
const MAGIC_O = 0x4f;
const MAGIC_B = 0x42;

// Largest legitimate payload in this protocol (SET_IMAGE = 4736 bytes). A
// header claiming more than this must be spurious 'OB' bytes inside a log
// line, so the decoder resyncs past it instead of waiting for phantom bytes.
const MAX_PAYLOAD = 4736;

export interface Frame {
	cmd: number;
	payload: Uint8Array;
}

/** Encode a command + payload into a wire frame. */
export function encodeFrame(cmd: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
	const len = payload.length;
	const out = new Uint8Array(2 + 1 + 2 + len + 2);
	out[0] = MAGIC_O;
	out[1] = MAGIC_B;
	out[2] = cmd & 0xff;
	out[3] = len & 0xff;
	out[4] = (len >> 8) & 0xff;
	out.set(payload, 5);

	// CRC covers cmd, len_lo, len_hi, payload
	const crcRegion = new Uint8Array(3 + len);
	crcRegion[0] = cmd & 0xff;
	crcRegion[1] = len & 0xff;
	crcRegion[2] = (len >> 8) & 0xff;
	crcRegion.set(payload, 3);
	const crc = crc16ccitt(crcRegion);

	out[5 + len] = crc & 0xff;
	out[5 + len + 1] = (crc >> 8) & 0xff;
	return out;
}

/**
 * Streaming frame decoder. Feed arbitrary byte chunks; it scans a rolling
 * buffer for the 'OB' magic, validates crc16, and returns complete frames.
 * Interleaved plain-text log lines (which do not form a valid framed+crc
 * sequence) are skipped byte-by-byte during resync.
 */
export class FrameDecoder {
	private buf: Uint8Array = new Uint8Array(0);

	/** Append bytes and return every complete, crc-valid frame now available. */
	push(chunk: Uint8Array): Frame[] {
		if (chunk.length) {
			const merged = new Uint8Array(this.buf.length + chunk.length);
			merged.set(this.buf, 0);
			merged.set(chunk, this.buf.length);
			this.buf = merged;
		}

		const frames: Frame[] = [];
		let i = 0;

		while (i < this.buf.length) {
			// Find magic 'O''B'
			if (this.buf[i] !== MAGIC_O) {
				i++;
				continue;
			}
			// Need at least header (5 bytes) to read len
			if (i + 1 >= this.buf.length) break; // wait for more; keep possible 'O'
			if (this.buf[i + 1] !== MAGIC_B) {
				i++;
				continue;
			}
			// Have 'OB'. Need cmd + len (3 more bytes) => i+4 accessible
			if (i + 4 >= this.buf.length) break; // incomplete header, wait for more
			const cmd = this.buf[i + 2];
			const len = this.buf[i + 3] | (this.buf[i + 4] << 8);
			const frameEnd = i + 5 + len + 2; // + payload + crc
			if (len > MAX_PAYLOAD) {
				// Length exceeds any real frame — this 'OB' is log-line noise.
				i++; // resync past it
				continue;
			}
			if (frameEnd > this.buf.length) {
				// Plausible length but bytes not all here yet: a genuine frame in
				// progress, or noise we'll reject on CRC once its bytes arrive.
				// Wait for more data (bounded: at most MAX_PAYLOAD before resync).
				break;
			}
			const payload = this.buf.subarray(i + 5, i + 5 + len);
			const crcRegion = this.buf.subarray(i + 2, i + 5 + len); // cmd,len_lo,len_hi,payload
			const crc = crc16ccitt(crcRegion);
			const gotCrc = this.buf[i + 5 + len] | (this.buf[i + 5 + len + 1] << 8);
			if (crc === gotCrc) {
				frames.push({ cmd, payload: payload.slice() });
				i = frameEnd;
			} else {
				// False magic inside noise; skip one byte and resync.
				i++;
			}
		}

		// Retain unconsumed tail.
		this.buf = i > 0 ? this.buf.slice(i) : this.buf;
		return frames;
	}

	reset(): void {
		this.buf = new Uint8Array(0);
	}
}

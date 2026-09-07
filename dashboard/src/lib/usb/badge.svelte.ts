import { browser } from '$app/environment';
import { encodeFrame, FrameDecoder, type Frame } from './frame';

export type BadgeInfo = {
	verMajor: number;
	verMinor: number;
	hasCustom: boolean;
	mode: number;
	name: string;
};

export type BadgeStatus = 'disconnected' | 'connecting' | 'connected' | 'bootsel' | 'error';

// Command opcodes (host -> device).
const CMD_PING = 0x01;
const CMD_GET_INFO = 0x02;
const CMD_SET_IMAGE = 0x10;
const CMD_SET_NAME = 0x11;
const CMD_SHOW_BADGE = 0x20;
const CMD_SHOW_DOOM = 0x21;
const CMD_SHOW_HELP = 0x22;
const CMD_CLEAR_CUSTOM = 0x30;
const CMD_REBOOT_BOOTSEL = 0x31;

// Reply opcodes (device -> host). PING/INFO echo cmd|0x80; the ok-returning
// commands all share the generic 0x90 reply, so requests are serialized and
// correlated by their expected reply opcode.
const RSP_PING = 0x81;
const RSP_INFO = 0x82;
const RSP_OK = 0x90;

const WIRE_IMAGE_BYTES = 4736;
const VID_RP2350 = 0x2e8a;

const TIMEOUT_DEFAULT = 2000;
const TIMEOUT_IMAGE = 5000;

interface Pending {
	expect: number;
	resolve: (payload: Uint8Array) => void;
	reject: (err: Error) => void;
	timer: number;
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class BadgeSerial {
	status = $state<BadgeStatus>('disconnected');
	info = $state<BadgeInfo | null>(null);
	lastError = $state('');
	/** PING id string, e.g. "OUTPOST-ADV 1.0" (reactive, beyond the base interface). */
	id = $state('');

	private port: SerialPort | null = null;
	private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
	private decoder = new FrameDecoder();
	private pending: Pending | null = null;
	private lock: Promise<unknown> = Promise.resolve();
	private onPortDisconnect = () => {
		this.lastError = 'device disconnected';
		void this.teardown();
		this.status = 'disconnected';
		this.info = null;
		this.id = '';
	};

	async connect(): Promise<void> {
		if (!browser) throw new Error('Web Serial is only available in the browser');
		const serial = navigator.serial;
		if (!serial) {
			this.lastError = 'Web Serial not supported (use Chrome or Edge)';
			this.status = 'error';
			throw new Error(this.lastError);
		}
		try {
			this.status = 'connecting';
			this.lastError = '';
			this.port = await serial.requestPort({ filters: [{ usbVendorId: VID_RP2350 }] });
			await this.port.open({ baudRate: 115200 });
			this.decoder.reset();
			const writable = this.port.writable;
			const readable = this.port.readable;
			if (!writable || !readable) throw new Error('serial streams unavailable');
			this.writer = writable.getWriter();
			this.startReadLoop(readable);
			this.port.addEventListener('disconnect', this.onPortDisconnect);

			this.id = await this.ping();
			await this.getInfo();
			this.status = 'connected';
		} catch (e) {
			this.lastError = errMsg(e);
			await this.teardown();
			this.status = 'error';
			throw e;
		}
	}

	async disconnect(): Promise<void> {
		await this.teardown();
		this.status = 'disconnected';
		this.info = null;
		this.id = '';
	}

	async ping(): Promise<string> {
		const payload = await this.request(CMD_PING, undefined, RSP_PING, TIMEOUT_DEFAULT);
		return new TextDecoder().decode(payload).trim();
	}

	async getInfo(): Promise<BadgeInfo> {
		const p = await this.request(CMD_GET_INFO, undefined, RSP_INFO, TIMEOUT_DEFAULT);
		if (p.length < 5) throw new Error('malformed GET_INFO reply');
		const nameLen = p[4];
		const name = new TextDecoder().decode(p.subarray(5, 5 + nameLen));
		const info: BadgeInfo = {
			verMajor: p[0],
			verMinor: p[1],
			hasCustom: p[2] !== 0,
			mode: p[3],
			name
		};
		this.info = info;
		return info;
	}

	async setImage(bytes: Uint8Array): Promise<boolean> {
		if (bytes.length !== WIRE_IMAGE_BYTES) {
			throw new Error(`image must be ${WIRE_IMAGE_BYTES} bytes, got ${bytes.length}`);
		}
		const p = await this.request(CMD_SET_IMAGE, bytes, RSP_OK, TIMEOUT_IMAGE);
		const ok = p.length > 0 && p[0] === 1;
		if (ok) await this.getInfo();
		return ok;
	}

	async setName(name: string): Promise<boolean> {
		const payload = new TextEncoder().encode(name);
		if (payload.length > 63) throw new Error('name must be \u2264 63 bytes');
		const p = await this.request(CMD_SET_NAME, payload, RSP_OK, TIMEOUT_DEFAULT);
		const ok = p.length > 0 && p[0] === 1;
		if (ok) await this.getInfo();
		return ok;
	}

	async show(mode: 'doom' | 'badge' | 'help'): Promise<boolean> {
		const cmd = mode === 'doom' ? CMD_SHOW_DOOM : mode === 'help' ? CMD_SHOW_HELP : CMD_SHOW_BADGE;
		const p = await this.request(cmd, undefined, RSP_OK, TIMEOUT_DEFAULT);
		const ok = p.length > 0 && p[0] === 1;
		if (ok) await this.getInfo();
		return ok;
	}

	async clearCustom(): Promise<boolean> {
		const p = await this.request(CMD_CLEAR_CUSTOM, undefined, RSP_OK, TIMEOUT_DEFAULT);
		const ok = p.length > 0 && p[0] === 1;
		if (ok) await this.getInfo();
		return ok;
	}

	async rebootBootsel(): Promise<void> {
		try {
			if (this.writer) await this.writer.write(encodeFrame(CMD_REBOOT_BOOTSEL));
		} catch {
			// Port may already be dropping as the device reboots; ignore.
		}
		await this.teardown();
		this.status = 'bootsel';
		this.info = null;
		this.id = '';
	}

	// --- internals ---

	private startReadLoop(readable: ReadableStream<Uint8Array>): void {
		const reader = readable.getReader();
		this.reader = reader;
		void (async () => {
			try {
				for (;;) {
					const { value, done } = await reader.read();
					if (done) break;
					if (value && value.length) {
						for (const frame of this.decoder.push(value)) this.dispatch(frame);
					}
				}
			} catch (e) {
				if (this.status === 'connected') this.lastError = errMsg(e);
			} finally {
				try {
					reader.releaseLock();
				} catch {
					/* already released */
				}
			}
		})();
	}

	private dispatch(frame: Frame): void {
		const pending = this.pending;
		if (pending && frame.cmd === pending.expect) {
			clearTimeout(pending.timer);
			this.pending = null;
			pending.resolve(frame.payload);
		}
		// Unmatched frames (stray/log-adjacent) are ignored; requests serialize.
	}

	private request(
		cmd: number,
		payload: Uint8Array | undefined,
		expect: number,
		timeoutMs: number
	): Promise<Uint8Array> {
		const task = () =>
			new Promise<Uint8Array>((resolve, reject) => {
				const writer = this.writer;
				if (!writer) {
					reject(new Error('not connected'));
					return;
				}
				const timer = setTimeout(() => {
					if (this.pending && this.pending.timer === timer) {
						this.pending = null;
						reject(new Error(`timeout waiting for reply 0x${expect.toString(16)}`));
					}
				}, timeoutMs) as unknown as number;
				this.pending = { expect, resolve, reject, timer };
				writer.write(encodeFrame(cmd, payload)).catch((e) => {
					clearTimeout(timer);
					if (this.pending && this.pending.timer === timer) this.pending = null;
					reject(e instanceof Error ? e : new Error(String(e)));
				});
			});
		// Serialize so the shared 0x90 reply always maps to the right request.
		const result = this.lock.then(task, task);
		this.lock = result.then(
			() => {},
			() => {}
		);
		return result;
	}

	private async teardown(): Promise<void> {
		if (this.port) {
			try {
				this.port.removeEventListener('disconnect', this.onPortDisconnect);
			} catch {
				/* ignore */
			}
		}
		if (this.pending) {
			clearTimeout(this.pending.timer);
			this.pending.reject(new Error('connection closed'));
			this.pending = null;
		}
		if (this.reader) {
			try {
				await this.reader.cancel();
			} catch {
				/* ignore */
			}
			this.reader = null;
		}
		if (this.writer) {
			try {
				this.writer.releaseLock();
			} catch {
				/* ignore */
			}
			this.writer = null;
		}
		if (this.port) {
			try {
				await this.port.close();
			} catch {
				/* ignore */
			}
			this.port = null;
		}
		this.decoder.reset();
	}
}

export const badge: BadgeSerial = new BadgeSerial();

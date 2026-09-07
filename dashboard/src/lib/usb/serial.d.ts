// Minimal Web Serial API type declarations.
// The DOM lib does not ship these, and we add no npm deps, so declare
// exactly what this module uses.
export {};

declare global {
	interface SerialPortInfo {
		usbVendorId?: number;
		usbProductId?: number;
	}

	interface SerialOptions {
		baudRate: number;
		dataBits?: number;
		stopBits?: number;
		parity?: 'none' | 'even' | 'odd';
		bufferSize?: number;
		flowControl?: 'none' | 'hardware';
	}

	interface SerialPortFilter {
		usbVendorId?: number;
		usbProductId?: number;
	}

	interface SerialPortRequestOptions {
		filters?: SerialPortFilter[];
	}

	interface SerialPort {
		readonly readable: ReadableStream<Uint8Array> | null;
		readonly writable: WritableStream<Uint8Array> | null;
		open(options: SerialOptions): Promise<void>;
		close(): Promise<void>;
		getInfo(): SerialPortInfo;
		addEventListener(type: 'disconnect', listener: () => void): void;
		removeEventListener(type: 'disconnect', listener: () => void): void;
	}

	interface Serial extends EventTarget {
		getPorts(): Promise<SerialPort[]>;
		requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
	}

	interface Navigator {
		readonly serial?: Serial;
	}
}

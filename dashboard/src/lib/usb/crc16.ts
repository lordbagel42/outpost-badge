// CRC-16/CCITT-FALSE
// poly 0x1021, init 0xFFFF, no input/output reflection, no xorout.
export function crc16ccitt(data: Uint8Array): number {
	let crc = 0xffff;
	for (let i = 0; i < data.length; i++) {
		crc ^= data[i] << 8;
		for (let bit = 0; bit < 8; bit++) {
			if (crc & 0x8000) {
				crc = ((crc << 1) ^ 0x1021) & 0xffff;
			} else {
				crc = (crc << 1) & 0xffff;
			}
		}
	}
	return crc & 0xffff;
}

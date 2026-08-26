import struct, sys
code = open(sys.argv[1],"rb").read()
blocks = []  # (addr, payload, family)
for off in range(0, len(code), 512):
    m0,m1,flags,addr,sz,blkno,nblk,family = struct.unpack_from("<8I", code, off)
    assert m0==0x0A324655 and m1==0x9E5D5157
    blocks.append((addr, code[off+32:off+32+sz], sz, family))
fam = blocks[0][3]
wad = open("doom1.whx","rb").read()
base = 0x10040000
for i in range(0, len(wad), 256):
    blocks.append((base+i, wad[i:i+256], 256, fam))
n = len(blocks)
out = bytearray()
for i,(addr,payload,sz,family) in enumerate(blocks):
    blk = struct.pack("<8I", 0x0A324655, 0x9E5D5157, 0x2000, addr, sz, i, n, family)
    blk += payload + b"\x00"*(476-32+32-len(blk)-len(payload)+len(payload))  # pad below
    blk = blk[:32]+payload+b"\x00"*(476-len(payload))
    blk = struct.pack("<8I",0x0A324655,0x9E5D5157,0x2000,addr,sz,i,n,family)+payload+b"\x00"*(476-len(payload))+struct.pack("<I",0x0AB16F30)
    assert len(blk)==512
    out += blk
open(sys.argv[2],"wb").write(bytes(out))
print(sys.argv[2], n, "blocks", len(out), "bytes")

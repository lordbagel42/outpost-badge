#!/bin/bash
set -e
export PATH=~/tools/cmake-3.31.6-linux-x86_64/bin:~/tools:$PATH
cd ~/doom-badge/rp2040-doom
python3 - <<'EOF'
w=open("doom1.whx","rb").read()
s=0
for b in w: s=(s*31+b)&0xFFFFFFFF
print("host checksum %08x first-bytes %02x %02x %02x %02x len %d"%(s,w[0],w[1],w[2],w[3],len(w)))
EOF
cd build-outpost-usb
ninja doom_tiny 2>&1 | grep -E "error|FAILED" -A4 | head -20 || true
cd ..
python3 /tmp/pack2.py build-outpost-usb/src/doom_tiny.uf2 doom_outpost_usbdebug.uf2
cp doom_outpost_usbdebug.uf2 "/mnt/c/Users/ender/AppData/Local/Temp/claude/C--Users-ender-Documents-outpost-badge/38d79b38-f237-4fa2-806a-83b3c5debea0/scratchpad/"
echo REBUILD_DONE

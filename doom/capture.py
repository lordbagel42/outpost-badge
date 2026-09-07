#!/usr/bin/env python3
import serial, sys, time
port = sys.argv[1] if len(sys.argv) > 1 else "/dev/ttyACM0"
secs = float(sys.argv[2]) if len(sys.argv) > 2 else 30.0
s = serial.Serial(); s.port = port; s.baudrate = 115200; s.timeout = 0.2
s.dtr = True; s.rts = True; s.open()
try: s.dtr = True; s.rts = True
except Exception: pass
start = time.time()
while time.time() - start < secs:
    ch = s.read(4096)
    if ch:
        sys.stdout.write(ch.decode("latin-1")); sys.stdout.flush()
s.close()

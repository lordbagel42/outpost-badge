#!/usr/bin/env bash
# Regenerate board_data.scad, all STLs (in print orientation) and the preview
# images.  Needs OpenSCAD 2024+ for the Manifold backend (set OPENSCAD to
# point at the binary / AppImage); PNG previews need a display or xvfb-run.
set -euo pipefail
cd "$(dirname "$0")/.."
OPENSCAD="${OPENSCAD:-openscad}"
SCAD=outpost_badge_case.scad
XVFB=""; command -v xvfb-run >/dev/null && [ -z "${DISPLAY:-}" ] && XVFB="xvfb-run -a"

python3 tools/extract_board.py

stl() {  # name, extra -D args...
    local name=$1; shift
    echo "== stl/$name.stl"
    "$OPENSCAD" --backend Manifold --export-format binstl -o "stl/$name.stl" "$@" "$SCAD" 2>&1 | grep -E "WARNING|ERROR" || true
}
png() {  # name, camera, extra args...
    local name=$1 cam=$2; shift 2
    echo "== images/$name.png"
    $XVFB "$OPENSCAD" --imgsize=1600,1200 --colorscheme=Tomorrow --autocenter --viewall \
        --camera="$cam" -o "images/$name.png" "$@" "$SCAD" 2>&1 | grep -E "WARNING|ERROR" || true
}

# --- one-piece front (default) ---
stl back                     -D 'part="back"'  -D 'print_orientation=true'
stl front                    -D 'part="front"' -D 'print_orientation=true'
stl front_header_slots       -D 'part="front"' -D 'print_orientation=true' -D 'header_slots=true'
# --- split front: separate bezel + protoboard cover (needs its own back shell) ---
stl split_back               -D 'part="back"'         -D 'print_orientation=true' -D 'split_front=true'
stl split_front_bezel        -D 'part="front_bezel"'  -D 'print_orientation=true' -D 'split_front=true'
stl split_front_cover        -D 'part="front_cover"'  -D 'print_orientation=true' -D 'split_front=true'

png assembly_front   0,0,0,55,0,25,300   -D 'part="assembly"'
png assembly_back    0,0,0,125,0,200,300 -D 'part="assembly"'
png exploded         0,0,0,55,0,25,300   -D 'part="exploded"'
png exploded_split   0,0,0,55,0,25,300   -D 'part="exploded"' -D 'split_front=true'
png back_outside     0,0,0,180,0,0,300   -D 'part="back"' --projection=o
png back_inside      0,0,0,40,0,20,300   -D 'part="back"'
png front_top        0,0,0,0,0,0,300     -D 'part="front"' --projection=o
png front_underside  0,0,0,40,0,20,300   -D 'part="front"' -D 'print_orientation=true'
png print_plate      0,0,0,50,0,30,400   -D 'part="plate"'
ls -la stl images

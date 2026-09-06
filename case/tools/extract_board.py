#!/usr/bin/env python3
"""Extract the geometry the case needs from PCB/einkbadge.kicad_pcb and write
case/board_data.scad.

Everything is emitted in "case coordinates": millimetres, origin at the centre
of the PCB bounding box, +Y pointing towards the cat ears (KiCad's Y axis
points down, so it is flipped here).  Only the standard library is required;
shapely is used when available to simplify the artwork polygons.
"""
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PCB = os.path.join(HERE, "..", "..", "PCB", "einkbadge.kicad_pcb")
OUT = os.path.join(HERE, "..", "board_data.scad")

try:
    from shapely.geometry import Polygon
except ImportError:  # simplification is optional
    Polygon = None


# ----------------------------------------------------------------- s-expr ---
def parse(text):
    tokens = re.findall(r'\(|\)|"(?:[^"\\]|\\.)*"|[^\s()"]+', text)
    stack = [[]]
    for t in tokens:
        if t == "(":
            stack.append([])
        elif t == ")":
            node = stack.pop()
            stack[-1].append(node)
        else:
            if t.startswith('"'):
                t = t[1:-1]
            else:
                try:
                    t = float(t)
                except ValueError:
                    pass
            stack[-1].append(t)
    return stack[0][0]


def find(node, key):
    return [n for n in node if isinstance(n, list) and n and n[0] == key]


def find1(node, key):
    r = find(node, key)
    return r[0] if r else None


def layer(node):
    l = find1(node, "layer")
    return l[1] if l else None


def ref(fp):
    for p in find(fp, "property"):
        if p[1] == "Reference":
            return p[2]
    return "?"


def fp_world(fp, x, y):
    """Footprint-local -> board coordinates (KiCad rotation convention)."""
    at = find1(fp, "at")
    ang = math.radians(at[3] if len(at) > 3 else 0.0)
    return (at[1] + x * math.cos(ang) + y * math.sin(ang),
            at[2] - x * math.sin(ang) + y * math.cos(ang))


# ------------------------------------------------------------------- main ---
pcb = parse(open(PCB, encoding="utf-8").read())
footprints = find(pcb, "footprint")

# Board outline + internal cutouts (all Edge.Cuts polygons; largest = outline)
edge_polys = []
for g in find(pcb, "gr_poly"):
    if layer(g) == "Edge.Cuts":
        pts = [(p[1], p[2]) for p in find1(g, "pts")[1:]]
        edge_polys.append(pts)
edge_polys.sort(key=lambda p: -(max(x for x, _ in p) - min(x for x, _ in p)))
outline, cutouts = edge_polys[0], edge_polys[1:]

xs = [x for x, _ in outline]
ys = [y for _, y in outline]
cx = (min(xs) + max(xs)) / 2
cy = (min(ys) + max(ys)) / 2


def C(pt):
    """KiCad board coords -> case coords (centred, Y up)."""
    return (round(pt[0] - cx, 4), round(cy - pt[1], 4))


def rect_c(x0, y0, x1, y1):
    """KiCad rect -> case-coord [xmin, ymin, xmax, ymax]."""
    a, b = C((x0, y0)), C((x1, y1))
    return [min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])]


def pad_bbox(fp):
    xs, ys = [], []
    for pad in find(fp, "pad"):
        at = find1(pad, "at")
        sz = find1(pad, "size")
        r = max(sz[1], sz[2]) / 2
        wx, wy = fp_world(fp, at[1], at[2])
        xs += [wx - r, wx + r]
        ys += [wy - r, wy + r]
    return min(xs), min(ys), max(xs), max(ys)


def pad_centre(fp):
    x0, y0, x1, y1 = pad_bbox(fp)
    return ((x0 + x1) / 2, (y0 + y1) / 2)


buttons, holes, headers_top, back_buttons = [], [], [], []
screen_rects, nfc_rect, usb, led, swd = [], None, None, None, None
art = {"F": [], "B": []}

for fp in footprints:
    r = ref(fp)
    name = fp[1]
    side = "F" if layer(fp) == "F.Cu" else "B"
    if "TestPoint" in name:
        continue
    if name.startswith("Button_Switch_THT:SW_PUSH-12mm"):
        buttons.append((r, C(pad_centre(fp))))
    elif name.startswith("MountingHole"):
        for pad in find(fp, "pad"):
            d = find1(pad, "drill")
            if d and d[1] > 1.5:
                holes.append((r, C(fp_world(fp, find1(pad, "at")[1], find1(pad, "at")[2])), d[1]))
    elif name.startswith("Connector_PinHeader") and side == "F":
        headers_top.append((r, rect_c(*pad_bbox(fp))))
    elif name.startswith("Connector_PinHeader") and side == "B":
        swd = (r, rect_c(*pad_bbox(fp)))
    elif r in ("RESET1", "BOOT1"):
        back_buttons.append((r, C(pad_centre(fp))))
    elif r == "D4":
        led = C(pad_centre(fp))
    elif r == "L3":  # NFC antenna: silkscreen rectangle
        pts = []
        for ln in find(fp, "fp_line"):
            for k in ("start", "end"):
                p = find1(ln, k)
                pts.append(fp_world(fp, p[1], p[2]))
        nfc_rect = rect_c(min(p[0] for p in pts), min(p[1] for p in pts),
                          max(p[0] for p in pts), max(p[1] for p in pts))
    elif r == "J1":  # USB-C: pad bbox centre x, connector face is flush with edge
        x0, y0, x1, y1 = pad_bbox(fp)
        fab = [n for n in find(fp, "fp_poly") if layer(n) == "B.Fab"][0]
        fpts = [fp_world(fp, p[1], p[2]) for p in find1(fab, "pts")[1:]]
        usb = {"cx": round((x0 + x1) / 2 - cx, 4),
               "body": rect_c(min(p[0] for p in fpts), min(p[1] for p in fpts),
                              max(p[0] for p in fpts), max(p[1] for p in fpts))}
    # Artwork: every filled polygon on a silkscreen or mask layer of the
    # "LOGO" footprints (KiCad's bitmap-to-component output).
    if name == "LOGO":
        for poly in find(fp, "fp_poly"):
            ly = layer(poly)
            if ly in ("F.SilkS", "F.Mask", "B.SilkS", "B.Mask"):
                pts = [fp_world(fp, p[1], p[2]) for p in find1(poly, "pts")[1:]]
                art[ly[0]].append((ly, pts))

# Screen outline / active area: the two gr_poly rectangles on F.SilkS
for g in find(pcb, "gr_poly"):
    if layer(g) == "F.SilkS":
        pts = [(p[1], p[2]) for p in find1(g, "pts")[1:]]
        if len(pts) == 4:
            screen_rects.append(rect_c(min(x for x, _ in pts), min(y for _, y in pts),
                                       max(x for x, _ in pts), max(y for _, y in pts)))
screen_rects.sort(key=lambda r: -(r[2] - r[0]))
screen_module, screen_active = screen_rects[0], screen_rects[1]

# Left-edge notch where the e-ink FPC wraps around: find the outline vertices
# that sit inboard of the leftmost edge in the middle of the left side.
xmin = min(xs)
notch_ys = [y for x, y in outline if x > xmin + 2.5 and x < xmin + 3.5 and 85 < y < 115]
fpc_notch = rect_c(xmin - 1, min(notch_ys), xmin + 3.5, max(notch_ys))

# Top edge between the ears (straight segment) -> where the ears start
top_edge_y = None
for (x0, y0), (x1, y1) in zip(outline, outline[1:] + outline[:1]):
    if abs(y0 - y1) < 1e-3 and abs(x0 - x1) > 30 and y0 < cy:
        top_edge_y = y0
assert top_edge_y is not None, "could not find the straight top edge between the ears"
ear_base = C((cx, top_edge_y))[1]

buttons.sort()
holes.sort()
headers_top.sort()
back_buttons.sort()


# ----------------------------------------------------------------- artwork ---
def simplify(pts, tol=0.02):
    if Polygon is None or len(pts) < 4:
        return pts
    try:
        p = Polygon(pts).buffer(0)
        if p.is_empty:
            return []
        if p.geom_type == "MultiPolygon":
            p = max(p.geoms, key=lambda g: g.area)
        p = p.simplify(tol, preserve_topology=True)
        return list(p.exterior.coords)[:-1]
    except Exception:
        return pts


def fmt_poly(pts):
    return "[" + ",".join("[%g,%g]" % C(p) for p in pts) + "]"


def art_list(polys):
    out = []
    for ly, pts in polys:
        pts = simplify(pts)
        if len(pts) < 3:
            continue
        px = [p[0] for p in pts]
        py = [p[1] for p in pts]
        size = max(max(px) - min(px), max(py) - min(py))
        out.append((size, ly, pts))
    return out


with open(OUT, "w", encoding="utf-8") as f:
    w = f.write
    w("// GENERATED by case/tools/extract_board.py from PCB/einkbadge.kicad_pcb\n")
    w("// Do not edit by hand.  Units: mm.  Origin: centre of the PCB bounding box,\n")
    w("// +Y towards the cat ears, +Z towards the front (screen) side.\n\n")
    w("pcb_thickness = %g;\n" % find1(find1(pcb, "general"), "thickness")[1])
    w("board_size = [%g, %g];\n" % (max(xs) - min(xs), max(ys) - min(ys)))
    w("ear_base_y = %g;  // Y of the straight top edge between the ears\n" % ear_base)
    w("ear_tip_y = %g;\n\n" % C((cx, min(ys)))[1])
    w("board_outline = %s;\n\n" % fmt_poly(outline))
    w("// Lanyard cut-outs inside the board (two ear slots + centre slot)\n")
    w("lanyard_slots = [\n")
    for c in cutouts:
        w("  %s,\n" % fmt_poly(c))
    w("];\n\n")
    w("// 12 mm tactile switches (body centres) - name, [x, y]\n")
    w("buttons = [\n")
    for r, c in buttons:
        w('  ["%s", [%g, %g]],\n' % (r, c[0], c[1]))
    w("];\n")
    w("button_body = 12.0;   // Wuerth WS-TATV 12x12: 12 mm square body, 3.5 mm tall,\n")
    w("button_body_h = 3.5;  // 7 mm dia actuator, 8.5 mm total height, pins 3.5 mm below PCB\n")
    w("button_total_h = 8.5;\n")
    w("button_pin_len = 3.5;\n\n")
    w("// M2 mounting holes - name, [x, y], drill\n")
    w("mount_holes = [\n")
    for r, c, d in holes:
        w('  ["%s", [%g, %g], %g],\n' % (r, c[0], c[1], d))
    w("];\n\n")
    w("// Front-side pin header pad areas [xmin, ymin, xmax, ymax]\n")
    w("header_rects = [\n")
    for r, rc in headers_top:
        w('  ["%s", [%g, %g, %g, %g]],\n' % ((r,) + tuple(rc)))
    w("];\n\n")
    w("// e-ink module outline and active area [xmin, ymin, xmax, ymax]\n")
    w("screen_module = [%g, %g, %g, %g];\n" % tuple(screen_module))
    w("screen_active = [%g, %g, %g, %g];\n" % tuple(screen_active))
    w("fpc_notch = [%g, %g, %g, %g];  // left-edge notch where the FPC wraps round\n\n" % tuple(fpc_notch))
    w("// NFC antenna loop outline (front copper, must stay uncovered)\n")
    w("nfc_rect = [%g, %g, %g, %g];\n\n" % tuple(nfc_rect))
    w("// USB-C receptacle on the back, face flush with the bottom edge\n")
    w("usb_cx = %g;\n" % usb["cx"])
    w("usb_body = [%g, %g, %g, %g];\n\n" % tuple(usb["body"]))
    w("// Back-side SMD tactile switches (RESET / BOOT) and status LED\n")
    w("back_buttons = [\n")
    for r, c in back_buttons:
        w('  ["%s", [%g, %g]],\n' % (r, c[0], c[1]))
    w("];\n")
    w("led_pos = [%g, %g];\n" % led)
    w("swd_rect = [%g, %g, %g, %g];  // 3-pin SWD header pads on the back\n\n" % tuple(swd[1]))

    for side, label in (("F", "front"), ("B", "back")):
        polys = art_list(art[side])
        w("// %s artwork polygons: [max_dimension_mm, layer, points]\n" % label)
        w("art_%s = [\n" % label)
        for size, ly, pts in sorted(polys, key=lambda p: -p[0]):
            w('  [%.2f, "%s", %s],\n' % (size, ly, fmt_poly(pts)))
        w("];\n\n")

print("wrote", os.path.relpath(OUT))
print("board %.2f x %.2f mm, centre (%.3f, %.3f)" % (max(xs) - min(xs), max(ys) - min(ys), cx, cy))
print("buttons", buttons)
print("holes", holes)
print("headers", headers_top)
print("screen", screen_module, screen_active, "notch", fpc_notch)
print("nfc", nfc_rect, "usb", usb, "led", led, "swd", swd)
print("back buttons", back_buttons, "ear_base", ear_base)
for side in "FB":
    sizes = sorted(s for s, _, _ in art_list(art[side]))
    print(side, "art polys:", len(sizes), "sizes:", [round(s, 1) for s in sizes[:12]], "...", [round(s, 1) for s in sizes[-6:]])

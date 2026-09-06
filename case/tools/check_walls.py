#!/usr/bin/env python3
"""Slice the exported STLs and report any solid feature thinner than MIN_WALL.

Every part is cut with horizontal planes at each 0.3 mm layer and with vertical
planes every few millimetres in X and Y.  In each 2-D slice the solid is eroded
by MIN_WALL/2 and re-dilated; whatever disappears is thinner than MIN_WALL.
Tiny corner roundings are ignored (area / length thresholds), real thin walls,
ribs and slivers are listed with their 3-D position.

    python3 tools/check_walls.py [stl files...]      (default: stl/*.stl)

Exit status 1 if anything is found.
"""
import glob
import os
import sys

import numpy as np
import trimesh
from shapely.geometry import Polygon

MIN_WALL = 1.0        # mm
LAYER = 0.3           # mm, horizontal slice spacing
VSTEP = 4.0           # mm, vertical slice spacing
MIN_AREA = 0.30       # mm^2 - smaller thin bits are corner roundings
MIN_LEN = 2.0         # mm  - a thin region shorter than this is a corner


def thin_regions(poly):
    """Parts of a shapely polygon narrower than MIN_WALL."""
    eroded = poly.buffer(-MIN_WALL / 2)
    kept = eroded.buffer(MIN_WALL / 2 + 0.02)
    thin = poly.difference(kept)
    if thin.is_empty:
        return []
    pieces = list(thin.geoms) if hasattr(thin, "geoms") else [thin]
    out = []
    for p in pieces:
        if p.area < MIN_AREA:
            continue
        mrr = p.minimum_rotated_rectangle
        xs, ys = mrr.exterior.coords.xy
        edges = [np.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i]) for i in range(4)]
        length, width = max(edges), min(edges)
        if length < MIN_LEN:
            continue
        out.append((p, length, width))
    return out


def check_plane(mesh, origin, normal, label, findings):
    section = mesh.section(plane_origin=origin, plane_normal=normal)
    if section is None:
        return
    planar, to_3d = section.to_2D()
    for poly in planar.polygons_full:
        for piece, length, width in thin_regions(poly):
            c = piece.centroid
            p3 = to_3d @ np.array([c.x, c.y, 0, 1])
            findings.append((label, p3[:3], piece.area, length, width))


def check(path):
    mesh = trimesh.load(path, force="mesh")
    lo, hi = mesh.bounds
    findings = []
    for z in np.arange(lo[2] + LAYER / 2, hi[2], LAYER):
        check_plane(mesh, [0, 0, z], [0, 0, 1], "z=%.2f" % z, findings)
    for x in np.arange(lo[0] + 1.0, hi[0], VSTEP):
        check_plane(mesh, [x, 0, 0], [1, 0, 0], "x=%.1f" % x, findings)
    for y in np.arange(lo[1] + 1.0, hi[1], VSTEP):
        check_plane(mesh, [0, y, 0], [0, 1, 0], "y=%.1f" % y, findings)
    print("%-36s %5d slices checked, %d thin feature(s)" % (os.path.basename(path),
          int((hi[2] - lo[2]) / LAYER) + int((hi[0] - lo[0]) / VSTEP) + int((hi[1] - lo[1]) / VSTEP),
          len(findings)))
    for label, p, area, length, width in findings:
        print("   %-8s at (%7.2f, %7.2f, %6.2f)  area %5.2f mm2  %5.1f x %.2f mm" %
              (label, p[0], p[1], p[2], area, length, width))
    return len(findings)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(here, "..", "stl", "*.stl")))
    total = sum(check(f) for f in files)
    print("minimum wall %.1f mm: %s" % (MIN_WALL, "OK" if total == 0 else "%d problem(s)" % total))
    sys.exit(1 if total else 0)

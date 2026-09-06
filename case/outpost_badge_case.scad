// Outpost badge - 3D printable case
// ==================================
// Parametric OpenSCAD model.  All board geometry (outline, cat ears, lanyard
// slots, button positions, mounting holes, screen, NFC antenna, USB-C, back-side
// buttons and the silkscreen/mask artwork) comes from board_data.scad, which is
// generated from PCB/einkbadge.kicad_pcb by tools/extract_board.py.
//
// Parts
//   back   - tray the PCB drops into.  Covers and protects all back-side
//            components, has a window over the OUTPOST / QR / date / Open Sauce
//            text block (which is also the NFC antenna area), access holes for
//            RESET / BOOT and the status LED, the USB-C port, the three lanyard
//            slots and M2 screw bosses under the four PCB mounting holes.
//   front  - one piece (default): screen bezel + cat-ear frame + removable
//            protoboard cover with openings for the six 12 mm buttons (and the
//            pin-header rows).  Held by four M2 screws through the PCB holes.
//            Leaves the NFC antenna uncovered.
//   Covered PCB artwork is recreated on the print as a 0.6 mm recess (or an
//   emboss) so a two-colour print reproduces it.
//
// Coordinates: mm, origin = centre of the PCB, +Y towards the ears, Z = 0 at
// the PCB top (screen side) surface, +Z towards the viewer of the screen.
//
// Recommended: OpenSCAD 2024+ (Manifold backend).  2021.01 works but is slow.

include <board_data.scad>

/* [Part] */
// Which part to generate
part = "assembly"; // [assembly, exploded, back, front, front_bezel, front_cover, plate]
// Lay single parts flat in their print orientation (face down)
print_orientation = false;
// Split the front into a separate screen bezel and protoboard cover
split_front = false;
// Show a translucent PCB in the assembly views
show_pcb = true;

/* [Shell] */
// Wall thickness
wall = 2.0;
// Gap between PCB edge and wall
clearance = 0.3;
// Back floor thickness (art recess is cut into this)
floor_t = 1.8;
// Free height under the PCB (USB-C 3.3 mm, switch pins 3.5 mm)
back_cavity = 4.3;
// How far the wall rises above the PCB top surface
lip_h = 1.0;
// Width of the ledge under the PCB edge
ledge_w = 1.2;

/* [Front] */
// Thickness of the e-ink module incl. adhesive
screen_h = 1.4;
// Bezel thickness above the screen glass
bezel_t = 1.8;
// Gap between the bezel opening and the screen active area
window_clear = 0.8;
// 45 degree chamfer on the bezel opening
bezel_chamfer = 1.0;
// Free height above the PCB under the protoboard cover
cover_inner = 3.0;
// Protoboard cover roof thickness
roof_t = 1.8;
// Gap around each 12 mm button body
button_clear = 0.4;
// Open the centre of the D-pad (the island between the four buttons cannot be printed)
dpad_center_open = true;
// Cut slots for the pin-header rows (J3..J6).  Needed if you solder headers into the protoboard.
header_slots = false;
// Gap around the header pad rows
header_clear = 0.6;

/* [Cat ears] */
// Grow the ears of the case beyond the PCB ears (0 = follow the PCB)
ear_boost = 1.5;
// Width of the "inner ear" recess ring around each ear slot
ear_ring_w = 1.9;
// Gap between slot edge and inner-ear ring
ear_ring_gap = 0.5;

/* [Artwork] */
// recess = engraved 0.6 mm (prints face down, no supports).  emboss = raised (needs the exterior face up).
art_mode = "recess"; // [recess, emboss, none]
// Depth / height of the recreated artwork
art_depth = 0.6;
// Drop artwork features smaller than this (tiny text is not printable)
art_min = 2.0;
// Fatten thin strokes by this much
art_grow = 0.1;
// Keep artwork this far from openings and edges
art_margin = 0.6;
// Recreate the RESET / BOOT labels as legible text (the PCB's 1.3 mm letters are too small to print)
back_labels = true;
label_size = 2.6;

/* [Fasteners] */
// Hole in the back bosses: 1.7 = M2 thread-forming into plastic, 3.2 = M2 heat-set insert
screw_hole_d = 1.7;
// Boss diameter in the back shell
boss_d = 5.5;
// Clearance hole for the M2 shank through the front
screw_shank_d = 2.4;
// Counterbore for the M2 head
screw_head_d = 4.2;
screw_head_h = 2.0;
// Column diameter around the screw inside the cover
front_col_d = 5.5;

/* [Openings] */
// USB-C opening (sized for the plug overmould, connector face is flush with the PCB edge)
usb_w = 13.0;
usb_h = 7.0;
// Extra clearance around the lanyard slots
slot_clear = 0.5;
// Pen-tip access holes for RESET / BOOT on the back
back_button_hole_d = 5.0;
// Light hole for the status LED on the back
led_hole_d = 2.5;
// Slot in the floor over the SWD header pads
swd_slot = true;
// Corner radius of the back text/NFC window
window_r = 1.5;

/* [Hidden] */
$fn = 48;
eps = 0.01;
pcb_t = pcb_thickness;
z_pcb_bot = -pcb_t;
z_floor_top = z_pcb_bot - back_cavity;
z_floor_bot = z_floor_top - floor_t;
frame_top = screen_h + bezel_t;             // top face of bezel / ear frame
cover_top = cover_inner + roof_t;           // top face of the protoboard cover
seam_y = screen_module[1] - 0.6;            // bezel / cover boundary (just below the glass)
band = 2.5;                                 // solid band between the glass and the cover cavity
cavity_y = seam_y - band;                   // cover cavity starts here
mesa_gap = 0.5;                             // floor rises to this distance under the PCB around the back window
screw_depth = back_cavity + 0.7;            // thread depth into the boss (+ a bit into the floor)
bezel_fit = 0.15;                           // gap between a split bezel and the wall

board_xmin = min([for (p = board_outline) p[0]]);
board_xmax = max([for (p = board_outline) p[0]]);
board_ymin = min([for (p = board_outline) p[1]]);
board_ymax = max([for (p = board_outline) p[1]]);
ear_slots = [for (s = lanyard_slots) if (max([for (p = s) p[1]]) > ear_base_y) s];
dpad = [for (b = buttons) if (b[0] == "SW1" || b[0] == "SW2" || b[0] == "SW3" || b[0] == "SW4") b[1]];
dpad_center = [(dpad[0][0] + dpad[1][0] + dpad[2][0] + dpad[3][0]) / 4,
               (dpad[0][1] + dpad[1][1] + dpad[2][1] + dpad[3][1]) / 4];

// Front NFC window: the antenna loop plus the art around it, right up to the
// board edge (leaves a rim), from the top edge down to the seam.
nfc_window = [nfc_rect[0] - 0.1, seam_y + 0.4, board_xmax - 1.5, ear_base_y - 2.6];
// Back window: OUTPOST / QR / dates / Open Sauce block (same area as the antenna)
back_window = [nfc_rect[0] - 0.8, seam_y - 1.6, board_xmax - 1.2, ear_base_y - 2.2];
back_mesa_xmin = back_window[0] + 1.5;      // no raised rim on the left (components there)

// ------------------------------------------------------------ 2D helpers ---
module rect(r) translate([r[0], r[1]]) square([r[2] - r[0], r[3] - r[1]]);
module rrect(r, rad) offset(r = rad) offset(delta = -rad) rect(r);
function grown(r, d) = [r[0] - d, r[1] - d, r[2] + d, r[3] + d];
module rsq(s, rad) offset(r = rad) offset(delta = -rad) square(s, center = true);
module below(y) translate([-300, y - 600]) square([600, 600]);
module above(y) translate([-300, y]) square([600, 600]);

module board2d() polygon(board_outline);
module pocket2d() offset(r = clearance) board2d();               // PCB pocket
module case2d() {                                                   // outer outline
    offset(r = wall + clearance) board2d();
    if (ear_boost > 0)
        offset(r = wall + clearance + ear_boost)
            intersection() { board2d(); above(ear_base_y + 4); }
}
module slots2d(c) for (s = lanyard_slots) offset(r = c) polygon(s);
module ear_rings2d() difference() {
    for (s = ear_slots) offset(r = slot_clear + ear_ring_gap + ear_ring_w) polygon(s);
    for (s = ear_slots) offset(r = slot_clear + ear_ring_gap) polygon(s);
}
module cover_zone2d() intersection() { case2d(); below(seam_y); }
module bezel_zone2d() intersection() { case2d(); above(seam_y); }

module buttons2d() offset(r = 1.0) offset(r = -1.0) union() {     // closing joins touching corners
    for (b = buttons) translate(b[1]) rsq(button_body + 2 * button_clear, 0.8);
    if (dpad_center_open) translate(dpad_center) rsq(button_body + 2 * button_clear, 0.8);
}
module headers2d() if (header_slots) intersection() {
    for (h = header_rects) rrect([h[1][0] - header_clear, h[1][1] - header_clear,
                                  h[1][2] + header_clear, h[1][3] + header_clear], 0.8);
    below(cavity_y);
}
module screen_window2d() rrect(grown(screen_active, window_clear), 1.0);
module nfc_window2d() rrect(nfc_window, window_r);
module back_window2d() rrect(back_window, window_r);
module mesa2d() intersection() { rect(grown(back_window, 1.5)); translate([back_mesa_xmin, -300]) square([600, 600]); }
module bosses2d() for (h = mount_holes) translate(h[1]) circle(d = boss_d);

// Cavity under the PCB: ledge along the edge, except where the FPC wraps round
// the left edge (and the SWD header sits) and where the USB-C meets the edge.
module cavity2d() intersection() {
    pocket2d();
    union() {
        offset(r = -ledge_w) board2d();
        translate([board_xmin - 3, fpc_notch[1] - 12]) square([15, fpc_notch[3] - fpc_notch[1] + 16]);
        translate([usb_body[0] - 1.5, board_ymin - 2]) square([usb_body[2] - usb_body[0] + 3, usb_body[3] - board_ymin + 4]);
    }
}

// Artwork union for one side, small features dropped
module art2d(side) offset(r = art_grow) union() {
    for (a = (side == "front") ? art_front : art_back) if (a[0] >= art_min) polygon(a[2]);
}

// ------------------------------------------------------------ 3D helpers ---
module ext(z0, h) translate([0, 0, z0]) linear_extrude(h) children();
module chamfer_cut(ztop, depth) hull() {
    translate([0, 0, ztop - depth]) linear_extrude(eps) children();
    translate([0, 0, ztop]) linear_extrude(1) offset(r = depth) children();
}

// ============================================================ BACK SHELL ===
module back_face2d() difference() {                 // exterior face available for art
    case2d();
    back_window2d();
    slots2d(slot_clear);
    for (b = back_buttons) translate(b[1]) circle(d = back_button_hole_d);
    translate(led_pos) circle(d = led_hole_d);
    if (swd_slot) rrect(grown(swd_rect, 0.6), 0.8);
    ear_rings2d();
}
// RESET / BOOT labels above their holes, mirrored so they read correctly from the back
module back_labels2d() if (back_labels) for (b = back_buttons)
    translate([b[1][0], b[1][1] + back_button_hole_d / 2 + 0.6 + label_size * 0.55]) mirror([1, 0])
        text(b[0] == "RESET1" ? "RESET" : "BOOT", size = label_size, halign = "center", valign = "center",
             font = "Liberation Sans:style=Bold");
module back_art(z0, h) ext(z0, h) {
    intersection() { art2d("back"); offset(r = -art_margin) difference() { back_face2d(); offset(r = 0.8) back_labels2d(); } }
    back_labels2d();
}

module usb_cut() {
    zc = z_pcb_bot - 1.63;                                    // centre of the 3.26 mm tall receptacle
    translate([usb_cx, board_ymin + 1.5, zc]) rotate([90, 0, 0]) linear_extrude(wall + clearance + 4)
        hull() { rsq([usb_w, usb_h], 2.0); translate([0, 6]) rsq([usb_w, usb_h], 2.0); }   // open upwards through the lip
}

module back_shell() difference() {
    union() {
        ext(z_floor_bot, lip_h - z_floor_bot) case2d();
        if (art_mode == "emboss") back_art(z_floor_bot - art_depth, art_depth + eps);
        if (split_front)                                 // wall rises around the bezel to locate it
            ext(lip_h - eps, frame_top - lip_h + eps) difference() {
                intersection() { case2d(); above(seam_y + bezel_fit); }
                pocket2d();
            }
    }
    // PCB pocket
    ext(z_pcb_bot, 60) pocket2d();
    // deep cavity for the back-side components (bosses and the window rim stay)
    ext(z_floor_top, back_cavity + eps) difference() { cavity2d(); bosses2d(); mesa2d(); }
    // shallow cavity over the raised rim around the back window
    ext(z_pcb_bot - mesa_gap, mesa_gap + eps) intersection() { mesa2d(); pocket2d(); }
    // through cuts in the floor
    ext(z_floor_bot - 2, 20) {
        back_window2d();
        slots2d(slot_clear);
        for (b = back_buttons) translate(b[1]) circle(d = back_button_hole_d);
        translate(led_pos) circle(d = led_hole_d);
        if (swd_slot) rrect(grown(swd_rect, 0.6), 0.8);
    }
    // pen-tip chamfer on the RESET / BOOT holes
    for (b = back_buttons) translate([b[1][0], b[1][1], z_floor_bot - eps])
        cylinder(d1 = back_button_hole_d + 1.6, d2 = back_button_hole_d, h = 0.8);
    // screw holes in the bosses
    for (h = mount_holes) translate([h[1][0], h[1][1], z_pcb_bot - screw_depth]) cylinder(d = screw_hole_d, h = screw_depth + 1);
    usb_cut();
    // recreated artwork + inner-ear accent
    if (art_mode == "recess") back_art(z_floor_bot - eps, art_depth + eps);
    ext(z_floor_bot - eps, art_depth + eps) ear_rings2d();
}

// ================================================================ FRONT ===
module frame_face2d() difference() {                // bezel / ear frame top face available for art
    bezel_zone2d();
    rect(grown(screen_module, 0.4));                        // anything under the screen is hidden by the screen itself
    nfc_window2d();
    slots2d(slot_clear);
    ear_rings2d();
}
module cover_face2d() difference() {                // cover top face available for art
    intersection() { case2d(); below(seam_y - (cover_top - frame_top)); }   // skip the chamfered step
    buttons2d();
    headers2d();
    for (h = mount_holes) translate(h[1]) circle(d = screw_head_d);
}
module front_art(sign) {                            // sign = -1 recess, +1 emboss
    z1 = (sign < 0) ? frame_top - art_depth : frame_top - eps;
    z2 = (sign < 0) ? cover_top - art_depth : cover_top - eps;
    ext(z1, art_depth + eps) intersection() { art2d("front"); offset(r = -art_margin) frame_face2d(); }
    ext(z2, art_depth + eps) intersection() { art2d("front"); offset(r = -art_margin) cover_face2d(); }
}

module front_body() difference() {
    union() {
        ext(0, frame_top) case2d();
        hull() {                                     // raised protoboard cover with a 45 degree step
            ext(frame_top - eps, eps) cover_zone2d();
            ext(cover_top - eps, eps) intersection() { cover_zone2d(); below(seam_y - (cover_top - frame_top)); }
        }
        if (art_mode == "emboss") front_art(+1);
    }
    // rebate: the outer ring sits on the wall top, the inner plug drops inside the wall
    ext(-1, lip_h + 1) difference() { offset(r = 2) case2d(); offset(r = -bezel_fit) pocket2d(); }
    if (split_front) ext(-1, frame_top + 2) difference() {   // split bezel sits fully inside the raised wall
        intersection() { offset(r = 2) case2d(); above(seam_y); }
        offset(r = -bezel_fit) pocket2d();
    }
    // pocket for the e-ink module and its FPC fold on the left edge
    ext(-1, screen_h + 1) {
        rect(grown(screen_module, 0.4));
        translate([board_xmin - 3, fpc_notch[1] - 2]) square([screen_module[0] - board_xmin + 3.5, fpc_notch[3] - fpc_notch[1] + 4]);
    }
    // screen window (bezel) and NFC window, both chamfered on the front
    ext(-1, frame_top + 2) { screen_window2d(); nfc_window2d(); }
    chamfer_cut(frame_top, bezel_chamfer) screen_window2d();
    chamfer_cut(frame_top, bezel_chamfer) nfc_window2d();
    // lanyard slots
    ext(-1, cover_top + 2) slots2d(slot_clear);
    // protoboard cover cavity (screw columns stay)
    ext(-1, cover_inner + 1) difference() {
        intersection() { offset(r = -0.8) board2d(); below(cavity_y); }
        for (h = mount_holes) translate(h[1]) circle(d = front_col_d);
    }
    // button openings and header slots through the roof
    ext(cover_inner - 1, roof_t + 3) { buttons2d(); headers2d(); }
    // M2 screws: shank + counterbore
    for (h = mount_holes) translate([h[1][0], h[1][1], -1]) {
        cylinder(d = screw_shank_d, h = cover_top + 2);
        translate([0, 0, cover_top + 1 - screw_head_h]) cylinder(d = screw_head_d, h = screw_head_h + 1);
    }
    // recreated artwork + inner-ear accent
    if (art_mode == "recess") front_art(-1);
    ext(frame_top - art_depth, art_depth + 1) ear_rings2d();
}

// Split variants: tongue (bezel, low) under a bar (cover, high) in the band
tongue_h = 1.6;
module front_bezel() intersection() {
    front_body();
    union() {
        translate([-300, seam_y, -10]) cube([600, 600, 60]);
        translate([-300, cavity_y, -10]) cube([600, band + eps, 10 + tongue_h]);
    }
}
module front_cover() intersection() {
    front_body();
    union() {
        translate([-300, -600 + cavity_y, -10]) cube([600, 600, 60]);
        translate([-300, cavity_y - eps, tongue_h + bezel_fit]) cube([600, band + eps, 60]);
    }
}

// ============================================================== OUTPUT ====
module pcb_model() color([0.35, 0.12, 0.35, 0.6]) ext(z_pcb_bot, pcb_t) difference() {
    board2d();
    slots2d(0);
    for (h = mount_holes) translate(h[1]) circle(d = h[2]);
}

module front_parts(lift = 0) {
    if (!split_front) translate([0, 0, lift]) color("LightSteelBlue") front_body();
    else {
        translate([0, 0, lift]) color("LightSteelBlue") front_bezel();
        translate([0, 0, 2 * lift]) color("LightSalmon") front_cover();
    }
}

module oriented_back() if (print_orientation) translate([0, 0, -z_floor_bot]) back_shell(); else back_shell();
module oriented(top) if (print_orientation) translate([0, 0, top]) rotate([180, 0, 0]) children(); else children();

if (part == "assembly") {
    color("DimGray") back_shell();
    if (show_pcb) pcb_model();
    front_parts(0);
} else if (part == "exploded") {
    color("DimGray") back_shell();
    if (show_pcb) translate([0, 0, 12]) pcb_model();
    front_parts(24);
} else if (part == "back") {
    oriented_back();
} else if (part == "front") {
    oriented(cover_top) front_body();
} else if (part == "front_bezel") {
    oriented(frame_top) front_bezel();
} else if (part == "front_cover") {
    oriented(cover_top) front_cover();
} else if (part == "plate") {                       // everything face down on one bed (needs ~235 x 110 mm)
    translate([0, 0, -z_floor_bot]) back_shell();
    translate([board_size[0] + 2 * wall + 12, 0, cover_top]) rotate([180, 0, 0])
        if (!split_front) front_body(); else { front_cover(); translate([0, 0, cover_top - frame_top]) front_bezel(); }
}

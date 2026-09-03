"""Generates every file under Branding/logo, /concepts, /icon and /social.

Run:  python src/build.py     (from the Branding directory)
"""
import io
import os
import struct
import numpy as np
from PIL import Image

import mark as M
import wordmark as W
import raster as R

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INK = (0x12, 0x1A, 0x1D)
PAPER = (0xFA, 0xFA, 0xF7)
DARK = (0x0E, 0x13, 0x15)

HEAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"{extra}>'


def write(rel, text):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(text + "\n")
    print("  ", rel)


def n(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")




def svg_mark(reduced=False, stroke=None):
    w = stroke or (M.STROKE_REDUCED if reduced else M.STROKE_FULL)
    name = "Corro"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" '
        f'fill="none" stroke="currentColor" stroke-width="{n(w)}" '
        f'role="img" aria-label="{name}">'
        f"<title>{name}</title><path d=\"{M.path_d(reduced)}\"/></svg>"
    )


def svg_solid():
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" '
        'fill="currentColor" role="img" aria-label="Corro">'
        f'<title>Corro</title><path d="{M.SOLID_D}"/></svg>'
    )


def svg_distill():
    d = "".join(
        f"M{n(x0)} {n(y0)}L{n(x1)} {n(y1)}"
        for x0, y0, x1, y1 in [M.DISTILL_OUT]
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" '
        'fill="none" stroke="currentColor" role="img" '
        'aria-label="Corro, distillation concept">'
        "<title>Corro, distillation concept</title>"
        f'<path stroke-width="{n(M.DISTILL_STROKE)}" d="{M.distill_d()}"/>'
        f'<path stroke-width="{n(M.DISTILL_OUT_STROKE)}" d="{d}"/></svg>'
    )


def svg_wordmark():
    vb = f"0 {n(W.TOP)} {n(W.WIDTH)} {n(W.HEIGHT)}"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" '
        'fill="currentColor" fill-rule="evenodd" role="img" aria-label="Corro">'
        f'<title>Corro</title><path d="{W.wordmark_d()}"/></svg>'
    )


def mark_group(k, tx, ty, stroke):
    return (
        f'<g transform="translate({n(tx)} {n(ty)}) scale({k:.5f})">'
        f'<path fill="none" stroke="currentColor" stroke-width="{n(stroke)}" '
        f'd="{M.path_d()}"/></g>'
    )



_BB = {}


def bb(stroke):
    if stroke not in _BB:
        _BB[stroke] = R.bbox(R.mark("full", stroke))
    return _BB[stroke]


H_GAP = 380.0
H_MARK_H = 1300.0       
S_GAP = 437.0


def svg_lockup_h():
    s = M.STROKE_FULL
    b = bb(s)
    mw, mh = b[2] - b[0], b[3] - b[1]
    k = H_MARK_H / mh
    x0 = -H_GAP - mw * k
    tx, ty = x0 - b[0] * k, (W.CY - H_MARK_H / 2) - b[1] * k
    vb = f"{n(x0)} {n(W.CY - H_MARK_H / 2)} {n(W.WIDTH - x0)} {n(H_MARK_H)}"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" '
        'fill="currentColor" fill-rule="evenodd" role="img" aria-label="Corro">'
        f"<title>Corro</title>{mark_group(k, tx, ty, s)}"
        f'<path d="{W.wordmark_d()}"/></svg>'
    )


def svg_lockup_stacked():
    
    
    s = M.STROKE_HAIRLINE
    b = bb(s)
    mw, mh0 = b[2] - b[0], b[3] - b[1]
    k = W.WIDTH / mw
    mh = mh0 * k
    tx, ty = -b[0] * k, -b[1] * k
    wy = mh + S_GAP
    vb = f"0 0 {n(W.WIDTH)} {n(wy + W.TOP + W.HEIGHT)}"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" '
        'fill="currentColor" fill-rule="evenodd" role="img" aria-label="Corro">'
        f"<title>Corro</title>{mark_group(k, tx, ty, s)}"
        f'<g transform="translate(0 {n(wy)})"><path d="{W.wordmark_d()}"/></g></svg>'
    )




def render(w, h, items, fg=INK, bg=None, ss=4):
    a = R.coverage(w, h, items, ss=ss)
    if bg is None:
        img = np.zeros((h, w, 4), np.uint8)
        img[..., 0], img[..., 1], img[..., 2] = fg
        img[..., 3] = np.round(a * 255).astype(np.uint8)
        return Image.fromarray(img, "RGBA")
    out = np.empty((h, w, 3), np.float32)
    for i in range(3):
        out[..., i] = bg[i] + (fg[i] - bg[i]) * a
    return Image.fromarray(np.round(out).astype(np.uint8), "RGB")


def icon_items(size, frac, tier, stroke=None):
    fn = R.mark(tier, stroke)
    src = R.bbox(fn)
    s = size * frac
    o = (size - s) / 2
    return [R.place(fn, src, (o, o, o + s, o + s))]


def lockup_items(w, h, frac):
    """Horizontal lockup, mark + wordmark, fitted to `frac` of the width."""
    b = bb(M.STROKE_FULL)
    k = H_MARK_H / (b[3] - b[1])
    mw = (b[2] - b[0]) * k
    total_w = mw + H_GAP + W.WIDTH
    total_h = H_MARK_H
    s = w * frac / total_w
    if total_h * s > h * 0.72:
        s = h * 0.72 / total_h
    ox = (w - total_w * s) / 2
    oy = (h - total_h * s) / 2
    mk = R.place(R.mark("full", M.STROKE_FULL), b,
                 (ox, oy, ox + mw * s, oy + total_h * s))
    wx = ox + (mw + H_GAP) * s
    wh = W.HEIGHT * s
    wy = oy + (total_h * s - wh) / 2
    wm = R.place(R.wordmark, R.WORDMARK_BBOX,
                 (wx, wy, wx + W.WIDTH * s, wy + wh))
    return [mk, wm]




def bmp_payload(img):
    """32-bit BGRA DIB with an AND mask, as ICO expects for small sizes."""
    w, h = img.size
    px = np.array(img.convert("RGBA"))
    bgra = px[..., [2, 1, 0, 3]][::-1]
    hdr = struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0,
                      bgra.nbytes, 0, 0, 0, 0)
    row = ((w + 31) // 32) * 4
    return hdr + bgra.tobytes() + b"\x00" * (row * h)


def write_ico(rel, entries):
    blobs = []
    for size, img in entries:
        if size >= 128:
            b = io.BytesIO()
            img.save(b, "PNG")
            blobs.append((size, b.getvalue()))
        else:
            blobs.append((size, bmp_payload(img)))
    out = struct.pack("<HHH", 0, 1, len(blobs))
    off = 6 + 16 * len(blobs)
    for size, data in blobs:
        d = 0 if size == 256 else size
        out += struct.pack("<BBBBHHII", d, d, 0, 0, 1, 32, len(data), off)
        off += len(data)
    out += b"".join(d for _, d in blobs)
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f:
        f.write(out)
    print("  ", rel)


def save(rel, img):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    img.save(p)
    print("  ", rel)




if __name__ == "__main__":
    print("svg")
    write("logo/corro-mark.svg", svg_mark())
    write("logo/corro-mark-hairline.svg", svg_mark(stroke=M.STROKE_HAIRLINE))
    write("logo/corro-mark-reduced.svg", svg_mark(reduced=True))
    write("logo/corro-mark-solid.svg", svg_solid())
    write("logo/corro-wordmark.svg", svg_wordmark())
    write("logo/corro-lockup-horizontal.svg", svg_lockup_h())
    write("logo/corro-lockup-stacked.svg", svg_lockup_stacked())
    write("concepts/corro-mark-distill.svg", svg_distill())
    write("icon/favicon.svg", svg_solid())

    print("icons")
    save("icon/icon-1024.png", render(1024, 1024, icon_items(1024, 0.72, "full")))
    save("icon/apple-touch-icon-180.png",
         render(180, 180, icon_items(180, 0.60, "reduced"), bg=PAPER))
    save("icon/maskable-512.png",
         render(512, 512, icon_items(512, 0.50, "full"), bg=PAPER))
    save("icon/maskable-512-dark.png",
         render(512, 512, icon_items(512, 0.50, "full"), fg=PAPER, bg=DARK))

    tiers = {16: "solid", 24: "solid", 32: "solid",
             48: "reduced", 64: "reduced", 128: "full", 256: "full"}
    write_ico("icon/favicon.ico",
              [(s, render(s, s, icon_items(s, 0.86, t))) for s, t in tiers.items()])
    write_ico("icon/favicon-dark.ico",
              [(s, render(s, s, icon_items(s, 0.86, t), fg=PAPER))
               for s, t in tiers.items()])

    print("social")
    for name, w, h in (("github-social-1280x640", 1280, 640),
                       ("og-1200x630", 1200, 630)):
        save(f"social/{name}.png",
             render(w, h, lockup_items(w, h, 0.62), fg=INK, bg=PAPER))
        save(f"social/{name}-dark.png",
             render(w, h, lockup_items(w, h, 0.62), fg=PAPER, bg=DARK))
    print("done")

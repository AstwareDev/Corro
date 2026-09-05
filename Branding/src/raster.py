"""Analytic rasteriser for the Corro marks and wordmark.

There is no SVG renderer available in this environment, so the PNG/ICO
deliverables are rasterised from the same numeric parameters that generate
the SVG paths. Everything is antialiased by supersampling.
"""
import numpy as np
import math

import mark as M
import wordmark as W




def seg(xx, yy, x0, y0, x1, y1, width):
    """Butt-capped stroked segment, matching SVG's default stroke-linecap."""
    dx, dy = x1 - x0, y1 - y0
    L2 = dx * dx + dy * dy
    t = ((xx - x0) * dx + (yy - y0) * dy) / L2
    t = np.clip(t, 0.0, 1.0)
    px, py = x0 + t * dx, y0 + t * dy
    on_span = (((xx - x0) * dx + (yy - y0) * dy) / L2 >= 0.0) & (
        ((xx - x0) * dx + (yy - y0) * dy) / L2 <= 1.0)
    return on_span & (np.hypot(xx - px, yy - py) <= width / 2.0)


def poly(xx, yy, pts):
    inside = np.zeros(xx.shape, bool)
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        cond = ((y0 > yy) != (y1 > yy))
        with np.errstate(divide="ignore", invalid="ignore"):
            xint = (x1 - x0) * (yy - y0) / (y1 - y0) + x0
        inside ^= cond & (xx < xint)
    return inside


def ann(xx, yy, cx, cy, ro, ri):
    r = np.hypot(xx - cx, yy - cy)
    return (r <= ro) & (r >= ri)




def mark(tier="full", stroke=None):
    if tier == "solid":
        pts = [(60, 120), (235, 120), (500, 600), (765, 120), (940, 120), (500, 880)]
        return lambda xx, yy: poly(xx, yy, pts)
    reduced = tier == "reduced"
    w = stroke if stroke else (M.STROKE_REDUCED if reduced else M.STROKE_FULL)
    segs = list(M.rays(reduced))

    def fn(xx, yy):
        m = np.zeros(xx.shape, bool)
        for s in segs:
            m |= seg(xx, yy, *s, w)
        return m
    return fn


def distill():
    segs = list(M.distill_rays())

    def fn(xx, yy):
        m = np.zeros(xx.shape, bool)
        for s in segs:
            m |= seg(xx, yy, *s, M.DISTILL_STROKE)
        m |= seg(xx, yy, *M.DISTILL_OUT, M.DISTILL_OUT_STROKE)
        return m
    return fn


def wordmark(xx, yy):
    m = np.zeros(xx.shape, bool)
    for g, x in zip(W.GLYPHS, W.ADVANCE):
        if g == "O":
            m |= ann(xx, yy, x + W.RO, W.CY, W.RO, W.RI)
        elif g == "C":
            cx = x + W.RO
            a = np.degrees(np.arctan2(-(yy - W.CY), xx - cx))
            m |= ann(xx, yy, cx, W.CY, W.RO, W.RI) & ~(np.abs(a) < W.APERTURE)
        else:
            bx, by = x + W.BOWL_CX, W.BOWL_R
            stem = (xx >= x) & (xx <= x + W.STROKE) & (yy >= 0) & (yy <= W.BASE)
            bowl = (((xx >= x) & (xx <= bx)) | (np.hypot(xx - bx, yy - by) <= W.BOWL_R))
            bowl &= (yy >= 0) & (yy <= W.BOWL_BOT) & (xx >= x)
            cnt = (((xx >= x + W.STROKE) & (xx <= bx) & (yy >= W.STROKE)
                    & (yy <= W.BOWL_BOT - W.STROKE))
                   | (np.hypot(xx - bx, yy - by) <= W.BOWL_IN_R))
            d = W.LEG_SLOPE * (W.BASE - W.BOWL_BOT)
            lt_l, lt_r = W.LEG_L_BASE - d, W.LEG_R_BASE - d
            t = (yy - W.BOWL_BOT) / (W.BASE - W.BOWL_BOT)
            leg = ((yy >= W.BOWL_BOT) & (yy <= W.BASE)
                   & (xx >= x + lt_l + t * (W.LEG_L_BASE - lt_l))
                   & (xx <= x + lt_r + t * (W.LEG_R_BASE - lt_r)))
            m |= (stem | bowl | leg) & ~cnt
    return m


WORDMARK_BBOX = (0.0, W.TOP, W.WIDTH, W.TOP + W.HEIGHT)




def bbox(fn, lo=0.0, hi=M.GRID, n=1600):
    s = lo + (np.arange(n) + 0.5) * (hi - lo) / n
    xx, yy = np.meshgrid(s, s)
    m = fn(xx, yy)
    ys, xs = np.where(m)
    step = (hi - lo) / n
    return (lo + xs.min() * step, lo + ys.min() * step,
            lo + (xs.max() + 1) * step, lo + (ys.max() + 1) * step)


def place(fn, src, dst):
    """Wraps a unit-space mask fn so it can be evaluated in pixel space,
    fitting src bbox into dst rect (x0, y0, x1, y1) preserving aspect."""
    sx0, sy0, sx1, sy1 = src
    dx0, dy0, dx1, dy1 = dst
    k = min((dx1 - dx0) / (sx1 - sx0), (dy1 - dy0) / (sy1 - sy0))
    ox = dx0 + ((dx1 - dx0) - (sx1 - sx0) * k) / 2.0
    oy = dy0 + ((dy1 - dy0) - (sy1 - sy0) * k) / 2.0
    return lambda xx, yy: fn(sx0 + (xx - ox) / k, sy0 + (yy - oy) / k)


def coverage(w, h, items, ss=4):
    """Returns a float [0,1] coverage map, antialiased by ss-fold supersampling."""
    acc = np.zeros((h * ss, w * ss), bool)
    xs = (np.arange(w * ss) + 0.5) / ss
    ys = (np.arange(h * ss) + 0.5) / ss
    xx, yy = np.meshgrid(xs, ys)
    for fn in items:
        acc |= fn(xx, yy)
    a = acc.astype(np.float32).reshape(h, ss, w, ss).mean(axis=(1, 3))
    return a

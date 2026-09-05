"""Corro mark geometry, on a 1000x1000 grid.

The original mark (Branding/svg/logo_black.svg) turns out to be angularly
even: seven rays converging on one apex at 0, +/-13.5, +/-27 and +/-40.5
degrees from vertical. That construction is preserved exactly here; what
changes is stroke weight per size tier, and the addition of optical padding
(the original ran its outer rays into the exact edge of the viewBox, leaving
no safe area).

Three tiers, because a 2.7%-of-height hairline does not survive a favicon:

    hairline  7 rays, stroke 25   -- mark >= 4x cap height (stacked lockup,
                                     large format). The original weight.
    standard  7 rays, stroke 42   -- mark 1-2x cap height, and icons >= 80px
    reduced   5 rays, stroke 52   -- 33 to 64px  (drops the +/-40.5 pair,
                                     whose gap to the +/-27 ray closes first)
    solid     filled chevron      -- 32px and below

Stroke is deliberately not constant: it is tuned per size band so the mark's
optical weight stays even against the wordmark and against surrounding UI.
"""
import math

GRID = 1000.0
APEX = (500.0, 940.0)
TOP = 60.0
LONG = APEX[1] - TOP          




RAYS = [
    (0.0, LONG),
    (-27.0, LONG), (27.0, LONG),
    (-13.5, 402.5), (13.5, 402.5),
    (-40.5, 225.9), (40.5, 225.9),
]
REDUCED_ANGLES = {0.0, -27.0, 27.0, -13.5, 13.5}

STROKE_HAIRLINE = 25.0
STROKE_FULL = 42.0
STROKE_REDUCED = 52.0


def rays(reduced=False):
    """Yields (x0, y0, x1, y1) from the outer end of each ray to the apex."""
    ax, ay = APEX
    for angle, drop in RAYS:
        if reduced and angle not in REDUCED_ANGLES:
            continue
        yield (ax - drop * math.tan(math.radians(angle)), ay - drop, ax, ay)


def path_d(reduced=False):
    def f(v):
        return f"{v:.1f}".rstrip("0").rstrip(".")
    return "".join(
        f"M{f(x0)} {f(y0)}L{f(x1)} {f(y1)}" for x0, y0, x1, y1 in rays(reduced)
    )




SOLID_D = "M60 120L235 120L500 600L765 120L940 120L500 880Z"



DISTILL_APEX = (500.0, 690.0)
DISTILL_LONG = 650.0
DISTILL_STROKE = 26.0
DISTILL_OUT = (500.0, 720.0, 500.0, 950.0)
DISTILL_OUT_STROKE = 58.0


def distill_rays():
    ax, ay = DISTILL_APEX
    k = DISTILL_LONG / LONG
    for angle, drop in RAYS:
        d = drop * k
        yield (ax - d * math.tan(math.radians(angle)), ay - d, ax, ay)


def distill_d():
    def f(v):
        return f"{v:.1f}".rstrip("0").rstrip(".")
    return "".join(
        f"M{f(x0)} {f(y0)}L{f(x1)} {f(y1)}" for x0, y0, x1, y1 in distill_rays()
    )

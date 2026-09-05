"""Reconstructs the CORRO wordmark as exact geometry.

Metrics were measured off Branding/banner.png (the only place the wordmark
existed) and normalised to a 700-unit cap height:

    cap height      700     (cap top y=0, baseline y=700)
    stroke          109.5   (0.156 of cap, from O ink area / pi)
    O/C circle      Ro=369.5, Ri=260, centre y=350, overshoot 19.5
    C aperture      74 deg total; terminals cut radially
    R bowl          top half of the cap exactly; outer arc r=175 at (379.2,175)
    R leg           35 deg from vertical, springs from the bowl join at y=350

Emits SVG path data; the same parameters drive the polygon preview so what
you see rendered is what the SVG contains.
"""
import math

CAP = 700.0
STROKE = 109.5
RO = 369.5
RI = RO - STROKE
APERTURE = 37.0   
CY = 350.0
BASE = 700.0


ADVANCE = [0.0, 748.9, 1652.9, 2410.9, 3110.9]
GLYPHS = "CORRO"


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def path_O(x):
    cx = x + RO
    return (
        f"M{f(cx - RO)} {f(CY)}"
        f"A{f(RO)} {f(RO)} 0 1 1 {f(cx + RO)} {f(CY)}"
        f"A{f(RO)} {f(RO)} 0 1 1 {f(cx - RO)} {f(CY)}Z"
        f"M{f(cx - RI)} {f(CY)}"
        f"A{f(RI)} {f(RI)} 0 1 1 {f(cx + RI)} {f(CY)}"
        f"A{f(RI)} {f(RI)} 0 1 1 {f(cx - RI)} {f(CY)}Z"
    )


def path_C(x):
    cx = x + RO
    a = math.radians(APERTURE)
    ox, oy = RO * math.cos(a), RO * math.sin(a)
    ix, iy = RI * math.cos(a), RI * math.sin(a)
    return (
        f"M{f(cx + ox)} {f(CY - oy)}"
        f"A{f(RO)} {f(RO)} 0 1 0 {f(cx + ox)} {f(CY + oy)}"   
        f"L{f(cx + ix)} {f(CY + iy)}"                          
        f"A{f(RI)} {f(RI)} 0 1 1 {f(cx + ix)} {f(CY - iy)}"   
        f"Z"
    )



BOWL_R = 175.0                 
BOWL_CX = 379.2               
BOWL_BOT = 350.0
BOWL_IN_R = BOWL_R - STROKE   
LEG_SLOPE = 0.70              
LEG_L_BASE = 459.3
LEG_R_BASE = 593.0
R_ADV = 593.0


def path_R(x):
    dx = LEG_SLOPE * (BASE - BOWL_BOT)
    lt_l, lt_r = LEG_L_BASE - dx, LEG_R_BASE - dx      
    return (
        f"M{f(x)} 0"
        f"L{f(x + BOWL_CX)} 0"
        f"A{f(BOWL_R)} {f(BOWL_R)} 0 0 1 {f(x + BOWL_CX)} {f(BOWL_BOT)}"
        f"L{f(x + lt_r)} {f(BOWL_BOT)}"
        f"L{f(x + LEG_R_BASE)} {f(BASE)}"
        f"L{f(x + LEG_L_BASE)} {f(BASE)}"
        f"L{f(x + lt_l)} {f(BOWL_BOT)}"
        f"L{f(x + STROKE)} {f(BOWL_BOT)}"
        f"L{f(x + STROKE)} {f(BASE)}"
        f"L{f(x)} {f(BASE)}"
        f"Z"
        f"M{f(x + STROKE)} {f(BOWL_BOT - BOWL_R + STROKE)}"
        f"L{f(x + BOWL_CX)} {f(BOWL_BOT - BOWL_R + STROKE)}"
        f"A{f(BOWL_IN_R)} {f(BOWL_IN_R)} 0 0 1 {f(x + BOWL_CX)} {f(BOWL_BOT - STROKE)}"
        f"L{f(x + STROKE)} {f(BOWL_BOT - STROKE)}"
        f"Z"
    )


BUILDERS = {"C": path_C, "O": path_O, "R": path_R}
WIDTH = ADVANCE[-1] + 2 * RO
TOP = CY - RO
HEIGHT = 2 * RO


def wordmark_paths():
    return [BUILDERS[g](x) for g, x in zip(GLYPHS, ADVANCE)]


def wordmark_d():
    return "".join(wordmark_paths())


if __name__ == "__main__":
    print(f"width={WIDTH:.1f} top={TOP:.1f} height={HEIGHT:.1f}")
    print(wordmark_d())

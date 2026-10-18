"""The breeding item icons: the six power items (braces) and the Everstone, drawn as smooth SVG.

They follow the in-game item sprites (PokeAPI/sprites, sprites/items/*.png): the same shapes and
colours, but as vectors with one solid outline, so they stay clean at any size and on light or dark
backgrounds. build.py puts symbols() into the page once; each icon is then <svg><use href="#it-N"/></svg>,
with N = 0-5 for the braces in stat order (HP, Atk, Def, SpA, SpD, Spe) and 6 for the Everstone.
The incenses are <use href="#it-in-sea"/> and so on, named by the first word of the incense.
Standard library only.
"""
import math

# light, base, rim (the open end), shade, dark (inside and outline); taken from the sprites
TUBES = [
    ('Power Weight', ('#9cf7ad', '#42ce52', '#4abd5a', '#4a9c5a', '#2f5a37'), 0),
    ('Power Bracer', ('#ff9a9a', '#f77373', '#de5a5a', '#ad4a4a', '#6b3434'), 0),
    ('Power Belt', ('#f7d69c', '#ce8c42', '#b5733a', '#8c6b31', '#673c18'), 1),
    None,  # Power Lens is a ring, drawn below
    ('Power Band', ('#f7f7b5', '#e6d642', '#d6bd21', '#9c9429', '#5f5824'), 2),
    ('Power Anklet', ('#8ceff7', '#21adde', '#2194c5', '#317bad', '#2c3b85'), 3),
]
LENS = ('#f7b5ff', '#ff63ff', '#c542de', '#94429c', '#5e3366', '#21e6ff')
STONE = ('#def7ff', '#b5ced6', '#94adbd', '#6b8c9c', '#3c5966')
# light, base, shade, dark (outline), band; one pot per incense, coloured like its sprite
INCENSES = {
    'sea': ('#c5def7', '#63a5f7', '#4a73c5', '#2d5291', '#adc5de'),
    'lax': ('#fff7bd', '#e6ad10', '#ce9410', '#8a5607', '#ffde9c'),
    'full': ('#ffffad', '#ded600', '#9c8c00', '#6b5624', '#de4a4a'),
    'odd': ('#f7c5f7', '#e63af7', '#a563ce', '#7a2b88', '#7b4ac5'),
    'rock': ('#ded6a5', '#ad8c42', '#8c6b31', '#5a431e', '#cebd73'),
    'rose': ('#efefce', '#d6ce73', '#9c9c52', '#6b6b2b', '#ef7bef'),
    'pure': ('#ffffff', '#dedede', '#9c9c9c', '#5e5e5e', '#fff752'),
    'luck': ('#f7f7c5', '#f7ce42', '#dea542', '#8a6539', '#dee67b'),
    'wave': ('#b5f7ff', '#29cef7', '#4294c5', '#2d5291', '#4af7ff'),
}
LINE = 1.3

# A tube lying on its side like the sprites: short and fat, its open end facing the viewer at the
# lower left and its back end up and to the right. Both ends are the same near-round ellipse, joined
# by their common tangents.
F, OFF = (8.4, 13.2), (7.0, -3.0)        # front centre; where the back end sits relative to it
A, BMIN, TILT = 7.8, 6.6, -6              # half height, half width and lean of each end
B = (F[0] + OFF[0], F[1] + OFF[1])
_c, _s = math.cos(math.radians(TILT)), math.sin(math.radians(TILT))


def _f(*v):
    return ' '.join(f'{x:.2f}'.rstrip('0').rstrip('.') for x in v)


def _local(v):
    return v[0] * _c + v[1] * _s, -v[0] * _s + v[1] * _c


def _world(v):
    return v[0] * _c - v[1] * _s, v[0] * _s + v[1] * _c


def _sides(c, a=A, b=BMIN):
    """The two points where an end ellipse at c touches the tube's outline: (upper left, lower right)."""
    p, q = _local(OFF)
    t = math.atan2(-a * p, b * q)
    pts = []
    for tt in (t, t + math.pi):
        x, y = _world((b * math.cos(tt), a * math.sin(tt)))
        pts.append((c[0] + x, c[1] + y))
    pts.sort(key=lambda P: OFF[0] * (P[1] - c[1]) - OFF[1] * (P[0] - c[0]))
    return pts


def _end(c, a, b, **attrs):
    extra = ''.join(f' {k.replace("_", "-")}="{v}"' for k, v in attrs.items())
    return f'<ellipse cx="{_f(c[0])}" cy="{_f(c[1])}" rx="{_f(b)}" ry="{_f(a)}" transform="rotate({TILT} {_f(*c)})"{extra}/>'


def _tube(i, colors, ridges):
    light, base, rim, shade, dark = colors
    f_up, f_down = _sides(F)
    b_up, b_down = _sides(B)
    arc = f'A{_f(BMIN, A)} {TILT} 0 1'
    body = f'M{_f(*f_up)}L{_f(*b_up)}{arc} {_f(*b_down)}L{_f(*f_down)}{arc} {_f(*f_up)}Z'
    rings = ''
    for k in range(ridges):
        m = (k + 1) / (ridges + 1)
        u, d = _sides((F[0] + OFF[0] * m, F[1] + OFF[1] * m))
        rings += f'<path d="M{_f(*u)}{arc} {_f(*d)}" fill="none" stroke="{shade}" stroke-width="1.1"/>'
    # light along the top of the body, shade along the bottom (inset from the outline)
    n = math.hypot(*OFF)
    nx, ny = -OFF[1] / n, OFF[0] / n            # square to the tube, pointing down and right

    def line(p0, p1, inset):
        return f'M{_f(p0[0] + nx * inset + OFF[0] * 0.15, p0[1] + ny * inset + OFF[1] * 0.15)}L{_f(p1[0] + nx * inset, p1[1] + ny * inset)}'
    top, bottom = line(f_up, b_up, 1.6), line(f_down, b_down, -1.4)
    # the opening: a thin lip, the inside wall in shade, and the far end as a dark slit towards the back
    ha, hb = A - 1.3, BMIN - 1.3
    far = (F[0] + OFF[0] / n * hb * 0.45, F[1] + OFF[1] / n * hb * 0.45)
    return (f'<symbol id="it-{i}" viewBox="1 1 22 22">'
            f'<clipPath id="it-c{i}"><path d="{body}"/></clipPath>'
            f'<clipPath id="it-h{i}">{_end(F, ha, hb)}</clipPath>'
            f'<path d="{body}" fill="{base}"/>'
            f'<g clip-path="url(#it-c{i})">{rings}'
            f'<path d="{top}" stroke="{light}" stroke-width="2.6" stroke-linecap="round"/>'
            f'<path d="{bottom}" stroke="{shade}" stroke-width="2.4" stroke-linecap="round"/></g>'
            + _end(F, A, BMIN, fill=base, stroke=dark, stroke_width=LINE)
            + _end(F, ha, hb, fill=shade)
            + f'<g clip-path="url(#it-h{i})">{_end(far, ha * 0.62, hb * 0.38, fill=dark)}</g>'
            + _end(F, ha, hb, fill='none', stroke=dark, stroke_width=LINE)
            + f'<path d="{body}" fill="none" stroke="{dark}" stroke-width="{LINE}" stroke-linejoin="round"/></symbol>')


def _lens(i):
    light, base, rim, shade, dark, gem = LENS
    cx, top, bot, rx, ry = 12, 9.2, 14.2, 9.6, 5.2
    body = f'M{_f(cx - rx, top)}A{_f(rx, ry)} 0 0 1 {_f(cx + rx, top)}L{_f(cx + rx, bot)}A{_f(rx, ry)} 0 0 1 {_f(cx - rx, bot)}Z'
    hrx, hry = 6.2, 3
    gems = ''.join(
        f'<rect x="{_f(x - 1.4)}" y="{_f(y - 1.5)}" width="2.8" height="3" rx="0.7" fill="{gem}" stroke="{dark}" stroke-width="0.9"/>'
        f'<rect x="{_f(x - 0.8)}" y="{_f(y - 0.9)}" width="1" height="1" fill="#fff"/>'
        for x, y in ((5.2, 14.4), (12, 16.6), (18.8, 14.4)))
    return (f'<symbol id="it-{i}" viewBox="1 1 22 22">'
            f'<clipPath id="it-c{i}"><path d="{body}"/></clipPath><clipPath id="it-h{i}"><ellipse cx="{cx}" cy="{_f(top)}" rx="{hrx}" ry="{hry}"/></clipPath>'
            f'<path d="{body}" fill="{base}"/>'
            f'<g clip-path="url(#it-c{i})"><ellipse cx="{cx}" cy="{_f(bot + 1.6)}" rx="{_f(rx)}" ry="{_f(ry)}" fill="{rim}"/></g>'
            f'<ellipse cx="{cx}" cy="{_f(top)}" rx="{_f(rx)}" ry="{_f(ry)}" fill="{light}" stroke="{dark}" stroke-width="{LINE}"/>'
            f'<ellipse cx="{cx}" cy="{_f(top)}" rx="{hrx}" ry="{hry}" fill="{rim}"/>'
            f'<g clip-path="url(#it-h{i})"><ellipse cx="{cx}" cy="{_f(top + 2.2)}" rx="{hrx}" ry="{hry}" fill="{shade}"/></g>'
            f'<ellipse cx="{cx}" cy="{_f(top)}" rx="{hrx}" ry="{hry}" fill="none" stroke="{dark}" stroke-width="{LINE}"/>'
            f'{gems}<path d="{body}" fill="none" stroke="{dark}" stroke-width="{LINE}" stroke-linejoin="round"/></symbol>')


def _stone(i):
    light, base, mid, shade, dark = STONE
    path = 'M3.4 12.8C3.2 7.8 7.2 4.4 12.4 4.4C17.4 4.4 20.8 7.8 20.6 12.6C20.4 17.4 16.8 20.2 12 20.2C7 20.2 3.6 17.6 3.4 12.8Z'
    dots = ''.join(f'<circle cx="{x}" cy="{y}" r="0.75" fill="{mid}"/>' for x, y in ((9, 12.4), (13.6, 10), (15.4, 14.2), (11, 15.6), (6.8, 14.6)))
    return (f'<symbol id="it-{i}" viewBox="1 1 22 22">'
            f'<clipPath id="it-c{i}"><path d="{path}"/></clipPath>'
            f'<path d="{path}" fill="{shade}"/>'
            f'<g clip-path="url(#it-c{i})"><path d="{path}" fill="{base}" transform="translate(-1.6 -1.6)"/>{dots}'
            f'<ellipse cx="8.6" cy="8.8" rx="2.2" ry="1.3" fill="{light}" transform="rotate(-25 8.6 8.8)"/></g>'
            f'<path d="{path}" fill="none" stroke="{dark}" stroke-width="{LINE}"/></symbol>')


def _incense(name):
    """A round incense burner: a domed lid with vent holes and a knob, a band, and two feet."""
    light, base, shade, dark, band = INCENSES[name]
    pot = 'M3.4 13.4C3.4 8.2 7.2 5 12 5S20.6 8.2 20.6 13.4C20.6 16.8 17 18.6 12 18.6S3.4 16.8 3.4 13.4Z'
    holes = ''.join(f'<circle cx="{x}" cy="{y}" r="0.85" fill="{dark}"/>' for x, y in ((8.4, 10.2), (10, 8), (14, 8), (15.6, 10.2)))
    return (f'<symbol id="it-in-{name}" viewBox="1 1 22 22">'
            f'<clipPath id="it-cin-{name}"><path d="{pot}"/></clipPath>'
            + ''.join(f'<rect x="{x}" y="16.6" width="3.4" height="3.6" rx="1.2" fill="{dark}"/>' for x in (5.8, 14.8))
            + f'<path d="{pot}" fill="{base}"/>'
            f'<g clip-path="url(#it-cin-{name})"><rect x="2" y="2" width="20" height="10" fill="{light}" opacity="0.5"/>'
            f'<rect x="2" y="15.4" width="20" height="5" fill="{shade}"/>'
            f'<rect x="2" y="12.6" width="20" height="2.4" fill="{band}"/>'
            f'<ellipse cx="7.8" cy="8.6" rx="2" ry="1.2" fill="{light}" transform="rotate(-35 7.8 8.6)"/></g>'
            f'{holes}<path d="M10.6 11.4 12 9.4 13.4 11.4Z" fill="{dark}"/>'
            f'<path d="{pot}" fill="none" stroke="{dark}" stroke-width="{LINE}"/>'
            f'<circle cx="12" cy="4.8" r="1.3" fill="{shade}" stroke="{dark}" stroke-width="1"/></symbol>')


def symbols():
    """Every icon as a <symbol>, in one hidden <svg> to put in the page once."""
    parts = [_lens(i) if t is None else _tube(i, *t[1:]) for i, t in enumerate(TUBES)] + [_stone(6)]
    parts += [_incense(name) for name in INCENSES]
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">'
            + ''.join(parts) + '</svg>')


if __name__ == '__main__':
    print(symbols())

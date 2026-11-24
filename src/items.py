"""The item icons: the six power items (braces), the Everstone and the nine incenses, and the held items on
build cards (data/item-icons.png, symbols #hi-N in data/item-icons.json order).

They are PokeMMO's own icons (the Black/White item icons the game shows), taken from a ROM by
src/build-breeding-icons.py into data/breeding-items.png: one row of 24x24 cells. build.py puts symbols()
into the page once; each icon is then <svg><use href="#it-N"/></svg>, with N = 0-5 for the braces in stat
order (HP, Atk, Def, SpA, SpD, Spe) and 6 for the Everstone. The incenses are <use href="#it-in-sea"/> and
so on, named by the first word of the incense.
Each symbol draws its sprite as SVG squares (one path per colour; .item-ic sets shape-rendering) rather than as
an image: browsers smooth a scaled or half-pixel-placed image even when told not to, which blurred the edges
and made icons look cut off, while squares always snap to whole screen pixels. The dark theme's light rim is
drawn the same way (a CSS drop-shadow came out blurry at 150% scaling). Standard library only.
"""
import os
import struct
import zlib

CELL = 24
# the incenses in sheet order, after the braces and the Everstone
INCENSES = ['sea', 'lax', 'full', 'odd', 'rock', 'rose', 'pure', 'luck', 'wave']
NAMES = [str(i) for i in range(7)] + [f'in-{n}' for n in INCENSES]
DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
SHEET = os.path.join(DATA, 'breeding-items.png')
# the held items on build cards (src/build-item-icons.py): symbols #hi-0, #hi-1... in item-icons.json order
HELD = os.path.join(DATA, 'item-icons.png')


def _read_png(path):
    """Width, height and rows of (r, g, b, a) for an 8-bit RGBA PNG (what build-breeding-icons.py writes)."""
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n'
    i, idat = 8, b''
    while i < len(d):
        n, kind = struct.unpack('>I4s', d[i:i + 8])
        body = d[i + 8:i + 8 + n]
        if kind == b'IHDR':
            w, h, depth, ctype, _, _, interlace = struct.unpack('>IIBBBBB', body)
            assert depth == 8 and ctype == 6 and not interlace, 'breeding-items.png must be 8-bit RGBA'
        elif kind == b'IDAT':
            idat += body
        i += 12 + n
    raw, stride, rows, prev = zlib.decompress(idat), w * 4, [], bytearray(w * 4)
    for y in range(h):
        f, line = raw[y * (stride + 1)], bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for x in range(stride):
            a = line[x - 4] if x >= 4 else 0
            b, c = prev[x], prev[x - 4] if x >= 4 else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append([tuple(line[x:x + 4]) for x in range(0, stride, 4)])
        prev = line
    return w, h, rows


def _symbols(path, ids):
    _, h, rows = _read_png(path)
    parts = []
    for k, name in enumerate(ids):
        paths = {}
        for y in range(h):
            x = 0
            while x < CELL:
                c = rows[y][CELL * k + x]
                if c[3] < 128:
                    x += 1; continue
                n = 1
                while x + n < CELL and rows[y][CELL * k + x + n] == c:
                    n += 1
                paths.setdefault('#%02x%02x%02x' % c[:3], []).append(f'M{x} {y}h{n}v1h-{n}z')
                x += n
        # the rim: every see-through square touching the sprite (sides or corners), painted --sprite-rim (dark theme only)
        solid = {(x, y) for y in range(h) for x in range(CELL) if rows[y][CELL * k + x][3] >= 128}
        rim = sorted({(x + dx, y + dy) for x, y in solid for dx in (-1, 0, 1) for dy in (-1, 0, 1)} - solid,
                     key=lambda q: (q[1], q[0]))
        rim = [f'M{x} {y}h1v1h-1z' for x, y in rim if 0 <= x < CELL and 0 <= y < h]
        parts.append(f'<symbol id="{name}" viewBox="0 0 {CELL} {CELL}">'
                     + f'<path style="fill:var(--sprite-rim,transparent)" d="{"".join(rim)}"/>'
                     + ''.join(f'<path fill="{col}" d="{"".join(d)}"/>' for col, d in paths.items()) + '</symbol>')
    return parts


def symbols():
    """Every icon as a <symbol>, in one hidden <svg> to put in the page once."""
    w = _read_png(HELD)[0]
    parts = _symbols(SHEET, [f'it-{n}' for n in NAMES]) + _symbols(HELD, [f'hi-{k}' for k in range(w // CELL)])
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">'
            + ''.join(parts) + '</svg>')


if __name__ == '__main__':
    print(symbols())

# Packs the Gen 7 box icons (40x30, from PokeAPI/sprites) into one sheet, 25 per row,
# icon for dex number N at index N-1, plus a "?" icon at index 649 for unknown species.
# Usage: python3 build-sprites.py <icons dir> <out.png>
import sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
W, H, COLS, N = 40, 30, 25, 649
rows = (N + 1 + COLS - 1) // COLS
sheet = Image.new('RGBA', (W * COLS, H * rows), (0, 0, 0, 0))
for n in range(1, N + 1):
    im = Image.open(f'{src}/{n}.png').convert('RGBA')
    i = n - 1
    sheet.paste(im, ((i % COLS) * W, (i // COLS) * H))

# The "?" icon, drawn in the box-icon style: light fill, dark outline, shaded right/bottom edge.
GLYPH = [
    '..XXXXX..',
    '.XXXXXXX.',
    'XXX...XXX',
    'XXX...XXX',
    '......XXX',
    '.....XXX.',
    '....XXX..',
    '...XXX...',
    '...XXX...',
    '...XXX...',
    '.........',
    '...XXX...',
    '...XXX...',
]
FILL, SHADE, LINE = (248, 248, 248, 255), (176, 184, 192, 255), (48, 52, 60, 255)
gw, gh = len(GLYPH[0]), len(GLYPH)
filled = lambda x, y: 0 <= y < gh and 0 <= x < gw and GLYPH[y][x] == 'X'
q = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ox, oy = (W - gw) // 2, H - gh - 4
for y in range(-1, gh + 1):
    for x in range(-1, gw + 1):
        if filled(x, y):
            edge = not filled(x + 1, y) or not filled(x, y + 1)
            q.putpixel((ox + x, oy + y), SHADE if edge else FILL)
        elif any(filled(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
            q.putpixel((ox + x, oy + y), LINE)
i = N
sheet.paste(q, ((i % COLS) * W, (i // COLS) * H))

sheet = sheet.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
sheet.save(out, optimize=True)
print(out, sheet.size)

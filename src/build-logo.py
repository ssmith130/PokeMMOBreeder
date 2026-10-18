# The site's logo: Smearguru, the paint-covered Smeargle from Pokémon Pokopia, made by repainting
# Smeargle's box icon from data/box-icons.png: a bigger brush dipped in red, yellow, green and blue,
# paint stains on its fur, and a blue paint moustache above its mouth.
# Writes data/logo.png (the icon, cropped) and data/logo-square.png (centred on 32x32, for the tab icon).
# Usage: python3 src/build-logo.py   (needs Pillow)
import os
from PIL import Image

here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sheet = Image.open(os.path.join(here, 'data', 'box-icons.png')).convert('RGBA')
DEX = 235  # Smeargle; the sheet has 40x30 icons, 25 per row in dex order
col, row = (DEX - 1) % 25, (DEX - 1) // 25
im = Image.new('RGBA', (40, 30), (0, 0, 0, 0))  # a fresh image, so none of the sheet's metadata is copied
im.alpha_composite(sheet.crop((col * 40, row * 30, col * 40 + 40, row * 30 + 30)))

OUTLINE = (0x30, 0x31, 0x31)
PAINT = {  # light, shade
    'red': ((0xff, 0x6b, 0x5e), (0xd6, 0x2b, 0x2b)),
    'yellow': ((0xff, 0xdf, 0x45), (0xd9, 0xa6, 0x00)),
    'green': ((0x6a, 0xde, 0x41), (0x18, 0x9c, 0x00)),
    'blue': ((0x5c, 0xa9, 0xff), (0x1f, 0x5f, 0xd6)),
}


def put(x, y, c):
    im.putpixel((x, y), c + (255,))


# The brush: remove the small green one and draw a bigger one with two tufts, joined to the tail at row 15.
for y in range(15):
    for x in range(13):
        im.putpixel((x, y), (0, 0, 0, 0))
BRUSH = ['...#.......',
         '..##..#....',
         '..#####....',
         '.#######...',
         '.#######...',
         '..########.',
         '..########.',
         '...######..',
         '.....####..']
inside = {(2 + x, 6 + y) for y, line in enumerate(BRUSH) for x, ch in enumerate(line) if ch == '#'}
for x, y in inside:
    t = ((x - 10) * -5 + (y - 15) * -9) / (5 * 5 + 9 * 9)  # 0 where it meets the tail, 1 at the tips
    paint = 'red' if t > 0.68 else 'yellow' if t > 0.45 else 'green' if t > 0.22 else 'blue'
    put(x, y, PAINT[paint][1 if (x + 1, y) not in inside or (x, y + 1) not in inside else 0])
for x, y in inside:
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        if (x + dx, y + dy) not in inside and im.getpixel((x + dx, y + dy))[3] == 0:
            put(x + dx, y + dy, OUTLINE)

# Paint stains on the head, arm, body and tail.
for paint, pixels in [('red', [(17, 11), (17, 12)]), ('blue', [(21, 11), (22, 11)]), ('yellow', [(15, 12), (15, 13)]),
                      ('blue', [(12, 19)]), ('green', [(21, 22), (22, 22)]), ('red', [(27, 22)])]:
    for x, y in pixels:
        put(x, y, PAINT[paint][1])

# The moustache: two blue strokes just above the mouth.
for x, y in [(16, 19), (18, 19), (19, 19)]:
    put(x, y, PAINT['blue'][1])

im = im.crop(im.getbbox())
im.save(os.path.join(here, 'data', 'logo.png'), optimize=True)
square = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
square.alpha_composite(im, ((32 - im.width) // 2, (32 - im.height) // 2))
square.save(os.path.join(here, 'data', 'logo-square.png'), optimize=True)
print('logo', im.size, 'square', square.size)

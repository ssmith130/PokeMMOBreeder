"""Draw the site's app icons and link-preview image into public/.

Needs Pillow (pip install pillow). The PNGs are checked in, so build.py doesn't need this.
Fonts are optional: pass the folder holding ChakraPetch-Bold.ttf and IBMPlexSans.ttf
(both on Google Fonts), otherwise DejaVu Sans is used.

  python3 src/build-icons.py [fonts-folder]
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(here, 'public')
os.makedirs(out, exist_ok=True)
fonts = sys.argv[1] if len(sys.argv) > 1 else ''

BG = (16, 21, 27)          # --bg, dark theme
SURFACE = (24, 32, 42)
INK = (230, 235, 241)
MUTED = (147, 160, 176)
ACCENT = (76, 193, 149)    # --accent, dark theme
SS = 4                     # supersampling for the icon's rounded corners


def logo(scale):
    """The Smearguru logo (data/logo.png, made by src/build-logo.py), blown up `scale` times with hard pixel edges."""
    art = Image.open(os.path.join(here, 'data', 'logo.png')).convert('RGBA')
    return art.resize((art.width * scale, art.height * scale), Image.NEAREST)


def icon(size, rounded, scale):
    """Square app icon: the logo centred on the dark background."""
    base = Image.new('RGBA', (size * SS, size * SS), (0, 0, 0, 0))
    r = size * SS * 0.22 if rounded else 0
    ImageDraw.Draw(base).rounded_rectangle([0, 0, size * SS - 1, size * SS - 1], radius=r, fill=BG + (255,))
    base = base.resize((size, size), Image.LANCZOS)
    art = logo(scale)
    base.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return base


icon(192, True, 5).save(os.path.join(out, 'icon-192.png'))
icon(512, True, 14).save(os.path.join(out, 'icon-512.png'))
icon(512, False, 12).save(os.path.join(out, 'icon-maskable-512.png'))  # stays inside the maskable safe zone
icon(180, False, 5).convert('RGB').save(os.path.join(out, 'apple-touch-icon.png'))


def font(name, size, fallback):
    path = os.path.join(fonts, name)
    try:
        return ImageFont.truetype(path if os.path.exists(path) else fallback, size)
    except OSError:
        return ImageFont.load_default(size)


# Link preview (Discord, social sites): 1200x630
W, H = 1200, 630
og = Image.new('RGBA', (W, H), BG + (255,))
d = ImageDraw.Draw(og)
d.rounded_rectangle([40, 40, W - 40, H - 40], radius=28, fill=SURFACE, outline=(42, 53, 66), width=2)
og.alpha_composite(logo(7), (100, 150))
title = font('ChakraPetch-Bold.ttf', 78, '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
body = font('IBMPlexSans.ttf', 34, '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
d.text((320, 140), 'PokeMMO', font=title, fill=ACCENT)
d.text((320, 222), 'Breeding Planner', font=title, fill=INK)
d.text((322, 330), 'Fewest-breed trees from the Pokémon you own,', font=body, fill=MUTED)
d.text((322, 376), 'with braces, Everstones and costs worked out.', font=body, fill=MUTED)
# a row of box icons
sheet = Image.open(os.path.join(here, 'data', 'box-icons.png')).convert('RGBA')
dex = [324, 27, 132, 133, 37, 246, 443, 447]
x = 84
for n in dex:
    i = n - 1
    sprite = sheet.crop(((i % 25) * 40, (i // 25) * 30, (i % 25) * 40 + 40, (i // 25) * 30 + 30)).resize((120, 90), Image.NEAREST)
    og.alpha_composite(sprite, (x, 440))
    x += 130
og.convert('RGB').save(os.path.join(out, 'og-image.png'), optimize=True)
print('wrote', sorted(os.listdir(out)))

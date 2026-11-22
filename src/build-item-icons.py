"""Make the held-item icon sheet for the "Start from a build" cards: data/item-icons.png + data/item-icons.json.

The icons are the in-game item sprites from PokeAPI/sprites (sprites/items/<name>.png), cropped to their
pixels and centred in 32x32 cells, one row. item-icons.json lists the item names in cell order. build.py
puts both into the page. Needs Pillow and network; the PNG and JSON are checked in, so build.py doesn't.
Rerun it after adding a set whose item has no icon yet:

  python3 src/build-item-icons.py
"""
import io
import json
import os
import re
import urllib.request

from PIL import Image

here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CELL = 32
# items the common builds show, besides the ones in data/presets.json
EXTRA = ['Toxic Orb', 'Leftovers', 'Choice Band', 'Silk Scarf', 'White Herb', 'Focus Sash', 'Choice Scarf', 'Choice Specs']

sets = json.load(open(os.path.join(here, 'data', 'presets.json'), encoding='utf-8'))['sets']
names = sorted({s['item'] for s in sets if s.get('item')} | set(EXTRA))
cells, kept = [], []
for name in names:
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    url = f'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/{slug}.png'
    try:
        img = Image.open(io.BytesIO(urllib.request.urlopen(url, timeout=20).read())).convert('RGBA')
    except Exception as e:  # no sprite for it: the page shows a plain dot instead
        print('no icon for', name, e)
        continue
    img = img.crop(img.getbbox())
    if max(img.size) > CELL:
        img.thumbnail((CELL, CELL), Image.NEAREST)
    cells.append(img)
    kept.append(name)

sheet = Image.new('RGBA', (CELL * len(cells), CELL), (0, 0, 0, 0))
for i, img in enumerate(cells):
    sheet.paste(img, (i * CELL + (CELL - img.width) // 2, (CELL - img.height) // 2))
sheet.save(os.path.join(here, 'data', 'item-icons.png'), optimize=True)
json.dump(kept, open(os.path.join(here, 'data', 'item-icons.json'), 'w', encoding='utf-8'))
print(len(kept), 'icons,', os.path.getsize(os.path.join(here, 'data', 'item-icons.png')), 'bytes')

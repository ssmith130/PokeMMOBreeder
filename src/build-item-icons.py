"""Make the held-item icon sheet for build cards (Common builds, Events, presets): data/item-icons.png + .json.

Every item named in data/presets.json or data/events.json (and EXTRA below) gets a 24x24 cell, one row;
item-icons.json lists the names in cell order. src/items.py turns each cell into a crisp SVG symbol (#hi-N).
Items PokeMMO shows from the Black/White ROM (most of them) use that exact icon: ROM_ICONS gives its picture
and palette file in a/0/2/5 (see src/build-breeding-icons.py). Items from later games aren't in the ROM, and
PokeMMO's own icons for them (Assault Gear, Covert Mantle, Loaded Dice...) aren't in its client files, so they
use PokeAPI/sprites; the big newer artwork there is shrunk to fit. Needs Pillow, and network for those.

  python3 src/build-item-icons.py <Black or White .nds, or its a/0/2/5 NARC>

Add an item to ROM_ICONS when a new set uses a Gen 1-5 item (find its files by comparing with its PokeAPI
sprite, which is the same picture).
"""
import importlib.util
import io
import json
import os
import re
import sys
import urllib.request

from PIL import Image

here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CELL = 24
# items the common builds show, besides the ones in data/presets.json and data/events.json
EXTRA = ['Toxic Orb', 'Leftovers', 'Choice Band', 'Silk Scarf', 'White Herb', 'Focus Sash', 'Choice Scarf', 'Choice Specs']
# (picture, palette) file numbers in the ROM's a/0/2/5
ROM_ICONS = {
    'Air Balloon': (920, 921), 'Black Sludge': (510, 511), 'Bug Gem': (934, 945), 'Choice Band': (263, 264),
    'Choice Scarf': (512, 513), 'Choice Specs': (520, 521), 'Damp Rock': (642, 643), 'Eviolite': (914, 915),
    'Expert Belt': (496, 497), 'Flame Orb': (504, 505), 'Flying Gem': (934, 943), 'Focus Sash': (659, 660),
    'Heat Rock': (640, 641), 'Leftovers': (291, 292), 'Life Orb': (498, 499), 'Light Clay': (611, 612),
    'Lum Berry': (180, 181), 'Macho Brace': (254, 255), 'Magnet': (306, 307), 'Never-Melt Ice': (314, 315),
    'Rocky Helmet': (918, 919), 'Silk Scarf': (324, 325), 'Sitrus Berry': (182, 183), 'Toxic Orb': (502, 503),
    'White Herb': (252, 253),
}
# PokeAPI file names that don't follow the item's name
SLUGS = {'Punching Gloves': 'punching-glove'}

_spec = importlib.util.spec_from_file_location('breeding', os.path.join(here, 'src', 'build-breeding-icons.py'))
_b = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_b)


def names():
    found = set(EXTRA)

    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in ('item', 'items'):
                    found.update([v] if isinstance(v, str) else [x for x in v if isinstance(x, str)])
                walk(v)
        elif isinstance(o, list):
            for x in o:
                walk(x)
    for f in ('presets.json', 'events.json'):
        walk(json.load(open(os.path.join(here, 'data', f), encoding='utf-8')))
    return sorted(found)


def pokeapi(name):
    slug = SLUGS.get(name) or re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    url = f'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/{slug}.png'
    img = Image.open(io.BytesIO(urllib.request.urlopen(url, timeout=20).read())).convert('RGBA')
    img = img.crop(img.getchannel('A').getbbox())
    if max(img.size) > CELL - 2:  # newer artwork: shrink, then make every pixel solid or see-through again
        img.thumbnail((CELL - 2, CELL - 2), Image.LANCZOS)
        a = img.getchannel('A').point(lambda v: 255 if v >= 110 else 0)
        img = img.convert('RGB').quantize(24).convert('RGBA'); img.putalpha(a)
    return img


def main(rom):
    files = _b.narc(open(rom, 'rb').read() if rom.endswith('.narc') else _b.nds_file(rom, 'a/0/2/5'))
    cells, kept = [], []
    for name in names():
        try:
            if name in ROM_ICONS:
                g, p = ROM_ICONS[name]
                img = _b.picture(files[g], _b.palette(files[p]))
                img = img.crop(img.getchannel('A').getbbox())
            else:
                img = pokeapi(name)
        except Exception as e:  # no icon: the page shows a plain dot instead
            print('no icon for', name, e)
            continue
        assert max(img.size) <= CELL, name
        cells.append(img); kept.append(name)
    sheet = Image.new('RGBA', (CELL * len(cells), CELL), (0, 0, 0, 0))
    for i, img in enumerate(cells):
        sheet.alpha_composite(img, (i * CELL + (CELL - img.width) // 2, (CELL - img.height + 1) // 2))
    sheet.save(os.path.join(here, 'data', 'item-icons.png'), optimize=True)
    json.dump(kept, open(os.path.join(here, 'data', 'item-icons.json'), 'w', encoding='utf-8'))
    print(len(kept), 'icons:', ', '.join(f'{n} ({"ROM" if n in ROM_ICONS else "PokeAPI"})' for n in kept))


if __name__ == '__main__':
    main(sys.argv[1])

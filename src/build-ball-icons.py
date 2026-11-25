"""Make the ball icon sheet for the Catch rate tab: data/ball-icons.png, one 24x24 cell per ball in BALLS order.

These are PokeMMO's own ball icons: the game shows the Black/White item icons from the ROM you give it, so they
come from a Black or White ROM (a/0/2/5, see src/build-breeding-icons.py). src/items.py turns each cell into a
crisp SVG symbol #ball-<key>, with the keys of src/catch.js. Needs Pillow.

  python3 src/build-ball-icons.py <Black or White .nds>

To add a ball, add its key here and in BALLS of src/items.py (same order), with its picture and palette file.
"""
import importlib.util
import os
import sys

from PIL import Image

here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CELL = 24
# key (as in src/catch.js): (picture, palette) file numbers in the ROM's a/0/2/5
ICONS = {
    'poke': (8, 9), 'great': (6, 7), 'ultra': (4, 5), 'master': (2, 3), 'safari': (10, 11), 'net': (12, 13),
    'dive': (14, 15), 'nest': (16, 17), 'repeat': (18, 19), 'timer': (20, 22), 'luxury': (21, 22),
    'premier': (23, 22), 'dusk': (663, 664), 'heal': (665, 666), 'quick': (667, 668), 'cherish': (669, 670),
    'lure': (715, 716), 'level': (717, 718), 'moon': (719, 720), 'heavy': (721, 722), 'fast': (723, 724),
    'friend': (725, 726), 'love': (727, 728), 'dream': (969, 970),
}

_spec = importlib.util.spec_from_file_location('breeding', os.path.join(here, 'src', 'build-breeding-icons.py'))
_b = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_b)


def main(rom):
    files = _b.narc(_b.nds_file(rom, 'a/0/2/5'))
    sheet = Image.new('RGBA', (CELL * len(ICONS), CELL))
    for k, (g, p) in enumerate(ICONS.values()):
        im = _b.picture(files[g], _b.palette(files[p]))
        im = im.crop(im.getchannel('A').getbbox())
        sheet.alpha_composite(im, (CELL * k + (CELL - im.width) // 2, (CELL - im.height + 1) // 2))
    sheet.save(os.path.join(here, 'data', 'ball-icons.png'), optimize=True)
    print(' '.join(ICONS))


if __name__ == '__main__':
    main(sys.argv[1])

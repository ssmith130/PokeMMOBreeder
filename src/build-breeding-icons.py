# Makes data/breeding-items.png: PokeMMO's own icons for the breeding items, one 24x24 cell each in one row:
# the six Power items in stat order (HP, Atk, Def, SpA, SpD, Spe), the Everstone, then the nine incenses in the
# order of INCENSES in src/items.py. PokeMMO shows the Black/White item icons from the ROM you give it, so they
# come from a Pokémon Black/White ROM (a/0/2/5: an NCGR picture followed by its NCLR palette per icon).
# Also prints the hidden ability mark PokeMMO draws on box spots (HiddenAbilitySmall in the game's
# data/sprites/atlas/main.atlas) as the SVG that src/page.html uses for HA_ICON.
# Usage: python3 build-breeding-icons.py <PokeMMO folder> <Black or White .nds> <out.png>
import importlib.util, os, struct, sys
from PIL import Image

_spec = importlib.util.spec_from_file_location('costume', os.path.join(os.path.dirname(__file__), 'build-costume-icons.py'))
_costume = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_costume)
nds_file, narc = _costume.nds_file, _costume.narc

# (picture, palette) file numbers in a/0/2/5
ICONS = [('Power Weight', 689, 690), ('Power Bracer', 683, 684), ('Power Belt', 691, 692), ('Power Lens', 693, 694),
         ('Power Band', 685, 686), ('Power Anklet', 687, 688), ('Everstone', 281, 282),
         ('Sea Incense', 329, 330), ('Lax Incense', 331, 332), ('Full Incense', 526, 527), ('Odd Incense', 522, 523),
         ('Rock Incense', 524, 525), ('Rose Incense', 530, 531), ('Pure Incense', 534, 535),
         ('Luck Incense', 532, 533), ('Wave Incense', 528, 529)]
CELL = 24


def palette(d):
    o = d.find(b'TTLP')
    off = struct.unpack('<I', d[o + 20:o + 24])[0]
    raw = d[o + 8 + off:o + 8 + off + 32]
    out = []
    for i in range(0, 32, 2):
        c = struct.unpack('<H', raw[i:i + 2])[0]
        out.append(((c & 31) * 255 // 31, ((c >> 5) & 31) * 255 // 31, ((c >> 10) & 31) * 255 // 31, 255))
    return out


def picture(d, pal):
    """A 32x32 4bpp icon in 8x8 tiles, 4 across; colour 0 is see-through."""
    o = d.find(b'RAHC')
    data = d[o + 0x20:o + 0x20 + 512]
    im = Image.new('RGBA', (32, 32))
    for i in range(32 * 32):
        v = (data[i // 2] >> (4 * (i % 2))) & 15
        if v:
            t, r, c = i // 64, (i % 64) // 8, i % 8
            im.putpixel(((t % 4) * 8 + c, (t // 4) * 8 + r), pal[v])
    return im


def ha_svg(pokemmo):
    """The game's small hidden ability diamond as crisp SVG rectangles, one path per colour."""
    atlas = open(f'{pokemmo}/data/sprites/atlas/main.atlas').read().split('\n')
    i = atlas.index('HiddenAbilitySmall')
    x, y = (int(v) for v in atlas[i + 2].split(':')[1].split(','))
    w, h = (int(v) for v in atlas[i + 3].split(':')[1].split(','))
    im = Image.open(f'{pokemmo}/data/sprites/atlas/main.png').convert('RGBA').crop((x, y, x + w, y + h))
    l, t, r, b = im.getchannel('A').getbbox()
    paths = {}
    for py in range(t, b):
        px = l
        while px < r:
            c = im.getpixel((px, py))
            if c[3] == 0:
                px += 1; continue
            n = 1
            while px + n < r and im.getpixel((px + n, py)) == c:
                n += 1
            paths.setdefault('#%02x%02x%02x' % c[:3], []).append(f'M{px - l} {py - t}h{n}v1h-{n}z')
            px += n
    return (f'<svg class="ha" viewBox="0 0 {r - l} {b - t}" shape-rendering="crispEdges" aria-hidden="true">'
            + ''.join(f'<path fill="{k}" d="{"".join(v)}"/>' for k, v in paths.items()) + '</svg>')


def main(pokemmo, rom, out_path):
    files = narc(nds_file(rom, 'a/0/2/5'))
    sheet = Image.new('RGBA', (CELL * len(ICONS), CELL))
    for k, (_, g, p) in enumerate(ICONS):
        im = picture(files[g], palette(files[p]))
        im = im.crop(im.getchannel('A').getbbox())
        sheet.alpha_composite(im, (CELL * k + (CELL - im.width) // 2, (CELL - im.height + 1) // 2))
    sheet.save(out_path, optimize=True)
    print(ha_svg(pokemmo))


if __name__ == '__main__':
    main(*sys.argv[1:4])

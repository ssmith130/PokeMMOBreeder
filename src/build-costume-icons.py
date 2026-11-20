# Makes data/costume-icons.png: the costumed box icons, one 40x30 cell each (same size as data/box-icons.png),
# in the order of COSTUME_ICONS in src/page.html.
# PokeMMO draws a costumed icon as the species' DS icon (32x32, placed at 2,2 in a 36x36 square) with a costume
# layer on top. The layers are in the game's data/resources.zip (sprites/monstericons/composite-<dex>-<id>-0.png);
# the DS icons come from a Pokémon Black/White ROM (a/0/0/7: palettes, then an icon per species).
# Usage: python3 build-costume-icons.py <PokeMMO folder> <Black or White .nds> <out.png>
import struct, sys, zipfile, io
from PIL import Image

# costume, species, dex number, costume id in the game, which of the 3 icon palettes the species uses
ICONS = [('Royal', 'Charmander', 4, 2000, 0), ('Royal', 'Charmeleon', 5, 2001, 0), ('Royal', 'Charizard', 6, 2002, 0),
         ('Ninja', 'Meowth', 52, 2010, 1), ('Ninja', 'Persian', 53, 2011, 1),
         ('Vampire', 'Sneasel', 215, 2012, 0), ('Vampire', 'Weavile', 461, 2013, 0),
         ('Pirate', 'Gible', 443, 2007, 0), ('Pirate', 'Gabite', 444, 2008, 0), ('Pirate', 'Garchomp', 445, 2009, 0),
         ('Pharaoh', 'Riolu', 447, 2005, 2), ('Pharaoh', 'Lucario', 448, 2006, 2)]
TOP = 3  # rows cut off the top of the 36x36 square to fit 30 rows (no icon uses them)


def nds_file(rom, path):
    """One file of the ROM's file system, by path."""
    f = open(rom, 'rb')
    h = f.read(0x200)
    fnt_off, fnt_len, fat_off, fat_len = struct.unpack('<IIII', h[0x40:0x50])
    f.seek(fat_off); fat = f.read(fat_len)
    f.seek(fnt_off); fnt = f.read(fnt_len)
    files = {}

    def walk(dirid, prefix):
        off, first, _ = struct.unpack('<IHH', fnt[(dirid & 0xfff) * 8:(dirid & 0xfff) * 8 + 8])
        i, fid = off, first
        while fnt[i]:
            t = fnt[i]; i += 1
            name = fnt[i:i + (t & 0x7f)].decode('latin1'); i += t & 0x7f
            if t & 0x80:
                walk(struct.unpack('<H', fnt[i:i + 2])[0], prefix + name + '/'); i += 2
            else:
                files[prefix + name] = fid; fid += 1
    walk(0xf000, '')
    s, e = struct.unpack('<II', fat[files[path] * 8:files[path] * 8 + 8])
    f.seek(s)
    return f.read(e - s)


def narc(d):
    """The files inside a NARC archive."""
    o = struct.unpack('<H', d[12:14])[0]
    size, n = struct.unpack('<IH', d[o + 4:o + 10])
    ents = [struct.unpack('<II', d[o + 12 + 8 * i:o + 20 + 8 * i]) for i in range(n)]
    o2 = o + size
    base = o2 + struct.unpack('<I', d[o2 + 4:o2 + 8])[0] + 8
    return [d[base + s:base + e] for s, e in ents]


def main(pokemmo, rom, out_path):
    icons = narc(nds_file(rom, 'a/0/0/7'))
    pal = icons[0]
    o = pal.find(b'TTLP')
    size, off = struct.unpack('<II', pal[o + 16:o + 24])
    raw = pal[o + 8 + off:o + 8 + off + size]
    colours = []
    for i in range(0, len(raw), 2):
        c = struct.unpack('<H', raw[i:i + 2])[0]
        colours.append(((c & 31) * 255 // 31, ((c >> 5) & 31) * 255 // 31, ((c >> 10) & 31) * 255 // 31, 255))

    def ds_icon(dex, p):
        g = icons[7 + 2 * dex]  # 4bpp, 8x8 tiles, 4 across; the first 32x32 frame
        o = g.find(b'RAHC')
        size = struct.unpack('<I', g[o + 24:o + 28])[0]
        data = g[o + 0x20:o + 0x20 + size]
        im = Image.new('RGBA', (32, 32))
        for i in range(32 * 32):
            v = (data[i // 2] >> (4 * (i % 2))) & 15
            if v:
                t, r, c = i // 64, (i % 64) // 8, i % 8
                im.putpixel(((t % 4) * 8 + c, (t // 4) * 8 + r), colours[p * 16 + v])
        return im

    res = zipfile.ZipFile(f'{pokemmo}/data/resources.zip')
    sheet = Image.new('RGBA', (40 * len(ICONS), 30))
    for k, (_, _, dex, cid, p) in enumerate(ICONS):
        sq = Image.new('RGBA', (36, 36))
        sq.alpha_composite(ds_icon(dex, p), (2, 2))
        layer = Image.open(io.BytesIO(res.read(f'sprites/monstericons/composite-{dex}-{cid}-0.png'))).convert('RGBA')
        sq.alpha_composite(layer)
        sheet.alpha_composite(sq.crop((0, TOP, 36, TOP + 30)), (40 * k + 2, 0))
    sheet.save(out_path, optimize=True)


if __name__ == '__main__':
    main(*sys.argv[1:4])

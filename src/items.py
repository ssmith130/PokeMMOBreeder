"""The breeding item icons: the six power items (braces), the Everstone and the nine incenses.

They are PokeMMO's own icons (the Black/White item icons the game shows), taken from a ROM by
src/build-breeding-icons.py into data/breeding-items.png: one row of 24x24 cells. build.py puts symbols()
into the page once; each icon is then <svg><use href="#it-N"/></svg>, with N = 0-5 for the braces in stat
order (HP, Atk, Def, SpA, SpD, Spe) and 6 for the Everstone. The incenses are <use href="#it-in-sea"/> and
so on, named by the first word of the incense. Every symbol shows its own cell of the one sheet, drawn with
hard pixel edges. Standard library only.
"""
import base64
import os

CELL = 24
# the incenses in sheet order, after the braces and the Everstone
INCENSES = ['sea', 'lax', 'full', 'odd', 'rock', 'rose', 'pure', 'luck', 'wave']
NAMES = [str(i) for i in range(7)] + [f'in-{n}' for n in INCENSES]
SHEET = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'breeding-items.png')


def symbols():
    """Every icon as a <symbol>, in one hidden <svg> to put in the page once."""
    data = base64.b64encode(open(SHEET, 'rb').read()).decode()
    sheet = (f'<defs><image id="it-sheet" width="{CELL * len(NAMES)}" height="{CELL}" preserveAspectRatio="none" '
             f'style="image-rendering:pixelated" href="data:image/png;base64,{data}"/></defs>')
    parts = [f'<symbol id="it-{n}" viewBox="0 0 {CELL} {CELL}"><use href="#it-sheet" x="{-CELL * k}"/></symbol>'
             for k, n in enumerate(NAMES)]
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">'
            + sheet + ''.join(parts) + '</svg>')


if __name__ == '__main__':
    print(symbols())

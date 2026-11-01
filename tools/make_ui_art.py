"""Draws the interface's pixel art: python tools/make_ui_art.py

Writes client/img/ui/*.png and client/css/icons.css. The art is code so that one palette runs through
all of it and a sprite can be changed without an image editor. Standard library only.

Two materials, both sampled from the reference art: the book (leather and peach paper) for what you
read and decide, and the slate (mauve stone, lit from the top left) for what your hands use.
"""
import math
import random
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "client" / "img" / "ui"

# ---------- palette ----------
INK = "#3f2029"       # outline of everything on the book
COVER = "#7a3f33"
COVER_LT = "#a8603f"
PEACH = "#f7caa0"
PEACH_HI = "#fde0c2"
PEACH_LO = "#e69d6a"
PEACH_DK = "#cf7f4e"
CREAM = "#fff1df"
GOLD = "#fac13c"
GOLD_LT = "#ffe58a"
GOLD_DK = "#d67a10"
RED, RED_HI, RED_LO = "#c02c42", "#e4586a", "#7d1730"
BLUE, BLUE_HI, BLUE_LO = "#1484dc", "#52bdf5", "#0a57a8"
GREEN, GREEN_HI, GREEN_LO = "#2e9150", "#62c47a", "#1b6237"
AMBER, AMBER_HI, AMBER_LO = "#f7a51d", "#ffcf5c", "#c9720f"

S_INK = "#2e2d3f"     # the slate, darkest to lightest
S_DEEP = "#45445a"
S_DARK = "#545361"
S_LOW = "#77758b"
S_MID = "#86849a"
S_FACE = "#b3aabb"
S_LIT = "#d9cfe0"
S_HI = "#f5e6f8"


def rgba(c):
    if c is None:
        return (0, 0, 0, 0)
    h = c[1:]
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(h[6:8], 16) if len(h) == 8 else 255)


# ---------- a tiny drawing surface ----------
class Art:
    def __init__(self, w, h, fill=None):
        self.w, self.h = w, h
        self.px = [fill] * (w * h)

    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y * self.w + x] = c

    def get(self, x, y):
        return self.px[y * self.w + x] if 0 <= x < self.w and 0 <= y < self.h else None

    def rect(self, x, y, w, h, c):
        for j in range(y, y + h):
            for i in range(x, x + w):
                self.put(i, j, c)

    def hline(self, x, y, w, c):
        self.rect(x, y, w, 1, c)

    def vline(self, x, y, h, c):
        self.rect(x, y, 1, h, c)

    def frame(self, x, y, w, h, c):
        self.hline(x, y, w, c)
        self.hline(x, y + h - 1, w, c)
        self.vline(x, y, h, c)
        self.vline(x + w - 1, y, h, c)

    def rrect(self, x, y, w, h, r, c):
        """A filled rectangle with its corners cut off in steps."""
        for j in range(h):
            inset = max(0, r - j, r - (h - 1 - j))
            self.hline(x + inset, y + j, w - 2 * inset, c)

    def blit(self, other, x, y):
        for j in range(other.h):
            for i in range(other.w):
                c = other.px[j * other.w + i]
                if c is not None:
                    self.put(x + i, y + j, c)

    def flipped(self):
        out = Art(self.w, self.h)
        for j in range(self.h):
            for i in range(self.w):
                out.put(self.w - 1 - i, j, self.get(i, j))
        return out

    def ascii(self, rows, palette, x=0, y=0):
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch != ".":
                    self.put(x + i, y + j, palette[ch])

    def outline(self, c):
        """Rings every opaque shape with c, one pixel inside its edge."""
        edge = [(x, y) for y in range(self.h) for x in range(self.w) if self.get(x, y) is not None
                and any(self.get(x + dx, y + dy) is None for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        for x, y in edge:
            self.put(x, y, c)

    def save(self, name):
        raw = bytearray()
        for y in range(self.h):
            raw.append(0)
            for x in range(self.w):
                raw.extend(rgba(self.px[y * self.w + x]))
        def chunk(tag, data):
            return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", self.w, self.h, 8, 6, 0, 0, 0))
        png += chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        (OUT_DIR / f"{name}.png").write_bytes(png)


# ---------- the book ----------
def cut(a, corner, n):
    """Rounds one corner of a sprite in steps, leaving the ink line along the cut."""
    cx, cy = {"tl": (0, 0), "tr": (a.w - 1, 0), "bl": (0, a.h - 1), "br": (a.w - 1, a.h - 1)}[corner]
    sx, sy = (1 if cx == 0 else -1), (1 if cy == 0 else -1)
    for j in range(n):
        for i in range(n - j):
            a.put(cx + sx * i, cy + sy * j, None)
    for i in range(n + 1):
        a.put(cx + sx * i, cy + sy * (n - i), INK)


def corner_dots(a, x, y, sx, sy):
    """The worn ornament inside a page corner: a stitched L that fades along both arms."""
    for i, on in enumerate("##.##.#.#"):
        if on == "#":
            a.put(x + sx * i, y, PEACH_LO)
            a.put(x, y + sy * i, PEACH_LO)
    a.rect(x + (0 if sx > 0 else -1), y + (0 if sy > 0 else -1), 2, 2, PEACH_LO)
    a.put(x + sx * 2, y + sy * 2, PEACH_LO)


RIVET = [".###.", "#ooo#", "#oDo#", "#ooo#", ".###."]


def rivet(a, x, y):
    a.ascii(RIVET, {"#": PEACH_DK, "o": PEACH_LO, "D": PEACH_DK}, x, y)


def page(right):
    """One page of the open book, spine on the right. The right page is this one mirrored."""
    S = 44
    a = Art(S, S, PEACH)
    a.hline(0, 0, S, INK)
    a.hline(0, 1, S, PEACH_HI)
    a.hline(0, 2, S, PEACH_LO)
    # the fore edge: cover, then the stack of pages
    for x, c in enumerate((INK, INK, COVER, COVER, COVER_LT, PEACH_LO, PEACH_HI)):
        a.vline(x, 1 if x > 1 else 0, S, c)
    # the bottom edge: pages, cover, and the book's shadow on itself
    for y, c in enumerate((PEACH_HI, PEACH_LO, PEACH, PEACH_LO, COVER_LT, COVER, COVER, INK)):
        a.hline(5 if y < 4 else 2, S - 8 + y, S, c)
    a.hline(0, S - 1, S, INK)
    # the gutter, falling away into the spine
    for i, c in enumerate((INK, COVER, PEACH_DK, PEACH_DK, PEACH_LO, PEACH_LO)):
        a.vline(S - 1 - i, 3, S - 3 - (8 if i > 1 else 1), c)
    a.vline(S - 1, 0, S, INK)
    # the printed frame
    fx, fy, fx2, fy2 = 9, 5, S - 9, S - 13
    a.hline(fx, fy, fx2 - fx + 1, PEACH_LO)
    a.hline(fx, fy2, fx2 - fx + 1, PEACH_LO)
    a.vline(fx, fy, fy2 - fy + 1, PEACH_LO)
    a.vline(fx2, fy, fy2 - fy + 1, PEACH_LO)
    corner_dots(a, fx + 2, fy + 2, 1, 1)
    rivet(a, fx2 - 6, fy2 - 6)
    cut(a, "tl", 3)
    cut(a, "bl", 3)
    # gold corner guards
    a.ascii(["G.....", "GG....", "gGG...", "ggGG..", "dggGG.", "ddggGG"],
            {"G": GOLD_LT, "g": GOLD, "d": GOLD_DK}, 0, S - 7)
    a.put(0, 2, GOLD)
    a.put(0, 3, GOLD_LT)
    a.put(0, 4, GOLD)
    return a.flipped() if right else a


def clasp():
    a = Art(18, 8)
    a.ascii(["....kkkkkkkkkk....",
             "..kkGGGGGGGGGGkk..",
             ".kGGgggggggggggGk.",
             "kGgg..........ggdk",
             "kgg............gdk",
             "kgd............ddk",
             "kdk............kdk",
             ".k..............k."], {"k": INK, "G": GOLD_LT, "g": GOLD, "d": GOLD_DK})
    return a


def stitch():
    """The dashed thread around a box. Period 6, so that 'round' repeats it without a seam."""
    a = Art(24, 24)
    for x in range(2, 22):
        a.put(x, 1 if x % 6 < 3 else 2, PEACH_LO)
        y = 21 if x % 6 < 3 else 22
        a.put(x, y, PEACH_DK)
        a.put(x, y + 1 if y == 21 else y - 1, PEACH_LO)
    for y in range(3, 21):
        if y % 6 < 4:
            a.put(1 if y % 12 < 6 else 2, y, PEACH_LO)
            a.put(22 if y % 12 < 6 else 21, y, PEACH_DK)
    return a


def plate():
    """An engraved panel with a rivet in each corner."""
    S = 28
    a = Art(S, S)
    a.frame(2, 2, S - 4, S - 4, PEACH_LO)
    for x, y in ((0, 0), (S - 5, 0), (0, S - 5), (S - 5, S - 5)):
        rivet(a, x, y)
    return a


def slot_book(lit=False):
    S = 26
    a = Art(S, S)
    a.rrect(0, 0, S, S, 3, GOLD_DK if lit else PEACH_LO)
    a.rrect(1, 1, S - 2, S - 2, 3, CREAM if lit else "#f9d3ad")
    a.rect(4, S - 2, S - 8, 1, PEACH_HI)
    for x, y in ((3, 0), (S - 4, 0), (0, 3), (S - 1, 3), (0, S - 4), (S - 1, S - 4), (3, S - 1), (S - 4, S - 1)):
        a.put(x, y, GOLD_DK if lit else PEACH_DK)
    return a


def well():
    a = Art(14, 14)
    a.rrect(0, 0, 14, 14, 2, PEACH_DK)
    a.rrect(1, 1, 12, 12, 2, PEACH_LO)
    a.hline(3, 1, 8, PEACH_DK)
    return a


def button(face, hi, lo, pressed=False, edge=INK):
    S = 16
    a = Art(S, S)
    a.rrect(0, 0, S, S, 2, edge)
    if pressed:
        a.rrect(1, 1, S - 2, S - 2, 2, face)
        a.hline(3, 1, S - 6, lo)
        a.hline(2, 2, S - 4, lo)
    else:
        a.rrect(1, 1, S - 2, S - 2, 2, lo)
        a.rrect(1, 1, S - 2, S - 4, 2, face)
        a.hline(3, 1, S - 6, hi)
        a.vline(1, 3, S - 8, hi)
    return a


def tab(active):
    w, h = 26, 28 if active else 24
    a = Art(w, h)
    a.rrect(0, 0, w, h + 8, 3, INK)
    fill = PEACH if active else PEACH_LO
    a.rrect(1, 1, w - 2, h + 8, 3, fill)
    a.hline(4, 1, w - 8, PEACH_HI if active else PEACH)
    a.vline(1, 4, h - 4, PEACH_HI if active else PEACH)
    if not active:
        a.rect(2, h - 3, w - 4, 3, PEACH_DK)
    return a


def ribbon(main, hi, lo):
    """A swallowtail bookmark. Its left end hides behind the book until it is the open one."""
    w, h = 46, 26
    a = Art(w, h)
    for y in range(h):
        notch = int((1 - abs(y - (h - 1) / 2) / ((h - 1) / 2)) * 8 + 0.5)
        a.hline(0, y, w - notch, main)
    for y in range(h):
        for x in range(w):
            if a.get(x, y) is not None:
                if y < 3:
                    a.put(x, y, hi)
                elif y >= h - 3:
                    a.put(x, y, lo)
    a.rect(0, 3, 2, h - 6, lo)
    for y in range(4, h - 4):
        notch = int((1 - abs(y - (h - 1) / 2) / ((h - 1) / 2)) * 8 + 0.5)
        a.put(w - notch - 2, y, lo)
    a.outline(INK)
    return a


def close():
    a = Art(13, 13)
    a.ascii([".kk.......kk.",
             "kppk.....krrk",
             "kprrk...krrRk",
             ".krrrk.krrRk.",
             "..krrrkrrRk..",
             "...krrrrRk...",
             "....krrRk....",
             "...krrrrRk...",
             "..krrRkrrRk..",
             ".krrRk.krrRk.",
             "krrRk...krrRk",
             "kRRk.....kRRk",
             ".kk.......kk."], {"k": INK, "r": RED, "p": RED_HI, "R": RED_LO})
    return a


def note():
    S = 20
    a = Art(S, S)
    a.rrect(0, 0, S, S, 2, INK)
    a.rrect(1, 1, S - 2, S - 2, 2, PEACH_LO)
    a.rrect(1, 1, S - 2, S - 4, 2, PEACH)
    a.hline(3, 1, S - 6, PEACH_HI)
    a.vline(1, 3, S - 8, PEACH_HI)
    return a


def field():
    S = 12
    a = Art(S, S, CREAM)
    a.hline(0, 0, S, PEACH_DK)
    a.vline(0, 0, S, PEACH_DK)
    a.hline(1, 1, S - 1, PEACH_HI)
    a.hline(0, S - 1, S, PEACH_LO)
    a.vline(S - 1, 1, S - 1, PEACH_LO)
    return a


def banner():
    """A strip of paper with rolled ends, for messages over the world."""
    w, h = 40, 22
    a = Art(w, h)
    a.rrect(5, 0, w - 10, h, 1, INK)
    a.rect(5, 1, w - 10, h - 2, PEACH)
    a.hline(5, 1, w - 10, PEACH_HI)
    a.hline(5, h - 3, w - 10, PEACH_LO)
    a.hline(5, h - 2, w - 10, PEACH_DK)
    for side in (0, 1):
        roll = Art(7, h)
        roll.rrect(0, 1, 7, h - 2, 2, INK)
        roll.rrect(1, 2, 5, h - 4, 2, PEACH_LO)
        roll.vline(2, 3, h - 6, PEACH_HI)
        roll.vline(5, 3, h - 6, PEACH_DK)
        a.blit(roll, 0 if side == 0 else w - 7, 0)
    return a


def banner_red():
    """The ribbon the name of a land unfurls on."""
    w, h = 64, 26
    a = Art(w, h)
    for flip in (0, 1):
        tail = Art(16, h)
        for y in range(4, h):
            notch = int((1 - abs(y - 14.5) / 10.5) * 6 + 0.5)
            tail.hline(notch, y, 16 - notch, RED_LO)
        tail.outline(INK)
        tail.rect(12, 4, 4, 2, INK)
        a.blit(tail.flipped() if flip else tail, w - 16 if flip else 0, 0)
    a.rect(7, 0, w - 14, h - 4, INK)
    a.rect(7, 1, w - 14, h - 6, RED)
    a.hline(7, 1, w - 14, RED_HI)
    a.hline(7, h - 6, w - 14, RED_LO)
    a.ascii(["kk", "kk", "kk", "kk"], {"k": "#55101f"}, 7, h - 4)
    a.ascii(["kk", "kk", "kk", "kk"], {"k": "#55101f"}, w - 9, h - 4)
    return a


def dither():
    a = Art(2, 2)
    a.put(0, 0, S_INK)
    a.put(1, 1, S_INK)
    return a


# ---------- the slate ----------
def slab():
    """The stone slab: rim, dark groove, face, and a hard shadow under it."""
    S = 34
    a = Art(S, S)
    a.rrect(3, 3, S - 3, S - 3, 2, S_INK + "99")
    b = S - 3
    a.rrect(0, 0, b, b, 2, S_INK)
    a.rrect(1, 1, b - 2, b - 2, 2, S_FACE)
    a.rrect(3, 3, b - 6, b - 6, 1, S_DARK)
    a.rrect(5, 5, b - 10, b - 10, 0, S_FACE)
    a.hline(3, 1, b - 6, S_LIT)
    a.vline(1, 3, b - 6, S_LIT)
    a.hline(3, b - 2, b - 6, "#938ba0")
    a.vline(b - 2, 3, b - 6, "#938ba0")
    a.ascii(["..hh", ".hhh", "hhh.", "hh.."], {"h": S_HI}, 1, 1)
    return a


def slab_thin():
    """A plain raised bar of slate, for the HUD."""
    S = 18
    a = Art(S, S)
    a.rrect(2, 2, S - 2, S - 2, 1, S_INK + "99")
    b = S - 2
    a.rrect(0, 0, b, b, 1, S_INK)
    a.rect(1, 1, b - 2, b - 2, S_FACE)
    a.hline(1, 1, b - 2, S_LIT)
    a.vline(1, 1, b - 2, S_LIT)
    a.rect(1, 1, 2, 2, S_HI)
    a.hline(2, b - 2, b - 3, "#938ba0")
    a.vline(b - 2, 2, b - 3, "#938ba0")
    return a


def slot_slate(selected=False):
    """A recess cut into the stone: shadow along the top, lit along the bottom right."""
    S = 26
    a = Art(S, S, S_MID)
    a.rect(0, 0, S, 4, S_LOW)
    a.hline(0, 0, S, S_DARK)
    a.vline(0, 0, S, S_DARK)
    a.vline(1, 1, S - 2, S_LOW)
    a.hline(0, S - 1, S, S_FACE)
    a.vline(S - 1, 2, S - 3, S_FACE)
    a.hline(S - 8, S - 1, 8, S_HI)
    a.vline(S - 1, S - 11, 11, S_HI)
    if selected:
        a.frame(0, 0, S, S, GOLD_DK)
        a.frame(1, 1, S - 2, S - 2, GOLD)
        a.hline(1, 1, S - 2, GOLD_LT)
        a.vline(1, 1, S - 2, GOLD_LT)
        for x, y in ((0, 0), (S - 1, 0), (0, S - 1), (S - 1, S - 1)):
            a.put(x, y, S_INK)
    return a


def pane():
    S = 16
    a = Art(S, S, S_DARK)
    a.rect(0, 0, S, 4, S_DEEP)
    a.hline(0, 0, S, S_INK)
    a.vline(0, 0, S, S_INK)
    a.hline(0, S - 1, S, S_HI)
    a.vline(S - 1, 1, S - 1, S_HI)
    return a


def bar_frame():
    S = 12
    a = Art(S, S, S_DEEP)
    a.frame(0, 0, S, S, S_INK)
    a.hline(1, 1, S - 2, S_INK)
    a.hline(1, S - 2, S - 2, S_DARK)
    return a


def minimap_ring():
    """The stone bezel around the minimap. The middle is empty: the map shows through it."""
    S = 92
    a = Art(S, S)
    c = (S - 1) / 2
    for y in range(S):
        for x in range(S):
            d = math.hypot(x - c, y - c)
            if d > c + 0.3 or d < c - 6.5:
                continue
            lit = (x + y - 2 * c) / (2 * c)  # -1 at the top left, +1 at the bottom right
            if d > c - 0.8 or d < c - 5.6:
                a.put(x, y, S_INK)
            elif d > c - 3.4:
                a.put(x, y, S_HI if lit < -0.62 else S_LIT if lit < -0.25 else "#938ba0" if lit > 0.3 else S_FACE)
            else:
                a.put(x, y, S_DARK)
    return a


# ---------- icons ----------
K = {".": None, "k": INK, "w": "#fff4e6", "l": "#c8cede", "g": "#8b92a8", "d": "#5b6178", "r": "#d8344a", "R": "#8f1d38",
     "p": "#ff8a7a", "b": "#1f8fe0", "B": "#0f5aa8", "c": "#62d0ff", "y": "#ffd24a", "Y": "#f59e1b", "o": "#d9701a",
     "n": "#a25a3e", "N": "#6b3626", "t": "#e8b98a", "e": "#3fae5a", "E": "#1d6b3c", "f": "#8fdc7a", "m": "#b3aabb",
     "M": "#6f6c85", "v": "#b98af0", "V": "#6d42b8"}

ICONS = {
    "heart": """
................
................
...kkk....kkk...
..krrrk..krrrk..
.krpprrkkrrrrRk.
.krpprrrrrrrrRk.
.krrrrrrrrrrrRk.
.krrrrrrrrrrRRk.
..krrrrrrrrRRk..
...krrrrrrRRk...
....krrrrRRk....
.....krrRRk.....
......krRk......
.......kk.......
................
................""",
    "mana": """
................
.......kk.......
......kcck......
.....kccbbk.....
....kcccbbBk....
...kcccbbbBBk...
..kcccbbbbbBBk..
..kccbbbbbbBBk..
...kcbbbbbBBk...
....kbbbbBBk....
.....kbbBBk.....
......kbBk......
.......kk.......
................
................
................""",
    "coin": """
................
.....kkkkkk.....
...kkyyyyyykk...
..kyywyyyyyyYk..
..kywyYYYYyyYk..
.kyyyYyyyyYyyYk.
.kyyyYyyyyYyyYk.
.kyyyYyyyyYyyYk.
.kyyyYyyyyYyyYk.
.kyyyyYYYYyyYYk.
..kyyyyyyyyYYk..
..kYyyyyyyYYYk..
...kkYYYYYYkk...
.....kkkkkk.....
................
................""",
    "potion": """
................
......kkkk......
......knnk......
......kkkk......
......klwk......
.....kkwlkk.....
....kwlllllk....
...kwlrrrrrrk...
...kwrpprrrRk...
...klrprrrrRk...
...klrrrrrrRk...
...klrrrrrRRk...
....krrrRRRk....
.....kkkkkk.....
................
................""",
    "sword": """
................
............kkkk
...........klllk
..........kllwlk
.........kllwlk.
........kllwlk..
.......kllwlk...
..kk..kllwlk....
..kyk.klwlk.....
...kyklwlk......
....kyllk.......
...kkkyyk.......
..knnk.kyk......
.knNk...kk......
.kNk............
..k.............""",
    "shield": """
................
..kkkkkkkkkkkk..
..kcbbbbyllllk..
..kcbbbbyllllk..
..kbbbbbyllllk..
..kyyyyyyyyyyk..
..kbbbbbylllgk..
..kbbbbbylllgk..
..kBbbbbyllgdk..
...kBbbbyllgk...
...kBBbbylgdk...
....kBBbygdk....
.....kBBydk.....
......kBdk......
.......kk.......
................""",
    "pick": """
................
.....kkkkkkk....
....klllllllkk..
.....kkkkkllllk.
.........knkllk.
........knNkkllk
.......knNk.kllk
......knNk...klk
.....knNk....klk
....knNk......k.
...knNk.........
..knNk..........
.knNk...........
.kNk............
..k.............
................""",
    "flag": """
................
...kk...........
...kykkkkkkkk...
...kkrrrrrrrrk..
...knrrrrrrrk...
...knrpprrrk....
...knrrrrrrrk...
...knrrrrrrrrk..
...knkkkkkkkk...
...kn...........
...kn...........
...kn...........
...kn...........
..kkkk..........
................
................""",
    "scales": """
................
.......kk.......
..kkkkkyykkkkk..
.kyyyyyyyyyyyyk.
..kYkkkYYkkkYk..
..k.k.kyYk.k.k..
.k...kkyYkk...k.
k.....kyYk.....k
kyyyyykyYkyyyyyk
kYYYYYkyYkYYYYYk
.kkkkkkyYkkkkkk.
......kyYk......
......kyYk......
....kkyyYYkk....
....kkkkkkkk....
................""",
    "scroll": """
................
...kkkkkkkkkk...
..kwwwwwwwwwtk..
..kkkkwwwwwwtk..
...kwwwwwwwwtk..
...kwnnnnnwwtk..
...kwwwwwwwwtk..
...kwnnnnwwwtk..
...kwwwwwwwwtk..
...kwnnnnnwwtk..
...kwwwwwwwwtk..
...kwwwwwkkkkk..
...ktwwwktwwwk..
....kkkkkkkkk...
................
................""",
    "bag": """
......kkkk......
.....kn..nk.....
....kkkkkkkk....
...knttttnnNk...
..kkntttnnnNkk..
.knkkkkkkkkkknk.
.knknnnllnnNknk.
.knknnklyknNknk.
.knknnnkknnNknk.
.kNkkkkkkkkkkNk.
.kNkntttttnNkNk.
.kkknttttnnNkkk.
...knnnnnnNNk...
...kkkkkkkkkk...
................
................""",
    "journal": """
................
..kkkkkkkkkkkk..
.kccbbbbbbbbbBk.
.kcbbbbbbbbbbBk.
.kbbbkkkkkbbbBk.
.kbbbbbbbbbbbBk.
.kbbbbbbbbbbbBk.
.kbbbbbbbbbbbBk.
.kbbbbbbbbbbbBk.
.kbbbbbbbbbbbBk.
.kkkkkkkkkkkkBk.
.ktwwwwwwwwwwkk.
.ktttttttttttk..
.kBBBBBBBBBBBBk.
..kkkkkkkkkkkk..
................""",
    "map": """
................
.kkkkkkkkkkkkkk.
.kffefntttnbcbk.
.kfefenrtrnbbbk.
.kefffnttrnbbbk.
.kffefntrtnbcbk.
.kfffenrtrnbbck.
.kfeffntttnbbbk.
.kffffntntnbcbk.
.keffentttnbbbk.
.kfffenntnnbbck.
.kffefntttnbbbk.
.kkkkkkkkkkkkkk.
................
................
................""",
    "gear": """
................
......kkkk......
...kk.klgk.kk...
..kllkklgkklgk..
..kllllllllggk..
...klggkkgggk...
.kkklgk..kggkkk.
.kllggk..kgggdk.
.kllggk..kgggdk.
.kkklgk..kggkkk.
...klggkkgggk...
..kllggggggddk..
..kggkkggkkddk..
...kk.kggk.kk...
......kkkk......
................""",
    "quest": """
................
................
.kkkkkkkkkkkkkk.
.kwkwwwwwwwwkwk.
.kwwkkwwwwkkwwk.
.kwwwwkkkkwwwwk.
.kwwwkrrrrkwwwk.
.kwwkrprrrRkwwk.
.kwwkrrrrrRkwwk.
.kwwwkrrRRkwwwk.
.kwwlwkkkkwlwwk.
.kllllllllllllk.
.kkkkkkkkkkkkkk.
................
................
................""",
    "talk": """
................
...kkkkkkkkkk...
..kwwwwwwwwwwk..
.kwwwwwwwwwwwwk.
.kwwgwwgwwgwwwk.
.kwwgwwgwwgwwwk.
.kwwwwwwwwwwwlk.
..kwwwwwwwwwlk..
...kkkkkwwlkk...
.......kwlk.....
.......kwk......
.......kk.......
................
................
................
................""",
    "gift": """
................
....kkk..kkk....
...kyyYkkyyYk...
...kykyYYykYk...
....kkyyyykk....
.kkkkkkyykkkkkk.
.krrrrryyrrrrRk.
.kRRRRRYYRRRRRk.
.kkkkkkyykkkkkk.
..krrrryyrrrRk..
..krrrryyrrrRk..
..krrrryyrrrRk..
..kRRRRYYRRRRk..
..kkkkkkkkkkkk..
................
................""",
    "star": """
................
.......kk.......
......kyyk......
......kyyk......
.....kyyyyk.....
.kkkkkyyyykkkkk.
.kyyyyyyyyyyyYk.
..kyyyyyyyyyYk..
...kyyyyyyyYk...
....kyyyyyYk....
....kyyyyyYk....
...kyyykkyyYk...
...kyykk..kkYk..
...kkk.....kk...
................
................""",
    "sun": """
................
.......yY.......
.......yY.......
..yY.kkkkkk.yY..
...ykyyyyyYkY...
....kyyyyyyYk...
...kyywyyyyyYk..
.yykyywyyyyyYkY.
.YYkyyyyyyyyYkY.
...kyyyyyyyYYk..
....kyyyyyYYk...
...ykYyyyYYYkY..
..yY.kkkkkk.yY..
.......yY.......
.......yY.......
................""",
    "moon": """
................
.....kkkkk......
...kkmmmmk......
..kmmlllk.......
.kmmllmk........
.kmlllk.........
.kmllmk.........
.kmlllk.........
.kmllllk.....k..
.kmmlllmkkkkkMk.
..kmmlllllllMk..
...kkmmmmmMMk...
.....kkkkkkk....
................
................
................""",
    "skull": """
................
....kkkkkkkk....
...kwwwwwwwlk...
..kwwwwwwwwwlk..
..kwwkkwwkkwlk..
..kwkkkwwkkklk..
..kwkkkwwkkklk..
..kwwkwwwwkwlk..
...kwwwkkwwlk...
....kwwwwwlk....
....kwkwkwkk....
....kkwkwkwk....
.....kkkkkk.....
................
................
................""",
    "warn": """
................
.......kk.......
......kyyk......
......kyyk......
.....kyyyyk.....
.....kykkyk.....
....kyykkyyk....
....kyykkyyk....
...kyyykkyyyk...
...kyyykkyyyk...
..kyyyyyyyyyYk..
..kyyyykkyyyYk..
.kyyyyykkyyyYYk.
.kYYYYYYYYYYYYk.
..kkkkkkkkkkkk..
................""",
    "bolt": """
................
.......kkkkk....
......kyyyyk....
......kyyyk.....
.....kyyyk......
.....kyyykkkk...
....kyyyyyyyk...
....kYYYyyyk....
.....kkkyyk.....
.......kyyk.....
......kyyk......
......kyk.......
.....kyk........
.....kk.........
................
................""",
    "fire": """
................
.......kk.......
.......kok......
......kook......
..k...koook..k..
.kk..koorook.kk.
.kok.korroookok.
.koookorrrrooook
.koorrrryyrrrook
.korrryyyyyrrrok
.korryywwyyyrrok
..kryyywwwyyrok.
...kryywwwyyrk..
....kkryyyrkk...
......kkkkk.....
................""",
    "wagon": """
................
................
.....kkkkkkk....
...kkwwwwwwwkk..
..kwwwwwwwwwlk..
.kwwwwwwwwwwlk..
.kkkkkkkkkkkkkk.
.knnnnnnnnnnnNk.
.knNNNNNNNNNNNk.
.kkkkkkkkkkkkkk.
..kkk.....kkk...
.ktNtk...ktNtk..
.kNkNk...kNkNk..
.ktNtk...ktNtk..
..kkk.....kkk...
................""",
    "party": """
................
..r....y...b....
.....c.....r....
.y.......k....y.
.....b..kyk..c..
...r...kyrk.....
.c....kybyk...r.
.....kyryyk.....
...kkybyyrk..y..
..kyyrybyk......
.kyryyyrk...b...
.kbyyrkk..r.....
.kryykk......c..
..kkk...y.......
................
................""",
    "dark": """
................
.....kkkkkk.....
...kkMMMMMMkk...
..kMMddddddMMk..
..kMddddddddMk..
.kMddkkddddddMk.
.kMdkkkdddkddMk.
.kMddkkddddddMk.
.kMdddddkkdddMk.
.kMddddkkkddMMk.
..kMddddkdddMk..
..kMMddddddMMk..
...kkMMMMMMkk...
.....kkkkkk.....
................
................""",
    "eye": """
................
................
................
.....kkkkkk.....
...kkwwwwwwkk...
..kwwwwkkwwwwk..
.kwwwwkbbkwwwwk.
.kwwwkbcbbkwwwk.
.kwwwkbbbbkwwwk.
.kwwwwkbbkwwwwk.
..kwwwwkkwwwwk..
...kkwwwwwwkk...
.....kkkkkk.....
................
................
................""",
    "hush": """
................
................
................
................
................
................
.k............k.
..kk........kk..
....kkkkkkkk....
...k..k..k..k...
..k...k..k...k..
................
................
................
................
................""",
    "heal": """
................
................
.....kkkkkk.....
.....kfeeek.....
.....keeeEk.....
.kkkkkeeeEkkkkk.
.kfeeeeeeeeeeEk.
.keeeeeeeeeeeEk.
.keeeeeeeeeeeEk.
.kkkkkeeeEkkkkk.
.....keeeEk.....
.....keeeEk.....
.....kEEEEk.....
.....kkkkkk.....
................
................""",
    "pray": """
................
.......kk.......
......kyyk......
......kyYk......
.......kk.......
......kwwk......
......kwlk......
.....kkwlkk.....
....kyywlyyk....
...kyYkwlkYyk...
..kYk.kwlk.kYk..
......kwlk......
.....kkwlkk.....
....kNNNNNNk....
....kkkkkkkk....
................""",
    "sparkle": """
................
.......kk.......
.......ky.......
......kyyk......
......kyyk......
..kkkkyyyykkkk..
..kyyyywwyyyyk..
..kkkkyyyykkkk..
......kyyk...k..
......kyyk..kyk.
.......ky..kywyk
.......kk...kyk.
.............k..
................
................
................""",
    "tunic": """
................
...kkk....kkk...
..knnnkkkknnnk..
.kntnnnnnnnnnNk.
.kntnnknnknnnNk.
.kkknnnkknnnkkk.
...kntnnnnnNk...
...kntnnnnnNk...
...kkkkyykkkk...
...kntnyynnNk...
...kntnnnnnNk...
...knnnnnnNNk...
...kNNNNNNNNk...
...kkkkkkkkkk...
................
................""",
    "plate": """
................
...kkk....kkk...
..kllgkkkkgllk..
.klwlggggggllgk.
.klwlgkggkglggk.
.kkklgkkkkgkkkk.
...klwggggggk...
...klwlgglggk...
...kdddddddgk...
...klwlgglggk...
...klwlgglggk...
...kllgggggdk...
...kdgggggddk...
...kkkkkkkkkk...
................
................""",
    "boot": """
................
................
.....kkkkkk.....
.....knntnk.....
.....kkkkkk.....
.....kntnNk.....
.....kntnNk.....
.....kntnNk.....
.....kntnnkkk...
.....kntnnnnnk..
.....kntnnnnnNk.
.....knnnnnnnNk.
.....kNNNNNNNNk.
.....kkkkkkkkkk.
................
................""",
    "wing": """
................
.............k..
...........kkwk.
.........kkwwlk.
.......kkwwwlk..
.....kkwwwwlk...
...kkwwwwwlk....
..kwwwwwwlk.....
..kkkwwwlk......
...kwwwlkk......
...kkwlkw.......
....kwlkk.......
....kkk.........
................
................
................""",
    "fist": """
................
................
....kkkkkkkk....
...ktktktktkk...
...ktktktktktk..
...ktttttttttk..
..kkkkkkkktttk..
..kttttttkttnk..
..kttttttkttnk..
...kkkkkktttnk..
....kttttttnk...
....kttttnnnk...
....kbbbbbbbk...
....kBBBBBBBk...
....kkkkkkkkk...
................""",
    "house": """
................
.......kk.......
......krrk......
.....krrrRk.....
....krrrrrRk....
...krrrrrrrRk...
..krrrrrrrrrRk..
..kkkkkkkkkkkk..
...kwwwwwwwtk...
...kwkkwwkktk...
...kwkbwwkbtk...
...kwwwkkwwtk...
...kwwwkYwwtk...
...kkkkkkkkkk...
................
................""",
    "castle": """
................
..k.k.k..k.k.k..
..kkkkk..kkkkk..
..kllgk..kllgk..
..kllgkkkkllgk..
..kllgkrrkllgk..
..kllgklgkllgk..
..kllllllllllk..
..kllllllllgk...
..kllkkkkllgk...
..kllkNNkllgk...
..kllkNNkllgk...
..kkkkkkkkkkkk..
................
................
................""",
    "grove": """
................
.....kkkkkk.....
...kkeefeeekk...
..keeffeeeeeEk..
.keeffeeeeeeeEk.
.keeeeeeeeeeEEk.
.keeeeeeeEeEEEk.
..kEeeeeEEEEEk..
...kkkEEEEkkk...
.....knnNk......
.....knnNk......
.....knnNk......
....knnnNNk.....
....kkkkkkk.....
................
................""",
    "crystal": """
................
.......kk.......
......kvVk......
.....kvvVk..kk..
.....kvvVVkkvVk.
.kk..kvvVVkvvVk.
.kvk.kvvVVkvVVk.
.kvVkkvvVVkvVVk.
.kvVVkvvVVkvVVk.
..kvVkvvVVkvVk..
..kvVVkvVVkVVk..
...kvVkvVVkVk...
...kkkkkkkkkk...
................
................
................""",
    "demon": """
................
.k...........k..
.kk..k...k..kk..
.kdk.kk.kk.kdk..
.kdk.kdkdk.kdk..
.kdk.kdddk.kdk..
.kdkkkdddkkkdk..
.kdddddddddddk..
.kdddrdddrdddk..
.kdddddddddddk..
.kdddkkkkkdddk..
.kdddkrrrkdddk..
.kdddkrrrkdddk..
.kkkkkkkkkkkkk..
................
................""",
    "palace": """
................
.......kk.......
......kcck......
.....kcbbBk.....
..k..kcbbBk..k..
.kck.kkkkkk.kck.
.kbk.kwwlk..kbk.
.kbkkkwwlkkkkbk.
.klwwwwwwwwwwlk.
.klwkwwkwwkwwlk.
.klwkwwkwwkwwlk.
.klwwwkkkwwwwlk.
.klwwwkbkwwwwlk.
.kkkkkkkkkkkkkk.
................
................""",
    "ruins": """
................
................
..kkk.......kk..
..klk..kk...klk.
..klkk.kk..kklk.
..kglk.....klgk.
..kglk.kkk.klgk.
..kglk.klk.klgk.
..kglk.klk.klgk.
..kglkkklkkklgk.
..kgkk.kgk.kkgk.
.kkkkkkkkkkkkkkk
.kggggggggggggdk
.kkkkkkkkkkkkkkk
................
................""",
    "you": """
................
.....kkkkkk.....
....kyyyyyyk....
...kyywyyyyYk...
...kyyyyyyyYk...
...kyykkkyyYk...
...kyyk.kyyYk...
...kyyykyyyYk...
....kyyyyyYk....
....kyyyyyYk....
.....kyyyYk.....
.....kyyyYk.....
......kyYk......
......kyYk......
.......kk.......
................""",
    "arrow": """
................
................
................
.........kk.....
.........kyk....
.........kyyk...
..kkkkkkkkyyyk..
..kyyyyyyyyyyyk.
..kYYYYYYYYyyyk.
..kkkkkkkkYyyk..
.........kYyk...
.........kYk....
.........kk.....
................
................
................""",
    "lock": """
................
................
.....kkkkkk.....
....kggggggk....
....kgk..kgk....
....kgk..kgk....
...kkkkkkkkkk...
...kyyyyyyyYk...
...kyyykkyyYk...
...kyyykkyyYk...
...kyyyykyyYk...
...kyyyyyyYYk...
...kYYYYYYYYk...
...kkkkkkkkkk...
................
................""",
    "keys": """
................
.kkkkkkkkkkkkkk.
.kwwwwwwwwwwwlk.
.kwkwkwkwkwkwlk.
.kwwwwwwwwwwwlk.
.kwkwkwkwkwkwlk.
.kwwwwwwwwwwwlk.
.kwkwkkkkkkkwlk.
.kwwwwwwwwwwwlk.
.klllllllllllmk.
.kkkkkkkkkkkkkk.
................
................
................
................
................""",
    "frost": """
................
.......kk.......
..kk..kcck..kk..
..kck.kcck.kck..
...kckkcckkck...
....kcwccwck....
.kkkkkcwwckkkkk.
.kccccwwwwcccck.
.kccccwwwwcccck.
.kkkkkcwwckkkkk.
....kcwccwck....
...kckkcckkck...
..kck.kcck.kck..
..kk..kcck..kk..
.......kk.......
................""",
    "comet": """
................
.............kk.
...........kkok.
.........kkoook.
.......kkoorok..
.....kkyyoorok..
...kkyyyrrok....
..kyywyyyrk.....
.kywwyyyyrk.....
.kywwyyyrrk.....
.kyyyyyrrk......
..kyyyrrk.......
...kkkkk........
................
................
................""",
}

# Goods and powers that share a shape with something else.
RECOLOURS = {
    "arc": ("bolt", {"y": "v", "Y": "V"}),
    "blink": ("sparkle", {"y": "v", "w": "c"}),
    "ward": ("shield", {"y": "w", "l": "c", "g": "b", "d": "B"}),
    "manapotion": ("potion", {"r": "b", "p": "c", "R": "B"}),
    "mithrilsword": ("sword", {"l": "c", "w": "w", "y": "v", "n": "V", "N": "B"}),
    "mithrilpick": ("pick", {"l": "c", "n": "V", "N": "B"}),
    "bluestar": ("star", {"y": "c", "Y": "b"}),
    "loot": ("bag", {"n": "M", "N": "d", "t": "l"}),
}


def icons():
    names = list(ICONS) + list(RECOLOURS)
    cols = 16
    rows = (len(names) + cols - 1) // cols
    sheet = Art(cols * 16, rows * 16)
    css = ["/* Written by tools/make_ui_art.py. */"]
    for i, name in enumerate(names):
        base, swap = RECOLOURS.get(name, (name, {}))
        art = [r for r in ICONS[base].strip("\n").split("\n")]
        assert len(art) == 16 and all(len(r) == 16 for r in art), (name, [len(r) for r in art])
        rows_art = ["".join(swap.get(ch, ch) for ch in r) for r in art]
        sheet.ascii(rows_art, K, (i % cols) * 16, (i // cols) * 16)
        css.append(f".ic-{name} {{ --ix: {i % cols}; --iy: {i // cols}; }}")
    sheet.save("icons")
    css.append(f":root {{ --icons-w: {sheet.w}; }}")
    (ROOT / "client" / "css" / "icons.css").write_text("\n".join(css) + "\n", encoding="utf-8")


# ---------- map tiles: drawn like the inked pages of an atlas ----------
TILE = 32
VARIANTS = 4
REALM_ORDER = ["ocean", "human", "elf", "beast", "peaks", "demon"]


def scatter(a, rng, n, c):
    for _ in range(n):
        a.put(rng.randrange(TILE), rng.randrange(TILE), c)


def tree(a, x, y, leaf, hi, lo):
    a.ascii([".kkkk.", "kllhhk", "klhhlk", "kllllk", "kddlld", ".kkkk.", "..nn..", "..nn.."],
            {"k": INK + "cc", "l": leaf, "h": hi, "d": lo, "n": COVER}, x, y)


def mountain(a, x, y, h, rock, shade, snow):
    for j in range(h):
        half = j + 1
        for i in range(-half, half):
            c = rock if i < 0 else shade
            if j < h // 3:
                c = snow if (i + j) % 5 else rock
            a.put(x + i, y + j, c)
        a.put(x - half, y + j, INK + "cc")
        a.put(x + half, y + j, INK + "cc")


def tile_ocean(a, rng):
    a.rect(0, 0, TILE, TILE, "#6fb0c6")
    scatter(a, rng, 22, "#62a2bb")
    for _ in range(7):
        x, y, w = rng.randrange(TILE), rng.randrange(TILE), rng.randint(3, 6)
        a.hline(x, y, w, "#a6dbe2")
        a.hline(x + 1, y + 1, max(1, w - 2), "#5a98b3")


def tile_human(a, rng):
    a.rect(0, 0, TILE, TILE, "#b9cc7c")
    scatter(a, rng, 26, "#a9c06c")
    for _ in range(3):
        x, y, w, h = rng.randrange(TILE - 8), rng.randrange(TILE - 8), rng.randint(7, 13), rng.randint(5, 9)
        c = rng.choice(("#dcd387", "#c9d67f", "#d7be72"))
        a.rect(x, y, w, h, c)
        for j in range(y + 1, y + h, 2):
            a.hline(x, j, w, "#c4b86c")
        a.frame(x, y, w, h, "#8fab5c")
    for _ in range(2):
        tree(a, rng.randrange(TILE - 6), rng.randrange(TILE - 8), "#6c9a52", "#8fbc6a", "#4f7a42")


def tile_elf(a, rng):
    a.rect(0, 0, TILE, TILE, "#6db89d")
    scatter(a, rng, 26, "#5ca88e")
    spots = [(1, 1), (12, 3), (23, 1), (5, 12), (17, 13), (1, 22), (12, 23), (24, 21)]
    rng.shuffle(spots)
    for x, y in sorted(spots[:6], key=lambda s: s[1]):
        tree(a, x + rng.randint(0, 2), y + rng.randint(0, 2), "#3d8f7d", "#7fe0c0", "#2d6a64")


def tile_beast(a, rng):
    a.rect(0, 0, TILE, TILE, "#e3c67d")
    scatter(a, rng, 30, "#d3b46a")
    for _ in range(9):
        x, y = rng.randrange(TILE), rng.randrange(TILE)
        a.put(x, y, "#b9974f")
        a.put(x + 1, y - 1, "#b9974f")
        a.put(x + 2, y, "#b9974f")
    for _ in range(rng.randint(1, 2)):
        x, y = rng.randrange(2, TILE - 11), rng.randrange(2, TILE - 10)
        a.ascii(["..kkkkkkk..", ".kllhhllllk", "kllllllldlk", ".kkkkkkkkk.", "....nn.....", "...nnn.....", "....nn.....", "....nn....."],
                {"k": INK + "cc", "l": "#7f9a45", "h": "#a8c060", "d": "#5f7a38", "n": COVER}, x, y)


def tile_peaks(a, rng):
    a.rect(0, 0, TILE, TILE, "#b5b8c6")
    scatter(a, rng, 24, "#a6a9b8")
    peaks = [(8, 4, 12), (22, 6, 13), (14, 13, 15), (4, 17, 11), (26, 18, 11)]
    rng.shuffle(peaks)
    for x, y, h in sorted(peaks[:4], key=lambda p: p[1]):
        mountain(a, x, y, h, "#8f93a6", "#6f7388", "#f4f5fa")


def tile_demon(a, rng):
    a.rect(0, 0, TILE, TILE, "#80505c")
    scatter(a, rng, 30, "#6e4250")
    for _ in range(3):
        x, y = rng.randrange(TILE), rng.randrange(TILE)
        for _ in range(rng.randint(6, 11)):
            a.put(x, y, "#e0603c")
            a.put(x, y + 1, "#a33a34")
            x += rng.choice((-1, 0, 1, 1))
            y += rng.choice((0, 1, 1))
    for _ in range(4):
        x, y = rng.randrange(TILE - 5), rng.randrange(TILE - 4)
        a.ascii([".kkk.", "kdddk", "kdlld", ".kkk."], {"k": INK + "cc", "d": "#523043", "l": "#6e4250"}, x, y)


def map_tiles():
    sheet = Art(TILE * VARIANTS, TILE * len(REALM_ORDER))
    drawers = {"ocean": tile_ocean, "human": tile_human, "elf": tile_elf, "beast": tile_beast, "peaks": tile_peaks, "demon": tile_demon}
    for row, realm in enumerate(REALM_ORDER):
        for col in range(VARIANTS):
            t = Art(TILE, TILE)
            drawers[realm](t, random.Random(f"{realm}{col}"))
            sheet.blit(t, col * TILE, row * TILE)
    sheet.save("map-tiles")


# ---------- the title vista: dusk, running from the slate's mauve down to the book's peach ----------
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def wavy(rng, length, step):
    points = [rng.random() for _ in range(length // step + 3)]
    def at(x):
        i = x // step
        t = (x % step) / step
        t = t * t * (3 - 2 * t)
        return points[i] * (1 - t) + points[i + 1] * t
    return at


def ridge(a, rng, base, amp, step, colour, block=4, top=None):
    """A hillside built of terraces, so that the horizon reads as this game's voxels."""
    n1, n2 = wavy(rng, a.w + step, step), wavy(rng, a.w + step, step // 3 or 1)
    heights = {}
    for x in range(0, a.w, block):
        h = base - amp * n1(x) - amp * 0.3 * n2(x)
        heights[x] = int(h / block) * block
        for i in range(block):
            a.vline(x + i, heights[x], a.h - heights[x], colour)
            if top:
                a.put(x + i, heights[x], top)
    return heights


def vista():
    W, H = 400, 225
    rng = random.Random("isekai")
    a = Art(W, H)
    bands = [S_INK, "#3a384e", S_DEEP, S_DARK, "#65637b", S_LOW, "#9a8ea3", "#c9a4a2", "#ecb793", PEACH]
    for y in range(H):
        t = min(1, y / (H * 0.6)) ** 0.9 * (len(bands) - 1)
        i = min(int(t), len(bands) - 2)
        f = t - i
        for x in range(W):
            a.put(x, y, bands[i + 1] if f * 16 > BAYER[y % 4][x % 4] + 0.5 else bands[i])
    for _ in range(150):
        x, y = rng.randrange(W), int(rng.random() ** 1.7 * H * 0.5)
        a.put(x, y, rng.choice((S_HI, S_FACE, S_LIT, "#ffd9a0")))
    for _ in range(9):
        x, y = rng.randrange(W), rng.randrange(int(H * 0.36))
        a.hline(x - 1, y, 3, S_HI)
        a.vline(x, y - 1, 3, S_HI)
    # the two moons of this world, as in view/scene.js
    for cx, cy, r, c, hi, lo in ((94, 52, 19, "#ffb6e6", "#ffd9f2", "#de8fc8"), (146, 31, 9, "#c8e6ff", "#eff8ff", "#9fc6e8")):
        for j in range(-r, r + 1):
            for i in range(-r, r + 1):
                if i * i + j * j <= r * r:
                    d = (i + j) / r
                    a.put(cx + i, cy + j, hi if d < -0.75 else lo if d > 0.55 else c)
    # long blocky clouds that catch the last light
    for _ in range(9):
        x, y, w = rng.randrange(-20, W), rng.randrange(int(H * 0.3), int(H * 0.62)), rng.randint(24, 80)
        a.hline(x, y, w, "#e7b5a0")
        a.hline(x + 6, y - 1, w - 14, "#f6cdb0")
        a.hline(x + 3, y + 1, w - 6, "#b98f9e")
    ridge(a, rng, 168, 42, 44, "#9a8ea3", 4)
    ridge(a, rng, 180, 38, 34, "#7d788e", 4, "#9a93ab")
    heights = ridge(a, rng, 192, 26, 30, S_DARK, 4, "#6c6a80")
    # a distant castle on the near ridge, its windows lit
    cx = 300
    gy = heights[cx - cx % 4] + 2
    for x, w, h in ((-28, 10, 34), (-16, 8, 24), (-8, 16, 44), (8, 8, 26), (16, 10, 36)):
        a.rect(cx + x, gy - h, w, h + 8, S_DEEP)
        for i in range(0, w, 3):
            a.rect(cx + x + i, gy - h - 2, 2, 2, S_DEEP)
        a.hline(cx + x, gy - h, w, S_LOW)
    a.rect(cx - 2, gy - 58, 4, 14, S_DEEP)
    a.rect(cx - 1, gy - 66, 1, 8, S_INK)
    a.ascii(["rrrr", "rrr.", "rr.."], {"r": RED}, cx, gy - 66)
    for x, y in ((-5, 34), (2, 34), (-2, 26), (-24, 26), (20, 28), (-13, 16), (11, 18)):
        a.rect(cx + x, gy - y, 2, 3, GOLD)
    # the near hill, with pines against the dusk
    near = ridge(a, rng, 214, 18, 26, S_INK, 4)
    for _ in range(26):
        x = rng.randrange(0, W - 8) // 4 * 4
        gy2 = near[x]
        h = rng.randint(10, 20)
        for j in range(h):
            half = (j % 5) + j // 4
            a.hline(x + 2 - half, gy2 - h + j, half * 2 + 1, S_INK)
    return a


def crown():
    """The crown on the logo, drawn at the logo's pixel size: three art pixels to one of these."""
    a = Art(24, 17)
    a.ascii([
        "...........kk...........",
        "..........kwrk..........",
        "..kk......krrk......kk..",
        ".kwbk......kk......kwbk.",
        ".kbbk.....khdk.....kbbk.",
        "..kk......khdk......kk..",
        "..khk....khggdk....kdk..",
        "..khgk...khggdk...kgdk..",
        "..khggk.khgggddk.kggdk..",
        "..khgggkhgggggddkgggdk..",
        "..khggggggggggggggggdk..",
        "..khggggggggggggggggdk..",
        "..kkkkkkkkkkkkkkkkkkkk..",
        "..khhhhrhhhbbhhhrhhhdk..",
        "..khgrrwrgbwwbgrwrrgdk..",
        "..khggrrggbbbbggrrggdk..",
        "..kkkkkkkkkkkkkkkkkkkk..",
    ], {"k": "#3a1c20", "h": GOLD_LT, "g": GOLD, "d": GOLD_DK, "r": RED, "w": CREAM, "b": BLUE})
    return a


def hurt():
    """Blood at the edge of the eye, dithered in so that it stays pixel art."""
    W, H = 160, 90
    a = Art(W, H)
    for y in range(H):
        for x in range(W):
            d = math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2))
            t = max(0, (d - 0.72) / 0.62)
            if t * 16 > BAYER[y % 4][x % 4] + 0.5:
                a.put(x, y, RED_LO if t > 0.62 else RED)
    return a


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, art in {
        "page-left": page(False), "page-right": page(True), "clasp": clasp(), "stitch": stitch(), "plate": plate(),
        "slot-book": slot_book(), "slot-book-lit": slot_book(True), "well": well(), "note": note(), "field": field(),
        "banner": banner(), "banner-red": banner_red(), "close": close(), "dither": dither(),
        "tab": tab(False), "tab-on": tab(True),
        "ribbon-red": ribbon(RED, RED_HI, RED_LO), "ribbon-blue": ribbon(BLUE, BLUE_HI, BLUE_LO),
        "ribbon-green": ribbon(GREEN, GREEN_HI, GREEN_LO), "ribbon-amber": ribbon(AMBER, AMBER_HI, AMBER_LO),
        "ribbon-cream": ribbon("#f7d9b5", "#fff1df", "#e6b98a"),
        "btn": button("#fbe6cc", "#fffaf0", PEACH_DK), "btn-down": button("#fbe6cc", "#fffaf0", PEACH_DK, True),
        "btn-gold": button(GOLD, GOLD_LT, GOLD_DK), "btn-gold-down": button(GOLD, GOLD_LT, GOLD_DK, True),
        "btn-slate": button(S_FACE, S_HI, S_LOW, edge=S_INK), "btn-slate-down": button(S_FACE, S_HI, S_LOW, True, S_INK),
        "slab": slab(), "slab-thin": slab_thin(), "slot": slot_slate(), "slot-on": slot_slate(True), "pane": pane(), "bar": bar_frame(), "minimap-ring": minimap_ring(),
        "vista": vista(), "hurt": hurt(), "crown": crown(),
    }.items():
        art.save(name)
    icons()
    map_tiles()
    favicon = Art(16, 16)
    favicon.ascii(ICONS["sword"].strip().split(), K)
    favicon.save("favicon")


if __name__ == "__main__":
    main()

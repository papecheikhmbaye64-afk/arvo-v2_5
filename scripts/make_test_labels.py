"""Génère des étiquettes de prix synthétiques (propres, puis dégradées comme une vraie photo) et leur vérité terrain.
Sert à mesurer l'OCR : python3 scripts/make_test_labels.py <dossier de sortie>   (Pillow requis)
Ce ne sont PAS de vraies photos : les résultats sont un plancher de sanité, pas une garantie en rayon."""
import json, random, sys, zlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

import os
SALT = os.environ.get('LABEL_SEED', '')   # graine facultative : un autre jeu, mêmes étiquettes, autres aléas
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else 'labels'); OUT.mkdir(parents=True, exist_ok=True)
F = '/usr/share/fonts/truetype/dejavu/'
def font(size, bold=True, cond=False):
    name = ('DejaVuSansCondensed-Bold.ttf' if bold else 'DejaVuSansCondensed.ttf') if cond else ('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf')
    return ImageFont.truetype(F + name, size)

W, H = 900, 520
def canvas(bg): im = Image.new('RGB', (W, H), bg); return im, ImageDraw.Draw(im)
def text(d, xy, s, size, fill='black', bold=True, cond=False, strike=False):
    f = font(size, bold, cond); d.text(xy, s, font=f, fill=fill)
    if strike:
        w = d.textlength(s, font=f); y = xy[1] + size * 0.62; d.line([(xy[0], y), (xy[0] + w, y)], fill=fill, width=max(2, size // 12))
def money(d, x, y, num, cur, size, fill='black', cur_fill=None):
    """Prix + devise côte à côte : la devise démarre après la largeur réelle des chiffres (jamais de chevauchement)."""
    text(d, (x, y), num, size, fill); w = d.textlength(num, font=font(size, True))
    text(d, (x + w + 18, y + size * 0.5), cur, int(size * 0.42), cur_fill or fill, bold=False)
def barcode(d, x, y, w, h):
    r = random.Random(7); cx = x
    while cx < x + w:
        bw = r.choice([2, 3, 4, 6]); d.rectangle([cx, y, cx + bw - 1, y + h], fill='black'); cx += bw + r.choice([2, 3, 5])

labels = []
def add(key, build, name, minor, cur, expect, others=()):
    im, d = build(); labels.append(dict(key=key, img=im, name=name, minor=minor, currency=cur, expect=expect, others=list(others)))

def l_simple():
    im, d = canvas('white'); text(d, (50, 50), 'Riz parfumé 5 kg', 52); money(d, 50, 190, '4 250', 'FCFA', 170); return im, d
def l_euro():
    im, d = canvas('white'); text(d, (50, 40), 'Lait demi-écrémé 1 L', 50); text(d, (50, 150), '1,29 €', 200); text(d, (50, 430), 'Prix au litre : 1,29 €/L', 30, bold=False); return im, d
def l_promo():
    im, d = canvas('#ffe14d'); d.rectangle([0, 0, W, 90], fill='#d4202a'); text(d, (40, 12), 'PROMO', 66, 'white'); text(d, (50, 120), 'Sucre en poudre 1 kg', 50); text(d, (50, 210), '1 990 F', 200, '#c00000'); text(d, (50, 440), 'au lieu de 2 500 F', 34, bold=False, strike=True); text(d, (640, 440), '-20%', 50, '#c00000'); return im, d
def l_kg():
    im, d = canvas('white'); text(d, (50, 60), 'Tomates fraîches', 60); text(d, (50, 220), '800 F/kg', 170); return im, d
def l_barcode():
    im, d = canvas('white'); text(d, (40, 30), 'Savon de Marseille 300 g', 48); text(d, (40, 120), '2 450 F', 160); barcode(d, 40, 330, 520, 100); text(d, (40, 440), '6 111 245 330 123', 32, bold=False); text(d, (620, 440), 'Réf. 458921', 30, bold=False); return im, d
def l_two():
    im, d = canvas('white'); text(d, (50, 50), 'Yaourt nature', 56); text(d, (50, 170), '850 F', 120); text(d, (50, 340), 'Lot de 6 : 4 900 F', 100); return im, d
def l_upper():
    im, d = canvas('#c8202a'); text(d, (40, 50), "HUILE D'ARACHIDE 1L", 56, 'white'); money(d, 40, 190, '1 850', 'F CFA', 150, 'white'); return im, d
def l_usd():
    im, d = canvas('white'); text(d, (50, 50), 'Peanut butter 340 g', 54); text(d, (50, 170), '$3.49', 220); return im, d
def l_two_line():
    im, d = canvas('white'); text(d, (50, 30), 'LESIEUR', 50, '#0a4da0'); text(d, (50, 110), 'Huile Végétale 5 L', 56); money(d, 50, 250, '9 500', 'FCFA', 150); return im, d
def l_dark():
    im, d = canvas('#111111'); text(d, (50, 50), 'Café moulu 250 g', 54, 'white'); money(d, 50, 190, '3 200', 'FCFA', 150, 'white'); return im, d
def l_shelf():
    im, d = canvas('white'); text(d, (30, 30), 'Spaghetti 500 g', 40, cond=True); text(d, (30, 120), '650 F', 110, cond=True); text(d, (30, 300), 'Origine : Italie', 28, bold=False); return im, d
def l_noisy():
    im, d = canvas('white'); text(d, (40, 30), 'Poulet fermier', 56); text(d, (40, 130), '3 500 F', 170); text(d, (40, 340), '(7 000 F/kg)', 36, bold=False); text(d, (40, 400), 'Origine : Sénégal', 30, bold=False); text(d, (40, 450), 'DLC 12/11/2026', 30, bold=False); return im, d
def l_decimal_small():
    im, d = canvas('white'); text(d, (50, 50), 'Pain de mie complet', 50); text(d, (50, 170), '2,49 €', 190); return im, d
def l_long_name():
    im, d = canvas('white'); text(d, (30, 50), 'Lait de coco sucré en poudre instantané 400 g', 34, cond=True); money(d, 50, 190, '2 750', 'FCFA', 160); return im, d
def l_small_print():
    im, d = canvas('white'); text(d, (50, 40), 'Sel fin iodé 1 kg', 30); text(d, (50, 100), 'Origine : Sénégal · Lot 2231 · DLUO 03/2028', 24, bold=False); money(d, 50, 190, '450', 'FCFA', 150); return im, d
def l_dot_thousands():
    im, d = canvas('white'); text(d, (50, 50), 'Huile végétale 5 L', 52); text(d, (50, 170), '12.500 F CFA', 140); return im, d
def l_blank():
    im, d = canvas('#9a9a9a'); return im, d

add('simple', l_simple, 'Riz parfumé 5 kg', 4250, 'XOF', 'auto')
add('euro', l_euro, 'Lait demi-écrémé 1 L', 129, 'EUR', 'auto')
add('promo', l_promo, 'Sucre en poudre 1 kg', 1990, 'XOF', 'auto')
add('kg_only', l_kg, 'Tomates fraîches', 800, 'XOF', 'choose')
add('barcode', l_barcode, 'Savon de Marseille 300 g', 2450, 'XOF', 'auto')
add('two_prices', l_two, 'Yaourt nature', 850, 'XOF', 'choose', others=[4900])
add('upper', l_upper, "Huile d'arachide 1 L", 1850, 'XOF', 'auto')
add('usd', l_usd, 'Peanut butter 340 g', 349, 'USD', 'auto')
add('two_line', l_two_line, 'Huile Végétale 5 L', 9500, 'XOF', 'auto')
add('dark', l_dark, 'Café moulu 250 g', 3200, 'XOF', 'auto')
add('shelf', l_shelf, 'Spaghetti 500 g', 650, 'XOF', 'auto')
add('noisy', l_noisy, 'Poulet fermier', 3500, 'XOF', 'auto')
add('decimal', l_decimal_small, 'Pain de mie complet', 249, 'EUR', 'auto')
add('long_name', l_long_name, 'Lait de coco sucré en poudre instantané 400 g', 2750, 'XOF', 'auto')
add('small_print', l_small_print, 'Sel fin iodé 1 kg', 450, 'XOF', 'auto')
add('dot_thousands', l_dot_thousands, 'Huile végétale 5 L', 12500, 'XOF', 'auto')
add('blank', l_blank, '', 0, None, 'fail')

def background(rng):
    bg = Image.new('RGB', (1400, 1000), (rng.randint(120, 170),) * 3)
    px = bg.load()
    for _ in range(40000): px[rng.randrange(1400), rng.randrange(1000)] = (rng.randint(90, 200),) * 3
    return bg.filter(ImageFilter.GaussianBlur(1.5))


def persp_coeffs(src, dst):
    """Coefficients PIL (a..h) d'une homographie : résolution directe du système 8x8 (pas de numpy)."""
    A, B = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); B.append(v)
    n = 8
    for i in range(n):
        piv = max(range(i, n), key=lambda r: abs(A[r][i])); A[i], A[piv] = A[piv], A[i]; B[i], B[piv] = B[piv], B[i]
        for r in range(i + 1, n):
            f = A[r][i] / A[i][i]
            for c in range(i, n): A[r][c] -= f * A[i][c]
            B[r] -= f * B[i]
    x = [0.0] * n
    for i in range(n - 1, -1, -1): x[i] = (B[i] - sum(A[i][c] * x[c] for c in range(i + 1, n))) / A[i][i]
    return x

def tilt(im, rng, strength=0.16):
    """Étiquette vue de côté (~25-30°) : un bord est plus court que l'autre, fond de rayon autour."""
    w, h = im.size; k = int(h * strength)
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    dst = [(0, k), (w, 0), (w, h), (0, h - k)] if rng.random() < .5 else [(0, 0), (w, k), (w, h - k), (0, h)]
    lab = im.transform((w, h), Image.PERSPECTIVE, persp_coeffs(src, dst), Image.BICUBIC, fillcolor=(150, 150, 150))
    bg = background(rng); lab = lab.rotate(rng.choice([-9, 9]), expand=True, fillcolor=(150, 150, 150), resample=Image.BICUBIC)
    bg.paste(lab, ((1400 - lab.width) // 2, (1000 - lab.height) // 2)); return bg

def glare(im, rng):
    """Reflet de néon : tache claire diffuse qui délave une partie de l'étiquette."""
    ov = Image.new('L', im.size, 0); d = ImageDraw.Draw(ov)
    x, y = rng.randint(im.width // 4, im.width * 3 // 4), rng.randint(im.height // 4, im.height * 3 // 4)
    d.ellipse([x - 170, y - 70, x + 170, y + 70], fill=235)
    ov = ov.filter(ImageFilter.GaussianBlur(40))
    return Image.composite(Image.new('RGB', im.size, (255, 255, 255)), im, ov)

def variant(im, kind, rng):
    if kind == 'clean': return im, 90
    if kind == 'photo':   # étiquette de travers, sur un fond de rayon, ombre en dégradé
        lab = im.rotate(rng.choice([-5, -3, 3, 5]), expand=True, fillcolor=(200, 200, 200), resample=Image.BICUBIC)
        bg = background(rng); bg.paste(lab, ((1400 - lab.width) // 2, (1000 - lab.height) // 2))
        sh = Image.linear_gradient('L').resize(bg.size).rotate(90); bg = Image.composite(bg, Image.new('RGB', bg.size, (40, 40, 40)), sh.point(lambda v: 150 + v * 105 // 255))
        return bg, 70
    if kind == 'blur_low':   # photo floue et petite, très compressée
        s = im.resize((520, int(520 * im.height / im.width)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.1)); return s, 35
    if kind == 'lowcontrast':
        e = ImageEnhance.Contrast(im).enhance(0.42).filter(ImageFilter.GaussianBlur(0.6)); px = e.load()
        for _ in range(30000): x, y = rng.randrange(e.width), rng.randrange(e.height); v = px[x, y]; px[x, y] = tuple(max(0, min(255, c + rng.randint(-40, 40))) for c in v)
        return e, 60
    if kind == 'angle': return tilt(im, rng), 70
    if kind == 'dim':     # faible luminosité : sous-exposé, bruit de capteur
        e = ImageEnhance.Brightness(im).enhance(0.22); px = e.load()
        for _ in range(40000): x, y = rng.randrange(e.width), rng.randrange(e.height); v = px[x, y]; px[x, y] = tuple(max(0, min(255, c + rng.randint(-14, 14))) for c in v)
        return e.filter(ImageFilter.GaussianBlur(0.5)), 55
    if kind == 'glare': return glare(im, rng), 70
    raise ValueError(kind)

truth = []
for lab in labels:
    for kind in ('clean', 'photo', 'blur_low', 'lowcontrast', 'angle', 'dim', 'glare'):
        rng = random.Random(zlib.crc32(f"{SALT}{lab['key']}/{kind}".encode()))   # déterministe (hash() change à chaque lancement)
        img, q = variant(lab['img'], kind, rng)
        fn = f"{lab['key']}__{kind}.jpg"; img.save(OUT / fn, quality=q)
        truth.append(dict(file=fn, key=lab['key'], variant=kind, name=lab['name'], minor=lab['minor'], currency=lab['currency'], expect=lab['expect'], others=lab['others']))
(OUT / 'truth.json').write_text(json.dumps(truth, ensure_ascii=False, indent=1), encoding='utf-8')
print(len(truth), 'images ->', OUT)

"""Генерирует иконки PWA (public/icons/*.png) и public/icon.svg: силуэт города на градиенте. Запуск: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public')
os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True)

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d5aa8"/><stop offset="1" stop-color="#0b1226"/></linearGradient></defs>
<rect width="512" height="512" rx="96" fill="url(#g)"/>
<circle cx="392" cy="132" r="44" fill="#ffd166"/>
<g fill="#e8ecf2"><rect x="96" y="268" width="64" height="150"/><rect x="172" y="196" width="76" height="222"/><rect x="260" y="236" width="68" height="182"/><rect x="340" y="296" width="76" height="122"/></g>
<g fill="#4da3ff"><rect x="108" y="284" width="14" height="14"/><rect x="134" y="284" width="14" height="14"/><rect x="108" y="316" width="14" height="14"/><rect x="134" y="316" width="14" height="14"/><rect x="186" y="214" width="14" height="14"/><rect x="214" y="214" width="14" height="14"/><rect x="186" y="246" width="14" height="14"/><rect x="214" y="246" width="14" height="14"/><rect x="186" y="278" width="14" height="14"/><rect x="214" y="278" width="14" height="14"/><rect x="274" y="254" width="14" height="14"/><rect x="298" y="254" width="14" height="14"/><rect x="274" y="286" width="14" height="14"/><rect x="298" y="286" width="14" height="14"/><rect x="354" y="312" width="14" height="14"/><rect x="382" y="312" width="14" height="14"/></g>
<rect x="64" y="418" width="384" height="14" rx="7" fill="#4cd964"/>
</svg>"""
open(os.path.join(OUT, 'icon.svg'), 'w').write(SVG)


def render(size: int, maskable: bool) -> Image.Image:
    k = 4
    s = size * k
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # градиент фона
    bg = Image.new('RGBA', (s, s))
    for y in range(s):
        t = y / s
        c = (int(45 + (11 - 45) * t), int(90 + (18 - 90) * t), int(168 + (38 - 168) * t), 255)
        ImageDraw.Draw(bg).line([(0, y), (s, y)], fill=c)
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s, s], radius=0 if maskable else int(s * 0.19), fill=255)
    im.paste(bg, (0, 0), mask)
    # содержимое: у maskable — в безопасной зоне (80%)
    pad = 0.1 if maskable else 0
    f = lambda v: int((pad + v / 512 * (1 - 2 * pad)) * s)
    d.ellipse([f(348), f(88), f(436), f(176)], fill=(255, 209, 102, 255))
    for x, y, w, h in [(96, 268, 64, 150), (172, 196, 76, 222), (260, 236, 68, 182), (340, 296, 76, 122)]:
        d.rectangle([f(x), f(y), f(x + w), f(y + h)], fill=(232, 236, 242, 255))
    for x, y in [(108, 284), (134, 284), (108, 316), (134, 316), (186, 214), (214, 214), (186, 246), (214, 246), (186, 278), (214, 278), (274, 254), (298, 254), (274, 286), (298, 286), (354, 312), (382, 312)]:
        d.rectangle([f(x), f(y), f(x + 14), f(y + 14)], fill=(77, 163, 255, 255))
    d.rounded_rectangle([f(64), f(418), f(448), f(432)], radius=int(7 / 512 * s), fill=(76, 217, 100, 255))
    return im.resize((size, size), Image.LANCZOS)


for name, size, mk in [('icon-192.png', 192, False), ('icon-512.png', 512, False), ('maskable-512.png', 512, True), ('apple-touch-icon.png', 180, False), ('favicon-32.png', 32, False)]:
    render(size, mk).save(os.path.join(OUT, 'icons', name))
print('ok')

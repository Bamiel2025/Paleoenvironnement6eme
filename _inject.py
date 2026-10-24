#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Reconstruit paleo_activite.html a partir de _template.html + les images et les flashcards.

Marqueurs pris en charge :
  __CAMB__, __CARB__, __JURA__, __FORA__, __MERA__, __PLAI__   -> JPEG existants
  __POSTER__                                                 -> PNG optimise en JPEG
  __CARDS_JSON__                                             -> JSON inline (50 flashcards)

Usage :  python _inject.py
"""
import base64, io, json, os

BASE = os.path.dirname(os.path.abspath(__file__))
TPL = os.path.join(BASE, '_template.html')
OUT = os.path.join(BASE, 'paleo_activite.html')

IMAGES = [
    ('__CAMB__',   'mer du cambrien.jpg'),
    ('__CARB__',   'Faune et flore du Carbonifère.jpg'),
    ('__JURA__',   'mer jurassique à modifier.jpg'),
    ('__FORA__',   'foret actuelle.jpg'),
    ('__MERA__',   'mer actuelle.jpg'),
    ('__PLAI__',   'Plaine -20000 ans.jpg'),
    ('__POSTER__', 'Voyage_dans_le_temps_terrestre.png'),
]
CARDS = os.path.join(BASE, '_cards.json')

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

def to_jpeg_b64(path, max_w=1100, quality=78):
    if HAS_PIL:
        img = Image.open(path).convert('RGB')
        w, h = img.size
        if w > max_w:
            img = img.resize((max_w, int(h * max_w / w)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=quality, optimize=True, progressive=True)
        data = buf.getvalue()
    else:
        with open(path, 'rb') as f:
            data = f.read()
    return base64.b64encode(data).decode()

with open(TPL, 'r', encoding='utf-8') as f:
    html = f.read()

for marker, fname in IMAGES:
    p = os.path.join(BASE, fname)
    if not os.path.exists(p):
        raise SystemExit('Image introuvable : ' + fname)
    max_w = 720 if marker == '__POSTER__' else 1100
    quality = 80 if marker == '__POSTER__' else 78
    b64 = to_jpeg_b64(p, max_w=max_w, quality=quality)
    n = html.count(marker)
    print('inject %-12s %7d chars  x%d' % (marker, len(b64), n))
    html = html.replace(marker, b64)

with open(CARDS, 'r', encoding='utf-8') as f:
    cards = json.load(f)
cards_json = json.dumps(cards, ensure_ascii=False)
n = html.count('__CARDS_JSON__')
print('inject __CARDS_JSON__  %7d chars  x%d' % (len(cards_json), n))
html = html.replace('__CARDS_JSON__', cards_json)

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)

print()
print('OK ->', OUT, os.path.getsize(OUT), 'bytes')
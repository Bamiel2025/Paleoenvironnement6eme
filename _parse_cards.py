#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Convertit le fichier Vocabulaire-et-Notions-Clés en JSON pour les flashcards."""
import json, os, re

SRC = r'D:\IA\Paleoenvironnement\Vocabulaire-et-Notions-Clés-Paléoenvironnements-et-Biodiversité.md'
OUT = r'D:\IA\Paleoenvironnement\_cards.json'

NBSP = '\u00a0'

def clean(s):
    s = s.strip()
    # Strip LaTeX-like $...$
    s = re.sub(r'\$([^$]*)\$', lambda m: m.group(1).replace('~', NBSP), s)
    # Replace any leftover ~ with NBSP
    s = s.replace('~', NBSP)
    return s

with open(SRC, 'r', encoding='utf-8') as f:
    txt = f.read()

cards = []
for m in re.finditer(r'## Card (\d+)\s*\n\s*\*\*Q:\*\*\s*(.+?)\s*\n\s*\*\*A:\*\*\s*(.+?)(?=\n\s*---|\Z)', txt, re.S):
    n, q, a = m.group(1), clean(m.group(2)), clean(m.group(3))
    # Tag by question type
    tag = 'Q/R'
    if q.startswith('Concept'):
        tag = 'Définition'
    elif q.startswith('Terme'):
        tag = 'Vocabulaire'
    elif 'Cloze' in q:
        tag = 'Texte à trous'
    elif q.startswith('Vrai ou Faux'):
        tag = 'Vrai/Faux'
    elif q.startswith('Citez'):
        tag = 'Exemple'
    cards.append({'id': int(n), 'q': q, 'a': a, 'tag': tag})

print(f'cards parsed: {len(cards)}')
print('tags:', sorted({c["tag"] for c in cards}))

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(cards, f, ensure_ascii=False, indent=2)

print('written ->', OUT, os.path.getsize(OUT), 'bytes')
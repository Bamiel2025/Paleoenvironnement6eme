// Vérification runtime du script principal de paleo_activite.html
// Reproduit le DOM et exécute le vrai <script> pour détecter tout throw
// (notamment les 2 bugs corrigés : poster <img> + ordre cardsData).
import fs from 'fs';

const html = fs.readFileSync('paleo_activite.html', 'utf8');

// 1) Extraire le JSON cardsData (maintenant placé AVANT le <script> principal)
const mCards = html.match(/<script type="application\/json" id="cardsData">([\s\S]*?)<\/script>/);
if (!mCards) throw new Error('cardsData introuvable');
const CARDS_JSON = mCards[1];

// 2) Extraire le <script> principal (celui qui contient getElementById('cardsData'))
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const mainScript = scripts.find(s => s.includes("getElementById('cardsData')"));
if (!mainScript) throw new Error('script principal introuvable');

// ---- Mock DOM minimal mais fidèle ----
class El {
  constructor(tag='div'){ this.tagName=(tag||'div').toUpperCase(); this._cls=new Set(); this.dataset={}; this.style={}; this._html=''; this._text=''; this.value=''; this._l={}; this.children=[]; }
  get classList(){ const s=this._cls; return { add:(...c)=>c.forEach(x=>s.add(x)), remove:(...c)=>c.forEach(x=>s.delete(x)), contains:c=>s.has(c), toggle:c=>{ s.has(c)?s.delete(c):s.add(c); } }; }
  set innerHTML(v){ this._html=String(v); } get innerHTML(){ return this._html; }
  set textContent(v){ this._text=String(v); } get textContent(){ return this._text; }
  addEventListener(t,fn){ (this._l[t]||(this._l[t]=[])).push(fn); }
  querySelector(){ return null; }            // par défaut aucun enfant
  querySelectorAll(){ return []; }
  appendChild(c){ this.children.push(c); return c; }
}

const elCache = new Map();
function getEl(id){
  if(!elCache.has(id)){
    const e = new El();
    e.id = id;
    if(id==='cardsData') e.textContent = CARDS_JSON;   // fourni AVANT le script
    elCache.set(id, e);
  }
  return elCache.get(id);
}

// Éléments .img-wrap : 8 divs (avec <img> enfant) + 1 <img> poster (tagName IMG)
function makeWrap(withInnerImg){
  const w = new El(withInnerImg ? 'div' : 'img');
  if(withInnerImg){ const img=new El('img'); img.src='http://x/a.jpg'; img.alt='gal'; w.querySelector=()=>img; }
  else { w.src='http://x/poster.jpg'; w.alt='poster'; }
  return w;
}
const wraps = [ ...Array(8).fill(0).map(()=>makeWrap(true)), makeWrap(false) ];

const tabs = ['accueil','paleo','evol','bilan','revision'].map(t=>{ const b=new El('button'); b.dataset.tab=t; return b; });
const panels = ['accueil','paleo','evol','bilan','revision'].map(id=>{ const p=new El('section'); p.id=id; return p; });

const document = {
  getElementById: getEl,
  querySelector: () => null,
  querySelectorAll: (sel) => {
    if(sel.includes('#tabs button')) return tabs;
    if(sel==='.panel') return panels;
    if(sel==='.img-wrap') return wraps;
    if(sel.includes('.cat')) return [];
    return [];
  },
  addEventListener: ()=>{},
  createElement: (t)=>new El(t),
  body: new El('body'),
};
const window = { scrollTo:()=>{}, addEventListener:()=>{} };
const store = {};
const localStorage = { getItem:k=>k in store?store[k]:null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} };

// Exposer l'état interne pour les assertions
const exported = {};
const scriptWithExport = mainScript + `
;globalThis.__T = { flashState, ALL_CARDS, flashFlip, flashMark,
  gallery: (typeof gallery!=='undefined'?gallery:null),
  openFrise, buildFriseActivity, renderFrise, checkFrise, resetFrise,
  friseState, MILIEUX, SLOTS,
  groupDefs, groupOrder, speciesList, expectedGroups, expectedSpecies,
  classState, showClassCorrection };`;

let threw = null;
try {
  const fn = new Function('document','window','localStorage','setTimeout','console','globalThis', scriptWithExport);
  fn(document, window, localStorage, (f)=>f&&f(), console, globalThis);
} catch(e){ threw = e; }

const T = globalThis.__T;
const assert = (cond,msg)=>{ if(!cond){ console.log('  ✗ '+msg); process.exitCode=1; } else console.log('  ✓ '+msg); };

console.log('--- Exécution du script principal ---');
assert(!threw, 'aucun throw à l\'initialisation' + (threw?(' -> '+threw.message):''));
if(threw){ console.log(threw.stack); process.exit(1); }
assert(T && T.ALL_CARDS && T.ALL_CARDS.length===50, '50 flashcards chargées ('+(T?T.ALL_CARDS.length:'?')+')');
assert(T.gallery && T.gallery.length===9, 'lightbox : 9 images (dont poster) sans plantage ('+(T?T.gallery.length:'?')+')');
assert(T.gallery[8] && T.gallery[8].src==='http://x/poster.jpg', 'poster intégré à la lightbox (bug A corrigé)');

console.log('--- Logique flashcards ---');
const before = Object.keys(T.flashState.marks).length;
T.flashMark('ok');                       // auto-avance vers carte suivante
const after = Object.keys(T.flashState.marks).length;
assert(after===before+1, 'flashMark enregistre la maîtrise (localStorage)');

console.log('\n--- Activité frise (pastilles sur la frise) ---');
let fErr = null;
try {
  T.openFrise();                                              // construit les pastilles (sans throw)
  const nbPast = document.getElementById('tlPastilles').children.length;
  assert(nbPast === 4, '4 pastilles créées sur la frise ('+nbPast+')');
  // placement correct : chaque milieu sur sa pastille cible
  T.MILIEUX.forEach(m => { T.friseState[m.key] = m.slot; });
  T.renderFrise();
  T.checkFrise();
  const msg = document.getElementById('friseScore').textContent;
  assert(/Parfait/.test(msg), 'placement correct -> "Parfait" ('+msg+')');
  // placement faux : on déplace un milieu sur la pastille d'un autre
  // (la règle anti-doublon renvoie l'occupant précédent au pool -> 2/4)
  const m0 = T.MILIEUX[0];
  T.friseState[m0.key] = T.MILIEUX[1].slot;
  T.renderFrise(); T.checkFrise();
  const msg2 = document.getElementById('friseScore').textContent;
  assert(/2 \/ 4/.test(msg2), '1 mauvais placement -> "2 / 4" ('+msg2+')');
  T.resetFrise();                                             // re-mélange, sans throw
  assert(true, 'resetFrise() sans erreur');
} catch(e){ fErr = e; }
assert(!fErr, 'parcours frise sans throw' + (fErr?(' -> '+fErr.message):''));
if (fErr) console.log(fErr.stack);

console.log('\n--- Classification emboîtée ---');
let cErr = null;
try {
  assert(T.groupOrder.length === 7, '7 boîtes de caractères ('+T.groupOrder.length+')');
  assert(T.speciesList.length === 11, '11 espèces ('+T.speciesList.length+')');

  const noDef   = T.groupOrder.filter(k => !T.groupDefs[k]);
  const noPar   = T.groupOrder.filter(k => !(k in T.expectedGroups));
  const badPar  = T.groupOrder.filter(k => T.expectedGroups[k] !== 'root' && !T.groupDefs[T.expectedGroups[k]]);
  assert(noDef.length === 0, 'chaque boîte a une définition' + (noDef.length?(' -> '+noDef):''));
  assert(noPar.length === 0, 'chaque boîte a un parent attendu' + (noPar.length?(' -> '+noPar):''));
  assert(badPar.length === 0, 'chaque parent existe' + (badPar.length?(' -> '+badPar):''));

  const sKeys   = T.speciesList.map(s => s.key);
  const noTgt   = T.speciesList.filter(s => !(s.key in T.expectedSpecies));
  const badTgt  = T.speciesList.filter(s => !T.groupDefs[T.expectedSpecies[s.key]]);
  const orphans = Object.keys(T.expectedSpecies).filter(k => !sKeys.includes(k));
  assert(noTgt.length === 0, 'chaque espèce a une boîte cible' + (noTgt.length?(' -> '+noTgt.map(s=>s.key)):''));
  assert(badTgt.length === 0, 'chaque cible d\'espèce existe' + (badTgt.length?(' -> '+badTgt.map(s=>s.key)):''));
  assert(orphans.length === 0, 'aucune espèce orpheline' + (orphans.length?(' -> '+orphans):''));

  // pas de cycle d'emboîtement (on remonte chaque boîte jusqu'à "root")
  let cyc = null;
  T.groupOrder.forEach(k => {
    const seen = new Set(); let p = k;
    while (p && p !== 'root'){ if (seen.has(p)){ cyc = k; break; } seen.add(p); p = T.expectedGroups[p]; }
  });
  assert(!cyc, 'aucun cycle d\'emboîtement' + (cyc?(' -> '+cyc):''));

  // règles métier demandées
  assert(T.expectedSpecies.ammonite === 'mollusques' && T.expectedSpecies.nautile === 'mollusques',
    'Ammonite + Nautile → Mollusques');
  assert(T.expectedSpecies.homard === 'arthropodes' && T.expectedSpecies.trilobite === 'arthropodes',
    'Homard + Trilobite → Arthropodes');
  assert(T.expectedGroups.mollusques === 'root', 'Mollusques = boîte racine (à côté de Vertébrés)');

  T.showClassCorrection();
  const gOk = T.groupOrder.every(k => T.classState.groups[k] === T.expectedGroups[k]);
  const sOk = T.speciesList.every(s => T.classState.species[s.key] === T.expectedSpecies[s.key]);
  assert(gOk && sOk, 'correction affichée : 7 boîtes + 11 espèces au bon endroit');
} catch(e){ cErr = e; }
assert(!cErr, 'parcours classification sans throw' + (cErr?(' -> '+cErr.message):''));
if (cErr) console.log(cErr.stack);

console.log('\n--- Arbre de parenté (géométrie SVG) ---');
const svgM = html.match(/<svg class="tree-svg"[\s\S]*?<\/svg>/);
const svg = svgM ? svgM[0] : '';
const svRects = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"([^>]*)>/g)]
  .map(m => ({x:+m[1], y:+m[2], w:+m[3], h:+m[4], attrs:m[5]}));
const svLines = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)]
  .map(m => ({x1:+m[1], y1:+m[2], x2:+m[3], y2:+m[4]}));
const svTexts = [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*>([^<]*)</g)]
  .map(m => ({x:+m[1], y:+m[2], t:m[3]}));
// retrouve la boîte qui contient le texte du label
const boxOf = lbl => { const t = svTexts.find(t=>t.t===lbl); if(!t) return null;
  return svRects.find(r => t.x>=r.x && t.x<=r.x+r.w && t.y>=r.y && t.y<=r.y+r.h) || null; };
// existe-t-il une verticale en x couvrant l'ordonnée y ?
const vAt = (x,y) => svLines.some(l => l.x1===x && l.x2===x &&
  Math.min(l.y1,l.y2) <= y && Math.max(l.y1,l.y2) >= y);
const inside = (f,b) => !!b && f.x <= b.x && f.y <= b.y &&
  (f.x+f.w) >= (b.x+b.w) && (f.y+f.h) >= (b.y+b.h);

let gErr = null;
try {
  assert(svRects.length >= 8 && svLines.length >= 8,
    'arbre SVG parsé ('+svRects.length+' rects, '+svLines.length+' lignes)');

  const vert = boxOf('Vertébrés');
  assert(!!vert, 'boîte Vertébrés trouvée');
  const vc = vert.x + vert.w/2, vBottom = vert.y + vert.h;
  assert(vAt(vc, vBottom), 'lien vertical partant du bas de Vertébrés (x='+vc+', y='+vBottom+')');

  ['Poissons','Amphibiens','Reptiles','Mammifères'].forEach(n => {
    const b = boxOf(n);
    assert(!!b && vAt(b.x + b.w/2, b.y), 'lien vertical aligné sur le centre de '+n);
  });

  const frame = svRects.find(r => /stroke-dasharray/.test(r.attrs||''));
  assert(!!frame, 'cadre Amniotes (pointillés) trouvé');
  assert(inside(frame, boxOf('Reptiles')) && inside(frame, boxOf('Mammifères')),
    'le cadre Amniotes englobe Reptiles et Mammifères');
  assert(!inside(frame, boxOf('Poissons')) && !inside(frame, boxOf('Amphibiens')),
    'le cadre Amniotes n\'englobe ni Poissons ni Amphibiens');
} catch(e){ gErr = e; }
assert(!gErr, 'géométrie arbre sans throw' + (gErr?(' -> '+gErr.message):''));
if (gErr) console.log(gErr.stack);

console.log('\nRésultat : ' + (process.exitCode? 'ÉCHEC' : 'TOUS LES TESTS PASSENT'));

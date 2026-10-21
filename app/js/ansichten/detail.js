// Detail eines Sensors: Wertkarte, Zeitraum-Kacheln, Diagramm, Tiefst/Höchst/Mittel,
// Liste „Über 7 °C“. Zeitraum-Blatt mit Vorlagen und eigenem Zeitraum.

import { ICON } from '../icons.js';
import { Z, esc, gruppeVon, istWagen, OHNE_ZUORDNUNG } from '../zustand.js';
import { D, aktive, sensorVon, bezug } from '../daten.js';
import { laeufe, stufeVon, REGEL, WORT, grad, zahl, grenzText } from '../status.js';
import { karte } from './uebersicht.js';
import {
  MIN, STD, TAG, SCHNELL, vorlagen, bereich, bereichText, istLang, eigenKurz,
  teile, mitternacht, tagesBeginn, tagKey, uhr, datum, datumLang, wochentag, wann, dauer, gleicherTag, MON,
} from '../zeit.js';

export const jetztZeit = () => bezug();

// Neu laden, wenn Sensor oder Zeitraum wechseln oder neue Daten da sind
export function verlaufKey() {
  return Z.sensor + '|' + Z.zeitraum + '|' + (Z.eigen ? Z.eigen.von + Z.eigen.bis : '') + '|' + D.stand;
}

function kacheln(j) {
  const ausSchnell = SCHNELL.some((z) => z.id === Z.zeitraum);
  const vl = vorlagen(j).find((v) => v.id === Z.zeitraum);
  let html = SCHNELL.map((z) => {
    let nr = z.nr;
    if (z.id === 'heute') nr = teile(j).t + '.';
    if (z.id === 'gestern') nr = teile(tagesBeginn(j) - 1).t + '.';
    return '<button class="tag' + (Z.zeitraum === z.id ? ' aktiv' : '') + '" data-zeitraum="' + z.id + '"><span class="text"><span class="wt">' + z.wt + '</span><span class="nr">' + nr + '</span></span></button>';
  }).join('');
  let nr = 'Mehr' + ICON.runterKlein, lang = false;
  if (!ausSchnell) {
    if (vl) nr = vl.kurz;
    else if (Z.eigen) { nr = eigenKurz(Z.eigen); lang = true; }
  }
  html += '<button class="tag' + (!ausSchnell ? ' aktiv' : '') + '" data-aktion="zeitraum-blatt" aria-haspopup="dialog"><span class="text"><span class="wt">ZEITRAUM</span><span class="nr' + (lang ? ' lang' : '') + '">' + nr + '</span></span></button>';
  return html;
}

export function detail() {
  const s = sensorVon(Z.sensor);
  if (!s) return '';
  const j = jetztZeit();
  const [von, bis] = bereich(Z.zeitraum, j, Z.eigen);
  const v = Z.verlauf && Z.verlauf.key === verlaufKey() ? Z.verlauf : null;
  const pts = v && v.punkte ? v.punkte : null;

  let kz = '', abw = '', chart;
  if (!pts) {
    chart = v && v.fehler
      ? '<div class="leer klein fehler">' + (v.fehler.art === 'netz' ? 'Keine Verbindung. Der Verlauf lässt sich gerade nicht laden.' : 'Der Verlauf konnte nicht geladen werden.') + ' <button class="knopf-2 inline" data-aktion="verlauf-neu">Nochmal</button></div>'
      : '<div class="leer klein"><span class="dreher" aria-hidden="true"></span> Lädt den Verlauf …' + (v && v.n ? ' ' + v.n.toLocaleString('de-DE') + ' Werte' : '') + '</div>';
  } else if (pts.length) {
    let mn = pts[0], mx = pts[0], sum = 0;
    for (const p of pts) { if (p.v < mn.v) mn = p; if (p.v > mx.v) mx = p; sum += p.v; }
    kz = '<div class="kennzahlen">' +
      '<div class="kennzahl"><span class="k">Tiefst</span><span class="v">' + grad(mn.v) + '</span><span class="z">' + wann(mn.t, j) + '</span></div>' +
      '<div class="kennzahl"><span class="k">Höchst</span><span class="v">' + grad(mx.v) + '</span><span class="z">' + wann(mx.t, j) + '</span></div>' +
      '<div class="kennzahl"><span class="k">Mittel</span><span class="v">' + grad(sum / pts.length) + '</span><span class="z">' + pts.length.toLocaleString('de-DE') + ' Werte</span></div></div>';
    abw = abweichungen(s, pts, j);
    chart = '<div class="diagramm-flaeche" id="diagramm"></div>' + legende(s, istLang(von, bis));
  } else {
    const vorStart = D.seit && bis <= D.seit;
    chart = '<div class="leer klein">Keine Messwerte in diesem Zeitraum.' + (vorStart || D.seit ? ' Die Aufzeichnung läuft seit ' + datumLang(D.seit) + '.' : '') + '</div>';
  }
  const grp = aktive().filter((x) => gruppeVon(x) === gruppeVon(s));
  const icon = s.standort ? (istWagen(grp.length ? grp : [s]) ? ICON.wagen : ICON.pin) : ICON.frage;
  return '<header class="kopf unter"><button class="zurueck" data-aktion="zurueck">' + ICON.zurueck + 'Zurück</button><h1 class="seitentitel">' + esc(s.name) + '</h1></header>' +
    '<main class="detail"><div class="gruppe" style="padding:0"><span class="name">' + icon + '<h2>' + esc(s.standort || OHNE_ZUORDNUNG) + '</h2></span>' + (s.aktiv ? '' : '<span class="zusatz">ausgemustert</span>') + '</div>' +
    '<div class="detail-raster">' +
    '<div class="b-wert">' + karte(s, true) + '</div>' +
    '<div class="b-zeit"><div class="zeitraum">' + kacheln(j) + '</div><div class="zeitraum-text">' + bereichText(Z.zeitraum, j, Z.eigen) + '</div></div>' +
    '<section class="abschnitt diagramm b-chart">' + chart + '</section>' +
    (kz ? '<div class="b-kz">' + kz + '</div>' : '') +
    (abw ? '<div class="b-abw">' + abw + '</div>' : '') +
    '</div></main>';
}

function legende(s, lang) {
  const g = s.grenze !== null;
  return '<div class="legende">' + (lang ? '<span><i></i>Tagesmittel</span><span><i class="band"></i>Tiefst–Höchst</span>' : '<span><i></i>Temperatur</span>') +
    (g ? '<span><i class="rot"></i>über Grenze</span><span><i class="grenze"></i>Grenze ' + grenzText(s.grenze) + '</span>' : '') +
    '<span><i class="luecke"></i>keine Daten</span></div>';
}

function abweichungen(s, pts, j) {
  if (s.grenze === null) return '<section class="abschnitt"><h2>Grenze</h2><div class="leer klein">Für diesen Sensor ist keine Grenztemperatur hinterlegt.</div></section>';
  const l = laeufe(pts, s.grenze).reverse();
  const titel = '<section class="abschnitt"><h2>Über ' + grenzText(s.grenze) + '</h2>';
  if (!l.length) return titel + '<div class="leer klein">Keine Werte über der Grenze in diesem Zeitraum.</div></section>';
  const b = bezug();
  const letzte = pts[pts.length - 1];
  const zeile = (x) => {
    const st = stufeVon(x, s.grenze);
    const laufend = x.bis === letzte.t && (b - x.bis) / MIN < s.grauMin;
    const tagTxt = gleicherTag(x.von, j) ? '' : (j - x.von < 6 * TAG ? wochentag(x.von) + ' ' : datum(x.von) + ' ');
    return '<div class="abweichung"><span class="zeit">' + tagTxt + uhr(x.von) + '–' + (laufend ? 'jetzt' : uhr(x.bis + 5 * MIN)) + '</span><span class="info">' + dauer(x.min) + ' · max ' + grad(x.max) + '</span><span class="status-chip ' + st + '">' + WORT[st] + '</span></div>';
  };
  // kurze Zeiträume: alles einzeln; lange: Alarme einzeln, kurze Spitzen als eine Zeile
  if (l.length <= 8) return titel + l.map(zeile).join('') + '</section>';
  const alarme = l.filter((x) => stufeVon(x, s.grenze) === 'alarm');
  const kurz = l.filter((x) => stufeVon(x, s.grenze) === 'achtung');
  const tage = new Set(kurz.map((x) => tagKey(x.von))).size;
  return titel + (alarme.length ? alarme.slice(0, 12).map(zeile).join('') : '<div class="leer klein">Kein Alarm in diesem Zeitraum.</div>') +
    (alarme.length > 12 ? '<div class="mehr-zeile">… und ' + (alarme.length - 12) + ' weitere Alarme</div>' : '') +
    (kurz.length ? '<div class="mehr-zeile">Dazu <b>' + kurz.length + '× kurz über der Grenze</b> (Achtung, je höchstens ' + REGEL.toleranzMin + ' Min) an ' + tage + (tage === 1 ? ' Tag' : ' Tagen') + '</div>' : '') +
    '</section>';
}

// Tageswerte (Berlin-Kalendertag) aus Rohwerten: Tiefst, Höchst, Mittel
export function tageswerte(pts) {
  const map = new Map();
  for (const p of pts) {
    const k = tagKey(p.t);
    let e = map.get(k);
    if (!e) { const tp = teile(p.t); const tag = mitternacht(tp.j, tp.m, tp.t); e = { tag, min: p.v, max: p.v, sum: 0, n: 0 }; map.set(k, e); }
    if (p.v < e.min) e.min = p.v;
    if (p.v > e.max) e.max = p.v;
    e.sum += p.v; e.n++;
  }
  return [...map.values()].map((e) => ({ ...e, t: e.tag + TAG / 2, mittel: e.sum / e.n }));
}

// ---------- Diagramm (SVG, nach dem Rendern gezeichnet, braucht die Breite) ----------
export function diagramm() {
  const huelle = document.getElementById('diagramm');
  if (!huelle || !Z.verlauf || !Z.verlauf.punkte) return;
  const s = sensorVon(Z.sensor);
  const j = jetztZeit();
  const [von, bis] = bereich(Z.zeitraum, j, Z.eigen);
  const roh = Z.verlauf.punkte;
  const lang = istLang(von, bis);
  const pts = lang ? tageswerte(roh) : roh;
  const hatGrenze = s.grenze !== null;
  // Höhe: auf großen Bildschirmen (nebeneinander) bis 45 % der Fensterhöhe, sonst höchstens 320 px
  const W = Math.max(280, huelle.clientWidth), H = Math.round(Math.min(Z.layout.geteilt ? Math.max(320, window.innerHeight * 0.45) : 320, Math.max(220, W * 0.5)));
  const L = 52, R = 12, T = 14, B = 34;
  const werte = lang ? pts.flatMap((p) => [p.min, p.max]) : pts.map((p) => p.v);
  if (hatGrenze) werte.push(s.grenze);
  let lo = Math.floor(Math.min(...werte) - 0.5), hi = Math.ceil(Math.max(...werte) + 0.5);
  const spanne = hi - lo, schritt = spanne <= 6 ? 1 : spanne <= 12 ? 2 : spanne <= 30 ? 5 : 10;
  lo = Math.floor(lo / schritt) * schritt; hi = Math.ceil(hi / schritt) * schritt;
  const x = (t) => L + (t - von) / (bis - von) * (W - L - R);
  const y = (v) => T + (hi - v) / (hi - lo) * (H - T - B);
  let g = '';
  for (let v = lo; v <= hi + 1e-9; v += schritt) {
    g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--diagramm-gitter)" stroke-width="1"/>';
    g += '<text x="' + (L - 8) + '" y="' + (y(v) + 5) + '" text-anchor="end">' + (v < 0 ? '−' : '') + Math.abs(v) + '°</text>';
  }
  // Zeitachse in Berliner Zeit
  const tageAnz = (bis - von) / TAG;
  const ticks = [];
  if (!lang) {
    const dauerH = (bis - von) / STD;
    const tick = dauerH <= 7 ? 1 : dauerH <= 25 ? (W < 520 ? 6 : 3) : 24;
    if (tick === 24) {
      for (let d = tagesBeginn(von); d <= bis; d = tagesBeginn(d + 26 * STD)) if (d >= von) ticks.push({ t: d, label: wochentag(d) + ' ' + teile(d).t + '.', links: true });
    } else {
      for (let t = Math.ceil(von / STD) * STD; t <= bis; t += STD) if (teile(t).h % tick === 0) ticks.push({ t, label: String(teile(t).h).padStart(2, '0') + ':00' });
    }
  } else if (tageAnz <= 40) {
    const schrittTage = W < 520 ? 14 : 7;
    let d = tagesBeginn(von);
    while (teile(d).wt !== 1) d = tagesBeginn(d + 26 * STD);
    for (; d <= bis; ) { ticks.push({ t: d, label: datum(d), links: true }); const p = teile(d); d = mitternacht(p.j, p.m, p.t + schrittTage); }
  } else {
    const jede = (tageAnz > 200 && W < 700) ? 2 : 1;
    const p = teile(von);
    for (let d = mitternacht(p.j, p.m + (p.t > 1 || p.h > 0 ? 1 : 0), 1); d <= bis; ) {
      ticks.push({ t: d, label: MON[teile(d).m - 1], links: true });
      const q = teile(d); d = mitternacht(q.j, q.m + jede, 1);
    }
  }
  for (const k of ticks) {
    const xx = x(k.t);
    g += '<line x1="' + xx + '" x2="' + xx + '" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--diagramm-gitter)" stroke-width="1"/>';
    if (xx > L + 4 && xx < W - (k.links ? 44 : 24)) g += '<text x="' + (k.links ? xx + 4 : xx) + '" y="' + (H - 10) + '" text-anchor="' + (k.links ? 'start' : 'middle') + '">' + k.label + '</text>';
  }
  // Lücken (keine Daten) schraffiert
  let luecken = '';
  const ende = Math.min(bezug(), bis);
  const maxLuecke = 15 * MIN;
  let vorT = von;
  const randVon = (p) => (lang ? p.tag : p.t);
  const randBis = (p) => (lang ? p.tag + TAG : p.t);
  for (const p of pts.concat([{ ende: true }])) {
    const startP = p.ende ? ende : randVon(p);
    if (startP - vorT > (lang ? TAG / 2 : maxLuecke)) {
      const x1 = x(vorT), x2 = x(startP);
      luecken += '<rect x="' + x1 + '" y="' + T + '" width="' + Math.max(0, x2 - x1) + '" height="' + (H - T - B) + '" fill="url(#schraffur)"/>';
      if (x2 - x1 > 110) luecken += '<text class="luecke-label" x="' + ((x1 + x2) / 2) + '" y="' + (T + 26) + '" text-anchor="middle">keine Daten</text>';
    }
    if (!p.ende) vorT = randBis(p);
  }
  const gy = hatGrenze ? y(s.grenze) : -1;
  let marks = '';
  if (lang) {
    // Band Tiefst–Höchst je Tag, Linie Tagesmittel, Höchstwerte über der Grenze rot
    const segmente = []; let akt = [];
    pts.forEach((p, i) => { if (i && p.tag - pts[i - 1].tag > TAG * 1.5) { segmente.push(akt); akt = []; } akt.push(p); });
    if (akt.length) segmente.push(akt);
    const breite = Math.max(2, (W - L - R) / tageAnz * 0.7);
    for (const sg of segmente) {
      if (sg.length === 1) {
        const p = sg[0];
        marks += '<rect x="' + (x(p.t) - breite / 2) + '" y="' + y(p.max) + '" width="' + breite + '" height="' + Math.max(1, y(p.min) - y(p.max)) + '" fill="var(--diagramm-band)"/>' +
          '<line x1="' + (x(p.t) - breite / 2) + '" x2="' + (x(p.t) + breite / 2) + '" y1="' + y(p.mittel) + '" y2="' + y(p.mittel) + '" stroke="var(--diagramm-linie)" stroke-width="2.5"/>';
        if (hatGrenze && p.max > s.grenze) marks += '<line x1="' + (x(p.t) - breite / 2) + '" x2="' + (x(p.t) + breite / 2) + '" y1="' + y(p.max) + '" y2="' + y(p.max) + '" stroke="var(--rot-punkt)" stroke-width="2.5"/>';
        continue;
      }
      const oben = sg.map((p) => x(p.t).toFixed(1) + ' ' + y(p.max).toFixed(1));
      const unten = sg.slice().reverse().map((p) => x(p.t).toFixed(1) + ' ' + y(p.min).toFixed(1));
      marks += '<path d="M' + oben.join('L') + 'L' + unten.join('L') + 'Z" fill="var(--diagramm-band)"/>';
      if (hatGrenze) marks += '<path d="M' + oben.join('L') + '" fill="none" stroke="var(--rot-punkt)" stroke-width="2.5" stroke-linejoin="round" clip-path="url(#ueber)"/>';
      marks += '<path d="M' + sg.map((p) => x(p.t).toFixed(1) + ' ' + y(p.mittel).toFixed(1)).join('L') + '" fill="none" stroke="var(--diagramm-linie)" stroke-width="2.5" stroke-linejoin="round"/>';
    }
  } else {
    let d = '', vor = null;
    for (const p of pts) { d += ((!vor || p.t - vor.t > 10 * MIN) ? 'M' : 'L') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1); vor = p; }
    const letzte = pts[pts.length - 1];
    marks = '<path d="' + d + '" fill="none" stroke="var(--diagramm-linie)" stroke-width="2.5" stroke-linejoin="round"' + (hatGrenze ? ' clip-path="url(#unter)"' : '') + '/>' +
      (hatGrenze ? '<path d="' + d + '" fill="none" stroke="var(--rot-punkt)" stroke-width="3" stroke-linejoin="round" clip-path="url(#ueber)"/>' : '') +
      (letzte ? '<circle cx="' + x(letzte.t) + '" cy="' + y(letzte.v) + '" r="4.5" fill="' + (hatGrenze && letzte.v > s.grenze ? 'var(--rot-punkt)' : 'var(--diagramm-linie)') + '" stroke="var(--flaeche)" stroke-width="2"/>' : '');
  }
  const svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Temperaturverlauf ' + esc(s.name) + '">' +
    '<defs><pattern id="schraffur" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="var(--flaeche)"/><rect width="4" height="8" fill="var(--schraffur)"/></pattern>' +
    (hatGrenze ? '<clipPath id="ueber"><rect x="0" y="0" width="' + W + '" height="' + gy + '"/></clipPath><clipPath id="unter"><rect x="0" y="' + gy + '" width="' + W + '" height="' + (H - gy) + '"/></clipPath>' : '') + '</defs>' +
    luecken + g + marks +
    (hatGrenze ? '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '" stroke="var(--rot-punkt)" stroke-width="2" stroke-dasharray="7 5"/>' : '') +
    '<g id="zeiger" visibility="hidden"><line id="zl" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--text)" stroke-width="1.5"/><circle id="zk" r="5.5" fill="var(--text)" stroke="var(--flaeche)" stroke-width="2"/></g></svg>';
  huelle.innerHTML = svg + '<div class="blase" id="blase" hidden></div>';
  const svgEl = huelle.querySelector('svg'), blase = huelle.querySelector('#blase'), zeiger = huelle.querySelector('#zeiger');
  const zl = zeiger.querySelector('#zl'), zk = zeiger.querySelector('#zk');
  function zeige(ev) {
    if (!pts.length) return;
    const r = svgEl.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width);
    const t = von + (px - L) / (W - L - R) * (bis - von);
    let best = pts[0];
    for (const p of pts) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    if (Math.abs(best.t - t) > (lang ? TAG : 20 * MIN)) { verstecke(); return; }
    const wert = lang ? best.max : best.v;
    const bx = x(best.t), by = y(wert);
    zeiger.setAttribute('visibility', 'visible');
    zl.setAttribute('x1', bx); zl.setAttribute('x2', bx); zk.setAttribute('cx', bx); zk.setAttribute('cy', by);
    blase.hidden = false;
    blase.textContent = lang ? wochentag(best.tag) + ' ' + datum(best.tag) + ' · max ' + grad(best.max) + ' · Ø ' + zahl(best.mittel)
      : ((bis - von) > 1.1 * TAG ? wochentag(best.t) + ' ' : '') + uhr(best.t) + ' · ' + grad(best.v);
    const sx = bx * (r.width / W);
    blase.style.left = Math.min(r.width - 110, Math.max(110, sx)) + 'px';
    blase.style.top = Math.max(0, by * (r.height / H) - 48) + 'px';
  }
  function verstecke() { zeiger.setAttribute('visibility', 'hidden'); blase.hidden = true; }
  svgEl.addEventListener('pointermove', zeige);
  svgEl.addEventListener('pointerdown', zeige);
  svgEl.addEventListener('pointerleave', verstecke);
}

// ---------- Zeitraum-Blatt ----------
export function blattZeitraum() {
  const j = jetztZeit();
  const vonW = Z.eigen ? Z.eigen.von : tagKey(j - 14 * TAG);
  const bisW = Z.eigen ? Z.eigen.bis : tagKey(j);
  return '<div class="blatt-grund" data-aktion="blatt-zu"><div class="blatt" role="dialog" aria-label="Zeitraum wählen"><h2>Zeitraum</h2>' +
    '<div class="vorlagen">' + vorlagen(j).map((v) => '<button class="blatt-zeile' + (Z.zeitraum === v.id ? ' aktiv' : '') + '" data-vorlage="' + v.id + '"><span class="n">' + v.n + '</span><span class="z">' + v.z + '</span></button>').join('') + '</div>' +
    '<h3>Eigener Zeitraum</h3>' +
    '<form id="eigen-form" novalidate><div class="feld-zeile">' +
    '<div class="feld"><label for="eigen-von">Von</label><input type="date" id="eigen-von" value="' + vonW + '" max="' + tagKey(j) + '"></div>' +
    '<div class="feld"><label for="eigen-bis">Bis</label><input type="date" id="eigen-bis" value="' + bisW + '" max="' + tagKey(j) + '"></div></div>' +
    (Z.zeitraumFehler ? '<p class="fehler-text" role="alert">' + Z.zeitraumFehler + '</p>' : '') +
    '<button type="submit" class="primaer">Zeitraum anzeigen</button></form></div></div>';
}

// Prüft das eigene Datum. Gibt Fehlertext zurück oder null (und setzt Z.eigen).
export function eigenPruefen(vonS, bisS) {
  const j = jetztZeit();
  const heute = tagKey(j);
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  if (!ok(vonS) || !ok(bisS)) return 'Bitte beide Daten eintragen.';
  if (bisS < vonS) return '„Bis“ liegt vor „Von“. Bitte die Daten tauschen.';
  if (vonS > heute) return '„Von“ liegt in der Zukunft.';
  Z.eigen = { von: vonS, bis: bisS > heute ? heute : bisS };
  return null;
}

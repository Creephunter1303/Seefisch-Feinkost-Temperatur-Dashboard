// Übersicht: Kopf mit Standortwahl + Sync, Standort-Gruppen mit Statuskarten.
// Aufbau, Klassen und Texte wie vorlage/index.html (v0.3), inkl. „Am Wagen auslesen“.

import { ICON } from '../icons.js';
import { Z, esc, gruppeVon, istWagen, OHNE_ZUORDNUNG } from '../zustand.js';
import { D, aktive, punkteVon, bezug } from '../daten.js';
import { status, heuteAlarm, RANG, WORT, grad, grenzText } from '../status.js';
import { STD, MIN, uhr } from '../zeit.js';
import { knopfAuslesen } from './auslesen.js';
import { adminAngemeldet } from './admin-status.js';

export function statusVon(s, b = bezug()) { return status(s, punkteVon(s.mac), b, D.letzter.get(s.mac), D.fensterAb); }

// Mini-Kurve der letzten 6 Std mit gestrichelter Grenzlinie (nur OK/Achtung/Alarm)
function spark(s, st, w, h) {
  const b = bezug(), von = b - 6 * STD;
  const pts = punkteVon(s.mac).filter((p) => p.t >= von && p.t <= b);
  if (pts.length < 2) return '';
  const werte = pts.map((p) => p.v);
  if (s.grenze !== null) werte.push(s.grenze);
  const lo = Math.min(...werte) - 0.4, hi = Math.max(...werte) + 0.4;
  const x = (t) => 2 + (t - von) / (b - von) * (w - 8), y = (v) => h - 3 - (v - lo) / (hi - lo) * (h - 6);
  let d = '', vor = null;
  for (const p of pts) { d += ((!vor || p.t - vor.t > 10 * MIN) ? 'M' : 'L') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1); vor = p; }
  const farbe = { ok: 'var(--gruen-punkt)', achtung: 'var(--achtung-punkt)', alarm: 'var(--rot-punkt)', ohne: 'var(--offline-punkt)' }[st];
  const e = pts[pts.length - 1];
  const gl = s.grenze === null ? '' : '<line x1="0" x2="' + w + '" y1="' + y(s.grenze).toFixed(1) + '" y2="' + y(s.grenze).toFixed(1) + '" stroke="var(--rot-punkt)" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>';
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' + gl +
    '<path d="' + d + '" fill="none" stroke="' + farbe + '" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
    '<circle cx="' + x(e.t).toFixed(1) + '" cy="' + y(e.v).toFixed(1) + '" r="3.2" fill="' + farbe + '"/></svg>';
}

export function karte(s, gross) {
  const b = bezug();
  const st = statusVon(s, b);
  const wert = st.stufe === 'meldet' ? (st.last ? '<small class="zuletzt">zuletzt</small> ' + grad(st.last.v) : 'kein Wert') : grad(st.last.v);
  const ha = (st.stufe === 'ok' || st.stufe === 'offline') ? heuteAlarm(s, punkteVon(s.mac), b) : null;
  const haText = ha ? 'Heute ' + uhr(ha.von) + '–' + uhr(ha.bis + 5 * MIN) + ' über ' + grenzText(s.grenze) + ' · max ' + grad(ha.max) : '';
  // Detail: ganzer Satz. Kachel: nur ein „!“ hinter dem Namen, damit alle Kacheln gleich hoch bleiben
  const hinweis = ha && gross ? '<span class="t-hinweis">' + ICON.hinweis + '<span>' + haText + '</span></span>' : '';
  const merker = ha && !gross ? '<span class="t-merker" title="' + haText + '" aria-hidden="true">!</span>' : '';
  const mitSpark = !gross && ['ok', 'achtung', 'alarm', 'ohne'].includes(st.stufe);
  const tag = gross ? 'div' : 'button';
  // Wert per Bluetooth am Wagen ausgelesen (nicht gespeichert) → rechts kennzeichnen
  const vomTablet = st.last && st.last.tab ? 'ausgelesen ' + uhr(st.last.t) : '';
  const rechts = gross ? (vomTablet ? vomTablet + ' · ' : '') + (s.grenze === null ? 'keine Grenze' : 'Grenze ' + grenzText(s.grenze)) : vomTablet;
  return '<' + tag + ' class="karte temp st-' + st.stufe + (gross ? ' gross' : '') + '"' +
    (gross ? '' : ' data-sensor="' + esc(s.mac) + '" aria-label="' + esc(s.name + ', ' + st.text + (ha ? ', ' + haText : '')) + '"') + '>' +
    '<span class="t-oben">' + (gross ? '' : '<span class="t-name">' + esc(s.name) + merker + '</span>') +
    '<span class="t-zeile"><span class="t-wert">' + wert + '</span>' + (mitSpark ? spark(s, st.stufe, 112, 40) : '') + '</span>' + hinweis + '</span>' +
    '<span class="status-zeile"><span class="status-text">' + st.text + '</span>' +
    (rechts ? '<span class="t-grenze">' + rechts + '</span>' : '') + '</span></' + tag + '>';
}

// Gruppen je Standort. Standorte mit Alarm/Meldet nicht/Achtung stehen oben,
// sonst gilt reihenfolge (kleinste der Gruppe), dann der Name.
export function gruppiere(sensoren) {
  const b = bezug();
  const g = new Map();
  for (const s of sensoren) { const k = gruppeVon(s); if (!g.has(k)) g.set(k, []); g.get(k).push(s); }
  const liste = [...g.entries()].map(([name, ss]) => {
    for (const s of ss) s._st = statusVon(s, b).stufe;
    ss.sort((a, c) => (RANG[a._st] < 3 || RANG[c._st] < 3 ? RANG[a._st] - RANG[c._st] : 0) || a.reihenfolge - c.reihenfolge || a.name.localeCompare(c.name, 'de'));
    return { name, sensoren: ss, rang: Math.min(...ss.map((s) => RANG[s._st])), reihenfolge: Math.min(...ss.map((s) => s.reihenfolge)), wagen: istWagen(ss) };
  });
  const ohne = (x) => (x.name === OHNE_ZUORDNUNG ? 1 : 0);
  liste.sort((a, c) => (a.rang < 3 || c.rang < 3 ? Math.min(a.rang, 3) - Math.min(c.rang, 3) : 0) || ohne(a) - ohne(c) || a.reihenfolge - c.reihenfolge || a.name.localeCompare(c.name, 'de'));
  return liste;
}

function zaehle(sensoren) {
  const z = {};
  for (const s of sensoren) { const k = s._st === 'meldet' ? 'alarm' : s._st === 'ohne' ? 'ok' : s._st; z[k] = (z[k] || 0) + 1; }
  return z;
}

export function gruppenIcon(g) { return g.wagen ? ICON.wagen : g.name === OHNE_ZUORDNUNG ? ICON.frage : ICON.pin; }

export function kopf() {
  const netzWeg = D.fehler && D.fehler.art === 'netz';
  const fehler = D.fehler && !netzWeg;
  let sync;
  if (netzWeg) sync = '<span class="sync-text">Keine Verbindung</span>';
  else if (fehler) sync = '<span class="sync-text">Fehler</span>';
  else sync = '<span class="sync-punkt' + (D.laedt ? ' laedt' : '') + '" title="' + (D.laedt ? 'Aktualisiere …' : 'Aktuell') + '" aria-label="' + (D.laedt ? 'Aktualisiere' : 'Verbunden, Werte aktuell') + '"></span>';
  let band = '';
  if (netzWeg && D.stand) band += '<div class="hinweisband"><span>Keine Verbindung · Werte von <b>' + uhr(D.stand) + ' Uhr</b>, nicht aktuell</span></div>';
  if (fehler && D.stand) band += '<div class="hinweisband"><span style="flex:1">Werte können gerade nicht geladen werden · Stand <b>' + uhr(D.stand) + ' Uhr</b></span><button data-aktion="neu-laden">Nochmal</button></div>';
  if (D.tabletUm) band += '<div class="hinweisband"><span style="flex:1">Werte am Wagen ausgelesen um <b>' + uhr(D.tabletUm) + '</b> · nicht gespeichert</span><button data-aktion="tablet-weg">Verwerfen</button></div>';
  if (!D.fehler && Z.filter && Z.filter !== Z.start) band += '<div class="hinweisband"><span style="flex:1">Du siehst nur <b>' + esc(Z.filter) + '</b></span><button data-aktion="filter-weg">Zurück zu ' + esc(Z.start || 'Alle') + '</button></div>';
  return '<header class="kopf"><div class="kopf-innen"><div class="kopf-zeile">' +
    '<button class="auswahl" data-aktion="blatt">' + (Z.filter ? ICON.pin : ICON.therm) + '<span>' + esc(Z.filter || 'Alle Standorte') + '</span><span class="pfeil">' + ICON.runter + '</span></button>' +
    (adminAngemeldet() ? '<button class="auswahl admin-knopf" data-aktion="admin" aria-label="Admin-Bereich">' + ICON.regler + '<span>Admin</span></button>' : '') +
    '<span class="platzhalter"></span>' + sync +
    '<button class="icon-knopf" data-aktion="einstellungen" aria-label="Einstellungen">' + ICON.zahnrad + '</button></div>' +
    '<div class="baender">' + band + '</div></div></header>';
}

function sonderzustand() {
  if (D.stand) return null;
  if (D.fehler) {
    const f = D.fehler;
    if (f.art === 'netz') return '<div class="leer zustand"><strong>Keine Verbindung.</strong> Sobald das Gerät Netz hat, erscheinen die Werte hier.<button class="knopf-2" data-aktion="neu-laden">Nochmal versuchen</button></div>';
    if (f.art === 'zugang') return '<div class="leer zustand fehler"><strong>Zugang abgelehnt.</strong> Projekt-URL oder Schlüssel stimmen nicht.<button class="knopf-2" data-aktion="einrichtung">Einrichtung öffnen</button></div>';
    return '<div class="leer zustand fehler"><strong>Die Werte konnten nicht geladen werden.</strong> <span class="klein">' + esc(f.message) + '</span><button class="knopf-2" data-aktion="neu-laden">Nochmal versuchen</button></div>';
  }
  return '<div class="leer zustand"><span class="dreher" aria-hidden="true"></span> Lädt die Werte …</div>';
}

export function uebersicht() {
  const sz = sonderzustand();
  if (sz) return kopf() + '<main class="liste">' + sz + '</main>';
  const sensoren = aktive();
  if (!sensoren.length) return kopf() + '<main class="liste"><div class="leer">Noch keine Sensoren. Sobald ein Sensor angelegt ist und seinen ersten Wert schreibt, erscheint er hier.</div></main>';
  let gruppen = gruppiere(sensoren);
  if (Z.filter) gruppen = gruppen.filter((g) => g.name === Z.filter);
  let html = kopf() + '<main class="liste">';
  if (!gruppen.length) html += '<div class="leer">Den Standort „' + esc(Z.filter) + '“ gibt es nicht mehr.</div>';
  for (const g of gruppen) {
    const alleOffline = g.sensoren.every((s) => s._st === 'offline');
    html += '<section class="gruppe-block"><div class="gruppe"><span class="name">' + gruppenIcon(g) + '<h2>' + esc(g.name) + '</h2></span>' +
      (g.wagen && alleOffline ? '<span class="zusatz">unterwegs</span>' : '') + '</div>' +
      '<div class="raster">' + g.sensoren.map((s) => karte(s)).join('') + (g.wagen ? knopfAuslesen(g.name) : '') + '</div></section>';
  }
  return html + '</main>';
}

// ---------- Blatt: Standort / Startansicht / Tablet gehört zu ----------
export function blattStandort() {
  const gruppen = gruppiere(aktive()).slice().sort((a, c) => a.reihenfolge - c.reihenfolge || a.name.localeCompare(c.name, 'de'));
  const aktuell = Z.blatt === 'start' ? Z.start : Z.blatt === 'wagen' ? Z.wagen : Z.filter;
  const zeile = (name, sensoren) => {
    const z = zaehle(sensoren);
    const teile = ['alarm', 'achtung', 'ok', 'offline'].filter((k) => z[k]).map((k) => '<span class="mini ' + k + '"><span>' + z[k] + ' ' + (k === 'alarm' ? 'Problem' : WORT[k]) + '</span></span>').join('');
    return '<button class="blatt-zeile' + (aktuell === name ? ' aktiv' : '') + '" data-wahl="' + esc(name || '') + '"><span class="n">' + esc(name || 'Alle Standorte') + '</span><span class="zusammen">' + teile + '</span></button>';
  };
  if (Z.blatt === 'wagen') {
    return '<div class="blatt-grund" data-aktion="blatt-zu"><div class="blatt" role="dialog" aria-label="Wagen wählen"><h2>Gerät gehört zu</h2>' +
      gruppen.filter((g) => g.wagen).map((g) => '<button class="blatt-zeile' + (Z.wagen === g.name ? ' aktiv' : '') + '" data-wahl="' + esc(g.name) + '"><span class="n">' + esc(g.name) + '</span></button>').join('') +
      '<button class="blatt-zeile' + (!Z.wagen ? ' aktiv' : '') + '" data-wahl=""><span class="n">Keinem Wagen (Büro, Laptop)</span></button></div></div>';
  }
  return '<div class="blatt-grund" data-aktion="blatt-zu"><div class="blatt" role="dialog" aria-label="Standort wählen"><h2>' + (Z.blatt === 'start' ? 'Startansicht' : 'Standort') + '</h2>' +
    zeile(null, aktive()) + gruppen.map((g) => zeile(g.name, g.sensoren)).join('') + '</div></div>';
}

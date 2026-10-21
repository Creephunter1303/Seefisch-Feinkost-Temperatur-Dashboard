// Datenstand der App und alle Abfragen. Spart Datenvolumen:
// - Start: sensoren + Messwerte seit Mitternacht bzw. der letzten 6 Std
//   (nur uuid, zeit, temperatur_c, eingetragen_am), dazu der letzte Wert für
//   Sensoren, die in diesem Fenster still waren.
// - Danach alle 5 Minuten NUR geänderte Zeilen: eingetragen_am=gt.<zuletzt gesehen>.
//   Nicht zeit=gt.…, denn der Pi trägt die Werte eines zurückgekehrten Wagens
//   mit ihren alten Zeitstempeln nach – die kämen sonst nie an.
// - Gelesen wird aus der Tabelle messwerte über uuid (= MAC) + zeit (Primärschlüssel).
//   Die Spalte messwerte.sensor wird nie benutzt (fällt im Pi-Projekt weg),
//   Namen kommen aus der Tabelle sensoren.

import { anfrage, alleSeiten, enc, macListe, RestFehler } from './rest.js';
import { ablegen, holen } from './speicher.js';
import { MIN, STD, tagesBeginn } from './zeit.js';

const SNAPSHOT = 'stand-v1';
const SENSOREN_ALLE_MIN = 15;   // Stammdaten seltener nachladen als Messwerte

export const D = {
  sensoren: [],          // alle Zeilen aus sensoren (auch ausgemusterte)
  punkte: new Map(),     // mac → [{ t, v }] aufsteigend, seit fensterAb
  letzter: new Map(),    // mac → { t, v } letzter Wert überhaupt (auch vor dem Fenster)
  maxEing: null,         // größtes eingetragen_am (Text, wie vom Server)
  fensterAb: 0,
  stand: null,           // Zeitpunkt der letzten erfolgreichen Abfrage
  sensorenStand: 0,
  seit: null,            // erster Messwert überhaupt („Aufzeichnung seit“)
  frisch: false,         // in dieser Sitzung schon erfolgreich geladen?
  laedt: false,
  fehler: null,          // RestFehler der letzten Abfrage
  tablet: new Map(),     // mac → [{ t, v, tab: true }] am Wagen per Bluetooth ausgelesen – NIE gespeichert
  tabletUm: null,        // wann ausgelesen (für Kennzeichnung und Neuzeichnen)
};

let melde = () => {};
export function beiAenderung(f) { melde = f; }

export function sensorAus(z) {
  const g = z.temp_max === null || z.temp_max === undefined ? null : Number(z.temp_max);
  return {
    mac: z.mac, name: z.name, standort: z.standort || null, reihenfolge: z.reihenfolge ?? 100,
    grenze: Number.isFinite(g) ? g : null, grauMin: z.grau_nach_minuten ?? 15, rotMin: z.rot_nach_minuten ?? 480,
    aktiv: z.aktiv !== false, notiz: z.notiz || '', roh: z,
  };
}

export const aktive = () => D.sensoren.filter((s) => s.aktiv);
export const sensorVon = (mac) => D.sensoren.find((s) => s.mac === mac) || null;
// Werte vom Tablet zählen nur NACH dem letzten Wert aus Supabase. Sobald der
// Pi die echten Werte nachgetragen hat, fallen sie dadurch von selbst weg.
export const punkteVon = (mac) => {
  const p = D.punkte.get(mac) || [];
  const tb = D.tablet.get(mac);
  if (!tb) return p;
  const l = D.letzter.get(mac);
  const ab = Math.max(p.length ? p[p.length - 1].t : -Infinity, l ? l.t : -Infinity);
  const extra = tb.filter((x) => x.t > ab);
  return extra.length ? p.concat(extra) : p;
};

export function tabletSetzen(mac, werte) {
  D.tablet.set(mac, werte.map((w) => ({ t: w.t, v: w.v, tab: true })).sort((a, b) => a.t - b.t));
  D.tabletUm = Date.now();
}
export function tabletVerwerfen() { D.tablet = new Map(); D.tabletUm = null; }

// Bezugszeit für den Status: ohne frische Daten zählt der Datenstand.
export function bezug() { return D.frisch && !(D.fehler && D.fehler.art === 'netz') ? Date.now() : (D.stand || Date.now()); }

function fensterStart(jetzt) { return Math.min(tagesBeginn(jetzt), jetzt - 6 * STD); }
const iso = (t) => new Date(t).toISOString();
const punktAus = (z) => ({ t: Date.parse(z.zeit), v: Number(z.temperatur_c) });

function einsortieren(zeilen) {
  const neu = new Map();
  for (const z of zeilen) {
    if (z.eingetragen_am && (!D.maxEing || z.eingetragen_am > D.maxEing)) D.maxEing = z.eingetragen_am;
    const p = punktAus(z);
    if (!Number.isFinite(p.t) || !Number.isFinite(p.v)) continue;
    if (!neu.has(z.uuid)) neu.set(z.uuid, []);
    neu.get(z.uuid).push(p);
  }
  for (const [mac, liste] of neu) {
    const map = new Map((D.punkte.get(mac) || []).map((p) => [p.t, p]));
    for (const p of liste) map.set(p.t, p);   // gleicher Zeitpunkt = Korrektur, neuer gewinnt
    const sortiert = [...map.values()].sort((a, b) => a.t - b.t);
    D.punkte.set(mac, sortiert);
    const l = sortiert[sortiert.length - 1];
    const alt = D.letzter.get(mac);
    if (!alt || l.t >= alt.t) D.letzter.set(mac, l);
  }
}

function kuerzen(jetzt) {
  const ab = fensterStart(jetzt);
  if (ab <= D.fensterAb) return;
  D.fensterAb = ab;
  for (const [mac, liste] of D.punkte) {
    const i = liste.findIndex((p) => p.t >= ab);
    D.punkte.set(mac, i < 0 ? [] : i ? liste.slice(i) : liste);
  }
}

async function ladeSensoren() {
  const zeilen = await anfrage('sensoren?select=*&order=standort.asc,reihenfolge.asc,name.asc');
  const vorher = aktive().map((s) => s.mac).sort().join();
  D.sensoren = zeilen.map(sensorAus);
  D.sensorenStand = Date.now();
  return vorher !== aktive().map((s) => s.mac).sort().join();
}

async function ladeFenster() {
  const jetzt = Date.now();
  const macs = aktive().map((s) => s.mac);
  D.punkte = new Map(); D.letzter = new Map(); D.maxEing = null;
  D.fensterAb = fensterStart(jetzt);
  if (!macs.length) return;
  const zeilen = await alleSeiten(
    'messwerte?select=uuid,zeit,temperatur_c,eingetragen_am&uuid=' + enc(macListe(macs)) +
    '&zeit=gte.' + iso(D.fensterAb) + '&order=zeit.asc,uuid.asc',
    macs.length * ((jetzt - D.fensterAb) / (5 * MIN) + 1));
  einsortieren(zeilen);
  // Sensoren ohne Wert im Fenster: nur den letzten Wert holen (eine kleine Abfrage je Sensor)
  await Promise.all(macs.filter((m) => !(D.punkte.get(m) || []).length).map(async (m) => {
    const z = await anfrage('messwerte?select=zeit,temperatur_c&uuid=eq.' + enc(m) + '&order=zeit.desc&limit=1');
    if (z.length) D.letzter.set(m, punktAus(z[0]));
  }));
}

async function ladeGeaendert() {
  const macs = aktive().map((s) => s.mac);
  if (!macs.length || !D.maxEing) return ladeFenster();
  kuerzen(Date.now());
  const zeilen = await alleSeiten(
    'messwerte?select=uuid,zeit,temperatur_c,eingetragen_am&uuid=' + enc(macListe(macs)) +
    '&zeit=gte.' + iso(D.fensterAb) + '&eingetragen_am=gt.' + enc(D.maxEing) + '&order=eingetragen_am.asc,uuid.asc,zeit.asc',
    macs.length * 2);
  einsortieren(zeilen);
}

async function ladeSeit() {
  if (D.seit) return;
  const z = await anfrage('messwerte?select=zeit&order=zeit.asc&limit=1');
  D.seit = z.length ? Date.parse(z[0].zeit) : null;
}

// Haupteinstieg: erstes Laden oder Nachladen. Nie zwei Läufe gleichzeitig.
export async function aktualisieren({ voll = false } = {}) {
  if (D.laedt) return;
  D.laedt = true; melde();
  try {
    let neuAufbauen = voll || !D.frisch || !D.sensoren.length;
    if (neuAufbauen || Date.now() - D.sensorenStand > SENSOREN_ALLE_MIN * MIN) {
      if (await ladeSensoren()) neuAufbauen = true;
    }
    if (neuAufbauen) await ladeFenster(); else await ladeGeaendert();
    await ladeSeit().catch(() => {});
    D.stand = Date.now(); D.frisch = true; D.fehler = null;
    speichereStand();
  } catch (e) {
    D.fehler = e instanceof RestFehler ? e : new RestFehler('server', String(e && e.message || e));
  } finally {
    D.laedt = false; melde();
  }
}

// ---------- Offline-Start ----------
function speichereStand() {
  ablegen(SNAPSHOT, {
    sensoren: D.sensoren.map((s) => s.roh),
    punkte: [...D.punkte].map(([m, l]) => [m, l.map((p) => [p.t, p.v])]),
    letzter: [...D.letzter].map(([m, p]) => [m, [p.t, p.v]]),
    maxEing: D.maxEing, fensterAb: D.fensterAb, stand: D.stand, seit: D.seit,
  });
}

export async function ladeGespeichert() {
  const s = await holen(SNAPSHOT);
  if (!s || !s.sensoren) return false;
  D.sensoren = s.sensoren.map(sensorAus);
  D.punkte = new Map(s.punkte.map(([m, l]) => [m, l.map(([t, v]) => ({ t, v }))]));
  D.letzter = new Map(s.letzter.map(([m, [t, v]]) => [m, { t, v }]));
  D.maxEing = s.maxEing; D.fensterAb = s.fensterAb; D.stand = s.stand; D.seit = s.seit;
  return true;
}

export function vergessen() {
  tabletVerwerfen();
  Object.assign(D, { sensoren: [], punkte: new Map(), letzter: new Map(), maxEing: null, fensterAb: 0, stand: null, seit: null, frisch: false, fehler: null });
  ablegen(SNAPSHOT, null);
}

// ---------- Detailansicht: Verlauf eines Sensors ----------
const verlaufCache = new Map();   // feste Zeiträume: mac|von|bis → punkte
const jetztCache = new Map();     // Zeiträume bis jetzt: mac → { von, punkte }

// Liefert die Rohwerte eines Sensors für [von, bis). Bis 8 Tage und darüber
// gleich: Rohwerte des einen Sensors, paginiert. Die Tageswerte rechnet die App
// selbst (eine View tageswerte gibt es nicht, das Schema ändert nur das
// Pi-Projekt). Gemessen: ein Jahr eines Sensors ≈ 0,7 MB, komprimiert übertragen.
// Zeiträume „bis jetzt“ werden nur einmal geholt; was danach dazukommt,
// liefert das laufende Nachladen (Fenster seit Mitternacht/6 Std).
export async function ladeVerlauf(mac, von, bis, jetzt, fortschritt) {
  const bisJetzt = bis >= jetzt - MIN;
  if (bisJetzt) {
    if (D.stand && D.punkte.has(mac) && von >= D.fensterAb) return punkteVon(mac).filter((p) => p.t >= von && p.t <= bis);
    const c = jetztCache.get(mac);
    if (c && c.von <= von) return mitFenster(c.punkte.filter((p) => p.t >= von), mac, von, bis);
  } else {
    const c = verlaufCache.get(mac + '|' + von + '|' + bis);
    if (c) return c;
  }
  const zeilen = await alleSeiten(
    'messwerte?select=zeit,temperatur_c&uuid=eq.' + enc(mac) + '&zeit=gte.' + iso(von) +
    (bisJetzt ? '' : '&zeit=lt.' + iso(bis)) + '&order=zeit.asc',
    (bis - von) / (5 * MIN) + 1, fortschritt);
  const punkte = zeilen.map(punktAus).filter((p) => Number.isFinite(p.v));
  if (bisJetzt) {
    jetztCache.set(mac, { von, punkte });
    return mitFenster(punkte, mac, von, bis);
  }
  if (verlaufCache.size > 12) verlaufCache.delete(verlaufCache.keys().next().value);
  verlaufCache.set(mac + '|' + von + '|' + bis, punkte);
  return punkte;
}

// Ab fensterAb ist das laufend nachgeladene Fenster die Wahrheit (enthält auch
// nachgetragene Werte), davor gilt der einmal geholte Verlauf.
function mitFenster(punkte, mac, von, bis) {
  const ab = D.stand && D.punkte.has(mac) ? D.fensterAb : Infinity;
  const roh = punkte.filter((p) => p.t < ab).concat(punkteVon(mac).filter((p) => p.t >= Math.max(ab, von) && p.t <= bis));
  if (ab < Infinity) return roh;
  // Sensor war im ganzen Fenster still (Wagen lange unterwegs): am Wagen ausgelesene Werte trotzdem anhängen
  const letzter = roh.length ? roh[roh.length - 1].t : -Infinity;
  const tb = (D.tablet.get(mac) || []).filter((p) => p.t > letzter && p.t >= von && p.t <= bis);
  return tb.length ? roh.concat(tb) : roh;
}


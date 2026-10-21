// Start, Navigation, Nachladen. Die App liest nur (anon-Key); geschrieben wird
// ausschließlich im Admin-Bereich nach Anmeldung (ansichten/admin.js).

import { Z } from './zustand.js';
import { merk } from './speicher.js';
import { D, aktualisieren, beiAenderung, ladeGespeichert, ladeVerlauf, sensorVon, vergessen, tabletVerwerfen } from './daten.js';
import { konfig, konfigSpeichern, normalisiereUrl, keyIstGeheim, zaehle } from './rest.js';
import { uebersicht, blattStandort } from './ansichten/uebersicht.js';
import { detail, diagramm, blattZeitraum, eigenPruefen, verlaufKey, jetztZeit, zr, beiAusschnitt, ausschnittAufheben } from './ansichten/detail.js';
import { A, blattAuslesen, beiAuslesen, starte as auslesenStarten, koppelnUndLesen, schliessen as auslesenSchliessen } from './ansichten/auslesen.js';
import { einstellungen, einrichtung } from './ansichten/einstellungen.js';
import { bereich } from './zeit.js';

const NACHLADEN_MS = 5 * 60000;
const app = document.getElementById('app');
let admin = null;            // ansichten/admin.js, erst bei Bedarf geladen
let einrichtungForm = null;  // { url, key, fehler, laeuft }
let scrollUebersicht = 0;

// ---------- Einrichtungslink: …/#einrichtung=<base64url {"u":…,"k":…}> ----------
const b64url = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ausB64url = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

function einrichtungAusLink() {
  const m = /[#&]einrichtung=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);   // Schlüssel nicht in der Adresszeile lassen
  try {
    const j = JSON.parse(ausB64url(m[1]));
    const url = normalisiereUrl(j.u), key = String(j.k || '').trim();
    if (url && key && !keyIstGeheim(key)) {
      const alt = konfig();
      if (!alt || alt.url !== url || alt.key !== key) { konfigSpeichern(url, key); vergessen(); }
    }
  } catch (e) { /* kaputter Link – dann eben die Einrichtungsseite */ }
}

export function einrichtungsLink() {
  const k = konfig();
  return location.origin + location.pathname + '#einrichtung=' + b64url(JSON.stringify({ u: k.url, k: k.key }));
}

// ---------- Layout: hoch / quer / Handy / PC ----------
function layout() {
  const w = window.innerWidth, h = window.innerHeight;
  const L = Z.layout;
  L.breite = w;
  L.schmal = w < 560;
  L.breit = w >= 1200;
  L.quer = !L.breit && w > h && w >= 860;
  L.geteilt = L.breit;      // Laptop/Monitor (ab 1200 px): Übersicht links, Verlauf rechts daneben
  app.classList.toggle('schmal', L.schmal);
  app.classList.toggle('quer', L.quer);
  app.classList.toggle('breit', L.breit);
  app.classList.toggle('geteilt', L.geteilt);
}

// ---------- Rendern ----------
// Seite und Blatt liegen getrennt: neue Daten zeichnen nur die Seite neu, ein
// offenes Blatt (z. B. Datumseingabe im Zeitraum-Blatt) bleibt unangetastet.
function seitenInhalt() {
  if (Z.seite === 'detail' && !sensorVon(Z.sensor)) Z.seite = 'uebersicht';
  if (!konfig() && Z.seite !== 'einrichtung') Z.seite = 'einrichtung';
  if (Z.seite === 'detail') verlaufSicherstellen();
  if (Z.layout.geteilt && (Z.seite === 'uebersicht' || Z.seite === 'detail')) return geteilt();
  switch (Z.seite) {
    case 'detail': return detail();
    case 'einstellungen': return einstellungen();
    case 'einrichtung': return einrichtung(einrichtungForm);
    case 'admin': return admin ? admin.adminSeite() : '';
    case 'admin-sensor': return admin ? admin.adminSensorSeite() : '';
    default: return uebersicht();
  }
}

// Großer Bildschirm (ab 1200 px): Übersicht und Verlauf nebeneinander. Ohne Auswahl
// zeigt rechts der wichtigste Sensor (erste Karte = Alarm/Problem zuerst).
function geteilt() {
  if (!Z.sensor || !sensorVon(Z.sensor) || !sensorVon(Z.sensor).aktiv) {
    // wichtigster Sensor: Alarm vor Meldet nicht vor Achtung vor OK vor Offline
    const RANGFOLGE = ['alarm', 'meldet', 'achtung', 'ok', 'ohne', 'offline'];
    let best = null;
    for (const m of uebersicht().matchAll(/st-(\w+)[^>]*?data-sensor="([^"]+)"/g)) {
      const r = RANGFOLGE.indexOf(m[1]);
      if (!best || (r >= 0 && r < best.r)) best = { r: r < 0 ? 99 : r, mac: m[2] };
    }
    Z.sensor = best ? best.mac : null;
  }
  if (Z.sensor) verlaufSicherstellen();
  const rechts = Z.sensor ? detail().replace(/<button class="zurueck"[^]*?<\/button>/, '') : '<div class="leer">Sensor antippen, um den Verlauf zu sehen.</div>';
  return '<div class="geteilt-raster"><div class="g-links">' + uebersicht().replace('data-sensor="' + Z.sensor + '"', 'data-sensor="' + Z.sensor + '" aria-current="true"') + '</div>' +
    '<aside class="g-rechts" aria-label="Verlauf">' + rechts + '</aside></div>';
}

function render() {
  const inhalt = seitenInhalt();
  const blatt = Z.blatt === 'zeitraum' ? blattZeitraum() : Z.blatt === 'auslesen' ? (A.gruppe ? blattAuslesen() : '') : Z.blatt === 'admininfo' ? (admin ? admin.infoBlatt() : '') : Z.blatt ? blattStandort() : '';
  app.innerHTML = '<div id="seite">' + inhalt + '</div><div id="blatt-platz">' + blatt + '</div>';
  document.body.classList.toggle('blatt-offen', !!blatt);
  diagramm();
}

function renderSeite() {
  const s = document.getElementById('seite');
  if (!s) { render(); return; }
  s.innerHTML = seitenInhalt();
  diagramm();
}

// Neu zeichnen nach neuen Daten – aber nie mitten in eine Eingabe hinein
function nachDaten() {
  if (!['uebersicht', 'detail', 'einstellungen'].includes(Z.seite)) return;
  if (Z.blatt === 'zeitraum') renderSeite(); else render();
}

function seite(neu) {
  if (Z.seite === 'uebersicht') scrollUebersicht = window.scrollY;
  Z.seite = neu; Z.blatt = null; Z.meldung = null;
  render();
  window.scrollTo(0, neu === 'uebersicht' ? scrollUebersicht : 0);
}

// ---------- Verlauf der Detailansicht nachladen ----------
function verlaufSicherstellen() {
  const key = verlaufKey();
  if (Z.verlauf && Z.verlauf.key === key) return;
  const alt = Z.verlauf && Z.verlauf.key.split('|').slice(0, 3).join('|') === key.split('|').slice(0, 3).join('|') ? Z.verlauf : null;
  // gleicher Zeitraum, nur neue Daten: alte Kurve stehen lassen, bis die neue da ist
  Z.verlauf = { key, laedt: true, punkte: alt && alt.punkte, n: 0 };
  const j = jetztZeit();
  const [von, bis] = bereich(Z.zeitraum, j, zr());
  ladeVerlauf(Z.sensor, von, bis, j, (n) => {
    if (Z.verlauf.key !== key || Z.verlauf.punkte) return;
    Z.verlauf.n = n;
    const t = document.querySelector('.b-chart .leer');
    if (t) t.lastChild.textContent = ' Lädt den Verlauf … ' + n.toLocaleString('de-DE') + ' Werte';
  }).then((punkte) => {
    if (!Z.verlauf || Z.verlauf.key !== key) return;
    Z.verlauf = { key, punkte };
    if (Z.seite === 'detail' || Z.layout.geteilt) nachDaten();
  }).catch((fehler) => {
    if (!Z.verlauf || Z.verlauf.key !== key) return;
    Z.verlauf = { key, fehler, punkte: alt && alt.punkte };
    if (Z.seite === 'detail' || Z.layout.geteilt) nachDaten();
  });
}

// ---------- Admin ----------
async function adminOeffnen() {
  if (!admin) {
    admin = await import('./ansichten/admin.js');
    admin.init(() => { if (Z.seite === 'admin' || Z.seite === 'admin-sensor') render(); });
  }
  seite('admin');
  admin.oeffnen();
}

// ---------- Einrichtung ----------
async function einrichtungPruefen(urlEin, keyEin) {
  const url = normalisiereUrl(urlEin), key = String(keyEin || '').trim();
  einrichtungForm = { url: urlEin, key: keyEin, fehler: null, laeuft: false };
  if (!url || !key) einrichtungForm.fehler = 'Bitte Projekt-URL und Schlüssel eintragen.';
  else if (keyIstGeheim(key)) einrichtungForm.fehler = 'Das ist ein geheimer Schlüssel (secret / service_role). Der darf nie in die App. Bitte den Publishable key oder anon key nehmen.';
  if (einrichtungForm.fehler) { render(); return; }
  einrichtungForm.laeuft = true; render();
  try {
    const a = await fetch(url + '/rest/v1/sensoren?select=mac&limit=1', { headers: { apikey: key, Authorization: 'Bearer ' + key } });
    const text = await a.text();
    zaehle(text.length + 700);
    if (a.status === 401 || a.status === 403) throw new Error('Der Schlüssel wird nicht angenommen. Bitte prüfen, ob er vollständig kopiert ist.');
    if (!a.ok) throw new Error('Die Projekt-URL stimmt nicht oder die Tabelle „sensoren“ fehlt (HTTP ' + a.status + ').');
  } catch (e) {
    einrichtungForm.laeuft = false;
    einrichtungForm.fehler = e instanceof TypeError ? 'Keine Verbindung zu dieser Adresse. Netz und Projekt-URL prüfen.' : e.message;
    render(); return;
  }
  konfigSpeichern(url, key);
  einrichtungForm = null;
  vergessen();
  seite('uebersicht');
  aktualisieren({ voll: true });
}

// ---------- Tipps ----------
app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-aktion],[data-sensor],[data-zeitraum],[data-wahl],[data-vorlage]');
  if (!el) return;
  const a = el.dataset.aktion;
  if (el.dataset.wahl !== undefined) {
    const w = el.dataset.wahl || null;
    if (Z.blatt === 'start') { Z.start = w; merk.schreib('start', w); Z.filter = w; }
    else if (Z.blatt === 'wagen') { Z.wagen = w; merk.schreib('wagen', w); }
    else Z.filter = w;
    Z.blatt = null; render(); return;
  }
  if (el.dataset.vorlage) { Z.vorAuswahl = null; Z.zeitraum = el.dataset.vorlage; Z.blatt = null; Z.zeitraumFehler = null; render(); return; }
  if (a === 'blatt-zu') { if (e.target === el) { if (Z.blatt === 'auslesen') auslesenSchliessen(); Z.blatt = null; Z.zeitraumFehler = null; render(); } return; }
  if (el.dataset.sensor && !a) {
    Z.sensor = el.dataset.sensor; Z.verlauf = null;
    if (Z.layout.geteilt) { Z.seite = 'detail'; render(); return; }   // Übersicht bleibt stehen, rechts wechselt der Verlauf
    seite('detail'); return;
  }
  if (el.dataset.zeitraum) { Z.vorAuswahl = null; Z.zeitraum = el.dataset.zeitraum; render(); return; }
  switch (a) {
    case 'zeitraum-blatt': Z.blatt = 'zeitraum'; break;
    case 'blatt': Z.blatt = 'filter'; break;
    case 'blatt-start': Z.blatt = 'start'; break;
    case 'blatt-wagen': Z.blatt = 'wagen'; break;
    case 'filter-weg': Z.filter = Z.start; break;
    case 'einstellungen': seite('einstellungen'); return;
    case 'zurueck': seite('uebersicht'); return;
    case 'einrichtung': einrichtungForm = null; seite('einrichtung'); return;
    case 'neu-laden': aktualisieren({ voll: !D.stand }); return;
    case 'verlauf-neu': Z.verlauf = null; break;
    // Am Wagen auslesen (Bluetooth, nur Arbeitsspeicher)
    case 'auslesen': auslesenStarten(el.dataset.gruppe, false); return;
    case 'auslesen-nochmal': auslesenStarten(A.gruppe, true); return;
    case 'auslesen-koppeln': koppelnUndLesen(el.dataset.mac); return;
    case 'auslesen-fertig': Z.blatt = null; auslesenSchliessen(); break;
    case 'tablet-weg': tabletVerwerfen(); Z.verlauf = null; break;
    // im Diagramm gezogener Ausschnitt
    case 'ausschnitt-weg': ausschnittAufheben(); break;
    case 'ausschnitt-schalter':
      Z.ausschnitt = !Z.ausschnitt; merk.schreib('ausschnitt', Z.ausschnitt);
      if (!Z.ausschnitt && Z.zeitraum === 'auswahl') ausschnittAufheben();
      break;
    // Info zum Sensoren-Verwalten
    case 'admin-info': Z.blatt = 'admininfo'; break;
    case 'info-zu': Z.blatt = null; break;
    case 'link-kopieren': {
      const link = einrichtungsLink();
      try { await navigator.clipboard.writeText(link); Z.meldung = { art: 'info', text: 'Einrichtungslink kopiert. Auf dem anderen Gerät einmal öffnen, dann ist es eingerichtet. Der Link enthält den Schlüssel – nur an eigene Geräte geben.' }; }
      catch (x) { Z.meldung = { art: 'info', text: 'Einrichtungslink: ' + link }; }
      break;
    }
    case 'admin': await adminOeffnen(); return;
    case 'admin-oeffnen': admin.oeffnen(); return;
    case 'admin-abmelden': admin.abmeldenFragen(true); return;
    case 'admin-abmelden-nein': admin.abmeldenFragen(false); return;
    case 'admin-abmelden-ja': admin.abmelden(); return;
    case 'admin-neu': admin.meldungWeg(); admin.bearbeiten(null); return;
    case 'admin-sensor': admin.meldungWeg(); admin.bearbeiten(el.dataset.mac); return;
    case 'admin-zurueck': admin.zurueckZurListe(); window.scrollTo(0, 0); return;
    case 'admin-kipp': el.classList.toggle('an'); el.setAttribute('aria-checked', el.classList.contains('an')); return;
    default: return;
  }
  render();
});

app.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = e.target.id;
  const wert = (x) => (document.getElementById(x) || {}).value;
  if (id === 'eigen-form') {
    Z.zeitraumFehler = eigenPruefen(wert('eigen-von'), wert('eigen-bis'));
    if (!Z.zeitraumFehler) { Z.zeitraum = 'eigen'; Z.blatt = null; }
    render();
  } else if (id === 'einrichtung-form') einrichtungPruefen(wert('e-url'), wert('e-key'));
  else if (id === 'login-form') admin.anmelden(wert('l-mail'), wert('l-pw'));
  else if (id === 'sensor-form') admin.speichern(admin.formLesen());
});

// ---------- Nachladen: alle 5 Min, nur solange die App sichtbar ist ----------
const sichtbar = () => document.visibilityState === 'visible';
setInterval(() => { if (sichtbar() && konfig()) aktualisieren(); }, NACHLADEN_MS);
// Status hängt von der Uhr ab (Offline nach 15 Min …): jede Minute neu zeichnen, ohne Netz
setInterval(() => { if (sichtbar()) nachDaten(); }, 60000);
document.addEventListener('visibilitychange', () => {
  if (sichtbar() && konfig() && (!D.stand || Date.now() - D.stand > 60000)) aktualisieren();
});
window.addEventListener('online', () => { if (konfig()) aktualisieren(); });
let rTimer;
window.addEventListener('resize', () => { clearTimeout(rTimer); rTimer = setTimeout(() => { const alt = JSON.stringify(Z.layout); layout(); if (JSON.stringify(Z.layout) !== alt) { if (Z.seite === 'detail' || Z.seite.startsWith('admin') || alt.includes('"geteilt":' + !Z.layout.geteilt)) render(); else diagramm(); } }, 150); });
beiAenderung(nachDaten);
beiAuslesen(() => { if (Z.blatt === 'auslesen') render(); else nachDaten(); });
beiAusschnitt(() => render());

// ---------- Service Worker (App-Dateien + Schriften offline) ----------
// Lokal beim Entwickeln nur mit ?sw=1, sonst liefert der Zwischenspeicher alte Dateien.
const lokal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]sw=1/.test(location.search);
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !lokal) {
  const hatteSteuerung = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  let neu = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hatteSteuerung && !neu) { neu = true; location.reload(); } });
}

// Übertragene Bytes der App-Dateien selbst (aus dem Netz, nicht aus dem Zwischenspeicher)
window.addEventListener('load', () => setTimeout(() => {
  try {
    let n = 0;
    for (const e of performance.getEntries()) if ((e.entryType === 'navigation' || e.entryType === 'resource') && e.name.startsWith(location.origin)) n += e.transferSize || 0;
    zaehle(n);
  } catch (x) { /* egal */ }
}, 4000));

// ---------- Start ----------
(async function start() {
  window.__gestartet = true;
  einrichtungAusLink();
  layout();
  // Ansicht per Adresse (für Screenshots/Tests): ?seite=detail&sensor=MAC&zeitraum=7t
  const q = new URLSearchParams(location.search);
  Z.filter = Z.start;
  if (q.get('filter')) Z.filter = q.get('filter');
  if (q.get('zeitraum') && q.get('zeitraum') !== 'auswahl') Z.zeitraum = q.get('zeitraum');   // Ausschnitt nur durch Ziehen
  if (q.get('von') && q.get('bis')) { Z.eigen = { von: q.get('von'), bis: q.get('bis') }; Z.zeitraum = 'eigen'; }
  if (!konfig()) { Z.seite = 'einrichtung'; render(); return; }
  render();
  // letzter Datenstand für den Offline-Start – aber nie länger als 1,5 s darauf warten
  await Promise.race([ladeGespeichert(), new Promise((ok) => setTimeout(ok, 1500))]);
  if (q.get('seite')) Z.seite = q.get('seite');
  if (q.get('sensor')) Z.sensor = q.get('sensor');
  if (q.get('blatt')) Z.blatt = q.get('blatt');
  render();
  await aktualisieren();
  if (Z.seite === 'admin') adminOeffnen();
})();


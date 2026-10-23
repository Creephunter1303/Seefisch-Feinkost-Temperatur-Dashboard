// Admin-Bereich: Anmelden (Supabase Auth, E-Mail + Passwort), Sensoren
// anlegen/ändern/ausmustern, Änderungsprotokoll lesen.
// Schnittstelle: ruuvi-haccp/PLAN-STAMMDATEN.md Abschnitt 9.
// - geschrieben wird NUR in die Tabelle sensoren (insert/update, nie delete)
// - die MAC ist nach dem Anlegen unveränderlich
// - stammdaten_protokoll nur lesen
// Diese Datei und die Supabase-Bibliothek werden erst geladen, wenn jemand den
// Admin-Bereich öffnet. Die Anzeige selbst bleibt reines Lesen mit dem anon-Key.

import { ICON } from '../icons.js';
import { Z, esc, WAGEN_AB_MIN } from '../zustand.js';
import { D, aktualisieren } from '../daten.js';
import { merk } from '../speicher.js';
import { konfig } from '../rest.js';
import { grenzText } from '../status.js';
import { MIN, uhr, wann, dauer } from '../zeit.js';

const BIBLIOTHEK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
const PI_TAKT_MIN = 10;   // der Pi gleicht die Stammdaten jede Runde ab, wirksam nach ≤ 10 Min

const A = {
  client: null, email: null, bereit: false, laedt: false,
  fehler: null, meldung: null,
  protokoll: null, protokollFehler: null,
  form: null,          // Bearbeiten/Anlegen: { neu, mac, name, standort, … }
  formFehler: null, speichert: false,
  abmeldenFragen: false,   // „Abmelden“ braucht einen zweiten Klick
  standort: null,          // Blatt Standort: { alt: Name oder null (= neu), fehler, speichert }
};

// ---------- Standorte ----------
// Eine eigene Tabelle gibt es nicht (Schema gehört dem Pi-Projekt): ein Standort ist der Text in
// sensoren.standort. Neu angelegte Standorte ohne Sensor merkt sich nur dieses Gerät, bis ihnen
// ein Sensor zugeordnet ist. Umbenennen ändert alle Sensoren mit diesem Standort.
const sortiert = (a) => [...new Set(a)].sort((x, y) => x.localeCompare(y, 'de'));
function standorteInDb() { return sortiert(D.sensoren.map((s) => s.standort).filter(Boolean)); }
function standorteNeu() {
  const db = new Set(standorteInDb());
  const neu = merk.lies('standorte-neu', []).filter((x) => !db.has(x));
  merk.schreib('standorte-neu', neu);
  return neu;
}
export const standorte = () => sortiert([...standorteInDb(), ...standorteNeu()]);

export function standortOeffnen(alt) { A.standort = { alt: alt || null, fehler: null, speichert: false }; Z.blatt = 'admin-standort'; }

export async function standortSpeichern(eingabe) {
  const st = A.standort;
  const name = String(eingabe || '').trim().replace(/\s+/g, ' ');
  const fehler = (t) => { st.fehler = t; neuZeichnen(); };
  if (!name) return fehler('Bitte einen Namen eintragen.');
  if (name.length > 40) return fehler('Der Name darf höchstens 40 Zeichen haben.');
  const da = standorte().find((x) => x.toLowerCase() === name.toLowerCase());
  if (!st.alt) {
    if (da) return fehler('Den Standort „' + da + '“ gibt es schon.');
    merk.schreib('standorte-neu', [...standorteNeu(), name]);
    A.meldung = { art: 'info', text: 'Standort „' + name + '“ angelegt. Er steht jetzt bei den Sensoren zur Auswahl und wird gespeichert, sobald ihm ein Sensor zugeordnet ist.' };
    A.standort = null; Z.blatt = null; neuZeichnen(); return;
  }
  if (name === st.alt) { A.standort = null; Z.blatt = null; neuZeichnen(); return; }
  if (da && da !== st.alt && !st.zusammen) { st.zusammen = true; return fehler('„' + da + '“ gibt es schon. Nochmal „Speichern“ = die Sensoren von „' + st.alt + '“ kommen zu „' + da + '“.'); }
  const ziel = da && da !== st.alt ? da : name;
  // nur auf diesem Gerät gemerkt → ohne Datenbank umbenennen
  if (standorteNeu().includes(st.alt)) {
    merk.schreib('standorte-neu', standorteNeu().map((x) => (x === st.alt ? ziel : x)));
  } else {
    st.speichert = true; st.fehler = null; neuZeichnen();
    try {
      const c = await client();
      const res = await c.from('sensoren').update({ standort: ziel }).eq('standort', st.alt).select();
      if (res.error) { st.speichert = false; return fehler(fehlerText(res.error)); }
      if (!res.data || !res.data.length) { st.speichert = false; return fehler('Nicht gespeichert: keine Berechtigung. Das Konto ist nicht als Admin freigegeben.'); }
      A.meldung = { art: 'info', text: 'Standort „' + st.alt + '“ heißt jetzt „' + ziel + '“ (' + res.data.length + (res.data.length === 1 ? ' Sensor' : ' Sensoren') + ').' };
    } catch (e) { st.speichert = false; return fehler(fehlerText(e)); }
  }
  // Einstellungen dieses Geräts mitziehen (auf anderen Geräten einmal neu wählen)
  if (Z.start === st.alt) { Z.start = ziel; merk.schreib('start', ziel); }
  if (Z.wagen === st.alt) { Z.wagen = ziel; merk.schreib('wagen', ziel); }
  if (Z.filter === st.alt) Z.filter = ziel;
  if (A.form && A.form.standort === st.alt) A.form.standort = ziel;
  A.standort = null; Z.blatt = null;
  await Promise.all([aktualisieren({ voll: true }), ladeProtokoll()]);
  neuZeichnen();
}

// Ein Standort, der nur auf diesem Gerät gemerkt ist, lässt sich wieder entfernen
export function standortEntfernen() {
  const alt = A.standort && A.standort.alt;
  merk.schreib('standorte-neu', standorteNeu().filter((x) => x !== alt));
  A.standort = null; Z.blatt = null; neuZeichnen();
}

export function standortBlatt() {
  const st = A.standort;
  if (!st) return '';
  const nurHier = st.alt && standorteNeu().includes(st.alt);
  const anz = st.alt ? D.sensoren.filter((s) => s.standort === st.alt).length : 0;
  return '<div class="blatt-grund" data-aktion="blatt-zu"><div class="blatt" role="dialog" aria-label="Standort">' +
    '<h2>' + (st.alt ? 'Standort umbenennen' : 'Neuer Standort') + '</h2>' +
    '<form id="standort-form" class="formular" novalidate>' +
    '<div class="feld"><label for="st-name">Name</label><input id="st-name" maxlength="40" autocomplete="off" value="' + esc(st.alt || '') + '"></div>' +
    '<p class="erklaerung">' + (!st.alt ? 'Überschrift einer Gruppe, z. B. Halle oder ein Wagen. Danach bei den Sensoren auswählen.'
      : nurHier ? 'Noch keinem Sensor zugeordnet.'
        : 'Ändert den Standort bei ' + anz + (anz === 1 ? ' Sensor' : ' Sensoren') + ' (auch ausgemusterte). Jede Änderung steht unter „Änderungen“.') + '</p>' +
    (st.fehler ? '<p class="fehler-text" role="alert">' + esc(st.fehler) + '</p>' : '') +
    '<button type="submit" class="primaer"' + (st.speichert ? ' disabled' : '') + '>' + (st.speichert ? 'Speichert …' : st.alt ? 'Speichern' : 'Anlegen') + '</button>' +
    (nurHier ? '<button type="button" class="knopf-2" data-aktion="admin-standort-weg">Standort entfernen</button>' : '') +
    '<button type="button" class="knopf-2" data-aktion="info-zu">Abbrechen</button>' +
    '</form></div></div>';
}

function standorteHtml() {
  const neu = new Set(standorteNeu());
  const zeile = (n) => {
    const ss = D.sensoren.filter((s) => s.standort === n);
    const ein = ss.filter((s) => s.aktiv).length, aus = ss.length - ein;
    const z = neu.has(n) ? 'noch kein Sensor · nur auf diesem Gerät gemerkt' : ein + ' im Einsatz' + (aus ? ' · ' + aus + ' ausgemustert' : '');
    return '<button class="blatt-zeile admin-zeile" data-aktion="admin-standort" data-standort="' + esc(n) + '"><span class="n">' + esc(n) + '<span class="z">' + z + '</span></span>' + ICON.weiter + '</button>';
  };
  const alle = standorte();
  return '<section class="abschnitt"><h2>Standorte · ' + alle.length + '</h2><div class="admin-liste">' + (alle.map(zeile).join('') || '<div class="leer klein">Noch keine Standorte.</div>') + '</div>' +
    '<button class="knopf-2 neu-knopf" data-aktion="admin-standort-neu">' + ICON.plus + 'Neuer Standort</button></section>';
}

let neuZeichnen = () => {};
export function init(rendern) { neuZeichnen = rendern; }

async function client() {
  if (A.client) return A.client;
  const k = konfig();
  const { createClient } = await import(BIBLIOTHEK);
  A.client = createClient(k.url, k.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  return A.client;
}

// Beim Öffnen: Bibliothek laden, gespeicherte Sitzung prüfen, Protokoll holen
export async function oeffnen() {
  A.fehler = null; A.meldung = A.meldung || null;
  if (!A.bereit) { A.laedt = true; neuZeichnen(); }
  try {
    const c = await client();
    const { data } = await c.auth.getSession();
    A.email = data.session ? data.session.user.email : null;
    A.bereit = true;
    if (A.email) await ladeProtokoll();
  } catch (e) {
    A.fehler = 'Der Admin-Bereich braucht eine Internetverbindung. (' + (e.message || e) + ')';
  }
  A.laedt = false; neuZeichnen();
}

async function ladeProtokoll() {
  A.protokollFehler = null;
  const { data, error } = await A.client.from('stammdaten_protokoll').select('*').order('zeit', { ascending: false }).limit(40);
  if (error) { A.protokollFehler = fehlerText(error); A.protokoll = []; }
  else A.protokoll = data || [];
}

// ---------- Datenbank-Fehler verständlich machen ----------
export function fehlerText(e) {
  if (!e) return '';
  const m = (e.message || '') + ' ' + (e.details || '');
  if (e.code === '23505' && /aktiver_name/.test(m)) return 'Diesen Namen trägt schon ein anderer aktiver Sensor. Bitte einen anderen Namen wählen.';
  if (e.code === '23505' && /pkey|mac/.test(m)) return 'Einen Sensor mit dieser MAC-Adresse gibt es schon. Bitte in der Liste bearbeiten.';
  if (e.code === '23514') {
    if (/mac/.test(m)) return 'Die MAC-Adresse hat nicht das Format AA:BB:CC:DD:EE:FF.';
    if (/name/.test(m)) return 'Der Name muss 1 bis 40 Zeichen lang sein, ohne Leerzeichen am Anfang oder Ende.';
    if (/temp_max/.test(m)) return 'Die Grenztemperatur muss zwischen −40 und 50 °C liegen.';
    if (/grau_nach_minuten_check/.test(m)) return '„Offline nach“ muss größer als 0 sein.';
    return '„Meldet nicht nach“ muss größer sein als „Offline nach“.';
  }
  if (e.code === '42501') return 'Keine Berechtigung. Das Konto ist nicht als Admin freigegeben.';
  if (e.code === 'P0001') return e.message;
  if (/Invalid login credentials/i.test(m)) return 'E-Mail oder Passwort stimmen nicht.';
  if (/Email not confirmed/i.test(m)) return 'Die E-Mail-Adresse ist noch nicht bestätigt.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Keine Verbindung. Bitte später noch einmal versuchen.';
  return 'Fehler: ' + (e.message || String(e));
}

// ---------- Prüfen vor dem Speichern (die Datenbank prüft dasselbe noch einmal) ----------
export function macNormal(s) {
  let m = String(s || '').trim().toUpperCase().replace(/-/g, ':');
  if (/^[0-9A-F]{12}$/.test(m)) m = m.match(/.{2}/g).join(':');
  return m;
}
const ganz = (s) => (/^-?\d+$/.test(String(s).trim()) ? Number(s) : NaN);

export function pruefe(f) {
  const z = {};
  if (f.neu) {
    z.mac = macNormal(f.mac);
    if (!/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(z.mac)) return { fehler: 'Bitte die MAC-Adresse im Format AA:BB:CC:DD:EE:FF eintragen.' };
  }
  z.name = String(f.name || '').trim();
  if (!z.name) return { fehler: 'Bitte einen Namen eintragen.' };
  if (z.name.length > 40) return { fehler: 'Der Name darf höchstens 40 Zeichen haben.' };
  z.standort = String(f.standort || '').trim() || null;
  const g = String(f.grenze ?? '').trim().replace(',', '.').replace('−', '-');
  if (g === '') z.temp_max = null;
  else {
    z.temp_max = Number(g);
    if (!Number.isFinite(z.temp_max)) return { fehler: 'Die Grenztemperatur ist keine Zahl.' };
    if (z.temp_max < -40 || z.temp_max > 50) return { fehler: 'Die Grenztemperatur muss zwischen −40 und 50 °C liegen.' };
  }
  z.grau_nach_minuten = ganz(f.grau);
  z.rot_nach_minuten = ganz(f.rot);
  if (!(z.grau_nach_minuten > 0)) return { fehler: '„Offline nach“ bitte als ganze Minuten größer 0 eintragen.' };
  if (!(z.rot_nach_minuten > z.grau_nach_minuten)) return { fehler: '„Meldet nicht nach“ muss größer sein als „Offline nach“.' };
  z.reihenfolge = String(f.reihenfolge ?? '').trim() === '' ? 100 : ganz(f.reihenfolge);
  if (!Number.isFinite(z.reihenfolge)) return { fehler: 'Die Reihenfolge bitte als ganze Zahl eintragen.' };
  z.aktiv = !!f.aktiv;
  z.notiz = String(f.notiz || '').trim() || null;
  return { zeile: z };
}

// ---------- Aktionen ----------
export async function anmelden(email, passwort) {
  A.fehler = null;
  if (!email || !passwort) { A.fehler = 'Bitte E-Mail und Passwort eintragen.'; neuZeichnen(); return; }
  A.laedt = true; neuZeichnen();
  try {
    const c = await client();
    const { data, error } = await c.auth.signInWithPassword({ email: email.trim(), password: passwort });
    if (error) A.fehler = fehlerText(error);
    else { A.email = data.user.email; await ladeProtokoll(); }
  } catch (e) { A.fehler = fehlerText(e); }
  A.laedt = false; neuZeichnen();
}

export async function abmelden() {
  try { await (await client()).auth.signOut(); } catch (e) { /* lokal trotzdem weg */ }
  A.email = null; A.protokoll = null; A.meldung = null; A.abmeldenFragen = false; Z.seite = 'admin'; neuZeichnen();
}

export function bearbeiten(mac) {
  const s = mac && D.sensoren.find((x) => x.mac === mac);
  A.formFehler = null;
  A.form = s
    ? { neu: false, mac: s.mac, name: s.name, standort: s.standort || '', grenze: s.grenze === null ? '' : String(s.grenze).replace('.', ','), grau: s.grauMin, rot: s.rotMin, reihenfolge: s.reihenfolge, aktiv: s.aktiv, notiz: s.notiz }
    : { neu: true, mac: '', name: '', standort: '', grenze: '7', grau: 15, rot: 480, reihenfolge: 100, aktiv: true, notiz: '' };
  Z.seite = Z.layout.breit ? 'admin' : 'admin-sensor';   // breit: Formular erscheint rechts neben der Liste
  neuZeichnen();
  if (!Z.layout.breit) window.scrollTo(0, 0);
}

export async function speichern(werte) {
  Object.assign(A.form, werte);
  const p = pruefe(A.form);
  if (p.fehler) { A.formFehler = p.fehler; neuZeichnen(); return; }
  A.speichert = true; A.formFehler = null; neuZeichnen();
  try {
    const c = await client();
    let res;
    if (A.form.neu) res = await c.from('sensoren').insert(p.zeile).select();
    else res = await c.from('sensoren').update(p.zeile).eq('mac', A.form.mac).select();
    if (res.error) A.formFehler = fehlerText(res.error);
    else if (!res.data || !res.data.length) A.formFehler = 'Nicht gespeichert: keine Berechtigung. Das Konto ist nicht als Admin freigegeben.';
    else {
      const t = Date.now();
      A.meldung = { art: 'info', text: '„' + p.zeile.name + '“ gespeichert um ' + uhr(t) + '. Die Anzeige gilt sofort. Der Pi übernimmt es spätestens um ' + uhr(t + PI_TAKT_MIN * MIN) + '.' };
      const macNach = A.form.neu ? p.zeile.mac : A.form.mac;
      A.form = null; Z.seite = 'admin';
      await Promise.all([aktualisieren({ voll: true }), ladeProtokoll()]);
      if (Z.layout.breit && D.sensoren.some((x) => x.mac === macNach)) { const m = A.meldung; bearbeiten(macNach); A.meldung = m; neuZeichnen(); window.scrollTo(0, 0); }
    }
  } catch (e) { A.formFehler = fehlerText(e); }
  A.speichert = false; neuZeichnen();
}

// ---------- Darstellung ----------
const infoKnopf = '<button class="icon-knopf info-knopf" data-aktion="admin-info" aria-label="Regeln für Sensoren">' + ICON.info + '</button>';
const kopf = (titel, aktion, info) => '<header class="kopf unter"><button class="zurueck" data-aktion="' + aktion + '">' + ICON.zurueck + 'Zurück</button><h1 class="seitentitel">' + titel + '</h1>' + (info ? infoKnopf : '') + '</header>';

// Info-Blatt: die Regeln für Sensoren (Prüfungen in dieser Datei und in der Datenbank,
// abgeglichen mit ruuvi-haccp/PLAN-STAMMDATEN.md Abschnitte 4, 5, 6.2 und 9)
export function infoBlatt() {
  return '<div class="blatt-grund" data-aktion="blatt-zu"><div class="blatt regeln" role="dialog" aria-label="Regeln für Sensoren"><h2>Regeln für Sensoren</h2>' +
    '<h3>Grundsätze</h3><ul>' +
    '<li><b>Nichts wird gelöscht.</b> Ein Sensor wird nur ausgemustert. Sein Verlauf bleibt erhalten.</li>' +
    '<li><b>Die MAC-Adresse ist der Sensor.</b> Sie lässt sich nach dem Anlegen nicht ändern. Ein anderer Sensor, auch ein Ersatz, ist immer ein neuer Eintrag.</li>' +
    '<li><b>Ein Name nur einmal im Einsatz.</b> Zwei aktive Sensoren dürfen nicht gleich heißen (höchstens 40 Zeichen).</li></ul>' +
    '<h3>Sensor ersetzen (z. B. defekt)</h3><ol>' +
    '<li>Den alten Sensor öffnen, <b>„Im Einsatz“ ausschalten</b>, speichern. Erst dann ist sein Name wieder frei.</li>' +
    '<li><b>Neuer Sensor</b> mit der neuen MAC-Adresse anlegen. Name, Standort, Grenze und Zeiten vom alten übernehmen.</li>' +
    '<li>Die Karte steht zuerst auf „Meldet nicht · noch kein Wert“. Werte kommen, sobald der Pi den neuen Sensor übernommen hat (spätestens ' + PI_TAKT_MIN + ' Minuten nach dem Speichern, dann die nächste Messrunde).</li>' +
    '<li>Der alte Verlauf bleibt beim ausgemusterten Sensor, der neue Verlauf beginnt bei null. Beide sind nicht zusammengelegt.</li></ol>' +
    '<h3>Neuen Sensor hinzufügen</h3><ul>' +
    '<li>MAC-Adresse bereithalten (AA:BB:CC:DD:EE:FF, auch ohne Doppelpunkte möglich).</li>' +
    '<li>Standort = Überschrift der Gruppe. Neue Standorte unter „Standorte“ anlegen, dann beim Sensor auswählen. Ein Wagen heißt so wie sein Standort. Bei Wagen „Meldet nicht nach“ auf mindestens ' + WAGEN_AB_MIN + ' Minuten lassen, sonst zählt der Standort nicht als Wagen („unterwegs“).</li></ul>' +
    '<h3>Sensor wegnehmen (nicht ersetzt)</h3><ul><li>„Im Einsatz“ ausschalten. Die Karte verschwindet, der Verlauf bleibt, der Pi zeichnet ihn nicht mehr auf. Wieder einschalten geht, solange der Name frei ist.</li></ul>' +
    '<h3>Gut zu wissen</h3><ul>' +
    '<li>Änderungen gelten in der Anzeige sofort. Der Raspberry Pi übernimmt sie spätestens nach ' + PI_TAKT_MIN + ' Minuten. Ein neuer Sensor bekommt erst danach Werte.</li>' +
    '<li>Unter „Änderungen“ steht, wer wann was geändert hat.</li></ul>' +
    '<button class="primaer" data-aktion="info-zu">Verstanden</button></div></div>';
}

function zeileSensor(s) {
  const teile = [s.standort || 'ohne Standort', s.grenze === null ? 'keine Grenze' : 'Grenze ' + grenzText(s.grenze), 'Offline ab ' + dauer(s.grauMin), 'Meldet nicht ab ' + dauer(s.rotMin)];
  const gewaehlt = Z.layout.breit && A.form && !A.form.neu && A.form.mac === s.mac;
  return '<button class="blatt-zeile admin-zeile' + (s.aktiv ? '' : ' aus') + (gewaehlt ? ' gewaehlt' : '') + '"' + (gewaehlt ? ' aria-current="true"' : '') + ' data-aktion="admin-sensor" data-mac="' + esc(s.mac) + '">' +
    '<span class="n">' + esc(s.name) + '<span class="z">' + esc(teile.join(' · ')) + '</span></span>' + ICON.weiter + '</button>';
}

const FELDER = { name: 'Name', standort: 'Standort', reihenfolge: 'Reihenfolge', temp_max: 'Grenze', grau_nach_minuten: 'Offline ab', rot_nach_minuten: 'Meldet nicht ab', aktiv: 'Status', notiz: 'Notiz' };
function wertText(k, v) {
  if (v === null || v === undefined || v === '') return '–';
  if (k === 'temp_max') return grenzText(Number(v));
  if (k === 'grau_nach_minuten' || k === 'rot_nach_minuten') return dauer(Number(v));
  if (k === 'aktiv') return v ? 'im Einsatz' : 'ausgemustert';
  return String(v);
}
function protokollZeile(e) {
  const name = (e.neu && e.neu.name) || e.mac;
  let was;
  if (e.aktion === 'INSERT') was = 'angelegt';
  else {
    was = Object.keys(FELDER).filter((k) => JSON.stringify(e.alt && e.alt[k]) !== JSON.stringify(e.neu && e.neu[k]))
      .map((k) => FELDER[k] + ' ' + wertText(k, e.alt[k]) + ' → ' + wertText(k, e.neu[k])).join(' · ') || 'gespeichert';
  }
  return '<div class="abweichung protokoll"><span class="zeit">' + wann(Date.parse(e.zeit), Date.now()) + '</span><span class="info"><b>' + esc(name) + '</b> · ' + esc(was) + '<br>' + esc(e.wer) + '</span></div>';
}

function angemeldetHtml() {
  return '<section class="abschnitt"><div class="angemeldet"><span>Angemeldet als <b>' + esc(A.email) + '</b></span>' +
    (A.abmeldenFragen
      ? '<span class="abmelden-frage">Wirklich abmelden?</span><button class="knopf-2" data-aktion="admin-abmelden-nein">Abbrechen</button><button class="knopf-2 rot" data-aktion="admin-abmelden-ja">Abmelden</button>'
      : '<button class="knopf-2" data-aktion="admin-abmelden">Abmelden</button>') +
    '</div></section>';
}
export function abmeldenFragen(ja) { A.abmeldenFragen = ja; neuZeichnen(); }

function protokollHtml() {
  return '<section class="abschnitt"><h2>Änderungen</h2>' +
    (A.protokollFehler ? '<p class="fehler-text">' + esc(A.protokollFehler) + '</p>'
      : !A.protokoll ? '<div class="leer klein"><span class="dreher" aria-hidden="true"></span> Lädt …</div>'
        : A.protokoll.length ? A.protokoll.map(protokollZeile).join('')
          : '<div class="leer klein">Keine Einträge sichtbar. Ist das Konto als Admin freigegeben?</div>') +
    '</section>';
}

// Große Bildschirme (ab 1200 px): links die Sensoren, in der Mitte der gewählte Sensor zum Bearbeiten,
// rechts bzw. darunter die Änderungen. Kein Seitenwechsel beim Bearbeiten.
function adminBreit(aktiv, aus) {
  const liste = '<div class="ab-spalte ab-liste">' +
    angemeldetHtml() +
    '<section class="abschnitt"><h2>Im Einsatz · ' + aktiv.length + '</h2><div class="admin-liste">' + (aktiv.map(zeileSensor).join('') || '<div class="leer klein">Keine Sensoren im Einsatz.</div>') + '</div>' +
    '<button class="primaer neu-knopf" data-aktion="admin-neu">' + ICON.plus + 'Neuer Sensor</button></section>' +
    standorteHtml() +
    (aus.length ? '<section class="abschnitt"><h2>Ausgemustert · ' + aus.length + '</h2><p class="erklaerung">Keine Kachel mehr, der Verlauf bleibt erhalten.</p><div class="admin-liste">' + aus.map(zeileSensor).join('') + '</div></section>' : '') +
    '</div>';
  const mitte = '<div class="ab-spalte ab-form">' +
    (A.meldung ? '<div class="meldung ' + A.meldung.art + '">' + esc(A.meldung.text) + '</div>' : '') +
    (A.form ? formularHtml(A.form, true)
      : '<div class="ab-leer"><b>Sensor wählen</b><span>Links einen Sensor antippen, um Name, Standort, Grenze und Zeiten zu ändern – oder „Neuer Sensor“.</span></div>') +
    '</div>';
  return '<main class="admin-breit">' + liste + mitte + '<div class="ab-spalte ab-protokoll">' + protokollHtml() + '</div></main>';
}

export function adminSeite() {
  let html = kopf('Sensoren verwalten', 'zurueck', true) + '<main class="einstellungen">';
  if (A.fehler && !A.bereit) return html + '<div class="leer zustand fehler">' + esc(A.fehler) + '<button class="knopf-2" data-aktion="admin-oeffnen">Nochmal versuchen</button></div></main>';
  if (!A.bereit) return html + '<div class="leer zustand"><span class="dreher" aria-hidden="true"></span> Lädt …</div></main>';
  if (!A.email) {
    return html + '<section class="abschnitt"><h2>Anmelden</h2>' +
      '<p class="erklaerung">Nur für den Admin. Ohne Anmeldung zeigt die App die Werte nur an.</p>' +
      '<form id="login-form" class="formular" novalidate>' +
      '<div class="feld"><label for="l-mail">E-Mail</label><input id="l-mail" type="email" autocomplete="username" inputmode="email"></div>' +
      '<div class="feld"><label for="l-pw">Passwort</label><input id="l-pw" type="password" autocomplete="current-password"></div>' +
      (A.fehler ? '<p class="fehler-text" role="alert">' + esc(A.fehler) + '</p>' : '') +
      '<button type="submit" class="primaer"' + (A.laedt ? ' disabled' : '') + '>' + (A.laedt ? 'Melde an …' : 'Anmelden') + '</button></form></section></main>';
  }
  const aktiv = D.sensoren.filter((s) => s.aktiv), aus = D.sensoren.filter((s) => !s.aktiv);
  if (Z.layout.breit) return html.replace('<main class="einstellungen">', '') + adminBreit(aktiv, aus);
  html += (A.meldung ? '<div class="meldung ' + A.meldung.art + '">' + esc(A.meldung.text) + '</div>' : '') +
    angemeldetHtml() +
    '<section class="abschnitt"><h2>Im Einsatz</h2><div class="admin-liste">' + (aktiv.map(zeileSensor).join('') || '<div class="leer klein">Keine Sensoren im Einsatz.</div>') + '</div>' +
    '<button class="primaer neu-knopf" data-aktion="admin-neu">' + ICON.plus + 'Neuer Sensor</button></section>' +
    standorteHtml() +
    (aus.length ? '<section class="abschnitt"><h2>Ausgemustert</h2><p class="erklaerung">Keine Kachel mehr, der Verlauf bleibt erhalten.</p><div class="admin-liste">' + aus.map(zeileSensor).join('') + '</div></section>' : '') +
    protokollHtml() + '</main>';
  return html;
}

export function adminSensorSeite() {
  const f = A.form;
  if (!f || Z.layout.breit) { Z.seite = 'admin'; return adminSeite(); }
  return kopf(f.neu ? 'Neuer Sensor' : esc(f.name), 'admin-zurueck', true) + '<main class="einstellungen">' + formularHtml(f, false) + '</main>';
}

function formularHtml(f, breit) {
  const liste = standorte();
  if (f.standort && !liste.includes(f.standort)) liste.push(f.standort);
  const feld = (id, label, wert, extra, hilfe) => '<div class="feld"><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + esc(wert) + '" ' + (extra || '') + '>' + (hilfe ? '<span class="hilfe">' + hilfe + '</span>' : '') + '</div>';
  return '<form id="sensor-form" class="formular' + (breit ? ' breit' : '') + '" novalidate>' +
    (breit ? '<h2 class="form-titel">' + (f.neu ? 'Neuer Sensor' : esc(f.name)) + '</h2>' : '') +
    '<section class="abschnitt"><h2>Sensor</h2>' +
    (f.neu ? feld('s-mac', 'MAC-Adresse', f.mac, 'autocomplete="off" spellcheck="false" placeholder="AA:BB:CC:DD:EE:FF" autocapitalize="characters"', 'Lässt sich nach dem Anlegen nicht mehr ändern. Neuer Tag = neuer Sensor.')
      : '<div class="info-zeile"><b>MAC-Adresse</b><span>' + esc(f.mac) + '</span></div>') +
    feld('s-name', 'Name', f.name, 'maxlength="40" autocomplete="off"', 'Höchstens 40 Zeichen. Zwei Sensoren im Einsatz dürfen nicht gleich heißen.') +
    '<div class="feld"><label for="s-standort">Standort</label><select id="s-standort"><option value="">Ohne Standort</option>' +
    liste.map((s) => '<option value="' + esc(s) + '"' + (s === f.standort ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select>' +
    '<span class="hilfe">Überschrift der Gruppe. Neue Standorte unter „Standorte“ in der Liste anlegen.</span></div>' +
    '</section>' +
    '<section class="abschnitt"><h2>Bewertung</h2>' +
    feld('s-grenze', 'Grenze (höchste Temperatur, °C)', f.grenze, 'inputmode="decimal" autocomplete="off"', 'Darüber ist der Wert zu warm. Leer lassen = keine Grenze.') +
    feld('s-grau', 'Offline nach (Minuten)', f.grau, 'inputmode="numeric"', 'Graue Karte. Normal, z. B. wenn der Wagen unterwegs ist.') +
    feld('s-rot', 'Meldet nicht nach (Minuten)', f.rot, 'inputmode="numeric"', 'Rote Karte, Sensor prüfen. 480 = 8 Std. Ab ' + WAGEN_AB_MIN + ' Min bei allen Sensoren eines Standorts gilt er als Wagen („unterwegs“).') +
    '</section>' +
    '<section class="abschnitt"><h2>Einsatz</h2>' +
    '<div class="schalter-zeile"><div class="schalter-text"><strong>Im Einsatz</strong><span>Aus = ausgemustert: keine Kachel mehr, der Verlauf bleibt. Sensoren werden nie gelöscht.</span></div>' +
    '<button type="button" class="kipp' + (f.aktiv ? ' an' : '') + '" id="s-aktiv" role="switch" aria-checked="' + (f.aktiv ? 'true' : 'false') + '" aria-label="Im Einsatz" data-aktion="admin-kipp"></button></div>' +
    '<div class="feld"><label for="s-notiz">Notiz</label><textarea id="s-notiz" rows="3">' + esc(f.notiz) + '</textarea></div>' +
    '</section>' +
    (A.formFehler ? '<p class="meldung fehler" role="alert">' + esc(A.formFehler) + '</p>' : '') +
    '<div class="form-knoepfe"><button type="submit" class="primaer"' + (A.speichert ? ' disabled' : '') + '>' + (A.speichert ? 'Speichert …' : 'Speichern') + '</button>' +
    (breit ? '<button type="button" class="knopf-2" data-aktion="admin-zurueck">Schließen</button>' : '') + '</div>' +
    '</form>';
}

// Werte aus dem Formular lesen (vor jedem Neuzeichnen, damit nichts verloren geht)
export function formLesen() {
  const w = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
  const kipp = document.getElementById('s-aktiv');
  const r = { mac: w('s-mac'), name: w('s-name'), standort: w('s-standort'), reihenfolge: w('s-reihenfolge'), grenze: w('s-grenze'), grau: w('s-grau'), rot: w('s-rot'), notiz: w('s-notiz'), aktiv: kipp ? kipp.classList.contains('an') : undefined };
  for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
  return r;
}

export function zurueckZurListe() { A.form = null; A.formFehler = null; Z.seite = 'admin'; neuZeichnen(); }
export function meldungWeg() { A.meldung = null; }

// Einstellungen (pro Gerät) und Einrichtung (Projekt-URL + anon-Key).

import { ICON } from '../icons.js';
import { Z, esc } from '../zustand.js';
import { D, aktive } from '../daten.js';
import { REGEL, WORT } from '../status.js';
import { dauer, datumLang, uhr } from '../zeit.js';
import { konfig, verbrauch } from '../rest.js';
import { APP_VERSION } from '../version.js';
import { adminAngemeldet } from './admin-status.js';
import { bluetoothDa } from '../bluetooth.js';

function spanneText(werte) {
  const u = [...new Set(werte)].sort((a, b) => a - b);
  if (!u.length) return '';
  if (u.length === 1) return dauer(u[0]);
  const a = dauer(u[0]), b = dauer(u[u.length - 1]);
  const einheit = (x) => x.replace(/^[\d ]+/, '');
  return (einheit(a) === einheit(b) ? a.replace(/ .*$/, '') : a) + ' bis ' + b + ' (je nach Sensor)';
}

export function mb(bytes) {
  const m = bytes / 1048576;
  return (m < 0.1 ? m.toFixed(2) : m < 10 ? m.toFixed(1) : Math.round(m)).toString().replace('.', ',') + ' MB';
}

export function einstellungen() {
  const chip = (st) => '<span class="status-chip ' + st + '">' + WORT[st] + '</span>';
  const ss = aktive();
  const grau = spanneText(ss.map((s) => s.grauMin)) || '15 Min';
  const rot = spanneText(ss.map((s) => s.rotMin)) || '8 Std';
  const k = konfig();
  const projekt = k ? k.url.replace(/^https?:\/\//, '').replace(/\.supabase\.co$/, '') : '–';
  const admin = adminAngemeldet();
  return '<header class="kopf unter"><button class="zurueck" data-aktion="zurueck">' + ICON.zurueck + 'Zurück</button><h1 class="seitentitel">Einstellungen</h1></header>' +
    '<main class="einstellungen">' +
    (Z.meldung ? '<div class="meldung ' + Z.meldung.art + '">' + esc(Z.meldung.text) + '</div>' : '') +
    '<section class="abschnitt"><h2>Anzeige auf diesem Gerät</h2>' +
    (bluetoothDa()
      ? '<div class="schalter-zeile"><div class="schalter-text"><strong>Gerät gehört zu</strong><span>Nur bei diesem Wagen erscheint „Am Wagen auslesen“. Laptop und Büro-PC: keinem Wagen.</span></div><button class="auswahl" data-aktion="blatt-wagen">' + ICON.wagen + '<span>' + esc(Z.wagen || 'keinem Wagen') + '</span>' + ICON.runter + '</button></div>'
      : '<div class="schalter-zeile"><div class="schalter-text"><strong>Am Wagen auslesen</strong><span>Geht auf diesem Gerät nicht – Bluetooth gibt es nur in Chrome (Android-Tablet, Windows, Mac), nicht auf iPhone/iPad.</span></div></div>') +
    '<div class="schalter-zeile"><div class="schalter-text"><strong>Ausschnitt im Diagramm markieren</strong><span>Im Diagramm ziehen und den Bereich vergrößern. Nur für Laptop und Computer – auf Handy und Tablet stört es beim Wischen.</span></div>' +
    '<button type="button" class="kipp' + (Z.ausschnitt ? ' an' : '') + '" role="switch" aria-checked="' + (Z.ausschnitt ? 'true' : 'false') + '" aria-label="Ausschnitt im Diagramm markieren" data-aktion="ausschnitt-schalter"></button></div>' +
    '<div class="schalter-zeile"><div class="schalter-text"><strong>Startansicht</strong><span>Welcher Standort beim Öffnen gezeigt wird</span></div><button class="auswahl" data-aktion="blatt-start">' + ICON.pin + '<span>' + esc(Z.start || 'Alle') + '</span>' + ICON.runter + '</button></div>' +
    '</section>' +
    '<section class="abschnitt"><h2>So wird bewertet</h2>' +
    '<div class="regel">' + chip('ok') + '<span class="t">unter der Grenztemperatur des Sensors</span></div>' +
    '<div class="regel">' + chip('achtung') + '<span class="t">über der Grenze, aber höchstens ' + REGEL.toleranzMin + ' Min – z. B. Tür kurz offen</span></div>' +
    '<div class="regel">' + chip('alarm') + '<span class="t">länger als ' + REGEL.toleranzMin + ' Min über der Grenze oder mehr als ' + REGEL.sofortUeberGrenze + ' °C darüber</span></div>' +
    '<div class="regel">' + chip('offline') + '<span class="t">seit ' + grau + ' kein Wert – normal, wenn der Wagen unterwegs ist</span></div>' +
    '<div class="regel">' + chip('meldet') + '<span class="t">seit ' + rot + ' kein Wert – Sensor prüfen</span></div>' +
    '</section>' +
    '<section class="abschnitt"><h2>Admin-Bereich</h2>' +
    '<div class="schalter-zeile"><div class="schalter-text"><strong>Sensoren verwalten</strong><span>' +
    (admin ? 'Angemeldet als ' + esc(admin) : 'Namen, Grenzen, Offline-Zeiten, neue Sensoren · Anmeldung nötig') +
    '</span></div><button class="auswahl" data-aktion="admin">' + ICON.schloss + '<span>Öffnen</span></button></div>' +
    '</section>' +
    '<section class="abschnitt"><h2>Info</h2>' +
    '<div class="info-zeile"><b>Daten</b><span>alle 5 Minuten, nur lesen</span></div>' +
    '<div class="info-zeile"><b>Zuletzt geladen</b><span>' + (D.stand ? uhr(D.stand) + ' Uhr' : '–') + '</span></div>' +
    '<div class="info-zeile"><b>Aufzeichnung</b><span>' + (D.seit ? 'seit ' + datumLang(D.seit) : '–') + '</span></div>' +
    '<div class="info-zeile"><b>Daten diesen Monat</b><span>ca. ' + mb(verbrauch()) + '</span></div>' +
    '<div class="info-zeile"><b>Version</b><span>' + APP_VERSION + '</span></div>' +
    '<div class="info-zeile"><b>Verbindung</b><span>Projekt ' + esc(projekt) + '</span></div>' +
    '<div class="knopf-reihe"><button class="knopf-2" data-aktion="link-kopieren">Einrichtungslink kopieren</button><button class="knopf-2" data-aktion="einrichtung">Einrichtung ändern</button></div>' +
    '</section></main>';
}

// ---------- Einrichtung ----------
export function einrichtung(f) {
  const k = konfig();
  const zurueck = k ? '<button class="zurueck" data-aktion="zurueck">' + ICON.zurueck + 'Zurück</button>' : '';
  return '<header class="kopf unter">' + zurueck + '<h1 class="seitentitel">Einrichtung</h1></header>' +
    '<main class="einstellungen"><section class="abschnitt"><h2>Verbindung zu Supabase</h2>' +
    '<p class="erklaerung">Einmal pro Gerät eintragen. Die App liest damit nur, sie kann nichts ändern.</p>' +
    '<form id="einrichtung-form" class="formular" novalidate>' +
    '<div class="feld"><label for="e-url">Projekt-URL</label><input id="e-url" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://xxxx.supabase.co" value="' + esc(f && f.url !== undefined ? f.url : k ? k.url : '') + '"></div>' +
    '<div class="feld"><label for="e-key">Schlüssel (Publishable key oder anon key)</label><input id="e-key" type="text" autocomplete="off" spellcheck="false" placeholder="sb_publishable_…" value="' + esc(f && f.key !== undefined ? f.key : k ? k.key : '') + '"></div>' +
    '<p class="hinweis-text">Zu finden in Supabase unter Project Settings → API Keys. Nie den „secret“- oder „service_role“-Schlüssel nehmen.</p>' +
    (f && f.fehler ? '<p class="fehler-text" role="alert">' + esc(f.fehler) + '</p>' : '') +
    '<button type="submit" class="primaer"' + (f && f.laeuft ? ' disabled' : '') + '>' + (f && f.laeuft ? 'Prüfe …' : 'Verbinden') + '</button>' +
    '</form></section></main>';
}

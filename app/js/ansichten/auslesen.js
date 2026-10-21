// „Am Wagen auslesen“: holt die fehlenden Werte des eigenen Wagens per Bluetooth
// direkt aus den Sensoren. Werte liegen NUR im Arbeitsspeicher (D.tablet):
// Verwerfen, Neuladen oder Schließen der App löscht sie. Supabase und der Pi
// bleiben unberührt; der Pi trägt die echten Werte nach der Rückkehr wie bisher nach.
//
// Wann erscheint der Knopf? Nur wenn ALLES zutrifft:
//  1. der Browser kann Bluetooth (Chrome/Edge – auf iPhone/iPad nie),
//  2. in den Einstellungen dieses Geräts steht „Tablet gehört zu: <Wagen>“
//     (Laptop/Monitor/Büro-PC: bleibt „keinem Wagen“, dort also nie),
//  3. die Gruppe ist dieser Wagen und
//  4. seine Sensoren sind offline/melden nicht – oder es wurde schon ausgelesen.

import { ICON } from '../icons.js';
import { Z, esc, gruppeVon } from '../zustand.js';
import { D, aktive, bezug, tabletSetzen } from '../daten.js';
import { bluetoothDa, gemerkteGeraete, koppeln, leseSensor } from '../bluetooth.js';
import { STD, uhr, wann } from '../zeit.js';
import { statusVon } from './uebersicht.js';

export const A = { gruppe: null, laeuft: false, zeilen: [] };   // Zustand des Blatts
let neuZeichnen = () => {};
export function beiAuslesen(f) { neuZeichnen = f; }

const sensorenVon = (gruppe) => aktive().filter((s) => gruppeVon(s) === gruppe);
export const knopfMoeglich = () => bluetoothDa() && !!Z.wagen;

export function knopfAuslesen(gruppe) {
  if (!knopfMoeglich() || gruppe !== Z.wagen) return '';
  const ss = sensorenVon(gruppe);
  if (!ss.length) return '';
  const fehlt = ss.filter((s) => ['offline', 'meldet'].includes(statusVon(s).stufe));
  const gelesen = ss.some((s) => D.tablet.has(s.mac));
  if (!fehlt.length && !gelesen) return '';
  let unter;
  if (gelesen) unter = 'zuletzt ausgelesen ' + uhr(D.tabletUm);
  else {
    const seit = Math.min(...fehlt.map((s) => (statusVon(s).last || { t: bezug() }).t));
    unter = 'per Bluetooth · fehlende Werte seit ' + wann(seit, bezug());
  }
  return '<button class="auslesen" data-aktion="auslesen" data-gruppe="' + esc(gruppe) + '">' + ICON.bluetooth +
    '<span class="t"><strong>' + (gelesen ? 'Nochmal auslesen' : 'Am Wagen auslesen') + '</strong><span class="u">' + unter + '</span></span></button>';
}

// Ab wann lesen: letzter Wert aus Supabase, höchstens 24 Std zurück
function seitVon(mac) {
  const p = D.punkte.get(mac) || [], l = D.letzter.get(mac);
  const t = Math.max(p.length ? p[p.length - 1].t : 0, l ? l.t : 0);
  return Math.max(t, Date.now() - 24 * STD);
}

async function lies(z, device) {
  z.device = device; z.fehler = null;
  try {
    const werte = await leseSensor(device, seitVon(z.mac), (zustand, n) => { z.zustand = zustand; z.n = n; neuZeichnen(); });
    tabletSetzen(z.mac, werte);
    z.zustand = 'fertig'; z.n = werte.length;
  } catch (e) {
    z.zustand = 'fehler'; z.fehler = e && e.message;
  }
  neuZeichnen();
}

export async function starte(gruppe, nurFehler) {
  if (A.laeuft) return;
  const alt = A.gruppe === gruppe ? A.zeilen : [];
  A.gruppe = gruppe; A.laeuft = true;
  A.zeilen = sensorenVon(gruppe).map((s) => {
    const a = alt.find((z) => z.mac === s.mac);
    return nurFehler && a && a.zustand === 'fertig' ? a : { mac: s.mac, name: s.name, zustand: 'wartet', n: 0, device: a && a.device };
  });
  Z.blatt = 'auslesen'; neuZeichnen();
  const gemerkt = await gemerkteGeraete(A.zeilen.map((z) => z.mac));
  for (const z of A.zeilen) {          // nacheinander – Bluetooth mag keine parallelen Verbindungen
    if (z.zustand !== 'wartet') continue;
    const dev = z.device || gemerkt.get(z.mac);
    if (!dev) { z.zustand = 'koppeln'; continue; }
    await lies(z, dev);
  }
  A.laeuft = false; neuZeichnen();
}

// Erstes Mal: Chrome fragt einmal pro Sensor nach (Auswahlfenster). Muss aus dem Tipp kommen.
export async function koppelnUndLesen(mac) {
  const z = A.zeilen.find((x) => x.mac === mac);
  if (!z || A.laeuft) return;
  let dev;
  try { dev = await koppeln(mac); } catch (e) { z.fehler = 'Auswahl abgebrochen'; neuZeichnen(); return; }
  A.laeuft = true;
  await lies(z, dev);
  A.laeuft = false; neuZeichnen();
}

export function schliessen() { A.gruppe = null; A.zeilen = []; A.laeuft = false; }

export function blattAuslesen() {
  const text = {
    wartet: () => 'wartet', verbinde: () => 'verbinde …', lade: (z) => 'lade Werte … ' + z.n,
    fertig: (z) => 'fertig · ' + z.n + ' Werte', fehler: () => 'nicht erreichbar', koppeln: (z) => z.fehler || 'einmal koppeln',
  };
  const fehler = A.zeilen.filter((z) => z.zustand === 'fehler').length;
  const koppelnOffen = A.zeilen.some((z) => z.zustand === 'koppeln');
  const zeile = (z) => '<div class="ausles-zeile ' + (z.zustand === 'verbinde' || z.zustand === 'lade' ? 'laeuft' : z.zustand) + '"><span class="n">' + esc(z.name) + '</span><span class="z">' + text[z.zustand](z) + '</span>' +
    (z.zustand === 'koppeln' && !A.laeuft ? '<button class="knopf-2 inline" data-aktion="auslesen-koppeln" data-mac="' + esc(z.mac) + '">Koppeln</button>' : '') + '</div>';
  let unten;
  if (A.laeuft) unten = '<p class="erklaerung">Gerät in der Nähe des Wagens lassen. Dauert etwa 30 Sekunden pro Sensor.</p>';
  else {
    unten = '';
    if (koppelnOffen) unten += '<p class="erklaerung">Beim ersten Mal fragt Chrome je Sensor einmal nach: „Koppeln“ tippen und den angezeigten Sensor wählen.</p>';
    if (fehler) unten += '<p class="erklaerung">' + (fehler === 1 ? 'Ein Sensor war' : fehler + ' Sensoren waren') + ' nicht erreichbar. Näher an den Wagen gehen und nochmal versuchen.</p><button class="knopf-2" data-aktion="auslesen-nochmal">Nochmal versuchen</button>';
    if (!fehler && !koppelnOffen) unten += '<p class="erklaerung">Die Werte stehen jetzt in der Übersicht – nur auf diesem Gerät und nur bis die App geschlossen wird.</p>';
    unten += '<button class="primaer" data-aktion="auslesen-fertig">Fertig</button>';
  }
  return '<div class="blatt-grund"' + (A.laeuft ? '' : ' data-aktion="blatt-zu"') + '><div class="blatt" role="dialog" aria-label="Am Wagen auslesen"><h2>Am Wagen auslesen · ' + esc(A.gruppe) + '</h2>' +
    '<div class="ausles-liste">' + A.zeilen.map(zeile).join('') + '</div>' + unten + '</div></div>';
}

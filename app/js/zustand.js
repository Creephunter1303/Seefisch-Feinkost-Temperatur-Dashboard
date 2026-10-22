// Zustand der Oberfläche (was gerade angezeigt wird) und kleine Helfer.
import { merk } from './speicher.js';

export const Z = {
  seite: 'uebersicht',     // uebersicht | detail | einstellungen | einrichtung | admin | admin-sensor
  sensor: null,            // MAC in der Detailansicht
  zeitraum: '6h',
  eigen: null,             // { von: 'YYYY-MM-DD', bis: 'YYYY-MM-DD' }
  ausschnitt: merk.lies('ausschnitt', false),   // Ausschnitt im Diagramm ziehen – Standard AUS (stört das Wischen auf dem Handy)
  auswahl: null,           // { von, bis } in ms – im Diagramm gezogener Ausschnitt (zeitraum 'auswahl')
  vorAuswahl: null,        // { zeitraum, eigen } – wohin „Ganzer Zeitraum“ zurückführt
  alarmArt: merk.lies('alarm-art', 'genau'),   // 'genau' (15-Min-Regel) | 'stunde' (Stundenmittel wie im HACCP-Export)
  markiert: null,          // { mac, von, bis, stufe } – angeklickte Zeile „Über … °C“, im Diagramm markiert
  zeitraumFehler: null,
  filter: null,            // gewählter Standort (null = alle)
  blatt: null,             // filter | start | wagen | zeitraum | auslesen
  start: merk.lies('start', null),     // Startansicht dieses Geräts
  wagen: merk.lies('wagen', null),     // „Tablet gehört zu“: nur dort erscheint „Am Wagen auslesen“
  verlauf: null,           // { key, punkte, laedt, fehler, n }
  meldung: null,           // kurze Rückmeldung oben auf einer Seite
  layout: { schmal: false, quer: false, breit: false, breite: 0 },
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const OHNE_ZUORDNUNG = 'Ohne Zuordnung';
export const gruppeVon = (s) => s.standort || OHNE_ZUORDNUNG;

// Ein Standort gilt als Wagen, wenn seine Sensoren stundenlang offline sein
// dürfen („Meldet nicht“ frühestens nach 4 Std). Genau das ist ein Wagen auf
// Tour; feste Kühlräume bekommen eine kurze Schwelle. Eingestellt wird das im
// Admin-Bereich je Sensor. (Eine eigene Spalte „art“ gibt es in sensoren nicht.)
export const WAGEN_AB_MIN = 240;
export const istWagen = (sensoren) => sensoren.length > 0 && sensoren.every((s) => s.rotMin >= WAGEN_AB_MIN);

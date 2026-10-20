// Statusregel (VORLAGE.md Abschnitt 2). Die EINE Stelle im Code, an der
// bewertet wird. Reine Funktionen ohne DOM – getestet in tests/status.test.mjs.
//
// Messpunkte: Array von { t: Millisekunden (UTC), v: °C }, aufsteigend nach t.
// Sensor:     { grenze: Zahl oder null, grauMin, rotMin } aus der Tabelle sensoren
//             (temp_max, grau_nach_minuten, rot_nach_minuten).

import { MIN, gleicherTag, wann, dauer } from './zeit.js';

export const REGEL = {
  toleranzMin: 15,        // Alarm, wenn länger als 15 Min über der Grenze …
  sofortUeberGrenze: 3,   // … oder mehr als 3 °C darüber
  lueckeMin: 10,          // eine Strecke endet bei einer Lücke von mehr als 10 Min
  rasterMin: 5,           // jeder Messwert steht für 5 Minuten
};

export const WORT = { ok: 'OK', achtung: 'Achtung', alarm: 'Alarm', offline: 'Offline', meldet: 'Meldet nicht', ohne: 'Keine Grenze' };
export const RANG = { alarm: 0, meldet: 1, achtung: 2, ok: 3, ohne: 3, offline: 4 };

const runde2 = (x) => Math.round(x * 100) / 100;

// Grenze für die Anzeige: „7 °C“, „−18 °C“, „6,5 °C“
export function grenzText(g) {
  const s = Number.isInteger(g) ? String(Math.abs(g)) : Math.abs(g).toFixed(1).replace('.', ',');
  return (g < 0 ? '−' : '') + s + '\u00a0°C';
}
export const zahl = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',');
export const grad = (v) => zahl(v) + '\u00a0°C';   // geschütztes Leerzeichen: „7 °C“ bricht nie um

// Zusammenhängende Strecken über der Grenze.
// Eine Strecke endet, sobald ein Wert ≤ Grenze kommt oder eine Lücke > 10 Min entsteht.
// Dauer = erster bis letzter Wert + 5 Min (jeder Wert steht für ein 5-Minuten-Fenster).
export function laeufe(punkte, grenze) {
  const out = [];
  if (grenze === null || grenze === undefined) return out;
  let akt = null, vor = null;
  for (const p of punkte) {
    const luecke = vor && (p.t - vor.t) > REGEL.lueckeMin * MIN;
    if (akt && (p.v <= grenze || luecke)) { out.push(akt); akt = null; }
    if (p.v > grenze) {
      if (!akt) akt = { von: p.t, bis: p.t, max: p.v };
      akt.bis = p.t;
      if (p.v > akt.max) akt.max = p.v;
    }
    vor = p;
  }
  if (akt) out.push(akt);
  for (const l of out) l.min = (l.bis - l.von) / MIN + REGEL.rasterMin;
  return out;
}

export function stufeVon(lauf, grenze) {
  const zuLang = lauf.min > REGEL.toleranzMin;
  const zuWarm = lauf.max > runde2(grenze + REGEL.sofortUeberGrenze);
  return zuLang || zuWarm ? 'alarm' : 'achtung';
}

// Status eines Sensors zum Zeitpunkt bezug (jetzt, oder der Datenstand ohne Netz).
// punkte: die geladenen Werte (z. B. heute / letzte 6 Std). letzter: letzter
// bekannter Wert überhaupt, falls punkte leer sind (lange stiller Sensor).
// datenAb: ab wann Werte geladen sind. Beginnt die Strecke dort, kann sie
// länger sein – dann heißt es „seit mind. …“.
export function status(sensor, punkte, bezug, letzter, datenAb) {
  const last = punkte.length ? punkte[punkte.length - 1] : (letzter || null);
  if (!last) return { stufe: 'meldet', text: 'Meldet nicht · noch kein Wert', last: null };
  const alter = (bezug - last.t) / MIN;
  if (alter >= sensor.rotMin) return { stufe: 'meldet', text: 'Meldet nicht · seit ' + wann(last.t, bezug), last };
  if (alter >= sensor.grauMin) return { stufe: 'offline', text: 'Offline · letzter Wert ' + wann(last.t, bezug), last };
  const g = sensor.grenze;
  if (g === null || g === undefined) return { stufe: 'ohne', text: 'keine Grenze hinterlegt', last };
  if (last.v > g) {
    const l = laeufe(punkte.length ? punkte : [last], g).pop();
    const st = stufeVon(l, g);
    const seit = Math.max(REGEL.rasterMin, (bezug - l.von) / MIN);
    const offen = datenAb !== undefined && l.von - datenAb <= REGEL.lueckeMin * MIN;
    return { stufe: st, text: WORT[st] + ' · seit ' + (offen ? 'mind. ' : '') + dauer(seit) + ' über ' + grenzText(g), last, lauf: l };
  }
  return { stufe: 'ok', text: 'OK', last };
}

// Eine heute schon VORBEIE Alarm-Strecke → Hinweiszeile auf der Karte
// („Heute 11:00–11:25 über 7 °C · max 9,3 °C“). Die laufende Strecke zählt nicht.
export function heuteAlarm(sensor, punkte, bezug) {
  if (sensor.grenze === null || sensor.grenze === undefined || !punkte.length) return null;
  const heute = punkte.filter((p) => gleicherTag(p.t, bezug));
  const letzte = punkte[punkte.length - 1];
  const fertig = laeufe(heute, sensor.grenze)
    .filter((l) => stufeVon(l, sensor.grenze) === 'alarm')
    .filter((l) => l.bis !== letzte.t);
  return fertig.pop() || null;
}

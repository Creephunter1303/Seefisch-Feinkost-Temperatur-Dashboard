// Tests für die Statusregel und die Zeitrechnung in Europe/Berlin.
// Ohne Framework. Läuft in Node:      node tests/status.test.mjs
// und im Browser (falls kein Node):  tests/index.html über einen lokalen Server öffnen

import { REGEL, laeufe, stufeVon, status, heuteAlarm, stundenLaeufe } from '../app/js/status.js';
import { versatzMin, mitternacht, tagKey, tagesBeginn, uhr, wann, bereich, teile, MIN, STD } from '../app/js/zeit.js';
import { tageswerte } from '../app/js/ansichten/detail.js';

const ergebnisse = [];
function test(name, f) {
  try { f(); ergebnisse.push({ name, ok: true }); }
  catch (e) { ergebnisse.push({ name, ok: false, fehler: e.message }); }
}
// geschütztes Leerzeichen vor °C wie ein normales vergleichen
const norm = (x) => JSON.stringify(x).replace(/\u00a0/g, ' ');
function gleich(ist, soll, was) {
  if (norm(ist) !== norm(soll)) throw new Error((was ? was + ': ' : '') + 'erwartet ' + JSON.stringify(soll) + ', bekommen ' + JSON.stringify(ist));
}

const T = (iso) => Date.parse(iso);                       // UTC-Zeitpunkt
const reihe = (startIso, werte) => werte.map((v, i) => ({ t: T(startIso) + i * 5 * MIN, v }));
const S7 = { grenze: 7, grauMin: 15, rotMin: 480 };
const S18 = { grenze: -18, grauMin: 15, rotMin: 60 };

// ---------- Strecke genau 15 Min ----------
test('genau 15 Min über der Grenze (3 Werte) = Achtung', () => {
  const p = reihe('2026-10-20T10:00:00Z', [6, 7.5, 7.5, 7.5]);
  const l = laeufe(p, 7);
  gleich(l.length, 1); gleich(l[0].min, 15, 'Dauer');
  gleich(stufeVon(l[0], 7), 'achtung');
  gleich(status(S7, p, T('2026-10-20T10:16:00Z')).stufe, 'achtung');
});
test('20 Min über der Grenze (4 Werte) = Alarm', () => {
  const p = reihe('2026-10-20T10:00:00Z', [6, 7.5, 7.5, 7.5, 7.5]);
  const st = status(S7, p, T('2026-10-20T10:21:00Z'));
  gleich(st.stufe, 'alarm');
  gleich(st.text, 'Alarm · seit 16 Min über 7 °C');
});
test('genau auf der Grenze (7,0) ist OK', () => {
  gleich(status(S7, reihe('2026-10-20T10:00:00Z', [7.0]), T('2026-10-20T10:01:00Z')).stufe, 'ok');
});

// ---------- Lücke > 10 Min ----------
test('Lücke über 10 Min trennt die Strecke', () => {
  const p = [...reihe('2026-10-20T10:00:00Z', [8, 8]), ...reihe('2026-10-20T10:20:00Z', [8, 8])];  // 10:05 → 10:20 = 15 Min Lücke
  const l = laeufe(p, 7);
  gleich(l.length, 2);
  gleich(l.map((x) => x.min), [10, 10]);
  gleich(status(S7, p, T('2026-10-20T10:26:00Z')).stufe, 'achtung', 'nur die letzte Strecke zählt');
});
test('Lücke von genau 10 Min trennt nicht', () => {
  const p = [...reihe('2026-10-20T10:00:00Z', [8, 8]), ...reihe('2026-10-20T10:15:00Z', [8, 8])];  // 10:05 → 10:15
  const l = laeufe(p, 7);
  gleich(l.length, 1); gleich(l[0].min, 25);
  gleich(stufeVon(l[0], 7), 'alarm');
});
test('ein Wert unter der Grenze beendet die Strecke', () => {
  const l = laeufe(reihe('2026-10-20T10:00:00Z', [8, 8, 6.9, 8]), 7);
  gleich(l.length, 2);
});

// ---------- Grenze + 3 °C ----------
test('genau Grenze + 3 °C ist noch Achtung', () => {
  gleich(status(S7, reihe('2026-10-20T10:00:00Z', [10.0]), T('2026-10-20T10:02:00Z')).stufe, 'achtung');
});
test('mehr als Grenze + 3 °C ist sofort Alarm', () => {
  gleich(status(S7, reihe('2026-10-20T10:00:00Z', [10.01]), T('2026-10-20T10:02:00Z')).stufe, 'alarm');
});
test('Grenze mit Nachkomma (6,3 + 3 = 9,3) ohne Rundungsfehler', () => {
  const s = { grenze: 6.3, grauMin: 15, rotMin: 480 };
  gleich(status(s, reihe('2026-10-20T10:00:00Z', [9.3]), T('2026-10-20T10:02:00Z')).stufe, 'achtung');
  gleich(status(s, reihe('2026-10-20T10:00:00Z', [9.31]), T('2026-10-20T10:02:00Z')).stufe, 'alarm');
});

// ---------- negative Grenze (−18 °C) ----------
test('−18 °C: −18,0 ist OK, −17,9 ist Achtung', () => {
  const b = T('2026-10-20T10:02:00Z');
  gleich(status(S18, reihe('2026-10-20T10:00:00Z', [-18.0]), b).stufe, 'ok');
  gleich(status(S18, reihe('2026-10-20T10:00:00Z', [-17.9]), b).stufe, 'achtung');
});
test('−18 °C: −15,0 ist Achtung, −14,9 ist Alarm', () => {
  const b = T('2026-10-20T10:02:00Z');
  gleich(status(S18, reihe('2026-10-20T10:00:00Z', [-15.0]), b).stufe, 'achtung');
  gleich(status(S18, reihe('2026-10-20T10:00:00Z', [-14.9]), b).stufe, 'alarm');
  gleich(status(S18, reihe('2026-10-20T10:00:00Z', [-14.9]), b).text, 'Alarm · seit 5 Min über −18 °C');
});

// ---------- Offline / Meldet nicht / keine Grenze ----------
test('Offline ab grau_nach_minuten, Meldet nicht ab rot_nach_minuten', () => {
  const p = reihe('2026-10-20T10:00:00Z', [3]);
  gleich(status(S7, p, T('2026-10-20T10:14:59Z')).stufe, 'ok');
  gleich(status(S7, p, T('2026-10-20T10:15:00Z')).stufe, 'offline');
  gleich(status(S7, p, T('2026-10-20T17:59:00Z')).stufe, 'offline');
  gleich(status(S7, p, T('2026-10-20T18:00:00Z')).stufe, 'meldet');
  gleich(status(S7, p, T('2026-10-20T10:15:00Z')).text, 'Offline · letzter Wert 12:00');
});
test('ohne Werte: Meldet nicht, mit letztem Wert von früher', () => {
  gleich(status(S7, [], T('2026-10-20T10:00:00Z')).stufe, 'meldet');
  const st = status(S7, [], T('2026-10-20T10:00:00Z'), { t: T('2026-10-09T11:40:00Z'), v: 13.4 });
  gleich(st.text, 'Meldet nicht · seit 09.10. 13:40');
});
test('keine Grenze hinterlegt: grau, nie still OK', () => {
  const st = status({ grenze: null, grauMin: 15, rotMin: 480 }, reihe('2026-10-20T10:00:00Z', [25]), T('2026-10-20T10:01:00Z'));
  gleich(st.stufe, 'ohne'); gleich(st.text, 'keine Grenze hinterlegt');
});
test('Strecke beginnt am Anfang der geladenen Daten: „seit mind.“', () => {
  const p = reihe('2026-10-20T10:00:00Z', [9, 9, 9, 9, 9]);
  const st = status(S7, p, T('2026-10-20T10:21:00Z'), null, T('2026-10-20T10:00:00Z'));
  gleich(st.text, 'Alarm · seit mind. 21 Min über 7 °C');
});

// ---------- Tageswechsel / Monatswechsel in Europe/Berlin ----------
test('Tageswechsel: 21:59 UTC ist noch der 20., 22:00 UTC schon der 21. (Sommerzeit)', () => {
  gleich(tagKey(T('2026-10-20T21:59:00Z')), '2026-10-20');
  gleich(tagKey(T('2026-10-20T22:00:00Z')), '2026-10-21');
  gleich(tagesBeginn(T('2026-10-21T05:00:00Z')), T('2026-10-20T22:00:00Z'));
});
test('Monatswechsel: 31.10. 23:30 UTC ist in Berlin schon der 01.11.', () => {
  gleich(tagKey(T('2026-10-31T23:30:00Z')), '2026-11-01');
  gleich(uhr(T('2026-10-31T23:30:00Z')), '00:30');
});
test('„Letzter Monat“ am 01.11. 00:30 Berlin = ganzer Oktober', () => {
  const [von, bis] = bereich('letzterMonat', T('2026-10-31T23:30:00Z'));
  gleich(new Date(von).toISOString(), '2026-09-30T22:00:00.000Z');
  gleich(new Date(bis).toISOString(), '2026-10-31T23:00:00.000Z');
});
test('Hinweiszeile „Heute …“ zählt nur heute (Berlin), nicht gestern Abend', () => {
  // Alarm gestern 23:00–23:40 Berlin (= 21:00–21:40 UTC), heute alles OK
  const p = [...reihe('2026-10-19T21:00:00Z', [9, 9, 9, 9, 9, 9, 9, 9, 9]), ...reihe('2026-10-19T22:00:00Z', [3, 3, 3])];
  gleich(heuteAlarm(S7, p, T('2026-10-19T22:20:00Z')), null);
  gleich(heuteAlarm(S7, p, T('2026-10-19T21:59:00Z')) !== null, true, 'am selben Abend schon');
});
test('wann(): gestern / Wochentag / Datum', () => {
  const jetzt = T('2026-10-20T10:00:00Z');
  gleich(wann(T('2026-10-19T13:05:00Z'), jetzt), 'gestern 15:05');
  gleich(wann(T('2026-10-17T04:30:00Z'), jetzt), 'Sa 06:30');
  gleich(wann(T('2026-10-09T11:40:00Z'), jetzt), '09.10. 13:40');
});

// ---------- Sommer-/Winterzeit-Umstellung 25.10.2026 ----------
test('25.10.2026: Versatz springt um 01:00 UTC von +2 auf +1 Std', () => {
  gleich(versatzMin(T('2026-10-25T00:59:00Z')), 120);
  gleich(versatzMin(T('2026-10-25T01:00:00Z')), 60);
});
test('25.10.2026: 02:30 gibt es zweimal', () => {
  gleich(uhr(T('2026-10-25T00:30:00Z')), '02:30');
  gleich(uhr(T('2026-10-25T01:30:00Z')), '02:30');
});
test('25.10.2026 hat 25 Stunden', () => {
  gleich(mitternacht(2026, 10, 25), T('2026-10-24T22:00:00Z'));
  gleich(mitternacht(2026, 10, 26), T('2026-10-25T23:00:00Z'));
  const [von, bis] = bereich('gestern', T('2026-10-26T11:00:00Z'));
  gleich((bis - von) / STD, 25);
});
test('29.03.2026 hat 23 Stunden', () => {
  gleich((mitternacht(2026, 3, 30) - mitternacht(2026, 3, 29)) / STD, 23);
});
test('Strecke über die Umstellung: Dauer in echter Zeit (25 Min, nicht 85)', () => {
  // 02:50 CEST … 02:10 CET = 00:50 … 01:10 UTC, 5 Werte
  const p = reihe('2026-10-25T00:50:00Z', [8, 8, 8, 8, 8]);
  const l = laeufe(p, 7);
  gleich(l.length, 1); gleich(l[0].min, 25);
  const st = status(S7, p, T('2026-10-25T01:15:00Z'));
  gleich(st.stufe, 'alarm'); gleich(st.text, 'Alarm · seit 25 Min über 7 °C');
  gleich(uhr(l[0].von) + '–' + uhr(l[0].bis + 5 * MIN), '02:50–02:15');
});
test('Tageswerte am 25.10.: alle 300 Werte (25 Std) in einem Tag', () => {
  const von = mitternacht(2026, 10, 25), bis = mitternacht(2026, 10, 26);
  const p = []; for (let t = von; t < bis; t += 5 * MIN) p.push({ t, v: 2 });
  const tw = tageswerte(p);
  gleich(tw.length, 1); gleich(tw[0].n, 300); gleich(teile(tw[0].tag).t, 25);
});

// ---------- Ausgabe ----------

// ---------- Alarm nach Stundenmittel (Einstellung, wie HACCP-Export) ----------
// 08:00–09:00 UTC = 10–11 Uhr Berlin (Sommerzeit)
test('Stundenmittel: kurze Spitze bleibt OK, 6–7-Mittel über Grenze = Alarm', () => {
  const p = reihe('2026-10-20T08:00:00Z', [6, 6, 9, 9, 9, 9, 6, 6, 6, 6, 6, 6, 6]);  // 10:00–11:00 Ø 7,0 + 1 Wert 11:00
  gleich(status(S7, p, T('2026-10-20T09:01:00Z'), null, undefined, 'stunde').stufe, 'ok', 'Ø genau 7,0');
  const q = reihe('2026-10-20T08:00:00Z', [6, 6, 9, 9, 9, 9, 9, 6, 6, 6, 6, 6]);       // Ø 7,25, noch kein Wert ab 11:00
  const st = status(S7, q, T('2026-10-20T09:02:00Z'), null, undefined, 'stunde');
  gleich(st.stufe, 'alarm'); gleich(st.text, 'Alarm · seit 10:00 Stundenmittel über 7 °C');
});
test('Stundenmittel: laufende Stunde bisher drüber = Achtung, vorbei = „!“ auf der Karte', () => {
  const p = reihe('2026-10-20T08:00:00Z', [8, 8, 8]);
  gleich(status(S7, p, T('2026-10-20T08:11:00Z'), null, undefined, 'stunde').text, 'Achtung · Stundenmittel bisher 8,0 °C');
  const q = reihe('2026-10-20T08:00:00Z', [...Array(12).fill(8), 5]);
  gleich(status(S7, q, T('2026-10-20T09:01:00Z'), null, undefined, 'stunde').stufe, 'ok');
  const h = heuteAlarm(S7, q, T('2026-10-20T09:01:00Z'), 'stunde');
  gleich([uhr(h.von), uhr(h.bis + 5 * MIN), h.schnitt], ['10:00', '11:00', 8]);
});
test('Stundenmittel: angeschnittene erste Stunde zählt nicht, Lücke trennt', () => {
  const p = reihe('2026-10-20T08:30:00Z', [9, 9, 9, 9, 9, 9]);
  gleich(stundenLaeufe(p, 7, T('2026-10-20T08:30:00Z')).length, 0);
  const q = [...reihe('2026-10-20T08:00:00Z', Array(12).fill(8)), ...reihe('2026-10-20T10:00:00Z', Array(12).fill(8))];
  gleich(stundenLaeufe(q, 7).map((l) => l.stunden), [1, 1]);
});

const fehler = ergebnisse.filter((e) => !e.ok);
export { ergebnisse, fehler, REGEL };
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  for (const e of ergebnisse) console.log((e.ok ? '  ok   ' : '  FEHLER ') + e.name + (e.ok ? '' : '\n         ' + e.fehler));
  console.log('\n' + (ergebnisse.length - fehler.length) + ' von ' + ergebnisse.length + ' Tests bestanden');
  process.exitCode = fehler.length ? 1 : 0;
}

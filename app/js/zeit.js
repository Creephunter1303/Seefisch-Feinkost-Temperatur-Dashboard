// Zeit-Helfer. Die Datenbank speichert UTC (timestamptz), angezeigt und
// gerechnet wird IMMER in Europe/Berlin – unabhängig davon, auf welche
// Zeitzone das Gerät eingestellt ist. Alle Zeitpunkte sind Millisekunden (Zahl).
// Kein DOM, damit die Tests in Node und im Browser laufen.

export const ZONE = 'Europe/Berlin';
export const MIN = 60000;
export const STD = 60 * MIN;
export const TAG = 24 * STD;

export const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const MONAT = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE, hourCycle: 'h23',
  year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
});

// Versatz Berlin gegen UTC in Minuten (+60 Winter, +120 Sommer). Die
// Umstellung passiert immer zur vollen Stunde, deshalb reicht ein Zwischen-
// speicher je UTC-Stunde – wichtig für Jahreszeiträume mit ~100.000 Werten.
const versatzCache = new Map();
export function versatzMin(t) {
  const h = Math.floor(t / STD);
  let v = versatzCache.get(h);
  if (v === undefined) {
    const p = {};
    for (const x of fmt.formatToParts(new Date(h * STD))) p[x.type] = x.value;
    const alsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    v = Math.round((alsUtc - h * STD) / MIN);
    if (versatzCache.size > 20000) versatzCache.clear();
    versatzCache.set(h, v);
  }
  return v;
}

// Kalenderteile in Berlin: { j, m (1–12), t, h, min, wt (0 = So) }
export function teile(t) {
  const d = new Date(t + versatzMin(t) * MIN);
  return { j: d.getUTCFullYear(), m: d.getUTCMonth() + 1, t: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes(), wt: d.getUTCDay() };
}

// Mitternacht (00:00 Berlin) eines Kalendertags als UTC-Zeitpunkt.
// Monat/Tag dürfen überlaufen (m = 13, t = 0 …), Date.UTC rechnet das um.
export function mitternacht(j, m, t) {
  const basis = Date.UTC(j, m - 1, t);
  let x = basis - versatzMin(basis) * MIN;
  x = basis - versatzMin(x) * MIN;   // zweiter Schritt, falls der Versatz am Vortag anders war
  return x;
}

export function tagesBeginn(t) { const p = teile(t); return mitternacht(p.j, p.m, p.t); }

// Kalendertag als 'YYYY-MM-DD' (Berlin)
export const p2 = (n) => String(n).padStart(2, '0');
export function tagKey(t) { const p = teile(t); return p.j + '-' + p2(p.m) + '-' + p2(p.t); }
export function ausTagKey(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? mitternacht(+m[1], +m[2], +m[3]) : null;
}
export function gleicherTag(a, b) { return tagKey(a) === tagKey(b); }

// ---------- Formatierung ----------
export function uhr(t) { const p = teile(t); return p2(p.h) + ':' + p2(p.min); }
export function datum(t) { const p = teile(t); return p2(p.t) + '.' + p2(p.m) + '.'; }
export function datumLang(t) { return datum(t) + teile(t).j; }
export function wochentag(t) { return WT[teile(t).wt]; }

// „12:20“, „gestern 15:05“, „Mo 06:30“, „09.10. 13:40“
export function wann(t, jetzt) {
  if (gleicherTag(t, jetzt)) return uhr(t);
  const heute0 = tagesBeginn(jetzt);
  if (t >= tagesBeginn(heute0 - 1) && t < heute0) return 'gestern ' + uhr(t);
  if (jetzt - t < 6 * TAG) return wochentag(t) + ' ' + uhr(t);
  return datum(t) + ' ' + uhr(t);
}

export function dauer(min) {
  if (min < 60) return Math.max(1, Math.round(min)) + ' Min';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (h < 24) return h + ' Std' + (m && h < 3 ? ' ' + m + ' Min' : '');
  return Math.round(h / 24) === 1 ? '1 Tag' : Math.round(h / 24) + ' Tagen';
}

// ---------- Zeiträume der Detailansicht ----------
export const SCHNELL = [
  { id: '6h', wt: 'LETZTE', nr: '6 Std' },
  { id: 'heute', wt: 'HEUTE' },
  { id: 'gestern', wt: 'GESTERN' },
  { id: '7t', wt: 'LETZTE', nr: '7 Tage' },
];

export function vorlagen(jetzt) {
  const p = teile(jetzt);
  const vm = teile(mitternacht(p.j, p.m - 1, 1));
  return [
    { id: '30t', n: 'Letzte 30 Tage', z: datum(jetzt - 30 * TAG) + ' – heute', kurz: '30 Tage' },
    { id: 'letzterMonat', n: 'Letzter Monat', z: MONAT[vm.m - 1] + ' ' + vm.j, kurz: MON[vm.m - 1] },
    { id: '3m', n: 'Letzte 3 Monate', z: datum(bereich('3m', jetzt)[0]) + ' – heute', kurz: '3 Monate' },
    { id: 'diesesJahr', n: 'Dieses Jahr', z: 'seit 01.01.' + p.j, kurz: String(p.j) },
    { id: 'letztesJahr', n: 'Letztes Jahr', z: String(p.j - 1), kurz: String(p.j - 1) },
  ];
}

const tageImMonat = (j, m) => new Date(Date.UTC(j, m, 0)).getUTCDate();

// [von, bis) als UTC-Zeitpunkte. eigen = { von: 'YYYY-MM-DD', bis: 'YYYY-MM-DD' }
export function bereich(id, jetzt, eigen) {
  const p = teile(jetzt);
  const heute0 = mitternacht(p.j, p.m, p.t);
  switch (id) {
    case 'heute': return [heute0, jetzt];
    case 'gestern': return [mitternacht(p.j, p.m, p.t - 1), heute0];
    case '7t': return [jetzt - 7 * TAG, jetzt];
    case '30t': return [jetzt - 30 * TAG, jetzt];
    case 'letzterMonat': return [mitternacht(p.j, p.m - 1, 1), mitternacht(p.j, p.m, 1)];
    case '3m': {
      const z = teile(mitternacht(p.j, p.m - 3, 1));
      return [mitternacht(z.j, z.m, Math.min(p.t, tageImMonat(z.j, z.m))), jetzt];
    }
    case 'diesesJahr': return [mitternacht(p.j, 1, 1), jetzt];
    case 'letztesJahr': return [mitternacht(p.j - 1, 1, 1), mitternacht(p.j, 1, 1)];
    case 'auswahl': return [eigen.von, Math.min(eigen.bis, jetzt)];   // im Diagramm gezogener Ausschnitt (ms)
    case 'eigen': {
      const von = ausTagKey(eigen.von), b = teile(ausTagKey(eigen.bis));
      const bis = mitternacht(b.j, b.m, b.t + 1);
      return [von, Math.min(bis, jetzt)];
    }
    default: return [jetzt - 6 * STD, jetzt];
  }
}

export function bereichText(id, jetzt, eigen) {
  const [von, bis] = bereich(id, jetzt, eigen);
  if (id === 'auswahl') {
    const tagT = (t) => (gleicherTag(t, jetzt) ? 'Heute' : wochentag(t) + ' ' + datum(t));
    if (istLang(von, bis)) return datumLang(von) + ' – ' + datumLang(bis - 1);
    return tagT(von) + ' ' + uhr(von) + ' – ' + (gleicherTag(von, bis) ? '' : tagT(bis) + ' ') + uhr(bis);
  }
  const bisAnz = bis === jetzt ? 'jetzt' : datumLang(bis - 1);
  if (id === '6h' || id === 'heute') return (gleicherTag(von, jetzt) ? 'Heute ' : 'Gestern ') + uhr(von) + ' – ' + uhr(bis);
  if (id === 'gestern') return wochentag(von) + ' ' + datumLang(von);
  return datumLang(von) + ' – ' + bisAnz;
}

export const istLang = (von, bis) => bis - von > 8 * TAG;

// Text der Kachel „Zeitraum“ nach eigener Wahl: „10.–16.08.“ bzw. „28.09.–03.10.“
export function eigenKurz(eigen) {
  const a = ausTagKey(eigen.von), b = ausTagKey(eigen.bis);
  const pa = teile(a), pb = teile(b);
  return pa.m === pb.m && pa.j === pb.j ? p2(pa.t) + '.–' + datum(b) : datum(a) + '–' + datum(b);
}

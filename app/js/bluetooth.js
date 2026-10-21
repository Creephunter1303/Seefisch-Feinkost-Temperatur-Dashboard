// Ruuvi-Sensoren direkt per Bluetooth auslesen („Am Wagen auslesen“).
// Protokoll aus bluetooth-test/index.html übernommen (dort auf dem Tablet zu testen):
// Nordic UART Service, Befehl 3A 3A 11 + Ende + Start (je uint32, Sekunden),
// Antwort in 11-Byte-Datensätzen, Temperatur als int32 / 100 (vorzeichenrichtig).
// Die Werte werden NUR zurückgegeben – nie gespeichert oder hochgeladen.
// Kein DOM. Die Spielwiese ersetzt diese Datei per Import-Map (spiel-bluetooth.js).

const NUS = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';   // schreiben (Befehl)
const NUS_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';   // Benachrichtigungen (Werte)
const VERBINDEN_MAX_MS = 60000, STILLE_MAX_MS = 10000, GESAMT_MAX_MS = 110000;   // Firmware-Watchdog ~120 s

// Kann dieser Browser überhaupt Bluetooth? (Chrome/Edge auf Android, Windows, Mac,
// ChromeOS: ja. iPhone/iPad und Firefox: nein.)
export const bluetoothDa = () => !!(typeof navigator !== 'undefined' && navigator.bluetooth && navigator.bluetooth.requestDevice);

// Bluetooth-Name „Ruuvi EEFF“ = letzte 4 Zeichen der MAC (AA:BB:CC:DD:EE:FF)
export const ruuviName = (mac) => 'Ruuvi ' + mac.replace(/:/g, '').slice(-4).toUpperCase();

// Vom Browser gemerkte Geräte den Sensoren zuordnen: Map mac → device
export async function gemerkteGeraete(macs) {
  const m = new Map();
  if (!navigator.bluetooth.getDevices) return m;
  try {
    const geraete = await navigator.bluetooth.getDevices();
    for (const mac of macs) {
      const g = geraete.find((d) => d.name === ruuviName(mac));
      if (g) m.set(mac, g);
    }
  } catch (e) { /* dann eben koppeln */ }
  return m;
}

// Einmal koppeln: öffnet das Auswahlfenster von Chrome, nur dieser Sensor wird
// angeboten. MUSS direkt aus einem Tipp heraus aufgerufen werden.
export function koppeln(mac) {
  return navigator.bluetooth.requestDevice({ filters: [{ name: ruuviName(mac) }], optionalServices: [NUS] });
}

function mitFrist(promise, ms, was) {
  return Promise.race([promise, new Promise((_, nein) => setTimeout(() => nein(new Error(was + ' dauerte zu lange')), ms))]);
}

// Werte ab „seit“ (ms) lesen. fortschritt(zustand, anzahl) mit zustand 'verbinde' | 'lade'.
// Ergebnis: [{ t: ms, v: °C }] aufsteigend, ohne doppelte Zeitpunkte.
export async function leseSensor(device, seit, fortschritt = () => {}) {
  const werte = [];
  let tx = null, handler = null, fehler = null;
  const bis = Math.floor(Date.now() / 1000), von = Math.floor(seit / 1000);
  try {
    fortschritt('verbinde', 0);
    const server = await mitFrist(device.gatt.connect(), VERBINDEN_MAX_MS, 'Verbinden');
    const dienst = await mitFrist(server.getPrimaryService(NUS), 15000, 'Dienst suchen');
    tx = await dienst.getCharacteristic(NUS_TX);
    const rx = await dienst.getCharacteristic(NUS_RX);
    fortschritt('lade', 0);
    await new Promise((fertig, abbruch) => {
      let stille = setTimeout(fertig, STILLE_MAX_MS);
      const gesamt = setTimeout(fertig, GESAMT_MAX_MS);
      const ende = () => { clearTimeout(stille); clearTimeout(gesamt); fertig(); };
      handler = (ev) => {
        clearTimeout(stille); stille = setTimeout(ende, STILLE_MAX_MS);
        const dv = ev.target.value;
        for (let o = 0; o + 3 <= dv.byteLength; o += 11) {      // mehrere Datensätze pro Paket möglich
          const len = Math.min(11, dv.byteLength - o);
          const b = (i) => dv.getUint8(o + i);
          if (b(0) === 0x05) continue;                             // Heartbeat
          let alleFF = len >= 4; for (let i = 3; i < len; i++) if (b(i) !== 0xFF) alleFF = false;
          if (alleFF) { ende(); return; }                          // Ende-Markierung
          if (len >= 11 && b(2) === 0xF0) { fehler = 'Sensor meldet Fehler beim Lesen'; ende(); return; }
          if (len === 11 && b(0) === 0x3A && b(1) === 0x30) {
            werte.push({ t: dv.getUint32(o + 3, false) * 1000, v: dv.getInt32(o + 7, false) / 100 });
          }
        }
        if (werte.length % 12 === 0) fortschritt('lade', werte.length);
      };
      (async () => {
        try {
          await tx.startNotifications();
          tx.addEventListener('characteristicvaluechanged', handler);
          const cmd = new Uint8Array(11);
          cmd.set([0x3A, 0x3A, 0x11]);
          new DataView(cmd.buffer).setUint32(3, bis, false);
          new DataView(cmd.buffer).setUint32(7, von, false);
          if (rx.writeValueWithResponse) await rx.writeValueWithResponse(cmd); else await rx.writeValue(cmd);
        } catch (e) { clearTimeout(stille); clearTimeout(gesamt); abbruch(e); }
      })();
    });
  } finally {
    try { if (tx && handler) { tx.removeEventListener('characteristicvaluechanged', handler); await tx.stopNotifications(); } } catch (e) { /* egal */ }
    try { if (device.gatt.connected) device.gatt.disconnect(); } catch (e) { /* egal */ }
  }
  if (fehler) throw new Error(fehler);
  const map = new Map(); werte.forEach((w) => map.set(w.t, w));
  const sortiert = [...map.values()].filter((w) => w.t >= seit).sort((a, b) => a.t - b.t);
  if (!sortiert.length) throw new Error('keine Werte erhalten');
  return sortiert;
}

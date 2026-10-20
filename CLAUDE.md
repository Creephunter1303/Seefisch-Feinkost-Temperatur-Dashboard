# CLAUDE.md — Temperaturen (Tablet-App)

Stabile Fakten für KI-Assistenten. Immer zuerst lesen. Bedienung/Einrichtung: `README.md`.

## Was das ist

PWA „Temperaturen“ für Seefisch-Feinkost: zeigt die Kühltemperaturen der RuuviTag-Sensoren
(Übersicht je Standort, Verlauf je Sensor). **Phase 1 = Anzeige** (fertig, v0.1.0) plus
Admin-Bereich für die Sensor-Stammdaten. **Phase 2 = „Am Wagen auslesen“** per Web Bluetooth
(noch nicht gebaut, siehe `vorlage/VORLAGE.md` „Neu in v0.3“ und `vorlage/PROMPT-Claude-Code.md`).

- Reines HTML/CSS/JS mit ES-Modulen, **kein Framework, kein Build-Schritt**.
- Backend = Supabase (PostgREST) direkt aus dem Browser. Kein eigener Server.
- Hosting: GitHub Pages, veröffentlicht wird nur `app/` (`.github/workflows/pages.yml`).
- Repo: `Creephunter1303/Seefisch-Feinkost-Temperatur-Dashboard`.

## Harte Grenzen

- **Nachbarprojekt `../Temperatur Überwachung/ruuvi-haccp/` (Pi, Collector, Grafana, export/,
  webui/) nur lesen, nie dort schreiben.** Das Pi-Projekt besitzt das Datenbankschema.
- **Kein Schema ändern, keine Tabellen/Views anlegen.** Wünsche ans Schema gehen als Text an
  das Pi-Projekt. Schnittstelle: `ruuvi-haccp/PLAN-STAMMDATEN.md` Abschnitt 9.
- Im Client nur der **anon/publishable Key**. Nie `postgres_url`, `service_role`, `sb_secret_…`.
  Der Key steht **nicht** im Repo, er wird pro Gerät eingetragen (localStorage) oder per
  Einrichtungslink übergeben. `rest.keyIstGeheim()` lehnt geheime Schlüssel ab.
- Anzeige = nur lesen. Geschrieben wird **ausschließlich** im Admin-Bereich nach Anmeldung, und
  nur in die Tabelle `sensoren` (insert/update, nie delete, MAC nach dem Anlegen unveränderlich).
  Nie an `messwerte` schreiben.
- `seefisch.css` + `schriften/` sind unveränderte Kopien aus `../Seefisch Designsystem/`.
  App-Regeln nur in `app/temperatur.css`.
- `vorlage/` ist die verbindliche Gestaltungsvorlage. Abweichungen in `vergleich/ABWEICHUNGEN.md`
  festhalten.

## Datenbank (Supabase-Projekt `iqxexsdxsiyxvlxuolfc`, Stand 20.10.2026)

| Objekt | Nutzung in der App |
|---|---|
| `sensoren` | Stammdaten: `mac` (PK), `name`, `standort`, `reihenfolge`, `temp_max` (nur Obergrenze, NULL = keine), `grau_nach_minuten`, `rot_nach_minuten`, `aktiv`, `notiz`. Kacheln nur für `aktiv`. Admin schreibt hier. |
| `messwerte` | gelesen mit `uuid` (= MAC), `zeit`, `temperatur_c`, `eingetragen_am`. Immer nach `uuid` + `zeit` filtern (Primärschlüssel). **Spalte `sensor` nie benutzen** (fällt weg). |
| `stammdaten_protokoll` | nur Admin, nur lesen (Änderungen anzeigen). |
| `messwerte_benannt` | View mit Namen; die App braucht sie nicht (Namen kommen aus `sensoren`, `eingetragen_am` fehlt in der View). |
| `sensor_gruppen` | **nicht verwenden** (Altlast, fällt weg). |

Es gibt **keine** Views `letzte_werte` / `tageswerte` (anders als VORLAGE.md §7 dachte).
Die App kommt ohne aus: letzter Wert per `order=zeit.desc&limit=1` je stillem Sensor,
Tageswerte rechnet `detail.tageswerte()` aus Rohwerten.

Zeiten: DB = UTC (`timestamptz`), Anzeige und Tagesgrenzen **immer Europe/Berlin**, unabhängig von
der Zeitzone des Geräts (`js/zeit.js`).

## Abfragen und Datenvolumen (Tablet: 1 GB/Monat)

- **Start:** `sensoren?select=*` + `messwerte` seit `min(Mitternacht Berlin, jetzt − 6 Std)` für alle
  aktiven MACs (paginiert, 1000/Antwort) + je still gebliebenem Sensor der letzte Wert + einmalig
  der erste Messwert („Aufzeichnung seit“).
- **Alle 5 Min, nur wenn sichtbar** (`visibilitychange`, beim Zurückkehren sofort einmal):
  `eingetragen_am=gt.<größtes gesehenes eingetragen_am>` im selben Fenster.
  **Nicht `zeit=gt.…`**: Der Pi trägt die Werte eines zurückgekehrten Wagens mit ihren alten
  Zeitstempeln nach (GATT-Backfill), die kämen sonst nie an. `eingetragen_am` setzt der Collector bei
  jedem Insert/Update.
- `sensoren` wird höchstens alle 15 Min neu geholt (oder nach Admin-Speichern).
- **Detail:** Rohwerte des einen Sensors (paginiert, bis 4 Seiten parallel), auch über 8 Tage.
  Gemessen: 3 Monate ≈ 18.000 Werte ≈ 120 KB komprimiert, 1 Jahr ≈ 0,7 MB. „bis jetzt“-Zeiträume
  werden je Sensor einmal geholt; danach gilt ab `fensterAb` das laufend nachgeladene Fenster.
- Bytezähler (`rest.zaehle`, localStorage `sf-temp-verbrauch`): `transferSize` wenn vorhanden, sonst
  Antwort mit `CompressionStream('gzip')` nachgemessen + 700 B Kopfzeilen. Supabase sendet kein
  `Timing-Allow-Origin`, daher meist die Schätzung.
- Offline-Start: letzter Datenstand in IndexedDB (`sf-temperaturen`/`daten`/`stand-v1`), App-Dateien
  im Service Worker (Cache `seefisch-temperaturen-<VERSION>`). Ohne Netz zählt der Status gegen den
  Datenstand (`daten.bezug()`).

## Statusregel (`app/js/status.js`, Konstante `REGEL`)

Wie VORLAGE.md §2: OK ≤ Grenze · Achtung = über Grenze ≤ 15 Min · Alarm = > 15 Min oder > Grenze + 3 °C
· Offline ab `grau_nach_minuten` · Meldet nicht ab `rot_nach_minuten` · ohne Grenze: grau „keine Grenze
hinterlegt“ (nie still OK).
- Strecke endet bei Wert ≤ Grenze oder Lücke > 10 Min. Dauer = erster bis letzter Wert + 5 Min
  (3 Werte = 15 Min = Achtung, 4 Werte = 20 Min = Alarm).
- `grenze + 3` wird auf 2 Nachkommastellen gerundet (6,3 + 3 = 9,3 exakt).
- Beginnt eine Strecke am Anfang der geladenen Daten → „seit mind. …“.
- Tests: `tests/status.test.mjs` (26 Fälle inkl. −18 °C, Tages-/Monatswechsel, 25.10.2026 = 25-Std-Tag,
  29.03.2026 = 23-Std-Tag). Läuft mit `node` und im Browser (`tests/index.html`).

## Entscheidungen (mit Max, 20.10.2026)

- Wagen = Standort. Weil `sensoren` keine Spalte `art` hat: **ein Standort gilt als Wagen, wenn alle
  seine Sensoren `rot_nach_minuten ≥ 240` haben** (`zustand.istWagen`, `WAGEN_AB_MIN`). Wagen heute 480,
  Halle 60. Steuert Wagen-Symbol, Zusatz „unterwegs“ und die Auswahl „Tablet gehört zu“.
- Hohe Werte der Wagen abends/an freien Tagen (Kühlung aus) bleiben vorerst rote Alarm-Karten.
  Alarme/Benachrichtigung klärt Max später separat (on hold).
- Admin-Bereich hinter Einstellungen; Gestaltung frei nach Designsystem (keine Vorlage).
- Supabase-JS (`@supabase/supabase-js@2.49.4`, per `import()` von cdn.jsdelivr.net) wird **nur** beim
  Öffnen des Admin-Bereichs geladen. Die Anzeige liest mit eigenem `fetch` (anon), damit Tablets die
  Bibliothek nie laden. Sitzung: localStorage `sb-iqxexsdxsiyxvlxuolfc-auth-token`.
- Einrichtungslink: `…/#einrichtung=<base64url({"u":url,"k":key})>`, wird nach dem Lesen aus der
  Adresszeile entfernt.

## Dateien

```
app/                     ← wird veröffentlicht
  index.html, sw.js, manifest.webmanifest, icons/, seefisch.css, schriften/, temperatur.css
  js/main.js             Start, Navigation, Nachladen, Einrichtung, Service-Worker-Anmeldung
  js/daten.js            Datenstand D + alle Abfragen, Offline-Snapshot
  js/rest.js             PostgREST-Zugriff, Seiten, Bytezähler, Einrichtung (URL/Key)
  js/status.js           Statusregel (REGEL)          js/zeit.js   Europe/Berlin, Zeiträume
  js/zustand.js          UI-Zustand Z, istWagen         js/speicher.js localStorage + IndexedDB
  js/ansichten/          uebersicht, detail (+ Diagramm, Zeitraum-Blatt), einstellungen
                         (+ Einrichtung), admin (lazy), admin-status
tests/                   status.test.mjs, index.html (Browser-Läufer)
werkzeuge/screenshots.py echte Screenshots via Chrome DevTools-Protokoll
vergleich/               index.html (Vorlage ↔ App), echt/*.png, ABWEICHUNGEN.md
vorlage/, bluetooth-test/  Gestaltungsvorlage + Machbarkeitstest Phase 2 (nicht ändern)
.lokal/                  NICHT im Repo: supabase.env, einrichtung.txt (Key für Tests/Screenshots)
```

## Fallstricke

- **Version an zwei Stellen erhöhen:** `app/sw.js` `VERSION` und `app/js/version.js` `APP_VERSION`.
  Neue Dateien in `app/` auch in `DATEIEN` in `sw.js` eintragen.
- **Lokal ist der Service Worker aus** (außer `?sw=1`), sonst liefert er alte Dateien. Der eingebaute
  Browser von Claude Code erlaubt gar keine Service Worker → SW-Tests mit echtem Chrome
  (DevTools-Protokoll, siehe `werkzeuge/screenshots.py`).
- **Python `http.server` setzt bei vielen gleichzeitigen Modul-Anfragen Verbindungen zurück**
  (`ERR_CONNECTION_RESET`) → die App startet dann nicht. Für Tests einen Server mit größerer
  `request_queue_size` nehmen. GitHub Pages ist davon nicht betroffen; für den Fall, dass beim
  allerersten Start ein Modul fehlt, zeigt `index.html` nach 15 s „Die App konnte nicht starten“.
- Das Modul-Skript steht am **Ende von `<body>`**: im `<head>` startete es in Headless-Chrome nicht.
- Nach jedem neuen Datenstand zeichnet `nachDaten()` nur die Seite neu (`#seite`), nie in ein offenes
  Zeitraum-Blatt oder Formular hinein.
- „°C“ immer mit geschütztem Leerzeichen (`grad()`, `grenzText()`), sonst bricht „7 / °C“ um.
- Node ist auf Max' Mac (Stand 20.10.2026) nicht installiert → Tests im Browser laufen lassen.

## Offen

- **Admin-Login testen**, sobald das Pi-Projekt das Konto angelegt hat (Phase 4): Anmelden, Sensor
  ändern, neuer Sensor, Protokoll, Fehlermeldungen (doppelter Name, MAC-Format) echt prüfen.
- Phase 2 „Am Wagen auslesen“ (nach dem Bluetooth-Test auf dem Tablet).
- Alarmierung/Benachrichtigung (Max, später).
- Optional ans Pi-Projekt: Spalte `art` in `sensoren` statt der 240-Min-Regel; `eingetragen_am` in
  `messwerte_benannt`.
- Standortname „Seiko“ (Supabase) vs. „Seico“ (Bestell-App) angleichen – im Admin-Bereich.

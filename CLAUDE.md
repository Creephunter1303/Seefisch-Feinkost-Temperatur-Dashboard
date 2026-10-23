# CLAUDE.md — Temperaturen (Tablet-App)

Stabile Fakten für KI-Assistenten. Immer zuerst lesen. Bedienung/Einrichtung: `README.md`.

## Was das ist

PWA „Temperaturen“ für Seefisch-Feinkost: zeigt die Kühltemperaturen der RuuviTag-Sensoren
(Übersicht je Standort, Verlauf je Sensor). **Phase 1 = Anzeige** (fertig, v0.1.0) plus
Admin-Bereich für die Sensor-Stammdaten. **Phase 2 = „Am Wagen auslesen“** per Web Bluetooth
(gebaut in v0.2.0 nach `vorlage/VORLAGE.md` „Neu in v0.3“, **noch nie an einem echten Sensor
gelaufen**, nur mit nachgebautem Sensor im Browser geprüft). Stand: **v0.2.6** (23.10.2026).

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
- Am Wagen per Bluetooth ausgelesene Werte liegen **nur im Arbeitsspeicher** (`D.tablet`): nie in
  IndexedDB, nie hochladen. `punkteVon()` hängt sie nur nach dem letzten Supabase-Wert an, damit sie
  wegfallen, sobald der Pi die echten Werte nachgetragen hat. Im Code `D.punkte` direkt lesen, wo
  gespeichert oder abgeglichen wird (`einsortieren`, `ladeFenster`, `speichereStand`).
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
- Tests: `tests/status.test.mjs` (29 Fälle inkl. Stundenmittel, −18 °C, Tages-/Monatswechsel, 25.10.2026 = 25-Std-Tag,
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

## Entscheidungen (Spielwiese, mit Max, 21.10.2026 → v0.2.0)

- **„Meldet nicht“ dunkelrot** (`--meldet`, Statuszeile gefüllt), damit es nicht wie „Alarm“ aussieht.
- **Ab 1200 px geteilte Ansicht** (`L.geteilt`): links Übersicht, rechts Verlauf. Ohne Auswahl der
  wichtigste Sensor (Alarm > Meldet nicht > Achtung > OK > Offline). Smartphone: kompakte Karten
  ohne Mini-Verlauf.
- **„Am Wagen auslesen“**: Knopf nur, wenn der Browser Bluetooth kann **und** „Gerät gehört zu“ =
  dieser Wagen **und** dessen Sensoren offline/„meldet nicht“ sind (oder schon ausgelesen). Kein
  Erkennen per Bildschirmgröße. Koppeln über den Bluetooth-Namen „Ruuvi “ + letzte 4 Zeichen der MAC
  (Android zeigt Webseiten keine MAC).
- **Ausschnitt im Diagramm ziehen: Standard AUS** (`sf-temp-ausschnitt`), Schalter pro Gerät. Auf
  dem Handy verhinderte das Ziehen das Wischen über das Diagramm.
- **Admin-Knopf in der Kopfzeile erscheint automatisch**, sobald auf dem Gerät eine Admin-Sitzung
  gespeichert ist (`adminAngemeldet()`), keine Einstellung. Ab 1200 px Admin auf einer Seite
  (Liste | Formular | Änderungen).
- **Feld „Reihenfolge“ entfällt im Admin-Formular.** Die Spalte bleibt; bestehende Werte bleiben beim
  Speichern erhalten (`speichern()` mischt das Formular in `A.form`), neue Sensoren bekommen 100.
  Sortiert wird weiter danach (heute: Tiefkühlhaus 10, Bunker BN 20, Rest 100). Wer das ändern will:
  SQL-Editor oder das Feld wieder einbauen. Nutzer der Spalte außerhalb der App (Stand 21.10.2026):
  nur `stammdaten_einspielen.py` (Erstbefüllung); Grafana und `export/bericht.html` sortieren nach
  `sensor_gruppen.reihenfolge` (alte Tabelle), der Collector liest sie nicht.
- Info-Blatt „Regeln für Sensoren“ (`admin.infoBlatt()`): mit PLAN-STAMMDATEN.md abgeglichen. Bei
  Änderungen am Pi-Plan mitziehen.

## Entscheidungen (mit Max, 21.10.2026 → v0.2.1)

- **Zeiträume:** 6 Std · Heute · Gestern · 7 Tage · **14 Tage** · „Mehr“. „Mehr“ ist schmal (Kalender-
  Symbol, Spalte `auto`) und wird erst mit gewähltem Zeitraum breiter. Bis 15 Tage zeigt das Diagramm
  Einzelwerte (`istLang` > 15 Tage → Tageswerte), damit Spitzen sichtbar bleiben.
- **Zeile unter „Über … °C“ markiert die Stelle im Diagramm:** Maus darüber = Vorschau, anklicken/
  antippen = bleibt markiert (`Z.markiert`, nur bis Sensorwechsel, nicht gespeichert), nochmal = weg.
  Kurze Spitzen mind. 12 px breit. Auf dem Handy scrollt das Diagramm ins Bild. Das Diagramm selbst
  bleibt unverändert. Gilt auch auf Touch – falls es dort stört, hinter den Schalter „Ausschnitt“ legen.
- **Admin breit: „Änderungen“ dezent** (ohne Karte, graue Schrift `--protokoll-text`), wird selten gelesen.
- **v0.2.2:** Kacheln der Übersicht zeigen einen heutigen (beendeten) Alarm nur als rotes „!“ hinter dem
  Namen (`.t-merker`, Text im `title`/`aria-label`), damit alle Kacheln gleich hoch bleiben. Der ganze Satz
  steht nur noch auf der großen Karte im Detail. **Abmelden im Admin braucht einen zweiten Klick**
  („Wirklich abmelden?“, `A.abmeldenFragen`).

## Entscheidungen (mit Max, 22.10.2026 → v0.2.4)

- **Schalter „Alarm nach Stundenmittel“** (Einstellungen → So wird bewertet, pro Gerät, localStorage
  `sf-temp-alarm-art`, `Z.alarmArt` = `'genau'` | `'stunde'`, Standard `genau`). Rechnet wie der
  HACCP-Export (`ruuvi-haccp/export/bericht.html`): Mittel aller Werte je voller Stunde Berliner Zeit,
  **Mittel > Grenze** = Alarm. Laufende Stunde bisher drüber = Achtung. Keine +3-°C-Sofortregel.
  Angeschnittene Stunden am Anfang der geladenen Daten zählen nicht (`ab`). Code: `status.stundenLaeufe`,
  `stundenStufe`; `status()`/`heuteAlarm()` mit Parameter `art`. Max hat die HACCP-Konformität selbst geklärt.
  Das Diagramm bleibt unverändert (rote Rohwerte).

## Entscheidungen (mit Max, 23.10.2026 → v0.2.5)

- Admin-Speichern und „Am Wagen auslesen“ hat Max echt getestet (zuhause + Wochenmarkt): funktioniert.
- **Admin: Abschnitt „Standorte“** + Standort im Sensor-Formular als **Auswahl** (`<select>`) statt
  Freitext. Ohne eigene Tabelle (kein Schema ändern): Standort = Text in `sensoren.standort`.
  **Umbenennen** = `update sensoren set standort = neu where standort = alt` (auch ausgemusterte, je Sensor
  ein Protokolleintrag; gibt es den Namen schon, werden die Gruppen nach zweitem „Speichern“ zusammengelegt).
  **Neuer Standort ohne Sensor** liegt nur auf diesem Gerät (localStorage `sf-temp-standorte-neu`), bis ein
  Sensor ihn bekommt. Der Pi vergleicht `standort` nicht (`collector/stammdaten.py`), Umbenennen stört ihn nicht.
  „Startansicht“/„Gerät gehört zu“ werden nur auf dem Gerät mitgezogen, auf dem umbenannt wurde.
- Alarmierung: verschoben. Wagen-Spalte `art`: vorerst nicht. Stundenmittel-Schalter bleibt pro Gerät.

## Dateien

```
app/                     ← wird veröffentlicht
  index.html, sw.js, manifest.webmanifest, icons/, seefisch.css, schriften/, temperatur.css
  js/main.js             Start, Navigation, Nachladen, Einrichtung, Service-Worker-Anmeldung
  js/daten.js            Datenstand D + alle Abfragen, Offline-Snapshot
  js/rest.js             PostgREST-Zugriff, Seiten, Bytezähler, Einrichtung (URL/Key)
  js/status.js           Statusregel (REGEL)          js/zeit.js   Europe/Berlin, Zeiträume
  js/zustand.js          UI-Zustand Z, istWagen         js/speicher.js localStorage + IndexedDB
  js/bluetooth.js        Ruuvi per Web Bluetooth lesen (NUS, 3A 3A 11), ohne DOM
  js/ansichten/          uebersicht, detail (+ Diagramm, Ausschnitt, Zeitraum-Blatt), einstellungen
                         (+ Einrichtung), auslesen (Knopf + Blatt), admin (lazy, + Standorte), admin-status
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
- Node ist auf Max' Mac (Stand 20.10.2026) nicht installiert → Tests im Browser laufen lassen, oder
  mit der JavaScript-Engine von macOS: `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m app/js/main.js`
  prüft den ganzen Modulbaum (gut = endet mit „Can't find variable: document“).
- Headless-Chrome stürzt beim echten `navigator.bluetooth`-Aufruf ab (kein Adapter). Bluetooth im
  Test per `Page.addScriptToEvaluateOnNewDocument` nachbauen.

## Offen

- Alarmierung/Benachrichtigung (Max, später).
- Optional ans Pi-Projekt: Spalte `art` in `sensoren` statt der 240-Min-Regel; `eingetragen_am` in
  `messwerte_benannt`.
- Standortname „Seiko“ (Supabase) vs. „Seico“ (Bestell-App) angleichen – jetzt per „Standorte“ umbenennen.
- Pi-Projekt (nicht hier): Export auf `sensoren.temp_max` umstellen (PLAN-STAMMDATEN Phase 5), mit Max
  vorerst zurückgestellt. Seit Phase 3 (Pi 4, 23.10.2026, Commit `28157db`) übernimmt der Pi Änderungen aus
  `sensoren` in config.json und zieht `sensor_gruppen` (Standort, Grenze …) nach, der Export sieht neue
  Grenzen also schon jetzt.

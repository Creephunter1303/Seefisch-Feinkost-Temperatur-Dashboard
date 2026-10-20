# Temperatur-Dashboard · Vorlage v0.3

Stand: 20.10.2026. Klickbarer Prototyp mit Beispieldaten nach dem Seefisch-Designsystem.
Die Grundlage ist das bestehende Grafana-Dashboard (`grafana/dashboard.json`, `ruuvi-haccp-v1`).
Die Vorlage ist für Claude Code **verbindlich** (siehe `PROMPT-Claude-Code.md`).

| Datei | Wofür |
|---|---|
| `index.html` | Prototyp: Übersicht, Detail mit Zeitraum-Auswahl, Einstellungen, Standortwahl, Sonderzustände. Im Browser öffnen. Die Leiste oben (Situation/Ansicht) gehört **nicht** zur App. |
| `seefisch.css`, `schriften/` | unveränderte Kopie aus „Seefisch Designsystem“ |
| `screens/*.png` | gerenderte Referenzbilder (hoch, quer, Handy, Desktop, Zeitraum-Varianten, Sonderzustände) |
| `PROMPT-Claude-Code.md` | Auftrag für die Umsetzung |

## Neu in v0.3 (20.10.2026): „Am Wagen auslesen“

Am Markt holt das Tablet die fehlenden Werte des eigenen Wagens per Bluetooth direkt aus den Sensoren. Die Werte werden **nur angezeigt, nie gespeichert oder hochgeladen**. Der Pi und Supabase bleiben unberührt; der Pi holt die Werte nach der Rückkehr wie bisher selbst.

- **Einstellung „Tablet gehört zu“:** Wagen auswählen oder „Keinem Wagen (Büro, Handy)“. Nur bei diesem Wagen erscheint der Knopf.
- **Knopf** (grau, Nebenaktion) unter den Karten des eigenen Wagens und in der Detailansicht, sobald dessen Sensoren offline sind: „Am Wagen auslesen · per Bluetooth · fehlende Werte seit 06:30“. Nach dem Auslesen: „Nochmal auslesen · zuletzt ausgelesen 12:20“.
- **Blatt „Am Wagen auslesen · Seico“:**
  - pro Sensor eine Zeile: wartet → verbinde … → lade Werte … 48 → fertig · 70 Werte / nicht erreichbar
  - währenddessen der Hinweis „Tablet in der Nähe lassen“
  - am Ende „Nochmal versuchen“ (nur die fehlgeschlagenen Sensoren) und „Fertig“
- **Kennzeichnung:**
  - Karte: Statuszeile rechts „vom Tablet 12:20“
  - Hinweisband: „Werte vom Tablet ausgelesen um 12:20 · nicht gespeichert“ mit Knopf „Verwerfen“
  - Diagramm: Tablet-Teil gestrichelt, Legende „vom Tablet, nicht gespeichert“
- **Statusregel gilt normal:** Ausgelesene Werte über der Grenze ergeben Achtung/Alarm wie gewohnt. Im Prototyp, Situation „Wagen auf Markt“: Seico Theke steht nach dem Auslesen auf Alarm.
- **Löschen:** Die Werte liegen nur im Arbeitsspeicher. Verwerfen, Neuladen oder Schließen löscht sie.
- **Technik:**
  - Web Bluetooth in Chrome, Nordic UART Service, Befehl `3A 3A 11` + Ende + Start, wie die Python-Bibliothek auf dem Pi
  - Temperatur vorzeichenrichtig als int32 lesen; die Bibliothek auf dem Pi hat dort den Fehler mit negativen Werten
  - Machbarkeitstest: `../bluetooth-test/`
- **Offen bis zum Test auf dem Tablet:**
  - Merkt sich Chrome die Sensoren (`getDevices`), oder muss man sie bei jedem App-Start im Auswahlfenster bestätigen?
  - Zuordnung Sensor ↔ Bluetooth-Name: eine MAC-Spalte in `sensor_gruppen` oder einmalige Kopplung pro Tablet

## Ergänzung v0.2.1 (20.10.2026)

- Neue Prototyp-Situation **„Di 19:30 · alles in Ordnung“** (Startansicht): alle Sensoren verbunden und OK, als Referenz für den Normalzustand.
- Neue Prototyp-Ansicht **„Smartphone“** (390 × 844) neben Tablet hoch/quer. Screenshots `screens/00-*`.

## Änderungen v0.2 (Feedback Max, 20.10.2026)

- **Einklappen entfernt:** Die Option „Offline-Sensoren einklappen“ gibt es nicht mehr. Offline-Sensoren stehen immer als graue Karten da, ohne Mini-Kurve. So bleiben sie ruhig.
- **Status-Symbole entfernt:**
  - kein ✓, ! oder durchgestrichener Kreis mehr
  - Der Status steht als **Farbe der ganzen Karte + Wort**.
  - Das gilt auch für die Chips in der Liste und den Einstellungen.
- **Weniger Text auf OK-Karten:** Auf OK-Karten in der Übersicht steht nur noch „OK“, die Grenze nur noch in der Detailansicht. Das hilft der visuellen Hierarchie.
- **Zeitraum-Auswahl in der Detailansicht:**
  - **Schnell:** feste Kacheln 6 Std / Heute / Gestern / 7 Tage
  - **„Zeitraum · Mehr“:** öffnet ein Blatt mit Vorlagen (letzte 30 Tage, letzter Monat, letzte 3 Monate, dieses Jahr, letztes Jahr)
  - **Eigener Zeitraum:** Von/Bis-Datum mit Prüfung
  - Der gewählte Zeitraum steht als Text unter den Kacheln, z. B. „01.09.2026 – 30.09.2026“.
- **Lange Zeiträume** (über 8 Tage):
  - **Diagramm:** zeigt pro Tag das Band Tiefst–Höchst und eine Linie für das Tagesmittel. Höchstwerte über der Grenze sind rot.
  - **Monate ohne Aufzeichnung:** schraffiert als „keine Daten“.
  - **Liste „Über 7 °C“:** Alarme stehen einzeln, kurze Spitzen werden zu einer Zeile zusammengefasst („Dazu 41× kurz über der Grenze an 28 Tagen“).
- **Einzelwerte-Tabelle entfernt.**
- **Detail-Reihenfolge (hoch):** Wert → Zeitraum → Diagramm → Tiefst/Höchst/Mittel → Liste. Der Filter steht damit über allem, was er verändert. Quer/PC: links Wert, Kennzahlen, Liste; rechts Zeitraum und Diagramm.

---

## 1. Entscheidungen (mit Max geklärt)

- **Ergebnis jetzt:** Prototyp und Vorlage. Die echte App baut danach Claude Code.
- **Geräte:** Tablet (640 × 1072 hoch, 1072 × 640 quer) **und** Handy/PC. Die App soll Grafana im Alltag ablösen.
- **Bewertung mit Türöffnungs-Toleranz:** kurze Spitzen sind „Achtung“, kein Alarm.
- **Keine Hauptaktion** in der Übersicht und im Detail. Der einzige dunkelblaue Knopf ist „Zeitraum anzeigen“ im Zeitraum-Blatt.
- **Kein Einklappen:** keine Einzelwerte-Tabelle, keine Status-Symbole (v0.2).

## 2. Statusregel (eine Stelle im Code: `REGEL`)

Pro Sensor gilt seine `sensor_gruppen.grenztemperatur` (aktuell 7,0 °C, Tiefkühler z. B. −18 °C).

| Status | Bedingung | Darstellung |
|---|---|---|
| **OK** | letzter Wert ≤ Grenze | Karte grün, „OK“ |
| **Achtung** | über der Grenze, Strecke ≤ 15 Min | Karte bernstein, 3 px, „Achtung · seit 5 Min über 7 °C“ |
| **Alarm** | über der Grenze **länger als 15 Min** oder **mehr als 3 °C** darüber | Karte rot, 3 px, „Alarm · seit 25 Min über 7 °C“, Standort rückt nach oben |
| **Offline** | seit `grau_nach_minuten` (15) kein Wert | Karte grau, ohne Mini-Kurve, „Offline · letzter Wert 06:35“ |
| **Meldet nicht** | seit `rot_nach_minuten` (480) kein Wert | Karte rot, „zuletzt −20,2 °C“, „Meldet nicht · seit gestern 15:05“ |

Annahmen von Claude, bitte bestätigen:
- **15 Min und +3 °C:** „+3 °C“ entspricht der bisherigen 10-°C-Stufe aus Grafana (7 + 3).
- **WhatsApp-Alarm:** Der Alarm auf dem Pi (`pruefe_alarme()`) feuert heute schon ab dem ersten Wert über der Grenze. Er sollte dieselbe Regel bekommen.
- **Strecken-Ende:** Eine Strecke endet, sobald ein Wert ≤ Grenze kommt oder eine Lücke von über 10 Min entsteht.

Eine Alarm-Strecke, die heute schon **vorbei** ist, bleibt auf der Karte als Hinweiszeile stehen: „Heute 11:00–11:25 über 7 °C · max 9,3 °C“.

## 3. Von Grafana übernommen und wie es jetzt aussieht

| Grafana | Neu |
|---|---|
| Kachel-Block je Standort (`repeat` über `standort`) | Gruppe je `sensor_gruppen.standort`, sortiert nach `reihenfolge`. Fehlt die Zuordnung, landet der Sensor unter „Ohne Zuordnung“. |
| Kachel blau/orange/rot nach 7/10 °C | Statusregel oben: Farbe der ganzen Karte + Wort |
| „⚠ Offline“ grau / „⛔ Meldet nicht“ rot | gleich, mit denselben Spalten `grau_nach_minuten` / `rot_nach_minuten` |
| Mini-Sparkline in der Kachel | Sparkline der letzten 6 Std mit gestrichelter Grenzlinie (nur OK/Achtung/Alarm) |
| Verlauf mit Sensor-Auswahl, Zeitwahl mit Schnellbereichen | Detailseite je Sensor. Schnell-Kacheln plus Blatt mit Vorlagen und eigenem Zeitraum. Ab 8 Tagen Tageswerte (Tiefst/Höchst/Mittel). |
| Panel „Tage im angezeigten Zeitraum“ | Zeitachse zeigt Wochentag, Datum oder Monat, je nach Länge |
| Einzelwerte-Tabelle | **entfällt** (v0.2) |
| — (neu) | Liste „Über 7 °C“ mit Dauer, Maximum und Achtung/Alarm |
| — (neu) | Lücken im Diagramm schraffiert als „keine Daten“ |

## 4. Bildschirme

1. **Übersicht.** Kopf: Standortwahl links, rechts Sync-Punkt und Einstellungen. Darunter die Gruppen mit Karten:
   - Raster: hoch 2 Spalten, quer 3, Desktop automatisch, Handy 2 schmale Spalten.
   - Reihenfolge: Standorte mit Alarm/Meldet nicht/Achtung stehen oben, sonst gilt `reihenfolge`.
   - Ganz verlassene Wagen-Standorte bekommen den Zusatz „unterwegs“.
2. **Standortwahl** (Blatt von oben). Pro Standort eine kleine Zusammenfassung. Weicht die Auswahl von der Startansicht ab, zeigt ein Bernstein-Hinweisband „Du siehst nur … · Zurück zu …“.
3. **Detail:**
   - Wertkarte groß
   - Zeitraum-Kacheln mit Zeitraum-Text darunter
   - Diagramm (Tippen zeigt den Wert, bei Tageswerten „max · Ø“)
   - Tiefst/Höchst/Mittel
   - Liste „Über 7 °C“
4. **Zeitraum-Blatt:**
   - Vorlagen als Kacheln (2 Spalten, am Handy 1). Ein Tipp wählt sofort.
   - Darunter „Eigener Zeitraum“: Von/Bis als native Datumsfelder. Das Tablet zeigt sie im Gerätformat TT.MM.JJJJ; die Screenshots zeigen US-Format, weil der Test-Browser so eingestellt ist.
   - Knopf „Zeitraum anzeigen“.
   - **Fehlermeldungen** stehen rot unter den Feldern:
     - „Bitte beide Daten eintragen.“
     - „‚Bis‘ liegt vor ‚Von‘. Bitte die Daten tauschen.“
     - „‚Von‘ liegt in der Zukunft.“
   - Tipp neben das Blatt schließt es.
   - Die Kachel „Zeitraum“ zeigt danach die Wahl („Sep“, „3 Monate“, „2025“, „10.–16.08.“).
5. **Einstellungen** (pro Gerät, localStorage):
   - Startansicht
   - „So wird bewertet“: Erklärung für Mitarbeiter
   - Info mit „Aufzeichnung seit …“
6. **Sonderzustände:**
   - **Ohne Netz:** Sync-Text „Keine Verbindung“ und Hinweisband „Werte von 11:55 Uhr, nicht aktuell“. Der Status wird gegen den Datenstand gerechnet.
   - **Noch keine Sensoren:** ruhiger Leer-Satz.
   - **Zeitraum ohne Daten:** „Keine Messwerte in diesem Zeitraum. Die Aufzeichnung läuft seit 01.07.2026.“
   - **Lädt / Fehler:** nicht im Prototyp. Wie in den Bestell-Sonderzuständen gestalten.

## 5. Abweichungen und Ergänzungen zum Designsystem

- **Status nur zweifach** (Farbe + Wort), **ohne Symbol.** Das ist Max' Entscheidung vom 20.10.2026 und weicht von Grundprinzip 4 ab. Das Wort bleibt immer sichtbar, damit es bei Sonne und Farbschwäche eindeutig ist.
- **Messwert größer als „Inhalt 30 px“:** Barlow Condensed 700, Karte 42 px (Handy 36), Detail 60 px.
- **Bernstein als Status „Achtung“:** der im Designsystem (Abschnitt 4) vorgesehene Sonderfall für echte Dreistufigkeit.
- **„Offline“ als graue Karte:** Grau steht für „nicht verfügbar“.
- **Karten sind komplett tippbar:** keine Karten-Aktion und keine Zwei-Tipp-Logik, weil nichts verändert wird.
- **Diagrammfarben:**
  - Linie `--blau-rahmen`
  - Band `--diagramm-band`
  - über der Grenze `--rot-punkt`
  - Grenzlinie rot gestrichelt
  - Achsentext 16 px
- **Neue Tokens** (in der App-Datei): `--achtung-*`, `--offline-*`, `--diagramm-*`, `--schraffur`.

## 6. Bewusst weggelassen

- **Mehrere Sensoren in einem Diagramm:** bräuchte Deko-Farben je Linie.
- **Einzelwerte-Tabelle, Einklappen:** entfernt in v0.2.
- **Hauptaktion / HACCP-PDF:** Das PDF bleibt vorerst `export/bericht.html`.
- **Kommentare zu Abweichungen:** bräuchten Schreibrecht.

## 7. Daten (Supabase REST, anon-Key, nur lesen)

Wie beim Export-Tool: Projekt-URL und anon-Key einmal pro Gerät eintragen. Es gibt **kein** `postgres_url` im Client.

**Übersicht**
- `GET /rest/v1/sensor_gruppen?select=*`
- Letzte 6 Std aller Sensoren:
  `GET /rest/v1/messwerte?select=sensor,zeit,temperatur_c,typ&zeit=gte.<ISO>&order=zeit.asc`
  - **Supabase liefert standardmäßig max. 1000 Zeilen:** ab 14 Sensoren paginieren.
- Letzter Wert auch für lange stille Sensoren, über eine **neue View**. Diese Migration muss Max ausführen:
  ```sql
  create view letzte_werte with (security_invoker = true) as
    select distinct on (sensor) sensor, zeit, temperatur_c
    from messwerte order by sensor, zeit desc;
  grant select on letzte_werte to anon;
  ```

**Detail bis 8 Tage**
- Rohwerte des Sensors, ca. 2016 Zeilen bei 7 Tagen. Paginieren.

**Detail über 8 Tage**
- **Tageswerte:** Rohdaten wären zu viele (1 Jahr ≈ 105.000 Zeilen je Sensor). Deshalb zweite neue View:
  ```sql
  create view tageswerte with (security_invoker = true) as
    select sensor,
           (zeit at time zone 'Europe/Berlin')::date as tag,
           min(temperatur_c) as tiefst, max(temperatur_c) as hoechst,
           round(avg(temperatur_c), 2) as mittel, count(*) as anzahl
    from messwerte group by 1, 2;
  grant select on tageswerte to anon;
  ```
  Abfrage: `GET /rest/v1/tageswerte?sensor=eq.<name>&tag=gte.<von>&tag=lt.<bis>&order=tag.asc`
- **Liste „Über 7 °C“:** nur die Zeilen über der Grenze holen (`temperatur_c=gt.<grenze>`). Das sind wenige, und daraus berechnet die App die Strecken wie oben.
- **Kennzahl „Tiefst/Höchst“:** aus `tageswerte`. Die genaue Uhrzeit des Höchstwerts kommt aus den Zeilen über der Grenze bzw. einer Einzelabfrage `order=temperatur_c.desc&limit=1`.

Sensoren, die in `messwerte` stehen, aber nicht in `sensor_gruppen`, kommen nach „Ohne Zuordnung“.

## 8. Offene Punkte

- **Fahrzeug oder fest:** `sensor_gruppen` kennt das nicht. Der Prototyp nimmt eine Beispiel-Spalte `art` an ('fahrzeug' / 'fest').
- **Echte Namen:** Sensor- und Standortnamen im Prototyp sind Beispiele. Die echten Namen kommen aus `sensor_gruppen`.
- **Grafana:** parallel weiterlaufen lassen, bis die App sich bewährt hat?
- **Hosting:** GitHub Pages wie die Bestell-App.

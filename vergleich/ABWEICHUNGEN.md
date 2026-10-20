# Abweichungen App ↔ Vorlage v0.3

Stand 20.10.2026, App-Version 0.1.0. Bilder nebeneinander: `vergleich/index.html` (links
`vorlage/screens/`, rechts `vergleich/echt/`, erzeugt mit `python3 werkzeuge/screenshots.py`
aus echten Supabase-Daten).

## Bewusst anders (durch echte Daten oder Auftrag)

| # | Wo | Vorlage | App | Warum |
|---|---|---|---|---|
| 1 | Übersicht | Beispielnamen (Seico, Kühlhaus Tür …) | echte Namen aus `sensoren` (Seiko, Halle, Bunker BN …) | Daten aus Supabase. „Seiko“ heißt in der Bestell-App „Seico“ – bei Bedarf im Admin-Bereich umbenennen. |
| 2 | Karten | „Alarm · seit 25 Min über 7 °C“ | „Alarm · seit mind. 21 Std über 7 °C“ | Die App lädt für die Übersicht nur ab Mitternacht bzw. die letzten 6 Std (Datenvolumen). Beginnt die Strecke am Anfang dieser Daten, kann sie länger sein – dann „mind.“. |
| 3 | Karten hoch/Handy | Statuszeile einzeilig | lange Texte brechen in 2–3 Zeilen um | Folge von 2. Inhalt geht nicht verloren, Karten werden etwas höher. „7 °C“ bricht nie auseinander. |
| 4 | Gruppe „unterwegs“, Wagen-Symbol | Spalte `art` ('wagen'/'fest') | ein Standort gilt als Wagen, wenn **alle** seine Sensoren „Meldet nicht“ erst nach ≥ 240 Min haben (Wagen heute 480, Halle 60) | `sensoren` hat keine Spalte `art`, das Schema ändert nur das Pi-Projekt. Einstellbar im Admin-Bereich je Sensor. |
| 5 | „Am Wagen auslesen“ | Knopf, Blatt, gestrichelte Werte | fehlt | Phase 2 laut Auftrag. „Tablet gehört zu“ ist schon da, Erklärtext: „kommt mit einem späteren Update“. |
| 6 | Einstellungen → So wird bewertet | „seit 15 Min“ / „seit 8 Std“ fest | aus den Sensoren berechnet: „seit 15 Min“, „seit 1 bis 8 Std (je nach Sensor)“ | Halle hat 60 Min, Wagen 480 Min. |
| 7 | Einstellungen → Info | Daten, Aufzeichnung, Version „0.3 · Vorlage“ | dazu: Zuletzt geladen, Daten diesen Monat (ca. MB), Verbindung (Projekt), Knöpfe „Einrichtungslink kopieren“, „Einrichtung ändern“; Version 0.1.0 | Auftrag (Datenzähler, Einrichtung pro Gerät). |
| 8 | Einstellungen | – | neuer Abschnitt „Admin-Bereich · Sensoren verwalten“ | Auftrag (Max, 20.10.2026). |
| 9 | Admin-Bereich | – | Anmelden, Liste „Im Einsatz“/„Ausgemustert“, Bearbeiten/Neuer Sensor, „Änderungen“ (Protokoll) | keine Vorlage, frei gestaltet nach Designsystem; einziger dunkelblauer Knopf je Seite: „Anmelden“, „Neuer Sensor“ bzw. „Speichern“. |
| 10 | Zeitraum-Blatt | Datumsfelder im US-Format (Test-Browser) | TT.MM.JJJJ | wie in VORLAGE.md vorhergesagt (Gerätesprache). |
| 11 | Detail, lange Zeiträume | Tiefst/Höchst aus Tageswerten | aus allen Rohwerten (genaue Uhrzeit von Tiefst/Höchst) | Es gibt keine View `tageswerte`; die App lädt Rohwerte (3 Monate ≈ 18.000 Werte ≈ 120 KB) und rechnet Tageswerte selbst. |
| 12 | Detail „Letzte 3 Monate“ | ab gleicher Uhrzeit vor 3 Monaten | ab Mitternacht dieses Tages | Text „20.07.2026 – jetzt“ ist derselbe; ganze Tage passen besser zu Tageswerten. |
| 13 | Karte ohne Grenze | – | grau, Wert + „keine Grenze hinterlegt“ | Auftrag: nie still „OK“. Heute hat jeder Sensor eine Grenze. |
| 14 | Sync-Punkt | grün | während des Nachladens kurz grau | Rückmeldung „lädt gerade“, Normalzustand bleibt still. |
| 15 | Sonderzustände | „Lädt“ und „Fehler“ nicht im Prototyp | „Lädt die Werte …“ (Dreher), „Keine Verbindung …“, „Zugang abgelehnt … Einrichtung öffnen“, Fehlerband mit „Nochmal“ | gestaltet wie die Bestell-App (Dreher, rote Meldungsfläche). |
| 16 | Zeitraum-Kacheln | Beschriftung „LETZTE/HEUTE“ 15 px (seefisch.css) | 16 px | Auftrag: Text ≥ 16 px. Nur in temperatur.css überschrieben. |
| 17 | Startseite ohne Einrichtung | – | Seite „Einrichtung“ (Projekt-URL + Schlüssel) | Auftrag, wie `export/bericht.html`. |

## Zufällig anders (nur auf den Bildern)

- **Zeitraum-Blatt (08, 19):** In der Vorlage ist der Hintergrund heruntergescrollt (Diagramm sichtbar),
  in der App steht die Seite oben. Beim echten Öffnen aus der Detailansicht bleibt die Scrollposition.
- **Quer (02):** Die echten Standorte haben je 2 Sensoren, die dritte Spalte bleibt frei – wie bei
  „Kühlhaus“ in der Vorlage.
- **„Noch keine Sensoren“ (16):** mit echten Daten nicht darstellbar (es gibt 8 Sensoren). Code vorhanden,
  Text wie Vorlage.
- **Alarm-Szenarien (03, 04):** sind Prototyp-Situationen. Die echten Daten zeigen gerade 4 Wagen-Sensoren
  über 7 °C, weil deren Kühlung aus ist (Max, 20.10.2026: bleibt erstmal so).

## Gleich wie Vorlage (geprüft)

Kopf, Standortwahl mit Zusammenfassung, Hinweisband „Du siehst nur …“, Raster (hoch 2, quer 3,
PC automatisch, Handy 2 schmal), Kartenfarben + Wort ohne Symbol, Sparkline mit Grenzlinie,
Hinweiszeile „Heute … über 7 °C · max …“, Offline grau ohne Kurve, Meldet nicht mit „zuletzt“,
Detail-Reihenfolge hoch und Aufteilung quer/PC, Zeitraum-Kacheln mit Text darunter, Blatt mit
Vorlagen + eigenem Zeitraum + Fehlermeldungen, Diagramm (Grenze gestrichelt, rot über Grenze,
schraffierte Lücken, Tippen zeigt Wert, Tagesband ab 8 Tagen), Liste „Über 7 °C“ mit
Zusammenfassung bei vielen Spitzen, Einstellungen „So wird bewertet“, „Ohne Netz“-Band.

# ASCS Multisensor

Der ASCS Multisensor meldet Präsenz, Temperatur, Luftfeuchtigkeit und Helligkeit an Home Assistant. Drei Erfassungszonen lassen sich auf einer Karte im Browser einzeichnen. Der Zonen-Editor läuft auf dem ESP32 und ist im lokalen Netzwerk erreichbar.

[Zur Produktseite des ASCS Multisensors](https://ascs-online.com/multisensor)

| Sensor | In Home Assistant verfügbar |
| --- | --- |
| LD2450 (mmWave-Radar) | Präsenz, bewegte und stehende Ziele, Zielkoordinaten und Anzahl der Ziele je Zone |
| AM2320 | Temperatur und relative Luftfeuchtigkeit |
| BH1750 | Beleuchtungsstärke in Lux |

## In Home Assistant einrichten

[Zur Schritt-für-Schritt-Anleitung von ASCS](https://ascs-online.com/multisensor-anleitung)

1. Schließe den Multisensor an die Stromversorgung an. Für die WLAN-Einrichtung über Bluetooth muss Home Assistant über einen Bluetooth-Adapter oder einen aktiven ESPHome-Bluetooth-Proxy in Reichweite verfügen.
2. Öffne **Einstellungen → Geräte & Dienste**. Wähle beim neu entdeckten Gerät **Improv via BLE** und übermittle die Zugangsdaten deines 2,4-GHz-WLANs.
3. Sobald der Sensor im WLAN ist, füge das entdeckte **ESPHome**-Gerät hinzu. Seine Messwerte und die Firmware-Update-Entität erscheinen auf der Geräteseite.

Für die **Einrichtung über den Hotspot** verbinde dich mit dem WLAN `ASCS Multisensor Setup`, wenn du das WLAN ohne Bluetooth einrichten möchtest. Trage die Zugangsdaten im Einrichtungsfenster ein. Falls es sich nicht automatisch öffnet, rufe `http://192.168.4.1/` auf. Wechsle anschließend zurück in dein Heimnetz und fahre mit Schritt 3 fort.

## Radarzonen einzeichnen

1. Öffne die IP-Adresse des Sensors im Browser über `http://`. Du findest sie beispielsweise in der Geräteliste deines Routers. Dein Browser muss den Sensor im lokalen Netzwerk erreichen können.
2. Wähle **Zone 1**, **Zone 2** oder **Zone 3**. Mit **Zeichnen** ziehst du ein Rechteck auf. Mit **Anpassen** verschiebst du es oder änderst seine Größe über die Ecken.
3. Wähle den gewünschten Radarfilter. Er gilt für alle drei Zonen. Für die Erfassung ausschließlich in den eingezeichneten Flächen wähle **Nur innerhalb der Zonen erfassen**.
4. Klicke auf **Auf Sensor speichern** und warte auf die Rückmeldung. Gehe anschließend durch die Zone und prüfe in Home Assistant, ob sich die Zielanzahl wie erwartet ändert.

## Firmware aktualisieren

Öffne in Home Assistant die Firmware-Update-Entität des Multisensors und starte die angebotene Aktualisierung. Der ESP32 prüft stündlich das öffentliche Manifest und lädt die passende OTA-Datei über GitHub Pages. Nach dem Neustart zeigt die Entität die installierte Version an. [Update-Manifest](https://ascsadmin.github.io/ascs-multisensor/firmware/manifest.json) · [Releases](https://github.com/ASCSadmin/ascs-multisensor/releases)

## Firmware selbst anpassen

Im ESPHome Device Builder kannst du das entdeckte Gerät übernehmen. Die Hardwarekonfiguration steht in [main.yaml](main.yaml). Die drei Dateien unter [radar/](radar/) enthalten den Browser-Editor und die Anbindung an das Radar.

Für einen eigenen Build im Device Builder lässt sich die Konfiguration als GitHub-Paket einbinden. Bei diesem Import kommen auch die Radar-Dateien aus dem Repository. Verwende ESPHome 2026.11.0 oder neuer für das folgende Beispiel.

```yaml
packages:
  ascs:
    url: https://github.com/ASCSadmin/ascs-multisensor
    ref: main
    files: [main.yaml]
    refresh: 0s
```

## Lizenz

Die von ASCS veröffentlichte ESPHome-Konfiguration, der eigene Radar-Code und diese Dokumentation stehen unter der [MIT-Lizenz](LICENSE). Für ESPHome, ESP-IDF und weitere eingebundene Software gelten die jeweiligen Lizenzen der Projekte.

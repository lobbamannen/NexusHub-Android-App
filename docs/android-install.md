# Klistra in research i NexusHub inkorg

Uppdatera **bara telefonappen** med `nexus-hub-app.apk` ovanpå befintlig NexusHub. Behåll appdata. Klockappen behöver inte uppdateras.

Öppna **NexusHub inkorg → Klistra in text**. En helskärmsruta öppnas. Klistra in hela AI-svaret, granska/redigera och ange valfritt **Källa / AI**, exempelvis DeepSeek. Lämna fältet tomt om du inte vill ange källa. Tryck **Spara** för att först skapa Markdown-filen lokalt och omedelbart försöka spara/verifiera paketet i GitHub. Källan finns separat i paketets metadata och i filnamnet; den läggs inte in i originaltexten. Mermaid, kod, länkar, Unicode och radslut bevaras vid inklistring.

Krysset eller telefonens Tillbaka avbryter utan att skapa en fil. Under pågående Spara väntar rutan på resultatet. Om den lokala sparningen misslyckas behålls texten i rutan. Om GitHub är offline behålls den lokala filen och inkorgen visar väntande status. Använd **Försök igen / Synka nu**; samma fil och identitet återanvänds. Appens befintliga automatiska inkorgssynk försöker också igen i förgrunden. Ingen ny urklippsbehörighet behövs.

# NexusHub Weather V1 + Kalender V2

## Installera
Uppdatera **bara telefonappen** med `nexus-hub-app.apk` från den här releasen, ovanpå befintlig NexusHub. Avinstallera inte och radera inte appdata. Väderfunktionen kräver ingen uppdatering av klockappen och ändrar inte Two Thumbs Batterys intervall/nattpaus.

Öppna NexusHub. Väderindikatorn uppe till vänster i hälsningskortet öppnar den nya vädersidan; GitHub-statusen till höger är kvar. Väder finns också i menyn. Första hämtningen behöver internet. Prognosen sparas sedan på telefonen för app och widget tillsammans.

## Kalender V2
Öppna Kalender i NexusHub, eller tryck på datumdelen i den nya widgeten. Månadsvyn visar händelsenamn direkt i datumrutorna med källans färg. Välj ett datum för att öppna dagens rullbara händelsepanel med fullständiga namn, tider och platser. Kalenderns höjd animeras utan att skala texten. Tryck på samma datum igen, stängknappen eller dra ned panelens handtag för att återgå. Telefonens Tillbaka stänger först händelsedetaljer, sedan dagpanelen.

Månad, Vecka och Agenda finns kvar liksom kalenderkällor, egna utkast, redigering och GitHub-sparning. En tom dag erbjuder Skapa händelse. Telefonens bokningar och platser läses lokalt med befintlig kalenderbehörighet; de kopieras inte till GitHub.

## Datum & väder på hemskärmen
Vädersidan → **Lägg till widget** → bekräfta telefonens dialog. Alternativt: tryck och håll på en tom yta på hemskärmen → Widgetar → NexusHub → **NexusHub · Datum & väder**. Anpassa storleken genom att dra i kanterna.

Widgeten har helt svart bakgrund, centrerad guldsignatur, datum till vänster och väder till höger. Datumdelen öppnar NexusHubs befintliga kalender; väderdelen öppnar vädersidan. Ingen agenda eller händelselista. Inställningen för väderplats är gemensam för widgeten och appen.

## Plats och data
Västra Torup är standard. Tryck på ortnamnet för att söka efter en annan ort eller ange platsnamn, koordinater och tidszon manuellt. Ingen GPS-behörighet krävs och platsen spåras inte. Ortsökning görs endast när du trycker Sök, via Open-Meteo/GeoNames. Direktanrop till väder-/ortstjänster delar telefonens IP och den valda platsen med respektive tjänst; dessa uppgifter skickas inte till PostHog av väderfunktionen.

SMHI SNOW1gv1 är huvudkälla. Vid leverantörsfel kan en sammanhängande MET Norway-prognos ersätta den. Temperatur, nederbörd och symboler blandas aldrig mellan olika leverantörer i en prognoskörning. Väderdata anges med källa och CC BY 4.0; beräkningar och bearbetning beskrivs på vädersidan.

Temperaturen är **prognos nära aktuell tid**, inte en uppmätt stationsobservation. Prognospunktens giltighetstid, hämtningstid och leverantörens referenstid är separata. Saknad information visas med streck. Dygnsmin/max gäller tillgängliga prognospunkter; ofullständiga/glesa dygn markeras. Längden på nederbördsintervallet visas i timmar. Känns som är en beräkning i skugga enligt BOM; soltider är astronomiskt beräknade för platsens datum och tidszon.

## Uppdatering och fel
Ett gemensamt WorkManager-jobb hämtar normalt cirka varannan timme med flex och nätverksvillkor. Alla hämtningar, även manuella, respekterar leverantörens cachetid och begränsningar. En knapptryckning kan därför återanvända giltig cache. Vanlig omritning och storleksändring hämtar inte väder på nytt. MET-fallback görs i bakgrunden endast när väderwidget finns installerad, annars när appen är i förgrunden. Vid HTTP429 väntar vi enligt sparad begränsning; ingen direkt reserv-/återförsöksstorm.

Vid nät- eller schemafel behålls senaste giltiga prognos med tydlig äldre-data-status. En väderplats får aldrig visa en annan plats sparade värden. Vid saknad användbar prognos nära nu visas streck i huvudtemperaturen även om det finns senare prognosdagar. Widgetdatum följer telefonens kalenderdatum och uppdateras med datum-/tids-/tidszonsändringar och ett separat lokalt midnattsjobb, utan väderanrop.

Android kan fördröja bakgrundsjobb; minutexakt väder- eller midnattsuppdatering garanteras inte. Tvångsstopp kan kräva att NexusHub öppnas igen. Det finns ingen vädernattpaus i V1; batteriwidgetens befintliga nattpaus påverkas inte.

## Verifiera på telefonen
1. Kontrollera att startsidans indikator och vädersidan visar samma sparade prognos och källa.
2. Lägg till widgeten, ändra storleken och kontrollera datum→NexusHub Kalender och väder→Väder.
3. Byt ort, kontrollera att gammal orts temperatur inte läcker till den nya. Testa flygplansläge efter en lyckad hämtning och se att cache/status är tydliga.
4. Följ bakgrundsuppdatering, midnatt och faktisk batteriförbrukning med vanlig användning. CI kan testa kod och rendering, men inte Samsung-launcherns fysiska placering eller batteritid.


## Befintlig klock- och batterifunktion
För separat klockinstallation och Two Thumbs Battery, se [batteriguiden](https://github.com/lobbamannen/NexusHub-Android-App/blob/main/docs/battery-widget-install.md). Om den redan fungerar behövs ingen klockinstallation för den här telefonuppdateringen.

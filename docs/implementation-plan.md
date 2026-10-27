# NexusHub Android – historisk grundplan 2026-10-25

**Historiskt underlag:** Detta dokument beskriver den första appversionens avgränsningar. Senare uttryckliga uppdrag har infört full lokal spegling, automatisk GitHub-hämtning, gemensam NexusHub inkorg, native kalender och schemalagd seriebevakning. Formuleringar nedan om inga bakgrundsjobb, ingen full spegling och publicering endast av ett nytt repo är inte aktuella regler för dessa senare uppdrag. Läs README.md och områdeskontrakten för dagens funktioner.

Godkänd omfattning: Robins instruktioner i chatten 2026-10-25. Separat parallell app, originaldesign, befintliga GitHub-format och konfliktregler. Befintliga repositoryn och produktionsdata är skrivskyddade under utvecklingen.

## Arkitektur
React/Vite bygger originalgränssnittet till lokala Android-assets. Befintlig API- och domänlogik återanvänds i processen. Sites D1 ersätts av lokal SQLite (sql.js) och R2 av appens IndexedDB-lagring. GitHub-anrop görs direkt; token krypteras med Android Keystore. Inga bakgrundstjänster eller egen server.

## Uppgifter
- [x] Importera och dokumentera exakt källversion, bevara original CSS och komponenter.
- [x] Implementera D1-/R2-kompatibel beständig lokal lagring och isolera hemligheter från cache/export.
- [x] Kör ursprungliga route-handlers lokalt via en uttrycklig fetch-adapter; beständig kö för försök efter Spara, bevara SHA-konflikter och delresultat.
- [x] Lägg till tokeninställningar och synkstatus utan att ersätta ordinarie gränssnitt.
- [x] Bygg Android-skal med lokala assets, Keystore, filhantering, navigation och stabil paketidentitet.
- [x] Konfigurera reproducerbart GitHub Actions-bygge och stabil signering.
- [x] Verifiera originaldesignfiler, bygg, riktade lagrings-/sparningskontroller och normal navigering. Kör ingen skrivning till riktiga register som test.
- [x] Granska helheten och publicera endast nya apprepot. Redovisa kvarvarande telefonkontroller sanningsenligt.

## Viktiga granskningspunkter
Osäker GitHub-kvittens; samtidiga ändringar; stängning under sparning; privata filnedladdningar; SQL-transaktion och beständig lagring; delad cache kontra osparade utkast; tokenbyte och externa länkar; certifikat vid APK-uppdatering.

## Arbetsbeslut
Användarens instruktion att bygga klart autonomt gäller utan ytterligare planbekräftelse. Nytt tomt repo och separat arbetskatalog ger isolering. Endast nya repot får publiceras. Ingen automatisk full spegling eller schemalagd synk.

## Genomförda kontroller
Se docs/verification.md. Chromium användningskontroller, verklig IndexedDB/WASM, TypeScript och produktionsbygge godkända. GitHub Actions körning 2 byggde signerad release-APK och Android lint utan fel. Den avslutande wrapperanpassningen är byggd i körning 3 och signeringscertifikatet är verifierat identiskt med körning 2. Fysisk telefonverifiering kvarstår enligt verifieringsdokumentet.

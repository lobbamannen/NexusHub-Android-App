# NexusHub Android – implementationplan

Godkänd omfattning: Robins instruktioner i chatten 2026-10-25. Separat parallell app, originaldesign, befintliga GitHub-format och konfliktregler. Befintliga repositoryn och produktionsdata är skrivskyddade under utvecklingen.

## Arkitektur
React/Vite bygger originalgränssnittet till lokala Android-assets. Befintlig API- och domänlogik återanvänds i processen. Sites D1 ersätts av lokal SQLite (sql.js) och R2 av appens IndexedDB-lagring. GitHub-anrop görs direkt; token krypteras med Android Keystore. Inga bakgrundstjänster eller egen server.

## Uppgifter
- [ ] Importera och dokumentera exakt källversion, bevara original CSS och komponenter.
- [ ] Implementera D1-/R2-kompatibel beständig lokal lagring och isolera hemligheter från cache/export.
- [ ] Kör ursprungliga route-handlers lokalt via en uttrycklig fetch-adapter; beständig kö för försök efter Spara, bevara SHA-konflikter och delresultat.
- [ ] Lägg till tokeninställningar och synkstatus utan att ersätta ordinarie gränssnitt.
- [ ] Bygg Android-skal med lokala assets, Keystore, filhantering, navigation och stabil paketidentitet.
- [ ] Konfigurera reproducerbart GitHub Actions-bygge och stabil signering.
- [ ] Verifiera originaldesignfiler, bygg, riktade lagrings-/sparningskontroller och normal navigering. Kör ingen skrivning till riktiga register som test.
- [ ] Granska helheten och publicera endast nya apprepot. Redovisa kvarvarande telefonkontroller sanningsenligt.

## Viktiga granskningspunkter
Osäker GitHub-kvittens; samtidiga ändringar; stängning under sparning; privata filnedladdningar; SQL-transaktion och beständig lagring; delad cache kontra osparade utkast; tokenbyte och externa länkar; certifikat vid APK-uppdatering.

## Arbetsbeslut
Användarens instruktion att bygga klart autonomt gäller utan ytterligare planbekräftelse. Nytt tomt repo och separat arbetskatalog ger isolering. Endast nya repot får publiceras. Ingen automatisk full spegling eller schemalagd synk.

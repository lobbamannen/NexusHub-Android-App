# Verifiering 2026-10-25

## Utfört

- Samtliga 150 hämtade originalfiler jämfördes mot GitHubs Git-blob-SHA: full matchning med originalets källträd.
- `npm run build`: godkänt produktionsbygge med lokalt paketerad SQLite-WASM.
- `npm run check`: godkänd TypeScript-kontroll.
- `npm run check:design`: 42 originalfiler kontrollerade; all CSS och originalresurser byteidentiska. Tre komponenter har dokumenterade transport-/ångraadaptrar.
- Chromium vid mobilstorlek 412×915: startsida, register, favoritutkast utan skrivning, Ångra, uttrycklig sparning, bevarade orelaterade metadata, misslyckad sparning och beständig kö, Ångra av väntande sparning och ingen automatisk nätåterspeling, berättelsebibliotek/läsare, direkt Läst-markering, verkligt renderade bilder via lokalt API samt omladdning utan runtimefel. Samtidig extern ändring stoppades med SHA-konflikt utan skrivning; en ogiltig ersättningstoken lämnade den fungerande token orörd.
- Dessa användningskontroller använde isolerade GitHub-svar och fångade skrivningar. Inga riktiga innehållsregister ändrades för testning.
- Verklig Chromium IndexedDB och sql.js-WASM: fullständigt sjutabellsschema, SQLite JSON, atomisk rollback, injicerat lagringsfel, tolv samtidiga serialiserade skrivningar, KV, bevarade binärbytes/MIME/strömmar, återöppning av lagring samt token utanför databasexport.
- Riktade befintliga domänkontroller: 31 beteendekontroller godkända. Ett äldre Site-test matchar källkodens blanksteg med regex och faller redan mot den importerade originalkoden; det är inte ett test av appens faktiska funktion. Det aktuella Vill se-beteendet och originalkällan måste bedömas utifrån kod/användning, inte den föråldrade formateringsassertionen.
- Oberoende kodgranskning fann ångring av köade försök, bakgrundsåterspelning med gammal SHA, tokenbyte före validering, SAF-export vid Activity-återskapning samt katalogcache vid nätverksfel. Dessa rättades före leverans.

## APK-bygge

GitHub Actions kör det riktiga Android-bygget. Första körningen identifierade att SDK-installationsstegets standardpaket `tools` har tagits bort. Workflowet använder nu uttryckligen `platform-tools`, samma fungerande anpassning som Cortex.

Körning 2 och 3 är godkända: Android release-APK byggd, Android lint godkänd, APK-signatur verifierad och installationsfil publicerad. Körning 3 innehåller även den befintliga wrapperns systemfältsfärger och navigationsavstånd. Certifikatets SHA-256 är samma i båda APK:erna: `7a16fa6a685f8879d7b3eea3e4b29ef9a4092d3d1ba69abe3bcbaeab2a8756b4`.

Leverans: https://github.com/lobbamannen/NexusHub-Android-App/releases/tag/app-v1.0.3

Bygge: https://github.com/lobbamannen/NexusHub-Android-App/actions/runs/40196488832

## Återkoppling från faktisk användning

Robin installerade appen på sin Samsung 2026-10-25 och uppgav att allt såg ut att fungera. Skärmbilder visar anslutning och hämtad GitHub-katalog i originalgränssnittet. En verklig filmstatusändring för *A Wrinkle in Time* (2018), IMDb `tt1620680`, verifierades i Databas genom commit `4dd59135f1f4c3daa395d591ab0c1653703093f4`. Detta är bevis för den sparningen, inte ett påstående om filmens nuvarande status eller att alla funktioner är testade på telefon.

Robin väljer nu Android-appen för daglig användning. Siten behålls som arkiverad version utan löpande utveckling.

## Kvarvarande telefonverifiering

Följande kräver den faktiska Samsung-telefonen och Robins token: Keystore över verklig APK-uppdatering, Androids systemfilväljare/delningsappar, systemfält/tangentbord och pixeljämförelse mot installerad Site-wrapper. Ingen sådan fysisk telefonverifiering har utförts i utvecklingsmiljön.

## Arbetsbeslut

- Originalets route-kontrakt återanvänds lokalt för att minska risken att domänregler förändras. SQLite är ett kompatibilitetslager för originalets SQL, ingen server.
- Väntande sparningar spelas inte upp automatiskt vid start/återgång/nätanslutning. Återförsök sker vid nytt uttryckligt Spara eller via Inställningar; detta bevarar redigerings- och SHA-beteendet utan att införa bakgrundskonflikter.
- En opublicerad draft release förvarar signeringsidentiteten så att inget manuellt nyckelsteg behövs. Valvet får aldrig publiceras eller raderas.
- Ingen kopiering från befintlig Sites-lagring har gjorts. Appbygget lämnade den befintliga Site-koden och innehållsregistren orörda; gemensam dokumentation uppdateras separat.

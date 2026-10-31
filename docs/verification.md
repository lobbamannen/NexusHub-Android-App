# Verifieringsöversikt – 2026-10-31 (dokumentationssynk)

## Idé 35 – pågående samlad rättning

[PR #4](https://github.com/lobbamannen/NexusHub-Android-App/pull/4) innehåller
fokuserade rättningar av den ursprungliga granskningens 26 fel/risker och
5 förbättringar. De nya, aktuella regressionstesterna körs separat från
historiska Site-tester. En godkänd testsvit betyder inte att de gamla Site-testerna
är gröna. Databas-original, sparade utkast och väntande GitHub-operationer
omstruktureras inte.

GitHub Actions verifierar TypeScript, designoriginal (36 hashkontrollerade,
6 undantagna), riktade Node-regressioner och produktionsbygge. Den signerade
Android-APK:n måste dessutom byggas och kontrolleras; faktisk installation,
Gemma/EmbeddingGemma-samspelet och NPU-hårdvara kräver separat telefonprovning.

Kända avgränsningar: delade original större än den nuvarande säkra
Base64-transportbudgeten bevaras med en synlig felstatus i stället för att
orsaka upprepad OutOfMemoryError. Ingen automatisk TTL-rensning av kvittenser
eller raderingsskydd har införts. Modulvis koddelning kräver en uppmätt
telefonvinst innan den ska behållas.

Den här översikten skiljer aktuell implementerad kod från tidigare dokumenterade Actions-/enhetstester. Äldre avsnitt nedan är bevarad historik och får inte tolkas som verifiering av nyare Gemma- eller EmbeddingGemma-funktioner.

## Status och kontrollkällor
- **Gemma 4 E2B:** gemensam import-/inferensruntime och profilkontrakt, tillhörande Kotlin- och React-kod, testspecifikationer och [runtimebeskrivning](gemma-runtime.md). Tidigare faktisk Gemma-inferens på Galaxy S26 Ultra är belagd som separat äldre test; senare livscykelförändringar kräver ny fysisk verifiering.
- **EmbeddingGemma 2 270M:** separat CPU-baserad LiteRT-LM-modellimport, dokument-/query-embedding, hybridrankning, lokalt versionsbundet index, idéförslag och Retrieval Lab är kodlagda; se [implementation och provplan](embeddinggemma2-ideas.md). Fysisk modellimport, indexets fullständighet, svarskvalitet, RAM-/CPU-profil samt samexistens med Gemma 4 är ännu inte slutverifierade i en installerad signerad APK.
- **Connections/Graph, Guardian, Command, läsande Cortex-vy:** dokumenterad testomfattning och tidigare automatiska resultat finns i [connected-library-verification](connected-library-verification.md); användarens aktuella telefondata är inte kontrollerade här.
- **Bakgrundssynk och aktivitetslogg:** Android WorkManager för beständigt mottagningsarbete och SQLite-händelsejournal finns i koden. [Genomförandeplanen](superpowers/plans/2026-10-30-background-sync-activity.md) uppger lokalt passerad obligatorisk JavaScript-svit och kvarstående native-/UI-/publiceringskontroller.
- **GitHub original och lokalt index:** inga modellgenererade svar eller vektorer får beskrivas som kanoniska GitHub-register. Automatisk mottagningsuppladdning får inte sammanblandas med automatisk återspelning av osparade redigeringsutkast.

## Verifieringskrav före påstående om full produktleverans

1. Bekräfta rätt kodrevision och godkänd Actions-körning inklusive signerad telefon-APK, Androidtester, native-bindningar och relevanta UI-tester.
2. Installera rätt APK ovanpå befintlig version på Samsung. Bekräfta verklig GGUF-import, Gemma WARM/COLD, sampling utan onödig modellomladdning, avbryt, minnestryck och återupptagning.
3. Importera verklig EmbeddingGemma 2 `.litertlm` och verifiera SHA, dokument- och query-vektorer, hybrid-/lexikal fallback, ändrad käll-SHA, avbrott/indexåterupptag, ett och flera dokument samt källhänvisning utan påhittade belägg.
4. Kontrollera verklig inkorgsleverans vid appbyte/offline/återanslutning, loggexport, konflikt, radering medan uppladdning väntar och att osparade utkast **inte** skickas automatiskt.
5. Registrera fysisk enhetsverifiering och aktuell release/Actions-länk här först när den har observerats. Ingen signerad APK eller faktisk telefonsuccé påstås genom enbart dokumentationsändringen.

---

# Aktuell verifieringsöversikt – 2026-10-27

## Senaste appleveransen och dokumentationssynk

- APK 1.0.47: [Actions 40540366871](https://github.com/lobbamannen/NexusHub-Android-App/actions/runs/40540366871) har slutförts med success. Versionsskyddad inkorg, flerval, synlig återförsökning, innehållshashar för dubbletter och bakåtkompatibelt namnbyte ingår. 105 releaseavgränsade Node-tester samt TypeScript, produktionsbygge och kontroll av 42 designoriginal passerade vid leveransen. De historiska gamla Site-testerna är inte därmed en helt grön fullsvit.
- Databasens 19 då befintliga mottagningspaket flyttades till NexusHub inkorg. Dokument-/bild-/textoriginalens blob-SHA:n bevarades; metadata uppdaterades för de nya sökvägarna. Detta är en daterad migrationskontroll, inte aktuellt dokumentantal. Gamla Mottagningsinkorg/README.md är en vägvisare.
- Daglig bevakning omkring 15.00 Europe/Stockholm har schemakontroller och native byggverifiering. Robin har tidigare visat en faktisk Gold Rush-notis på telefon och klocka samt fynd i appen. Det är inte i sig bevis för en senare specifik schemakörning kl. 15.
- Flerval och den senaste inkorgens retry-/dubblettgränssnitt behöver fortfarande bekräftas i verklig användning på Samsung. Ingen visuell browserkontroll av de senaste startsidesändringarna har utförts efter miljöns säkerhetsblockering. Kodkontroller och renderer är inte fysisk användning.
- Denna dokumentationssynk ändrar inga appfunktioner eller personliga register och kör inte om APK-bygget. Ursprungliga daterade resultat nedan bevaras som historik.

---

# Verifiering 2026-10-25

## Idéinkorg och ekonomirättningar – 2026-10-25

- Tidigare opublicerad idéimplementation förenades med ekonomi-main `c51e1a1`. Startsideskort, plusmeny, inkorg, redigering av samma idé och statusarna Ny/Undersöks/Genomförd/Avfärdad är implementerade. Databasens nya `Ideer/README.md` och `schema.json` beskriver kontraktet; inga påhittade idéposter skapas vid installation.
- 34 riktade tester för idé- och ekonomidomänen passerar, inklusive nya regressioner för kommaalias, nettopris efter varurabatt och exakt avgränsad annullering. De tre ekonomiregressionerna kördes först röda och sedan gröna.
- Chromium i mobilstorlek 412×915 med verklig IndexedDB/WASM och isolerad GitHub-transport: skapa idé utan titel, behåll utkast över omladdning, fortsätt skriva i samma fil, samtliga statusar och filter, väntande sparning över omstart, uttryckligt återförsök, SHA-konflikt utan överskrivning, visning/val av GitHub-version, Ångra och förlorad PUT-kvittens utan dubbelskrivning. Inga riktiga innehållsregister användes för testskrivningar.
- Samma browserkörning verifierade ekonomi: synligt sparfel inne i editorn, väntande status, Avbryt tömmer rätt köpost, film-/berättelsekassering behåller orelaterad ekonomi, målregister låses efter ett sparförsök, gruppbyte låses efter misslyckad aliaskoppling, annullering lämnar ingen dold köpost och oförändrat kommaalias bevaras genom verklig katalogeditor/route/PUT.
- Kodgranskningen hittade och föranledde rättningar av tidig listläsning kring idésparning, annulleringsomfång och målbyte efter ett sparförsök. Original-CSS/resurser är bevarade; home-komponenternas uttryckliga idéadapter är dokumenterad i designkontrollen.
- Hela Node-sviten: 122 godkända av 131, samma nio historiska fel som den föregående verifierade versionen: affischimport (2), mirror.test (1), serie-UI (4), Site-integritet (1), upload-api.test (1). Dessa är inte nya fel från idé-/ekonomirättningarna.
- TypeScript, produktionsbygge och designkontroll passerar lokalt. Actions kör nu även typecheck, designkontroll och de riktade idé-/ekonomitesterna före APK-bygget. Byggstatus och publicerad installationsfil ska verifieras separat efter push.
- Ej utfört här: installation av denna nya APK på Robins Samsung eller test med hans riktiga token. Stabil paketidentitet, signeringsflöde och lagringsidentitet har inte ändrats.


## Intelligent ekonomi och artikelkatalog – tillägg 2026-10-25

Den nya ekonomifunktionen är en **ren läsprojektion** av periodfilerna plus två centrala katalogfiler. Ingen av de äldre 24 köpposterna eller de 156 importerade artikelraderna ändrades vid införandet.

- `Ekonomi/Katalog/kategorier.json` och `Ekonomi/Katalog/produkter.json` skapades och återlästes från `lobbamannen/Databas`; de nedladdade filerna matchade exakt skapade byteinnehåll. Katalogen täcker alla 47 etiketter som finns i de 156 artikelraderna, men innehåller bara fem säkert identifierade exakta produkter.
- Verklig oktobersammanställning med katalogen och den riktiga periodfilen: **24 köp, 156 artikelrader och 8 358,34 kr**. Summan av visade kategorier (inklusive ospecificerat/pant/nettorabatter) är också **8 358,34 kr**. Skillnad mellan specificerade kvittons artikel- och köpbelopp: **0 kr**. Tre köp utan artikelrader motsvarar **758 kr**; dessutom är två äldre artikelbeskrivningar ospecificerade och visas för manuell granskning.
- 26 nya rena beteendetester kontrollerar exakt produkt kontra generellt kvittonamn, kategoriflytt utan historikändring, säker rabattkoppling utan delsträngsträffar, pant, ofullständiga kvitton, faktisk ekonomiperiod, produktgrupper, prisjämförelse med faktisk mängd, katalogschema, förbjudna alias över båda katalogerna, fixerade GitHub-skrivvägar, förlorat GitHub-svar och intakta artikel- och rabattreferenser vid redigering.
- Den oberoende kodgranskningen föranledde en samlad åtgärdsrunda: explicit säker rabattmålskontroll, löpande produktgruppssumma inklusive ospecificerat, prioritet för nästa kända löneperiod, gruppöversikt i gränssnittet, säker borttagning/namnändring av kvittorad, tvärvalidering av alias samt fortsatt åtkomst till grundregistret om en katalogfil inte kan läsas.
- TypeScript-kontroll och React-produktionsbygge kördes lokalt. APK-byggandet sker i GitHub Actions och ska redovisas separat när det har körts.
- Hela äldre Node-testsviten har nio andra kända fel: affischimport (2), `mirror.test` (1), serie-UI (4), Site-integritet (1), `upload-api.test` (1). **Exakt samma nio fel reproducerades i en ren kopia av föregående `main` (8c21ff0)**: den gamla versionen hade 88 godkända/97 totalt och den nya 106 godkända/115 totalt. Inga nya fel observerades.
- `npm run check:design` rapporterar `components/home/ModuleGrid.tsx` även i den rena föregående versionen, eftersom originaldesignens jämförelselista inte uppdaterats för ett tidigare tillägg; ekonomiändringen berör inte den filen.

**Ej verifierat här:** verklig Android-telefon, grafisk pixeljämförelse och en sparning från den nya katalogredigeraren med Robins token. Första kvittot via ChatGPT kräver fortsatt manuell kontroll av kvittoidentifiering och SHA-skrivningen i den befintliga chatten; denna app ersätter inte dess OCR-verktyg.

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

## Leverans av idéinkorg och ekonomirättningar

Actions-körning 16 har byggt signerad release-APK, kört Android lint och verifierat APK-signaturen. Workflowets nya typecheck, designkontroll och riktade tester passerade före Android-bygget. Den stabila signeringsidentiteten återställdes genom befintligt signing-vault-flöde; ingen ändring av paketnamn, WebView-origin eller lokal lagringsidentitet har gjorts.

- Kodcommit: `2d16fda56940ec16218090938c65dddf97d287c4`.
- Bygge: https://github.com/lobbamannen/NexusHub-Android-App/actions/runs/40220162595
- Publicerad release: https://github.com/lobbamannen/NexusHub-Android-App/releases/tag/app-v1.0.16
- APK: https://github.com/lobbamannen/NexusHub-Android-App/releases/download/app-v1.0.16/nexus-hub-app.apk (2578612 bytes).
- `Ideer/README.md` och `Ideer/schema.json` i Databas återlästa och verifierade. Github-Databas 1.0.7 publicerad och synkad till pluginrepot med återlästa källfiler.
- Installera ovanpå befintlig app; telefonverifiering av denna version återstår till Robins normala användning.

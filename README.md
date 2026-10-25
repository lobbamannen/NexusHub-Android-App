# Nexus Hub App

Självständig Android-version av Nexus Hub. Appen kör det verkliga React-gränssnittet lokalt och kommunicerar direkt med GitHub. Den tidigare Siten och dess Android-wrapper bevaras som arkiverade versioner.

## Användning och underhåll

Robin använder sedan 2026-10-25 Android-appen som sin huvudsakliga NexusHub. Siten är en arkiverad version och ska inte vara mål för löpande utveckling eller publicering. Dess befintliga kod och driftsättning lämnas orörda; GitHub-innehållet flyttas inte.

| Vad ändras? | Var görs det? | Leverans |
|---|---|---|
| Dokument, register, betyg, lässtatus och bilder | Befintliga sökvägar i [Databas](https://github.com/lobbamannen/Databas) | Hämtas av respektive klient; ingen ny APK behövs för innehåll som redan stöds. |
| Android-appens funktion eller utseende | Detta repository | Bygg en ny signerad APK och installera ovanpå den befintliga appen. |
| Den arkiverade Sitens kod | [NexusHub](https://github.com/lobbamannen/NexusHub) | Ingen löpande publicering; ändring kräver ett uttryckligt beslut att återuppta Site-arbete. |
| Pluginpaket och katalog | [ChatGPT-Plugin](https://github.com/lobbamannen/ChatGPT-Plugin) | Följ respektive plugins publiceringsflöde; GitHub-källa och installation i ChatGPT är skilda saker. |

Ändra inte databasens format eller skapa dubbla register för Android. Android använder samma GitHub-filer som den arkiverade Siten. En arkiverad driftsättning som fortfarande går att öppna är inte automatiskt en fryst ögonblicksbild av dessa filer. Telefonens väntande sparningar kan inte verifieras genom att bara läsa GitHub. Kodändringar i en version förs inte automatiskt över till den andra.

## Installera och anslut

1. Öppna **Actions → Build Nexus Hub App APK → Run workflow**. Push till `main` bygger också appen.
2. Hämta `nexus-hub-app.apk` från den färdiga körningens Release eller artefakten `nexus-hub-app-apk`.
3. Installera appen. Den heter **Nexus Hub App** och kan finnas bredvid den tidigare Nexus Hub-appen.
4. Ange en fine-grained GitHub-token vid första start. Välj `lobbamannen/Databas` och `lobbamannen/ChatGPT-Plugin`. Ge **Contents: Read and write** (appen skriver endast i Databas och använder plugin-repot för läsning).

Token kan senare bytas under **Inställningar & system → Android-app & GitHub**. Kandidaten kontrolleras innan en befintlig token ersätts. Token krypteras med AES/GCM och Android Keystore och ligger utanför synk, exporter och källkod. Vanliga APK-uppdateringar bevarar token. Utgången/återkallad token, avinstallation, rensad appdata eller byte av telefon kan kräva ny inmatning. Välj lämplig giltighetstid i GitHub.

## Samma innehåll och arbetsflöden

- GitHub är gemensam beständig källa för Siten, appen och ChatGPT.
- Befintliga filer, registerformat och originalvägar används utan omstrukturering.
- Spara/Ångra, separata betygsskalor, favoriter, Sparad/Läst och verifierade säsonger behålls.
- Ingen Firebase, egen backend eller schemalagd bakgrundstjänst används.
- Register och dokument hämtas vid användning. Den valfria spegeladministrationen finns kvar men ingen full kopiering startas automatiskt.
- Lokal lagring består av SQLite/IndexedDB för metadata och cache samt IndexedDB för bild-/originalbytes och väntande sparningar.

En sparning säkras lokalt innan GitHub-anropet startar. En verifierad GitHub-kvittens krävs innan gränssnittet säger att den är sparad i GitHub. Vid nätverksfel behålls utkast och en beständig köpost. Tryck **Spara** igen för att försöka igen med samma väntande ändring, eller hantera den i **Android-app & GitHub**. Inga köade sparningar spelas upp automatiskt bakom en öppen redigering. Ångra eller bekräftad kassering av redigeringsutkast tar även bort motsvarande väntande redigeringsförsök.

SHA-konflikter stoppas och kräver omläsning/beslut. Appen byter aldrig ut en gammal versionsnyckel för att tvinga igenom en gammal ändring. Osäkra kvittenser kan kontrolleras mot aktuell GitHub-data innan nytt försök. En ändring i Siten eller ChatGPT hanteras som en samtidig extern ändring.

## Ekonomi: kvitton, kategorier och produktkunskap

Ekonomi är en egen sida med tre undervyer: **Register** (budgetar och gemensamma köp), **Analys** (kategorisummor per verklig utbetalningsperiod) och **Kategorier & produkter** (redigerbar gemensam katalog). Samtliga är byggda på det befintliga svarta materialtemat med grön ikon och diskret grön bottenfade.

| Databasfil | Funktion |
|---|---|
| `Ekonomi/Gemensamt/<år>/<utbetalningsdatum>.json` | **Enda originalet** för gemensamma köp, artiklar, priser, rabatter och pant i en utbetalningsperiod. |
| `Ekonomi/Katalog/kategorier.json` | Huvudkategorier, produktgrupper, alias för generella kvittonamn och mappningar av äldre artikelkategorier. |
| `Ekonomi/Katalog/produkter.json` | Endast säkert identifierade produkter och alternativa kvittonamn, med eventuell verifierad förpackningsstorlek. **Inga kopior av kvitton eller priser.** |
| `Ekonomi/Robin/budget.json`, `Ekonomi/Rebecca/budget.json` | Budgeterade inkomster och fasta utgifter, inte ytterligare kvittoköp. |

### Ett kvitto, en skrivning

1. Robin skickar bild/PDF på kvitto till sin befintliga ChatGPT-chatt. **OCR och AI-förståelse sker där, inte i NexusHub-appen.**
2. Chatten verifierar butik, köpdatum, totalsumma, radbelopp, rabatter och pant och kontrollerar befintlig period mot dubbletter. Samma kvitto får inte ett nytt köp-ID vid omsändning. Särskilt säker kvittoreferens eller jämförelse av datum/butik/belopp/artiklar behövs för att upptäcka dubbletter med nya ID:n; GitHub hindrar automatiskt endast identiska post-ID:n vid appens egen sparning.
3. Chatten skriver **en** ändring i lämplig periodfil efter kontroll av GitHub SHA. Den ska inte också skriva separata kopior av köpet i produkt- eller kategorikatalogen.
4. NexusHub läser periodfiler + katalog och kategoriserar deterministiskt utan nätbaserad AI för varje visning. Kända exakta produkter matchas till produkt-ID, generella varunamn till produktgrupp; äldre etiketter används som reserv. Nya/oklara namn markeras för granskning.
5. Robin kan ändra kategori, produktgrupp, säkra alias eller förpackning i katalogundervyn. Katalogändringen SHA-sparas separat och räknar om historiska analyser **utan att skriva om gamla kvitton**. Framtida kvittoimport behöver inte redigera katalogen vid varje köp.

En bred kvittotext som `VÅTSERVETTER` ger gruppen **Våtservetter** men inte ett påhittat varumärke eller 72-pack. En säker fullständig variant kan få eget produkt-ID och användas för prisjämförelser, men bara när köp av samma produkt och jämförbar mängd finns. Det finns ingen automatisk produktinlärning som skriver till GitHub i bakgrunden.

### Ekonomiperiod och sanningsenlig statistik

- En månad är **från faktisk utbetalning till nästa utbetalning**. Periodfilens `start_date` är auktoritativt; om `end_date` saknas kan appen härleda sista dagen enbart när nästa verkliga periodstart finns. Appen gissar inte att det alltid är den 19:e.
- Analys summerar artikelrader i heltalsöre och stämmer av dem mot köpens registrerade total. Rabatt som entydigt kopplas till en vara minskar den kategorin; otydliga bonusar och pant särredovisas. Ingen artikel läggs ovanpå köptotalen som en ny kostnad.
- Köp utan artikelrader och beloppsavvikelser visas som **ospecificerat**, inte som säker mat-, godis- eller babykonsumtion. Budgetposter och interna kontoöverföringar räknas inte som extra gemensamma köp.
- Historisk import (`Ekonomi/Import/`) behålls oförändrad som källa. Kategorikatalogen täcker 47 historiska artikelbeteckningar; den innehåller från början endast några få säkert identifierade exakta produkter. Katalogen kan utvecklas efterhand.
- Appens katalogredigering använder samma verifierade SHA och beständiga väntande sparningar som övriga ekonomiregister. Vid konflikt behövs omläsning; gammal data skrivs inte över automatiskt.

## Originaldesign

Gränssnittet hämtades från `lobbamannen/NexusHub`, källträd `8b550f150035d8214b1c648ff2ff7f1e79f3249d`. `docs/source-provenance.json` innehåller SHA-256 för originalets designfiler. All CSS, inbäddade typsnitt, SVG och huvuddelen av komponenterna är oförändrade.

Avgränsade anpassningar ändrar transport och säker kassering, inte presentation:

- Affischer och originalbilder hämtas genom det lokala API:t och får blob-URL:er. Lazy loading behålls.
- Spar-/ångraflödena avbryter motsvarande väntande GitHub-försök.
- Androids anslutningsinställningar är ett tillägg på inställningssidan.
- Sites-/R2-formuleringar om lokal lagring har anpassats till telefonen.

## APK-identitet och signering

- Paketnamn: **`se.lobbamannen.nexushub.app`**.
- WebView-origin: **`https://appassets.androidplatform.net`**.
- Lokal lagringsidentitet: **`nexus_hub_android_v1`**.
- Versionskod hämtas från GitHub Actions körningsnummer.

Första Actions-bygget skapar en beständig signeringsnyckel och sparar den som en tillgång i en **opublicerad draft release** med namnet **PRIVATE ANDROID SIGNING VAULT — NEVER PUBLISH OR DELETE**. GitHubs åtkomst till draft-releaser kräver skrivrättighet till repot. Ingen privat nyckel ligger i källkoden eller APK-artefakten.

**Publicera, radera eller byt aldrig namn på denna signing-vault.** Den används av alla framtida APK-byggen. En separat markör gör att bygget avbryts om nyckeln saknas i stället för att skapa en inkompatibel ersättare. Behåll gärna en privat säkerhetskopia av vaultens tillgång. Vid avbruten allra första etablering kan originalvalvet behöva återställas innan ett nytt bygge.

Installera senare APK:er ovanpå appen. Avinstallera inte och rensa inte appdata för att uppdatera. Lokala debug-byggen har en annan signeringsidentitet; använd det signerade Actions-bygget för normal användning.

## Utveckling

Node 22+, Java 17, Android SDK 35 och Gradle 8.11.1.

```sh
npm ci
npm run dev
npm run check
npm run check:design
npm run build
node --test tests/economy-*.test.mjs
gradle :app:assembleDebug
```

Webbförhandsvisning använder token endast i minnet under sessionen. Android-funktioner kräver APK:n. GitHub Actions bygger och signerar utan att en privat nyckel behöver läggas in manuellt.

Viktiga filer:

| Plats | Ansvar |
|---|---|
| `app/`, `components/`, originalets CSS | NexusHubs gränssnitt och återanvända route-handlers |
| `lib/` | Originalets domänregler, GitHub-klient och dokument-/bildlogik |
| `platform/api.ts` | Lokal dispatch av de ursprungliga API-kontrakten |
| `platform/local-store.ts`, `storage-schema.ts` | Beständig D1-/R2-kompatibel lokal lagring |
| `platform/outbox.ts` | Beständiga sparförsök, kvittenser och konflikter |
| `platform/resources.tsx` | Bildtransport och filöverföring till Android |
| `src/AndroidSettings.tsx` | Token och hantering av väntande sparningar |
| `app/src/main/java/` | Android-skal, Keystore och filhantering |
| `.github/workflows/android-apk.yml` | APK-bygge och publicerad installationsfil |

Äldre Site-poster som enbart finns i Sites D1/R2 kopieras inte automatiskt till den här appen. GitHub-innehållet är gemensamt. Befintliga Site-data lämnas orörda. Gamla `copy:`-bokmärken kan därför sakna en lokal originalkopia i Android; appen ska inte låtsas att dessa bytes finns.

## Verifiering

Se `docs/verification.md` för utförda kontroller och gränsen mellan lokal granskning, APK-bygge och faktisk användning på telefon.

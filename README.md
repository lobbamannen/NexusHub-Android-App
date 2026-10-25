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

# NexusHub Android → PostHog: komplett implementationsplan

**Status:** färdigutvecklat genomförandeunderlag, ännu inte implementerat.  
**Originalidé:** nr 15, 1d4a4c5c-4803-46b1-aca8-298cd4f6621f; Databas/Ideer/1d4a4c5c-4803-46b1-aca8-298cd4f6621f.json; läst Git-blob 8a20b348cfbc07de5cac9f21b301f100c1ad11aa.  
**Kartlagd appversion:** lobbamannen/NexusHub-Android-App, main a056b28e616b14029135326b7878e31d2ee39177, 26 oktober 2026.  
**Primärt mål:** förstå faktisk användning, funktionsfel, synkkvalitet och laddtider från Samsung-appen utan att föra över privat NexusHub-innehåll till PostHog.

## 1. Slutlig funktion sedd från användarens perspektiv

När den färdiga APK:n installeras finns under Inställningar → Android-app & GitHub en diskret rad **Diagnostik och användningsstatistik** med status och strömbrytare. Spårning är initialt **av** tills Robin uttryckligen aktiverar den. Texten förklarar att endast tekniska, i förväg definierade händelser och generella kategoriresultat lämnar telefonen; aldrig film-/serietitlar, söktermer, berättelsetexter, kvitton, kronor, kalenderinnehåll, idétexter, bilagor eller tokens.

Efter aktivering går det i ett eget PostHog EU-projekt **NexusHub Android** att se:
- Appstarter, öppnade moduler och övergångar (inklusive skärmnamn, inte öppnade objekt).
- Synk: hur ofta en faktisk ändring hämtas, varaktighet, antal filer och bytes, felkategori, paus/återuppta.
- Lokal läsning/cache: träff/miss, tider och om ett nätverksanrop behövdes; bilder som laddar långsamt.
- Sparningar: först när GitHub bekräftat sparning, väntande kö, konflikter, misslyckade försök; ingen filväg eller data.
- Aktiviteter i film/serier, berättelser, idéer, mottagning, ekonomi och seriebevakning på enbart händelse-/modulnivå.
- Diagnostik per appversion, Android-version och byggtyp. Inga inspelningar av skärmen i denna version.

Spårningen ska aldrig påverka normal navigation, lokal cache, GitHub-skrivningar, notifieringar, befintliga UI-färger eller appens start.

## 2. Verifierad nulägesarkitektur

- Native Kotlin-Activity är app/src/main/java/se/lobbamannen/nexushub/app/MainActivity.kt. Den laddar lokala Vite/React-filer i WebView via WebViewAssetLoader med ursprung https://appassets.androidplatform.net.
- Android har redan INTERNET-behörighet, minSdk 26, targetSdk 35, paketnamnet se.lobbamannen.nexushub.app och en stabil release-signeringsväg. Ingen extra Android-behörighet behövs för analytics.
- Ursprungsbegränsade WebView-meddelanden hanteras av NexusMessageBridge.kt: WebViewCompat.addWebMessageListener för endast huvudram och exakt lokal origin. Klientsidan använder nativeCall i lib/calendar/native-client.ts. Det är den naturliga, redan granskade kanalen för React → Kotlin.
- src/main.tsx initierar beständig lagring, intern lokal API-hantering, resurser, React, replika- och bevakningssynk. app/portal.tsx äger huvudnavigationen (view/hash, dirty guards). 
- platform/replica-sync.ts har rapporterad synkstatus och händelsen nexus-replica-status; platform/api.ts har lokal-first-läsning och intern /api-routning; platform/outbox.ts har beständig skrivkö och nexus-write-completed efter verifiering.
- Appfunktionerna finns i app/films.tsx, app/series.tsx, app/stories.tsx, components/media/MediaRegister.tsx, components/ideas/use-ideas.ts, components/ideas/IdeaPlans.tsx, app/economy.tsx, components/personal/IncomingInbox.tsx, components/watch/ReleaseWatch.tsx samt platform/watch-sync.ts.
- Projektet har i dag ingen PostHog-dependency i app/build.gradle.kts eller package.json och ingen installerad NexusHub-telemetriadapter i trädet som granskats. PostHog-kontot har bara projekt 280222 / Default project där Cortex Scout används.
- Existerande GitHub Actions .github/workflows/android-apk.yml kör npm ci, TypeScript, designkontroll, tester, Vite-build, Gradle unit/lint/assembleRelease, signaturkontroll och publicerar en installerbar release-APK.
- Full GitHub/telefon-spegel, tokenhantering via Android Keystore och explicita SHA-skyddade skrivningar ska bevaras oförändrade.

## 3. Vald integration

**En enda native PostHog Android SDK och en begränsad WebMessage-brygga.** Installera fast version com.posthog:posthog-android:3.72.10 som känd, nyligen verifierad säker version från Cortex. Lägg en constraint/direct pin på com.squareup.okhttp3:okhttp:4.12.1 om Gradle annars väljer äldre; kontrollera faktisk debugRuntimeClasspath/releaseRuntimeClasspath med dependencyInsight. Kontrollera versionernas aktualitet och kompatibilitet med NexusHubs Kotlin 2.1.20 och AGP 8.9.2 på byggdagen; uppgradera kontrollerat bara om det krävs.

**Separat PostHog EU-projekt** i befintlig organisation: skapa NexusHub Android och använd dess egna project token mot https://eu.i.posthog.com. Återanvänd aldrig Cortex-projektets token. Project token är inte en hemlig åtkomstnyckel men ska hållas som deklarerad byggkonfiguration för enkel rotation; lägg aldrig en personlig PostHog API-nyckel eller GitHub-token i appen. Ändra inte nuvarande Cortex-projekt.

**Android Application-initialisering**, inte Activity-init per återskapande. Skapa NexusHubApplication.kt och registrera i AndroidManifest.xml. Skapa NexusTelemetry.kt som enda SDK-adapter. Starta med opt-out när inget sparat samtycke finns; persistenta val ligger i Android SharedPreferences, inte Databas, IndexedDB eller GitHub. Init endast en gång. Vid aktivering används SDK:ns officiella opt-in-funktion; vid avstängning opt-out samt rensning/hantering av väntande händelser enligt aktuell SDK-dokumentation och verifierat test. Inga events förrän aktivt val har gjorts.

Konfiguration vid första leverans:
- EU-host; production/debug-props tydliga; personprofiler avstängda (PersonProfiles.NEVER om API:et finns i pinnen).
- Androids automatisk screen-capture/autocapture av; automatiska error reports av; session replay av; deep-link autocapture av.
- Stäng av automatiska lifecycle-events om de riskerar förhandsinsamling; skicka i stället avgränsade manuella app_opened/app_resumed/app_backgrounded när opt-in gäller. Inga feature flags, experiment eller extra bakgrundsanrop krävs.
- Native Kotlin bygger ett litet, strikt schema/allowlist. Inga generiska log-meddelanden från React, ingen fri JSON vidarebefordras och inga exceptions/stacktraces skickas.
- Endast denna native klient skickar events. Lägg inte till posthog-js i den paketerade WebView:n; det skulle ge dubletter, ytterligare lagringsidentitet och CSP-/nätverksfrågor.

## 4. Filändringar när Work implementerar (INTE utförda här)

| Fil | Planerad ändring |
| --- | --- |
| app/build.gradle.kts | PostHog-version, ev. OkHttp säkerhets-pin, BuildConfig för project token/host, nödvändig buildFeatures-flagga och reproducerbar Gradle-kontroll. |
| app/src/main/AndroidManifest.xml | android:name för NexusHubApplication; bevara alla nuvarande activity/provider/permissions/identiteter. |
| app/src/main/java/se/lobbamannen/nexushub/app/NexusHubApplication.kt (ny) | Engångsinit SDK i Application.onCreate; läs explicit opt-in och säkra defaults. |
| app/src/main/java/se/lobbamannen/nexushub/app/NexusTelemetry.kt (ny) | Event-allowlist, egenskapsfilter, kategoriindelning, samtycke, SDK capture och feltolerans. |
| app/src/main/java/se/lobbamannen/nexushub/app/NexusMessageBridge.kt | Exakt tre nya metoder telemetry.getStatus, telemetry.setEnabled och telemetry.capture; behåll origin-/main-frame-kontrollen och befintliga kalender/bevakningsmetoder. |
| app/src/main/java/se/lobbamannen/nexushub/app/MainActivity.kt | Minimal native lifecycle-hook vid behov; inga token-, URI-, WebView-origin- eller navigationsändringar. |
| platform/telemetry.ts (ny) | Typad frontend-adapter, enum för events, godkända egenskaper, kategorisering och brandvägg mot fri data. Anropa nativeCall utan att blockera UI. |
| src/main.tsx | App-start/initialisering och endast typad eventadapter. Håll ordning på app ready och native support. |
| app/portal.tsx | Ett section_viewed per faktiskt accepterat skärmbyte efter dirty-guards; inte på varje render/hashchange eller parameter-ID. |
| src/AndroidSettings.tsx | Befintlig panel får ett kompakt PostHog-diagnostikkort: på/av, skickar/av, lokalt statusfel; originaltema och knappar. |
| platform/replica-sync.ts | Start/klart/fel endast för verklig synkoperation; durations- och räknare; inget event var 15:e sekund vid oförändrat tillstånd. |
| platform/api.ts och platform/resources.tsx | Aggererad lokal-first/cache-bildprestanda på godkända kategorier; aldrig URL, body, data, DOM eller filnamn. |
| platform/outbox.ts | Händelser vid en verifierad kvittens respektive explicit osäker kö/konflikt; deduplicera per operation. |
| Domänfilerna i avsnitt 2 | Enstaka typade action-events EFTER lyckad åtgärd eller vid kategoriserad konflikt. Ingen generell nätverkssniffer. |
| app/src/test/.../NexusTelemetryTest.kt och tests/telemetry.test.mjs (nya) | Allowlist, opt-in, validering, deduplicering, resultatklassning, ingen PII och felresiliens. |
| .github/workflows/android-apk.yml och docs/verification.md | Checks för dependency versioner, no-secrets, smoke-test, signed APK/rollback/användning. |

Inga ändringar ska göras i Databasens registerformat, bilder, idéer (utöver själva dokumentationsstatusen i detta planpaket), gammal Site, pluginrepo eller Androids signing-vault.

## 5. Exakt API-kontrakt: Kotlin ← React

WebMessage-v1 som redan finns används med samma requestId/request/response. Endast metoderna nedan läggs till:
1. telemetry.getStatus: tomma params; svar {supported:boolean, enabled:boolean, sdkReady:boolean, project:"nexushub-android-eu"} (ingen token).
2. telemetry.setEnabled: {enabled:boolean}; validera bool strikt, persistens kvitterad före {enabled:boolean}; felet påverkar inte GitHub eller UI utanför diagnostikraden.
3. telemetry.capture: {name:ApprovedEventName, properties:ApprovedProperties}; om opt-out: kvittera {accepted:false, reason:"disabled"} utan capture; om aktiv: validera, enqueua native och svara {accepted:true}; utlovar inte att PostHog redan levererat eventet.

Regler: WebMessage endast exakt https://appassets.androidplatform.net, endast mainFrame; max 4 KB telemetri-request; enbart eventnamn ur compile-time allowlist; ingen godtycklig strängproperty; värden är bool, int eller enum med fasta val. Avvisa nästlade objekt, arrays, sökvägar/URL:er, fria feltexter, timestamps, UUID:er, ID:n, användarinput, GitHub SHA/namn, tokens. Tillåt numerisk varaktighet i ms (max 10 minuter per mätning), filantal/bytes som grova buckets, status (success/pending/conflict/error), och versions-/modulenum. Clamp/normalisera på BÅDA sidor. Okända fält ska kastas, okända events nekas. Fel skickas aldrig som telemetrievent.

Följ enhetligt eventkatalogen i underlag/event-contract.md; det är kontraktet som gäller, även om kodexemplen här använder förklarande namn.

## 6. Förenklade användarflöden

1. Start: APK laddas → NexusHubApplication läser samtycke → PostHog SDK startar i rätt opt-in-status → WebView startar original-UI → src/main.tsx startar synk → app_opened sker först om analytics är aktiverat.
2. Navigation: app/portal.tsx accepterar en ny modul efter dirty-/konfliktspärr → section_viewed med enbart fördefinierat module-id.
3. Läsning: befintlig lokal källa returnerar data → cache_event endast som aggregerad diagnostik vid faktiskt miss/fallback/långsam operation. Inga originalbytes skickas.
4. GitHub-synk: cycle() rapporterar en verklig sync-run med starttid, slut, kategoriserat resultat och storleksbucket; vid opåverkad 15-sekunderskontroll skickas ingenting.
5. Skrivning: Spara skapar lokal beständig avsikt → endast pending-event om något verkligen väntar → GitHub bekräftar eller reconcilerar → write_confirmed EN gång när outbox markerar completed; konflikt/fel rapporteras separat utan ID/path/body. Lokala och serverkvittens får inte felklassas som samma sak.
6. Stäng av: inget nytt skickas, även vid appåterstart eller React-hot reload; native och React status är synkroniserade.
7. Ny APK: behåller lokal spegel, Keystore-GitHub-token, outbox, signeringsidentitet och samtycke. Data stannar i två existerande lagringssystem enligt tidigare kontrakt.

## 7. Prioriterad implementation

**Fas A – projekt och bas (krav före kodbygge):**
- Skapa dedikerat EU-projekt, notera project ID, host och projekt-token i byggkonfiguration. Sätt PostHog-project timezone Europe/Stockholm om rapporterna ska visas per svensk dag.
- Kontrollera SDK 3.72.10 + OkHttp >=4.12.1 på aktuell byggdag med Gradle dependencyInsight; bygg gärna ett minimalt Android test först.
- Lägg NexusHubApplication, NexusTelemetry, opt-in-persistens, strict schema och bridge-metoder. Testa ingen capture när disabled.
- Lägg typad frontend-adapter. Säkerställ att webbläsar-förhandsvisning får no-op/unsupported och inte försöker kontakta PostHog.

**Fas B – kritiska användnings- och kvalitetsmätningar:**
- section_viewed i portal; app_opened/app_foregrounded; endast godkända namn.
- replica_sync_* från befintliga statusövergångar; image_load_slow och local_read_fallback aggregat/sampling med säker klassning.
- github_write_* i outbox med säkra kvittenser. Undvik dubbelräkning från domänkomponenter.

**Fas C – domänhändelser:**
- Film/serie: media_detail_opened, media_status_saved, series_watch_toggled.
- Berättelser: story_opened, story_read_saved.
- Idéer: idea_created, idea_updated, idea_status_changed, idea_plan_opened.
- Ekonomi: economy_action_saved med action-kind men inga kvittorader/belopp.
- Mottagningsinkorg: incoming_transfer_completed som antal/kategori utan filmetadata.
- Seriebevakning: watch_check_completed; ev. native notification_delivered först om det finns verifierad callback vid faktisk leverans; inte bara när den schemaläggs.
- Kalender: endast calendar_permission_result (granted/denied), aldrig kalenderinnehåll.

**Fas D – rapportering och färdigställning:**
- Skapa i PostHog separata Insights för section_viewed per modul; write success/failure/conflict; synk duration/bytes/failed; image_load_slow; appversioner. En enkel NexusHub-dashboard utan person-/replayflikar räcker.
- Integritetstest med avsiktliga strängar i texter/filnamn och egenskaper. Se testmatrisen nedan.
- Kör CI samt skarp signerad APK och praktiskt test på Samsung. Skapa release-notes med samtyckesbeskrivning.
- Markera idén completed enbart efter kodmerge, grön byggkedja, levererad APK och verifierad testhändelse på rätt PostHog-projekt.

## 8. Testplan och acceptanskriterier (hård release-spärr)

Automatiskt:
- Kotlin: init exakt en gång; default disabled; opt-in/out över omstart; schema nekar varje fri sträng och alla okända namn/fält; stora/nestlade payloads avvisas; redan nekad payload skickas inte.
- React: nativeCall finns/saknas; ingen nät-/UI-blockering när telemetri misslyckas; en navigation = högst ett event; inga events från brutna/ångrade actioner; event vid kvitterad skrivning endast en gång; no-op-deltasync ger inga nya events.
- PII-test med Canary-värden för GitHub-token, idétext, film/serie-titel, kalenderhändelse, kvittobelopp, URI/URL och filnamn: **noll** värden i SDK-capture/spool/loggar/PostHog-event.
- Gradle: faktisk posthog-android-version och alla runtime OkHttp-artefakter; kontrollera inget sårbart transitivt beroende. npm run check, check:design, berörda Node-test och Gradle unit/lint/assembleRelease.
- Verifiera oförändrat applicationId, versionCode-policy, signaturcertifikat och samma WebView-origin.

Fysiskt telefonstest:
- Installera över befintlig NexusHub på Robin Samsung utan avinstallation. Kontrollera GitHub-token, hela spegeln, idéutkast, väntande kö och befintliga affischer.
- Av: använd hem, film, idé och synk i minst några minuter → ingen ny NexusHub-händelse i PostHog.
- På: öppna Hem → Filmer → Serier → Idéinkorg → Inställningar. Precis motsvarande section_viewed i NexusHub EU-projekt, inga dubletter, ingenting i Cortex-projektet.
- Spara EN versionsskyddad, icke-känslig teständring endast efter separat godkännande; kontrollera verklig GitHub-kvittens och EN write_confirmed. Testa konflikt mot isolerad fixture, inte mot privat data.
- Simulera nätfel och senare återanslutning: appen fortsätter, kö skyddas, statusen blir korrekt och ingen rå HTTP-URL skickas.
- Stäng av igen, döda och starta om appen → fortsatt av. Kontrollera PostHog live event stream med tidsstämpel och filtrering till NexusHub-projekt.
- Kontrollera ingen synlig design-/prestandaregression vid 15 s spegelkontroller, stora register och upprepade bildladdningar. Kritiskt: ny diagnostik får inte förvärra redan känd bildlatens.

Klar först när: (1) samtyckesspärr, (2) isolerat projekt, (3) eventkatalog, (4) privacy-canaries, (5) CI, (6) signerad APK, (7) skarp telefonverifiering, (8) bevarad lokal data och GitHub-konfliktsäkerhet alla är godkända.

## 9. Driftsättning, återställning och risker

Slå på först för Robin. Ingen dold remote flag eller krav på särskild PostHog-betalplan. Låt Cortex Scout använda sin befintliga PostHog-installation oförändrad. Release via samma GitHub Actions-workflow och stabil signering; aldrig migrera Databas för telemetri.

Återställning i första hand: stäng av diagnostik i appen (omedelbar opt-out). Om SDK/bridge orsakar startfel: återställ relevant commit eller bygg en hotfix med telemetri disabled som default på samma package ID/signering. Bevara lokal Android-data, Keystore, IndexedDB, outbox och tvålagring; avinstallera inte som rollback. Vid eventläcka: stoppa capture, rotera projekt-token om relevant, inventera borttagning i PostHog separat; PostHog-radering ändrar inte GitHub-originalen.

Risker och åtgärder:
- **Integritet:** små strikta enum-events; replay/autocapture av; canarytester; anonym installationsidentitet och ingen explicit identify mot GitHub-användare.
- **Dubbelräkning:** EN native SDK och en enda central capture; nav efter accepterad navigering; kvittens vid outbox.
- **Resurskostnad/bandbredd:** undvik 15-sekunders no-op-events och repetitiva bild-event; använd sampling/buckets; övervaka PostHog gratisnivå och eventvolym vid piloten, utan hårdkodade prisantaganden.
- **Versionsdrift/säkerhet:** pinna SDK, kontrollera transitiver och patchar regelbundet; WebView-brygga måste fortsatt vara origin- och main-frame-begränsad.
- **Överrapportering från SDK:** disable default screen, replay, error och featureflag-automation; kontrollera faktiska event i live-projektet.
- **Bortkopplat nät:** PostHog får fallera isolerat utan att ta appens lagrings-/GitHub-kö i anspråk.

## 10. Förutsättningar och exakta kontroller vid byggstart

Det enda externa installationssteget är ett dedikerat NexusHub-projekt i samma PostHog EU-organisation samt dess project token. Det är planerat, **inte utfört**. Work ska återläsa då aktuell main och SDK-dokumentationen, kontrollera Android Gradle/Kotlin-kompatibilitet och använda den senast säkerhetsverifierade 3.x-versionen om 3.72.10 hunnit ersättas. Inga verkliga klienthändelser kan garanteras av denna läsbaserade kartläggning; de kräver signerad APK och telefonprov.

Läs: research.md för verifierade källor och antaganden, underlag/event-contract.md för godkända namn, fält, klassningar och negativtester. Detta planpaket är fristående; implementation beställs separat.

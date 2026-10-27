# Research och teknisk kartläggning – NexusHub Android + PostHog

**Framtaget:** 2026-10-26T20:48:07.602Z. **Typ:** read-only kodgranskning och PostHog-verktygs/dokumentgranskning. Ingen Android- eller PostHog-konfiguration ändrades. Originalidé: nr 15, 1d4a4c5c-4803-46b1-aca8-298cd4f6621f.

## Frågeställningar

1. Var ska PostHog initieras för att omfatta native och React i samma NexusHub-installation?
2. Finns redan en säkert avgränsad brygga, och vilka exakta filer visar användarflöden?
3. Hur mäts 15-sekunders GitHub-kontroll, full lokal spegel och skrivkvittens utan eventbrus eller rådata?
4. Vilket projekt, host, SDK och skydd behövs för att inte blanda med Cortex Scout?
5. Hur sparas en färdig implementeringsplan i GitHub utan att börja implementera appkod?

## Direkt verifierade kodfynd, 26 oktober 2026

Apprepo main a056b28e616b14029135326b7878e31d2ee39177. Filversioner (Git-blob SHA, kan användas för att se om koden ändrats):
- MainActivity.kt — 23269ed146249facdfea997bc1e17e73ed514b5a: Activity, lokal WebViewAssetLoader, JavascriptInterface Android för token/filfunktioner, WebView-origin-gating, lokala assets, lifecycle.
- NexusMessageBridge.kt — 9606548565d83b3af7759c7747c4ef18d8367e4c: WebMessageListener med allowOrigin på appassets.androidplatform.net och isMainFrame, v1-method router för kalender och bevakning.
- lib/calendar/native-client.ts — f557116b0bbe82e12fc0b0dbf1d16d24a2fbd752: nativeCall över NexusNative och requestId, timeout, return channel.
- app/build.gradle.kts — public app source i main: Android SDK 35, minSdk 26, Java/Kotlin 17, inget PostHog-dependency än.
- app/src/main/AndroidManifest.xml — INTERNET redan satt, application saknar explicit custom subclass; ingen ny nätbehörighet.
- src/main.tsx — initialStorage → installLocalApi → installResourceHandling → Portal/render → startReplicaSync/startWatchSync.
- app/portal.tsx — db7ddec07b4fed88adc417a243a2f07209d53fa7: central navigation och hashchange, blockerad navigation vid dirty draft.
- platform/replica-sync.ts — 15-sekunders kontroller, state.report, manuell syncReplicaNow, nexus-replica-status.
- platform/api.ts — intern fetch-interception, lokal-first, GitHub-fallback och cache.
- platform/outbox.ts — e7419c8680135ee68caa628794fe6a11b5afdc62e9f4: beständig kö, SHA-skydd och CustomEvent nexus-write-completed.
- components/media/MediaRegister.tsx — 2b6ab5d35118dd55edcbea4e9eb0b184e3819685: Spara ändringar och lila seriebevakningsklocka.
- components/ideas/use-ideas.ts — 99cf76e29fe0955b8e29359aced335c7d8eefad7: Idéutkast + API-bekräftelse.
- app/films.tsx, app/series.tsx, app/stories.tsx, app/economy.tsx, platform/watch-sync.ts: respektive domänflöden.
- .github/workflows/android-apk.yml — c1dcd1e013fa9f7b2d159c701ca3b0ceed7b89ed: signerad release och CI-kontroller; paket/artifact i GitHub.

PostHog från anslutna appens projektlista: ett enda projekt, id 280222, namn Default project, timezone UTC. Ingen separat NexusHub-post verifierad. Tidigare implementerad Cortex-telemetri har en native Android-adapter och SDK 3.72.10/OkHttp 4.12.1 enligt Cortex-repots aktuella main och dess Gradle-katalog; den är referens för beprövat byggmönster **men ska inte dela projekt-token eller tillåta godtyckliga webbevents**.

## Beslut och alternativ

| Alternativ | Fördel | Begränsning | Beslut |
| --- | --- | --- | --- |
| Native posthog-android + strikt WebMessage | Samma native klient för appcykel och React; ingen extra JS-CSP eller dubbel identitet; bäst privacy-kontroll | Liten Kotlin- och TS-brygga krävs | **Valt.** |
| posthog-js inuti lokal React-WebView | Snabb webbinstrumentering | Risk för dubletter, DOM-autocapture/URL-data, ytterligare persistens/CSP och sämre native events | Ej valt. |
| Två SDK:er, native+JS | Varje lager enkelt isolerat | Två olika sessioner/ID:n, dubbelräkning, mer risk | Ej valt. |
| Hela dataflödet via GitHub eller egen backend | Kan passa serverloggar | Onödig server och risk att blanda privata original med telemetri | Ej valt. |
| Samma PostHog-projekt som Cortex | Kräver inget nytt projekt | Risk för sammanblandade dashboards, händelser och access-policy | Separat EU-projekt valt. |

## Sekretess och dataminimering

NexusHub innehåller privata dokument, hushållsekonomi, idétexter, personliga mediaval, kalender, mottagna bilagor och säker GitHub-token. Inga frihandssträngar eller innehållsobjekt bör lämna appen som event-egenskaper. Anonym PostHog-installationsidentitet är fortfarande en teknisk identifierare och måste omfattas av informations-/samtyckestexten; appen ska inte kalla identify med Robin, GitHub login, e-post, idénummer, IMDb-ID eller andra personliga identifierare. PostHog-ip/geolokalisering ska stängas av på projektnivå där inställningarna tillåter, och faktiska eventpropertykontroller ska bekräfta skyddet. Ingen personlig träningsdata, hälsa eller ekonomi till PostHog.

Standard: av tills Robin aktiverar. Session replay, autocapture, automatisk felinsamling och direkt DOM-tracking av. Handplockade resultattyper ersätter debugstack, URL, dokumenttitlar och innehåll. En generisk error.message får aldrig användas. Logga inte hemligheter vid bygg/test.

## Primärkällor (lästa eller kontrollerade 26 oktober 2026)

- Aktiva appens källa och README: https://github.com/lobbamannen/NexusHub-Android-App/tree/a056b28e616b14029135326b7878e31d2ee39177 — teknik, layout, WebView, synk, CI; direkt kodkontroll via GitHub-anslutning.
- Fullt arkivkontrakt för idéer: https://github.com/lobbamannen/Databas/blob/main/Ideer/README.md — bevarad UUID, status, skrivkonflikt.
- Planarkiv: https://github.com/lobbamannen/Databas/blob/main/Fardiga-ideer/README.md och https://github.com/lobbamannen/Databas/blob/main/Fardiga-ideer/MALL.md — obligatoriska tre filer, sourceIdeaSha och stegvis ready.
- PostHog Android SDK: https://posthog.com/docs/libraries/android — Gradle-installation, Application-onCreate, PostHogAndroidConfig, PostHog.capture.
- Android-produktanalytics: https://posthog.com/docs/product-analytics/installation/android — Kotlin-inställning och event-metod.
- PostHog privata insamlingskontroller: https://posthog.com/docs/privacy/data-collection — opt-out, datamaskning och insamlingsstyrning.
- PostHog Android/KMP-alternativ och konfigurationsval: https://posthog.com/docs/libraries/kmp#all-configuration-options — EU-host, lifecycle/screen/featureflags, optOut, personProfiles, kö/batch.
- Cortex säkerhetsreferens: https://github.com/lobbamannen/Cortex-Scout-Android-V2/blob/main/gradle/libs.versions.toml — verifierad pin 3.72.10 och 4.12.1, inte ett mandat att kopiera känslig config.
- PostHog projekthämtning via ansluten integration 2026-10-26: Default project (280222), ingen dedikerad NexusHub-projektpost.
- Exempel på risk med Android session replay: https://github.com/PostHog/posthog-js/issues/3140 och https://github.com/PostHog/posthog-js/issues/2631 — React Native-rapporter; inte bevis för fel i denna WebView, men stöd för försiktigt bortval av replay.

## Fakta vs. beslut vs. ännu ej testat

**Fakta:** ovan angivna filer och projektlista granskade; README-dokumenten definierar appens status/spegel/planpaket; Android SDK:s stöd verifierat mot PostHog docs.  
**Beslut i planen:** native-only, strict enum-schema, opt-in, separat EU-projekt, inget replay/autocapture, inga personprofiler. Dessa är rekommendationer, inte befintliga funktioner.  
**Ej utfört:** skapa PostHog-projekt, ändra appkod, köra Gradle med PostHog-dependency i just NexusHub, bygga APK, hämta händelser från den framtida appen, verifiera fysisk Samsung-användning. Sådana tester hör till implementationen.

**Kompatibilitetskontroll vid byggstart:** PostHog SDK 3.72.10:s exakta Kotlin-config-API och Gradle-transitiver ska kompileras mot NexusHubs Kotlin 2.1.20. Vid skillnader används den officiella 3.x Android-SDK-dokumentationen och ett litet unit/instrumentation-test; håll den beslutade event- och privacy-arkitekturen oförändrad.

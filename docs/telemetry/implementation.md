# NexusHub Android: PostHog och bevakningsdiagnostik

Idé15. Publiceringsstatus och kontrollresultat ska skiljas från faktisk telefonverifiering.

## Konto och gränsdragning
Robin valde gemensamt PostHog EU-projekt280222 efter att organisationens gratisgräns (ett projekt) verifierats. NexusHub har eget fast `app=nexushub_android`, anonym SDK-identitet och egna rapporter. Cortex-kod, befintliga rapporter och projektinställningar ändras inte. NexusHub-dashboard: https://eu.posthog.com/project/280222/dashboard/1058562. Cortex: https://eu.posthog.com/project/280222/dashboard/1058570.

Projektets offentliga ingestion-token/host ligger som deklarerad miljökonfiguration i `.github/posthog.env`, läses av Actions och blir BuildConfig. Ingen personlig PostHog API-nyckel eller GitHub-token får ligga där. Den inbyggda token kan bara lämna klienthändelser; den ger inte läsåtkomst till analyser. Lokal Gradle-körning: `set -a; source .github/posthog.env; set +a` före bygget. Ingen betaltjänst aktiveras av implementationen.

## Insamling
Av från början. Inställningar → GitHub & lokal lagring → Diagnostik och användningsstatistik. Valet finns i egna Android SharedPreferences och överlever normal APK-uppdatering. SDK initieras först när insamling redan är aktiverad eller användaren aktiverar den. Inga telemetrievent lagras i GitHub eller dess skrivkö. Appen fungerar utan diagnostik.

En native SDK (Android3.72.10/core6.47.6), aldrig posthog-js. Autocapture, replay, errors, push-subscriptions, deeplinks, surveys och personprofiler är av. Tillåtelselistan är `lib/telemetry-schema.json`, gemensam för React och Kotlin; `beforeSend` tar också bort SDK:s automatiska egenskaper och bygger om säkra fält. Endast fasta enumvärden, booleska flaggor, storleksintervall och app-/Android-version. Ingen fri feltext, titel, IMDb-ID, hash, filväg, URL, belopp, text eller kalenderdata. `$geoip_disable=true`, `$process_person_profile=false`.

NexusHub stoppar nya capture direkt vid avstängning, spärrar gamla SDK-köers nätåtkomst med en samtyckesgeneration, stänger SDK och rensar dess separata kökatalog. Gamla generationer får inte återupplivas vid nästa aktivering. Redan skickad eller pågående HTTP kan inte återkallas. SDK-inställning `optOut` ensam rensar inte kön; därför används också generationsspärr och isolerad kökatalog. Samma telefonlagring, paket, signering och GitHub-data behålls.

Faktiska händelser: appcykel; accepterade modulbyten; lästa media/berättelser/planer; verifierade sparningar samt kö/konflikt/fel; idé-/medie-/berättelse-/ekonomiresultat; slutförda mottagningsöverföringar; faktisk replikkopiering/manuell kontroll; läsfallback; långsam bildtransport; native bevakningsresultat; explicit kalenderbehörighetssvar. Image events begränsas till20 per React-session, fallback en gång per resurs/resultat; no-op-poll var15sek ger inga sync-start/klart-event. Tekniska mätningar använder monotonic tid. Bildmätningen avser bildtransport till lokal blob, inte render-/decode-tid.

## Gold Rush och bevakning
Verifierat i aktuellt GitHub: Gold Rush har IMDb tt1800864, releaseWatch.enabled=true och avsnitt/säsonger aktiverade. Användarens historik visar slutförda6/6-kontroller19:44,01:02,06:59, men inga fynd. Det bevisar inte att API:t rapporterade det nya svenska HBO-avsnittet. API-nyckeln och ursprungliga svar finns enbart på telefonen; den exakta orsaken är ännu inte fastställd.

Kodfel: första past-intervallet började vid kontrollögonblicket och kunde missa perioden efter aktivering. Nytt: första intervallet täcker aktivering; följande söker med24timmars överlapp för sent indexerade källändringar. Behåller källans31dagarsgräns, pinned cursors, baslinje före aktivering, quota/backoff och stabila event-ID:n. Överlapp kan kosta fler sidor men passerar aldrig befintlig900/månad-spärr.

Kontrollhistoriken visar nu källändringar, träffar på bevakade serier, avvisade belägg, nya fynd, tyst baslinje och notisförsök samt anledning (behörighet/tystläge/hanterat). PostHog får bara intervall och fördefinierad orsak. `notifications_bucket` räknar anrop till Androids notisfunktion; det är INTE en bekräftelse på synlig leverans. HTTP401/429 får kategoriserat failure-event; perioder som inte faktiskt körs får inget completed-event. Manuell kontroll överför aktuell konfiguration innan jobbet köas. Begäran-texten försvinner automatiskt; Aktiv får inte radbrytas.

## Verifiering
- Node:81/81 relevanta tester inklusive canaries/filter/dedup/sampling; typkontroll och42 originaldesignkontroller godkända.
- Kotlin:17/17 policy-, consent- och bevakningsregler via JVM/JUnit. SDK/Android-kompilering, Gradle testDebugUnitTest, lintRelease och assembleRelease godkända i Actions40462222865. APK1.0.39 publicerad och signatur verifierad: https://github.com/lobbamannen/NexusHub-Android-App/releases/tag/app-v1.0.39.
- Hela gamla Site-sviten innehåller nio redan befintliga fel: github-inbox.test.mjs (saknad drizzle-migration); två local-posters-scriptfall (saknat äldre sync-posters.mjs); tre series-ui-fall (äldre regexformat); series-watchlist UI-fall (äldre kodformat); source-sync-dynamic (Site integritetsmodell); upload-api.test.mjs (gammal servermiljö). Samtliga nio återkom även vid faktisk körning i isolerad oförändrad upstream-checkout (184 tester:175 godkända,9 underkända). Dessa används inte som bevis för Android-funktionen. Fullrapport i arbetslogg, ingen påstådd total grön svit.

Återstående fysisk verifiering: installera uppdateringen över befintlig app, slå på diagnostik, öppna några moduler och kör Kontrollera nu. Läs faktiska händelser i Nexus-dashboard/live stream, kontrollera endast godkända egenskaper. Avstängning/omstart ska förbli av. Utge inte ett servergenererat testevent för att vara en faktisk Samsung-körning. Idé15 lämnas som redo tills APK och verkligt telefon-event verifierats enligt originalplanens acceptansvillkor.

# Godkänt eventkontrakt – NexusHub Android/PostHog (v1)

**Princip:** detta är en sluten tillåtelselista. Inga fria propertyvärden, inga payloads från GitHub, inget innehåll från filmer, berättelser, idéer, ekonomi, kalender, filer eller systemfel. Alla event måste passera NexusTelemetry i Kotlin, oavsett om de kommer från native eller React.

## Gemensamma egenskaper på varje event
- app: konstant nexushub_android.
- app_version: BuildConfig.VERSION_NAME (högst 32 tecken, kanoniseras till versionsformat).
- platform: konstant android.
- environment: enum debug | production.
- source: enum native | react.
- module: enum hem | kalender | bevakning | ideer | mottaget | attgora | databas | berattelser | filmer | serier | register | ekonomi | plugins | upptack | filer | verktyg | nyheter | favoriter | arkiv | sok | installningar | other. Kommer från intern NAV/labels-mappning, INTE från godtycklig URL/hashsträng.
- Inga personprofilfält. Ingen manuell identifiering.

## Eventnamn och tillåtna extra fält

| Namn | När exakt | Godkända fält |
| --- | --- | --- |
| app_opened | Native foreground efter opt-in, en gång per start | startup_mode = cold/warm |
| app_backgrounded | Native lämnar foreground efter opt-in | session_duration_bucket = short/medium/long |
| section_viewed | Accepterad modulnavigation; aldrig blocked eller samma vy | module |
| replica_sync_started | Start på faktisk kopiering eller manuell körning; inte no-op-poll | trigger = auto/manual/resume |
| replica_sync_completed | En körning har verifierat resultat efter sync | trigger; duration_bucket; files_bucket; bytes_bucket; changes = true/false |
| replica_sync_failed | En riktig sync-run misslyckades | trigger; duration_bucket; error_category = network/rate_limit/auth/conflict/storage/integrity/other |
| replica_sync_paused | Manuell pausa | trigger = manual |
| local_read_fallback | Faktisk användning av nät eller tidigare cache efter miss | resource = media/stories/ideas/economy/other; outcome = cache/network/stale |
| image_load_slow | En synlig/laddad bild passerar tröskel 500 ms, högst 20 per session | screen_group = home/library/detail/stories/other; duration_bucket = 0_5to1s/1to3s/over3s; source = react |
| github_write_confirmed | GitHub-kvittens bekräftad EN gång av outbox | category = media/ideas/stories/economy/todos/incoming/other; latency_bucket |
| github_write_pending | Verklig bevarad köpost väntar på uttrycklig återförsök | category |
| github_write_conflict | SHA-konflikt konstaterad | category |
| github_write_failed | Åtgärd verkligen misslyckad | category; error_category |
| media_detail_opened | Öppna film-/seriedetalj (inga titlar eller IMDb ID) | media_type = film/series |
| media_status_saved | GitHub bekräftat sedd/vill-se el. motsv. | media_type; action = marked_seen/marked_unseen/wishlist_changed/other |
| series_watch_toggled | Bevakningsklocka ändrad och GitHub bekräftad | state = on/off |
| story_opened | Berättelseläsare öppnas | module = berattelser |
| story_read_saved | GitHub bekräftat läst/oläst | state = read/unread |
| idea_created | Ny idé faktiskt GitHub-sparad | category = ideas |
| idea_updated | Befintlig idétext faktiskt GitHub-sparad; ingen text/förändringsstorlek | category = ideas |
| idea_status_changed | Idéstatus faktiskt sparad | status = new/investigating/ready/completed/dismissed |
| idea_plan_opened | Komplett plan visas | category = ideas |
| economy_action_saved | En ekonomiåtgärd GitHub-bekräftad | action = create_purchase/update_purchase/category_change/product_change/other |
| incoming_transfer_completed | Samtliga valda destinationskvittenser godkända | destination = inbox/idea/both; files_bucket |
| watch_check_completed | Native körning slutförd, inte bara schemalagd | result = success/partial/failure; source = native |
| calendar_permission_result | Explicit avslutat systemtillstånd efter fråga | granted = true/false |

Tillåt vid behov ett *ytterligare* event endast efter uppdatering av denna fil, både Kotlin/TS-allowlists och tester. Driftmiljö får inte öppna wildcard eller publicera råa error logs.

## Typning och bucket-definitioner

- duration_bucket / latency_bucket: under100ms | 100to499ms | 500to999ms | 1to3s | 3to10s | over10s (tillämpliga subset enligt varje event).
- files_bucket: 0 | 1to10 | 11to100 | 101to1000 | over1000.
- bytes_bucket: 0 | under1mb | 1to100mb | over100mb.
- session_duration_bucket: short (<1min) | medium (1–30min) | long (>30min).
- För prestanda kan mätning göras med monotonic clock och buckets; ingen absolut klocktid, tidzon eller timestamp behöver skickas i properties. PostHog tillför sin egen mottagningstid.
- error_category beräknas deterministiskt från status/typ, aldrig från exception.message och aldrig inklusive status-URL/request-header.
- Odefinierat optionalfält utelämnas. Inga null-, nested-, array- eller strängserialiserade JSON-values.
- Medvetet inga id:n, objekt-/filnamn, raw routes, SHA, antal kvittobelopp, vikter, bildvägar, API-svar eller söktext.

## Implementationskodens invariants

1. Endast enabled=true + SDK redo + godkänt namn/fält → PostHog.capture.
2. Fält får varken skickas fritt från React eller sammanfogas med full originaldata; bygg eventobjekt från fördefinierade enum- och bucketvärden.
3. React-event skickas via befintlig NexusNative origin/main-frame-skyddad brygga. Native-event går direkt till samma adapter.
4. Misslyckad telemetri ignoreras säkert och får inte ändra API, GitHub write receipt eller React navigation.
5. SDK är den enda utsändaren. Ingen parallell posthog-js, auto-replay eller autocapture.
6. Privacy-canarytest: hemlig fake-token, kvittonummer, kalenderämne, idétitel, filväg och query är **aldrig** en del av capture, ens vid fel.
7. Sampling gäller bara upprepade rent tekniska events, inte write-error eller konfliktresultat. En no-op-inventering får inte generera återkommande 15-sekunders event.
8. Genomgång av en PostHog Live Events-respons måste visa enbart namnen och properties ovan.

## PostHog dashboards som byggs vid implementation

- NexusHub Överblick: app_opened, section_viewed per module, app_version; senaste sju dagarna.
- GitHub & Lagring: completed/failed/pending/conflict, replica_sync_* per error_category, cache-fallback.
- Snabbhet: image_load_slow per screen_group/duration_bucket och sync duration.
- Funktioner: film/serie, idéer, berättelser, ekonomi, mottagning och bevakning grupperat enbart per eventnamn.
- Driftskontroll: kontrollerad NexusHub-projektlista; inga identitetsprofiler/recordings önskade.

Kvalitet: acceptera aldrig ett fint dashboard som bevis om den faktiska Android-installationen inte har visat rätt, sekretessgranskade events.

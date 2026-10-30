# Gemma 4 E2B – gemensam runtime i NexusHub Android

**Status 2026-10-30:** Implementerad på utvecklingsgrenen `codex/nexus-intelligence-foundation-20261030`. NexusHubs fristående Gemma-chatt och Hexagon HTP/NPU 36/36 lager har tidigare verifierats på Galaxy S26 Ultra med verkliga svar och runtime-telemetri. **Den nya livscykel-/profilrefaktoreringen måste fortfarande byggverifieras och testas på telefonen.** Detta dokument är inte en kvittens på att den senaste APK:n är färdig eller installerad.

## Syfte och avgränsning

Det finns **en** Gemma 4 E2B-motor, **en** global modellprofil och **en** gemensam ingång för explicita AI-anrop. Idéinkorg, forskningsdokument och GitHub-synk är fortfarande vanliga NexusHub-funktioner; de startar **inga** automatiska Gemma-arbeten. Tidigare Nexus Intelligence-analyser, relationsgranskning, autonom publicering och AI-arbetsköer har avvecklats. Nästa funktion, intelligens i idéinkorgen, byggs separat ovanpå denna grund först när den definierats och verifierats.

Arkitekturens livscykel bygger på beprövade mönster i [Jarvis](https://github.com/lobbamannen/Jarvis) (`GemmaRuntimeManager.kt` och `GemmaRuntimeProfileStore.kt`) och [Cortex-Scout-Android-V2](https://github.com/lobbamannen/Cortex-Scout-Android-V2) (`GemmaLocalModelManager` och `LlamaCppRuntime.kt`). NexusHub **återanvänder sin egen fungerande llama.cpp/Hexagon-implementation**, inte en ny modellmotor.

## Kodkarta – vad varje fil gör

| Fil | Faktiskt ansvar |
|---|---|
| [`GemmaConfig.kt`](../app/src/main/java/se/lobbamannen/nexushub/app/GemmaConfig.kt) | Centrala NPU-standardvärden, sammanslagning med befintligt sparad profil, inställningsvalidering och signatur över **endast** native-motorparametrar. |
| [`GemmaRuntime.kt`](../app/src/main/java/se/lobbamannen/nexushub/app/GemmaRuntime.kt) | Gemensam Android-livscykel: första användningen, återvändande till förgrunden, 30 sekunders bakgrundsrespit, hantering av minnestryck och vidarebefordran av import/generering/avbrytning/avlastning till befintlig motor. |
| [`GemmaClient.kt`](../app/src/main/java/se/lobbamannen/nexushub/app/GemmaClient.kt) | Tunn, gemensam klient för chatt och framtida **uttryckligen aktiverade** uppgifter. Funktionen `runExplicitTask` är en ingång för framtiden, **ingen aktiverad bakgrundsautomation**. |
| [`IntelligenceRuntime.kt`](../app/src/main/java/se/lobbamannen/nexushub/app/IntelligenceRuntime.kt) | Det befintliga namnet på **native-motorns Kotlin-adapter** (inte den gamla Intelligence-arbetsmotorn). Äger importerad GGUF, SHA-256-kontroll, llama.cpp/HTP-initiering, enda motorlåset, faktisk inferens, profilpersistens, backendvalidering, kort telemetri och frigöring av motorn. |
| [`MainActivity.kt`](../app/src/main/java/se/lobbamannen/nexushub/app/MainActivity.kt) | Begränsad Android↔WebView-brygga: modellstatus, profil, import, chattanrop, stopp, avlastning samt `onStart`/`onStop` som rapporterar appens synlighet till GemmaRuntime. |
| [`NexusHubApplication.kt`](../app/src/main/java/se/lobbamannen/nexushub/app/NexusHubApplication.kt) | Förmedlar Androids `onTrimMemory`/`onLowMemory` till GemmaRuntime. Andra appfunktioner och datasynk arbetar separat. |
| [`NexusIntelligence.tsx`](../components/intelligence/NexusIntelligence.tsx) | Fristående chatt, globala inställningar, modellimport/-status och **normal** körtelemetri, inklusive `WARM`/`COLD` och laddningstid för aktuell begäran. |
| [`GemmaConfigTest.kt`](../app/src/test/java/se/lobbamannen/nexushub/app/GemmaConfigTest.kt) | Enhetstester för standardprofil, migrering av sparade värden, inställningssignatur och avvisning av ogiltig konfiguration. Testernas förekomst bevisar inte att ett Actions-bygge har passerat. |

Native-delar som `LlamaNative`, `GemmaStreamParser`, GGUF-kontroll och C++-acceleratorbibliotek behålls; inga andra moduler ska direkt styra dem.

## Globala standardvärden

Standardvärden för **ny profil** enligt telefonens tidigare fungerande konfiguration:

| Fält | Standard |
|---|---|
| Backend | `NPU_HEXAGON` |
| Trådar / batchtrådar | 4 / 6 |
| Kontext | 32 768 token |
| Batch / microbatch | 512 / 256 |
| Q8 KV-cache / Flash Attention | av / av |
| Mlock | på |
| GPU-lager-fält | 999 (native-backend `NPU_HEXAGON` använder ändå NPU-begäran i stället för att behandla detta som GPU-offload) |
| Temperature / top-p / top-k / min-p | 0,2 / 0,95 / 64 / 0 |
| Repeat penalty / seed | 1,0 / −1 |
| Max svarstoken | 2 000 |
| Thinking / djup HTP-audit | av / av |
| Behåll modellen varm | på |

**Uppdateringar får inte återställa en redan sparad profil.** `GemmaConfig.load` fyller enbart saknade nycklar från nya standardvärden; existerande konfiguration från `nexus_intelligence_profile_v1` används fortsatt. Inställningarna sparas av Android och delas av alla Gemma-anrop. Värdena är ändringsbara i chatten och valideras centralt.

Motorparametrar i signaturen: `backend`, `threads`, `batchThreads`, `contextSize`, `batch`, `microbatch`, `q8Kv`, `flashAttention`, `mlock`, `gpuLayers`, `audit` samt modellens SHA-256.

Samplingparametrar, t.ex. `temperature`, `topP`, `topK`, `minP`, `repeatPenalty`, `seed`, `maxOutputTokens` och `thinking`, ändrar **inte** native-signaturen. De kan därför justeras mellan körningar utan kall omladdning. Om signaturen eller modellfilen ändras initieras native-motorn på nytt. `warmModel=false` innebär explicit avlastning efter körning.

## Start, återanvändning och stopp

1. **Appstart:** ingen automatisk GGUF-laddning eller inferens. Modellen finns importerad på enhetens privata lagring.
2. **Explicit begäran:** chattens `GemmaClient.chat` går till `GemmaRuntime` och `IntelligenceRuntime`. Native-motorn kontrollerar modellidentitet och motorsignatur och laddar bara när det behövs.
3. **WARM/COLD:** om native-motorn fortfarande är initierad med samma profil och modell körs nästa begäran som `WARM`. Annars `COLD`. Inga parallella native-genereringar tillåts av det gemensamma motorlåset.
4. **Samplingsändring:** ändrade samplingvärden sparas globalt utan onödig avlastning. Native-förändringar kräver omladdning.
5. **Bakgrund:** `MainActivity.onStop` startar en **30 sekunders** respit. `onStart` avbryter väntande avlastning om användaren återkommer. När respiten gått ut avlastas modellen om den är inaktiv.
6. **Minnestryck:** `NexusHubApplication` rapporterar Androids minnessignaler till den centrala runtimen. `TRIM_MEMORY_UI_HIDDEN` ensamt räknas inte som akut minnestryck. Avlastning får inte bryta en pågående inferens; kontrollen för om avlastning fortfarande är tillåten utförs under native-låset.
7. **Import och avlastning:** GGUF-import bevarar gammal modell tills ny fil verifierats; uttrycklig avlastning och appens cleanup tar bort modellen ur RAM, **inte** den importerade GGUF-filen eller den sparade profilen.
8. **Stoppknapp:** `gemmaCancel` använder native stoppsignal. En begäran som avbryts blir inte ett automatiskt nytt arbete.

### Runtime-telemetri

Chatten visar backend, accelererade lager, kontext, tokenantal, prefill/decoding/total tid, tok/s, stopporsak samt `sessionStartState` (`WARM` eller `COLD`) och `modelLoadThisRequestMs`. Det är **rapporterade native-värden**, inte en oberoende extern HTP-mätning. Detaljerad HTP-paket-/nodtelemetri hör till det separata audit-läget och är normalt avstängd.

## Kontrakt inför idéinkorgen

- Vanlig kod ska äga identifiering, indexering, versioner, relationer, kö, beslut, validering och beständig lagring. Gemma får en tydligt avgränsad språklig/semantisk uppgift med kontrollerat underlag.
- Nya funktioner anropar den **gemensamma GemmaClient/GemmaRuntime**, inte `LlamaNative` direkt, och skapar inte varsin modellkoppla eller separata globala profiler.
- En uppgift måste ha tydlig startorsak, ägare, begränsning, stoppregel, felhantering och verifierat resultat innan den aktiveras.
- Inga automatiska AI-uppdrag eller GitHub-skrivningar är aktiverade i denna grund. Originaldata, idéer och forskningsdokument får inte raderas som del av AI-ombyggnad.
- Gamla krav i [`nexus-intelligence-requirements.md`](nexus-intelligence-requirements.md) är **historisk granskning och idéunderlag**, inte dokumentation över aktiverade funktioner.

## Verifieringsgräns och godkännande

- **Tidigare verklig telefonkörning:** Gemma-chatt gav riktiga svar och rapporterade Hexagon HTP NPU 36/36 lager. Detta föregick den nya runtime-refaktoreringen.
- **Kodläge:** filerna ovan är skapade och kopplade på utvecklingsgrenen; konfigurationen har enhetstester.
- **Återstående verifiering:** senaste GitHub Actions-byggets utfall och installation på riktig telefon, `WARM/COLD`, ändring av endast sampling utan modellomladdning, ändring av native-inställning med omladdning, background/foreground inom/efter 30 s och minnestryck.
- Markera inte en ny APK som verifierad förrän dessa relevanta kontroller har genomförts. Publicera inte nya idéinkorgsjobb för att kompensera för en ofärdig bas.

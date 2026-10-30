# Nexus Intelligence – kravspårning och säker leveransgräns
Datum: 2026-10-30. Källa: Databas `Ideer/05dac249-5b6f-4920-8871-6293ef214119.json`, nummer bekräftat i `Ideer/System/nummer.json`. Detta är en utvecklingsgren, inte en färdig produktversion.

## Källkontroll
- App main vid inventering: `a4e037db697fd79621fbc4f2700aae1aee39b0ea`.
- Jarvis main: `943b40c27f1fce42ef7bfab613a0cc1d039b3575`.
- llama.cpp: `c7bda030e7faee594dbe7550185e857351ad405d`.
- Jarvis har JNI `llama_android`, CPU-kärna, OpenCL, Hexagon, HTP v73/v75/v79/v81, audit och toolchain från separat GitHub Actions + Docker. **Ingen av detta är ännu verifierat som integrerat i NexusHub.**
- Jarvis main normaliserar `contextSize` till högst **8192**. Telefonmätningarna vid **32768** kan inte tillskrivas denna commit utan export av installerad APK/profil.
- NexusHub har redan SQLite ActivityJournal, WorkManager för inkorg och synk. Dessa är inte en generell agentmotor.

## Säkerhetsprinciper
Modell får aldrig token, fria filvägar, godtycklig kod eller direkt GitHub-skrivning. Käll-ID, version och citat måste verifieras mot riktiga bytes. Ingen AI-output behandlas som verifierad semantik. Ingen flagga `completed` förrän steg och externa kvittenser har verifierats. Inga riktiga dokument ändras i feltester.

## Kravmatris (54 ursprungliga numrerade punkter)
Statusarna nedan avser HELA kravpunkten. Delimplementering utan sluttest får inte markeras som färdig.

| # | Kravområde | Status | Kvarvarande verifiering |
|---:|---|---|---|
| 1 | Händelsestyrd arbetsmotor | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 2 | Lokal Gemma som arbetsmotor | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 3 | Flerstegsarbetsflöden | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 4 | Arbete utan aktivt gränssnitt | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 5 | Beständig arbetskö | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 6 | Säkra kontrollpunkter | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 7 | Pausa, återuppta och avbryt | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 8 | Säker verktygsexekvering | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 9 | Resurs- och körningsbegränsningar | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 10 | Systemintegrerad arbetsnotifikation | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 11 | Dynamiska statusuppdateringar | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 12 | Framstegsindikator | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 13 | Slutförd körning | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 14 | Felnotifikation | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 15 | Automatisk felåterhämtning | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 16 | Korrekt status vid Android-avbrott | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 17 | Tryckbar notifikation | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 18 | Notifikationsåtgärder | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 19 | Gemensamt notifikationssystem | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 20 | Egen kontrollcentral | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 21 | Dynamisk systemöversikt | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 22 | Lista över arbetskörningar | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 23 | Individuell körningssida | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 24 | Liveuppdaterade arbetssteg | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 25 | Detaljerad steghistorik | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 26 | Gemma-telemetri | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 27 | Senaste logghändelse | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 28 | Permanent körningshistorik | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 29 | Filtrering och sökning | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 30 | Körningsjämförelser | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 31 | Separat resultatregister | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 32 | Berörda objekt | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 33 | Föreslagna och genomförda ändringar | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 34 | Spårbara AI-beslut | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 35 | Väntande godkännanden | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 36 | Öppna frågor och nästa arbetsmoment | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 37 | Koppling till aktivitetsloggen | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 38 | Mönsteranalys av historiken | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 39 | Beständig körningsdatabas | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 40 | Gemensam statuskälla | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 41 | GitHub-integration | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 42 | Lokal lagring och synkronisering | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 43 | Idempotenta operationer | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 44 | Säker felhantering | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 45 | Gemma som valfri komponent | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 46 | AI-resultat med versionsinformation | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 47 | Begränsad AI-behörighet | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 48 | Verifierbar körningsstatus | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 49 | GitHub Actions-inspirerad struktur | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 50 | NexusHubs befintliga tema | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 51 | Diskret användarupplevelse | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 52 | Tydlig skillnad mellan aktivitet och resultat | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 53 | Direktnavigering till resultat | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |
| 54 | Gemensam arbetscentral | Ej verifierad | Kräver implementation, kontraktstest och relevant Androidtest |

## Acceptanskriterier inför main
1. Återskapa Jarvis native ABI med samma pin, CMake, NDK 28.2.13676358, Snapdragon-toolchain och kontrollsummor. Kontrollera JNI-symbolers Java-paket, 16KB-sidor, licenser och HTP-loader.
2. Äkta Q4-import via SAF inklusive kopia, kontrollsummering och integritet, med semantiskt korrekt modell-ID.
3. Äkta inferens och kvitto på faktisk backend; CPU/GPU/NPU/AUTO samt NPU-only utan tyst fallback.
4. Beständig transaktionsbaserad run/step-store + WorkManager och korrekt FGS-policy; hantera processdöd, avbrott, nät och konflikt.
5. Riktiga verktyg för lokala dokument + Godkänn/avvisa-relationer + versionsfästa forskningspaket.
6. Full svensk kontrollcentral och inställningsutkast; Android-aviseringar från samma tillstånd.
7. Automatiska integritets-, Kotlin-, frontend-, JVM-, native-kontrakt-, lint- och UI-tester samt installerbar signerad APK från den befintliga signing identity.
8. Fysiska tester på S26 Ultra med importerad exakt GGUF-SHA; termik och verklig HTP-audit. Dessa kan inte simuleras i CI.

## NPU-bevisnivåer
- **Begärd**: NPU valt. Inget belägg för exekvering.
- **Vald**: runtime anger Hexagon, fortfarande inte mått på tid.
- **Offload**: rapporterade tilldelade lager; inget belägg för 99% av körtid.
- **Exekvering**: audit dokumenterar verklig HTP-aktivitet och fallback.
- **Andel**: nämn 99% först när täljare, nämnare och instrumenteringsmetod är kända.

## Känd leveransstatus
Ingen signerad Nexus Intelligence APK har skapats inom denna utvecklingsgren. Idé 33 kvarstår som `new`. Fortsätt endast med verifierade commits; publicera inte på main förrän acceptanskriterierna är uppfyllda.

# Idé 35 – komplettering efter eftergranskning

Granskningsbas: `de0808669a629428278b8926110d127d2f770fdb`. Alla 31 originalpunkter har ett uttryckligt beslut nedan. Flera grundrättningar finns redan i basversionen; kompletteringen rättar återhämtnings- och samspelsfel som eftergranskningen fann. En kodändring innebär inte i sig verifierad funktion på telefon.

## Gemensamma garantier

En skrivkvittens behåller operationsidentitet, komplett API-svar, bekräftad commit, berörda läsresurser och en beständig sekvens. Den återspelas utan en ny GitHub-skrivning. Äldre kvittenser får inte ersätta en senare resurskvittens, spärr eller modellcache. Äldre ofullständiga kvittenser kräver färsk läsning som bevisar utfallet; inget fabricerat sparat-svar returneras. Starten väntar på återställning. Radering kräver alltid uttryckligt användarbeslut, även vid återförsök.

En modellkörnings identitet och dess resursägarskap är olika saker. Den processgemensamma grinden hålls tills import, test, inferens och cleanup faktiskt har avslutats. Avbrottsavsikt består genom hashning/laddning/reset. En tidsgräns får inte överlåta en ännu aktiv native-resurs till nästa körning.

Import journalförs före filkopiering. Delvis kopierade original bevaras och visas som återhämtningskrävande. Lagringsutrymme kontrolleras under kopiering; detta ersätter inte hanteringen av verkliga skrivfel. Återskapbar cache gallras separat; original, replikaobjekt och äldre snapshotversioner raderas aldrig av den nya cachebudgeten.

## Beslut per originalfynd

| Nr | Beslut och implementation | Verifiering |
| --- | --- | --- |
| 1 | Återanvänd privat Android-kopia; bakgrundsimport strömmar original. Förjournal, utrymmesreserv, delstatus och återupptäckning skyddar diskfel/processavbrott. | IncomingShareStoreTest, BackgroundIntakeTest; verklig SAF/processdöd kräver telefon. |
| 2 | Kompletta beständiga kvittenser och en gemensam integrationsväg för alla bekräftade skrivningar, inklusive todos och uttrycklig DELETE. | storage-recovery, outbox-identity, verklig todos-route med förlorad lokal integrering. |
| 3 | Resursbundna spärrar återställs före första läsning; senare kvittens kan aldrig ersättas av en äldre återleverans. Git-härstamning används i stället för numerisk SHA-jämförelse. | mirror-write-barrier och storage-recovery. |
| 4 | Innehåll och metadata binds till samma manifest; Plugins manifest läses från samma snapshot. Pågående läsningar skyddas genom att originalversioner behålls. | replica-read/projections/plan/sync, Plugins-snapshotregression. |
| 5 | Berättelseomslag är felisolerade från film/serie även lokalt. | story-cover-posters, repository-posters. |
| 6 | Kalenderhooken följer rätt svarsnivå och hanterar tomt/fel separat. | calendar-view och kalenderns domän-/UI-kontroller. |
| 7 | Native-journal överlever navigering; processavbrutet arbete markeras avbrutet. WebView tar bort pending-markören först efter beständigt sparat svar. | intelligence-ui-recovery, native journal; fysisk Activity/processdöd kvar att prova. |
| 8 | Arbetskontext utelämnar hela äldre turer över bryggans meddelande-/JSON-gränser. Native budgeterar den verkliga chattemplaten med modellens tokenizer och reserverad utdata. Synlig historik kapas inte av denna budgetering. | gemma-context, ChatContextBudgetTest. |
| 9 | Hela godkända frågan bevaras. Endast kompletta källutdrag utelämnas; synlig begränsningsnotis och diagnostik gäller exakt det skickade urvalet. | rag-ui-evidence, rag-evidence/idétester. |
| 10 | Native HTML-dialog med modal bakgrund, fokus, Escape/Tillbaka, fokusåtergång och tydligt val för osparade inställningar. | intelligence-ui-recovery; verklig WebView-fokus verifieras separat. |
| 11 | Aktuella idéer härleder räknare och sena resultat ignoreras. | idea-intelligence-regressions, widget-activity. |
| 12 | Editoroperationer binds till identitet och generation även vid A→B→A. Sena resolve/undo/save-fel får inte uppdatera nästa serie. | watch-editor-identity, calendar-watch-domain. |
| 13 | Befintlig HTP-audit och dess körningsidentitet återanvänds; audit återställs även för varm inferens. | Kodkontrakt/native-bygge; kall/varm verklig NPU-audit på S26 Ultra återstår. |
| 14 | Kotlin och C++ har samma top-p-kontrakt utan dold 0,05-omräkning. | Befintlig konfigurationskontroll och native-bygge. |
| 15 | Processgemensam modellkoordinator omfattar importens provinferenser och livscykel-/cleanup-operationer. Aktivt lås släpps först efter verkligt avslut. | ModelRunCoordinatorTest; fysisk minnes-/NPU-belastning återstår. |
| 16 | Streaming håller möjliga stopp-prefix under körning men publicerar legitim resttext vid normalt slut/tokenlimit. Kompletta stoppmarkörer döljs. | Verklig runtime-utils.h kompileras med g++; UTF-8, överlapp och avbrott ingår. |
| 17 | Dynamiska katalognycklar använder säkra uppslag; legitima special-ID:n stöds. | economy-intelligence och katalogtester. |
| 18 | Strikt kalenderdatumvalidering återanvänds i API/formulär; kalenderdatum hålls åtskilda från tidsstämplar. | economy-intelligence och datum-/kalenderdomän. |
| 19 | JSON-sökvägar är reporotrelativa. Markdown stödjer dokumentrelativa och etablerade rotlänkar. Traversering/protokoll avvisas. Extraktionscache versioneras om så gamla fel inte överlever. | reference-paths, connected-services med förladdad gammal cache. |
| 20 | ZIP och SHA256SUMS använder samma stagingstruktur och leveransen verifieras efter uppackning. | APK-workflowens faktiska checksummeverifiering. |
| 21 | Release-taggen binds till verklig byggcommit och befintlig tagg kontrolleras; APK-signatur bevaras. | APK-workflowens tagg-/identitets-/signaturkontroller. |
| 22 | Alla sju browserkontroller använder samma strictPort-start, unik körningsidentitet, egna portar och inväntad cleanup. | ui-test-server inklusive upptagen port; riktiga browserkontroller i separat grenkörning. |
| 23 | RAG/index/generering har separata signaler och körningsidentiteter; avbrott når native och sena svar kan inte publiceras i nästa körning. | embedding bridge, ModelRunCoordinatorTest, RAG-UI och native avbrottstest. |
| 24 | Samtliga aktuella tester har ett dokumenterat kommando. Historiska fall har individuella beslut och meningsfulla ersättningar; inga giltiga fel göms som historik. | npm run test:current; tests/historical/README.md. |
| 25 | Designkontrollen redovisar 36 hashverifierade och 6 uttryckliga undantag, i stället för att påstå 42 hashverifierade. | npm run check:design. |
| 26 | README, testguide och denna beslutsmatris beskriver verklig implementation och verifieringsgränser. Äldre daterade kontroller i verification.md är historik. | Kommandona körs och resultaten redovisas separat. |
| 27 | Ingen obelagd koddelning införs. APK:ns offlinefunktion bevaras. Paketstorlek ensam bevisar inte dålig upplevelse; kall-/varmstart och navigation ska mätas på telefon före eventuellt ingrepp. | Produktionsbygge; fysisk prestandamätning kvarstår som uttrycklig beslutsgräns. |
| 28 | IndexedDB-prefixfrågor använder lowerBound och avslutas när prefixet upphör; nyckellistor kräver inte läsning av alla värden. | Prefix-/lagringskontrakt och anslutna tester. |
| 29 | 64 MiB logisk UTF-8-budget gäller bara återskapbara kopplings-/idé-/träningscacheposter. Uppstarts­inventeringen mäter verkliga värden trots avbruten metadatauppdatering. Ingen allmän TTL. | derived-cache inklusive migration, skyddade namnrymder och avbrott. |
| 30 | Korruption begär verifierad ersättning; aktuella och beroende projektioner uppdateras efter verifierad publicering. Föråldrade reparationsmarkörer avslutas först därefter. Historiska originalversioner behålls. | replica-sync och mirror-tester med korruption, borttagning och versionsbyte. |
| 31 | Berörda komplicerade flöden delas i namngivna steg och gemensamma hjälpare. Ingen svepande formaterings- eller arkitekturomskrivning utan nytta. | Oberoende diffgranskning och beteendetester; ren formatering är inget funktionsbevis. |

## Verifieringsstatus

Aktuella lokala och Actions-resultat fylls i efter slutförd verifiering. Inga fysiska Samsung-, Androids lagringstrycks-, processdöds- eller NPU-prestandaprov har utförts i denna körmiljö. De kvarstår även om kompilering och simulerade felprov passerar.

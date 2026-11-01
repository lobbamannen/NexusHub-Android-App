# Historiska referenstester

Dessa filer bevarar tidigare krav som inte längre kan köras direkt mot Android-repot. De är `.reference.mjs`, inte del av `npm run test:current`. Återinför inte borttagna Site-verktyg för att få dem gröna.

| Tidigare fall | Beslut och aktuell täckning |
| --- | --- |
| `local-posters`: importer requires explicit checkout | Site-verktyget `scripts/sync-posters.mjs` finns inte i Android. Android hämtar verifierade Databas-affischer; `repository-posters.test.mjs` och `story-cover-posters.test.mjs` kontrollerar dess kontrakt. Extern import kräver separat verktygsgranskning. |
| `local-posters`: importer preserves bytes | Samma borttagna verktyg. Kravet att behålla fungerande affischer skyddas av nuvarande affisch-/replikatester. Dessa bevisar inte ett externt importverktygs beteende. |
| `source-sync-dynamic`: Site integrity | Site-publiceringens `scripts/check-sync.mjs` finns inte i Android. APK-källidentitet, native-cache och design verifieras av Android-workflow, `test_native_cache_key.py` och `npm run check:design`. |
| `series-ui`: portal/detail/list/Swedish seasons | Tidigare JSX-regexar var beroende av whitespace, komponentlayout och gammal portalform. `series-ui.test.mjs` renderar nu verklig Series och provar vald identitet, affischreserv, sidbyte, sökning, versionsbunden Vill se och individuellt belagda säsonger. Domän- och API-tester behålls. |

Övriga gamla fel har inte undantagits:

- Uppladdnings-API:t körs mot appens riktiga `STORAGE_SCHEMA`, inklusive omleverans och samtidiga anrop.
- Seriernas Vill se-domäntester behålls; dess gamla textformatkontroll ersätts av det verkliga spar-/renderingsfallet i `series-ui.test.mjs`.
- Det stora registertestet skriver en legitim stor JSON-nyttolast och verifierar längd och Git-blob-SHA. En gräns från ett tidigare transportkontrakt återinförs inte. Misslyckanden producerar ingen megabyte-stor assert-diff.

Referensernas relativa filvägar är historiska och ska läsas som dokumentation, inte köras som gällande testkommandon.

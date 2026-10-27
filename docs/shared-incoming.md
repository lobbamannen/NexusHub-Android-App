# Gemensam tillfällig mottagningsinkorg – 2026-10-27

## Avsikt
Dela ett dokument till NexusHub, låt ChatGPT läsa dess verifierade GitHub-kopia, skicka eventuellt vidare och radera sedan mottagningspaketet. Ingen separat backend. Befintlig token, paketidentitet och lokala lager behålls.

## Kontrakt
`NexusHub inkorg/<mottagnings-UUID>/metadata.json` har schemaVersion 1, id, text, createdAt och files med id, name, mime, path och blob-SHA. Originalen heter `<fil-UUID>-<rensat originalnamn>`. Delad text finns dessutom i `delad-text.txt`. Metadata listar filerna så chattar kan hitta originalnamn och sammanhang. Ingen delad text eller filväg skickas till PostHog.

Ett komplett paket skapas i en Git-träd/commit-operation med fast-forward-skydd och återläsning. Samma paket/bytes är ett skrivfritt återförsök. Tidigare borttaget metadata-ID återanvänds aldrig, även om uppladdningssvaret gått förlorat. Övriga databasfiler är utanför skrivomfånget.

Radering kräver exakt mängd sökvägar och SHA:n från kvittensen. Avvikande eller tillagda filer ger konflikt. Vid avbrott behålls mottagningsoriginal och den beständiga raderingsavsikten. En lätt lokal borttagningsmarkör hindrar att ett native-original återkommer efter avbruten lokal rensning. Tidigare vidareöverförda kopior raderas aldrig av mottagningsradering. ChatGPT ska radera hela UUID-paketet, inte endast metadatafilen. Paket utan metadata/med avvikande filer ger fel i stället för tyst städning.

Automatiken arbetar när appen är öppen: efter ny mottagning, anslutnings-/GitHub-förändring, återgång till appen och en minut som reserv. En gemensam låsning hindrar överlappande synkkörningar; automatisk synk spelar inte upp appens allmänna skrivkö. Vid fel syns väntestatus och Uppdatera återförsöker. Bilagor valda i idéeditorn är lokala utkast och skickas fortsatt först via dess Spara.

Lokala mottagningsposter med kvittens som försvunnit från aktuell GitHub-lista rensas i appen. Nya giltiga GitHub-paket kan hämtas till inkorgen, med hashkontrollerade bytes. Fullständig GitHub-/spegelhistorik är fortsatt historik, inte en säker raderingstjänst.

## Kontroller
Automatiska tester täcker binära bytes, delad text, atomicitet/idempotens, raderingskonflikter, förlorad kvittens, nätavbrott, beständig raderingsavsikt, extern radering, idéutkast och räknare utan metadata. TypeScript, produktionsbygge och kontroll av låsta designoriginal körs. Telefonens faktiska delningsflöde och visuell utformning återstår att verifiera vid användning; ingen browserkontroll har påståtts.

## Startsidan
Att göra/Idéinkorg, Kalender, Film & serier, Berättelser/Plugins, Ekonomi/Träning och sist Kunskapsbanken. Mottagningens rosa räknare återanvänder modulens accent. Databasboxen tas bort helt; synkstatusen ligger separat i hälsningens högra hörn och öppnar inställningarna. Den är grön först efter faktisk slutförd synk, orange när arbete pågår/pausats/är overifierat och röd vid fel.

## Flerval, dubbletter och återförsök
Androids filväljare hanterar både clipData (flerval) och data (enstaka fil), med oförändrade URI-behörigheter. Valda dokument läses till beständiga Blob-original och sparas en post per fil. Alla val redovisas som sparade, identiska/hoppade över eller fel; ett filfel stoppar inte övriga val. Identiskt innehåll kontrolleras med Git-blob-SHA mot lokal inkorg, GitHub-metadata och samma urval, även om filnamnen skiljer sig. Samma namn med olika innehåll tillåts. Befintliga dubbletter raderas inte automatiskt.

Försök igen finns globalt och på poster med synkfel. Pågående försök visar status och filnummer. Automatiken återförsöker ungefär varje minut medan appen är synlig; den lovar ingen bakgrundssynk i en stängd app. Äldre `Mottagningsinkorg/` stöds för läsning och säkra återförsök. Befintliga kvittenser kan flyttas till nya sökvägen endast om metadata och samtliga filhashar motsvarar exakt samma tidigare paket.

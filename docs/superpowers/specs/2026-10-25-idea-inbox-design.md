# Idéinkorg — godkänd inriktning 2026-10-25

Robin har valt att bygga förslaget i chatten med eget startsideskort, antal nya idéer, snabbval under pluset, vidareutveckling av samma idé och statusarna Ny, Undersöks, Genomförd, Avfärdad. Ingen Android-delning nu. Befintlig premiumdesign och Site-kod ska bevaras.

## Upplägg
En JSON-fil per idé i Databas/Ideer/<UUID>.json: schemaVersion 1, id, text, status (new/investigating/completed/dismissed), createdAt, updatedAt (ISO UTC). Ingen titel eller kategori. En samlad registerfil vore något billigare att läsa men skulle ge onödiga konflikter mellan olika idéer; separata Markdownfiler kräver eget metadataformat. JSON per idé är användarens val. Ingen separat indexfil behövs.

Lokal, beständig utkastlagring och befintlig skrivkö. Uttryckligt Spara skickar samma stabila ID och oförändrad expectedSha till GitHub. En ny fil skapas utan SHA; befintlig fil kräver sin lästa SHA. Filhash och kvittens kontrolleras. Ett osäkert svar kan återläsas och samma innehåll bekräftas utan dubbelskrivning. Ingen automatisk uppspelning av kön. Väntande idéer och lokala utkast skiljs från GitHub-sparade idéer, även efter omstart.

Editor öppnas som dialog från valfri sida, autofokus, fritt textfält och status. Stäng behåller utkast; uttrycklig Ångra tar bort motsvarande väntande skrivning och utkast. Pågående sparning kan inte avbrytas via navigation. Konflikt behåller text och kräver ett uttryckligt val av GitHub-version innan redigering fortsätter. Idélistan har statusfilter och kort för full text/redigering, nyast ändrad först. Genomförda och avfärdade bevaras. Startsideskort och menyalternativ leder till listan. Plusmenyn behåller dokumentuppladdning.

## Avgränsning
Ingen backend, MCP, Firebase, bakgrundstjänst eller migrering. Ingen automatisk forskning eller genomförande av en sparad idé. Databasens övriga register ändras inte. Befintlig signerad APK-identitet används. Dokumentera nya mappen och lagringskontraktet så ChatGPT kan använda dem.

# Idé 17–22: implementation och kontroll

2026-10-27. Robin godkände omedelbar implementation/publicering och därefter arkivering.

- Plus: Ny idé eller Ny uppgift. Uppgifter använder befintliga Att-gora/register.json och todos:draft:v1; nytt separat beständigt kompositionsutkast todos:compose:v1. Valfri ideaId-länk. UUID stabilt vid nytt sparförsök. Alla befintliga listutkast bevaras och sparas tillsammans först på uttrycklig Spara.
- Idéinkorg/Färdiga planer huvudvyer, diskret läsbart Arkiv. Genomförda/avfärdade statusfilter borttagna från huvudvyn. Arkivet hämtas från Ideer/Genomforda i både live API och lokal spegel. Lokala osparade statusbyten och konflikter ligger kvar i redigerbar inkorg.
- Två kortstorlekar i stabilt tvåkolumnsrutnät. Kompakta Mottagningsinkorg/Att göra på samma rad. Självklara beskrivningar borttagna. Materialikoner, typografi och originalets CSS-resurser oförändrade; avstånd och storlek i separat compact-home.css. Långa namn får radbrytas.
- Övre menyknapp borttagen. Sök/synk kvar, bottenmeny med dokumentuppladdning/inställningar/navigation kvar. Träningssidan lämnad avsiktligt minimal.

## Verifiering

- TypeScript check, 42 originaldesignkontroller, Vite production build och git diff --check passerade.
- Node-domäntester verifierar task-upsert utan dubbletter, övriga draftfält, ogiltiga id/text, live/mirror arkivseparation och åtkomliga lokala idéutkast.
- Faktisk useTodos-hook testad med React renderer: hela snabb-sparningen låses före första await; dubbel submit blockeras; lokal draft bevaras vid konflikt och retry behåller UUID/andra ändringar; GitHub-ändring uppdaterar ren lista men ersätter aldrig lokalt utkast. Renderern är en utvecklingsdependency, ingår inte i appbundle.
- En separat granskare hittade fyra viktiga kanter (terminalt idéutkast, sparstartsrace, extern task-omläsning, lång kompaktrubrik). Samtliga rättade; beteenderättningar har regressionskontroller.
- Den historiska fulla Node-sviten: 195 tester, 186 godkända, 9 befintliga fel från gamla Site/fixturetester. Samma nio som dokumenterats vid föregående release: github-inbox.test.mjs, två poster-importer-fall (saknat sync-posters-script), tre series-ui-fall, ett series-watchlist-UI-fall, source-sync-dynamic Site-integritetsfall och upload-api.test.mjs (saknad drizzle-fixture). Berörda nya kontroller och Actions-sviten körs separat. Fulla gamla sviten är inte grön.
- Visuell mobilkontroll kunde inte utföras: cloud browser nekade lokal preview genom säkerhetspolicy. Ingen alternativ browser eller kringgående användes. Kodläsning, designhashar och renderer är inte en skärmbild eller ett verkligt Samsung-test. Utseendet följs upp under normal användning.

## Beslut och leverans

Återanvänd befintlig uppgiftsfil i stället för ny parallell datamodell. Arkiverade idéer är skrivskyddade så de inte kan återskapas som aktiva av redigerings-API:et. Behåll originalens statusfält och numrering. Inga befintliga innehållsposter, token- eller Android-identiteter ändras av appbygget.

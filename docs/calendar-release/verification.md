# Verifiering – kalender och seriebevakning

Kontroller utförda 26 oktober 2026. Automatisk byggstatus för den publicerade revisionen finns i GitHub Actions.

## Utfört lokalt

- TypeScript: `npm run check` godkänd.
- Originaldesign: `npm run check:design` godkänd, 42 skyddade filer kontrollerade. Nya moduladaptrar återanvänder befintligt designsystem.
- Produktionsbygge: `npm run build` godkänt. Vite ger en befintlig storleksvarning för den gemensamma JavaScript-bunten; ingen körningsförlust eller byggblockering.
- Riktad appsvit: kalenderdomän/editor/GitHub-skrivningar samt befintliga replica/mirror/idéer/bilagor/konflikter/ekonomi. Slutligt antal anges i Actions-jobbets testutskrift.
- Riktiga fristående Kotlin/JUnit-tester kompilerade och körda. Se native-report.md för nativebeteende och slutligt antal.
- En separat kodgranskning fann datumkonvertering, checkpointbyte vid ändrade abonnemang, specialsäsong noll och samtidig läsmarkering. Felen reproducerades i regressionstester och rättades. Även återställning efter borttagning och periodens förvalda dag korrigerades.

## Mobilgranskning

Den verkliga React-koden öppnades i mobilram, med **helt syntetiska data och en simulerad nativebrygga**. Kontrollerat: startsidans nya ingångar, månad/dag, svensk kalender, egen händelse med sparbekräftelse, kvarvarande lokalt utkast, inställningar och skärmbredd 320/393 px. Vid höjd 380 px är dialogens Spara/Ångra synlig medan lång anteckning rullar inuti. Inga verkliga telefonbokningar eller privata Databas-fixtures laddades i webbläsaren; inga externa skrivningar gjordes därifrån.

## Befintliga historiska tester

En bred körning av `node --test tests/*.test.mjs` innehöll nio fel som också reproducerades på den tidigare appkoden: `github-inbox.test.mjs`, två `local-posters.test.mjs`-fall, tre `series-ui.test.mjs`-fall, `series-watchlist.test.mjs`, `source-sync-dynamic.test.mjs` och `upload-api.test.mjs`. De gäller importerade Site-/källkodsformateringskontroller, saknade gamla scripts och gammal testmiljö. Ett ytterligare allowlist-test uppdaterades för det nya, uttryckligen tillåtna `set-release-watch`. Den riktade Android-appsviten är separat och körs i APK-workflowt. Detta dokument påstår inte att hela den historiska Site-sviten är grön.

## Återstår på fysisk telefon

Ingen fysisk Samsung, verkliga kalenderkonton eller autentiserad Streaming Availability API-nyckel var tillgänglig i utvecklingsmiljön. Därför är följande inte verifierat här:

- Kalenderbehörighet/återkallelse och konto-/OEM-specifika återkommande undantag på Samsung.
- Riktiga svenska serie-/avsnittsträffar, leverantörens faktiska täckning och verklig anropsförbrukning.
- Synlig Android-push och dess serielänk, Doze, omstart och Samsungs batteriinställningar.

Efter uppdatering: öppna Kalender och välj åtkomst. Öppna Seriebevakning → Inställningar, ange din kostnadsfria leverantörsnyckel, välj abonnemang/notiser och spara. Slå på en serie, spara och begär Kontrollera nu. Första insamlingen är avsiktligt en tyst baslinje. Se sedan status/historik; jämför faktiska fynd med den svenska tjänsten innan notisernas träffsäkerhet betraktas som praktiskt verifierad.

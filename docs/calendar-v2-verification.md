# Kalender V2 – verifiering

## Omfattning
Kalender V2 ändrar presentation och val av dag i den befintliga React-vyn i Androids WebView. Befintlig kalenderbehörighet, lokala telefonbokningar, egna GitHub-händelser, utkast, konflikter, borttagning/återställning och systemkalenderlänkar återanvänds. Inga telefonbokningar eller platser skrivs till GitHub eller ny diagnostik.

## Kontroller
- TypeScript och originaldesignens 42 skyddade filer kontrollerade.
- 19 kalendertester passerar: bland annat Stockholms sommar-/vintertidsgränser, exklusiva slutdatum, datumval, sortering och avvisning av oavsiktliga svep.
- Native Robolectric-test använder en lokal Calendar ContentProvider och verifierar att plats följer med den befintliga intervallfrågan utan extra detaljfrågor per händelse.
- GitHub Actions bygger båda APK:erna, kör app-/wear-enhetstester och release-lint och kontrollerar samma signeringsidentitet som tidigare APK.
- Kandidat 69 verifierade kalender/dag/detaljer/tom dag/veckans overflow/agenda på 320 och 412 px; kontrollen av nedåtdrag vid 900 px låg utanför skärmens synliga yta. Testet centrerar därefter handtaget utan mjuk sidrullning före riktiga pekarhändelser. Utgivningen spärras tills sluttestet passerar på alla tre bredder.
- Playwright testar 320/412/900 px med uttryckligen syntetiska händelser. Tester omfattar verklig höjdändring, namn/plats/detaljer, samma datum för stängning, tom dag och rätt datum i nytt utkast, native Tillbaka-adaptern, rullbar lista, panelhandtag, reducerad rörelse och fler-länken på ett datum utanför månaden.

## Oberoende granskning
Källgranskning upptäckte att FullCalendar 7 tolkar varje sträng från moreLinkClick som ett vynamn. Därför ersattes den felaktiga strängen `none` med en isolerad adapter för bibliotekets befintliga truthy non-string-gren. Regressionstestet kontrollerar att en fullbokad dag utanför månaden öppnas utan att byta månad.

## Begränsningar
De första visuella kandidaterna blockerades av publiceringsspärren. DOM-diagnostik visade att test-HTML saknade doctype, medan produktionssidan redan hade den. Webbläsarens quirksläge gjorde FullCalendars klassnamn som skiljer sig endast i skiftläge likvärdiga (`fc-Ru` relativ placering och `fc-rU` dold mätning). Testerna använder nu standardsläge och verifierar `document.compatMode`. Hook-datum konverteras uttryckligen till svensk kalenderdag, eftersom svensk midnatt kan ligga på föregående UTC-datum. Fysiska Samsung-gester, kontoleverantörernas kalenderdata och faktisk batteritid måste följas på telefonen; CI ersätter inte de kontrollerna. Befintliga orelaterade testfel dokumenteras i väderverifieringen.

Slutgranskning av kalenderkoden fann inga kvarstående kritiska eller viktiga fel. Publiceringsjobbet kräver gröna väder- och kalendertester före signering och publicering. Skärmbilder sparas som Actions-artifact `calendar-ui`; widgetens native-rendering sparas separat.

# NexusHub – intelligent ekonomikatolog och periodanalys

## Avsikt
Robin skickar kvitton till sin befintliga ChatGPT-chatt. Chatten registrerar varje köp exakt en gång i rätt periodfil i `lobbamannen/Databas`. NexusHub tolkar och presenterar artiklar via en gemensam redigerbar katalog, utan att kvittohistoriken dubbellagras eller skrivs om.

## Beslutat upplägg
- `Ekonomi/Katalog/kategorier.json`: stabila kategori- och produktgrupps-ID:n med redigerbara namn.
- `Ekonomi/Katalog/produkter.json`: särskiljbara produkter och kvittoalias, med referenser till produktgrupper. Enkla artikelbenämningar ska inte hittas på som specifika märkesvaror.
- `Ekonomi/Gemensamt/<år>/<periodstart>.json`: enda källa för belopp, datum, betalare och artikelrader. Historiska importer lämnas orörda.
- AI behövs för att tolka nya kvitton eller oklara artiklar; kategorier och statistik ska fungera deterministiskt och lokalt i NexusHub.
- Artikelmatchning prioriterar säker exakt aliasträff, därefter tydligt äldre artikelkategori som reserv. Osäkra namn får etiketten `Behöver granskas` och kan korrigeras i katalogvyn.
- Rabatter som avser en identifierbar vara ska minska den varans kategori. Oklara rabatt- och bonusrader särredovisas; pant separat. Artikelrader summeras aldrig som extra köp ovanpå köpbeloppet. Köp utan fullständiga artiklar visas som ospecificerade, aldrig som säker kategoriomsättning.
- Månadsindelning = faktisk utbetalning till nästa utbetalning, med periodfilens startdatum och nästa kända periodstart som gräns. Gissa aldrig nästa löneutbetalning.
- Läs- och skrivflöden ska vara GitHub-SHA-skyddade, offlinekön ska fungera som för andra ekonomiposter, och appens mörka premiumdesign med grön bottenfade bevaras.

## Inom scope
Katalogfiler med försiktig startklassificering av verkliga historiska varor, analys per period/kategori/produktgrupp, undermeny Kategorier & produkter, redigering av kategorier/grupper/produktalias och GitHub-synkronisering, tester och README.

## Utanför scope
Automatisk OCR i NexusHub, fullständig ChatGPT-pluginintegration, importer av fler kvitton, nya ekonomibelopp eller antaganden om kontosaldo, och ändringar i arkiverade Site-repon.

## Alternativ och valt sätt
- En enda fil med samtliga kvitton och regler: färre filer men dyra konflikter och duplicering, bortvalt.
- Kategorier direkt på varje äldre kvitto: enkelt initialt men ändringar kräver historikomskrivning, bortvalt.
- **Valt:** separata kategorier och produktkunskap, men köp endast i periodfiler. Ger säker redigerbar klassificering och en enda skrivning per nytt kvitto.

# Kalender och seriebevakning i NexusHub Android

Implementerar idé 8 och idé 12 i den befintliga appen, med samma paketnamn, ursprung, lokala lagring och signeringsflöde. Senaste ändringen av idéinkorgens glödlampa från main har bevarats. Den arkiverade Siten ändras inte.

## Kalender

Öppna Kalender från Hem eller menyn. Månad, tre dagar på smal telefon/vecka på bred skärm, dag och agenda använder svensk tid och måndag som veckostart. Alla dygnets timmar finns i tidsvyerna. Senast vald vy och källfilter bevaras lokalt.

Knappen för kalenderåtkomst begär Androids läsbehörighet först när du trycker. Telefonkalendrar läses genom Android Calendar Provider, inklusive återkommande förekomster. De hämtas i sidor vid täta intervall; ingen total antalsgräns döljer bokningar. Androids kalenderapp ansvarar för sina kontons molnsynk. NexusHub ser det som finns på enheten.

Telefonbokningar finns enbart i tillfälligt minne. Titel, beskrivning, plats och kalendernamn sparas inte i GitHub, skrivkön eller lokal backup. Detaljer hämtas när du öppnar bokningen. Återkallad behörighet och appens återkomst invalidierar gamla svar. Öppna i kalenderapp använder systemets egen händelsevy.

Egna händelser skapas med titel, tid/heldag och anteckning. Utkast sparas lokalt. Spara skickar en enskild ändring med exakt GitHub-SHA till `Kalender/egna-handelser.json`. Register skapas när den första egna händelsen sparas. Radering är mjuk och kan återställas. En konflikt visar båda versionerna och säkerhetskopierar dem lokalt innan ett uttryckligt val. Spara/Ångra påverkar bara den egna posten. Systemkalenderns Lägg till öppnar ett formulär; det innebär inte att bokningen har sparats. Påminnelser sköts av telefonkalendern när du väljer att lägga posten där.

## Seriebevakning

Öppna Seriebevakning från Hem/menyn, eller Bevakning i en series detaljvy. Nytt, Kommande, Bevakar, Historik och Inställningar delar appens svarta paneler, materialikoner och lila handlingsknappar.

1. Öppna Inställningar i Seriebevakning och ange din egen **Streaming Availability API**-nyckel från [Movie of the Night](https://developers.movieofthenight.com/). Använd leverantörens kostnadsfria plan. Appen aktiverar ingen betaltjänst.
2. Välj abonnemang och notiser. Spara bekräftar GitHub, Ångra tar bort det lokala utkastet. Tillåt Android-notiser om du vill ha dem när appen är stängd.
3. Under Bevakar söker du bland dina serier och väljer avsnitt/säsonger samt gemensamma eller särskilda tjänster. Spara. Betyg, favoriter, sedda säsonger och Vill se berörs inte. En entydig IMDb-identitet krävs för automatisk matchning.
4. Kontrollera nu begär ett bakgrundsjobb. Första insamlingen efter aktivering/ny tjänst skapar en tyst baslinje. Historiska avsnitt ger inte en notisstorm. Android bestämmer när bakgrundsjobben får köras.

API-nyckeln matas in i ett native Android-fönster och krypteras med Android Keystore. Den exponeras aldrig till React, GitHub eller APK-källkoden. Den är separat från din befintliga GitHub-token. Tom inmatning tar bort nyckeln. Vanlig APK-uppdatering bevarar både token och nyckel; avinstallation/rensad appdata gör det inte.

WorkManager kontrollerar dagligen omkring 15.00 Europe/Stockholm med nätverksvillkor. Datumstyrda engångsjobb räknas om för varje dag och följer sommar/vintertid; äldre sex-timmarsjobb tas bort. Appstart och konfigurationsändringar ger inga extra omedelbara kontroller. Högst sex API-sidor behandlas per arbetspass; om fler sidor behövs återupptas samma låsta dagliga kontroll med befintlig spärrtid och kvotskydd. Budgeten är 900 HTTP-försök per UTC-månad och varje försök debiteras före anropet. Manuell kontroll använder samma budget och spärrtid. Användning av samma leverantörsnyckel utanför NexusHub räknas separat av leverantören och kan också förbruka gratiskvoten. 401 stoppar tills nyckeln ändras, 429 respekterar återförsökstid. Delvis kontroll och fel visas, utan ett falskt besked om fullständig täckning.

Källan är `/v4/changes`, svensk abonnemangskatalog, sex oberoende strömmar: nytt/borttaget/kommande × säsong/avsnitt. Tjänster samlas i samma begäran och varje förändring måste innehålla explicit tjänst och säsongs-/avsnittsnummer. Cursor och fast tidsfönster sparas atomiskt med resultatet. En watermark flyttas endast när fönstret är färdigläst. Daterad upptäckt är inte ett premieredatum.

Netflix, Prime Video, Disney+, HBO Max och SkyShowtime stöds för tillgänglighet. Kommande flöde finns för de fyra första. Viaplay och TV4 Play saknar verifierad adapter och visas inte som bekräftade träffar. Internationella sändningsdatum fabriceras inte till svensk streamingtillgänglighet. En stabil händelseidentitet förhindrar dubbletter och grupperar säsongens avsnitt i notiser. Lässtatus och notifieringsstatus hålls isär. Tysta timmar skjuter upp notiser.

Bevakningsval finns i respektive serie under `Serier/register.json` som `releaseWatch`. Gemensamma inställningar finns i `Serier/bevakning-installningar.json`. Historik/läskvitton säkerhetskopieras i `Serier/Bevakning/handelser.json`; privat native baslinje/cursor/kvot/nyckel hör till Androids lokala lagring. GitHub-konflikter byter aldrig versionsnyckel tyst. Telefonbokningar ingår aldrig i någon av dessa filer.

## Datum och täckning

Kalendern visar bara verkliga mediedatum när källan lämnar ett bekräftat svenskt släppdatum med dagsprecision. Ett nytt tillgänglighetsfynd utan släppdatum syns i bevakningen, utan att få ett påhittat kalenderdatum. TMDB-filmpremiärer är den uttryckligen separata, valfria fasen i idé 12 och ingår inte i denna leverans.

Leverantörens förändringsfönster är begränsat till 31 dagar; lång frånvaro eller mycket täta flöden kan lämna luckor. Appen redovisar delvis täckning. Varken WorkManager eller Samsung garanterar exakt tid. Verklig svensk träffsäkerhet och OEM-kalenderbeteende måste valideras på telefon med egen nyckel; de kan inte bevisas av en byggd APK.

## Designregler

Kalenderns guld och bevakningens blå ton gäller modulikon och sidglöd. Svarta täta paneler, appens befintliga typografi, materialstorlekar och lila handlingar gäller även här. En modul får aldrig införa en egen ljus kalenderstandarddesign. Långa anteckningar rullar inne i dialogens innehåll, medan dialoghuvud och Spara/Ångra ligger kvar. Smal dagvy har ingen horisontell tidsrullning.

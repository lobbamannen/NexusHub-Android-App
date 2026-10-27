# Nexus Hub App

Självständig Android-version av Nexus Hub. Appen kör det verkliga React-gränssnittet lokalt och kommunicerar direkt med GitHub. Den tidigare Siten och dess Android-wrapper bevaras som arkiverade versioner.

## Användning och underhåll

Robin använder sedan 2026-10-25 Android-appen som sin huvudsakliga NexusHub. Siten är en arkiverad version och ska inte vara mål för löpande utveckling eller publicering. Dess befintliga kod och driftsättning lämnas orörda; GitHub-innehållet flyttas inte.

| Vad ändras? | Var görs det? | Leverans |
|---|---|---|
| Dokument, register, betyg, lässtatus och bilder | Befintliga sökvägar i [Databas](https://github.com/lobbamannen/Databas) | Hämtas av respektive klient; ingen ny APK behövs för innehåll som redan stöds. |
| Android-appens funktion eller utseende | Detta repository | Bygg en ny signerad APK och installera ovanpå den befintliga appen. |
| Den arkiverade Sitens kod | [NexusHub](https://github.com/lobbamannen/NexusHub) | Ingen löpande publicering; ändring kräver ett uttryckligt beslut att återuppta Site-arbete. |
| Pluginpaket och katalog | [ChatGPT-Plugin](https://github.com/lobbamannen/ChatGPT-Plugin) | Följ respektive plugins publiceringsflöde; GitHub-källa och installation i ChatGPT är skilda saker. |

Ändra inte databasens format eller skapa dubbla register för Android. Android använder samma GitHub-filer som den arkiverade Siten. En arkiverad driftsättning som fortfarande går att öppna är inte automatiskt en fryst ögonblicksbild av dessa filer. Telefonens väntande sparningar kan inte verifieras genom att bara läsa GitHub. Kodändringar i en version förs inte automatiskt över till den andra.

## Installera och anslut

1. Öppna **Actions → Build Nexus Hub App APK → Run workflow**. Push till `main` bygger också appen.
2. Hämta `nexus-hub-app.apk` från den färdiga körningens Release eller artefakten `nexus-hub-app-apk`.
3. Installera appen. Den heter **Nexus Hub App** och kan finnas bredvid den tidigare Nexus Hub-appen.
4. Ange en fine-grained GitHub-token vid första start. Välj `lobbamannen/Databas` och `lobbamannen/ChatGPT-Plugin`. Ge **Contents: Read and write** (appen skriver endast i Databas och använder plugin-repot för läsning).

Token kan senare bytas under **Inställningar & system → GitHub & lokal lagring**. Kandidaten kontrolleras innan en befintlig token ersätts. Token krypteras med AES/GCM och Android Keystore och ligger utanför synk, exporter och källkod. Vanliga APK-uppdateringar bevarar token. Utgången/återkallad token, avinstallation, rensad appdata eller byte av telefon kan kräva ny inmatning. Välj lämplig giltighetstid i GitHub.

## Beständig lokal kopia och automatisk uppdatering

Telefonen och GitHub behåller varsin lagring. **Hela Databas kopieras, inklusive Kunskap, bilder, dokument, register och planpaket.** ChatGPT-Plugin kopieras också. Ingen innehållsmapp undantas.

- Automatisk kontroll av GitHubs `main` sker var **15:e sekund medan appen är synlig**, vid återupptagning, återanslutning och efter egna sparningar. Under en längre första hämtning kontrolleras också om GitHub ändras, så att kopieringen kan börja om mot den nya inventeringen. Ingen bakgrundstjänst håller en stängd app aktiv.
- **Inställningar → GitHub & lokal lagring → Hämta allt nytt från GitHub** använder samma arbetare som automatiken. Ett extra knapptryck startar inte en konkurrerande synk. Det gamla gränssnittet med 20 filer per omgång är borttaget.
- Inventeringen jämför sökväg, Git-blob-SHA, befintlig spegelversion och lagringsnyckel. Den laddar inte in alla lokala filbytes bara för att kontrollera om de finns. Befintliga kopior från det äldre synkflödet återanvänds. Saknade bytes och nya filversioner hämtas; oförändrade filer hämtas inte igen.
- Register och text prioriteras, sedan mindre filer. Högst fyra filhämtningar pågår samtidigt för att hålla minnesanvändningen rimlig. Detta är samtidighet, inte ett tak på antal filer eller filstorlek. Varje hämtad fil kontrolleras mot storlek och GitHub-hash innan metadata skrivs. Metadata sparas i en beständig databastransaktion per grupp.
- Förloppet visar filer, MB, återstående antal och aktuell fil per repository. Första hämtningen av hundratals MB är inte omedelbar. **Pausa** slutför pågående filer och stoppar nästa grupp. **Fortsätt** återanvänder allt som redan sparats. Ett filfel hindrar inte övriga filer i samma inventering från att hämtas. Ingen fullständig kopia markeras förrän alla aktuella filer lyckats.
- Efter avbrott eller omstart jämförs de beständiga kopiorna igen. Äldre versioner och filer som försvunnit från GitHub behålls lokalt som historik. Det finns ingen automatisk gallring.
- Normal inventering kontrollerar att originalobjektet finns. **Fullständig integritetskontroll** läser och verifierar verkliga bytes separat och används för att hitta eller reparera skadade kopior.
- En lokal kopia är inte bevis på att en egen ändring sparats i GitHub. Spara/Ångra, utkast, uttryckliga återförsök och konfliktskydd gäller som tidigare. Automatisk hämtning spelar aldrig upp skrivkön och skriver inte över öppna utkast.

Inställningarna visar även krypterad tokenhantering, kontroll av GitHub-anslutningen, väntande sparningar, byteverifiering och avancerad versionshistorik. Äldre lokal administration ligger separat och dess metadataexport är inte en export av hela GitHub-kopian.

## Samma innehåll och arbetsflöden

- GitHub är gemensam beständig källa för Siten, appen och ChatGPT.
- Befintliga filer, registerformat och originalvägar används utan omstrukturering.
- Spara/Ångra, separata betygsskalor, favoriter, Sparad/Läst och verifierade säsonger behålls.
- Ingen Firebase, egen backend eller schemalagd bakgrundstjänst används.
- Beständig lokal kopia fylls automatiskt av hela Databas inklusive `Kunskap/`, samt plugin-repots innehåll. Även aldrig öppnade affischer, omslag, berättelser och övriga filer kopieras. GitHub är huvudkälla; en ofullständig lokal kopiering visas som pågående eller fel, aldrig som färdig.
- Lokal lagring består av SQLite/IndexedDB för metadata och cache samt IndexedDB för bild-/originalbytes och väntande sparningar.

En sparning säkras lokalt innan GitHub-anropet startar. En verifierad GitHub-kvittens krävs innan gränssnittet säger att den är sparad i GitHub. Vid nätverksfel behålls utkast och en beständig köpost. Tryck **Spara** igen för att försöka igen med samma väntande ändring, eller hantera den i **Android-app & GitHub**. Inga köade sparningar spelas upp automatiskt bakom en öppen redigering. Ångra eller bekräftad kassering av redigeringsutkast tar även bort motsvarande väntande redigeringsförsök.

SHA-konflikter stoppas och kräver omläsning/beslut. Appen byter aldrig ut en gammal versionsnyckel för att tvinga igenom en gammal ändring. Osäkra kvittenser kan kontrolleras mot aktuell GitHub-data innan nytt försök. En ändring i Siten eller ChatGPT hanteras som en samtidig extern ändring.

## Idéinkorg

Öppna **+ → Ny idé** och skriv direkt utan titel eller kategori. Ett eget kort på startsidan visar antalet nya idéer och leder till hela inkorgen; den finns även i menyn. Öppna samma idé för att fortsätta skriva senare. Statusarna är **Ny**, **Undersöks**, **Redo att implementeras**, **Genomförd** och **Avfärdad**; även genomförda och avfärdade idéer behålls.

- Utkast sparas beständigt på telefonen medan du skriver. Stäng behåller utkastet; Ångra utkast kastar det och dess väntande sparförsök, men raderar inte en befintlig GitHub-version.
- **Spara** skriver `Ideer/<UUID>.json` i Databas: schemaVersion, id, text, status, createdAt, updatedAt. ID och skapandetid behålls när idén utvecklas. Läs [lagringskontraktet](https://github.com/lobbamannen/Databas/blob/main/Ideer/README.md) före ändringar från ChatGPT.
- **Utkast lokalt**, **Väntar på synk till GitHub**, **Konflikt** och **Sparad i GitHub** skiljs åt. Ingen automatisk köuppspelning sker. Försök igen återanvänder samma avsikt och SHA. Fortsätt skriva avbryter det väntande försöket och behåller texten som utkast.
- En förlorad kvittens återläses innan nytt försök. Vid konflikt kan GitHub-versionen visas bredvid din lokala text; användaren väljer uttryckligen om den ska ersätta utkastet. Kopiera egen text före kassering om den ska kombineras med den andra versionen.
- ChatGPT kan läsa idéerna direkt från GitHub. Att spara en idé startar inte automatiskt forskning eller genomförande. Android-delning går via den separata NexusHub inkorg.

## Lösa en idékonflikt utan att förlora versioner

Öppna idén och välj **Lös konflikten – jämför versionerna**. Appen hämtar en aktuell, verifierad GitHub-version och visar den tillsammans med telefonens text.

- **Sammanför båda till ett utkast** behåller båda texterna, tydligt märkta. Läs/justera och tryck sedan Spara. Lokal status behålls.
- **Behåll min text som utkast** väljer telefonens text och status inför en ny uttrycklig sparning.
- **Använd GitHub-versionen** väljer den verifierade versionen på telefonen utan att skriva till GitHub.

Innan något av dessa val ersätter utkastet eller annullerar det gamla sparförsöket säkerhetskopieras båda kompletta versionerna beständigt under `ideas:conflicts:v1:<UUID>`. **Säkerhetskopior av versioner** i editorn visar dem och kan återställa endera som ett nytt utkast; också texten som ersätts vid återställning säkerhetskopieras först. Kopiorna ligger på denna telefon, överlever vanliga APK-uppdateringar och är inte en separat GitHub-databas. Avinstallation/rensad appdata tar bort dem.

Ett val tvingar aldrig en gammal ändring genom GitHub. Versionen läses igen före valet; om den ändrats sedan jämförelsen visas den nya texten och användaren behöver välja igen. Efter valet gäller senaste granskade SHA för Spara, och en ytterligare extern ändring ger ny konflikt. Sammanföring över 50 000 tecken stoppas utan trunkering. Vid nät-/lagringsfel behålls originalutkast och kvitterade säkerhetskopior. Appen försöker inte automatiskt lösa en konflikt.

## Idénummer, dagshistorik, bilagor och mottagning

- Idéer har fortsatt UUID som tekniskt ID och får dessutom ett permanent löpnummer. `Databas/Ideer/System/nummer.json` innehåller uppslag UUID ↔ nummer, nästa nummer och datum → antal. Nya idéer och nummerindex skrivs atomiskt via Git-träd/commit och fast-forward-skyddad main. Nummer återanvänds inte efter radering. Läs [idékontraktet](https://github.com/lobbamannen/Databas/blob/main/Ideer/README.md).
- Startsidan visar kompakta **Nytt idag**-kort för nya filmer, serier, berättelser och sparade idéer. Endast positiva antal visas; hela avsnittet döljs när inget nytt finns. Befintliga MaterialIcon och svarta ytor används. Film-/serieräknarna jämför unika registeridentiteter med GitHub-versionen före dagens början; ändrat betyg/status räknas inte som en ny titel. Berättelser jämförs som dokumentidentiteter utan dubblering av Markdown/Word. Detta är kvarvarande nytillskott sedan dygnets början, inte antal redigeringar; namnbyte av berättelsefil kan räknas som nytt dokument. Saknade/felaktiga underlag ger inget gissat antal. Senast hämtade uppgifter markeras vid nätfel. Ingen AI eller databasskrivning behövs. Dag räknas i **Europe/Stockholm** och räknaren följer dygnsskiftet. Lokala osparade utkast räknas inte som GitHub-sparade idéer. Dagshistoriken kan öppnas i Idéinkorgen.
- Sparade idéer har **Bilagor** i editorn. Bilder och dokument sparas först lokalt och skickas till `Ideer/Bilagor/<idé-UUID>/`. Bilder förhandsvisas med samma privata filtransport som övrigt innehåll. Välj Spara för att skicka valda bilagor och eventuella textändringar; en bilaga skriver inte över idétexten.
- **NexusHub inkorg** är en egen modul med en automatisk, verifierad GitHub-kopia i `NexusHub inkorg/<UUID>/`. Den är en tillfällig delningsyta för NexusHub och ChatGPT, separat från sorteringspluginets `00-Inkorg/`. Mobil layout ska tåla långa filnamn, rubriker och idétexter utan horisontell sidrullning: krympbara paneler/idéväljare, radbrytning och knappar med minst 44 px tryckyta. Androids Dela-meny kan lämna text, länkar, bilder, dokument och flera filer till NexusHub. Native-mottagningen kopierar strömmar till privat beständig lagring medan URI-behörigheten gäller. Inga breda lagringsbehörigheter behövs.
- Delning till NexusHub eller filval i NexusHub inkorg sparar först originalet beständigt lokalt, därefter laddas paketet upp automatiskt när appen är öppen och har anslutning. Äldre mottagningsposter utan idéutkast förs också över. Paketet består av `metadata.json`, originalfiler med stabila fil-ID:n och eventuell `delad-text.txt`. Väntande uppladdning och fel visas separat från verifierad GitHub-kopia.
- **Radera från telefon och GitHub** är tillgänglig även före vidareöverföring. Raderingsavsikten sparas före nätanrop och återupptas efter nätfel/appomstart. Alla kända filsökvägar och SHA:n i paketet måste matcha innan raderingen genomförs; avvikande innehåll raderas inte tyst. Lokala mottagningsoriginal rensas efter verifierad radering. Kopior i `00-Inkorg/` eller idéns bilagemapp lämnas kvar. Radering av ett helt mottagningspaket från en chatt återspeglas i appen; en gammal uppladdning får inte återskapa det. Git-historik och appens generella spegelhistorik omfattas inte av rensningen.
- En liten rosa lysande räknare på startsidans **Mottagning** visar antalet kvarvarande dokument: filer plus eventuell delad text, utan metadatafiler. Den döljs vid noll och uppdateras vid mottagning/synk/radering. Lokalt väntande filer ingår.
- Markera flera objekt och välj **Databas/00-Inkorg** och/eller **en vald idé** som destination. Sorteringspluginet hanterar kunskapsintegrationen från 00-Inkorg; appen tilldelar inte automatiskt ämne eller låtsas att en rapport är en färdig plan.
- Efter överföring visas **Överföringen lyckades!** först när alla valda destinationer för objektet är kvitterade. Varje destination visar idénummer/namn eller 00-Inkorg, antal bekräftade filer och **Visa i GitHub** per fil. Nya kvittenser lagrar commit när den finns så länken kan öppna den sparade filversionen även om ett sorteringsplugin sedan flyttar filen. Äldre kvittenser använder main. Delvis klar överföring får inte helgrön slutstatus.
- Varje fil och destination har egen beständig kvittens. Återförsök är create-only och jämför filhash; gamla filer skrivs inte över. Originalen får rensas först när alla valda destinationer är verifierade. Delvis överförda objekt ligger kvar och kan återförsökas.
- **Att göra** har en separat lokal draft och ett SHA-skyddat GitHub-register, `Att-gora/register.json`. Lägg till, redigera, klarmarkera och ta bort med gemensamma Spara/Ångra-knappar. GitHub-fel behåller utkastet; ingen automatisk uppspelning sker.

**Mobilfinlir:** Att göra visar hela uppgiftstexten i ett växande flerradigt fält och har 44 px tryckyta kring en 22 px kryssruta. Mottagning visar inte första filnamnet två gånger och valda idémål behåller numret. Innehållsytan fyller även korta sidor så sidglöden når bottennavigationen utan ett skarpt svart mellanrum.

Dessa tillägg återanvänder befintliga svarta modulpaneler, materialikoner och lila handlingsknappar. Se [mottagningskontraktet](https://github.com/lobbamannen/Databas/blob/main/System/NexusHub/mottagningsinkorg.md). Share-mottagning och privata original kräver APK; webbförhandsvisning använder filväljaren. Full lokal kopiering och GitHub som huvudkälla gäller fortsatt.

## Färdigutvecklade idéer och planpaket

**Idéinkorg → Färdiga planer** visar förberedda planpaket från `Databas/Fardiga-ideer/<UUID>/`. Flikvalet behålls när du öppnar ett underlag och går tillbaka.

- Originalet ligger kvar i `Ideer/<UUID>.json`; samma UUID kopplar ihop original och plan.
- Paketet innehåller `implementation-plan.md`, `research.md`, `metadata.json` samt valfria filer i `underlag/`. Läs [kontrakt och mall](https://github.com/lobbamannen/Databas/blob/main/Fardiga-ideer/README.md).
- Ny status `ready` betyder **Redo att implementeras**, medan `completed` fortfarande betyder **Genomförd**. Appens sparning av ready kräver att ett paket med matchande metadata och de två dokumenten finns. Statusen är ingen automatisk verifiering av innehållets kvalitet.
- Planvyn visar plan, tillhörande filer och originalidéns aktuella status. Ofullständiga paket ger tydlig varning och döljer inte andra giltiga planer.
- Planpaket förbereds/uppdateras i ChatGPT och GitHub och läses i appens befintliga dokumentläsare. Spara plan innebär inte att forskning eller implementation startar automatiskt. Implementation görs först på Robins uttryckliga uppdrag.
- Paketen ingår i full lokal kopiering; planlistan har samma beständiga läscache som andra moduler. Originalidéer, deras väntande sparningar och befintliga Spara/Ångra-flöden behålls.

## Ekonomi: kvitton, kategorier och produktkunskap

Ekonomi är en egen sida med tre undervyer: **Register** (budgetar och gemensamma köp), **Analys** (kategorisummor per verklig utbetalningsperiod) och **Kategorier & produkter** (redigerbar gemensam katalog). Samtliga är byggda på det befintliga svarta materialtemat med grön ikon och diskret grön bottenfade.

| Databasfil | Funktion |
|---|---|
| `Ekonomi/Gemensamt/<år>/<utbetalningsdatum>.json` | **Enda originalet** för gemensamma köp, artiklar, priser, rabatter och pant i en utbetalningsperiod. |
| `Ekonomi/Katalog/kategorier.json` | Huvudkategorier, produktgrupper, alias för generella kvittonamn och mappningar av äldre artikelkategorier. |
| `Ekonomi/Katalog/produkter.json` | Endast säkert identifierade produkter och alternativa kvittonamn, med eventuell verifierad förpackningsstorlek. **Inga kopior av kvitton eller priser.** |
| `Ekonomi/Robin/budget.json`, `Ekonomi/Rebecca/budget.json` | Budgeterade inkomster och fasta utgifter, inte ytterligare kvittoköp. |

### Ett kvitto, en skrivning

1. **Ansvarsfördelning:** ChatGPT tolkar och verifierar kvittot; NexusHub sköter kategorisering och analys. Chatten behöver inte fylla i artikelkategorier eller redigera katalogen vid varje köp.

   Robin skickar bild/PDF på kvitto till sin befintliga ChatGPT-chatt. **OCR och AI-förståelse sker där, inte i NexusHub-appen.**
2. Chatten verifierar butik, köpdatum, totalsumma, radbelopp, rabatter och pant och kontrollerar befintlig period mot dubbletter. Samma kvitto får inte ett nytt köp-ID vid omsändning. Särskilt säker kvittoreferens eller jämförelse av datum/butik/belopp/artiklar behövs för att upptäcka dubbletter med nya ID:n; GitHub hindrar automatiskt endast identiska post-ID:n vid appens egen sparning.
3. Chatten skriver **en** ändring i lämplig periodfil efter kontroll av GitHub SHA. Den ska inte också skriva separata kopior av köpet i produkt- eller kategorikatalogen.
4. NexusHub läser periodfiler + katalog och kategoriserar deterministiskt utan nätbaserad AI för varje visning. Kända exakta produkter matchas till produkt-ID, generella varunamn till produktgrupp; äldre etiketter används som reserv. Nya/oklara namn markeras för granskning.
5. Robin kan ändra kategori, produktgrupp, säkra alias eller förpackning i katalogundervyn. Katalogändringen SHA-sparas separat och räknar om historiska analyser **utan att skriva om gamla kvitton**. Framtida kvittoimport behöver inte redigera katalogen vid varje köp.

En bred kvittotext som `VÅTSERVETTER` ger gruppen **Våtservetter** men inte ett påhittat varumärke eller 72-pack. En säker fullständig variant kan få eget produkt-ID och användas för prisjämförelser, men bara när köp av samma produkt och jämförbar mängd finns. Det finns ingen automatisk produktinlärning som skriver till GitHub i bakgrunden.

### Ekonomiperiod och sanningsenlig statistik

- En månad är **från faktisk utbetalning till nästa utbetalning**. Periodfilens `start_date` är auktoritativt; om `end_date` saknas kan appen härleda sista dagen enbart när nästa verkliga periodstart finns. Appen gissar inte att det alltid är den 19:e.
- Analys summerar artikelrader i heltalsöre och stämmer av dem mot köpens registrerade total. Rabatt som entydigt kopplas till en vara minskar den kategorin; otydliga bonusar och pant särredovisas. Ingen artikel läggs ovanpå köptotalen som en ny kostnad.
- Köp utan artikelrader och beloppsavvikelser visas som **ospecificerat**, inte som säker mat-, godis- eller babykonsumtion. Budgetposter och interna kontoöverföringar räknas inte som extra gemensamma köp.
- Historisk import (`Ekonomi/Import/`) behålls oförändrad som källa. Kategorikatalogen täcker 47 historiska artikelbeteckningar; den innehåller från början endast några få säkert identifierade exakta produkter. Katalogen kan utvecklas efterhand.
- Prisjämförelser använder radbelopp efter säkert kopplad varurabatt, delat med angiven kvittomängd. Generella bonusar fördelas inte på påhittade produkter.
- Avbryt i ekonomins editor annullerar motsvarande väntande sparförsök. När ett sparförsök gjorts låses målregister/grupp tills det avslutas eller avbryts. Orelaterade film-/berättelseutkast får inte radera ekonomins köposter.
- Appens katalogredigering använder samma verifierade SHA och beständiga väntande sparningar som övriga ekonomiregister. Vid konflikt behövs omläsning; gammal data skrivs inte över automatiskt.

## Designregler – gäller all utveckling

**NexusHubs befintliga design är ett produktkrav. Nya funktioner ska kännas som samma app. En fungerande funktion är inte färdig om den bryter mot temat. Ändra inte designidentiteten utan Robins uttryckliga önskemål.**

- **Återanvänd verkliga komponenter och stilar.** Utgå från appens befintliga React-kod, CSS, MaterialIcon, typsnitt, SVG, animationer och etablerade vyer. Skapa inte en ungefärlig kopia eller ett separat tema för en ny modul. Kunskapsbankens översikt är referens för motsvarande modulrubriker, kort och verktygsfält; jämför likvärdiga komponenter.
- **Samma material överallt.** Behåll nästan svarta ytor, diskreta kanter, befintligt djup, skuggor och glöd. En modulfärg får inte färga om hela paneler, formulär eller knappar till en egen design. Bakgrundens färgade glöd ska tona mjukt enligt appens gemensamma tema.
- **Modulfärgen ska följa modulen.** Huvudikon och sidglöd ska matcha startsidans ikon. Menyikonen ska ha samma färgidentitet. Film är rubinröd, berättelser/serier/kunskapsbanken blå, plugins rosa, ekonomi/utforska filer gröna och träning/idéinkorg orange. Gemensamma kontroller och sekundära statistikikoner får behålla appens etablerade lila accent.
- **Samma proportioner och typografi.** Återanvänd storlekar för rubriker, materialikoner, kort, marginaler, mellanrum, hörnradier och textnivåer från motsvarande befintliga vy. En ny modul ska inte få större huvudikon, annan rubrikskala eller tätare layout av bekvämlighet.
- **Samma knappar och formulär.** Använd etablerad lila huvudåtgärd, gemensamma sekundärknappar, flikar, sökfält och redigeringsdialoger. Modulens accentfärg är inte skäl att uppfinna ett nytt knappsystem. Bevara tydliga fokus-, valt-, laddnings- och inaktiva tillstånd. Semantiska färger för fel, varning och bekräftad sparning behåller sin betydelse.
- **Samma funktion ska uppföra sig konsekvent.** Spara, Ångra/Avbryt, stängning, Android Tillbaka och uppdatering ska följa appens etablerade flöden. Visa skillnaden mellan lokalt utkast, väntande synk, konflikt och verifierad GitHub-sparning. Styling får inte dölja fel, sparstatus eller viktiga knappar.
- **Granska hela den berörda funktionen.** Kontrollera startsideskort, meny, översikt, listor, analys, filter, editor, inställningar samt tomma vyer, laddning och fel. Ekonomi och Idéinkorg omfattas av samma regler som äldre moduler. Träningssidan är avsiktligt minimal och ska inte fyllas ut eller märkas om utan uppdrag.
- **Idéeditorns åtgärder ska alltid gå att nå.** Textfältet har begränsad höjd och egen rullning. Bilageknappen och Spara/Ångra ligger fast utanför den rullande formulärdelen. Långa texter, bilagelistor och felmeddelanden får inte trycka ihop eller dölja kontrollerna.
- **Kompakt startsida (idé 19–21).** Behåll två kolumner och stabil ordning. Att göra och Idéinkorg har kompakta kort överst. Film & serier och Kunskapsbanken är breda gruppkort: Vill se/Seriebevakning respektive Utforska filer/NexusHub inkorg ligger som mindre genvägar inuti. Huvudytan och genvägarna är separata knappar; inga nästlade knappar. Ordningen är Att göra/Idéinkorg → Kalender → Film & serier → Berättelser/Plugins → Ekonomi/Träning → Kunskapsbanken. Kalender är ett kompakt kort över hela bredden direkt under Att göra/Idéinkorg. De små genvägarna heter Bevakning och NexusHub inkorg för att undvika brutna sammansatta ord. Hälsning och händelsemeddelanden har kompakta mellanrum med bibehållna tryckytor. Övriga kort har gemensamma proportioner och visar ikon, namn och relevant antal/status. Självklara beskrivningar tas bort. Minska främst tomrum; klipp aldrig långa rubriker eller förminska tryckytor. Samma material, glöd och ikonoriginal gäller båda kortstorlekarna. Layoutadaptrarna finns i `components/home/compact-home.css` och `components/home/grouped-home.css`; ändra inte låsta materialfiler för att justera avstånd.
- **En meny och enkel fångst (idé 17,18,22).** Meny finns i bottennavigationen; toppen behåller sök och GitHub-uppdatering. Plus öppnar Ny idé/Ny uppgift. Uppgiften kräver bara text, kan kopplas till idé och använder befintliga `Att-gora/register.json` med SHA-skydd och beständigt lokalt utkast. Dokumentuppladdning finns kvar i Meny. Idéinkorgens huvudvyer är Idéinkorg och Färdiga planer; Arkiv visar genomförda/avfärdade utan extra statusfilter. Arkiverade original är läsbara och får inte återpubliceras som aktiva av arkivvyn.
- **Samsung och mobil först.** Behåll läsbarhet, tryckytor och befintlig bottennavigation. Text, tangentbord och dialoger ska få plats utan oavsiktlig horisontell rullning eller dolda åtgärder.
- **Kontrollera CSS-kaskaden.** Återanvänd gemensamma klasser innan nya specialregler läggs till. Undvik konkurrerande modulvarianter och staplade överstyrningar. Ändringar i gemensamma stilar måste bedömas mot andra vyer.
- **Var ärlig om visuell verifiering.** Kodläsning, typkontroll och designhashar bevisar inte att en vy ser rätt ut. När visuell kontroll ingår: jämför renderade vyer i mobilstorlek med den befintliga designen, inklusive editor och tillstånd. Om bara koden har granskats ska det uttryckligen framgå. Följ Robins önskade omfattning; starta inte omfattande testsviter för en dokumentationsändring.

Designkällor: `components/MaterialIcon.tsx`, `components/home/MaterialDefinitions.tsx`, `app/chroma-materials.css`, `app/chroma-theme.css`, `app/module-dashboards.css` och befintliga komponenter i `components/dashboard/`. Proveniensfilen beskriver originalet; den är inte ett bevis på att nya moduler visuellt överensstämmer.

## Originaldesign

Gränssnittet hämtades från `lobbamannen/NexusHub`, källträd `8b550f150035d8214b1c648ff2ff7f1e79f3249d`. `docs/source-provenance.json` innehåller SHA-256 för originalets designfiler. Originalets designresurser återanvänds. Android-anpassningar och senare tillägg som Ekonomi och Idéinkorg har utvecklats vidare; proveniensfilen beskriver ursprunget och innebär inte att all aktuell CSS är oförändrad.

Exempel på Android-anpassningar:

- Affischer och originalbilder hämtas genom det lokala API:t och får blob-URL:er. Lazy loading behålls.
- Spar-/ångraflödena avbryter motsvarande väntande GitHub-försök.
- Androids anslutningsinställningar är ett tillägg på inställningssidan.
- Sites-/R2-formuleringar om lokal lagring har anpassats till telefonen.

## APK-identitet och signering

- Paketnamn: **`se.lobbamannen.nexushub.app`**.
- WebView-origin: **`https://appassets.androidplatform.net`**.
- Lokal lagringsidentitet: **`nexus_hub_android_v1`**.
- Versionskod hämtas från GitHub Actions körningsnummer.

Första Actions-bygget skapar en beständig signeringsnyckel och sparar den som en tillgång i en **opublicerad draft release** med namnet **PRIVATE ANDROID SIGNING VAULT — NEVER PUBLISH OR DELETE**. GitHubs åtkomst till draft-releaser kräver skrivrättighet till repot. Ingen privat nyckel ligger i källkoden eller APK-artefakten.

**Publicera, radera eller byt aldrig namn på denna signing-vault.** Den används av alla framtida APK-byggen. En separat markör gör att bygget avbryts om nyckeln saknas i stället för att skapa en inkompatibel ersättare. Behåll gärna en privat säkerhetskopia av vaultens tillgång. Vid avbruten allra första etablering kan originalvalvet behöva återställas innan ett nytt bygge.

Installera senare APK:er ovanpå appen. Avinstallera inte och rensa inte appdata för att uppdatera. Lokala debug-byggen har en annan signeringsidentitet; använd det signerade Actions-bygget för normal användning.

## Utveckling

Node 22+, Java 17, Android SDK 35 och Gradle 8.11.1.

```sh
npm ci
npm run dev
npm run check
npm run check:design
npm run build
node --test tests/economy-*.test.mjs
gradle :app:assembleDebug
```

Webbförhandsvisning använder token endast i minnet under sessionen. Android-funktioner kräver APK:n. GitHub Actions bygger och signerar utan att en privat nyckel behöver läggas in manuellt.

Viktiga filer:

| Plats | Ansvar |
|---|---|
| `app/`, `components/`, originalets CSS | NexusHubs gränssnitt och återanvända route-handlers |
| `lib/` | Originalets domänregler, GitHub-klient och dokument-/bildlogik |
| `platform/api.ts` | Lokal dispatch av de ursprungliga API-kontrakten |
| `platform/local-store.ts`, `storage-schema.ts` | Beständig D1-/R2-kompatibel lokal lagring |
| `platform/outbox.ts` | Beständiga sparförsök, kvittenser och konflikter |
| `platform/resources.tsx` | Bildtransport och filöverföring till Android |
| `src/AndroidSettings.tsx` | Token och hantering av väntande sparningar |
| `app/src/main/java/` | Android-skal, Keystore och filhantering |
| `.github/workflows/android-apk.yml` | APK-bygge och publicerad installationsfil |

Äldre Site-poster som enbart finns i Sites D1/R2 kopieras inte automatiskt till den här appen. GitHub-innehållet är gemensamt. Befintliga Site-data lämnas orörda. Gamla `copy:`-bokmärken kan därför sakna en lokal originalkopia i Android; appen ska inte låtsas att dessa bytes finns.

## Verifiering

Se `docs/verification.md` för utförda kontroller och gränsen mellan lokal granskning, APK-bygge och faktisk användning på telefon.

### Spara idébilagor utan textändring

I en befintlig idé sparar filvalet originalen och idékopplingen beständigt på telefonen. Det skickar ingenting till GitHub förrän användaren trycker **Spara**. Knappen aktiveras av väntande bilagor även när idétext och status är oförändrade. Filnamn och lokal väntestatus visas. Stängning eller appomstart behåller bilagorna, som också kan hittas i NexusHub inkorg. Dessa idéutkast undantas från automatisk mottagningsuppladdning tills användaren valt Spara; automatiken får inte kringgå idéeditorns Spara-flöde.

Spara skickar väntande bilagor och visar bekräftelse först efter GitHub-verifiering. Bilagor kräver ingen omskrivning av idé-JSON eller ändring av dess datum. Om text också ändrats sparas den först med befintligt SHA-skydd; ett misslyckande eller en konflikt stoppar den kombinerade sparningen. Vid delvis misslyckad bilageöverföring behålls originalen och kvittenserna, så nästa Spara hoppar över redan bekräftade filer.

## Kalender och seriebevakning (idé 12 och 8)

Kalender och Seriebevakning nås från startsidan, menyn och inställningarna. En serie har separat bevakningsval i sin detaljvy. Kalendern läser telefonens bokningar lokalt efter ditt tillstånd; egna NexusHub-händelser sparas med Spara/Ångra och versionsskydd till GitHub. Telefonbokningar skickas aldrig dit.

Seriebevakning använder din egen **Streaming Availability API-nyckel** i ett krypterat Android-fönster under Seriebevakning → Inställningar. Detta är en separat nyckel från GitHub-token; appen aktiverar ingen betaltjänst. Lokalt tak är 900 API-anrop per månad. Täckning och API-kvot visas i appen. Exakta svenska premieredatum visas bara när datakällan faktiskt bekräftar dem.

Se [funktion, lagring, begränsningar och designregler](docs/calendar-release/implementation.md) och [utförda kontroller](docs/calendar-release/verification.md). Kalenderns guld och bevakningens blå modulaccent använder **samma låsta NexusHub-designsystem**: svarta paneler, gemensamma materialikoner, lila handlingar, diskret glöd bakom innehållet och en alltid synlig Spara/Ångra-fot i rullbara dialoger.

## Lokal visning direkt, första tilläggsdatum och registerbevakning

Läsbara sparade API-modeller visas direkt från beständig telefonlagring. Saknas en färdig modell kan film-/serie-/berättelseregister och grundkatalog hämtas från den redan verifierade filspegeln. GitHub kontrolleras i bakgrunden; en fungerande vy ersätts först av ett giltigt nytt svar. Nätfel behåller gamla data och visas genom befintlig synkstatus. Samtidiga läsningar återanvänder kontrollen. Transporttidsstämplar utlöser ingen uppdateringsloop. Skrivningar och uttrycklig omläsning använder färsk GitHub-data; gamla bakgrundssvar får inte ersätta cache efter en sparning. Utkast och skrivkö återspelas inte automatiskt. Register som redigeras byts inte i bakgrunden.

”Senaste” sorteras efter `Databas/System/NexusHub/tillaggsdatum.json`, som ett GitHub Actions-jobb bygger ur varje posts första registrering i Git-historiken. Betygsändringar, registersortering och hämtningstid gör inte en gammal titel ny. Detta är första registrering i GitHub, inte när filmen sågs eller när ett äldre externt original skapades. Datum som saknar belägg fabriceras inte. Den gemensamma RecentActivity-komponenten har en dokumenterad funktionell adapter för sortering/text; dess layout och stil behålls.

Serieregistrets ringklocka växlar `releaseWatch.enabled`. Den visar valt läge direkt, bevarar individuella tjänster och avsnitts-/säsongsval och använder samma **Spara/Ångra**, versionsskydd och konfliktflöde som övriga registerfält. Klockan är lila när bevakning är vald och dämpad när den är av. En extra avgränsad CSS-fil används så originalets registerstil förblir byteidentisk. Inga API-anrop eller notiser startas av ett osparat klick.

## Diagnostik (idé 15)

Inställningar → GitHub & lokal lagring → **Diagnostik och användningsstatistik**. Av från början; aktiveras uttryckligen på telefonen och valet överlever vanliga APK-uppdateringar. En native PostHog-klient skickar enbart godkända tekniska kategorier: modulbyten, verkliga synkkörningar, verifierade sparningar, kö/konflikter, bildtransport och bevakningsresultat. Inga privata texter, titlar, sökningar, filvägar, belopp, kalenderuppgifter eller nycklar. Ingen replay eller automatisk felinsamling. Diagnostiken får inte ändra appens design, navigation eller sparningar.

Robin valde samma gratis PostHog EU-projekt som Cortex, med separata rapportsidor. [NexusHub](https://eu.posthog.com/project/280222/dashboard/1058562) filtrerar alltid `app=nexushub_android`; [Cortex](https://eu.posthog.com/project/280222/dashboard/1058570) använder sitt befintliga Android-paket. Inga Cortex-inställningar ändras. Offentlig ingestion-konfiguration läses av Actions från `.github/posthog.env` och blir Android BuildConfig; inga personliga API-nycklar finns i appkoden.

Kontrollhistoriken för serier visar nu även antal källändringar, bevakade träffar, avvisade belägg, nya fynd, baslinje och notisförsök. En genomförd API-kontroll betyder inte att källan har rapporterat ett nytt HBO-avsnitt. Notisförsök betyder inte verifierad synlig leverans. Manuella kontroller synkar aktuella bevakningsval först. Första intervallet omfattar aktiveringen; följande har 24 timmars överlapp för sent indexerade ändringar, med befintlig dubblettkontroll och kvotgräns.

Se [implementation och verifiering](docs/telemetry/implementation.md). Fysisk telefonverifiering efter aktivering återstår tills verkliga Android-händelser har återlästs i rätt rapport. Idé 15 arkiveras först efter det; utvecklingsmiljö eller servergenererade testevent räknas inte som Samsung-test.

### Daglig seriebevakning

Automatisk kontroll körs en gång per svensk kalenderdag omkring **15.00 Europe/Stockholm**. Datumstyrd WorkManager-planering räknas om efter körning och följer sommar/vintertid; Android kan försena körning vid nät-/batteribegränsning. Uppdateringen tar bort äldre sex-timmarsjobb. Appstart, konfigurationssynk och API-nyckeländring schemalägger nästa dagliga kontroll utan extra omedelbart API-anrop. **Kontrollera nu** är ett uttryckligt manuellt undantag med samma månadsbudget och spärrtid. Befintliga händelser, baslinjer, sidmarkörer och nycklar bevaras. Äldre inställningsfiler med `checkIntervalHours:6` normaliseras till `24` och `dailyCheckTime:"15:00"` i nya appen.

Det tidigare stora databas-/filantalskortet är borttaget från startsidan. En tryckbar **Hämtad/Hämtar…/Pausad/Synkfel/Ej verifierad**-indikator ligger uppe till höger vid hälsningen och öppnar Inställningar & system. Den använder den faktiska spegelsynkens status; en gammal katalog i cache räcker inte för grönt. Hälsningen förblir centrerad.

Bevakningsindikatorn på startsidans Seriebevakning-genväg och det befintliga hemmeddelandet använder samma native-state. Bara olästa, bekräftat tillgängliga svenska fynd räknas; markering som läst tar bort indikatorn. Idéantal skiljer på verifierat noll, okänt antal och lokal vy.

## Flerval, dubbletter och återförsök
Androids filväljare hanterar både clipData (flerval) och data (enstaka fil), med oförändrade URI-behörigheter. Valda dokument läses till beständiga Blob-original och sparas en post per fil. Alla val redovisas som sparade, identiska/hoppade över eller fel; ett filfel stoppar inte övriga val. Identiskt innehåll kontrolleras med Git-blob-SHA mot lokal inkorg, GitHub-metadata och samma urval, även om filnamnen skiljer sig. Samma namn med olika innehåll tillåts. Befintliga dubbletter raderas inte automatiskt.

Försök igen finns globalt och på poster med synkfel. Pågående försök visar status och filnummer. Automatiken återförsöker ungefär varje minut medan appen är synlig; den lovar ingen bakgrundssynk i en stängd app. Äldre `Mottagningsinkorg/` stöds för läsning och säkra återförsök. Befintliga kvittenser kan flyttas till nya sökvägen endast om metadata och samtliga filhashar motsvarar exakt samma tidigare paket.

## Idéplanering och dokumentationskällor

Idea · Investigate · Develop är ett separat ChatGPT-plugin som läser en befintlig idé, aktuell kod och bilagor, förbereder research/implementationsplan/metadata i Databas/Fardiga-ideer/<samma UUID>/ och markerar originalet ready först efter verifiering. Det implementerar inte funktionen. Vid byggstart behöver aktuell kod och beroenden kontrolleras igen. Kritiska underlag får inte bara finnas som tillfälliga inkorgslänkar.

Denna README beskriver aktuell användning. [Gemensam inkorg](docs/shared-incoming.md), [kalender/bevakning](docs/calendar-release/implementation.md), [telemetri](docs/telemetry/implementation.md) och [verifiering](docs/verification.md) beskriver respektive område. Ursprungliga implementationplaner och daterade verifieringar är historiska underlag; de ska inte användas som aktuella begränsningar för senare funktioner. Databasens aktuella områdeskontrakt styr innehållsformaten. [Github-Databas](https://github.com/lobbamannen/ChatGPT-Plugin/tree/main/github-databas) är en vägvisare, inte automatisk publicering eller ett separat innehållsregister.

## Two Thumbs Incorporated™ – studiosignatur
Startsidan avslutas efter Senaste med den av Robin levererade originalbilden i `public/two-thumbs-incorporated.jpg`. Den uppladdade filen hade PNG-namn men innehåller JPEG; den kopieras byteidentiskt utan omkodning, beskärning, filter eller ny grafik. Bilden följer kortens sidmarginaler, behåller 1536×560-proportionerna och har ingen extra kortyta/ram. Tryck öppnar en större dialog med förstoring, scroll och stängning via knapp, Escape eller Android Tillbaka. Hälsningens befintliga textsignatur finns kvar.

## Two Thumbs Battery – telefon och Wear OS

NexusHub har en native två­radswidget för telefonens och vald Wear OS-klockas batteri. Öppna Inställningar & system → GitHub & lokal lagring → Two Thumbs Battery. Samma widget kan läggas till via hemskärmen och Good Lock/LockStar; LockStar/AOD och faktisk bakgrundsleverans kräver test på enheterna. Svart, mörk genomskinlig och transparent bakgrund stöds. Klockraden visar verklig mättid och behålls även utan data.

Modulen `:wear` bygger en minimal följeapp med samma installerade paketnamn och releasecertifikat som `:app`. Installera **nexus-hub-watch.apk på klockan**, öppna den och begär uppdatering från telefonen. Ingen Play Store-publicering eller automatisk klockinstallation ingår. Se [installationsguiden](docs/battery-widget-install.md). Actions bygger, testar och signerar båda APK:erna; release publiceras endast från main.

Klockan läser var cirka 15/30/60 minuter (30 standard), telefonen uppdaterar cirka var 15:e minut; WorkManager och Data Layer kan fördröja arbetet. Manuella förfrågningar har eget request-ID och en timeout som inte kan nollställa en senare förfrågan. Native lagring bevarar senaste mätning över processdöd. DataClient transporterar senaste tillstånd; egen synk till Databas används inte. Vid flera klockor krävs uttryckligt val. Högst tio minuters framtida klockskillnad tolereras; större avvikelser avvisas.

PostHog använder befintligt diagnostikval och EU-projekt 280222, `app=nexushub_android`, event `battery_flow`. Godkända fält: steg, utfall, slumpmässigt snapshot-ID, exakta procent, laddningsflagga och mättid. Nod-ID/namn/Bluetooth-adress stannar lokalt. Wear har ingen egen PostHog-SDK; begränsad lokal diagnostik vidarebefordras av telefonen inom aktuellt aktiveringsintervall och med beständig dubblettkontroll. Av/på-byte får inte återaktivera äldre journalposter. React-bryggan får inte skicka `battery_flow`.

[Batteriflöde i PostHog](https://eu.posthog.com/project/280222/insights/yKz1xQtu) finns på NexusHubs befintliga dashboard. Vyn väntar på riktiga händelser efter installation; inga testhändelser har injicerats i produktionsdata. `widget_updated` bekräftar att Android accepterat RemoteViews, inte faktisk LockStar-visning.

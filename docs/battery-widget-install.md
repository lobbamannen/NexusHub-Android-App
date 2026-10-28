# NexusHub Two Thumbs Battery – installation

## Telefon
Installera **nexus-hub-app.apk** ovanpå befintliga Nexus Hub App. Avinstallera inte appen: normal signerad uppdatering bevarar token och lokala uppgifter.

## Galaxy Watch8 Classic
**nexus-hub-watch.apk ska installeras på klockan, inte telefonen.** För privat installation används Wear OS trådlösa felsökning. Ingen Play Store-publicering görs av detta projekt.

### Direkt från telefonen – ingen dator behövs
1. Ladda ner **båda APK-filerna från samma release**. Installera telefon-APK:n ovanpå befintlig NexusHub.
2. Använd **GeminiMan WearOS Manager**, som Robin redan har installerat klockappen med. Aktivera tillfälligt ADB och trådlös felsökning på klockan och anslut via samma Wi-Fi. Om parkoppling behövs används klockans kod och parkopplingsport; anslutningsporten kan vara en annan.
3. Välj den nya **nexus-hub-watch.apk** i GeminiMan och installera den på klockan ovanpå befintlig app. Avinstallera inte och radera inte appdata.
4. Öppna NexusHub Battery på klockan. Öppna sedan Batteriwidget i telefonens NexusHub. Kontrollera att **Klockans inställningar: bekräftade** visas.
5. Koppla från GeminiMan och stäng av ADB/trådlös felsökning igen. Om du aktiverat ”Stäng av automatiskt Wi-Fi”, återställ det valet. Vanlig synkning behöver inte felsökningsläge.

### Med dator (alternativ)
Med Android Platform Tools: `adb pair KLOCKANS_IP:PARKOPPLINGSPORT`, sedan `adb connect KLOCKANS_IP:FELSÖKNINGSPORT` och `adb -s KLOCKANS_SERIENUMMER install -r nexus-hub-watch.apk`.

En telefonbaserad ADB-klient kan också användas om den stöder trådlös parkoppling och APK-installation. Båda APK:erna i samma release har samma paketnamn och releasecertifikat; blanda inte debug- och releaseversioner. Radera inte appdata vid en signaturkonflikt.

## Anslut och lägg till widget
1. NexusHub på telefonen → Inställningar & system → GitHub & lokal lagring → **Two Thumbs Battery** → Öppna batteriwidget.
2. Öppna batteriinställningarna för att ansluta och skicka konfigurationen. Tryck vid behov Uppdatera batterier utanför nattpausen. En ensam nåbar NexusHub-klockapp väljs automatiskt; välj annars klocka uttryckligen.
3. Good Lock → LockStar → lägg till widget → **NexusHub · Two Thumbs Battery**. Anpassa storleken där och spara. Samma widget finns i hemskärmens widgetväljare.
4. Telefonraden öppnar inställningar. Klockraden begär uppdatering. Låsskärmen kan kräva upplåsning för en åtgärd.
5. Välj mörk genomskinlig, svart eller transparent bakgrund. Klockans kontrollintervall kan vara cirka 15/30/60 minuter (30 standard). Telefonens periodiska uppdatering körs cirka var 15:e minut. Android kan fördröja båda.

Mättiden är klockans verkliga avläsningstid. Gamla mätningar presenteras inte som nya vid återanslutning. Klockraden finns kvar med streck om ingen giltig mätning kommit. Tvångsstopp kan stoppa bakgrundsarbete tills appen öppnas igen.

## Nattpaus (nytt)
Pausen är **aktiverad 20:00–06:00 som standard**, även vid uppgradering. Under **Nattpaus** ändrar du start/slut eller stänger av funktionen. Tiderna följer den lokala klockan på respektive enhet; klockslag för start och slut måste skilja sig. Inställningar skickas från telefonen och visas som bekräftade först när den valda uppdaterade klockappen kvitterat samma konfiguration. Utan bekräftelse kan en äldre/frånkopplad klocka fortfarande använda tidigare schema.

Under pausen görs inga nya batterimätningar på klockan, inga automatiska eller manuella mätförfrågningar och inga nya batteridiagnostikhändelser skickas till PostHog. Även mätknappar, appöppning, widgetvärdens uppdateringar, omstart och tidigare köade mätjobb följer pausen. Periodiska batterijobb avregistreras och nästa tidsgräns schemaläggs. Widgeten visar **nattpaus** och senaste mättid; telefonens eget batterivärde får fortfarande uppdateras.

Inställningar och kvittens får överföras vid en uttrycklig konfigurationsåtgärd även under pausen. Plattformen kan leverera redan köade Data Layer-paket och tidigare köad PostHog-data; sådana paket kan inte återkallas. Pausen gäller denna batterifunktion, inte telefonens övriga NexusHub-telemetri. Efter 06:00 återupptas arbetet när Android tillåter; ingen exakt väckarklocka används. Tvångsstopp kan kräva att appen öppnas igen.

**Båda apparna måste uppdateras den här gången.** Därefter ändras tider och intervall i NexusHub utan ny klockinstallation. Detta är ett sätt att testa om synkningen bidrar till nattens batteriförbrukning, inte ett bevis på att batteriproblemet är löst.

## PostHog och diagnostik
Aktivera **Diagnostik och användningsstatistik** i NexusHub om insamling önskas. Befintligt val bevaras. Telefonen skickar godkända batterihändelser till befintligt PostHog EU-projekt 280222 med `app=nexushub_android`. Klockan har ingen egen PostHog-klient. Exakta procent, laddningsstatus, mättid och slumpmässigt mät-ID kan skickas; inga enhetsnamn, nod-ID:n, Bluetooth-adresser eller NexusHub-innehåll. Köad telemetri är inte bevis på mottagning i PostHog. Tidigare klockjournal återspelas inte som telemetri om den skapades före aktuellt aktiveringsval.

Widgetuppdaterad betyder att Android accepterade RemoteViews. Det bevisar inte faktisk visning i LockStar. AOD, widgetskalning, fysisk synk, nattläge/Doze och extra batteriförbrukning måste testas på telefon och klocka. Installation via GeminiMan, manuell telefon–klocksynkning och två rader i LockStar är bekräftade av Robins skärmbilder från föregående version. Nattpausen och dess effekt på batteritiden måste fortfarande verifieras på de fysiska enheterna; CI kan inte mäta den.

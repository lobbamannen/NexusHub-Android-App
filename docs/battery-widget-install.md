# NexusHub Two Thumbs Battery – installation

## Telefon
Installera **nexus-hub-app.apk** ovanpå befintliga Nexus Hub App. Avinstallera inte appen: normal signerad uppdatering bevarar token och lokala uppgifter.

## Galaxy Watch8 Classic
**nexus-hub-watch.apk ska installeras på klockan, inte telefonen.** För privat installation används Wear OS trådlösa felsökning. Ingen Play Store-publicering görs av detta projekt.

1. Klockan: Inställningar → Om klockan → Programvaruinformation → tryck upprepade gånger på programvaruversion tills utvecklaralternativ aktiveras.
2. Aktivera ADB/trådlös felsökning i utvecklaralternativen. Telefon/dator och klocka behöver vara på ett nät som tillåter anslutningen.
3. Med aktuella Android Platform Tools på en dator: välj parkoppling med kod på klockan, kör `adb pair KLOCKANS_IP:PARKOPPLINGSPORT`, ange koden. Kör sedan `adb connect KLOCKANS_IP:FELSÖKNINGSPORT`. Portarna kan skilja sig; använd de som klockan visar.
4. `adb devices -l` visar enheterna. Kör `adb -s KLOCKANS_SERIENUMMER install -r nexus-hub-watch.apk`.
5. Öppna **NexusHub Battery** en gång på klockan. Stäng av trådlös felsökning efteråt så att felsökningen inte påverkar batteritiden.

En telefonbaserad ADB-klient kan också användas om den stöder trådlös parkoppling och APK-installation. Båda APK:erna i samma release har samma paketnamn och releasecertifikat; blanda inte debug- och releaseversioner. Radera inte appdata vid en signaturkonflikt.

## Anslut och lägg till widget
1. NexusHub på telefonen → Inställningar & system → GitHub & lokal lagring → **Two Thumbs Battery** → Öppna batteriwidget.
2. Tryck Uppdatera batterier. En ensam nåbar NexusHub-klockapp väljs automatiskt; välj annars klocka uttryckligen.
3. Good Lock → LockStar → lägg till widget → **NexusHub · Two Thumbs Battery**. Anpassa storleken där och spara. Samma widget finns i hemskärmens widgetväljare.
4. Telefonraden öppnar inställningar. Klockraden begär uppdatering. Låsskärmen kan kräva upplåsning för en åtgärd.
5. Välj mörk genomskinlig, svart eller transparent bakgrund. Klockans kontrollintervall kan vara cirka 15/30/60 minuter (30 standard). Telefonens periodiska uppdatering körs cirka var 15:e minut. Android kan fördröja båda.

Mättiden är klockans verkliga avläsningstid. Gamla mätningar presenteras inte som nya vid återanslutning. Klockraden finns kvar med streck om ingen giltig mätning kommit. Tvångsstopp kan stoppa bakgrundsarbete tills appen öppnas igen.

## PostHog och diagnostik
Aktivera **Diagnostik och användningsstatistik** i NexusHub om insamling önskas. Befintligt val bevaras. Telefonen skickar godkända batterihändelser till befintligt PostHog EU-projekt 280222 med `app=nexushub_android`. Klockan har ingen egen PostHog-klient. Exakta procent, laddningsstatus, mättid och slumpmässigt mät-ID kan skickas; inga enhetsnamn, nod-ID:n, Bluetooth-adresser eller NexusHub-innehåll. Köad telemetri är inte bevis på mottagning i PostHog. Tidigare klockjournal återspelas inte som telemetri om den skapades före aktuellt aktiveringsval.

Widgetuppdaterad betyder att Android accepterade RemoteViews. Det bevisar inte faktisk visning i LockStar. AOD, widgetskalning, fysisk synk, nattläge/Doze och extra batteriförbrukning måste testas på telefon och klocka. Inga sådana fysiska tester är utförda av CI.

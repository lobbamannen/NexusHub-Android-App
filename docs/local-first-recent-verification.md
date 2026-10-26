# Lokal visning, tilläggsdatum och registerbevakning

Implementerar idé13/14 och Robins önskade ringklocka i serieregistret. Originalets låsta tema behålls; RecentActivity är en dokumenterad funktionell adapter och den nya klockans tilläggsstil ligger separat.

Verifierat lokalt: TypeScript, produktionsbygge och originaldesignkontroll godkända. Riktad svit omfattar cacheföreträde före väntande nät, samordnade kontroller, nätfel med bevarad lokal modell, transporttider utan återkopplingsloop, versionskontrollerad cachekö vid samtidig sparning, kompatibla POST/GET-modeller, datumordning och bevakningstoggle med bevarade individuella val. Därtill tidigare kalender/synk/idé-/ekonomikontroller. Slutligt antal finns i Actions-utskriften.

En separat kodgranskning identifierade risker för felaktig ekonomicache, samtidiga sena GET-svar, idéradering, svenska Git-sökvägar och uppdatering av rena kvarvarande vyer. Dessa rättades. Telefonens ännu osparade utkast ersätts inte; kön spelas inte upp automatiskt.

En riktig tillfällig Git-fixture kontrollerade att ändrat betyg och omordnat register inte ändrar en posts första registreringsdatum. Svensk berättelsesökväg med Å/ö verifierades separat. Databas Actions-jobb40378521066 gick igenom och skapade det verkliga härledda datumindexet. Indexet innehåller även historiska borttagna identiteter; UI använder endast nuvarande poster. Tiden avser första registrering i GitHub, inte första visning eller ett äldre originals skapande.

I mobilram med helt syntetiska exempeldata provades ringklocka på/av, två klick som återtar ett osparat val och gemensam Spara-funktion. Inga privata data användes i webbläsaren och inga riktiga registerrader ändrades där. Lokal-först-flödets tids-/nätordning verifierades i deterministiska tester; en riktig kallstart på Samsung måste jämföras i faktisk användning.

Idé8/12 flyttades atomiskt till `Ideer/Genomforda/` med originaltext, UUID och skapandetid bevarade. Nummerindex, bilagor och planpaket ändrades inte. Deras tidigare redovisade fysiska telefon/API-begränsningar gäller fortsatt.

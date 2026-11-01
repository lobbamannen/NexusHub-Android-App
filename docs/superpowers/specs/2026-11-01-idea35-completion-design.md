# Idé 35 – slutförande efter eftergranskning

Godkänt uppdrag: åtgärda samtliga kvarvarande fynd från eftergranskningen av de080866 samt de fyra acceptanskraven. Återanvänd befintliga system. Bevara design, alla användaroriginal, väntande sparningar, signeringsidentitet och offlinefunktion. Inga automatiska AI-jobb eller omskrivningar av Databas.

Design: beständiga kompletta kvittenser + resurslista och väntad återhydrering; snapshotbunden läsning för båda repos; minsta nödvändiga resurskoordinator med varaktig request-avbrottsavsikt; journalförd mottagning även under diskfel; identitetsbundna UI-fortsättningar. Gallra endast härledd cache som är säkert återskapbar och inte aktiv, aldrig original/kvittenser/tombstones/historik. Testa riktiga funktionsgränser och kraschfönster.

Alternativ som avvisats: nya parallella synkmotorer; tidsbaserat godkännande av spärrar; generell TTL; tyst promptkapning; omgenerering efter processdöd; koddelning utan mätt nytta.

Leverans: granskat samlat PR, relevant lokal verifiering, signerad CI-APK och publicering till main inom användarens uppdrag. Fysisk Samsung/NPU-verifiering redovisas ärligt som separat gräns.


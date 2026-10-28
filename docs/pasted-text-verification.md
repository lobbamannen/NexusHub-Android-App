# Klistra in text – verifiering

- Enhetskontroller för rå Markdown, Mermaid, länkar, Unicode, lång text, valfri/ogiltig källa och säkra filnamn.
- Selektions-/redigeringshjälpare behåller blandade CRLF/CR/LF från urklippet. Native textareans normalisering till LF ändrar inte det råa textutkastet.
- Store-tester verifierar lokal commit före nätanrop, offline/återförsök med samma ID, källa separat i metadata, samtidig synk, lokalt skrivfel utan uppladdning och läsfel efter commit utan ny sparidentitet.
- Befintliga incoming/idea-attachment/shared-incoming-tester körs tillsammans med nya tester. GitHub-spegeln testas med minnesbaserad Git-databas och återläsning av exakt Markdown, inte med testfiler i användarens riktiga Databas.
- Granskningen hittade två viktiga fel (textareans radslutsnormalisering och avbruten receipt-läsning efter commit). Båda återskapades med röda tester och rättades; den riktade sviten passerar 22 tester.
- CI kräver Playwright vid320/412 och kort420px vy för tangentbord: helskärm, avbryt/Tillbaka, riktig paste-händelse med CRLF, redigerbar text, frivillig källa, misslyckad IndexedDB-skrivning, offline + omladdning + återförsök, dubbeltryck och ingen sidöverströmning.
- Befintliga väder-/kalenderkontroller och Android-test/lint/signaturkontroll är kvar som publiceringskrav. Skärmbilder sparas i Actions-artifact `paste-ui`.

Fysisk Samsung-urklipp, tangentbord och användarens verkliga nät-/GitHub-behörigheter verifieras på telefonen efter installation; CI använder syntetisk research och simulerat GitHub-API.

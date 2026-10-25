# Idea Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fånga och vidareutveckla idéer i Android och Databas med tydlig synkstatus.
**Architecture:** JSON per UUID, begränsad GitHub-klient, lokal API-route och befintlig beständig skrivkö. React-hook håller utkast och lista, återanvänder MaterialIcon och moduldesign.
**Tech Stack:** Befintlig React/TypeScript, IndexedDB, GitHub REST, Kotlin APK.
**Spec:** docs/superpowers/specs/2026-10-25-idea-inbox-design.md

## Global Constraints
- Inga ändringar i Site-koden, paketnamn, signering eller befintliga innehållsregister.
- Ny, Undersöks, Genomförd, Avfärdad. Ingen obligatorisk titel eller kategori.
- Stabilt ID, SHA-skydd, ingen automatisk köåterspelning. Tydlig skillnad mellan lokal data och GitHub.

## Review Focus
- Förlorad PUT-kvittens och nytt försök får inte skapa en dubblett.
- Samtidig extern redigering får inte skrivas över.
- Omstart med utkast eller väntande sparning ska bevara texten.
- Läsfel eller trasig JSON får inte presenteras som en tom, verifierad inkorg.
- Navigation, Android Tillbaka och dubbla spartryck får inte förlora text eller kringgå kön.

### Task 1: GitHub-kontrakt
Files: lib/ideas.mjs, lib/ideas-github.mjs, lib/github-inbox.mjs, app/api/ideas/route.ts, tests/ideas.test.mjs.
Interfaces: validateIdea(value), ideaPath(id), listIdeas(), readIdea(id), saveIdea(idea, expectedSha); API GET /api/ideas[?id=UUID], POST {idea,expectedSha}.
- [x] Skriv och kör negativa/beteendetester för schema, UTF-8/hash, create-only, SHA-konflikt, återförsök och ofullständig lista; bekräfta rött.
- [x] Implementera begränsad GitHub-transport och lokal route. Kör samma test till grönt.

### Task 2: Lokal kö och gränssnitt
Files: platform/outbox.ts, platform/api.ts, components/ideas/*, app/portal.tsx, components/home/ModuleGrid.tsx, HomeDashboard.tsx.
Interfaces: useIdeas() med lista, utkast, open/new/edit/save/discard och väntande status; IdeasInbox och IdeaEditor använder samma hook i Portal.
- [x] Verifiera saknade UI-flöden med browserkontroll före implementation.
- [x] Registrera API i outbox, koppla synkkvittens och säker explicit annullering. Bygg vyer och tilläggsmeny; lägg till startsideskort.
- [x] Kör typecheck, build och browserflöden med isolerad GitHub-transport: skapa, utkast, stäng/omstart, redigera, status, nätfel, återförsök, konflikt och Ångra.

### Task 3: Leverans och dokumentation
Files: README.md, docs/verification.md, Databas/Ideer/README.md och schema.json, Databas/README.md.
- [x] Uppdatera dokumentation och kontrollera diff mot specifikationen. Behåll original-CSS byteidentisk; uppdatera designkontrollens explicita moduladapterundantag.
- [x] Kör befintliga tester, rapportera ärvda fel separat. Granska hela diffen.
- [x] Spara GitHub-källan, bygg signerad APK via Actions, verifiera publicerad release och signeringskontroll. Uppdatera issue med faktiskt resultat.

## Återupptaget uppdrag 2026-10-25

Robin bad uttryckligen att slutföra och publicera idéinkorgen tillsammans med fyra granskade ekonomirättningar: annullering av väntande editorförsök, oförändrade kommaalias, nettopris efter kopplad varurabatt samt synliga fel/synkstatus i editorn. Senaste ekonomi-main c51e1a1 integrerades innan arbetet fortsatte. Ingen Site eller befintlig innehållspost ändras. Ekonomins redigering registrerar sin specifika discard-funktion i Portal; film-/berättelsekassering lämnar andra köposter kvar. Målbyte låses efter ett sparförsök för att undvika dolda övergivna försök.

Genomförande: klient/route, editor och tester klara. Slutlig Actions-/APK-status redovisas i leveransen. Ingen Site-publicering görs.

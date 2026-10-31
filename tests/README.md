# Befintliga referenskontroller

Dessa filer är importerade från NexusHubs Site-kod och körs inte automatiskt av appens APK-workflow. Rena domäntester kan användas som riktade underhållsverktyg. Tester som matchar Site-kod, serverarkitektur eller specifik källkodsformatering är historiska referenser och är inte en komplett eller anpassad Android-testsvit. Verkliga utförda kontroller redovisas i `docs/verification.md`.

## Kodgranskning idé 35: aktuella kontroller kontra Site-historik

`.github/workflows/idea-35-validation.yml` kör fokuserade Android-/domänregressioner.
Det är inte den fullständiga historiska Site-testsviten.

- `tests/local-posters.test.mjs` har två kontroller av borttagna
  `scripts/sync-posters.mjs`; kör dem inte som aktuella Android-krav.
  Affischernas gällande funktion verifieras separat med
  `tests/story-cover-posters.test.mjs` och `tests/repository-posters.test.mjs`.
- Äldre `tests/backup.test.mjs` och `tests/upload-api.test.mjs`
  kan kräva borttagna migrations- och Site-filer. Dessa måste bedömas
  var för sig innan de ersätts eller avförs.
- Källkodsmatchande historiska serie-/bevakningstester är inte likvärdiga med
  riktiga UI- och datakontrakt. Bevara och testa fortsatt relevanta beteenden.
- Det historiska Vill se-gränstestet med stor assertion-utskrift får inte
  återinföras som krav när motsvarande gräns inte längre finns.

Misslyckade historiska tester redovisas öppet; de är inte genom det
automatiskt verifierade produktionsfel i dagens Android-app.

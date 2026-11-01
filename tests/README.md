# Aktuell verifiering

`npm run test:current` kör alla gällande Node-tester i `tests/*.test.mjs`. Sviten omfattar domänregler, verkliga API-kontrakt, återhämtning och renderade React-beteenden. Den separata idé 35-kontrollen kör denna svit; den stora historiska CI-konfigurationen återinförs inte vid varje APK-bygge.

[Historiska beslut](historical/README.md) anger exakt vilka gamla Site-/formateringstester som har flyttats till läsbara referenser och vilka beteenden som ersätter dem. Backup- och uppladdningstester är gällande och körbara; uppladdning använder appens faktiska lagringsschema.

Kör även TypeScript, designhashar, produktionsbygge och native-cachetest enligt README. Androids fokuserade Kotlin-tester körs separat med Robolectric i APK-kontrollen. Kodtest, kompilerad APK och fysisk Samsung-/NPU-verifiering redovisas var för sig i `docs/verification.md`.

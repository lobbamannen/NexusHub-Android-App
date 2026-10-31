# NexusHub · EmbeddingGemma 2 och intelligent idéinkorg

## Syfte och implementation
Den här grenen utökar den verifierade **Android**-versionen av NexusHub. EmbeddingGemma 2 (text 270M) kör lokalt med LiteRT-LM; Gemma 4 E2B fortsätter använda befintlig llama.cpp/Hexagon-runtime. Ingen modell laddas automatiskt vid appstart.

- **Idéinkorg:** ett härlett, lokalt och dokumentversionsbundet index över `Ideer/*.json`, textdokument i `Ideer/Bilagor/` och `NexusHub inkorg/`. Den senare är fortfarande tillfällig och exkluderas inte från *förslagsindexet*. Ingen automatisk arkivering, flytt eller radering.
- **Retrieval Lab:** samma index och sökalgoritm, men med möjlighet att skicka högst sex hämtade chunkar till befintlig Gemma 4 för ett källbaserat svar. Testa ett valt dokument via dokumentväljaren, sedan flera dokument. Detta är en beständig diagnostikvy.
- **Hybrid:** normerad lexikal term-ranking och 256d semantisk cosinusranking kombineras genom RRF (K=60). Ingen HNSW eller extra backend.
- **Modell:** officiell `.litertlm`-modell importeras manuellt via Android SAF. Native SHA-256 verifieras vid inferens och både query och document infereras vid import. Hård 768d→256d-trunkering följd av L2-normalisering. Bytekontrakten för gamla MediaPipe EmbeddingGemma 1 kopieras inte; EmbeddingGemma 2 har egna promptformat.
- **Indexer:** originalbyte läses endast från komplett verifierad GitHub-replika. Varje indexpost innehåller källans Git-blob-SHA, titel, chunk-ID och lokalt beräknad sourceHash. Rå dokumenttext och vektorer lagras som härledda data på telefonen, inte i Databas. Modell-SHA, runtimeprotokoll och chunkversion ingår i profilen. Endast matchande profil får användas.
- **Versionsskydd:** ändrade Git-filer indexeras om; identiska fönster återanvänder vektorer. All indexering kontrollerar GitHub-replikans commit före fullbordan. En inkompatibel embeddingprofil används inte.
- **Relationer:** semantiska träffar är förslag, aldrig verifierade relationer. Lokala granskad-/avfärdad-markeringar är inte permanenta GitHub-bilagor; sådana sparas genom appens befintliga bilageflöde.
- **Fallback:** när modellen eller embeddingindex saknas används lexikal sökning. Begärt och faktiskt läge skiljs i Retrieval Lab.
- **Minnesbudget:** Native-bryggan accepterar max åtta textfönster om 3500 tecken per batch, med gräns på inkommande JSON och återkoppling per unikt request-ID. När embeddingkörningen är färdig stängs LiteRT-motorn innan Gemma 4 får starta.

## Installation
1. Hämta **text-only CPU** EmbeddingGemma 2 från [LiteRT Community](https://huggingface.co/litert-community/embeddinggemma-2-text-270m-litert-lm/blob/main/embeddinggemma-2-text-270m.litertlm) (cirka 165 MB). Importera under Idéinkorg eller Retrieval Lab. Den gamla MediaPipe `.task`-filen kan inte användas.
2. Låt appen avsluta den redan befintliga synken med Databas. Öppna Idéinkorg för automatisk indexering. Testvyn finns under **Gemma 4 E2B → Retrieval Lab**.
3. Välj dokument och ställ faktabundna frågor. Jämför källutdrag, ranking, fallback, inference och Gemma-telemetri. Testa frågor utan stöd i dokumentet.
4. Lägg in nya forskningsrapporter i NexusHub-inkorgen och verifiera att förslag uppdateras när GitHub synkar.

## Tekniska begränsningar som ska testas
- `.pdf` och `.docx` indexeras **inte** i denna textbaserade version; gränssnittet redovisar antalet sådana filer. De representeras inte som semantiskt lästa.
- Endast filer upp till 2 MiB i de tillåtna textkategorierna ingår. Textfönster cirka 900 tecken med överlapp 120; detta är avsiktligt för den första lokala textmodellen.
- Engångs- och återuppbyggnadsarbetet kan ta tid vid stora dokumentmängder. Arbetet går att avbryta och redan lagrade fönster kan återanvändas.
- Modellens riktiga CPU-kompatibilitet, minnesåtgång och hur bra retrieval fungerar på Galaxy S26 Ultra återstår att **fysiskt** verifiera. En lyckad CI-kompilering är inte ett telefonbenchmark.
- EmbeddingGemma 2 levererar relevans, inte faktakontroll. Bedömning av motsägelser eller godkännande av relationer kräver vidare granskning.

## Officiella källor
- [Google LiteRT-LM Embedding Models](https://developers.google.com/edge/litert-lm/embedding_models)
- [Google EmbeddingGemma 2 task prompts](https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2)
- [LiteRT Community text-only modell](https://huggingface.co/litert-community/embeddinggemma-2-text-270m-litert-lm)

## Verifieringskrav
CI: React/TypeScript check, UI-build och signerad Android APK. På telefon: SAF import, dokument/query-vectors, riktig retrieval på ett och flera dokument, käll-ID, stale-index, fallback, ingen-svar-fall samt sekventiell Gemma-körning. Bekräfta aldrig dessa som fysiskt testade enbart genom GitHub.

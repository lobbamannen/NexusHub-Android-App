# Weather V1 verification

## Primary evidence retrieved 2026-10-28
- SMHI SNOW1gv1 point documentation: https://opendata.smhi.se/metfcst/snow1gv1/get_point_forecast
- Official parameter/symbol legend: https://opendata.smhi.se/metfcst/snow1gv1/parameters . Its published Docusaurus module https://opendata.smhi.se/assets/js/4ba83475.2ffaaef0.js was retrieved directly: source `@site/docs/metfcst/snow1gv1/7_parameters.mdx`, weather symbol1..27 complete table verified against mapping. This closes the report's symbol-legend gap.
- Actual point GET returned200 with SNOW `createdTime/referenceTime/timeSeries[].time/intervalParametersStartTime/data`, nullable sentinel9999, `air_temperature`, `wind_speed`, `precipitation_amount_mean`, `probability_of_precipitation`, `symbol_code`. Real response recorded in tests/fixtures/weather/smhi.json. Endpoint https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/13.5167/lat/56.1333/data.json
- SMHI usage/cache/attribution: https://www.smhi.se/data/om-smhis-data/villkor-for-anvandning . Actual response Expires/cache-control max-age3600.
- MET compact live200 fixture: https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=56.1333&lon=13.5167 ; tests/fixtures/weather/metno.json.
- MET primary terms/caching/interval model: https://api.met.no/doc/TermsOfService , https://api.met.no/doc/GettingStarted , https://api.met.no/doc/locationforecast/HowTO . Identifying UA, max4 coordinate decimals, exact validators, expiry and limited mobile background activity incorporated.
- Default Västra Torup geocoder response: latitude56.15,longitude13.48333,Europe/Stockholm from https://geocoding-api.open-meteo.com/v1/search?name=V%C3%A4stra%20Torup&count=5&language=sv&format=json . Docs https://open-meteo.com/en/docs/geocoding-api . Private noncommercial use, GeoNames/Open-Meteo attribution, explicit queries only.
- Apparent temperature formula: https://www.bom.gov.au/info/thermal_stress/ . T +0.33e−0.70v−4, e=RH/100×6.105×exp(17.27T/(237.7+T)); requires all inputs, shade approximation. Solar transit/hour-angle approximation uses apparent horizon−0.833°, civil timezone date and polar statuses.

## Code review
Task review corrected far-future near-now claims, explicit active fallback selection, HTTP freshness/304 metadata, incomplete daily temperature coverage, no-store/dangling persisted pointer fallback. Regressions accompany these conditions. Independent whole-feature review found no critical/important remaining source blocker; rounding and partly-cloudy night glyph consistency are also covered by widget tests. This does not substitute for executed CI.

## Checks and limits
Local TypeScript, originaldesign42 checks, Vite build and111 selected frontend tests passed before final CI. Full historical JS suite has nine known baseline failures from the battery task; repeat current-main baseline if a newly observed mismatch changes that status.

Android CI must execute the30 engine JUnit tests, Robolectric RemoteViews/date/black-surface/routes/glyph tests and all prior Android tests, lint bothmodules, signed release builds and previous-phone-APK certificate match. UI automation uses `tests/ui/weather-preview*`: explicit fixture-marked test state from recorded API data, not a live native bridge. Check mobile320/412 and desktop900 widths, overflow, weather/GitHub indicator separation, day expansion, place-search UI and invalid coordinate feedback. It captures screenshots as GitHub artifact `weather-ui` for visual inspection.

Remaining physical checks: install phone APK, observe native live fetch on actual network, Samsung widgetpicker/resizing/taps, app cold-launch routing, offline/restore, midnight/Doze delivery and actual phone battery impact. Watch battery code and its night pause are unchanged. No observed battery-saving or exact timing claim is made.

# Irrigation inputs: research review and current limits

## Decision policy implemented

Automatic irrigation is still triggered only by a fresh, valid soil-moisture reading compared with the crop's configured moisture trigger. Crop, soil, growth stage, temperature, relative humidity, vapor-pressure deficit, and shortwave radiation are included as decision context, but do not independently switch the valve or modify that trigger. If soil moisture is absent, stale, or invalid, the recommendation is `INSUFFICIENT_DATA` or `SENSOR_ERROR` and holds automatic irrigation. Manual valve control remains authoritative.

The configured moisture trigger and moisture target band are interim project settings; the 35% tomato demo trigger is not a research-derived recommendation. No universal volumetric-water-content threshold has been selected for tomato or potato across sandy and loam soils or growth stages. Sensor calibration, soil-specific water-retention curves, effective root depth, cultivar, irrigation method, and local field trials are required before changing those settings.

## Recent research reviewed

| Source and date | Evidence relevant to this project | Conditions, units, and limits |
| --- | --- | --- |
| Somefun, Masasi & Adelabu, “Irrigation and Water Management of Tomatoes—A Review,” *Journal of Sustainable Agriculture and Environment*, published 21 Nov 2024. [DOI: 10.1002/sae2.70020](https://doi.org/10.1002/sae2.70020) | Reviews tomato irrigation and identifies soil-moisture sensors, plant sensors, and crop models as irrigation-scheduling tools. Supports using measured soil moisture and crop context rather than a weather-only trigger. | A review, not a Cairo field calibration or a single sensor-threshold experiment. It does not establish a transferable moisture percentage for NileGuard's soils, crops, sensors, or growth stages. |
| Alkhateeb et al., “Integrating soil mulching and subsurface irrigation for optimizing deficit irrigation effectiveness as a water-rationing strategy in tomato production,” *Notulae Botanicae Horti Agrobotanici Cluj-Napoca*, online 22 Feb 2024. [DOI: 10.15835/nbha52113514](https://doi.org/10.15835/nbha52113514) | Tested full irrigation at 100% ETc against deficit irrigation at 60% ETc, with surface/subsurface drip and bare, organic-mulch, or black-polyethylene treatments. The abstract reports that regular deficit irrigation reduced growth, yield components, water productivity, physiological measures, and leaf nutrient content; mulch/subsurface combinations mitigated some effects. This cautions against applying deficit targets without local validation. | Two growing seasons (2020–21 and 2021–22); the reported treatment unit is percent of crop evapotranspiration (ETc), not soil-moisture percent. The abstract does not establish a sensor threshold, and the result is not directly transferable to Cairo, potato, or all soil textures. |
| Aiswarya et al., “Soil Moisture Distribution Pattern under Drip Irrigation in Sandy Loam Soil Using Gravimetric Method,” *Asian Journal of Soil Science and Plant Nutrition*, published 19 Apr 2024. [DOI: 10.9734/ajsspn/2024/v10i2276](https://doi.org/10.9734/ajsspn/2024/v10i2276) | Shows why soil moisture must be interpreted at a known position and depth: the study reports faster vertical than lateral water movement in sandy loam. Moisture location and recent irrigation conditions matter to sensor comparisons. | Chilli, not tomato or potato; sandy-loam field; 4 L/h drip emitters; 18 cm effective root zone; gravimetric observations at 10/20/30 cm depths and distances, 2 and 24 hours after irrigation. It does not provide a NileGuard threshold or establish performance for pure sand/loam. |
| Youssef, “Effect of Irrigation Quantities and Biochar on Production of Potato Grown in Sandy Soil,” *Horticulture Research Journal*, published 1 Jun 2026. [DOI: 10.21608/hrj.2026.521179](https://doi.org/10.21608/hrj.2026.521179) | Directly relevant Egyptian potato/sandy-soil research is identifiable and should be assessed before finalizing potato policies. | Bibliographic metadata was retrievable, but the article full text was inaccessible during this review; no results, thresholds, or recommendations are inferred from the title. Obtain and appraise the full paper before using it. |

Open-Meteo's [API documentation](https://open-meteo.com/en/docs) defines `shortwave_radiation` as a preceding-hour mean in W/m² and lists humidity and temperature units. It is an API-variable reference, not a field sensor validation study. The service's weather values are spatially modeled data for a selected coordinate and timestamp, not direct measurements at an individual plant or sensor.

## Comparison policy and provisional settings

Hardware and Open-Meteo observations are stored separately with their own values, units, source, measurement/receipt times, validity, and location. Temperature and relative humidity are currently the only parameters compared between the two sources. Units are normalized only where a known conversion exists (°F to °C). PPFD is no longer collected or stored; shortwave radiation remains in W/m².

Current comparison tolerance defaults are configurable:

| Parameter | Default difference tolerance | Config key | Status |
| --- | ---: | --- | --- |
| Air temperature | 2 °C | `TEMPERATURE_COMPARE_TOLERANCE_C` | Provisional engineering setting; not a published crop threshold |
| Relative humidity | 10 percentage points | `HUMIDITY_COMPARE_TOLERANCE_PERCENT` | Provisional engineering setting; not a published crop threshold |

These are not claimed to be scientifically validated tolerances. A defensible tolerance requires the actual sensor model/specification, calibration uncertainty, placement and shielding, weather-grid representativeness, and matched observation intervals. The current hardware and weather freshness defaults (5 and 30 minutes) and maximum comparison time skew (the shorter freshness window) are likewise operational policies, not research-derived constants. Tune and validate them with co-located field measurements before treating `CONSISTENT`/`CONFLICT` labels as calibrated accuracy judgments.

The current plausibility bounds (moisture and RH 0–100%, temperature −50–80 °C, and shortwave radiation 0–2000 W/m²) are input sanity checks only. They are not irrigation thresholds. A missing/null observation is kept distinct from a non-null out-of-range value, which is marked invalid.

## Source selection and safety

1. Temperature and relative humidity comparisons retain both original observations. Fresh valid physical readings are selected when Open-Meteo is stale or invalid; when both readings are usable, the existing hardware-priority policy remains in effect.
2. A fresh, valid Open-Meteo temperature or humidity value is selected if hardware is missing, invalid, or stale. Soil moisture is never sourced from weather.
3. If both sources are usable but their measurements are too far apart in time for comparison, the comparison is marked stale rather than labeled agreement/conflict.
4. Shortwave radiation remains an environmental context input. No PPFD fallback or conversion is performed.
5. Climate variables provide context (including a calculated VPD value when temperature and RH exist); they cannot trigger irrigation or override the soil-moisture safety input.

## Work still required before research-calibrated operation

- Identify each deployed sensor model and obtain manufacturer accuracy/response specifications.
- Calibrate moisture sensors against gravimetric samples for the actual sandy and loam field soils; map sensor depth/location to crop root zones and growth stages.
- Obtain and review the full Egyptian potato study and additional locally relevant tomato, potato, soil, and stage trials; report treatment methods, sample sizes, irrigation units, and uncertainty.
- Run co-located hardware/Open-Meteo comparisons across representative locations, weather conditions, and time offsets; derive parameter tolerances from observed and instrument uncertainty rather than relying on current defaults.
- Validate any future crop/soil/stage-specific moisture trigger in field trials while retaining manual override and pump/valve safety limits.

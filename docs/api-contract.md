# NileGuard API and module handoff

## Local architecture

The browser dashboard calls the Express API at `/api`; Vite proxies this path to `127.0.0.1:3001` while the dashboard runs at `127.0.0.1:5173`. The API uses PostgreSQL in the dedicated `nileguard` schema. Successful responses use `{ "data": ... }`; errors use `{ "error": { "code", "message", "details?" } }`.

Run `npm run db:setup` to apply the repeat-safe migration and seed, then `npm run dev` to start the API and UI. The API also runs migration and seed during startup. `GET /api/health` reports persistence mode and whether development hardware simulation is enabled.

## Authentication

- `POST /api/auth/login` — accepts `{ "email", "password" }`, returns a bearer token and public user.
- `GET /api/auth/me` — returns the authenticated user.
- `POST /api/auth/logout` — acknowledges logout; the current stateless token is discarded by the client.
- All other user-facing routes require `Authorization: Bearer <user-token>`.
- User creation/deletion, zone/node provisioning, and gateway-token generation require the `admin` role. Every signed-in user may edit only their own profile.

The seed creates one admin and two operator demo accounts. Random passwords are printed once on first creation; `npm run db:rotate-demo-passwords` resets only those accounts and prints fresh passwords if needed. Only bcrypt hashes are stored.

## Zones, users, and sensor data

Common dashboard routes:

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /api/zones`, `GET /api/zones/:zoneId` | User | Zone details, latest reading, valve state, and recommendation |
| `POST /api/zones`, `PATCH /api/zones/:zoneId`, `DELETE /api/zones/:zoneId` | Admin | Manage growing zones |
| `GET /api/crops` | User | Available crop types and stages |
| `GET /api/nodes` | User | Registered field nodes |
| `POST /api/nodes`, `PATCH /api/nodes/:nodeId`, `DELETE /api/nodes/:nodeId` | Admin | Manage node assignments |
| `GET /api/users`, `POST /api/users`, `DELETE /api/users/:userId` | Admin | List, create, or delete accounts |
| `PATCH /api/auth/me` | User | Update only the signed-in user's name, email, phone, and optional password |
| `GET /api/readings?zone_id=<id>&hours=24&limit=500` | User | Read time-series data |
| `GET /api/zones/:zoneId/environment` | User | Read retained hardware/weather observations and comparison decisions |
| `GET /api/recommendations?zone_id=<id>` | User | Evaluate irrigation recommendations |
| `GET /api/alerts`, `GET /api/irrigation/schedule` | User | Dashboard alerts and schedule |
| `GET /api/weather/locations` | User | Resolve the configured Cairo-area presets using Open-Meteo Geocoding |
| `GET /api/weather?location=nasr-city` | User | Current conditions, 24 hourly forecast points, and 7 daily forecast points from Open-Meteo |
| `GET /api/weather?latitude=30.07&longitude=31.33` | User | Weather for future field/node coordinates without depending on sensor readings |
| `PUT /api/zones/:zoneId/override` | User | Set `{ "valve_state": "on" | "off" }` manually |
| `DELETE /api/zones/:zoneId/override` | User | Return valve control to automatic mode |

Weather responses use the standard `{ "data": ... }` envelope. `GET /api/weather/locations` returns preset IDs (`nasr-city`, `new-cairo`, `masr-el-gedida`) with their Open-Meteo-resolved coordinates. `GET /api/weather` returns `source: "open-meteo"`, the selected `location`, `retrieved_at`, provider `units`, one `current` observation, and columnar `hourly` (24 timestamps) and `daily` (7 dates) forecasts. Variable names and units follow Open-Meteo, for example `temperature_2m` in °C, `relative_humidity_2m` in %, `precipitation` in mm, and `wind_speed_10m` in km/h. Provider timestamps are local to the returned `location.timezone`; missing measurements are `null`. Responses include Open-Meteo attribution. Both coordinate query parameters are required together. No weather response is derived from sensor history or fabricated if Open-Meteo is unavailable. The default preset is `nasr-city`; configure it with `WEATHER_DEFAULT_LOCATION`. The process-local forecast cache is keyed by location ID, coordinates, timezone, and forecast parameters and expires after 12 minutes by default.

User creation fields include `name`, `email`, `phone_number`, `password`, and `role`. `PATCH /api/auth/me` accepts `name`, `email`, `phone_number`, and an optional `password`; it derives the account ID from the authenticated token and does not accept a role or other user ID. The API has no endpoint to edit another user's profile. Passwords are always bcrypt-hashed. Administrators can create or permanently delete accounts, but account owners maintain their own profile details. Deleting an account clears foreign-key audit references to it while sensor/irrigation history remains.

Sensor features belong to each zone's `sensor_readings` history rather than the `crops` configuration table: crops describe crop type/thresholds, while each reading is associated with a crop zone, node, and timestamp. `GET /api/zones` returns the latest reading for each crop/soil zone with these configured fields; `GET /api/readings` returns historical readings. The Zones screen shows the most recent values per crop zone. The configured sensor fields and units are:

| JSON reading field | Unit |
| --- | --- |
| `moisture` | soil moisture, % |
| `temp` | air temperature, °C |
| `shortwave_radiation_w_m2` | W/m² |
| `humidity` | relative humidity, % |
| `battery_mv` | battery voltage, mV |

Water level is intentionally not in the schema/API until the team confirms what is measured and its unit. CO₂ concentration and soil pH are no longer part of the schema, API, or dashboard; migration 006 removes those columns without deleting other sensor history. Migration 007 ensures deployed environmental-observation tables include the stale-state flag. Migration 008 removes PPFD telemetry and its historical environmental observations. Reading responses include `timestamp`, `received_at`, `seq`, `gateway_id`, and `data_source` (`synthetic` or `gateway`) so test history is distinguishable from physical devices. Moisture, temperature, humidity, and shortwave radiation may be null when a sensor does not report a value; finite but out-of-range environmental values are retained and marked invalid in environmental observations. Hardware submissions use the field units above.

Environmental records include `parameter`, `value`, `unit`, `source`, `measuredAt`, `receivedAt`, `isValid`, `isStale`, and `locationId`. Sources are `hardware`, `open-meteo`, and `synthetic`. Comparisons are currently recorded for air temperature and relative humidity only; each includes `status`, both observation IDs, absolute difference, configured tolerance, selected observation ID, and selected source. Timestamps are ISO-8601 UTC values. Comparison statuses include `CONSISTENT`, `CONFLICT`, `HARDWARE_MISSING`, `WEATHER_MISSING`, `STALE_READING`, and `INVALID_READING`.

The Weather Forecast view associates the selected Open-Meteo location with the selected zone when it calls `GET /api/weather?location=<preset>&zone_id=<id>`. This enables local comparison records, but a zone-specific geocoordinate has not yet been provisioned; the selected area is currently an explicit proxy for that zone. A weather response saves current temperature, relative humidity, and shortwave radiation only. It never saves soil moisture. Stale cached Open-Meteo observations are marked as stale and are not selected over fresh physical readings.

Recommendation `inputs` returns each environmental value together with its source (`moistureSource`, `temperatureSource`, `humiditySource`, and `shortwaveRadiationSource`). These values explain the current evaluation; no separate recommendation-history table is currently maintained.

## Gateway and future hardware integration

The API keeps hardware-specific transport out of dashboard routes:

1. An administrator requests `POST /api/gateways/:gatewayId/token`; the response token authenticates the gateway.
2. The gateway requests `POST /api/nodes/register` with its gateway bearer token and `{ "zone_id": "..." }`. The response contains a node token. A zone may have only one node.
3. The gateway submits `POST /api/readings` with both `Authorization: Bearer <gateway-token>` and `X-Node-Token: <node-token>`. The payload includes the node ID, zone ID, gateway ID, monotonically increasing `seq`, and sensor fields.
4. The API checks both identities, their assignments, the zone, timestamp bounds, and sequence freshness before persisting the reading. It stores environmental observations independently and writes comparison snapshots. A stale or duplicate sequence returns `409 STALE_SEQUENCE`.
5. On accepted readings, the API evaluates validated soil moisture as the automatic irrigation trigger. Fresh valid physical readings take priority; Open-Meteo may fill temperature, humidity, and radiation only when hardware values are missing, stale, or invalid. Weather cannot supply soil moisture or independently trigger irrigation. Manual overrides remain authoritative until cleared.

`GET /api/dev/gateway-token`, `GET /api/dev/node-token/:nodeId`, and `POST /api/mock/simulate-reading` are development-only simulation helpers; they are not hardware controls and must not be exposed in a deployment. The current valve path updates database state only. A real gateway command/acknowledgement protocol still needs to be agreed and connected before claiming physical irrigation control.

## Persistence and decision-engine boundary

The schema relates `users`, `crops`, `soil_types`, `gateways`, `zones`, `nodes`, `sensor_readings`, `valve_controls`, and `irrigation_schedule` using foreign keys, uniqueness constraints, and measurement checks. User emails are unique without case sensitivity; because deletion removes the row, a deleted email can be registered again. Readings have indexes on zone/time, node/time, and receipt time. A partial unique index protects gateway sequence numbers without imposing hardware identity semantics on seeded history.

`PostgresRepository` implements the repository contract used by the routes and decision service. `MemoryRepository` remains available for isolated API tests. The database seed creates exactly these crop/soil combinations: tomato/loam, tomato/sandy, potato/loam, and potato/sandy. Tomato demo settings use a 35% interim trigger, 40–70% moisture target, standard tomato growth stages, and synthetic temperature conditions; these are examples, not locally validated recommendations.

The current decision engine is intentionally a replaceable interim moisture-threshold implementation. It is not the final crop-, soil-, climate-, or growth-stage-aware algorithm. The API response exposes the recommendation inputs and reason; a future agronomic engine can replace the decision service without changing dashboard request/response routes.

The demo readings are synthetic but constrained to plausible ranges for UI testing. Crop water demand varies by climate and growth stage; the eventual model should be based on the team's agronomic requirements and validated inputs. References: [FAO crop water information](https://www.fao.org/4/s2022e/s2022e07.htm) and [FAO-56 reference evapotranspiration/crop coefficient guidance](https://www.fao.org/4/x0490e/x0490e0b.htm).

## TimescaleDB and cloud migration

TimescaleDB is not required for the current dataset or hourly rate. The four zones generate roughly 35,000 new rows per year, which ordinary indexed PostgreSQL can manage. Revisit time-series partitioning, compression, or continuous aggregates after actual device frequency and retention requirements are known. The repository boundary keeps the service/API contract stable if the storage implementation later needs to change.

## Inspecting database relationships

In pgAdmin, expand **Databases → your database → Schemas → nileguard → Tables**. Use the Query Tool with `information_schema` to list foreign keys, or pgAdmin's ERD tool to visualize them. To confirm a user change, query `nileguard.users` for `id`, `name`, `email`, `phone_number`, `role`, and `created_at`; do not select `password_hash`.

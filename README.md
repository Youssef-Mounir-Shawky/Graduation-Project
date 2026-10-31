# NileGuard irrigation dashboard

NileGuard is a TypeScript/Express API and browser dashboard for crop zones, irrigation recommendations, users, field nodes, and sensor history. PostgreSQL is the durable store; hardware and the gateway remain mocked until they are available.

## Run locally

Requirements: Node.js 20+ and the PostgreSQL database configured for this project.

```powershell
npm install
npm run db:setup
npm run dev
```

Open `http://127.0.0.1:5173` in Chrome. Vite serves the UI and proxies `/api` to the Express API on `http://127.0.0.1:3001`. The API runs the repeat-safe schema migration and seed on startup, so `db:setup` is useful for explicitly initializing or repairing a local database but is not required every time.

`GET /api/health` is a readiness check: with PostgreSQL persistence it runs a lightweight `SELECT 1` and returns HTTP 503 when the database cannot be reached; test-mode in-memory persistence reports `database: "in-memory"`.

The server reads its existing `DATABASE_URL` setting at runtime. Keep credentials in the local environment file; do not commit it. The database objects live in the dedicated `nileguard` schema, so the app does not need `CREATE` permission on PostgreSQL's `public` schema.

## Weather data

The authenticated backend weather endpoints use the Open-Meteo Forecast and Geocoding APIs; weather does not depend on sensor readings or add database tables. `GET /api/weather/locations` resolves Nasr City, New Cairo, and Masr El Gedida (Heliopolis) by name and verifies the returned match is in Cairo Governorate, Egypt. `GET /api/weather?location=nasr-city` returns current conditions, 24 hourly forecast points, and 7 daily forecast points, including provider units and location-local timestamps. The default preset is configurable with `WEATHER_DEFAULT_LOCATION` (`nasr-city`, `new-cairo`, or `masr-el-gedida`). Forecast responses are cached in process memory for 15 minutes by location, resolved coordinates, and requested variables. Concurrent requests for the same forecast share one upstream request. If Open-Meteo rate-limits the service, the backend honors its retry interval, avoids repeated upstream calls, and serves the last successful forecast for up to 24 hours with a visible stale-data notice.

Open-Meteo documents that free-tier limits are enforced by source IP and application and warns that shared-egress hosts including Render may be rate-limited earlier. The local app can continue calling Open-Meteo directly. For a Render deployment affected by shared egress, the project includes an authenticated Cloudflare Worker relay at `cloudflare/weather-proxy.js`, following Open-Meteo's recommendation to use Cloudflare Workers. Deploy this file as a Worker, add a Worker secret named `NILEGUARD_WEATHER_PROXY_TOKEN`, and set the same high-entropy secret plus `WEATHER_PROXY_URL` (the Worker HTTPS origin, for example `https://nileguard-weather.<account>.workers.dev`) in the Render service environment. Set `WEATHER_PROXY_TOKEN` in Render to the same value. The backend then sends both forecast and geocoding requests through the relay; the token is sent only in the authorization header, never in the browser or URL. Keep the Worker private by retaining this token check. Redeploy the Render service after setting both variables. If Open-Meteo's limit continues after routing through the Worker, use an Open-Meteo subscription and configure a dedicated customer API endpoint/key rather than repeatedly retrying the free endpoint. See [Open-Meteo's free API terms](https://open-meteo.com/en/terms) for the documented IP-based limits and Render warning.

`WEATHER_CACHE_TTL_MS` can be set from 60000 to 900000; `WEATHER_REQUEST_TIMEOUT_MS` controls provider request timeout (1000–60000 ms). For future field-specific forecasts, pass both `latitude` and `longitude` query parameters instead of a preset; node recording intervals remain independent and unchanged.

## Initialize a shared Neon database

The project applies its SQL migrations itself; do not paste the migration into Neon's SQL editor. The backend schema-qualifies database objects, so Neon's pooled endpoint works without a `search_path` startup parameter. Keep `sslmode=require` in the Neon connection URL. With the local `DATABASE_URL` set to the new Neon database, open a terminal at the repository root and run:

```powershell
npm run db:setup
```

This creates the `nileguard` schema and its tables, records the migration, and inserts the repeat-safe demo seed. Run this once before asking the rest of the team to connect. Start the local backend and dashboard with `npm run dev`; the API uses the same `DATABASE_URL`. Each teammate who runs the backend should configure their own untracked local environment file with the shared Neon connection string. Never commit or paste that string into chat or source control.

Check the migration and tables in Neon's SQL editor:

```sql
SELECT filename, applied_at
FROM nileguard.schema_migrations
ORDER BY applied_at;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'nileguard' AND table_type = 'BASE TABLE'
ORDER BY table_name;

SELECT COUNT(*) AS sensor_readings
FROM nileguard.sensor_readings;
```

Check the running backend at `http://127.0.0.1:3001/api/health`; the response should report `"persistence":"postgres"`. If setup fails, share only the error text after removing connection URLs, usernames, hostnames, and passwords. If the Neon role reports a schema permission error, use the database owner role for the initial setup.

## Demo sign-in

| Role | Name | Email | Phone | One-time password |
| --- | --- | --- | --- | --- |
| Admin | NileGuard Demo Admin | `farmer@nileguard.local` | `+1-202-555-0101` | `D20-OfE3XTksX1WJEchcv1hC` |
| Operator | Amina Hassan | `amina.hassan@nileguard.local` | `+1-202-555-0102` | `fRxzITYZyui6n7XCQu8tEQSC` |
| Operator | Omar Khaled | `omar.khaled@nileguard.local` | `+1-202-555-0103` | `cNM23dZ5efgvWA0HnWaDzITU` |

These are the one-time passwords issued for the current demo accounts. Initial seeding creates unique random passwords and prints them once; seeding again does not change existing passwords. If these passwords no longer work or are lost, run `npm run db:rotate-demo-passwords`; this resets only the three demo accounts and prints new passwords. Passwords are stored in the database as bcrypt hashes.

## Data model and demo records

The `nileguard` schema has related tables for users, crops, soil types, gateways, zones, nodes, sensor readings, valve controls, irrigation schedules, and migration history. Foreign keys and check constraints validate relationships and measurement ranges. User account deletion is permanent; audit references to a deleted user are cleared while related irrigation and sensor history remains.

The seed contains the two crops (tomato and potato), two soils (loam and sandy), and all four crop/soil combinations. Tomato demo zones use a 35% interim moisture trigger and a 40–70% target range; these are illustrative sensor percentages, not a crop-, soil-, or growth-stage-calibrated prescription. Each zone has a field node and six months of hourly synthetic history. Seed history is for UI/backend testing and is **not measured or validated agronomic data**.

Migration `005-environmental-observations.sql` retires the legacy lux field, adds shortwave radiation, and stores source observations and comparison history independently in PostgreSQL. Migration `008-remove-ppfd.sql` removes PPFD from sensor telemetry and environmental observations. Hardware readings use canonical units. Open-Meteo current temperature, relative humidity, and shortwave solar radiation are persisted when weather is loaded for a selected zone. The API exposes them through `GET /api/zones/:zoneId/environment`.

The dashboard's **Analytics**, **Weather Forecast**, and **Trends** tabs query stored sensor history. Analytics and Trends show humidity in place of the removed light-intensity series; shortwave radiation remains a distinct measurement in W/m². Weather comparison cards compare temperature and humidity only. If current Open-Meteo temperature or humidity is stale or invalid, the Weather Forecast page uses a fresh, valid physical sensor reading when available. The UI otherwise retains existing chart, dark-mode, responsive, and Arabic/RTL behavior.

The dashboard adapts across phone, tablet, and desktop widths. At widths up to 56rem, the sidebar becomes a hamburger-controlled navigation menu; charts, forms, and zone cards reflow to fit narrow screens without horizontal page scrolling.

Every signed-in user can edit only their own name, email, phone number, and optional password from **Settings → Personal information**. Only administrators can create or delete accounts; there is no profile-edit operation for another account. Passwords are hashed.

| Measurement | Stored field | Unit |
| --- | --- | --- |
| Soil moisture | `soil_moisture_percent` | % |
| Air temperature | `air_temperature_c` | °C |
| Shortwave solar radiation | `shortwave_radiation_w_m2` | W/m² |
| Relative humidity | `relative_humidity_percent` | % |
| Battery | `battery_mv` | mV |

The removed CO₂ and soil-pH columns are dropped by database migration 006. Migration 008 deletes PPFD observations and drops the PPFD sensor column; other measurement history is retained. Water level is not stored because its physical meaning, sensor, and unit have not been specified.

The current decision engine keeps the configured soil-moisture trigger as the only automatic irrigation trigger. Temperature, humidity, calculated vapor-pressure deficit, shortwave radiation, crop, soil, and growth stage are included as environmental context; weather alone cannot trigger irrigation. Existing trigger values remain interim until locally calibrated. Research context and limitations are documented in [docs/irrigation-decision-research.md](./docs/irrigation-decision-research.md).

## TimescaleDB

TimescaleDB is **not needed now**. At hourly sampling, four zones produce roughly 35k new readings per year, which standard PostgreSQL handles comfortably with the existing time/zone indexes. Reassess when real device frequency, retention, or query volume is known; TimescaleDB can be added later if hypertables, compression, or continuous aggregates solve a demonstrated need.

## Inspect the database with pgAdmin

1. Open pgAdmin and register or connect to the PostgreSQL server you installed.
2. Use the database name and login role already configured for the app; a local PostgreSQL server commonly listens on port `5432`.
3. In the Browser tree, open **Databases → your database → Schemas → nileguard → Tables**. Right-click **Tables → Refresh** if the schema is not shown.
4. Open pgAdmin's ERD tool and add the `nileguard` tables to visualize foreign-key relationships: crop/soil → zone → node → reading, plus the user → valve audit reference.
5. Open **Tools → Query Tool** and run:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'nileguard' AND table_type = 'BASE TABLE'
ORDER BY table_name;

SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.constraint_schema = kcu.constraint_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.constraint_schema = tc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.constraint_schema = 'nileguard'
ORDER BY tc.table_name, kcu.column_name;

SELECT id, name, email, phone_number, role, created_at
FROM nileguard.users
ORDER BY created_at DESC;
```

The last query deliberately omits password hashes. After adding, editing, or deleting a user in **Settings → Users**, rerun it to check the row and updated values in PostgreSQL.

## Useful commands

```powershell
npm run dev                     # Start API and dashboard
npm run build                   # Type-check frontend/backend and build UI
npm test                        # Run API tests
npm run db:setup                # Apply migrations and seed missing demo data
npm run db:rotate-demo-passwords # Issue new demo-account passwords
```

More endpoint details and the module/gateway handoff are in [docs/api-contract.md](./docs/api-contract.md).

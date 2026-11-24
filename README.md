# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## Shared design foundations

The public layout uses the EuroCars navy and blue palette defined as Tailwind theme tokens in `app/assets/css/main.css`. Inter Variable is bundled locally with system font fallbacks and `font-display: swap`. Shared controls include `AppButton`, `AppInput`, `AppSelect`, `ConfirmModal` and `AppToast`; existing form classes use the same tokens. The header and footer link only to implemented routes, and account actions depend on the existing authenticated user state.

The account overview uses the signed-in user's listings, favorites and conversations. Recent listings and the default listing sort follow the server's last-updated order; search, model-year and mileage sorting, and grid/list views operate on those listings locally. Active listings link to their public page. Reporting a sale or archiving a listing requires confirmation and uses the existing moderation workflow. Admin tables display actual creation dates and user avatars, with horizontally scrollable tables on small screens.

The home-page brand marks in `public/brands` are sourced from Wikimedia Commons: [BMW](https://commons.wikimedia.org/wiki/File:BMW.svg), [Mercedes-Benz](https://commons.wikimedia.org/wiki/File:Mercedes-Benz_free_logo.svg), [Audi](https://commons.wikimedia.org/wiki/File:Audi_logo.svg) (cropped to the rings), [Volkswagen](https://commons.wikimedia.org/wiki/File:Volkswagen_logo_2019.svg), [Porsche wordmark](https://commons.wikimedia.org/wiki/File:Porsche_wordmark.svg), [Toyota](https://commons.wikimedia.org/wiki/File:Toyota_Symbol.svg), [Škoda](https://commons.wikimedia.org/wiki/File:%C5%A0koda_Auto.svg), and [Volvo](https://commons.wikimedia.org/wiki/File:Volvo-Iron-Mark-Black.svg). Commons identifies these images as public domain; the marks remain trademarks of their respective owners.

## Account backend

The account API uses PostgreSQL and the schema in `server/db.sql`. For a new, empty database, apply the schema once, for example with `psql -v ON_ERROR_STOP=1 -d eurocars -f server/db.sql`. It includes migrations 001–008; do not apply those migrations afterward. Do not run this script against an existing initialized database. Copy `.env.example` to `.env` and set `DATABASE_URL` to your PostgreSQL connection string. Existing `NUXT_DATABASE_URL` configurations remain supported as a fallback; `DATABASE_URL` takes precedence. Tables are not created automatically.

For local demonstrations only, populate a fresh, empty schema with `psql -v ON_ERROR_STOP=1 -d eurocars -f server/seed.sql`. It creates 32 countries, 18 brands, 36 models, equipment, 8 fictional sellers and 20 fictional active listings. Listings have no photos and are explicitly marked as demos; seller accounts cannot be used to sign in and have no administrator access. The seed aborts if its target tables contain data, including on a second run; never run it on a production database.

Nuxt loads `.env` in development. For a production server, supply `DATABASE_URL` and `SESSION_SECRET` in the server process environment; they are not embedded in the build. Set `SESSION_SECRET` to a cryptographically random value of at least 32 bytes and keep it stable across instances and restarts. `GET /api/health` checks the database connection and returns HTTP 503 when it is unavailable.

For databases initialized with an earlier schema, migrations remain available and are not applied automatically. Review the existing schema, back up the target database, and apply only pending migrations in order before deploying code that depends on them:

- `server/migrations/001_add_car_trim.sql` adds the optional car trim column.
- `server/migrations/002_auth_rate_limits.sql` creates the shared authentication rate-limit table.
- `server/migrations/003_listing_images_and_idempotency.sql` creates listing submission idempotency records.
- `server/migrations/004_admin_console.sql` adds account suspension and moderation fields, plus the administrator audit log.
- `server/migrations/005_sale_confirmation.sql` adds seller-reported sale confirmation state and its review index.
- `server/migrations/006_notifications.sql` creates persistent notification records and indexes.
- `server/migrations/007_image_upload_sessions.sql` creates image upload sessions, variants and cleanup jobs.
- `server/migrations/008_listing_blob_images.sql` adds Blob image metadata and synchronization jobs.
- `server/migrations/009_complete_image_upload_sessions.sql` adds fields and variants missing from earlier versions of migration 007; it is a no-op on the current consolidated schema.

For example, to apply the new admin migration to an existing database after reviewing and backing it up, run `psql -d eurocars -f server/migrations/004_admin_console.sql`. Do not rerun `server/db.sql` against an initialized database.

The account API uses `users` and `refresh_tokens`; it treats the latter's hashed tokens as opaque session tokens and revokes them on logout. Public car listings and detail pages read ACTIVE inventory from PostgreSQL. Listing images and avatars are stored outside `public` under `.data/listing-images` and `.data/avatars` by default; set `LISTING_IMAGE_STORAGE_DIR` and `AVATAR_STORAGE_DIR` to persistent private directories in production. For multiple application instances, these directories must be shared between instances. Older `eurocars_users` and `eurocars_sessions` tables, if created by a previous version, are not used or automatically migrated. Existing scrypt passwords are upgraded to Argon2id after a successful sign-in; existing active session tokens remain usable with a configured secret.

Implemented endpoints:

- `POST /api/auth/register` — create an account and sign in.
- `POST /api/auth/login` — sign in and create a session.
- `GET /api/auth/me` — read the current session.
- `POST /api/auth/refresh` — rotate the current session token without extending its expiry.
- `GET /api/users/me` — read the signed-in user's profile.
- `PATCH /api/users/me` — update the signed-in user's name, phone, country, city and avatar URL.
- `POST /api/users/me/avatar`, `GET /api/users/:id/avatar/:token` — upload a profile photo (JPEG, PNG or WebP, up to 5 MB). Photos are visible to their owner, administrators, conversation participants and visitors when the owner has an active listing.
- `POST /api/users/me/change-password` — verify the current password, set a new one and revoke other sessions.
- `PATCH /api/auth/profile` — legacy name-only profile update.
- `POST /api/auth/logout` — revoke the session.
- `GET /api/brands`, `GET /api/brands/:id/models`, `GET /api/countries`, `GET /api/features` — read listing reference data.
- `POST /api/cars` — create an authenticated user's draft or submit it for review.
- `GET /api/cars`, `GET /api/cars/:id` — query public ACTIVE listings and read a public listing.
- `GET /api/cars/:id/images/:imageId` — read a listing image subject to listing visibility and ownership.
- `GET /api/users/me/cars`, `GET /api/users/me/cars/:id` — retrieve the current user's listings.
- `GET /api/favorites`, `POST /api/favorites/:carId`, `DELETE /api/favorites/:carId` — manage the signed-in user's saved active listings.
- `GET /api/conversations`, `POST /api/conversations`, `GET /api/conversations/:id/messages`, `POST /api/conversations/:id/messages`, `PATCH /api/conversations/:id/read` — participant-only HTTP messaging with paginated history and unread counts.
- `POST /api/cars/:id/view` — count one view for an ACTIVE listing.
- `GET /api/notifications`, `GET /api/notifications/count`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read` — list and mark the signed-in user's notifications as read.
- `PATCH /api/cars/:id` — update an owned listing or its permitted status.
- `DELETE /api/cars/:id` — archive an owned listing without deleting its related records.
- `GET /api/admin/access`, `GET /api/admin/stats` — verify admin access and read database-backed dashboard statistics.
- `GET /api/admin/analytics?days=7|30|90`, `GET /api/admin/health` — administrator-only marketplace analytics and lightweight system health checks.
- `GET /api/admin/cars`, `GET /api/admin/cars/:id`, `PATCH /api/admin/cars/:id/status` — search, inspect and moderate listings.
- `GET /api/admin/moderation/sales`, `PATCH /api/admin/moderation/sales/:id` — list pending seller-reported sales and confirm or reject them with an audit record.
- `GET /api/admin/users`, `GET /api/admin/users/:id`, `PATCH /api/admin/users/:id/status` — inspect users and suspend/reactivate accounts.
- `GET /api/admin/dealers`, `GET /api/admin/dealers/:id`, `PATCH /api/admin/dealers/:id/verification` — inspect and verify dealerships.
- `GET /api/admin/audit-logs` — read the append-only administrator audit history.

Passwords are stored as Argon2id hashes. Sessions use opaque, HttpOnly, SameSite cookies with Secure enabled in production. Mutating API requests must include an Origin matching the request Host; production requires HTTPS. Authentication is limited to 20 attempts per direct client IP per 15 minutes. When deploying behind a reverse proxy, this currently limits the proxy IP rather than trusting client-supplied forwarding headers. If a development adapter provides no client address, development requests share one rate-limit bucket; production fails closed rather than trusting forwarded headers.

## Account dashboard

`/profile` and the `/account/*` dashboard pages require an authenticated session. Profile settings update the user's name, phone, country code, city and avatar URL; email cannot be changed. Country codes must exist in the database's `countries` table. Changing the password requires the current password and revokes other sessions.

The listing form reads brands, models, countries and equipment from PostgreSQL; the corresponding reference tables must be populated first. Listings can be saved as drafts or submitted with status `PENDING`. Editing an active listing takes it out of public circulation until it is reviewed again. The public catalog only returns ACTIVE listings. Listing photos are uploaded to private local storage and served through an access-checked API route.

The create and edit pages share a five-step listing wizard. Previously visited steps can be reopened from the progress indicator or the review screen; moving forward validates each intervening step. Doors, seats and first registration use existing `cars` columns; older API clients may omit them without clearing saved values. Local photo uploads are limited to ten JPEG, PNG or WebP images, up to 8 MiB each; the optional Blob path uses the configured limits (at most 20 images and 10 MiB each). Sellers can choose the main image, reorder or remove photos before saving. Form changes are not autosaved.

New listing photos and avatars are validated and converted to WebP with Sharp. Animated, corrupt and over-40-megapixel images are rejected; original local files remain readable. Processing is limited to two images per Node process, with a 503 response when busy. Vercel Blob uploads are available behind disabled-by-default flags but have not yet been verified against real Blob stores; see [image processing](docs/IMAGE_PROCESSING.md), [Blob setup](docs/BLOB_SETUP.md) and [image migration](docs/IMAGE_MIGRATION.md).

Favorites are stored per account in PostgreSQL and available after signing in on any device. Guests are asked to sign in to save cars. Only ACTIVE listings appear in favorites; a saved listing that becomes unavailable remains stored and reappears if it becomes active again. Conversations and messages are stored in PostgreSQL and accessible only to their participants.

The browser records a view whenever a public ACTIVE listing detail page is opened; reloads and the seller's own visits also count, so views are not unique visitors. The counter is visible on the listing and in My Listings. Server-side rendering, API reads and link prefetching do not record views. Daily view history is not recorded.

With the current schema (or after applying migration 006 to an older database), users can see persistent notifications at `/account/notifications` and through the header bell. Listing and sale moderation decisions and new messages create notifications in the same transaction as the action. Reading messages also marks their corresponding message notifications as read; notifications can also be opened or marked all read. The badge refreshes every 15 seconds while the site is open. Notifications are generated for new events only; historical events are not backfilled. On existing databases, deploy the migration before the new application code: message delivery and moderation require the table and fail rather than lose notifications if it is missing.

## Admin console

The responsive admin console is available at `/admin`. The `users.role` column already supports `ADMIN`; sign in with an account whose role has been assigned by a trusted database operator. For example:

```sql
UPDATE users
SET role = 'ADMIN'
WHERE LOWER(email) = LOWER('admin@example.com')
  AND deleted_at IS NULL;
```

The page middleware redirects unauthenticated visitors to sign-in and regular users to the homepage. Every admin API independently validates the active HttpOnly session and reads the role from PostgreSQL; client-provided roles are not trusted. Admin actions use parameterized SQL, validate listing status transitions, and write audit records in the same transaction. Suspending an account revokes its active sessions and prevents new sign-ins. Role changes are intentionally not exposed in the console.

Admin listings, moderation, user status, dealer verification, audit history and sale confirmation are included in the current `server/db.sql`. Older databases require migrations 004 and 005, in order; no migration is run automatically. Migration 005 marks pre-existing SOLD listings as confirmed and does not remove or recreate any data. The Settings page is informational because this backend currently has no persistent marketplace-settings API.

Dashboard analytics use existing listing, user and audit records. Daily car views are unavailable because view events are not stored by date. An unverified dealer is not necessarily awaiting review, so no verification alert is inferred solely from that flag. Health checks require an active administrator session and disclose no connection settings.

On `/account/listings`, a seller can report an ACTIVE listing as sold. The listing is hidden from the public catalog and enters the separate “Sales awaiting confirmation” queue on `/admin/moderation`. An administrator can confirm the sale or reject it with a reason; rejection returns the listing to ACTIVE. Both decisions are role-checked on the server and written to the audit log in the same transaction. The admin Users tab reads and updates users through PostgreSQL-backed admin APIs.

## Listing integration test

After building, install the Playwright browsers with `npx playwright install chromium firefox webkit`, set `PG_BIN` to the directory containing PostgreSQL command-line tools, and run `npm run test:integration`. The test creates a password-protected temporary PostgreSQL cluster and separate databases, checks the consolidated schema and demo seed including its repeat-run guard, starts a local production server, runs API, browser and axe accessibility checks, and removes the temporary cluster afterward. It never uses the configured `DATABASE_URL`.

On Windows, for example:

```powershell
cd E:\Projects\eurocars\frontend
npm run build
npx playwright install chromium firefox webkit
$env:PG_BIN = 'D:\Programs\Postgresql\bin'
npm run test:integration
```

Replace `PG_BIN` with the local PostgreSQL `bin` directory if different. It must contain `initdb.exe`, `pg_ctl.exe`, `createdb.exe`, and `psql.exe`. The integration test also needs OpenSSL on PATH (or set `OPENSSL_BIN` to its executable); on Windows it can use the copy bundled with Git. It generates a temporary certificate and uses a loopback-only HTTPS proxy for browser tests. The test uses the existing `.output` build, so rebuild after changing application code. If a development server is running, build in a separate project copy to avoid interfering with it.

Run the standalone authentication unit tests with `npm run test:unit`. To run only browser checks, set `E2E_BASE_URL` to an isolated local test server and run `npm run test:e2e`; the tests require the BMW and 3 Series lookup entries. Mutation tests are skipped unless `E2E_ALLOW_MUTATIONS=1`; the seller/moderation scenario also needs the disposable administrator account created by the integration test. Do not point browser tests at a real database.

Run `npm run lint` for the Nuxt ESLint checks; existing formatting warnings remain. Optional local performance measurements can be collected during the integration test by setting `LIGHTHOUSE_REPORT_DIR` to a directory without `home.json` or `catalog.json`, and `LOAD_REPORT_PATH` to a new file path. The test refuses to overwrite these reports. These short synthetic measurements do not establish production performance.

`npm run test:coverage` reports Node's built-in line, branch and function coverage for files loaded by the authentication unit tests only; it is not overall application or API coverage.

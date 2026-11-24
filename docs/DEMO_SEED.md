# Demo marketplace seeder

The seeder is a manual local Node.js command, not an API and not part of a
Vercel build or deployment. It creates fictional data in the selected database;
40 listings are immediately public. Do not run it against a live marketplace
unless this is intended. Back up the target first and rehearse on an isolated
database and separate Blob stores. **The seeder and real Blob integration have
not been tested end to end.**

## Requirements and targets

- Node.js 24 and the existing project dependencies.
- PostgreSQL with the current EuroCars schema, including image migrations
  007–009. Inspect which migrations are already applied before changing an
  existing database; do not run `db.sql` on an initialized database.
- PostgreSQL privileges to create the seeder's `eurocars_demo_seed_registry`
  table and to read and insert the relevant EuroCars tables. Cleanup also needs
  delete privileges. The registry tracks only records created by this seeder.
- In the local `frontend/.env`, set `NUXT_DATABASE_URL_DEV` and/or
  `NUXT_DATABASE_URL_PROD`. These variables are **only** used by this seeder;
  the application itself uses `DATABASE_URL` or `NUXT_DATABASE_URL`.
- For photos, configure `BLOB_PRIVATE_READ_WRITE_TOKEN` and
  `BLOB_READ_WRITE_TOKEN` for separate private and public stores. The same
  token variables are used for both database targets: a local database does
  **not** imply local Blob storage. Use separate test tokens when rehearsing.
  Tokens must point to the same stores when resuming or cleaning up images.

The command displays the database host and name and the Blob store IDs, never
the passwords, query parameters or tokens. Before any remote database write or
Blob upload it requires an interactive `PRODUCTION` confirmation, even when
`--target=dev` points to a remote database. Cleanup additionally requires
`DELETE DEMO`. There is no non-interactive confirmation override. A dry run
connects to the target database and reads the registry but does not write to
PostgreSQL or Blob. Local database writes without Blob uploads also require
an interactive `WRITE` confirmation; treat local tunnels with the same care
as remote production connections.

Use the current Node environment to override `.env` values if necessary; Node's
`--env-file-if-exists` does not replace existing environment variables.
Never commit `.env` or paste credentials into chat or logs. Rotate any
credentials that have been exposed.

## Commands

Run in `frontend`:

```powershell
npm run seed:demo:dry
npm run seed:demo
npm run seed:demo:users
npm run seed:demo:cars
npm run seed:demo:images
npm run seed:demo:prod:dry -- --limit=5 --max-photos=10
npm run seed:demo:prod -- --limit=5 --max-photos=10
npm run seed:demo:prod:images -- --limit=5 --max-photos=10
```

`--limit` selects the first 1–50 vehicles. `--max-photos` limits the number of
manifest entries processed in one run (1–250); `--photo-offset=10` starts at
the eleventh selected entry, allowing batches to progress. An image is attached
only once per listing and source content; changed files at a registered path
are rejected, not overwritten. Use a dry run with the same limits first.

`seed:demo:users` adds countries and demo users. `seed:demo:cars` also ensures
the demo users and dealers exist, then adds vehicles. The main command runs
those stages and then processes available images. Existing users and data are
never adopted as seed records. A reserved email or dealer-name collision
aborts instead of changing an existing account. A modified tracked seller or
dealer also causes a safe abort. Database changes for users, dealers and cars
are transactional. Cars already recorded in the registry are not overwritten.
Demo accounts have a random unknown password hashed with the application's
Argon2 mechanism and have the `USER` role.

The provided inventory defines 50 cars, 10 fictional sellers and 5 fictional
dealers. The intended full distribution is 40 `ACTIVE`, 5 `PENDING`,
3 `ARCHIVED` and 2 `SOLD`. `--limit` selects a prefix, so smaller batches do
not have that distribution. All descriptions identify their car as a demo;
VINs and contact details are not generated. Drivetrain is included in the
description because the current schema has no drivetrain column. Vehicle
specifications and equipment are illustrative and should be reviewed before
displaying them publicly.

## Images and licences

The supplied manifest `scripts/seed/data/image-sources.json` is intentionally
empty: no photo licence, model match or attribution has been verified. The
report lists cars with fewer than three manifest photos. Do not use the
existing files in `public/images/seed-images` without independently checking
their origin and rights.

Place suitable JPEG, PNG or WebP files under `frontend/seed-images` and add
entries to the manifest in the desired photo order. Every entry needs a stable
vehicle key from `vehicles.json`, a relative file path, source URL, author,
licence name and licence URL. For example, replace **all** placeholders below
with real, checked information:

```json
[
  {
    "vehicleKey": "bmw-m3-competition",
    "file": "bmw-m3-competition/front.jpg",
    "sourceUrl": "https://example.com/replace-with-real-source",
    "author": "Replace with the actual author",
    "license": "Replace with the actual licence",
    "licenseUrl": "https://example.com/replace-with-real-licence"
  }
]
```

The manifest is not a licence verification service: confirm the car, model,
photographer, terms, attribution and permission to publish each image
yourself. It does not download images. At most five photos are accepted per
car; fewer than three are reported as missing. Manifest attribution is stored
in the demo registry, not automatically displayed in the public interface;
ensure any licence's public attribution requirements are met separately.

The existing Sharp service strips metadata, preserves aspect ratio and produces
thumbnail, catalog and gallery WebP variants. Its normal environment settings
apply; defaults include 1920px maximum width and gallery quality 82. The
seeder prints input and processed sizes before any upload, plus a conservative
three-copy estimate (temporary private, permanent private and public). Actual
storage and traffic can differ; check Vercel usage and pricing. Originals are
not uploaded.

Photos are first staged in the private store using the existing image service.
Only `ACTIVE` cars are copied to the public store; other statuses stay private.
Existing image sync/cleanup queues handle interrupted work and retries. A
failed or pending image is reported with a nonzero exit status; retry the same
batch after the queue backoff. If the process stops after staging but before
attaching an image, the temporary object's existing cleanup jobs remain.
Configure the project's trusted queue worker as described in `BLOB_SETUP.md`;
Vercel functions do not run a permanent worker automatically.

## Cleanup

First review the dry run:

```powershell
npm run seed:demo:cleanup
node --env-file-if-exists=.env scripts\seed\index.ts --target=prod --phase=cleanup
```

To delete eligible tracked data, run one of these and follow the prompts:

```powershell
npm run seed:demo:cleanup -- --apply
node --env-file-if-exists=.env scripts\seed\index.ts --target=prod --phase=cleanup --apply
```

Cleanup only considers tracked IDs. It skips changed records, cars with
untracked photos or external references such as favourites, conversations,
notifications or audit entries, and users/dealers still referenced by other
records. Shared countries, brands, models and features are deliberately kept.
`--limit` bounds the number of registered cars considered for cleanup; it
does not limit how many now-unreferenced demo users or dealers are considered.
Photo paths are queued for the existing safety-checking cleanup workers rather
than deleted synchronously; queued objects can remain until those workers run.
Failed or orphaned upload sessions may also delay deletion of their demo user.
Rerun the dry run and cleanup after pending work has been handled. Do not use a
global cleanup worker without reviewing its own dry run: it may include
non-demo jobs. Never clear the registry manually to force deletion.

## Report

The report includes created or planned users, dealerships, vehicles and
images; skipped records; failed images; input and optimized bytes; an estimated
uploaded/storage size; the optimized-to-original ratio; missing image counts;
and errors. These byte totals describe the current batch, not a live total of
all Blob usage. Dry-run record counts are upper bounds, not a guarantee of
what would be newly inserted. Errors do not include connection strings or
tokens; a nonzero exit code means the run did not fully complete.

To check the vehicle insert and status fields without running the seeder or
connecting to a configured database, set `PG_BIN` to the PostgreSQL tools
directory and run `python tests\demo-vehicle-sql.integration.py`. The test
creates and removes its own temporary PostgreSQL cluster.

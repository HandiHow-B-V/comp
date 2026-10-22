# Comp AI on Hetzner

This stack records the HandiHow self-hosting customizations. It runs the app,
NestJS API, PostgreSQL 18 and Caddy. Caddy serves HTTPS; database and application
ports are only reachable inside the Docker network.

The employee/trust portal is deployed separately. Set PORTAL_URL to that
deployment; this Compose file does not start a portal service.

## Configuration

Copy .env.example to .env in this directory and fill the empty values. The
.gitignore and root .dockerignore exclude runtime credentials and backups.

Set APP_DOMAIN/API_DOMAIN and APP_URL/API_URL consistently. For the existing
HandiHow deployment these are comp.handihow.nl and api.comp.handihow.nl.

Before a first installation generate independent random values for
POSTGRES_PASSWORD, AUTH_SECRET, SECRET_KEY, BETTER_AUTH_SECRET,
REVALIDATION_SECRET, ENCRYPTION_KEY and the service tokens, for example:

    openssl rand -hex 32

Keep all existing values on an upgrade. Changing the encryption key breaks
access to stored integration credentials; changing auth secrets invalidates
sessions. Never commit .env, database dumps or resolved Compose output.

Brevo takes precedence when `BREVO_API_KEY` is set. Configure verified
`BREVO_FROM_*` sender addresses. Without that key, existing Resend settings
remain supported. EMAIL_DELIVERY_MODE=direct avoids a Trigger worker for login
and invitation emails; set trigger explicitly only for a working Trigger
deployment. Test recipient overrides must remain empty for live delivery.

APP_AWS_ENDPOINT supports S3-compatible storage such as Hetzner. Set its
credentials, region and all required bucket names. URLs are only accepted for
the configured endpoint or supported AWS S3 hosts.

PRISMA_DISABLE_TLS=1 is set by Compose for its private, local PostgreSQL service.
Do not use that opt-out for an external database. Remote connections retain
verified TLS by default. Missing MACED_API_KEY disables optional penetration
testing rather than preventing the compliance API from starting.

## Build and validate

Run the project typecheck, relevant tests and lint before building:

    bun run typecheck
    bun run lint
    python3 deploy/hetzner/test_deployment.py

The deployment tests run Docker Compose config with fake fixture values. They
do not start containers, connect to production or perform database migrations.
They are skipped when the Docker CLI/Compose plugin is unavailable.

Build services sequentially on a small host:

    cd deploy/hetzner
    docker compose build api
    docker compose build app
    docker compose --profile migrate build migrator

The webapp memory budget defaults to 3072 MB here, matching the small Hetzner
host. SKIP_NEXT_TYPECHECK=true avoids repeating the already successful,
separate typecheck inside that memory-limited build. Set it to false to also
check types inside Next.js. Generic Dockerfile builds retain strict checking
unless this flag is explicitly set.

The migrator uses this checkout's Prisma schema, migrations and dependency
installation from the API builder, rather than a separate published DB package.

## First start

Fill configuration and build images first. Then start the database, apply
migrations and start the application:

    docker compose up -d postgres
    docker compose --profile migrate run --rm migrator
    docker compose up -d api app caddy

Caddy obtains certificates automatically when DNS resolves to this server and
ports 80/443 are reachable. PostgreSQL data persists under the PostgreSQL 18
volume layout. An older PostgreSQL major requires an explicit migration plan;
do not point its existing data directory at PostgreSQL 18.

## Existing production installation

Recording this source does not deploy or modify the running server. The
2026-10-20 release was built separately with the retained runtime overlay.
On that server, /opt/handihow/ACTIVE-COMP-RELEASE.json identifies the active
source directory; the production Compose file points to that pinned release.

For a future release, use a clean checkout at the reviewed commit. Preserve
the existing .env, volume names and Compose project name comp-ai. Set
COMP_IMAGE_TAG to a unique release tag before building. Record the previous
image IDs and keep those images for rollback.

Before any database changes, write a database dump outside the checkout and
verify a representative restore in an isolated database:

    docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > /secure-backups/comp-before.dump

Create the protected backup directory first. Its permissions and retention
belong to host administration. This source repository contains no production
dump or credentials.

After any required migrations, replace API and app sequentially and wait for
health checks. Do not recreate PostgreSQL or Caddy during an application-only
update:

    docker compose up -d --no-deps --no-build api
    docker compose ps
    docker compose up -d --no-deps --no-build app
    docker compose ps

If application checks fail without a schema change, select the previously
recorded image tags and recreate API/app with --no-build. Do not restore the
old database dump over concurrent user writes just to roll back application
images. A schema-changing release needs its own recovery plan.

Verify public HTTPS health, the retained session and permissions, policy
content, documents, integrations and an evidence upload/download roundtrip.
Record image IDs, test outputs and evidence checksums in Comp. A successful
deployment does not close unrelated compliance findings.

## Source changes beyond the running overlay

The preserved behavior has focused regression tests. Provider code is shared
between the email package and API. Brevo keeps already-base64 attachments intact
instead of encoding queued attachments twice. Framework access uses the normal
framework:create permission instead of a global platform-admin requirement.
These corrections are recorded for review and are not deployed automatically.

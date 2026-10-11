# Database safety, staging, and migration

Voxera supports SQLite for local development and PostgreSQL for hosted use. The live service is already configured to use Neon PostgreSQL; do not run the SQLite import tool against the live database or cut traffic over to another database as part of routine schema changes.

## Free-plan facts checked 11 October 2026

- Neon's Free plan is permanent, requires no credit card, and currently includes 1 GB storage per project, 100 compute-hours per project, scale-to-zero after five minutes, 5 GB public network transfer, up to 10 branches per project, and one manual snapshot. Scheduled snapshots and instant restore are paid features. See [Neon pricing](https://neon.com/pricing).
- Neon branches are isolated copy-on-write database branches. A branch is appropriate for staging, but it is not a substitute for an encrypted off-provider backup. See [Neon branching](https://neon.com/docs/introduction/branching).
- Cloudflare R2 currently includes 10 GB-month of Standard storage, 1 million Class A operations, and 10 million Class B operations monthly, with no egress charge. R2 setup requires completing a subscription checkout; the official setup page does not establish whether a payment card is required, so do not activate R2 until that requirement is checked in the account. See [R2 pricing](https://developers.cloudflare.com/r2/pricing/) and [R2 setup](https://developers.cloudflare.com/r2/get-started/).
- Cloudflare Pages Free currently allows 500 builds/month, a 20-minute build timeout, 20,000 files per site, and 25 MiB per asset. Pages Functions count against Workers quotas. See [Pages limits](https://developers.cloudflare.com/pages/platform/limits/).
- Render Free web services spin down after 15 minutes without inbound activity, take about one minute to wake, lose local filesystem changes on restart/redeploy/spin-down, and receive 750 free instance-hours/month. Render Free Postgres expires after 30 days, then is deleted after a 14-day grace period. Render also blocks outbound SMTP ports 25, 465, and 587 on free web services. See [Render free instances](https://render.com/docs/free).
- Brevo's current Free plan allows 300 email sends/day and up to 100,000 stored contacts. Its public pricing information does not confirm whether a payment card is required at sign-up. Its SMTP service cannot be used from a Render Free service over the standard SMTP ports because Render blocks those ports; use an HTTPS email API integration if email becomes necessary on this host. See [Brevo Free-plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan).

These values can change. Recheck provider terms and account requirements before enabling any integration. Nothing in this repository creates a provider account, changes production credentials, or starts a database migration.

## Nightly encrypted backups

`.github/workflows/nightly-database-backup.yml` runs nightly and can also be started manually. It performs a PostgreSQL custom-format dump, encrypts it locally using OpenSSL AES-256-CBC with PBKDF2, uploads only the encrypted object to a private S3-compatible bucket, and removes backups older than 14 days.

Configure these GitHub repository secrets before enabling backups:

| Secret | Purpose |
| --- | --- |
| `VOXERA_DATABASE_URL` | Read access to the PostgreSQL database to back up |
| `VOXERA_BACKUP_ENDPOINT_URL` | S3-compatible endpoint; no bucket path |
| `VOXERA_BACKUP_BUCKET` | Dedicated private bucket for backups |
| `VOXERA_BACKUP_REGION` | Provider's signing region (`auto` for R2, provider-specific for B2) |
| `VOXERA_BACKUP_ACCESS_KEY_ID` | Least-privilege key scoped to the backup bucket |
| `VOXERA_BACKUP_SECRET_ACCESS_KEY` | Secret for that scoped key |
| `VOXERA_BACKUP_ENCRYPTION_KEY` | High-entropy encryption passphrase; store it separately from the bucket and keep a protected offline recovery copy |

If any secret is absent, the workflow reports that setup is incomplete and exits without connecting to a service. Do not use a public bucket. Keep the encryption passphrase in a separate protected location: losing it makes backups unrecoverable. Test a restore to an isolated staging database before relying on a backup. The workflow never commits credentials or database contents.

## Staging and restore procedure

1. Create a Neon staging branch in the Neon dashboard. Do not point staging at production.
2. Obtain the latest encrypted backup from the private backup bucket and decrypt it only into a protected temporary directory. Restrict access to the decryption key and delete the temporary plaintext after a successful restore.
3. Create a fresh staging database and restore using `pg_restore --no-owner --no-acl --clean --if-exists`. Never use `--clean` against production.
4. Point a staging deployment at the staging branch and run backend tests plus manual smoke checks for accounts, programmes, messaging, reports, media, and certificate verification.
5. For SQLite-to-PostgreSQL imports, first make a separate source-file backup, create a fresh empty target, and use `scripts/migrate_sqlite_to_postgres.py`. The importer refuses a populated target and reports missing target columns.
6. For hosted schema changes, keep migrations additive (new tables or nullable/defaulted columns). Take and verify an encrypted backup before the change. Avoid column drops/renames and destructive SQL.

## Rollback

Do not overwrite a production database to roll back code. Roll back the application deployment first if the change is code-only. If data/schema changes must be reversed, stop writes, preserve the current database, restore a verified backup into a separate database, validate it, and only then change `VOXERA_DATABASE_URL` through the deployment dashboard. Preserve the old endpoint until the restored service is confirmed healthy. A database URL change requires an operator to coordinate the maintenance window and verify the service; this repository does not perform that operation automatically.

# Back up Financy

> Also on the website: [financy.dev/docs/backups](https://financy.dev/docs/backups).

Turn on the daily backup of a self-hosted Financy, check that it runs, and rehearse a restore once,
before you need one.

**You need** a server set up as [Self-host Financy](self-host.md) says, and a bucket at an
S3-compatible storage provider that is not that server.

Seed, the starter Financy is built on, explains the backup in depth in [Backups](../backups.md) and
the restore in [Restore from a backup](../restore.md).

## What is saved

Every 24 hours, a `backup` container saves the database (every household's records), the web push
keys and the file store into an encrypted [restic](https://restic.net) repository in your bucket.
Your env file is not saved: keep your own copy, as [Self-host Financy](self-host.md) says.

## Turn it on

1. Create a bucket for Financy's backups, and a key that may read, write and delete in that bucket
   only. Turn on the bucket's versioning or object lock if the provider has it, so whoever takes the
   server cannot delete the backups too.
2. In `infra/envs/.env.prod`, add `backup` to `COMPOSE_PROFILES` (`files,backup`) and set:

   | Variable                              | Value                                                  |
   | ------------------------------------- | ------------------------------------------------------ |
   | `BACKUP_RESTIC_REPOSITORY`            | `s3:https://s3.example.com/financy-backups`, your own. |
   | `BACKUP_RESTIC_PASSWORD`              | A long random one: `openssl rand -hex 32`.             |
   | `S3_BUCKET_BACKUPS_ACCESS_KEY_ID`     | The bucket key's id.                                   |
   | `S3_BUCKET_BACKUPS_SECRET_ACCESS_KEY` | The bucket key's secret.                               |

3. Keep `BACKUP_RESTIC_PASSWORD` in your password manager. Without it no backup can be read.
4. Deploy from your computer:

   ```sh
   deno task deploy
   ```

## Check that it ran

On the server, in Financy's folder:

1. List the backups. The container makes the first one when it starts, right after the deploy. It
   holds the database and the web push keys; the file store joins from the first run after the
   store has made its first hourly copy:

   ```sh
   deno task compose run --rm backup restic snapshots
   ```

2. Read the last run. A good one ends with `Backup done.`:

   ```sh
   deno task compose logs backup
   ```

`docker ps` shows the `backup` container as unhealthy when the last complete backup is more than two
days old. [When the backup is unhealthy](../backups.md#when-the-backup-is-unhealthy) explains each
message the log may show.

## Rehearse a restore

Restore the newest backup into a spare database once, so you know it can be read. Nothing touches
your household's live records. Follow [Rehearse a restore](../restore.md#rehearse-a-restore), with
`<db>` the `DB_NAME` of your env file.

Right after an upgrade, back up first with `deno task compose run --rm backup once`. The deploy
does not restart the backup, so the newest backup can be older than the upgrade's migrations, and
its tables then do not match the live list.

When you need a real restore, on the same server or a new one, follow
[Restore from a backup](../restore.md). In its first step, stop `pgbouncer` too: while it runs, it
holds the database open, and the rename in the second step fails with "being accessed by other
users".

## Next

- [Upgrade Financy](upgrade.md)

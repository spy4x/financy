# Upgrade Financy

> Also on the website: [financy.dev/docs/upgrade](https://financy.dev/docs/upgrade).

Move a self-hosted Financy to a newer release, keeping the household's records. Run every command on
your computer, in the repository you deployed from, unless it says the server.

**You need** a server set up as [Self-host Financy](self-host.md) says, with
[backups](backups.md) on.

## Upgrade

1. Read what changed since your release, at [financy.dev/changelog](https://financy.dev/changelog).
2. Back up now, on the server, in Financy's folder, and wait for the line `Backup done.`:

   ```sh
   deno task compose run --rm backup once
   ```

3. Fetch the releases and check out the new one. `git tag --sort=-v:refname` lists them, newest
   first:

   ```sh
   git fetch --tags
   git switch --detach v0.2.0
   ```

4. Compare your env file with the example, and add any variable the new release needs:

   ```sh
   git diff v0.1.0 v0.2.0 -- infra/envs/.env.example
   ```

5. Deploy:

   ```sh
   deno task deploy
   ```

6. Check that Financy answers. It must print `"status":"ok"` and `200`:

   ```sh
   curl -sS -w '\n%{http_code}\n' https://money.example.com/api/health
   ```

   For up to a minute after the deploy it can answer `404 page not found`, until the new API passes
   its health check; try again.

Use your own release tags in place of `v0.1.0` and `v0.2.0`.

## What the deploy does to your data

Every deploy applies the new release's database migrations before the API and the worker start. A
failed migration fails the deploy, and the new release's API and worker do not start. On the
server, `deno task compose logs migrate` shows what it did.

The deploy also refuses an env file in which a secret is empty or still the example's value, and
names each one.

## When something goes wrong

Going back to the old release does not undo a migration. When the new release fails after its
migrations ran, restore the backup from step 2 as [Restore from a backup](../restore.md#restore)
says, then deploy the old tag. In the restore's first step, stop `pgbouncer` too: while it runs,
it holds the database open, and the rename in the second step fails with "being accessed by other
users". [Deploy an update](../deploy-updates.md) has the details of every deploy and of rolling
back.

## Next

- [Backups](backups.md)

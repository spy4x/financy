# Self-host Financy

> Also on the website: [financy.dev/docs/self-host](https://financy.dev/docs/self-host).

Run Financy for your household on a server you rent or own, from a fresh server to everyone signed
in. Self-hosting is free under the AGPL-3.0 licence; you pay only for the server.

How long a fresh install takes is being measured on a new server, and this guide will say once it
is.

**You need:**

- An Ubuntu server you can reach over SSH as root, and a domain whose DNS you control.
- Your own computer with [Deno](https://deno.com), rsync and git. The deploy runs from there and
  builds the images on the server.

The examples use `deploy@192.0.2.10` for the server and `money.example.com` for Financy's address.

Seed, the starter Financy is built on, explains every step in more depth in
[Deploy to a server](../deploy.md). This guide is the short path for a household.

## 1. Prepare the server

Follow [Deploy to a server](../deploy.md#the-server), "The server" and "The firewall": a `deploy`
user with uid 1000, SSH keys only, Docker with Compose, rsync, unzip and Deno, and only ports 22,
80 and 443 open.

## 2. Point a host name at it

Create an `A` record, and an `AAAA` record for IPv6, for `money.example.com` pointing at the
server. You need no other host: the household's app, its API and its files all answer there. Check
it before you go on:

```sh
dig +short money.example.com
```

## 3. Get Financy

On your computer, clone the repository and check out the newest release:

```sh
git clone https://github.com/spy4x/financy.git && cd financy
git tag --sort=-v:refname
git switch --detach v0.1.0
```

Use the first tag the second command prints in place of `v0.1.0`.

## 4. Write the env file

1. Copy the example. The copy stays on your computer; git ignores it:

   ```sh
   cp infra/envs/.env.example infra/envs/.env.prod
   ```

2. Set these values:

   | Variable                | Value                                                   |
   | ----------------------- | ------------------------------------------------------- |
   | `ENV`                   | `prod`                                                  |
   | `PROJECT`               | `financy`                                               |
   | `DOMAIN`                | `money.example.com`                                     |
   | `ADMIN_DOMAIN`          | Empty, unless you want the admin panel.                 |
   | `TRAEFIK_ACME_EMAIL`    | Your address, for certificate notices.                  |
   | `SSH_TO_SERVER`         | `deploy@192.0.2.10`                                     |
   | `PATH_ON_SERVER`        | `financy`, a folder in the deploy user's home.          |
   | `PROXY_HTTPS_HOST_PORT` | `443`                                                   |
   | `PROXY_HTTP_HOST_PORT`  | `80`                                                    |
   | `COMPOSE_PROFILES`      | `files`                                                 |
   | `TIMEZONE`              | Your IANA time zone, such as `Europe/Berlin`.           |
   | `SMTP_*`                | All five: your mail provider's SMTP account.            |

3. Give every secret a value of its own, as the secrets table in
   [The env file](../deploy.md#the-env-file) says. The deploy refuses a secret left as in the
   example, and names it.
4. Mail is required: Financy emails a code to everyone who signs up, signs in by emailed code or
   resets a password. Without the five `SMTP_*` values that code never arrives, so nobody can make an
   account.
5. Keep a copy of `infra/envs/.env.prod` in your password manager. It holds the only copy of the
   secrets and the key of the file store, and no backup saves it.

What a household leaves out:

- **Billing.** Leave `BILLING_PROVIDER` empty. Billing is then off and every household on your
  server has every feature, with no limits.
- **The website.** Leave `mpa` out of `COMPOSE_PROFILES` and `MPA_DOMAIN` empty. The website is
  financy.dev's marketing site; your household does not need it.
- **The admin panel** is optional. To have it, add `admin` to `COMPOSE_PROFILES`, set
  `ADMIN_DOMAIN` to a second host with its own DNS record, and after the deploy make yourself its
  administrator as [Give operators access](../operator-access.md#the-first-operator) says.
- **Monitoring** is optional too: add `monitoring` to `COMPOSE_PROFILES` for Grafana, metrics and
  logs on the server.

Exchange rates work with no setting: [Exchange rates](exchange-rates.md) says where they come from
and what a key adds.

## 5. Deploy

1. Create Financy's folder on the server:

   ```sh
   ssh deploy@192.0.2.10 mkdir -p financy
   ```

2. Deploy from your computer, in the repository:

   ```sh
   deno task deploy
   ```

3. Start the proxy that answers HTTPS, once per server:

   ```sh
   ssh deploy@192.0.2.10
   cd financy && deno task proxy:start
   ```

4. Check that Financy answers. It must print `"status":"ok"` and `200`:

   ```sh
   curl -sS -w '\n%{http_code}\n' https://money.example.com/api/health
   ```

When it does not, [Check it](../deploy.md#check-it) and
[HTTPS certificates](../certificates.md) say what to look at.

## 6. Sign up, and bring in your household

Anyone who reaches `money.example.com` can make an account until you close sign-up. So do this
right after the deploy:

1. Open `https://money.example.com`, sign up, and create a group for your household.
2. In the group, choose **Invite** for each member and send them the invitation link. They open
   it, sign up and join the group.
3. Once everyone has an account, close sign-up. Add this line to `infra/envs/.env.prod` and deploy
   again:

   ```sh
   SIGN_UP=invite
   ```

   ```sh
   deno task deploy
   ```

People with an account keep signing in as before.

For now, `SIGN_UP=invite` closes sign-up to everyone, an invitation included, because the sign-up
screens cannot carry one yet ([seed#913](https://github.com/spy4x/seed/issues/913)). To add a
member later, remove the line, deploy, let them sign up from your invitation, then put it back and
deploy again.

## 7. Turn on backups

Your household's records live only on this server until you do: [Backups](backups.md).

## Next

- [Backups](backups.md)
- [Upgrade Financy](upgrade.md)

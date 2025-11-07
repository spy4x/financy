# Woodpecker CI Setup Guide

## Overview

This guide explains how to configure Woodpecker CI for the Financy project. The CI pipeline performs three main tasks:

1. **Code Quality Checks** - Runs linting, formatting, TypeScript checks, and tests
2. **Docker Build** - Builds production Docker images
3. **Deploy** - Deploys the application to the production server

## Pipeline Flow

```
┌─────────┐
│  Push   │
│  to     │──────┐
│  main   │      │
└─────────┘      │
                 ▼
         ┌───────────────┐
         │  Code Quality │
         │    Checks     │
         └───────┬───────┘
                 │ ✓ Pass
                 ▼
         ┌───────────────┐
         │  Build Docker │
         │    Images     │
         └───────┬───────┘
                 │ ✓ Pass
                 ▼
         ┌───────────────┐
         │   Deploy to   │
         │  Production   │
         └───────────────┘
```

## Required Secrets

Configure these secrets in your Woodpecker CI repository settings:

### Database Configuration
- `DB_HOST` - PostgreSQL host (e.g., `db` or IP address)
- `DB_PORT` - PostgreSQL port (default: `5432`)
- `DB_NAME` - Database name (e.g., `financy`)
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password

### Redis/Valkey Configuration
- `KV_HOSTNAME` - Redis/Valkey host (e.g., `valkey` or IP address)
- `KV_PORT` - Redis/Valkey port (default: `6379`)

### Application Configuration
- `API_PORT` - API server port (e.g., `8000`)
- `WEB_PORT` - Web application port (e.g., `3000`)
- `DOMAIN` - Production domain (e.g., `financy.example.com`)
- `TRAEFIK_ACME_EMAIL` - Email for Let's Encrypt certificates

### Deployment Configuration
- `SSH_TO_SERVER` - SSH connection string (e.g., `user@server.example.com`)
- `PATH_ON_SERVER` - Deployment path on server (e.g., `/opt/financy`)
- `ssh_private_key` - SSH private key for deployment (as a secret)

## Setting Up Secrets in Woodpecker

### Via Web UI

1. Navigate to your repository in Woodpecker CI
2. Go to **Settings** → **Secrets**
3. Add each secret with the following configuration:
   - **Name**: Use the exact names listed above (case-sensitive)
   - **Value**: Enter the corresponding value
   - **Events**: Select `push` for deployment secrets, `push` and `pull_request` for others
   - **Images**: Leave empty or specify `denoland/deno:*` for security

### Via CLI

```bash
# Database secrets
woodpecker-cli secret add \
  --repository your-org/financy \
  --name DB_HOST \
  --value "your-db-host"

woodpecker-cli secret add \
  --repository your-org/financy \
  --name DB_PASSWORD \
  --value "your-secure-password"

# SSH deployment key
woodpecker-cli secret add \
  --repository your-org/financy \
  --name ssh_private_key \
  --value @~/.ssh/deploy_key
```

## SSH Key Setup

### Generate Deployment SSH Key

```bash
# Generate a new SSH key pair for deployment
ssh-keygen -t ed25519 -C "woodpecker-ci-deploy" -f ~/.ssh/financy_deploy

# Copy the public key to your server
ssh-copy-id -i ~/.ssh/financy_deploy.pub user@server.example.com
```

### Add Private Key to Woodpecker

```bash
# Add the private key as a secret
woodpecker-cli secret add \
  --repository your-org/financy \
  --name ssh_private_key \
  --value @~/.ssh/financy_deploy
```

Or via the Web UI:
1. Copy the entire contents of `~/.ssh/financy_deploy`
2. Add as a secret named `ssh_private_key`
3. Ensure it's only available for `push` events on `main` branch

## Pipeline Behavior

### On Pull Request
- Runs code quality checks only
- No build or deployment

### On Push to Main Branch
1. Runs code quality checks
2. If checks pass, builds Docker images
3. If build succeeds, deploys to production

### On Push to Other Branches
- Runs code quality checks only
- No build or deployment

## Customization

### Modify Deno Version

Edit the `deno_version` variable in `.woodpecker.yml`:

```yaml
variables:
  - &deno_version '2.1.4'  # Change to desired version
```

### Add Environment-Specific Deployments

To add staging deployment:

```yaml
deploy-staging:
  image: denoland/deno:${deno_version}
  environment:
    - SSH_TO_SERVER=${SSH_TO_SERVER_STAGING}
    - PATH_ON_SERVER=${PATH_ON_SERVER_STAGING}
  commands:
    # ... similar to production deploy
  when:
    - event: push
      branch: develop
  depends_on:
    - build
```

### Enable Test Database

Uncomment the services section in `.woodpecker.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=financy_test
      - POSTGRES_USER=test
      - POSTGRES_PASSWORD=test
    when:
      - event: pull_request
```

## Troubleshooting

### Build Fails on Docker Commands

**Issue**: Permission denied when accessing Docker socket

**Solution**: Ensure Woodpecker agent has Docker socket access:
```bash
# On Woodpecker agent host
chmod 666 /var/run/docker.sock
```

Or configure agent to run privileged containers.

### Deployment Fails with SSH Error

**Issue**: Host key verification failed

**Solution**: 
1. Ensure `ssh-keyscan` command in pipeline includes correct hostname
2. Verify SSH private key is properly formatted (includes `-----BEGIN` and `-----END` lines)

### Environment Variables Not Available

**Issue**: Secrets not accessible in pipeline

**Solution**:
1. Check secret names match exactly (case-sensitive)
2. Verify secret events include the trigger event (push/pull_request)
3. Check image filters if specified

## Security Best Practices

1. **Never commit secrets** - Always use Woodpecker secrets
2. **Use SSH keys** - Don't use password authentication for deployment
3. **Restrict secret access** - Limit secrets to specific events and branches
4. **Rotate keys regularly** - Update SSH keys and passwords periodically
5. **Monitor deployments** - Review deployment logs for suspicious activity

## Local Testing

Test the pipeline steps locally:

```bash
# Run checks
deno task check

# Build with production config
deno task compose --env-file=./infra/envs/.env.prod build

# Test deployment (dry run)
rsync -avhzru --dry-run -e ssh . user@server:/path \
  --exclude-from=infra/deploy/exclude.txt \
  --include-from=infra/deploy/include.txt \
  --include-from=infra/deploy/include.prod.txt \
  --exclude "*"
```

## Additional Resources

- [Woodpecker CI Documentation](https://woodpecker-ci.org/docs)
- [Woodpecker Secrets](https://woodpecker-ci.org/docs/usage/secrets)
- [Docker Compose in CI](https://woodpecker-ci.org/docs/usage/services)

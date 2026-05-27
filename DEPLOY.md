# Deploying ModUpdater on Dokploy

This guide walks through deploying ModUpdater on a Dokploy VPS.

## Prerequisites

- A Dokploy instance running on your VPS
- A domain name pointed to your VPS (e.g., `modupdater.yourdomain.com`)
- A Discord bot token
- A Discord OAuth application

---

## 1. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**, name it (e.g., "ModUpdater")
3. Go to **Bot** tab:
   - Click **Add Bot**
   - Copy the **Token** (you'll need this for `DISCORD_BOT_TOKEN`)
   - Enable **Message Content Intent** if you want richer logging
4. Go to **OAuth2 > URL Generator**:
   - Select scopes: `bot`
   - Select permissions: `Send Messages`, `Attach Files`, `Embed Links`
   - Copy the generated URL and open it to invite the bot to your server

---

## 2. Create Discord OAuth App

1. In the same Discord application, go to **OAuth2 > General**
2. Add a redirect URL: `https://modupdater.yourdomain.com/api/auth/callback/discord`
3. Copy:
   - **Client ID** → `DISCORD_CLIENT_ID`
   - **Client Secret** → `DISCORD_CLIENT_SECRET`

---

## 3. Set Up PostgreSQL in Dokploy

1. In Dokploy, go to **Projects** → Create a new project (e.g., "ModUpdater")
2. Add a **Database** service:
   - Type: PostgreSQL
   - Name: `modupdater-db`
   - Set a strong password
3. Note the internal connection URL (usually something like):
   ```
   postgresql://postgres:yourpassword@modupdater-db:5432/postgres
   ```

---

## 4. Deploy the App

1. In the same project, add an **Application** service:
   - Name: `modupdater-app`
   - Source: Git repository (your ModUpdater repo)
   - Branch: `main`
   - Build type: Dockerfile
   - Dockerfile path: `Dockerfile` (the production Dockerfile is already included)

The included `Dockerfile` handles:
- Multi-stage build for smaller image
- Node.js 22, JDK 21, JDK 25
- Git with SSH support for private repos
- Automatic database schema sync on startup

---

## 5. Configure Environment Variables

In Dokploy, go to your app's **Environment** tab and add:

```env
# Database
DATABASE_URL=postgresql://postgres:yourpassword@modupdater-db:5432/postgres

# Auth
AUTH_SECRET=generate-a-random-32-char-string-here
AUTH_URL=https://modupdater.yourdomain.com

# Discord Bot
DISCORD_BOT_TOKEN=your-bot-token-here

# Discord OAuth
DISCORD_CLIENT_ID=your-client-id
DISCORD_CLIENT_SECRET=your-client-secret

# Paths (inside container)
REPOS_DIR=/app/data/repos
SSH_KEYS_DIR=/app/data/keys
LOG_DIR=/app/data/logs
ARTIFACTS_DIR=/app/data/artifacts

# App settings
BUILD_CONCURRENCY=2
DEBOUNCE_MS=60000
DEFAULT_POLLING_INTERVAL_MS=900000
DEFAULT_DISCORD_CHANNEL_ID=your-default-channel-id
BASE_URL=https://modupdater.yourdomain.com

# Gradle optimization
GRADLE_USER_HOME=/app/.gradle
GRADLE_OPTS=-Dorg.gradle.daemon=true -Dorg.gradle.parallel=true
```

Generate `AUTH_SECRET` with:
```bash
openssl rand -base64 32
```

---

## 6. Configure Volumes

In Dokploy, add persistent volumes to preserve data across deployments:

| Container Path | Purpose |
|----------------|---------|
| `/app/data` | Repos, SSH keys, logs, artifacts |
| `/app/.gradle` | Gradle cache (faster builds) |

---

## 7. Configure Domain & SSL

1. In Dokploy, go to your app's **Domains** tab
2. Add your domain: `modupdater.yourdomain.com`
3. Enable **HTTPS** (Dokploy handles Let's Encrypt automatically)

---

## 8. Deploy

1. Click **Deploy** in Dokploy
2. Wait for the build to complete
3. Check logs for any errors

---

## 9. Post-Deployment Setup

### Make yourself admin

1. Log in via Discord OAuth (this creates your user account)
2. SSH into your VPS and run:
   ```bash
   docker exec -it <postgres-container> psql -U postgres -c "UPDATE \"user\" SET role = 'admin' WHERE email = 'your-email@example.com';"
   ```
3. Log out and back in to refresh your session

### Verify health check

```bash
curl https://modupdater.yourdomain.com/api/health
```

Should return:
```json
{"status":"ok","db":"connected","dbLatencyMs":3,"timestamp":"..."}
```

---

## 10. GitHub Webhook Setup (per repo)

For repos using webhook-based detection:

1. In ModUpdater, copy the webhook URL from the repo edit page
2. In GitHub repo settings → Webhooks → Add webhook:
   - **Payload URL**: The copied URL
   - **Content type**: `application/json`
   - **Secret**: Generate one and add it to the repo in ModUpdater
   - **Events**: Just the `push` event

---

## Troubleshooting

### Build fails with Java errors
- Check that both JDK 21 and 25 are installed in the container
- Verify `JAVA_HOME_21` and `JAVA_HOME_25` are set correctly

### Discord bot not responding
- Verify `DISCORD_BOT_TOKEN` is correct
- Check the bot was invited to the server with correct permissions
- Check container logs for Discord errors

### OAuth redirect errors
- Verify `AUTH_URL` matches your domain exactly
- Verify the redirect URL in Discord OAuth settings matches

### Database connection errors
- Verify `DATABASE_URL` uses the internal Dokploy hostname
- Check PostgreSQL container is running

---

## Updating

To deploy updates:

1. Push changes to your repo
2. In Dokploy, click **Redeploy**

Or enable auto-deploy from your Git provider in Dokploy settings.

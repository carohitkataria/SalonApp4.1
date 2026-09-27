# Deploying SalonHub on your own server

Target setup (about $12/month):

```
  Browser ──HTTPS──▶  Caddy (web container)  ──/api, /socket.io──▶  backend container (FastAPI, 1 worker)
                      serves the React build                               │
                                                                           ▼
                                                             MongoDB Atlas (free M0, Mumbai)
```

- **Server:** AWS Lightsail, Mumbai, 2 GB, Ubuntu 24.04
- **`web` container:** Caddy. It serves the React app, forwards `/api/*` and `/socket.io/*` to the backend, and gets and renews HTTPS certificates automatically.
- **`backend` container:** `uvicorn server:app` with **exactly one worker**. The scheduled jobs and live Socket.IO updates run inside it, so never scale it out.

Files: `docker-compose.yml`, `backend/Dockerfile`, `deploy/web.Dockerfile`, `deploy/Caddyfile`,
`.env.example`, `backend/.env.example`, `frontend/.env.example`.

---

## Step 1: Google sign-in client (10 min)

1. Go to <https://console.cloud.google.com/> and create a project (for example "SalonHub"), or pick an existing one.
2. Open **APIs & Services → OAuth consent screen**:
   - User type **External**
   - App name "SalonHub", support email, and your domain `salonhub.in`
   - Scopes: `openid`, `email`, `profile`
   - **Publish app** (otherwise only test users can sign in)
3. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorised JavaScript origins: `https://salonhub.in`, `https://www.salonhub.in`
     (add `https://new.salonhub.in` too if you test on that first)
   - Authorised redirect URIs: `https://salonhub.in/auth/callback`
     (and `https://new.salonhub.in/auth/callback` for testing)
4. Copy the **Client ID** (`…apps.googleusercontent.com`). You don't need the client secret.

## Step 2: Gemini API key for menu parsing (2 min)

1. Go to <https://aistudio.google.com/apikey> and click **Create API key**.
2. Copy it. It becomes `GEMINI_API_KEY`. The default model is `gemini-2.5-flash`; set `GEMINI_MODEL` to change it.

## Step 3: Create the server (15 min)

1. In the AWS Console, open **Lightsail → Create instance**:
   - Region: **Mumbai (ap-south-1)**, the same AWS region as your Atlas cluster
   - Platform **Linux/Unix**, blueprint **OS Only → Ubuntu 24.04 LTS**
   - Plan: **2 GB RAM** (with public IPv4)
   - Name: `salonhub`
2. Open the instance → **Networking**:
   - **Create static IP** and attach it to `salonhub`. Note the IP.
   - IPv4 firewall: make sure **HTTP 80** and **HTTPS 443** are allowed (SSH 22 is there already).
3. Click **Connect using SSH** (the browser terminal) and run:

```bash
# 2 GB swap: the React build needs more memory than 2 GB alone
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
# Log out and back in (close and reopen the SSH window) so `docker` works without sudo.

# Automatic security updates
sudo apt-get install -y unattended-upgrades
```

## Step 4: Get the code onto the server (5 min)

The repo is private, so give the server a read-only **deploy key**:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

On GitHub, open the repo → **Settings → Deploy keys → Add deploy key**, paste the key, and leave "Allow write access" **off**. Then:

```bash
git clone git@github.com:carohitkataria/SalonApp4.1.git ~/salonhub
cd ~/salonhub
git checkout main        # or the branch you deploy from
```

## Step 5: Let the server reach MongoDB Atlas (3 min)

1. In **Atlas → Project 0 → Network Access → Add IP Address**, enter the Lightsail static IP.
2. In **Database Access**, use a database user with **readWrite** on your database and a strong password.
3. Go to **Clusters → SalonHub → Connect → Drivers** and copy the `mongodb+srv://…` string. Put the password in it.

## Step 6: Create the three `.env` files (10 min)

Start from the `.env` files you downloaded from Emergent.

```bash
cd ~/salonhub
cp .env.example .env                    # contains only DOMAIN=
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
nano backend/.env                       # paste values; Ctrl+O to save, Ctrl+X to exit
nano frontend/.env
nano .env
```

**Change these values:**
- `MONGO_URL`: your Atlas string. `DB_NAME`: the database name that holds your data.
- All the public URL variables (`BACKEND_PUBLIC_URL`, `APP_BASE_URL`, …): `https://salonhub.in`.
- `CORS_ORIGINS`: `https://salonhub.in,https://www.salonhub.in`.

**Add these new values:**
- `GOOGLE_CLIENT_ID` (backend) and `REACT_APP_GOOGLE_CLIENT_ID` (frontend): the same Client ID from Step 1.
- `GEMINI_API_KEY`: from Step 2.

**Keep these exactly as they are on Emergent:**
- `JWT_SECRET_KEY`: if it changes, everyone gets logged out.
- Every `TWILIO_*`, `META_*` and `CASHFREE_*` value.

**You can delete:** `EMERGENT_LLM_KEY` and `EMERGENT_AUTH_BASE` (no longer used).

> To test on a subdomain first, set `DOMAIN=new.salonhub.in` in `.env` and use
> `https://new.salonhub.in` for the URL variables. Switch them back at cutover (Step 9).

## Step 7: Point a test domain at the server and start it (15 min)

1. At your domain registrar (or Cloudflare), add an **A record**: `new` → your static IP.
   If you use Cloudflare, set it to **DNS only** (grey cloud) so Caddy can get its certificate.
2. On the server:

```bash
cd ~/salonhub
docker compose up -d --build        # the first build takes ~10 minutes
docker compose ps                   # both containers should be "running"
docker compose logs -f backend      # Ctrl+C to stop following
curl -s https://new.salonhub.in/health
```

## Step 8: Test on `new.salonhub.in`

Do not edit data you care about on the test domain if Emergent is still live and writing to a different database.

- [ ] Home page loads, and there's a padlock (HTTPS)
- [ ] Customer OTP login; salon admin login; platform login
- [ ] **Continue with Google** on each login page
- [ ] Book a token and watch the salon queue update live (Socket.IO)
- [ ] Complete a booking: the WhatsApp message arrives and the invoice PDF opens
- [ ] Cashfree payment (sandbox, or a small real amount)
- [ ] Upload a menu image on the services page (Gemini parsing)

## Step 9: Cutover to `salonhub.in` (≈30 min, at a quiet hour)

1. **Data:** if the live Emergent app still writes to Emergent's database, not Atlas, copy the latest data to Atlas one final time, the same way you moved it before, right before switching.
2. On the server, change `DOMAIN=salonhub.in` in `.env`, set the URL variables in `backend/.env` and `frontend/.env` to `https://salonhub.in`, then run `docker compose up -d --build`.
3. In DNS, change the **A records** for `salonhub.in` (`@`) and `www` to the static IP. Remove the old Emergent records (A/CNAME) for those names.
4. After DNS updates (usually minutes, up to a few hours), open `https://salonhub.in`.
5. **Check the webhooks.** The code already uses `https://salonhub.in/...`, so these should keep working; confirm each one:
   - **Meta** (developers.facebook.com → your app → WhatsApp → Configuration): callback URL `https://salonhub.in/api/webhooks/whatsapp`. Click **Verify and save** again to be safe.
   - **Twilio** (now used only for SMS/OTP): any status-callback URL should be `https://salonhub.in/api/twilio/status-callback`.
   - **Cashfree:** the webhook URL in the dashboard should be `https://salonhub.in/api/webhooks/cashfree`. Payment callbacks are generated from `APP_BASE_URL` automatically.
   - **Meta Embedded Signup:** the app's allowed domains should include `salonhub.in`.
   - If any of them still shows an `…emergentagent.com` URL, change it to the matching `https://salonhub.in/...` path.
6. Keep Emergent running 2–3 days as a fallback, then cancel it.

---

## Day-to-day operations

| Task | Command (in `~/salonhub`) |
|---|---|
| Deploy new code | `git pull && docker compose up -d --build` |
| View backend logs | `docker compose logs -f --tail=200 backend` |
| Restart | `docker compose restart backend` |
| Stop / start everything | `docker compose down` / `docker compose up -d` |
| Free disk from old builds | `docker system prune -af` (safe; images are rebuilt on the next deploy) |
| Change an env value | edit `backend/.env`, then `docker compose up -d` (frontend: `--build`) |

## Database backup (from your own computer)

Install **MongoDB Database Tools** (<https://www.mongodb.com/try/download/database-tools>). In Atlas → Network Access, add your home IP, or use **Add current IP**.

**Backup (run weekly or before big changes):**

```bash
# macOS / Linux
mongodump --uri="mongodb+srv://USER:PASS@salonhub.s3udxut.mongodb.net/DB_NAME" \
  --gzip --archive="salonhub-$(date +%F).gz"
```

```powershell
# Windows PowerShell
mongodump --uri="mongodb+srv://USER:PASS@salonhub.s3udxut.mongodb.net/DB_NAME" `
  --gzip --archive="salonhub-$(Get-Date -Format yyyy-MM-dd).gz"
```

**Restore** (this overwrites the collections in the archive):

```bash
mongorestore --uri="mongodb+srv://USER:PASS@salonhub.s3udxut.mongodb.net" \
  --gzip --archive="salonhub-2026-09-26.gz" --drop
```

Free-tier (M0) limits: **512 MB storage** and no automatic backups. Check usage in Atlas → Cluster → Metrics. Move to Flex (~$8+/mo) when you get near 400 MB.

## Troubleshooting

- **Certificate or HTTPS errors:** DNS isn't pointing at the server yet, ports 80/443 are closed in the Lightsail firewall, or Cloudflare proxying is on. Check `docker compose logs web`.
- **502 on `/api`:** the backend crashed. Check `docker compose logs backend`, usually a wrong `MONGO_URL` or the IP missing from the Atlas Network Access list.
- **"Google sign-in is not configured":** `GOOGLE_CLIENT_ID` is missing in `backend/.env`.
- **Google says `redirect_uri_mismatch`:** add `https://<your domain>/auth/callback` to the OAuth client's redirect URIs.
- **Google button does nothing:** `REACT_APP_GOOGLE_CLIENT_ID` is missing in `frontend/.env`. Rebuild with `--build` after adding it.
- **Build killed or out of memory:** check that swap is on (`swapon --show`).

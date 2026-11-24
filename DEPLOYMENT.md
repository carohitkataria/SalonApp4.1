# Deploying SalonHub and Shifain on one AWS server

Both websites run on one small server, for about **$12 a month** in total:

```
                       ┌── salonhub.in ──▶ React app; /api and /socket.io ──▶ backend (FastAPI, 1 worker) ──▶ MongoDB Atlas (SalonHub project)
 Browser ──HTTPS──▶ Caddy
                       └── shifain.com ──▶ shifain (Next.js) ──────────────────────────────────────────────▶ MongoDB Atlas (Shifain project)
```

- **Server:** AWS Lightsail, Mumbai, 2 GB, Ubuntu 24.04.
- **`web` container (Caddy):** answers for both domains, serves SalonHub's React app, forwards to the right app, and gets and renews the HTTPS certificates itself.
- **`backend` container:** SalonHub's API with **exactly one worker**. Scheduled jobs and live updates run inside it, so never scale it out.
- **`shifain` container:** Shifain's Next.js server. Its content and cases stay in its own Atlas database, so nothing changes there.

Files: `docker-compose.yml`, `docker-compose.shifain.yml`, `backend/Dockerfile`,
`deploy/web.Dockerfile`, `deploy/Caddyfile`, `deploy/sites/shifain.caddy`, `deploy/update.sh`,
the `.env.example` files, and `Dockerfile` in the Shifain repo.
SalonHub alone also works: leave the two Shifain lines out of `.env` (Step 6).

**Where the settings go:** you do not type the `.env` values into AWS. AWS only gives
you the server. The values go in four text files on the server, which you open in the
browser SSH window in Step 6.

## Before you start

- The AWS account (done), and access to the DNS settings of `salonhub.in` and `shifain.com`.
- SalonHub's `.env` values. Emergent shows them for the deployed app, or ask Emergent's chat to print `backend/.env` and `frontend/.env`.
- Shifain's values: **Render → your Shifain service → Environment**. Copy every key and value.
- About 2 hours. Emergent and Render keep running until the switch in Step 9, so the live sites aren't affected.

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


## Step 3: Create the server in AWS (15 min)

1. Sign in at **console.aws.amazon.com**. In the search bar at the top, type **Lightsail** and open it.
2. Click **Create instance** and choose:
   - **Instance location:** click *Change AWS Region and Availability Zone* → **Mumbai (ap-south-1)**
   - **Select a platform:** Linux/Unix
   - **Select a blueprint:** **OS Only** → **Ubuntu 24.04 LTS**
   - **Network type:** Dual-stack
   - **Select a size:** the **$12 USD** plan (2 GB memory, 2 vCPUs, 60 GB SSD). Smaller plans don't have enough memory.
   - **Identify your instance:** `salonhub`
   - Click **Create instance**. It's ready in about a minute.
3. Open the instance → **Networking** tab:
   - **Attach static IP** → **Create static IP** → name it `salonhub-ip` → **Create**. Write the IP down. It stays the same for good, and is free while it's attached.
   - Under **IPv4 Firewall**, click **Add rule** → Application **HTTPS** → **Create**. SSH (22) and HTTP (80) are already there.
4. Optional but useful: AWS search bar → **Billing and Cost Management** → **Budgets** → **Create budget** → *Monthly cost budget* of $15 with your email. AWS emails you if the bill goes above it.
5. Back on the instance, click **Connect using SSH**. A terminal opens in your browser. Paste:

```bash
# 2 GB swap: building the apps needs more memory than 2 GB alone
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu

# Automatic security updates
sudo apt-get install -y unattended-upgrades
```

Close the SSH window and open it again so `docker` works without `sudo`.

## Step 4: Get the code onto the server (5 min)

SalonHub's repo is private, so give the server a read-only **deploy key**:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

On GitHub, open **SalonApp4.1 → Settings → Deploy keys → Add deploy key**, paste the key, and leave
**Allow write access** off. Then:

```bash
git clone git@github.com:carohitkataria/SalonApp4.1.git ~/salonhub
git clone https://github.com/carohitkataria/shifain.git ~/shifain     # public repo, no key needed
```

The two folders must sit side by side (`~/salonhub` and `~/shifain`).

## Step 5: Let the server reach MongoDB Atlas (5 min)

Do this in **both** Atlas projects (SalonHub's and Shifain's):

1. **Network Access → Add IP Address**, enter the static IP from Step 3, then **Confirm**.
2. **Database Access:** use a user with **readWrite** on that project's database.
3. **Clusters → Connect → Drivers:** copy the `mongodb+srv://…` string and put the password in it.

**SalonHub's data:** the SalonHub Atlas project is out of date, but there are no customers
yet, so either:
- **start from what's in Atlas** (nothing to do), or
- copy Emergent's current data in first, the same way it was copied before. Ask in this
  chat if you want help with that.

Shifain already uses its live Atlas database, so its data doesn't move at all.

## Step 6: Fill in the settings files (15 min)

`nano` is a simple editor in the SSH window: paste with right-click (or Ctrl+Shift+V),
save with **Ctrl+O** then **Enter**, and exit with **Ctrl+X**.

```bash
cd ~/salonhub
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
touch ~/shifain/.env

nano .env               # 1. domains
nano backend/.env       # 2. SalonHub backend (from Emergent's backend/.env)
nano frontend/.env      # 3. SalonHub frontend (from Emergent's frontend/.env)
nano ~/shifain/.env     # 4. Shifain (from Render → Environment)
```

**1. `~/salonhub/.env`.** For the test run, use test subdomains:

```
DOMAIN=new.salonhub.in
COMPOSE_FILE=docker-compose.yml:docker-compose.shifain.yml
SHIFAIN_DOMAIN=new.shifain.com
```

**2. `backend/.env` (SalonHub).** The example file lists every key. Paste the values from Emergent.
- **Change:**
  - `MONGO_URL`: the SalonHub Atlas string. `DB_NAME`: the database name in it.
  - All the public URL variables (`BACKEND_PUBLIC_URL`, `APP_BASE_URL`, …): `https://new.salonhub.in` for the test.
  - `CORS_ORIGINS`: `https://new.salonhub.in`
- **Add:**
  - `GOOGLE_CLIENT_ID`: from Step 1.
  - `GEMINI_API_KEY`: from Step 2.
  - The `INSTAGRAM_*` values, if you set up Instagram (see `MARKETING_SETUP.md`).
- **Keep exactly as on Emergent:**
  - `JWT_SECRET_KEY`: if it changes, everyone is logged out.
  - Every `TWILIO_*`, `META_*` and `CASHFREE_*` value.
- **Leave out:** `EMERGENT_LLM_KEY` and `EMERGENT_AUTH_BASE`.

**3. `frontend/.env` (SalonHub).**
- `REACT_APP_BACKEND_URL=https://new.salonhub.in`
- `REACT_APP_GOOGLE_CLIENT_ID`: the same ID as the backend's `GOOGLE_CLIENT_ID`.
- The rest copied from Emergent.

**4. `~/shifain/.env`.** Paste every key from Render (`KEY=value`, one per line). Then change:
- `BASE_URL=https://new.shifain.com` for the test.
- `ALLOWED_HOSTS=www.shifain.com`
- Leave out `TRUSTED_PROXY_HOPS`, or set it to `0`. Caddy is the only proxy now.

## Step 7: Point the test subdomains at the server and start (20 min)

1. In the DNS settings of each domain, add an **A record**:
   - `new` → static IP, for `salonhub.in`
   - `new` → static IP, for `shifain.com`

   If a domain uses Cloudflare, set the record to **DNS only** (grey cloud).
2. On the server:

```bash
cd ~/salonhub
./deploy/update.sh       # builds backend, web and shifain one by one (~15 min the first time)
docker compose ps        # backend, web and shifain should all be "running"
curl -s https://new.salonhub.in/health
curl -s https://new.shifain.com/api/health
```

Both health checks should answer.

## Step 8: Test on the subdomains

Emergent and Render keep running the live sites meanwhile.

**SalonHub (`https://new.salonhub.in`)**
- [ ] The home page loads with a padlock (HTTPS)
- [ ] Customer OTP login; salon admin login; platform login
- [ ] **Continue with Google** on each login page. Add `https://new.salonhub.in` to the Google client while testing (Step 1).
- [ ] Book a token and watch the salon queue update live
- [ ] Complete a booking: the WhatsApp message arrives and the invoice PDF opens
- [ ] Upload a menu image on the services page (Gemini)

**Shifain (`https://new.shifain.com`)**
- [ ] The homepage shows your published content in each language
- [ ] `/admin/login` works, and the console opens
- [ ] Send a test enquiry; it appears in the console
- [ ] Patient portal sign-in (email code or WhatsApp/Telegram)

Shifain's test site uses the live Shifain database, so test with clearly marked test data,
and delete it afterwards.

## Step 9: Switch the real domains (≈30 min each, at a quiet hour)

You can switch one site at a time.

**SalonHub**
1. If you want Emergent's latest data, copy it to Atlas once more, right before switching.
2. On the server, set `DOMAIN=salonhub.in` in `~/salonhub/.env`.
3. In `backend/.env` and `frontend/.env`, change every `new.salonhub.in` to `salonhub.in`, and set `CORS_ORIGINS=https://salonhub.in,https://www.salonhub.in`.
4. DNS: point the A records for `@` and `www` of `salonhub.in` to the static IP, and remove the old Emergent records for those names.

**Shifain**
1. On the server, set `SHIFAIN_DOMAIN=shifain.com` in `~/salonhub/.env`.
2. In `~/shifain/.env`, set `BASE_URL=https://shifain.com`.
3. DNS: point the A records for `@` and `www` of `shifain.com` to the static IP, and remove Render's records (CNAME/A) for those names.

**Then, for both:**
1. Run `~/salonhub/deploy/update.sh`.
2. Once DNS has updated (minutes, sometimes a few hours), open `https://salonhub.in` and `https://shifain.com`.
3. Check the webhooks. Both sites keep their domains, so these addresses don't change. Confirm each:
   - **SalonHub, Meta** (developers.facebook.com → app → WhatsApp → Configuration): `https://salonhub.in/api/webhooks/whatsapp`. Click **Verify and save**.
   - **SalonHub, Cashfree:** `https://salonhub.in/api/webhooks/cashfree`
   - **SalonHub, Twilio** (SMS only): `https://salonhub.in/api/twilio/status-callback`
   - **Shifain, Telegram:** the bot's webhook is `https://shifain.com/api/telegram/webhook?bot=patient`. It stays the same, because the domain is unchanged.
   - Any address still on `…emergentagent.com` or `…onrender.com`: change it to the matching path on the real domain.
4. Keep Emergent and Render running 2–3 days as a fallback, then cancel both. On Render, **suspend** the Shifain service first; delete it a week later.

---

## Day-to-day operations

Run these in `~/salonhub` (`cd ~/salonhub` first).

| Task | Command |
|---|---|
| Deploy new code (both sites) | `./deploy/update.sh` |
| View logs | `docker compose logs -f --tail=200 backend` (or `shifain`, `web`) |
| Restart one app | `docker compose restart backend` (or `shifain`) |
| Memory use | `docker stats --no-stream` |
| Stop / start everything | `docker compose down` / `docker compose up -d` |
| Free disk from old builds | `docker system prune -af` (safe; images are rebuilt on the next deploy) |
| Change an env value | edit the file, then `./deploy/update.sh` (some values are read at build time, so always rebuild) |

## Database backup (from your own computer)

The same steps work for Shifain's Atlas cluster; use its connection string.

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
- **One site shows the other, or a certificate error on Shifain:** check `SHIFAIN_DOMAIN` in `~/salonhub/.env` and that `COMPOSE_FILE` lists both files, then run `./deploy/update.sh`.
- **Shifain shows the default homepage text:** the build couldn't reach its database. Check `MONGODB_URI` in `~/shifain/.env` and the Atlas IP list, then run `./deploy/update.sh`.

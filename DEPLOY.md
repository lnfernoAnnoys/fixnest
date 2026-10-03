# Putting FixNest on the internet

This puts FixNest on one small Microsoft Azure server (a virtual machine) at **https://your-domain.example**. One server is plenty for one hostel,
because the database is a single file (SQLite) and the photos are ordinary files on the same disk.

What runs where:

```
students' phones ──HTTPS──▶ Caddy (port 443, handles the certificate)
                              └──▶ FixNest app (port 3001, only reachable from the same machine)
                                     ├─ database   /var/lib/fixnest/hostel.db
                                     └─ photos     /var/lib/fixnest/uploads
```

Things only you can do are marked **You**. Everything else is copy and paste. Commands marked `# on the server` are typed
into the server's terminal (you connect with `ssh`); commands marked `# on your PC` are typed on your own computer.

> Do this in order, and don't skip the checks at the end. Nothing here touches your local copy.

---

## 1. Put the code on GitHub (private)

**You:** create an empty **private** repository on GitHub, for example `fixnest` (no README, no .gitignore).

```bash
# on your PC, in the project folder
git init
git add -A
git status
```

Read the `git status` list. It must **not** contain `server/.env`, any `*.db` file, or `server/uploads/`. (They are ignored
already, so they shouldn't appear.) If one does appear, stop and ask.

```bash
# on your PC
git commit -m "FixNest"
git branch -M main
git remote add origin https://github.com/<your-username>/fixnest.git
git push -u origin main
```

## 2. Create the server

**First, make a login key on your PC.** This is a pair of files: a *private* key that stays on your PC and is never shared
with anyone (not in chat, not by email), and a *public* key that is safe to hand out.

```bash
# on your PC (Git Bash or PowerShell)
ssh-keygen -t ed25519 -f ~/.ssh/fixnest_azure -C fixnest-azure
```

Press Enter at the passphrase question for no passphrase, or type one if you prefer. Then show the public half:

```bash
# on your PC
cat ~/.ssh/fixnest_azure.pub
```

**You**, in the Azure portal (portal.azure.com), signed in with your student account:

1. **Create a resource → Virtual machine**.
2. Resource group: **Create new**, name it `fixnest`.
3. Virtual machine name: `fixnest`.
4. Region: **Central India** (Pune, the closest to your hostel). Student subscriptions only allow some regions, so if it
   isn't in the list, take the nearest one that is.
5. Image: **Ubuntu Server 24.04 LTS - x64 Gen2**.
6. Size: **B1ms** (2 GB RAM) is comfortable. The cheaper **B1s** (1 GB) can work, but building the web app needs memory.
   The portal shows the monthly price next to each size, so check it against your credit.
7. Authentication type: **SSH public key**. Username: `azureuser`. Source: **Use existing public key**, and paste the single
   line printed by the `cat` command above. Do **not** paste the private key.
8. Inbound ports: allow **SSH (22)**, **HTTP (80)** and **HTTPS (443)**.
9. On the **Networking** tab, open the public IP and set it to **Static** (otherwise it can change when the machine restarts
   and the domain would stop working).
10. **Review + create**, then **Create**. When it finishes, copy the VM's **public IP address**.

Then in **Cost Management → Budgets**, add a budget with an email alert so the credit never runs out by surprise.

## 3. Point the domain at it

**You**, in the DNS settings for `your-domain.example`:

| Type | Name | Value |
|---|---|---|
| A | `@` | the VM's public IP address |
| A | `www` | the VM's public IP address |

DNS can take a few minutes to a few hours. Check with `nslookup your-domain.example` on your PC: it should show the IP.

## 4. Prepare the server

```bash
# on your PC
ssh -i ~/.ssh/fixnest_azure azureuser@<vm-ip>
```

You are now logged in as `azureuser`. Switch to the administrator account for the whole setup (every command below then
works exactly as written):

```bash
# on the server
sudo -i
```

The firewall is Azure's own: only ports 22, 80 and 443 are open (step 2). Now install everything:

```bash
# on the server
apt update && apt upgrade -y

# Node.js 24, git, and Caddy (the web server that handles HTTPS)
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs git caddy
node -v        # must print v24.something

# a user that runs the app (it has no password and cannot log in)
adduser --system --group --home /opt/fixnest fixnest
mkdir -p /opt/fixnest /var/backups/fixnest /var/lib/fixnest
chown fixnest:fixnest /opt/fixnest /var/backups/fixnest /var/lib/fixnest
touch /var/log/fixnest-backup.log && chown fixnest:fixnest /var/log/fixnest-backup.log
```

## 5. Let the server read your private repository

```bash
# on the server
mkdir -p /opt/fixnest/.ssh
ssh-keygen -t ed25519 -N "" -f /opt/fixnest/.ssh/id_ed25519
ssh-keyscan github.com >> /opt/fixnest/.ssh/known_hosts
chown -R fixnest:fixnest /opt/fixnest/.ssh
chmod 700 /opt/fixnest/.ssh
cat /opt/fixnest/.ssh/id_ed25519.pub
```

**You:** on GitHub open the repository → **Settings → Deploy keys → Add deploy key**, paste that line, leave "Allow write
access" **off**.

## 6. Install the app

```bash
# on the server
sudo -u fixnest -H git clone git@github.com:<your-username>/fixnest.git /opt/fixnest/app
cd /opt/fixnest/app
sudo -u fixnest -H npm ci
sudo -u fixnest -H npm run build
```

The build ends with a line like `built in 10s`. The web app is now in `/opt/fixnest/app/client/dist`.

## 7. Settings

```bash
# on the server
cp /opt/fixnest/app/deploy/env.production.example /opt/fixnest/app/server/.env
chown fixnest:fixnest /opt/fixnest/app/server/.env
chmod 600 /opt/fixnest/app/server/.env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
nano /opt/fixnest/app/server/.env
```

In the editor, paste the generated secret after `JWT_SECRET=` and fill in the other `<...>` parts (Google client id,
email settings; see section 9). Save with Ctrl+O, Enter, then Ctrl+X.

On purpose, the app refuses to start in production with a weak secret, and the demo-data loader (`npm run seed`) refuses to run there at all.

## 8. Start it

```bash
# on the server
cp /opt/fixnest/app/deploy/fixnest.service /etc/systemd/system/fixnest.service
cp /opt/fixnest/app/deploy/Caddyfile /etc/caddy/Caddyfile
cp /opt/fixnest/app/deploy/fixnest-backup.cron /etc/cron.d/fixnest-backup
systemctl daemon-reload
systemctl enable --now fixnest
systemctl reload caddy

systemctl status fixnest --no-pager
curl -s http://127.0.0.1:3001/api/health
```

The last line should print `{"ok":true}`. Then on your PC open **https://your-domain.example**. The first visit may take a few
seconds while Caddy gets the certificate. If the page doesn't load, jump to "If something is wrong" below.

## 9. Email, Google sign-in and the first admin

**Email, option A: a mailbox from your registrar (Titan).** In the registrar's panel, open the domain's **Email** tab and start
the trial. Create the mailbox `support@your-domain.example` with a strong password, and look under **DNS** to check the mail records
were added (MX and SPF; if it shows a DKIM record to add, add it). Log into the mailbox's webmail once and send yourself a
message. Then, in your own terminal (so the password never goes through chat):

```bash
# on your PC
ssh -t -i "C:\Users\<you>\.ssh\<key>.pem" azureuser@<server-ip> "sudo bash /opt/fixnest/app/deploy/set-smtp.sh"
```

It asks for `smtp.titan.email`, port `465`, the full address, the password (hidden), and a test address, saves them,
restarts FixNest, and sends a test email.

**Email, option B: Resend.** Create a [Resend](https://resend.com) account, add the domain `your-domain.example`, and add the DNS records it
shows you (in the same DNS settings as step 3). When Resend shows the domain as **Verified**, create an API key with
sending access and put it in `SMTP_PASS` in `/opt/fixnest/app/server/.env`. Then:

```bash
# on the server
systemctl restart fixnest
cd /opt/fixnest/app
sudo -u fixnest -H npm run test-mail -w server -- you@example.com
```

It should print "Sent". Then check the inbox (and the spam folder).

**Google sign-in (You).** In Google Cloud Console → your OAuth client → **Authorized JavaScript origins**, add
`https://your-domain.example`. Then, on the OAuth consent screen, set the app to **In production**, otherwise only listed test
users can sign in. Also delete the old client secret you pasted in chat earlier: the app never used it.

**The first admin.** This creates an account you can log in to. Choose a long password and keep it safe. Signing in with
Google works too, if the Google account has the same email.

```bash
# on the server
cd /opt/fixnest/app
sudo -u fixnest -H env ADMIN_PASSWORD='a-long-password-here' npm run create-admin -w server -- "Your Name" you@gmail.com
```

Log in as that admin, then:

1. **Setup → Add hostel**, once for each real hostel (your 2 boys' and 2 girls' hostels).
2. **People → Wardens → Add warden** for each warden.
3. **People → Maintenance staff → Add staff member** for the electricians, plumbers and so on.
4. **Setup → Categories**: check the list. Students can only choose the hostels you added in step 1, so add all of them first; rooms appear by themselves as students sign up and type their room.

Never run `npm run seed` on the server. It refuses to, because it creates demo accounts with a public password.

## Before you announce it: check these

- [ ] https://your-domain.example opens with a padlock, and http:// redirects to https://.
- [ ] `https://www.your-domain.example` redirects to `https://your-domain.example`.
- [ ] You can sign up with a real college address and the code arrives in the inbox.
- [ ] "Forgot password" email arrives and the link works.
- [ ] Log in with Google as a student and as your admin account.
- [ ] Report a test complaint from a phone, with a photo and a short video, and see it as the warden.
- [ ] `sudo -u fixnest -H npm run backup -w server` (from `/opt/fixnest/app`) prints "Database saved" and "Uploads saved".
- [ ] Afterwards, deactivate the test student under **People → Students**. (Complaints themselves can't be deleted, by design.)

## Backups

The cron file you installed saves the database and the photos to `/var/backups/fixnest` every night at 02:30 and keeps 14
days. That protects against mistakes, but not against losing the server, so also do one of these:

- In the Azure portal, turn on **Backup** for the VM (a small monthly fee), or
- once a week copy the newest files to your own computer: `scp -i ~/.ssh/fixnest_azure "azureuser@<vm-ip>:/var/backups/fixnest/*" .`

**Restoring** (only if something went badly wrong):

```bash
# on the server
systemctl stop fixnest
cp /var/backups/fixnest/hostel-2026-10-05.db /var/lib/fixnest/hostel.db
chown fixnest:fixnest /var/lib/fixnest/hostel.db
rm -f /var/lib/fixnest/hostel.db-wal /var/lib/fixnest/hostel.db-shm
systemctl start fixnest
```

## Updating the site later

```bash
# on your PC: git push your changes, then on the server:
cd /opt/fixnest/app
sudo -u fixnest -H npm run backup -w server
sudo -u fixnest -H git pull
sudo -u fixnest -H npm ci
sudo -u fixnest -H npm run build
systemctl restart fixnest
```

Database changes are applied by themselves when the app starts. The backup first means you can go back.

## If something is wrong

| Symptom | Look here |
|---|---|
| The page doesn't load | `systemctl status fixnest`, `systemctl status caddy`. Is the DNS `A` record right (`nslookup your-domain.example`)? |
| "Refusing to start" or a `JWT_SECRET` message | Check `/opt/fixnest/app/server/.env` (secret at least 32 characters, `APP_URL` set). |
| Certificate errors | The domain must already point at the server, and ports 80/443 must be open in the VM's Azure networking settings (Networking → inbound port rules). Then `systemctl reload caddy`; see `journalctl -u caddy -n 50`. |
| "Request blocked" when logging in | `APP_URL` must match the address in the browser exactly, with `https://` and no trailing slash. |
| Everyone shows the same address, or "too many attempts" for all students | `TRUST_PROXY=1` must be set. |
| No emails arrive | `journalctl -u fixnest -n 100` shows the reason after `[mail] SMTP send failed`. Run `test-mail` (step 9). |
| The app's own log | `journalctl -u fixnest -f` (press Ctrl+C to stop watching). |

## If the server is shared with other websites

If the machine already hosts other sites (the shared Azure VM does), the steps above change in a few ways so nothing else is
disturbed. This is how FixNest was put on it:

- **Own Node, not the system one.** Another site may depend on the machine's Node. Download Node 24 from nodejs.org (check
  its SHA-256 against `SHASUMS256.txt`), unpack it to `/opt/fixnest/node`, and run FixNest with
  `/opt/fixnest/node/bin/node`. The service file and the backup cron already do.
- **A free port.** Run `sudo ss -ltn`, pick a port nobody uses (3001 and 8787 were taken, so FixNest uses **3011**), and put it
  in `PORT=` in `server/.env` and in the Caddy block.
- **No git needed.** Pack the project on your PC without `node_modules`, `.env`, databases or uploads, copy it over with `scp`,
  unpack it into `/opt/fixnest/app`, then `npm ci --omit=dev -w server` (using the isolated Node). The web app is built on
  your PC (`npm run build`) and shipped inside the package, so the server needs no build tools.
- **Never overwrite the shared Caddyfile; only append.** Back it up first, append the block, validate, and only then
  *reload* (never restart), because a mistake would take the other sites down too:

  ```bash
  sudo cp -p /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-fixnest-$(date +%Y%m%d)
  sudo tee -a /etc/caddy/Caddyfile >/dev/null <<'EOF'

  your-domain.example {
  	encode gzip zstd
  	reverse_proxy 127.0.0.1:3011
  }

  www.your-domain.example {
  	redir https://your-domain.example{uri} permanent
  }
  EOF
  sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
  ```

  `www` must **redirect** to the main address instead of serving the app: the app only accepts logins from the exact
  `APP_URL`, so a visitor on `www` would see "Request blocked".
- **DNS first.** Both `your-domain.example` and `www.your-domain.example` must already point at the server, or the certificate request
  fails. Check each with `nslookup <name> 8.8.8.8` before adding the block.
- **Check the neighbours** before and after: every other site on the machine should still answer with the same status.

## What this setup does not do

- It does not run more than one copy of the app. That is fine for one hostel; SQLite handles it well.
- It does not send text messages. Email only.
- Mobile numbers are stored but not verified.

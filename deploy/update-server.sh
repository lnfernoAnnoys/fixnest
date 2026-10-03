#!/usr/bin/env bash
# Updates the live FixNest: backup, REPLACE the source folders (so files deleted in the project are deleted here too),
# matching dependencies, restart only the fixnest service. The settings file, data and installed packages are kept.
set -euo pipefail
cd /opt/fixnest/app/server
echo "== backup first"
sudo -u fixnest -H /opt/fixnest/node/bin/node --import tsx src/backup.ts 2>&1 | tail -2
echo "== replace the code (settings file, data and node_modules are kept)"
sudo rm -rf /opt/fixnest/app/client /opt/fixnest/app/server/src /opt/fixnest/app/server/assets /opt/fixnest/app/deploy
sudo tar -xzf /tmp/fixnest.tgz -C /opt/fixnest/app
sudo chown -R fixnest:fixnest /opt/fixnest/app
rm -f /tmp/fixnest.tgz
sudo -u fixnest test -f /opt/fixnest/app/server/.env && echo "settings file still in place"
echo "== dependencies (production only, to match the lock file)"
cd /opt/fixnest/app
sudo -u fixnest -H env PATH=/opt/fixnest/node/bin:/usr/bin:/bin npm ci --omit=dev -w server 2>&1 | grep -vE "^npm (notice|warn)" | tail -2
echo "== restart fixnest (only)"
sudo systemctl restart fixnest
sleep 7
systemctl is-active fixnest
curl -s -m 10 http://127.0.0.1:3011/api/health; echo
sudo journalctl -u fixnest -n 4 --no-pager | cut -c1-170

#!/usr/bin/env bash
# Sets FixNest's outgoing email on the server, WITHOUT the password ever passing through chat or the shell history.
#
#   Run on the server, in your own terminal:   sudo bash /opt/fixnest/app/deploy/set-smtp.sh
#
# It asks for the mail server, login and password (the password is typed hidden), writes them into FixNest's settings
# file, restarts FixNest, and sends a test email so you know it works.
set -euo pipefail

DIR="${FIXNEST_DIR:-/opt/fixnest/app}"
NODE="${FIXNEST_NODE:-/opt/fixnest/node/bin/node}"
RUN_USER="${FIXNEST_USER-fixnest}"
ENVF="$DIR/server/.env"
[ -f "$ENVF" ] || { echo "Settings file not found: $ENVF"; exit 1; }

run_as() { if [ -n "$RUN_USER" ] && [ "$(id -u)" = 0 ]; then sudo -u "$RUN_USER" -H "$@"; else "$@"; fi; }

read -rp "Mail server (for Titan: smtp.titan.email): " HOST
read -rp "Port [465]: " PORT
PORT="${PORT:-465}"
read -rp "Login (the full email address, e.g. support@your-domain.example): " USER_
read -rsp "Password (typing is hidden): " PASS
echo
read -rp "Send as [FixNest <$USER_>]: " FROM
FROM="${FROM:-FixNest <$USER_>}"
read -rp "Send a test email to: " TO

# Values go inside double quotes in the settings file, so these characters cannot be used.
for v in "$HOST" "$USER_" "$PASS" "$FROM"; do
  case "$v" in *\"* | *\\* | *$'\n'*) echo 'A value contains a double quote, a backslash or a line break. Pick a password without those and run this again.'; exit 1 ;; esac
done
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "The port must be a number."; exit 1; }

set_var() { # replace the line if it exists, otherwise add it
  local key="$1" val="$2"
  sed -i "/^${key}=/d" "$ENVF"
  printf '%s="%s"\n' "$key" "$val" >> "$ENVF"
}
set_var SMTP_HOST "$HOST"
set_var SMTP_PORT "$PORT"
set_var SMTP_USER "$USER_"
set_var SMTP_PASS "$PASS"
set_var SMTP_FROM "$FROM"
if [ "$(id -u)" = 0 ] && [ -n "$RUN_USER" ]; then chown "$RUN_USER:$RUN_USER" "$ENVF"; fi
chmod 600 "$ENVF"
echo "Saved to $ENVF (only the app can read it)."

if [ -z "${FIXNEST_SKIP_RESTART:-}" ]; then
  systemctl restart fixnest
  sleep 5
  echo "FixNest restarted: $(systemctl is-active fixnest)"
fi

echo "Sending a test email to $TO ..."
cd "$DIR/server"
if run_as "$NODE" --import tsx src/testMail.ts "$TO"; then
  echo "Done. Check the inbox (and the spam folder)."
else
  echo "The test email failed. The reason is printed above. Check the server name, port, login and password."
  exit 1
fi

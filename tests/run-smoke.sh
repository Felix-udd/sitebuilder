#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
find . -path './.git' -prune -o -name '*.php' -print0 | xargs -0 -n1 php -l
find assets/js -name '*.js' -print0 | xargs -0 -n1 node --check
php tests/compiler-smoke.php
php tests/security-smoke.php
# Verify password-enabled HTTP access denies unauthenticated admin requests.
PORT=18765
SITEBUILDER_ADMIN_PASSWORD='smoke-test-secret' php -S "127.0.0.1:${PORT}" -t "$ROOT" >/tmp/sitebuilder-php-server.log 2>&1 &
SERVER_PID=$!
cleanup(){ kill "$SERVER_PID" >/dev/null 2>&1 || true; }
trap cleanup EXIT
for i in $(seq 1 30); do
  if curl -sS "http://127.0.0.1:${PORT}/login.php" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
INDEX_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/index.php")
API_STATUS=$(curl -sS -o /tmp/sitebuilder-api-auth.json -w '%{http_code}' "http://127.0.0.1:${PORT}/api/list.php")
LOGIN_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/login.php")
[[ "$INDEX_STATUS" == "302" ]]
[[ "$API_STATUS" == "401" ]]
[[ "$LOGIN_STATUS" == "200" ]]
grep -q 'Authentication required' /tmp/sitebuilder-api-auth.json
echo "PASS: HTTP dashboard redirects unauthenticated requests to login"
echo "PASS: management API returns 401 without a signed-in session"
echo "PASS: login page responds successfully"
COOKIE_JAR=/tmp/sitebuilder-auth-cookies.txt
curl -sS -c "$COOKIE_JAR" "http://127.0.0.1:${PORT}/login.php" >/dev/null
LOGIN_POST=$(curl -sS -b "$COOKIE_JAR" -c "$COOKIE_JAR" -o /dev/null -w '%{http_code}' -X POST -d 'password=smoke-test-secret&return=index.php' "http://127.0.0.1:${PORT}/login.php")
[[ "$LOGIN_POST" == "303" ]]
AUTH_EDITOR=$(curl -sS -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/editor.php?id=1")
[[ "$AUTH_EDITOR" == "200" ]]
echo "PASS: valid administrator password creates a session"
echo "PASS: authenticated session can load the protected editor shell"
CSRF_STATUS=$(curl -sS -b "$COOKIE_JAR" -o /tmp/sitebuilder-csrf.json -w '%{http_code}' -X POST -H 'Origin: https://evil.example' -H 'Content-Type: application/json' --data '{}' "http://127.0.0.1:${PORT}/api/save.php")
PORT_MISMATCH_STATUS=$(curl -sS -b "$COOKIE_JAR" -o /tmp/sitebuilder-port-mismatch.json -w '%{http_code}' -X POST -H "Origin: http://127.0.0.1:18766" -H 'Content-Type: application/json' --data '{}' "http://127.0.0.1:${PORT}/api/save.php")
NO_ORIGIN_STATUS=$(curl -sS -b "$COOKIE_JAR" -o /tmp/sitebuilder-no-origin.json -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{}' "http://127.0.0.1:${PORT}/api/save.php")
[[ "$CSRF_STATUS" == "403" ]]
[[ "$PORT_MISMATCH_STATUS" == "403" ]]
[[ "$NO_ORIGIN_STATUS" == "403" ]]
echo "PASS: authenticated cross-origin mutation is rejected"
echo "PASS: authenticated different-port origin is rejected"
echo "PASS: authenticated origin-less mutation is rejected"

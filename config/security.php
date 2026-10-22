<?php
// SiteBuilder access boundary.
// Local development remains frictionless on loopback. Any non-loopback deployment
// MUST configure SITEBUILDER_ADMIN_PASSWORD before the editor/API can be accessed.
function sb_start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_name('sitebuilder_admin');
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
    } else {
        // PHP < 7.3 has no array form and no SameSite support.
        session_set_cookie_params(0, '/', '', $secure, true);
    }
    session_start();
}

function sb_admin_password(): string {
    $password = getenv('SITEBUILDER_ADMIN_PASSWORD');
    return is_string($password) ? $password : '';
}

function sb_is_loopback_request(): bool {
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
    // Require both a loopback peer and a loopback Host. This avoids accidentally
    // trusting remote users when a reverse proxy connects from 127.0.0.1.
    $host = preg_replace('/:\d+$/', '', $host);
    return in_array($ip, ['127.0.0.1', '::1'], true)
        && in_array($host, ['localhost', '127.0.0.1', '[::1]', '::1'], true);
}

function sb_origin_matches_request(string $candidateUrl): bool {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $requestUrl = $scheme . '://' . (string) ($_SERVER['HTTP_HOST'] ?? '');
    $request = parse_url($requestUrl);
    $candidate = parse_url($candidateUrl);
    if (!is_array($request) || !is_array($candidate) || empty($request['host']) || empty($candidate['host'])) return false;
    if (strtolower((string) ($candidate['scheme'] ?? '')) !== $scheme) return false;
    $requestPort = (int) ($request['port'] ?? ($scheme === 'https' ? 443 : 80));
    $candidatePort = (int) ($candidate['port'] ?? ($scheme === 'https' ? 443 : 80));
    return strtolower((string) $request['host']) === strtolower((string) $candidate['host']) && $requestPort === $candidatePort;
}

function sb_security_headers(): void {
    if (headers_sent()) return;
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('X-Frame-Options: SAMEORIGIN');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
}

function sb_require_admin_access(bool $json = false): void {
    sb_start_session();
    sb_security_headers();
    $password = sb_admin_password();

    if ($password === '' && !sb_is_loopback_request()) {
        http_response_code(503);
        if ($json) {
            header('Content-Type: application/json; charset=UTF-8');
            echo json_encode(['error' => 'Remote access is disabled until SITEBUILDER_ADMIN_PASSWORD is configured.']);
        } else {
            header('Content-Type: text/plain; charset=UTF-8');
            echo 'SiteBuilder is in local-development mode. Configure SITEBUILDER_ADMIN_PASSWORD before remote access.';
        }
        exit;
    }

    if ($password !== '' && empty($_SESSION['sb_admin_authenticated'])) {
        if ($json) {
            http_response_code(401);
            header('Content-Type: application/json; charset=UTF-8');
            echo json_encode(['error' => 'Authentication required. Sign in to SiteBuilder and retry.']);
        } else {
            $returnTo = rawurlencode((string) ($_SERVER['REQUEST_URI'] ?? 'index.php'));
            header('Location: login.php?return=' . $returnTo, true, 302);
        }
        exit;
    }

    // Protect cookie-authenticated writes against cross-origin browser requests.
    if (in_array(strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')), ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
        $referer = (string) ($_SERVER['HTTP_REFERER'] ?? '');
        $candidateUrl = $origin !== '' ? $origin : ($password !== '' ? $referer : '');
        $originMissing = $password !== '' && $candidateUrl === '';
        $originMismatch = $candidateUrl !== '' && !sb_origin_matches_request($candidateUrl);
        if ($originMissing || $originMismatch) {
            http_response_code(403);
            if ($json) {
                header('Content-Type: application/json; charset=UTF-8');
                echo json_encode(['error' => 'Cross-origin or origin-less mutation rejected.']);
            } else {
                echo 'Cross-origin or origin-less mutation rejected.';
            }
            exit;
        }
    }
}

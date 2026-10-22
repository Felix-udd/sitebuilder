<?php
require_once __DIR__ . '/config/security.php';
sb_start_session();
sb_security_headers();
$password = sb_admin_password();
$error = '';
$returnTo = (string) ($_GET['return'] ?? $_POST['return'] ?? 'index.php');
if (!preg_match('~^(?:index\.php|editor\.php(?:\?[^#\r\n]*)?|/(?:[A-Za-z0-9_-]+/)*(?:index|editor)\.php(?:\?[^#\r\n]*)?)$~', $returnTo)) $returnTo = 'index.php';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $submitted = (string) ($_POST['password'] ?? '');
    if ($password !== '' && hash_equals($password, $submitted)) {
        session_regenerate_id(true);
        $_SESSION['sb_admin_authenticated'] = true;
        header('Location: ' . $returnTo, true, 303);
        exit;
    }
    $error = $password === '' ? 'Configure SITEBUILDER_ADMIN_PASSWORD in your server environment first.' : 'Incorrect password.';
}
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in — SiteBuilder</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f1f5f9;color:#0f172a;font:16px system-ui,sans-serif}.card{width:min(420px,calc(100% - 40px));box-sizing:border-box;background:white;border:1px solid #e2e8f0;border-radius:16px;padding:28px;box-shadow:0 20px 60px #0f172a12}h1{margin:0 0 8px;font-size:24px}p{color:#64748b;line-height:1.5}label{display:block;font-size:13px;font-weight:650;margin:18px 0 6px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}button{margin-top:16px;width:100%;padding:12px;border:0;border-radius:8px;background:#146ef5;color:white;font:inherit;font-weight:700;cursor:pointer}.error{color:#b91c1c;background:#fef2f2;padding:10px;border-radius:8px;font-size:13px}</style></head><body><main class="card"><h1>SiteBuilder</h1><p>Sign in to access the website builder.</p><?php if ($error !== ''): ?><div class="error"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?><form method="post"><input type="hidden" name="return" value="<?= htmlspecialchars($returnTo, ENT_QUOTES, 'UTF-8') ?>"><label for="password">Administrator password</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">Sign in</button></form></main></body></html>

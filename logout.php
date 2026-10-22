<?php
require_once __DIR__ . '/config/security.php';
sb_start_session();
$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params['path'], '', $params['secure'], $params['httponly']);
}
session_destroy();
header('Location: login.php', true, 303);
exit;

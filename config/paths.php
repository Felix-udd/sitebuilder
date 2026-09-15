<?php
// Works out the web-accessible base path of the app (e.g. "/sitebuilder"),
// so generated URLs (like uploaded image paths) are correct no matter what
// folder name you installed SiteBuilder under, or whether it's at the web
// root. Needed because pages get viewed from several different depths:
// editor.html (root), api/preview.php (one level down), and
// published/<slug>.html (also one level down).

function app_base_url() {
    static $base = null;
    if ($base !== null) {
        return $base;
    }

    $documentRoot = isset($_SERVER['DOCUMENT_ROOT']) ? realpath($_SERVER['DOCUMENT_ROOT']) : false;
    $appRoot = realpath(__DIR__ . '/..');

    if (!$documentRoot || !$appRoot) {
        $base = '';
        return $base;
    }

    $documentRoot = rtrim(str_replace('\\', '/', $documentRoot), '/');
    $appRoot = rtrim(str_replace('\\', '/', $appRoot), '/');

    if (strpos($appRoot, $documentRoot) === 0) {
        $base = substr($appRoot, strlen($documentRoot));
    } else {
        $base = '';
    }

    return $base;
}

define('UPLOADS_DIR', __DIR__ . '/../uploads');
define('UPLOADS_URL', app_base_url() . '/uploads');

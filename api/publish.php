<?php
require_once __DIR__ . '/../config/security.php';
sb_require_admin_access(true);
header('Content-Type: application/json');
require_once __DIR__ . '/../config/db.php';

$conn = get_db_connection();

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
$id = isset($data['id']) ? (int) $data['id'] : 0;

if ($id <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing or invalid id']);
    exit;
}

$stmt = $conn->prepare('SELECT name, slug, content FROM pages WHERE id = ?');
$stmt->bind_param('i', $id);
$stmt->execute();
$page = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$page) {
    http_response_code(404);
    echo json_encode(['error' => 'Page not found']);
    exit;
}

$content = json_decode($page['content'], true);

if (isset($content['version']) && $content['version'] === 2 && isset($content['page'])) {
    // v2 IR → new compiler
    require_once __DIR__ . '/../includes/compiler.php';
    $content['submitUrl'] = '../api/submit.php';
    $content['dbPageId'] = $id;
    $html = compile_page($content);
} else {
    // Legacy v1 format → old renderer
    require_once __DIR__ . '/../includes/render.php';
    $html = render_page($page['name'], $content['blocks'] ?? [], $content['settings'] ?? []);
}

$publishedDir = __DIR__ . '/../published';
if (!is_dir($publishedDir)) {
    mkdir($publishedDir, 0755, true);
}

$filename = basename($page['slug']) . '.html';
$filepath = $publishedDir . '/' . $filename;

if (file_put_contents($filepath, $html) === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not write published file. Check folder permissions.']);
    exit;
}

$stmt = $conn->prepare('UPDATE pages SET is_published = 1 WHERE id = ?');
$stmt->bind_param('i', $id);
$stmt->execute();
$stmt->close();

echo json_encode([
    'success' => true,
    'url' => 'published/' . $filename
]);

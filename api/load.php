<?php
require_once __DIR__ . '/../config/security.php';
sb_require_admin_access(true);
header('Content-Type: application/json');
require_once __DIR__ . '/../config/db.php';

$conn = get_db_connection();

$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
if ($id <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing or invalid id']);
    exit;
}

$stmt = $conn->prepare('SELECT id, name, slug, content, is_published FROM pages WHERE id = ?');
$stmt->bind_param('i', $id);
$stmt->execute();
$result = $stmt->get_result();
$page = $result->fetch_assoc();
$stmt->close();

if (!$page) {
    http_response_code(404);
    echo json_encode(['error' => 'Page not found']);
    exit;
}

$page['content'] = json_decode($page['content'], true);
$page['is_published'] = (bool) $page['is_published'];

echo json_encode($page);

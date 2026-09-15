<?php
require_once __DIR__ . '/../includes/render.php';
require_once __DIR__ . '/../config/db.php';

// Preview can come from a saved page id, or from raw content posted
// directly by the editor (so you can preview before saving).

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    $name = $data['name'] ?? 'Untitled Page';
    $content = $data['content'] ?? ['blocks' => [], 'settings' => []];
} else {
    $conn = get_db_connection();
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    $stmt = $conn->prepare('SELECT name, content FROM pages WHERE id = ?');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $page = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$page) {
        http_response_code(404);
        echo 'Page not found';
        exit;
    }

    $name = $page['name'];
    $content = json_decode($page['content'], true);
}

header('Content-Type: text/html; charset=UTF-8');
echo render_page($name, $content['blocks'] ?? [], $content['settings'] ?? []);

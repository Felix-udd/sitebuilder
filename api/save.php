<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/db.php';

$conn = get_db_connection();

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data) || empty($data['name'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing required field: name']);
    exit;
}

$id      = isset($data['id']) ? (int) $data['id'] : 0;
$name    = trim($data['name']);
$content = json_encode($data['content'] ?? ['blocks' => [], 'settings' => []]);

function make_slug($conn, $name, $excludeId = 0) {
    $base = strtolower(trim($name));
    $base = preg_replace('/[^a-z0-9]+/', '-', $base);
    $base = trim($base, '-');
    $base = substr($base, 0, 180); // leave room for a "-N" de-duplication suffix
    if ($base === '') {
        $base = 'page';
    }

    $slug = $base;
    $i = 1;
    while (true) {
        $stmt = $conn->prepare('SELECT id FROM pages WHERE slug = ? AND id != ? LIMIT 1');
        $stmt->bind_param('si', $slug, $excludeId);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result->num_rows === 0) {
            $stmt->close();
            return $slug;
        }
        $stmt->close();
        $i++;
        $slug = $base . '-' . $i;
    }
}

if ($id > 0) {
    // Update existing page
    $stmt = $conn->prepare('UPDATE pages SET name = ?, content = ? WHERE id = ?');
    $stmt->bind_param('ssi', $name, $content, $id);
    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save: ' . $stmt->error]);
        exit;
    }
    $stmt->close();

    $stmt = $conn->prepare('SELECT slug FROM pages WHERE id = ?');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $slug = $stmt->get_result()->fetch_assoc()['slug'] ?? '';
    $stmt->close();

    echo json_encode(['id' => $id, 'slug' => $slug]);
} else {
    // Create new page
    $slug = make_slug($conn, $name);
    $stmt = $conn->prepare('INSERT INTO pages (name, slug, content) VALUES (?, ?, ?)');
    $stmt->bind_param('sss', $name, $slug, $content);
    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create page: ' . $stmt->error]);
        exit;
    }
    $newId = $stmt->insert_id;
    $stmt->close();

    echo json_encode(['id' => $newId, 'slug' => $slug]);
}

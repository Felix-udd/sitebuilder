<?php
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

$stmt = $conn->prepare('SELECT slug FROM pages WHERE id = ?');
$stmt->bind_param('i', $id);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

if ($row) {
    $publishedFile = __DIR__ . '/../published/' . basename($row['slug']) . '.html';
    if (file_exists($publishedFile)) {
        unlink($publishedFile);
    }
}

$stmt = $conn->prepare('DELETE FROM pages WHERE id = ?');
$stmt->bind_param('i', $id);
$stmt->execute();
$stmt->close();

echo json_encode(['success' => true]);

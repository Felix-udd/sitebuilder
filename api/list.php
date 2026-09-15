<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/db.php';

$conn = get_db_connection();

$result = $conn->query('SELECT id, name, slug, is_published, updated_at FROM pages ORDER BY updated_at DESC');

$pages = [];
while ($row = $result->fetch_assoc()) {
    $row['is_published'] = (bool) $row['is_published'];
    $pages[] = $row;
}

echo json_encode($pages);

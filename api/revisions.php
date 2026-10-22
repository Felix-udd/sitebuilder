<?php
require_once __DIR__ . '/../config/security.php';
sb_require_admin_access(true);
header('Content-Type: application/json');
require_once __DIR__ . '/../config/db.php';

$conn = get_db_connection();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid id']);
        exit;
    }

    $stmt = $conn->prepare(
        'SELECT id, created_at, CHAR_LENGTH(content) AS size_bytes
         FROM page_revisions WHERE page_id = ? ORDER BY id DESC LIMIT 50'
    );
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $result = $stmt->get_result();

    $revisions = [];
    while ($row = $result->fetch_assoc()) {
        $revisions[] = [
            'id' => (int) $row['id'],
            'created_at' => $row['created_at'],
            'size_bytes' => (int) $row['size_bytes'],
        ];
    }
    $stmt->close();

    echo json_encode(['revisions' => $revisions]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $pageId = isset($data['pageId']) ? (int) $data['pageId'] : 0;
    $revisionId = isset($data['revisionId']) ? (int) $data['revisionId'] : 0;

    if ($pageId <= 0 || $revisionId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing pageId or revisionId']);
        exit;
    }

    $stmt = $conn->prepare('SELECT content FROM page_revisions WHERE id = ? AND page_id = ? LIMIT 1');
    $stmt->bind_param('ii', $revisionId, $pageId);
    $stmt->execute();
    $revision = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$revision) {
        http_response_code(404);
        echo json_encode(['error' => 'Revision not found']);
        exit;
    }

    $stmt = $conn->prepare('SELECT content FROM pages WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $pageId);
    $stmt->execute();
    $current = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$current) {
        http_response_code(404);
        echo json_encode(['error' => 'Page not found']);
        exit;
    }

    // Preserve the current content so the restore itself can be undone
    if ($current['content'] !== $revision['content']) {
        $stmt = $conn->prepare('INSERT INTO page_revisions (page_id, content) VALUES (?, ?)');
        $stmt->bind_param('is', $pageId, $current['content']);
        $stmt->execute();
        $stmt->close();

        $prune = $conn->prepare(
            'DELETE FROM page_revisions WHERE page_id = ? AND id NOT IN ('
            . 'SELECT id FROM (SELECT id FROM page_revisions WHERE page_id = ? ORDER BY id DESC LIMIT 30) keep)'
        );
        $prune->bind_param('ii', $pageId, $pageId);
        $prune->execute();
        $prune->close();
    }

    $stmt = $conn->prepare('UPDATE pages SET content = ? WHERE id = ?');
    $stmt->bind_param('si', $revision['content'], $pageId);
    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode(['error' => 'Could not restore revision']);
        exit;
    }
    $stmt->close();

    echo json_encode([
        'success' => true,
        'content' => json_decode($revision['content'], true),
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);

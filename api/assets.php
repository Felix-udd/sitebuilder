<?php
// Media library endpoints. Lists tracked uploads and deletes an asset
// (database row + file on disk). Administrator-only.
require_once __DIR__ . '/../config/security.php';
sb_require_admin_access(true);
header('Content-Type: application/json');
require_once __DIR__ . '/../config/paths.php';
require_once __DIR__ . '/../config/db.php';

$conn = get_db_connection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $query = isset($_GET['q']) ? trim((string) $_GET['q']) : '';
    $stmt = $conn->prepare('SELECT id, filename, url, mime_type, size_bytes, created_at FROM assets ORDER BY created_at DESC, id DESC');
    $stmt->execute();
    $result = $stmt->get_result();

    $assets = [];
    while ($row = $result->fetch_assoc()) {
        $row['id'] = (int) $row['id'];
        $row['size_bytes'] = (int) $row['size_bytes'];
        $row['exists'] = is_file(UPLOADS_DIR . '/' . basename($row['filename']));
        if ($query !== '' && stripos((string) $row['filename'], $query) === false) {
            continue;
        }
        $assets[] = $row;
    }
    $stmt->close();

    echo json_encode(['assets' => $assets]);
    exit;
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        $data = $_POST;
    }

    $action = isset($data['action']) ? (string) $data['action'] : '';
    $id = isset($data['id']) ? (int) $data['id'] : 0;

    if ($action === 'delete' && $id > 0) {
        $stmt = $conn->prepare('SELECT filename, url FROM assets WHERE id = ?');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $asset = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$asset) {
            http_response_code(404);
            echo json_encode(['error' => 'Asset not found.']);
            exit;
        }

        // Refuse to delete a file that is still referenced by a page (unless forced).
        $usedOn = [];
        $pagesResult = $conn->query('SELECT name, content FROM pages');
        if ($pagesResult) {
            while ($pageRow = $pagesResult->fetch_assoc()) {
                if ($asset['url'] !== '' && strpos((string) $pageRow['content'], (string) $asset['url']) !== false) {
                    $usedOn[] = $pageRow['name'];
                }
            }
        }
        if ($usedOn && empty($data['force'])) {
            http_response_code(409);
            echo json_encode([
                'error' => 'This image is still used on: ' . implode(', ', array_slice($usedOn, 0, 3)) . (count($usedOn) > 3 ? '…' : '') . '. Remove it from those pages first.',
                'usedOn' => $usedOn
            ]);
            exit;
        }

        $filename = basename((string) $asset['filename']);
        $fileDeleted = false;
        if ($filename !== '' && $filename !== '.' && $filename !== '..') {
            $path = UPLOADS_DIR . '/' . $filename;
            if (is_file($path)) {
                $fileDeleted = @unlink($path);
            }
        }

        $stmt = $conn->prepare('DELETE FROM assets WHERE id = ?');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $stmt->close();

        echo json_encode(['success' => true, 'fileDeleted' => $fileDeleted]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['error' => 'Unknown action.']);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed.']);

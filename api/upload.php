<?php
require_once __DIR__ . '/../config/security.php';
sb_require_admin_access(true);
header('Content-Type: application/json');
require_once __DIR__ . '/../config/paths.php';
require_once __DIR__ . '/../config/db.php';

define('MAX_BYTES', 5 * 1024 * 1024); // 5MB
define('ALLOWED_MIME', [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/gif'  => 'gif',
    'image/webp' => 'webp',
]);

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || empty($_FILES['image'])) {
    http_response_code(400);
    echo json_encode(['error' => 'No image file was received.']);
    exit;
}

$file = $_FILES['image'];

if ($file['error'] !== UPLOAD_ERR_OK) {
    $messages = [
        UPLOAD_ERR_INI_SIZE   => 'That file is larger than the server allows.',
        UPLOAD_ERR_FORM_SIZE  => 'That file is larger than allowed.',
        UPLOAD_ERR_PARTIAL    => 'The upload was interrupted. Try again.',
        UPLOAD_ERR_NO_FILE    => 'No file was selected.',
    ];
    http_response_code(400);
    echo json_encode(['error' => $messages[$file['error']] ?? 'Upload failed.']);
    exit;
}

if ($file['size'] > MAX_BYTES) {
    http_response_code(400);
    echo json_encode(['error' => 'Images must be 5MB or smaller.']);
    exit;
}

// Verify the actual file content, not just the client-supplied name/type.
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($file['tmp_name']);

if (!isset(ALLOWED_MIME[$mime])) {
    http_response_code(400);
    echo json_encode(['error' => 'Only JPG, PNG, GIF, and WEBP images are supported.']);
    exit;
}

if (!is_dir(UPLOADS_DIR)) {
    mkdir(UPLOADS_DIR, 0755, true);
}

$ext = ALLOWED_MIME[$mime];
$filename = bin2hex(random_bytes(8)) . '.' . $ext;
$destination = UPLOADS_DIR . '/' . $filename;

if (!move_uploaded_file($file['tmp_name'], $destination)) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not save the file. Check that the uploads/ folder is writable.']);
    exit;
}

// Track the upload so the asset manager can list it
$assetId = 0;
try {
    $conn = get_db_connection();
    $url = UPLOADS_URL . '/' . $filename;
    $stmt = $conn->prepare('INSERT INTO assets (filename, url, mime_type, size_bytes) VALUES (?, ?, ?, ?)');
    $size = (int) $file['size'];
    $stmt->bind_param('sssi', $filename, $url, $mime, $size);
    if ($stmt->execute()) {
        $assetId = $stmt->insert_id;
    }
    $stmt->close();
} catch (Throwable $e) {
    // Asset bookkeeping is non-critical; the upload still succeeded.
}

echo json_encode([
    'success' => true,
    'id' => $assetId,
    'url' => UPLOADS_URL . '/' . $filename,
]);

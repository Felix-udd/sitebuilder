<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON body']);
    exit;
}

$pageId = isset($data['pageId']) ? (int) $data['pageId'] : 0;
$formId = substr(trim((string) ($data['formId'] ?? '')), 0, 64);
$fields = $data['data'] ?? [];

if ($pageId <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing page id']);
    exit;
}

if (!is_array($fields) || count($fields) > 100) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid form data']);
    exit;
}

// Bound the payload size to prevent abuse
$encoded = json_encode($fields, JSON_UNESCAPED_UNICODE);
if ($encoded === false || strlen($encoded) > 65536) {
    http_response_code(413);
    echo json_encode(['error' => 'Submission is too large']);
    exit;
}

// Lightweight per-client rate limit for the intentionally public form endpoint.
// The key is a one-way hash; raw client IPs are not persisted.
$rateDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'sitebuilder-submit-rate';
if (!is_dir($rateDir)) @mkdir($rateDir, 0700, true);
$ipKey = hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . '|' . (string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
$rateFile = $rateDir . DIRECTORY_SEPARATOR . $ipKey . '.json';
$now = time();
$rate = ['start' => $now, 'count' => 0];
if (is_file($rateFile)) {
    $saved = json_decode((string) @file_get_contents($rateFile), true);
    if (is_array($saved) && isset($saved['start'], $saved['count']) && ($now - (int) $saved['start']) < 600) $rate = $saved;
}
$rate['count'] = (int) $rate['count'] + 1;
if ($rate['count'] > 10) {
    http_response_code(429);
    header('Retry-After: 600');
    echo json_encode(['error' => 'Too many submissions. Please try again later.']);
    exit;
}
@file_put_contents($rateFile, json_encode($rate), LOCK_EX);

$conn = get_db_connection();

// Verify the page exists (protects the foreign key and prevents spam to random ids)
$stmt = $conn->prepare('SELECT id FROM pages WHERE id = ? LIMIT 1');
$stmt->bind_param('i', $pageId);
$stmt->execute();
$exists = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$exists) {
    http_response_code(404);
    echo json_encode(['error' => 'Page not found']);
    exit;
}

$stmt = $conn->prepare('INSERT INTO form_submissions (page_id, form_id, data) VALUES (?, ?, ?)');
$stmt->bind_param('iss', $pageId, $formId, $encoded);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not store submission']);
    $stmt->close();
    exit;
}
$stmt->close();

echo json_encode(['success' => true]);

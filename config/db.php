<?php
// Database connection settings.
// Default XAMPP values: host localhost, user root, empty password.
// Change these if your setup is different.

define('DB_HOST', 'localhost');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'sitebuilder');

function get_db_connection() {
    static $conn = null;

    if ($conn !== null) {
        return $conn;
    }

    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);

    if ($conn->connect_error) {
        http_response_code(500);
        header('Content-Type: application/json');
        error_log('SiteBuilder database connection failed: ' . $conn->connect_error);
        echo json_encode([
            'error' => 'Database connection failed. Check the server configuration and logs.'
        ]);
        exit;
    }

    $conn->set_charset('utf8mb4');
    return $conn;
}

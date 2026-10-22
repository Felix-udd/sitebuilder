<?php
// Unit-level checks for access policy primitives.
require_once __DIR__ . '/../config/security.php';
$_SERVER['REMOTE_ADDR'] = '203.0.113.20';
if (sb_is_loopback_request()) { fwrite(STDERR, "FAIL: remote address misclassified as loopback\n"); exit(1); }
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
$_SERVER['HTTP_HOST'] = 'public.example.com';
if (sb_is_loopback_request()) { fwrite(STDERR, "FAIL: loopback reverse proxy trusted for a public Host\n"); exit(1); }
$_SERVER['HTTP_HOST'] = 'localhost:8080';
$_SERVER['HTTPS'] = 'off';
if (!sb_origin_matches_request('http://localhost:8080/login.php') || sb_origin_matches_request('http://localhost:8081/login.php')) { fwrite(STDERR, "FAIL: origin validation ignored port differences\n"); exit(1); }
if (!sb_is_loopback_request()) { fwrite(STDERR, "FAIL: local XAMPP host not recognized\n"); exit(1); }
$_SERVER['REMOTE_ADDR'] = '203.0.113.20';
putenv('SITEBUILDER_ADMIN_PASSWORD=smoke-test-secret');
if (sb_admin_password() !== 'smoke-test-secret') { fwrite(STDERR, "FAIL: configured password not read\n"); exit(1); }
putenv('SITEBUILDER_ADMIN_PASSWORD');
if (sb_admin_password() !== '') { fwrite(STDERR, "FAIL: unset password not handled\n"); exit(1); }
echo "PASS: remote requests are distinguished from loopback\nPASS: reverse-proxy loopback does not bypass public-host protection\nPASS: local XAMPP host is recognized\nPASS: origin checks compare scheme, host and port\nPASS: deployment password configuration is read from the environment\n";

<?php
declare(strict_types=1);

require_once __DIR__ . '/_auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$key = trim((string)(geocad_config()['google_maps_key'] ?? ''));

if ($key === '') {
    http_response_code(503);
    echo json_encode([
        'ok' => false,
        'error' => 'Chiave Google Maps non configurata sul server'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

echo json_encode([
    'ok' => true,
    'key' => $key
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

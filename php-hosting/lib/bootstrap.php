<?php
declare(strict_types=1);

$configFile = dirname(__DIR__) . '/config/config.php';
if (!is_file($configFile)) {
    http_response_code(500);
    exit('GeoCAD non configurato: manca config/config.php');
}

$config = require $configFile;
if (!is_array($config)) {
    http_response_code(500);
    exit('Configurazione GeoCAD non valida.');
}

$days = max(1, (int)($config['session_lifetime_days'] ?? 30));
$lifetime = $days * 86400;
$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');

session_name((string)($config['session_name'] ?? 'phillo_geocad'));
session_set_cookie_params([
    'lifetime' => $lifetime,
    'path' => '/',
    'secure' => $secure,
    'httponly' => true,
    'samesite' => 'Lax',
]);
ini_set('session.gc_maxlifetime', (string)$lifetime);
session_start();

function geocad_config(): array {
    global $config;
    return $config;
}

function geocad_csrf_token(): string {
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function geocad_csrf_valid(?string $token): bool {
    return is_string($token)
        && isset($_SESSION['csrf'])
        && hash_equals($_SESSION['csrf'], $token);
}

<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !geocad_csrf_valid($_POST['csrf'] ?? null)) {
    http_response_code(405);
    exit('Richiesta non valida.');
}

geocad_logout();
header('Location: login.php');
exit;

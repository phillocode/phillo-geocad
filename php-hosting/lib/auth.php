<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function geocad_is_logged_in(): bool {
    return !empty($_SESSION['geocad_user']);
}

function geocad_user(): ?string {
    return geocad_is_logged_in() ? (string)$_SESSION['geocad_user'] : null;
}

function geocad_require_login(bool $json = false): void {
    if (geocad_is_logged_in()) {
        return;
    }

    if ($json) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'Autenticazione richiesta']);
        exit;
    }

    $next = rawurlencode($_SERVER['REQUEST_URI'] ?? '/');
    header('Location: login.php?next=' . $next);
    exit;
}

function geocad_attempt_login(string $username, string $password): bool {
    $users = geocad_config()['users'] ?? [];
    $hash = $users[$username] ?? null;

    if (!is_string($hash) || $hash === '' || !password_verify($password, $hash)) {
        usleep(250000);
        return false;
    }

    session_regenerate_id(true);
    $_SESSION['geocad_user'] = $username;
    $_SESSION['login_time'] = time();
    return true;
}

function geocad_logout(): void {
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'] ?? '', (bool)$p['secure'], (bool)$p['httponly']);
    }

    session_destroy();
}

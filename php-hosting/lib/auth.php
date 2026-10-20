<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/db.php';

function geocad_is_logged_in(): bool {
    return !empty($_SESSION['geocad_user']);
}

function geocad_user(): ?string {
    return geocad_is_logged_in() ? (string)$_SESSION['geocad_user'] : null;
}

function geocad_current_user(): ?array {
    if (!geocad_is_logged_in()) return null;

    if (geocad_db_ready()) {
        try {
            $pdo = geocad_db();
            if (!empty($_SESSION['geocad_user_id'])) {
                $stmt = $pdo->prepare('SELECT id,username,email,role,project_limit,active FROM users WHERE id=? LIMIT 1');
                $stmt->execute([(int)$_SESSION['geocad_user_id']]);
            } else {
                $stmt = $pdo->prepare('SELECT id,username,email,role,project_limit,active FROM users WHERE username=? LIMIT 1');
                $stmt->execute([(string)$_SESSION['geocad_user']]);
            }
            $user = $stmt->fetch();
            if (!$user || !(int)$user['active']) return null;

            $_SESSION['geocad_user_id'] = (int)$user['id'];
            $_SESSION['geocad_user'] = (string)$user['username'];
            $_SESSION['geocad_role'] = (string)$user['role'];
            $_SESSION['geocad_project_limit'] = (int)$user['project_limit'];
            return $user;
        } catch (Throwable $e) {
            return null;
        }
    }

    return [
        'id' => null,
        'username' => (string)$_SESSION['geocad_user'],
        'email' => '',
        'role' => 'admin',
        'project_limit' => 1,
        'active' => 1,
    ];
}

function geocad_is_admin(): bool {
    $user = geocad_current_user();
    return $user && ($user['role'] ?? '') === 'admin';
}

function geocad_require_login(bool $json = false): void {
    if (geocad_is_logged_in() && geocad_current_user()) return;

    geocad_logout();

    if ($json) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'Autenticazione richiesta']);
        exit;
    }

    $next = rawurlencode($_SERVER['REQUEST_URI'] ?? '/');
    header('Location: /login.php?next=' . $next);
    exit;
}

function geocad_require_admin(): void {
    geocad_require_login();
    if (!geocad_is_admin()) {
        http_response_code(403);
        exit('Accesso riservato agli amministratori.');
    }
}

function geocad_attempt_login(string $login, string $password): bool {
    $login = trim($login);

    if (geocad_db_ready()) {
        try {
            $pdo = geocad_db();
            $stmt = $pdo->prepare('SELECT id,username,email,password_hash,role,project_limit,active FROM users WHERE (username=? OR email=?) LIMIT 1');
            $stmt->execute([$login, strtolower($login)]);
            $user = $stmt->fetch();

            if (!$user || !(int)$user['active'] || !password_verify($password, (string)$user['password_hash'])) {
                usleep(250000);
                return false;
            }

            if (password_needs_rehash((string)$user['password_hash'], PASSWORD_DEFAULT)) {
                $pdo->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([
                    password_hash($password, PASSWORD_DEFAULT),
                    (int)$user['id']
                ]);
            }

            $pdo->prepare('UPDATE users SET last_login_at=NOW() WHERE id=?')->execute([(int)$user['id']]);

            session_regenerate_id(true);
            $_SESSION['geocad_user_id'] = (int)$user['id'];
            $_SESSION['geocad_user'] = (string)$user['username'];
            $_SESSION['geocad_role'] = (string)$user['role'];
            $_SESSION['geocad_project_limit'] = (int)$user['project_limit'];
            $_SESSION['login_time'] = time();
            return true;
        } catch (Throwable $e) {
            error_log('GeoCAD login DB: ' . $e->getMessage());
            usleep(250000);
            return false;
        }
    }

    // Compatibilità temporanea con la fase iniziale, prima dell'installazione MySQL.
    $users = geocad_config()['users'] ?? [];
    $hash = is_array($users) ? ($users[$login] ?? null) : null;
    if (!is_string($hash) || $hash === '' || !password_verify($password, $hash)) {
        usleep(250000);
        return false;
    }

    session_regenerate_id(true);
    $_SESSION['geocad_user'] = $login;
    $_SESSION['geocad_role'] = 'admin';
    $_SESSION['geocad_project_limit'] = 1;
    $_SESSION['login_time'] = time();
    return true;
}

function geocad_logout(): void {
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'] ?? '', (bool)$p['secure'], (bool)$p['httponly']);
    }

    if (session_status() === PHP_SESSION_ACTIVE) session_destroy();
}

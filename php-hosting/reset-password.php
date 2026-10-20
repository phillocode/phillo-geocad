<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/db.php';

$token = trim((string)($_GET['token'] ?? $_POST['token'] ?? ''));
$error = '';
$done = false;
$reset = null;

if ($token !== '' && preg_match('/^[a-f0-9]{64}$/i', $token) && geocad_db_ready()) {
    try {
        $pdo = geocad_db();
        $stmt = $pdo->prepare('SELECT pr.id,pr.user_id,u.username FROM password_resets pr JOIN users u ON u.id=pr.user_id WHERE pr.token_hash=? AND pr.used_at IS NULL AND pr.expires_at > NOW() AND u.active=1 LIMIT 1');
        $stmt->execute([hash('sha256', $token)]);
        $reset = $stmt->fetch() ?: null;
    } catch (Throwable $e) {
        $error = 'Servizio temporaneamente non disponibile.';
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $reset) {
    if (!geocad_csrf_valid($_POST['csrf'] ?? null)) {
        $error = 'Sessione non valida. Ricarica la pagina.';
    } else {
        $password = (string)($_POST['password'] ?? '');
        $confirm = (string)($_POST['confirm'] ?? '');
        if (strlen($password) < 10) {
            $error = 'La password deve contenere almeno 10 caratteri.';
        } elseif ($password !== $confirm) {
            $error = 'Le due password non coincidono.';
        } else {
            try {
                $pdo->beginTransaction();
                $pdo->prepare('UPDATE users SET password_hash=? WHERE id=?')->execute([password_hash($password, PASSWORD_DEFAULT), (int)$reset['user_id']]);
                $pdo->prepare('UPDATE password_resets SET used_at=NOW() WHERE id=?')->execute([(int)$reset['id']]);
                $pdo->prepare('DELETE FROM password_resets WHERE user_id=? AND id<>?')->execute([(int)$reset['user_id'], (int)$reset['id']]);
                $pdo->commit();
                $done = true;
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                $error = 'Non è stato possibile aggiornare la password.';
            }
        }
    }
}
?>
<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nuova password · Phillo GeoCAD</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101d26;color:#eef7f8;font:15px system-ui,Arial}.card{width:min(92vw,420px);background:#142b35;border:1px solid #31515a;border-radius:14px;padding:24px}.err{padding:10px;background:#3a2225;border-left:3px solid #ff857a}.ok{padding:10px;background:#173a32;border-left:3px solid #65e0bd}input,button{width:100%;padding:12px;border-radius:8px;font:inherit}input{margin:6px 0 12px;border:1px solid #53727b;background:#17333e;color:#fff}button{border:1px solid #52e5d3;background:#0c948e;color:#fff;font-weight:650}a{color:#78ddd3}</style>
</head><body><div class="card"><h1>Nuova password</h1>
<?php if($done): ?><div class="ok">Password aggiornata correttamente.</div><p><a href="/login.php">Accedi a GeoCAD</a></p>
<?php elseif(!$reset): ?><div class="err">Il link non è valido oppure è scaduto.</div><p><a href="/forgot-password.php">Richiedi un nuovo link</a></p>
<?php else: ?>
<?php if($error): ?><div class="err"><?= htmlspecialchars($error,ENT_QUOTES,'UTF-8') ?></div><?php endif; ?>
<form method="post"><p>Account: <strong><?= htmlspecialchars((string)$reset['username'],ENT_QUOTES,'UTF-8') ?></strong></p>
<label>Nuova password</label><input type="password" name="password" minlength="10" autocomplete="new-password" required>
<label>Ripeti password</label><input type="password" name="confirm" minlength="10" autocomplete="new-password" required>
<input type="hidden" name="token" value="<?= htmlspecialchars($token,ENT_QUOTES,'UTF-8') ?>">
<input type="hidden" name="csrf" value="<?= htmlspecialchars(geocad_csrf_token(),ENT_QUOTES,'UTF-8') ?>">
<button>Aggiorna password</button></form><?php endif; ?></div></body></html>

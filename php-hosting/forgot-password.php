<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/mailer.php';

$message = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!geocad_csrf_valid($_POST['csrf'] ?? null)) {
        $message = 'Ricarica la pagina e riprova.';
    } else {
        $email = strtolower(trim((string)($_POST['email'] ?? '')));
        if (geocad_db_ready() && filter_var($email, FILTER_VALIDATE_EMAIL)) {
            try {
                $pdo = geocad_db();
                $stmt = $pdo->prepare('SELECT id,username,email FROM users WHERE email=? AND active=1 LIMIT 1');
                $stmt->execute([$email]);
                $user = $stmt->fetch();

                if ($user) {
                    $recent = $pdo->prepare('SELECT COUNT(*) FROM password_resets WHERE user_id=? AND created_at > DATE_SUB(NOW(), INTERVAL 60 SECOND)');
                    $recent->execute([(int)$user['id']]);
                    if ((int)$recent->fetchColumn() === 0) {
                        $token = bin2hex(random_bytes(32));
                        $hash = hash('sha256', $token);
                        $minutes = max(10, (int)(geocad_config()['password_reset_minutes'] ?? 30));
                        $pdo->prepare('DELETE FROM password_resets WHERE user_id=? OR expires_at < NOW()')->execute([(int)$user['id']]);
                        $expiresAt = (new DateTimeImmutable('now'))->modify('+' . $minutes . ' minutes')->format('Y-m-d H:i:s');
                        $ins = $pdo->prepare('INSERT INTO password_resets (user_id,token_hash,expires_at) VALUES (?,?,?)');
                        $ins->execute([(int)$user['id'], $hash, $expiresAt]);

                        $base = rtrim((string)(geocad_config()['base_url'] ?? ''), '/');
                        if ($base === '') {
                            $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                            $base = $https . '://' . ($_SERVER['HTTP_HOST'] ?? 'geocad.rilievogps.it');
                        }
                        $url = $base . '/reset-password.php?token=' . rawurlencode($token);
                        if (!geocad_send_password_reset((string)$user['email'], (string)$user['username'], $url)) {
                            error_log('GeoCAD: invio email reset non riuscito per user_id=' . (int)$user['id']);
                        }
                    }
                }
            } catch (Throwable $e) {
                error_log('GeoCAD reset request: ' . $e->getMessage());
            }
        }
        usleep(250000);
        $message = 'Se l’indirizzo è associato a un utente attivo, riceverai un’email con il link per reimpostare la password.';
    }
}
?>
<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Password dimenticata · Phillo GeoCAD</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101d26;color:#eef7f8;font:15px system-ui,Arial}.card{width:min(92vw,420px);background:#142b35;border:1px solid #31515a;border-radius:14px;padding:24px}.msg{padding:10px;background:#173a32;border-left:3px solid #65e0bd;margin:12px 0}input,button{width:100%;padding:12px;border-radius:8px;font:inherit}input{border:1px solid #53727b;background:#17333e;color:#fff}button{margin-top:16px;border:1px solid #52e5d3;background:#0c948e;color:#fff;font-weight:650}a{color:#78ddd3}</style>
</head><body><form class="card" method="post"><h1>Recupera password</h1><p>Inserisci l’email associata al tuo account.</p>
<?php if($message): ?><div class="msg"><?= htmlspecialchars($message,ENT_QUOTES,'UTF-8') ?></div><?php endif; ?>
<input type="email" name="email" autocomplete="email" required placeholder="email@esempio.it">
<input type="hidden" name="csrf" value="<?= htmlspecialchars(geocad_csrf_token(),ENT_QUOTES,'UTF-8') ?>">
<button>Invia link di reset</button><p><a href="/login.php">Torna all’accesso</a></p></form></body></html>

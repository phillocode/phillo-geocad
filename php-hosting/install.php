<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/db.php';

geocad_require_login();

$error = '';
$success = '';
$dbConfigured = geocad_db_configured();
$dbReady = geocad_db_ready();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!geocad_csrf_valid($_POST['csrf'] ?? null)) {
        $error = 'Sessione non valida. Ricarica la pagina.';
    } elseif (!$dbConfigured) {
        $error = 'Prima configura il database in config/config.php.';
    } else {
        $email = trim((string)($_POST['admin_email'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $error = 'Inserisci un indirizzo email valido per l’amministratore.';
        } else {
            try {
                $pdo = geocad_db();
                geocad_install_schema($pdo);

                $count = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
                if ($count === 0) {
                    $username = geocad_user() ?: 'phillo';
                    $legacy = geocad_config()['users'] ?? [];
                    $hash = is_array($legacy) ? ($legacy[$username] ?? null) : null;
                    if (!is_string($hash) || $hash === '') {
                        throw new RuntimeException('Hash della password amministratore non trovato nel config.php.');
                    }
                    $stmt = $pdo->prepare('INSERT INTO users (username,email,password_hash,role,project_limit,active) VALUES (?,?,?,?,1,1)');
                    $stmt->execute([$username, strtolower($email), $hash, 'admin']);
                }

                $success = 'Database inizializzato. Utenti, reset password e progetti sono pronti.';
                $dbReady = true;
            } catch (Throwable $e) {
                $error = 'Installazione database non riuscita: ' . $e->getMessage();
            }
        }
    }
}
?>
<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Installazione · Phillo GeoCAD</title>
<style>*{box-sizing:border-box}body{margin:0;background:#101d26;color:#eef7f8;font:15px system-ui,Arial}.wrap{max-width:760px;margin:35px auto;padding:20px}.card{background:#142b35;border:1px solid #31515a;border-radius:14px;padding:22px;margin-bottom:16px}input,button{font:inherit}input{width:100%;padding:11px;border:1px solid #53727b;border-radius:7px;background:#17333e;color:#fff}button,.btn{display:inline-block;padding:10px 14px;border:1px solid #52e5d3;border-radius:8px;background:#0c948e;color:#fff;text-decoration:none}.err{background:#3a2225;border-left:3px solid #ff857a;padding:10px}.ok{background:#173a32;border-left:3px solid #65e0bd;padding:10px}code{color:#89ddd4}</style>
</head><body><main class="wrap"><div class="card"><h1>Phillo GeoCAD · Database</h1>
<p>Configurazione database: <strong><?= $dbConfigured ? 'presente' : 'mancante' ?></strong><br>Schema GeoCAD: <strong><?= $dbReady ? 'pronto' : 'da installare' ?></strong></p>
<?php if ($error): ?><div class="err"><?= htmlspecialchars($error,ENT_QUOTES,'UTF-8') ?></div><?php endif; ?>
<?php if ($success): ?><div class="ok"><?= htmlspecialchars($success,ENT_QUOTES,'UTF-8') ?></div><?php endif; ?>
<?php if (!$dbConfigured): ?><p>Aggiungi prima le credenziali MySQL nella sezione <code>database</code> di <code>config/config.php</code>.</p><?php elseif (!$dbReady): ?>
<form method="post"><label>Email amministratore</label><input type="email" name="admin_email" required>
<input type="hidden" name="csrf" value="<?= htmlspecialchars(geocad_csrf_token(),ENT_QUOTES,'UTF-8') ?>"><p><button>Inizializza database</button></p></form>
<?php else: ?><p><a class="btn" href="/admin/">Vai all’amministrazione</a> <a class="btn" href="/index.php">Apri GeoCAD</a></p><?php endif; ?>
</div></main></body></html>

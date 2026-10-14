<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/auth.php';

if (geocad_is_logged_in()) {
    header('Location: index.php');
    exit;
}

$error = '';
$next = $_GET['next'] ?? $_POST['next'] ?? 'index.php';
if (!is_string($next) || $next === '' || str_starts_with($next, 'http://') || str_starts_with($next, 'https://')) {
    $next = 'index.php';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!geocad_csrf_valid($_POST['csrf'] ?? null)) {
        $error = 'Sessione non valida. Ricarica la pagina.';
    } else {
        $username = trim((string)($_POST['username'] ?? ''));
        $password = (string)($_POST['password'] ?? '');
        if (geocad_attempt_login($username, $password)) {
            header('Location: ' . $next);
            exit;
        }
        $error = 'Utente o password non validi.';
    }
}
?>
<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accesso · Phillo GeoCAD</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101d26;color:#eef7f8;font:15px system-ui,Arial}.card{width:min(92vw,390px);background:#142b35;border:1px solid #31515a;border-radius:14px;padding:24px;box-shadow:0 12px 40px #0008}h1{margin:0 0 6px;font-size:23px}.sub{color:#9ec8d0;margin-bottom:22px}label{display:block;margin:12px 0 5px}input{width:100%;padding:12px;border:1px solid #53727b;border-radius:8px;background:#17333e;color:#fff;font-size:16px}button{width:100%;margin-top:18px;padding:12px;border:1px solid #52e5d3;border-radius:8px;background:#0c948e;color:white;font-weight:650}.err{margin:12px 0;padding:10px;border-left:3px solid #ff857a;background:#3a2225}</style>
</head>
<body>
<form class="card" method="post" autocomplete="on">
  <h1>Phillo GeoCAD</h1>
  <div class="sub">Accesso riservato</div>
  <?php if ($error): ?><div class="err"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
  <label for="username">Utente</label>
  <input id="username" name="username" autocomplete="username" required autofocus>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required>
  <input type="hidden" name="csrf" value="<?= htmlspecialchars(geocad_csrf_token(), ENT_QUOTES, 'UTF-8') ?>">
  <input type="hidden" name="next" value="<?= htmlspecialchars($next, ENT_QUOTES, 'UTF-8') ?>">
  <button type="submit">Accedi</button>
</form>
</body>
</html>

<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/auth.php';
geocad_require_login();

$checks = [
    'PHP >= 8.2' => version_compare(PHP_VERSION, '8.2.0', '>='),
    'SQLite3' => extension_loaded('sqlite3'),
    'PDO SQLite' => extension_loaded('pdo_sqlite'),
    'cURL' => extension_loaded('curl'),
    'ZIP' => extension_loaded('zip'),
    'OpenSSL' => extension_loaded('openssl'),
    'JSON' => extension_loaded('json'),
    'GD' => extension_loaded('gd'),
    '/tmp scrivibile' => is_writable(sys_get_temp_dir()),
];
?>
<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Phillo GeoCAD · Hosting PHP</title>
<style>
body{margin:0;background:#101d26;color:#eef7f8;font:15px system-ui,Arial}.wrap{max-width:800px;margin:auto;padding:22px}.top{display:flex;justify-content:space-between;gap:12px;align-items:center}.box{background:#142b35;border:1px solid #31515a;border-radius:12px;padding:18px;margin-top:18px}.ok{color:#65e0bd}.bad{color:#ff968e}button{padding:9px 12px;border:1px solid #4b7884;border-radius:7px;background:#244552;color:#fff}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #294650}</style>
</head>
<body><main class="wrap">
<div class="top">
  <div><h1 style="margin:0">Phillo GeoCAD</h1><div>Ambiente PHP protetto · fase 1</div></div>
  <form method="post" action="logout.php">
    <input type="hidden" name="csrf" value="<?= htmlspecialchars(geocad_csrf_token(), ENT_QUOTES, 'UTF-8') ?>">
    <button>Esci</button>
  </form>
</div>

<div class="box">
  <strong>Accesso riuscito.</strong><br>
  Utente: <?= htmlspecialchars((string)geocad_user(), ENT_QUOTES, 'UTF-8') ?><br>
  Questa pagina serve a verificare login, sessione HTTPS e compatibilità del server prima di migrare la mappa e le API.
</div>

<div class="box">
  <h2>Requisiti server</h2>
  <table>
  <?php foreach ($checks as $name => $state): ?>
    <tr><td><?= htmlspecialchars($name, ENT_QUOTES, 'UTF-8') ?></td><td class="<?= $state ? 'ok':'bad' ?>"><?= $state ? 'OK':'ATTENZIONE' ?></td></tr>
  <?php endforeach; ?>
  </table>
</div>
</main></body></html>

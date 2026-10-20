<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/auth.php';
require_once dirname(__DIR__) . '/lib/db.php';

geocad_require_admin();
if (!geocad_db_ready()) {
    header('Location: /install.php');
    exit;
}

$pdo = geocad_db();
$current = geocad_current_user();
$message = '';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!geocad_csrf_valid($_POST['csrf'] ?? null)) {
        $error = 'Sessione non valida. Ricarica la pagina.';
    } else {
        $action = (string)($_POST['action'] ?? '');

        try {
            if ($action === 'create' || $action === 'update') {
                $id = (int)($_POST['id'] ?? 0);
                $username = trim((string)($_POST['username'] ?? ''));
                $email = strtolower(trim((string)($_POST['email'] ?? '')));
                $role = ($_POST['role'] ?? 'user') === 'admin' ? 'admin' : 'user';
                $projectLimit = max(0, min(9999, (int)($_POST['project_limit'] ?? 1)));
                $active = isset($_POST['active']) ? 1 : 0;
                $password = (string)($_POST['password'] ?? '');

                if (!preg_match('/^[A-Za-z0-9._-]{3,80}$/', $username)) {
                    throw new RuntimeException('Username: usa almeno 3 caratteri tra lettere, numeri, punto, trattino e underscore.');
                }
                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    throw new RuntimeException('Indirizzo email non valido.');
                }
                if ($password !== '' && strlen($password) < 10) {
                    throw new RuntimeException('La password deve contenere almeno 10 caratteri.');
                }

                if ($action === 'create') {
                    $hash = $password !== ''
                        ? password_hash($password, PASSWORD_DEFAULT)
                        : password_hash(bin2hex(random_bytes(24)), PASSWORD_DEFAULT);

                    $stmt = $pdo->prepare('INSERT INTO users (username,email,password_hash,role,project_limit,active) VALUES (?,?,?,?,?,?)');
                    $stmt->execute([$username, $email, $hash, $role, $projectLimit, $active]);
                    $message = 'Utente creato. Se non hai impostato una password, potrà crearla con “Password dimenticata?”.';
                } else {
                    if ($id < 1) throw new RuntimeException('Utente non valido.');
                    if ((int)$current['id'] === $id) {
                        $role = 'admin';
                        $active = 1;
                    }

                    if ($password !== '') {
                        $stmt = $pdo->prepare('UPDATE users SET username=?,email=?,role=?,project_limit=?,active=?,password_hash=? WHERE id=?');
                        $stmt->execute([$username, $email, $role, $projectLimit, $active, password_hash($password, PASSWORD_DEFAULT), $id]);
                    } else {
                        $stmt = $pdo->prepare('UPDATE users SET username=?,email=?,role=?,project_limit=?,active=? WHERE id=?');
                        $stmt->execute([$username, $email, $role, $projectLimit, $active, $id]);
                    }
                    $message = 'Utente aggiornato.';
                }
            }
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') $error = 'Username o email già utilizzati.';
            else $error = 'Errore database durante il salvataggio.';
        } catch (Throwable $e) {
            $error = $e->getMessage();
        }
    }
}

$users = $pdo->query(
    'SELECT u.id,u.username,u.email,u.role,u.project_limit,u.active,u.last_login_at,u.created_at,
            COUNT(p.id) AS project_count
     FROM users u
     LEFT JOIN projects p ON p.user_id=u.id
     GROUP BY u.id
     ORDER BY u.username'
)->fetchAll();

$totalUsers = count($users);
$totalProjects = array_sum(array_map(fn($u)=>(int)$u['project_count'], $users));
?>
<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amministrazione · Phillo GeoCAD</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#0f1d25;color:#edf7f7;font:14px system-ui,Arial}a{color:#7fe0d5}.wrap{max-width:1180px;margin:auto;padding:22px}.top{display:flex;justify-content:space-between;gap:14px;align-items:center;margin-bottom:18px}.top h1{margin:0}.nav{display:flex;gap:8px;align-items:center}.btn,button{display:inline-block;padding:9px 12px;border:1px solid #4b7884;border-radius:8px;background:#244552;color:#fff;text-decoration:none;cursor:pointer}.primary{background:#0c948e;border-color:#52e5d3}.card{background:#142b35;border:1px solid #31515a;border-radius:12px;padding:16px;margin:14px 0}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.stat{background:#193640;border-radius:10px;padding:14px}.stat b{font-size:24px;display:block}.msg{padding:10px;border-left:3px solid #65e0bd;background:#173a32;margin:12px 0}.err{padding:10px;border-left:3px solid #ff857a;background:#3a2225;margin:12px 0}.grid{display:grid;grid-template-columns:1.1fr 1.4fr 1fr .7fr .7fr .7fr auto;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid #294650}.grid.head{color:#9ec8d0;font-size:12px;font-weight:700}.grid input,.grid select{width:100%;padding:8px;border:1px solid #53727b;border-radius:6px;background:#17333e;color:#fff}.newgrid{display:grid;grid-template-columns:1fr 1.4fr 1fr .7fr .8fr 1fr auto;gap:8px;align-items:end}.field label{display:block;color:#9ec8d0;font-size:12px;margin-bottom:4px}.field input,.field select{width:100%;padding:9px;border:1px solid #53727b;border-radius:7px;background:#17333e;color:#fff}.hint{color:#a9c7cc;font-size:12px}.pill{display:inline-block;padding:4px 7px;border-radius:999px;background:#1d4550}.off{opacity:.55}@media(max-width:850px){.stats{grid-template-columns:1fr}.newgrid{grid-template-columns:1fr}.grid.head{display:none}.grid{grid-template-columns:1fr;gap:6px;background:#193640;padding:12px;border-radius:9px;margin:10px 0}.grid>*:before{font-size:11px;color:#9ec8d0}.top{align-items:flex-start;flex-direction:column}}
</style></head><body><main class="wrap">
<div class="top"><div><h1>Amministrazione GeoCAD</h1><div class="hint">Utenti, permessi e limiti progetti</div></div>
<div class="nav"><a class="btn" href="/index.php">GeoCAD</a>
<form method="post" action="/logout.php" style="margin:0"><input type="hidden" name="csrf" value="<?= htmlspecialchars(geocad_csrf_token(),ENT_QUOTES,'UTF-8') ?>"><button>Esci</button></form></div></div>

<?php if($message): ?><div class="msg"><?= htmlspecialchars($message,ENT_QUOTES,'UTF-8') ?></div><?php endif; ?>
<?php if($error): ?><div class="err"><?= htmlspecialchars($error,ENT_QUOTES,'UTF-8') ?></div><?php endif; ?>

<div class="stats">
<div class="stat"><b><?= $totalUsers ?></b>utenti configurati</div>
<div class="stat"><b><?= $totalProjects ?></b>progetti salvati</div>
<div class="stat"><b>1</b>limite predefinito nuovi utenti</div>
</div>

<section class="card"><h2>Nuovo utente</h2>
<form method="post" class="newgrid">
<div class="field"><label>Username</label><input name="username" required pattern="[A-Za-z0-9._-]{3,80}"></div>
<div class="field"><label>Email</label><input type="email" name="email" required></div>
<div class="field"><label>Ruolo</label><select name="role"><option value="user">Utente</option><option value="admin">Amministratore</option></select></div>
<div class="field"><label>Limite progetti</label><input type="number" name="project_limit" min="0" value="1" required></div>
<div class="field"><label>Attivo</label><select name="active"><option value="1">Sì</option></select></div>
<div class="field"><label>Password iniziale (opzionale)</label><input type="password" name="password" minlength="10" autocomplete="new-password"></div>
<div><input type="hidden" name="action" value="create"><input type="hidden" name="csrf" value="<?= htmlspecialchars(geocad_csrf_token(),ENT_QUOTES,'UTF-8') ?>"><button class="primary">Crea</button></div>
</form>
<p class="hint">Con limite 0 l’utente può creare progetti senza limite. Se lasci vuota la password iniziale, l’utente userà “Password dimenticata?” per impostarla.</p>
</section>

<section class="card"><h2>Utenti</h2>
<div class="grid head"><div>Username</div><div>Email</div><div>Ruolo</div><div>Progetti</div><div>Limite</div><div>Attivo</div><div></div></div>
<?php foreach($users as $u): $self=((int)$current['id']===(int)$u['id']); ?>
<form method="post" class="grid <?= (int)$u['active'] ? '' : 'off' ?>">
<input name="username" value="<?= htmlspecialchars((string)$u['username'],ENT_QUOTES,'UTF-8') ?>" required>
<input type="email" name="email" value="<?= htmlspecialchars((string)$u['email'],ENT_QUOTES,'UTF-8') ?>" required>
<select name="role" <?= $self?'disabled':'' ?>><option value="user" <?= $u['role']==='user'?'selected':'' ?>>Utente</option><option value="admin" <?= $u['role']==='admin'?'selected':'' ?>>Amministratore</option></select>
<div><span class="pill"><?= (int)$u['project_count'] ?></span></div>
<input type="number" name="project_limit" min="0" value="<?= (int)$u['project_limit'] ?>">
<label><input type="checkbox" name="active" value="1" <?= (int)$u['active']?'checked':'' ?> <?= $self?'disabled':'' ?>> sì</label>
<div>
<input type="hidden" name="id" value="<?= (int)$u['id'] ?>"><input type="hidden" name="action" value="update"><input type="hidden" name="csrf" value="<?= htmlspecialchars(geocad_csrf_token(),ENT_QUOTES,'UTF-8') ?>">
<?php if($self): ?><input type="hidden" name="role" value="admin"><input type="hidden" name="active" value="1"><?php endif; ?>
<button>Salva</button></div>
</form>
<div class="hint" style="margin:-4px 0 12px">Ultimo accesso: <?= htmlspecialchars((string)($u['last_login_at'] ?: 'mai'),ENT_QUOTES,'UTF-8') ?></div>
<?php endforeach; ?>
</section>

<section class="card"><h2>Configurazione</h2>
<p>Questa sezione è predisposta per le prossime impostazioni globali. Per ora la configurazione tecnica resta in <code>config/config.php</code>.</p>
<p class="hint">Password dimenticata: link email temporaneo, scadenza configurabile. Limite progetti: impostabile singolarmente per ogni utente, default 1.</p>
</section>
</main></body></html>

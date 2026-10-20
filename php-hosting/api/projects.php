<?php
declare(strict_types=1);

require_once __DIR__ . '/_auth.php';
require_once dirname(__DIR__) . '/lib/db.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (!geocad_db_ready()) {
    http_response_code(503);
    echo json_encode(['ok'=>false,'error'=>'Database GeoCAD non inizializzato']);
    exit;
}

$user = geocad_current_user();
$userId = (int)($user['id'] ?? 0);
$limit = max(0, (int)($user['project_limit'] ?? 1));
if ($userId < 1) {
    http_response_code(401);
    echo json_encode(['ok'=>false,'error'=>'Utente non disponibile']);
    exit;
}

$pdo = geocad_db();

function project_json(array $p): array {
    return [
        'id'=>(int)$p['id'],
        'name'=>(string)$p['name'],
        'created_at'=>(string)$p['created_at'],
        'updated_at'=>(string)$p['updated_at'],
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $id = (int)($_GET['id'] ?? 0);
    if ($id > 0) {
        $stmt = $pdo->prepare('SELECT id,name,project_data,created_at,updated_at FROM projects WHERE id=? AND user_id=? LIMIT 1');
        $stmt->execute([$id,$userId]);
        $p = $stmt->fetch();
        if (!$p) {
            http_response_code(404);
            echo json_encode(['ok'=>false,'error'=>'Progetto non trovato']);
            exit;
        }
        $data = json_decode((string)$p['project_data'], true);
        echo json_encode(['ok'=>true,'project'=>project_json($p),'data'=>$data], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        exit;
    }

    $stmt = $pdo->prepare('SELECT id,name,created_at,updated_at FROM projects WHERE user_id=? ORDER BY updated_at DESC');
    $stmt->execute([$userId]);
    $rows = array_map('project_json', $stmt->fetchAll());
    echo json_encode(['ok'=>true,'projects'=>$rows,'limit'=>$limit,'count'=>count($rows)], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok'=>false,'error'=>'Metodo non consentito']);
    exit;
}

$csrf = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
if (!geocad_csrf_valid(is_string($csrf)?$csrf:null)) {
    http_response_code(403);
    echo json_encode(['ok'=>false,'error'=>'Sessione non valida']);
    exit;
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw ?: '', true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>'Richiesta non valida']);
    exit;
}

$action = (string)($payload['action'] ?? 'save');

if ($action === 'delete') {
    $id = (int)($payload['id'] ?? 0);
    $stmt = $pdo->prepare('DELETE FROM projects WHERE id=? AND user_id=?');
    $stmt->execute([$id,$userId]);
    echo json_encode(['ok'=>true,'deleted'=>$stmt->rowCount()>0]);
    exit;
}

$id = (int)($payload['id'] ?? 0);
$name = trim((string)($payload['name'] ?? ''));
$data = $payload['data'] ?? null;

if ($name === '' || mb_strlen($name) > 120) {
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>'Il nome progetto deve contenere da 1 a 120 caratteri']);
    exit;
}
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>'Dati progetto non validi']);
    exit;
}

$encoded = json_encode($data, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
if ($encoded === false || strlen($encoded) > 1500000) {
    http_response_code(413);
    echo json_encode(['ok'=>false,'error'=>'Progetto troppo grande per questo hosting']);
    exit;
}

try {
    if ($id > 0) {
        $stmt = $pdo->prepare('UPDATE projects SET name=?,project_data=? WHERE id=? AND user_id=?');
        $stmt->execute([$name,$encoded,$id,$userId]);
        if ($stmt->rowCount() === 0) {
            $exists = $pdo->prepare('SELECT id FROM projects WHERE id=? AND user_id=?');
            $exists->execute([$id,$userId]);
            if (!$exists->fetch()) {
                http_response_code(404);
                echo json_encode(['ok'=>false,'error'=>'Progetto non trovato']);
                exit;
            }
        }
        $savedId = $id;
    } else {
        $pdo->beginTransaction();
        $lock = $pdo->prepare('SELECT project_limit FROM users WHERE id=? FOR UPDATE');
        $lock->execute([$userId]);
        $freshLimit = (int)$lock->fetchColumn();
        $countStmt = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE user_id=?');
        $countStmt->execute([$userId]);
        $count = (int)$countStmt->fetchColumn();

        if ($freshLimit > 0 && $count >= $freshLimit) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['ok'=>false,'error'=>'Hai raggiunto il limite di '.$freshLimit.' progetti salvabili']);
            exit;
        }

        $stmt = $pdo->prepare('INSERT INTO projects (user_id,name,project_data) VALUES (?,?,?)');
        $stmt->execute([$userId,$name,$encoded]);
        $savedId = (int)$pdo->lastInsertId();
        $pdo->commit();
    }

    $stmt = $pdo->prepare('SELECT id,name,created_at,updated_at FROM projects WHERE id=? AND user_id=?');
    $stmt->execute([$savedId,$userId]);
    echo json_encode(['ok'=>true,'project'=>project_json($stmt->fetch()),'limit'=>$limit], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if ($e->getCode() === '23000') {
        http_response_code(409);
        echo json_encode(['ok'=>false,'error'=>'Esiste già un progetto con questo nome']);
    } else {
        error_log('GeoCAD project save: '.$e->getMessage());
        http_response_code(500);
        echo json_encode(['ok'=>false,'error'=>'Errore durante il salvataggio del progetto']);
    }
}

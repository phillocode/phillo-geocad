<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function geocad_send_password_reset(string $to, string $username, string $url): bool {
    $mail = geocad_config()['mail'] ?? [];
    $from = trim((string)($mail['from'] ?? 'noreply@rilievogps.it'));
    $fromName = trim((string)($mail['from_name'] ?? 'Phillo GeoCAD'));

    if (!filter_var($to, FILTER_VALIDATE_EMAIL) || !filter_var($from, FILTER_VALIDATE_EMAIL)) {
        return false;
    }

    $safeName = str_replace(["\r", "\n"], '', $fromName);
    $safeFrom = str_replace(["\r", "\n"], '', $from);
    $subject = 'Reimposta la password di Phillo GeoCAD';
    if (function_exists('mb_encode_mimeheader')) {
        $subject = mb_encode_mimeheader($subject, 'UTF-8');
        $safeName = mb_encode_mimeheader($safeName, 'UTF-8');
    }

    $minutes = max(10, (int)(geocad_config()['password_reset_minutes'] ?? 30));
    $body = "Ciao {$username},\n\n"
        . "è stata richiesta la reimpostazione della password di Phillo GeoCAD.\n\n"
        . "Apri questo collegamento entro {$minutes} minuti:\n{$url}\n\n"
        . "Se non hai richiesto tu il reset, ignora questa email.\n";

    $headers = [
        'From: ' . $safeName . ' <' . $safeFrom . '>',
        'Reply-To: ' . $safeFrom,
        'Content-Type: text/plain; charset=UTF-8',
        'X-Mailer: Phillo-GeoCAD'
    ];

    return @mail($to, $subject, $body, implode("\r\n", $headers));
}

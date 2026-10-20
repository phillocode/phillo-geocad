<?php
declare(strict_types=1);

return [
    'app_name' => 'Phillo GeoCAD',
    'session_name' => 'phillo_geocad',
    'session_lifetime_days' => 30,

    // Compatibilità temporanea per il primo amministratore.
    // Dopo l'installazione MySQL gli utenti vengono gestiti dal database.
    'users' => [
        'phillo' => '$2y$12$SOSTITUIRE_CON_HASH_REALE',
    ],

    'base_url' => 'https://geocad.rilievogps.it',
    'password_reset_minutes' => 30,

    'database' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => '',
        'user' => '',
        'password' => '',
        'charset' => 'utf8mb4',
    ],

    'mail' => [
        'from' => 'noreply@rilievogps.it',
        'from_name' => 'Phillo GeoCAD',
    ],

    // Chiave browser Google Maps. In Google Cloud limitarla a:
    // https://geocad.rilievogps.it/*
    'google_maps_key' => '',
];

<?php
declare(strict_types=1);

return [
    'app_name' => 'Phillo GeoCAD',
    'session_name' => 'phillo_geocad',
    'session_lifetime_days' => 30,

    // Inserire qui SOLO hash creati con password_hash().
    'users' => [
        'phillo' => '$2y$12$SOSTITUIRE_CON_HASH_REALE',
    ],

    // Chiave browser Google Maps. In Google Cloud limitarla a:
    // https://geocad.rilievogps.it/*
    'google_maps_key' => '',
];

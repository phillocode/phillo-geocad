# Phillo GeoCAD - hosting PHP/cPanel

Questa cartella è la versione parallela per `geocad.rilievogps.it`. Non sostituisce l'app Vercel attuale.

## Fase 1: login e sessione

1. Crea il sottodominio `geocad.rilievogps.it`.
2. Carica il contenuto di questa cartella nella document root del sottodominio.
3. Copia `config/config.example.php` in `config/config.php`.
4. Genera un hash password con PHP:
   ```
   php -r "echo password_hash('LA_TUA_PASSWORD', PASSWORD_DEFAULT), PHP_EOL;"
   ```
   Se cPanel non offre Terminale, genera temporaneamente l'hash con uno script PHP e cancellalo subito dopo.
5. Incolla l'hash nel campo `users['phillo']` di `config/config.php`.
6. Apri `https://geocad.rilievogps.it/`.

La password non deve mai essere inserita nel repository: `config/config.php` è escluso da Git.

## Sicurezza già presente

- password verificata con `password_verify()`
- session ID rigenerato al login
- cookie HttpOnly, SameSite=Lax e Secure quando HTTPS è attivo
- token CSRF per login/logout
- configurazione e librerie bloccate via `.htaccess`
- gate `api/_auth.php` pronto per proteggere tutte le API future
- sessione predefinita: 30 giorni

## Fase 2: frontend GeoCAD e Google Maps

La schermata GeoCAD completa è ora servita da `index.php` dietro login.
Google Maps usa `api/maps-config.php`, anch'essa protetta dalla sessione.

Nel file reale `config/config.php` inserisci la chiave browser Google Maps in:

```php
'google_maps_key' => 'LA_TUA_CHIAVE',
```

In Google Cloud autorizza almeno il referrer:

```
https://geocad.rilievogps.it/*
```

Durante questa fase Catasto e export TokNav sono volutamente disabilitati nella UI, così il test dell'hosting PHP non interferisce con la produzione Vercel.

## Prossime fasi

1. proxy Catasto
2. ricerca particella
3. snap catastale
4. export TokNav SQLite/ZIP

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

## Prossima fase

Dopo il test di login verranno portati in PHP, uno alla volta:
1. configurazione Google Maps
2. proxy Catasto
3. ricerca particella
4. snap catastale
5. export TokNav SQLite/ZIP
6. frontend completo GeoCAD

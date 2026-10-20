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


## Fase 3: utenti, amministrazione, reset password e progetti

La versione PHP ora supporta:

- utenti MySQL con ruoli `admin` e `user`
- area `/admin/` per creare, modificare, disattivare utenti e impostare il limite progetti
- limite progetti predefinito pari a 1; valore 0 = illimitato
- accesso con username oppure email
- flusso “Password dimenticata?” con link temporaneo via email
- salvataggio, apertura ed eliminazione dei progetti dell'utente
- memorizzazione di punti, linee, poligoni, centro mappa, zoom e base cartografica
- rimozione del riquadro tecnico “Google Maps / Configurazione Google Maps”

### Prima attivazione MySQL su cPanel

1. In cPanel apri **Database MySQL / MySQL Database Wizard**.
2. Crea un database dedicato, ad esempio `geocad`.
3. Crea un utente MySQL dedicato con password robusta.
4. Associa l'utente al database con **tutti i privilegi**.
5. Nel file reale `config/config.php` aggiungi/compila:

```php
'base_url' => 'https://geocad.rilievogps.it',
'password_reset_minutes' => 30,

'database' => [
    'host' => 'localhost',
    'port' => 3306,
    'name' => 'NOME_DATABASE_CPANEL',
    'user' => 'UTENTE_DATABASE_CPANEL',
    'password' => 'PASSWORD_DATABASE',
    'charset' => 'utf8mb4',
],

'mail' => [
    'from' => 'noreply@rilievogps.it',
    'from_name' => 'Phillo GeoCAD',
],
```

Mantieni anche la sezione `users` esistente durante questa prima migrazione: serve a riconoscere l'amministratore corrente prima della creazione delle tabelle.

6. Accedi a GeoCAD con l'utente amministratore già esistente.
7. Apri `https://geocad.rilievogps.it/install.php`.
8. Inserisci l'email dell'amministratore e premi **Inizializza database**.
9. Apri `/admin/` e configura gli altri utenti.

Dopo l'inizializzazione, login, password e progetti vengono gestiti dal database.

### Email di recupero password

Il server usa la funzione PHP `mail()`. Configura come mittente una casella del dominio, ad esempio `noreply@rilievogps.it`, oppure sostituiscila con una casella esistente in `config.php`.

Per sicurezza il sistema:
- non rivela se un indirizzo email esiste
- limita la generazione di nuovi token per lo stesso utente
- salva solo l'hash del token di reset
- usa link monouso con scadenza predefinita di 30 minuti

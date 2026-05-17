# Fronte Retro

Piccola app per creare una singola pagina PDF con fronte e retro di un documento.

## Script Python

```powershell
python pdf_fronte_retro.py input.pdf output_fronte_retro.pdf
```

## App mobile/PWA

Avvio locale:

```powershell
python -m http.server 8000
```

Poi apri:

```text
http://localhost:8000
```

Su smartphone, pubblica la cartella su un hosting statico HTTPS e apri l'URL dal telefono.
Da Android o iOS puoi usare "Aggiungi alla schermata Home" per installarla come app.

L'elaborazione avviene nel browser: i documenti non vengono caricati su un server.
La libreria PDF e' salvata in `vendor/pdf-lib.min.js`, quindi l'app non dipende da CDN esterne.

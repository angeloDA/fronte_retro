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
Il raddrizzamento prospettico usa OpenCV.js locale in `vendor/opencv.js` e conserva l'immagine a colori.
Prima di creare il PDF puoi regolare i quattro angoli rilevati nell'anteprima.
La fotocamera integrata mostra un overlay live del quadrilatero riconosciuto mentre inquadri.

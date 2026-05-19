# Lift — Setup infrastruttura

Guida passo-passo. Tutti i passi che richiedono il tuo login Google/GitHub li fai tu;
io ho già preparato tutto il codice da incollare.

Ordine: **Sheet → Apps Script → Deploy → Frontend**.

---

## 1. Google Sheet "Lift DB"

1. Vai su <https://sheets.google.com> → crea un foglio vuoto.
2. Rinominalo **Lift DB** (in alto a sinistra).
3. Dall'URL copia l'**ID**: è la parte tra `/d/` e `/edit`
   `https://docs.google.com/spreadsheets/d/`**`QUESTO_E_L_ID`**`/edit`
4. Tienilo da parte per il passo 2.

I 6 tab (`templates`, `sessions`, `sets`, `prs`, `customExercises`, `weightLog`)
**non li crei a mano**: li crea lo script automaticamente al passo 2.4.

---

## 2. Progetto Apps Script "Lift"

1. Vai su <https://script.google.com> → **Nuovo progetto**.
2. Rinominalo **Lift** (in alto a sinistra).
3. Per ognuno dei 10 file in `backend/` crea un file nello script
   (icona **+** accanto a "File" → Script) con lo **stesso nome senza `.gs`**
   (es. `Code`, `Util`, `AI`, `Templates`, `Sessions`, `PR`, `Library`,
   `Weight`, `Feedback`, `Stats`) e incolla il contenuto.
   Puoi eliminare il `Codice.gs`/`Code.gs` di default e ricrearlo come `Code`.
4. **Collega lo Sheet**:
   - Apri `Code.gs`, trova `setupBindSheet()`.
   - Sostituisci `INCOLLA_QUI_L_ID_DEL_SHEET` con l'ID del passo 1.3.
   - Menu funzioni in alto → scegli `setupBindSheet` → **Esegui**.
     (Autorizza i permessi quando richiesto: è il tuo account, è normale.)
   - Poi seleziona `setupSheet` → **Esegui**. Controlla il Log
     (Visualizza → Log): deve dire "6 tab creati/aggiornati".
   - Apri il Foglio: ora ci sono i 6 tab con le intestazioni. ✅
5. **Chiave Gemini** (opzionale ma serve per l'AI feedback):
   - Ottieni una chiave su <https://aistudio.google.com/apikey> (gratis).
   - In `Code.gs` trova `setupSecrets()`, sostituisci il placeholder con la chiave.
   - Seleziona `setupSecrets` → **Esegui**.
   - **Poi rimetti il placeholder** in `setupSecrets()` (non lasciare la chiave nel codice).

---

## 3. Deploy come Web App

1. In alto a destra → **Deploy** → **Nuovo deployment**.
2. Tipo: **App web**.
3. Configura:
   - Esegui come: **Me**
   - Chi ha accesso: **Solo io stesso** (è un'app personale).
     > Se in futuro vuoi aprirla da un telefono non loggato col tuo Google,
     > dovrai cambiare in "Chiunque" e gestire l'accesso — per ora "Solo io".
4. **Deploy** → autorizza → copia l'**URL dell'app web**
   (`https://script.google.com/macros/s/.../exec`).

---

## 4. Collega il Frontend

1. Apri `js/api.js`.
2. Imposta:
   ```js
   const USE_MOCK = false;
   const GAS_URL = "INCOLLA_QUI_L_URL_DEL_DEPLOY";
   ```
3. Apri `index.html` nel browser. Se vedi la Home con le schede
   reali (vuote finché non ne crei), il collegamento funziona. ✅

> Nota: aprendo da `file://` con `USE_MOCK=false` il browser potrebbe
> bloccare la richiesta per CORS. Per il test reale conviene pubblicare
> il frontend (passo 5) oppure servirlo da un piccolo server locale.

---

## 5. (Dopo) Pubblicazione frontend su GitHub Pages

1. Crea un repo GitHub (es. `Lift`), push del contenuto della cartella
   `Lift/` esclusa `backend/` e `SETUP.md` (vivono solo in locale/GAS).
2. Settings repo → **Pages** → Source: branch `main`, cartella `/root`.
3. L'app sarà su `https://<tuo-utente>.github.io/Lift/`.
4. Da telefono: apri quell'URL → menu condividi → **Aggiungi a Home**
   (diventa PWA installata).

---

## 6. Preload schede iniziali (una tantum)

Le tue schede dall'ultima settimana di Hevy si caricano una volta sola.
**Non è una funzione dell'app**: si fa a mano. Due strade:

- **A (semplice)**: crea le schede dall'editor schede dell'app una volta
  che è online.
- **B (da CSV)**: posso scriverti uno script `seed` una tantum che legge
  il `workouts.csv` di Hevy ed estrae le schede dell'ultima settimana →
  dimmelo e lo preparo come passo separato.

---

## Checklist rapida

- [ ] Sheet "Lift DB" creato, ID copiato
- [ ] 10 file `.gs` incollati nel progetto Apps Script
- [ ] `setupBindSheet()` eseguito (ID inserito)
- [ ] `setupSheet()` eseguito → 6 tab visibili nel Foglio
- [ ] `setupSecrets()` eseguito → chiave rimossa dal codice
- [ ] Web app deployata, URL copiato
- [ ] `api.js`: `USE_MOCK=false` + `GAS_URL` impostato
- [ ] Home si apre con dati reali

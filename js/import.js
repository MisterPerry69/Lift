/* ============================================
   ForgE — import.js
   Parser dell'importer JSON schede.
   Trasforma il JSON "umano" (italiano) incollato dall'utente
   nella struttura interna periodizzata salvata in structureJSON.

   JSON di input (per scheda = un workout):
   {
     "nome": "Workout A",
     "settimane": 6,
     "esercizi": [
       { "nome", "gruppo"?, "attrezzo"?, "nota"?, "rest"?,
         "superset": null|"A",
         "perSettimana": [ { "serie": [ {"reps": 6|"8-12"|"8rm"|"max", "tipo"?: "work"|"warmup"|"test"|"max"|"failure"} ] }, ... ] }
     ]
   }

   Struttura interna prodotta (campo `structure` per lift_save_template):
   {
     weeks: 6, currentWeek: 1,
     blocks: [
       { exerciseRef: "ex:<slug>", exerciseName, muscle, note, rest,
         supersetGroup: null|"A",
         perWeek: [ { sets: [ {reps, type} ] }, ... ] }
     ]
   }
   ============================================ */

const IMPORT_SET_TYPES = ["work", "warmup", "test", "max", "failure"];

/** Slug stabile da nome italiano (allineato a backend Exercises.gs exSlug). */
function importExSlug(nome) {
  return String(nome || "")
    .toLowerCase()
    .replace(/[°"']/g, "")
    .replace(/[àáâä]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Errore di import con messaggio utente-leggibile. */
class ImportError extends Error {}

/** Normalizza una singola serie del JSON utente. */
function parseImportSet(raw, ctx) {
  if (raw == null || typeof raw !== "object") {
    throw new ImportError(`${ctx}: serie non valida (atteso un oggetto con "reps").`);
  }
  if (raw.reps === undefined || raw.reps === null || raw.reps === "") {
    throw new ImportError(`${ctx}: manca "reps" in una serie.`);
  }
  let type = raw.tipo || raw.type || "work";
  type = String(type).toLowerCase();
  if (!IMPORT_SET_TYPES.includes(type)) {
    throw new ImportError(`${ctx}: tipo serie sconosciuto "${type}". Ammessi: ${IMPORT_SET_TYPES.join(", ")}.`);
  }
  // reps: numero o stringa (range "8-12", "8rm", "max")
  const reps = typeof raw.reps === "number" ? raw.reps : String(raw.reps).trim();
  const set = { reps, type };
  // rest-pause: recupero breve PRIMA di questa serie (es. 20" prima della MAX)
  if (raw.restBefore != null && raw.restBefore !== "") {
    const rb = parseInt(raw.restBefore, 10);
    if (Number.isFinite(rb) && rb > 0) set.restBefore = rb;
  }
  // nota specifica di questa serie (es. "mantieni il carico" solo sull'ultima)
  if (raw.nota != null && String(raw.nota).trim() !== "") {
    set.nota = String(raw.nota).trim();
  }
  return set;
}

/**
 * Parsea e valida il JSON di import. Lancia ImportError con messaggio chiaro
 * se qualcosa non torna; non produce mai una scheda parziale.
 * @param {string|object} input - testo JSON o oggetto già parsato.
 * @returns {{ name, weeks, structure }}
 */
function _parseJson(input) {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input);
  } catch (e) {
    throw new ImportError("JSON non valido: controlla virgole, parentesi e virgolette.");
  }
}

/**
 * Parsea gli esercizi di UN workout in `blocks` (struttura interna).
 * `weeks` arriva dal contenitore (workout singolo o programma).
 * `prefix` è una stringa di contesto per i messaggi d'errore (es. 'Workout A — ').
 */
function _parseWorkoutBlocks(workout, weeks, prefix) {
  prefix = prefix || "";
  if (!Array.isArray(workout.esercizi) || workout.esercizi.length === 0) {
    throw new ImportError(`${prefix}"esercizi" deve essere un array con almeno un esercizio.`);
  }
  return workout.esercizi.map((ex, i) => {
    const exName = String(ex.nome || "").trim();
    const where = `${prefix}Esercizio ${i + 1}${exName ? ` ("${exName}")` : ""}`;
    if (!exName) throw new ImportError(`${where}: manca "nome".`);

    if (!Array.isArray(ex.perSettimana)) {
      throw new ImportError(`${where}: manca "perSettimana" (array).`);
    }
    if (ex.perSettimana.length !== weeks) {
      throw new ImportError(
        `${where}: "perSettimana" ha ${ex.perSettimana.length} settimane ma ne sono dichiarate ${weeks}.`
      );
    }

    // tipo esercizio: "serie" (default) o "durata" (cardio a tempo)
    const kind = String(ex.tipoEsercizio || "serie").toLowerCase();
    if (kind !== "serie" && kind !== "durata") {
      throw new ImportError(`${where}: "tipoEsercizio" sconosciuto "${kind}" (ammessi: serie, durata).`);
    }

    let perWeek;
    if (kind === "durata") {
      perWeek = ex.perSettimana.map((wk, wi) => {
        const wctx = `${where}, settimana ${wi + 1}`;
        if (!wk || wk.durata == null || wk.durata === "") {
          throw new ImportError(`${wctx}: manca "durata" (minuti) per un esercizio a durata.`);
        }
        const min = parseInt(wk.durata, 10);
        if (!Number.isFinite(min) || min <= 0) {
          throw new ImportError(`${wctx}: "durata" deve essere un numero di minuti > 0.`);
        }
        return { durataMin: min, parametri: wk.parametri ? String(wk.parametri) : "" };
      });
    } else {
      perWeek = ex.perSettimana.map((wk, wi) => {
        const wctx = `${where}, settimana ${wi + 1}`;
        if (!wk || !Array.isArray(wk.serie) || wk.serie.length === 0) {
          throw new ImportError(`${wctx}: manca "serie" (array non vuoto).`);
        }
        return { sets: wk.serie.map((s) => parseImportSet(s, wctx)) };
      });
    }

    return {
      exerciseRef: "ex:" + importExSlug(exName),
      exerciseName: exName,
      muscle: ex.gruppo || "",
      attrezzo: ex.attrezzo || "",
      note: ex.nota || "",
      rest: ex.rest || "",
      supersetGroup: ex.superset != null ? String(ex.superset) : null,
      kind: kind, // "serie" | "durata"
      perWeek: perWeek,
    };
  });
}

/**
 * Parsea un singolo WORKOUT (formato legacy: {nome, settimane, esercizi}).
 * Mantenuto per riuso/retrocompatibilità. Ritorna {name, weeks, structure}.
 */
function parseImportSchedaJson(input) {
  const data = _parseJson(input);
  if (!data || typeof data !== "object") {
    throw new ImportError('JSON non valido: atteso un oggetto con "nome", "settimane", "esercizi".');
  }
  const name = String(data.nome || "").trim();
  if (!name) throw new ImportError('Manca il campo "nome".');
  const weeks = Number(data.settimane);
  if (!Number.isInteger(weeks) || weeks < 1) {
    throw new ImportError('"settimane" deve essere un intero >= 1.');
  }
  const blocks = _parseWorkoutBlocks(data, weeks, "");
  return {
    name: name,
    weeks: weeks,
    structure: { weeks: weeks, currentWeek: 1, blocks: blocks },
  };
}

/**
 * Parsea un PROGRAMMA: {nome, dataInizio, settimane, workout:[{nome, esercizi}]}.
 * Ritorna { name, dataInizio, weeks, workouts:[{name, structure}] }.
 * `currentWeek` non è nel modello: si calcola a runtime da dataInizio (vedi programWeek()).
 */
function parseImportProgrammaJson(input) {
  const data = _parseJson(input);
  if (!data || typeof data !== "object") {
    throw new ImportError('JSON non valido: atteso un oggetto programma con "nome", "settimane", "workout".');
  }
  const name = String(data.nome || "").trim();
  if (!name) throw new ImportError('Manca il campo "nome" del programma.');

  const weeks = Number(data.settimane);
  if (!Number.isInteger(weeks) || weeks < 1) {
    throw new ImportError('"settimane" deve essere un intero >= 1.');
  }

  const dataInizio = String(data.dataInizio || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInizio)) {
    throw new ImportError('"dataInizio" deve essere una data ISO (es. "2026-06-22").');
  }

  if (!Array.isArray(data.workout) || data.workout.length === 0) {
    throw new ImportError('"workout" deve essere un array con almeno un workout.');
  }

  const workouts = data.workout.map((w, wi) => {
    const wName = String(w.nome || "").trim();
    const prefix = `${wName || "Workout " + (wi + 1)} — `;
    if (!wName) throw new ImportError(`Workout ${wi + 1}: manca "nome".`);
    const blocks = _parseWorkoutBlocks(w, weeks, prefix);
    return { name: wName, structure: { blocks: blocks } };
  });

  return { name: name, dataInizio: dataInizio, weeks: weeks, workouts: workouts };
}

/**
 * Settimana corrente di un programma (1-based), calcolata per data con override.
 * @param {{dataInizio:string, weeks:number, weekOverride?:number}} program
 * @param {Date} [now]
 */
function programWeek(program, now) {
  const weeks = program.weeks || 1;
  const clamp = (n) => Math.min(weeks, Math.max(1, n));
  if (program.weekOverride != null && program.weekOverride !== "") {
    return clamp(parseInt(program.weekOverride, 10) || 1);
  }
  const start = new Date(program.dataInizio + "T00:00:00");
  const today = now || new Date();
  const days = Math.floor((today - start) / 86400000);
  return clamp(Math.floor(days / 7) + 1);
}

// Export per Node (test) — nel browser sono globali.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseImportSchedaJson,
    parseImportProgrammaJson,
    programWeek,
    importExSlug,
    ImportError,
  };
}

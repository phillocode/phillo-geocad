import { asyncBufferFromUrl, parquetQuery, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const DATA_BASE = 'https://raw.githubusercontent.com/ondata/dati_catastali/main/S_0000_ITALIA/anagrafica/';
const INDEX_URL = DATA_BASE + 'index.parquet';
const WFS = 'https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php';

let comuniPromise;

function normComune(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ');
}

function safeText(value) {
  return String(value ?? '').trim();
}

async function loadComuni() {
  if (!comuniPromise) {
    comuniPromise = (async () => {
      const file = await asyncBufferFromUrl({ url: INDEX_URL });
      return await parquetReadObjects({
        file,
        compressors,
        columns: ['comune', 'file', 'CODISTAT', 'DENOMINAZIONE_IT']
      });
    })().catch(err => {
      comuniPromise = null;
      throw err;
    });
  }
  return comuniPromise;
}

async function resolveComune(input) {
  const comuni = await loadComuni();
  const raw = safeText(input).toUpperCase();
  if (/^[A-Z][0-9]{3}$/.test(raw)) {
    const found = comuni.filter(r => safeText(r.comune).toUpperCase() === raw);
    if (!found.length) return { error: 'Codice catastale del comune non trovato.' };
    return { row: found[0], alternatives: found };
  }

  const wanted = normComune(input);
  const matches = comuni.filter(r => normComune(r.DENOMINAZIONE_IT) === wanted);
  if (!matches.length) {
    const partial = comuni
      .filter(r => normComune(r.DENOMINAZIONE_IT).includes(wanted) && wanted.length >= 3)
      .slice(0, 8)
      .map(r => ({
        nome: safeText(r.DENOMINAZIONE_IT),
        codice: safeText(r.comune),
        istat: safeText(r.CODISTAT)
      }));
    return { error: 'Comune non trovato.', suggestions: partial };
  }
  if (matches.length > 1) {
    return {
      error: 'Il nome del comune non è univoco. Inserisci il codice catastale.',
      suggestions: matches.map(r => ({
        nome: safeText(r.DENOMINAZIONE_IT),
        codice: safeText(r.comune),
        istat: safeText(r.CODISTAT)
      }))
    };
  }
  return { row: matches[0], alternatives: matches };
}

function parseFeatureBlocks(xml) {
  const blocks = [];
  const re = /<CP:CadastralParcel\b[\s\S]*?<\/CP:CadastralParcel>/g;
  let m;
  while ((m = re.exec(xml)) !== null) blocks.push(m[0]);
  return blocks;
}

function extractTag(block, name) {
  const re = new RegExp('<CP:' + name + '>([\\s\\S]*?)<\\/CP:' + name + '>');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function extractPaths(block) {
  const paths = [];
  const re = /<gml:posList(?:\s[^>]*)?>([\s\S]*?)<\/gml:posList>/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const nums = m[1].trim().split(/\s+/).map(Number).filter(Number.isFinite);
    const path = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const lat = nums[i];
      const lng = nums[i + 1];
      if (lat >= 30 && lat <= 50 && lng >= 5 && lng <= 20) {
        path.push({ lat, lng });
      }
    }
    if (path.length >= 3) paths.push(path);
  }
  return paths;
}

async function fetchWfsGeometry(row) {
  const lon = Number(row.x) / 1e6;
  const lat = Number(row.y) / 1e6;
  const d = 0.000003;
  const bbox = [lat - d, lon - d, lat + d, lon + d].join(',');
  const qs = new URLSearchParams({
    language: 'ita',
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    TYPENAMES: 'CP:CadastralParcel',
    SRSNAME: 'urn:ogc:def:crs:EPSG::6706',
    BBOX: bbox,
    REQUEST: 'GetFeature',
    COUNT: '100'
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(WFS + '?' + qs.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Phillo-GeoCAD/13',
        'Accept': 'application/gml+xml,text/xml,application/xml;q=0.9,*/*;q=0.5'
      }
    });
    if (!r.ok) throw new Error('WFS HTTP ' + r.status);
    const xml = await r.text();
    const expected = safeText(row.INSPIREID_LOCALID).replace(/^IT\.AGE\.PLA\./, '');
    const blocks = parseFeatureBlocks(xml);
    const block = blocks.find(b => extractTag(b, 'NATIONALCADASTRALREFERENCE') === expected) || blocks[0];
    if (!block) throw new Error('WFS: geometria non restituita');

    return {
      paths: extractPaths(block),
      nationalReference: extractTag(block, 'NATIONALCADASTRALREFERENCE'),
      label: extractTag(block, 'LABEL'),
      administrativeUnit: extractTag(block, 'ADMINISTRATIVEUNIT')
    };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Metodo non consentito.' });
  }

  const comuneInput = safeText(req.query.comune);
  const foglioInput = safeText(req.query.foglio);
  const particella = safeText(req.query.particella).toUpperCase();

  if (!comuneInput || !foglioInput || !particella) {
    return res.status(400).json({ error: 'Inserisci Comune, Foglio e Particella.' });
  }

  const foglioNum = Number(foglioInput);
  if (!Number.isInteger(foglioNum) || foglioNum < 0 || foglioNum > 9999) {
    return res.status(400).json({ error: 'Foglio non valido.' });
  }
  const foglio = String(foglioNum).padStart(4, '0');

  try {
    const resolved = await resolveComune(comuneInput);
    if (resolved.error) {
      return res.status(404).json({
        error: resolved.error,
        suggestions: resolved.suggestions || []
      });
    }

    const comune = safeText(resolved.row.comune).toUpperCase();
    const filename = safeText(resolved.row.file);
    if (!filename) throw new Error('Archivio regionale non disponibile.');

    const file = await asyncBufferFromUrl({ url: DATA_BASE + encodeURIComponent(filename).replace(/%2F/g, '/') });
    const rows = await parquetQuery({
      file,
      compressors,
      columns: ['INSPIREID_LOCALID', 'comune', 'foglio', 'particella', 'x', 'y'],
      filter: {
        $and: [
          { comune: { $eq: comune } },
          { foglio: { $eq: foglio } },
          { particella: { $eq: particella } }
        ]
      },
      rowStart: 0,
      rowEnd: 20
    });

    if (!rows.length) {
      return res.status(404).json({
        error: 'Particella non trovata.',
        comune: {
          nome: safeText(resolved.row.DENOMINAZIONE_IT),
          codice: comune
        },
        foglio,
        particella
      });
    }

    const chosen = rows[0];
    const lon = Number(chosen.x) / 1e6;
    const lat = Number(chosen.y) / 1e6;
    let geometry = null;
    let warning = '';

    try {
      geometry = await fetchWfsGeometry(chosen);
    } catch (err) {
      warning = 'Particella trovata, ma il contorno WFS non è disponibile in questo momento.';
    }

    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      ok: true,
      comune: {
        nome: safeText(resolved.row.DENOMINAZIONE_IT),
        codice: comune,
        istat: safeText(resolved.row.CODISTAT)
      },
      foglio,
      particella,
      point: { lat, lng: lon },
      localId: safeText(chosen.INSPIREID_LOCALID),
      matchCount: rows.length,
      geometry,
      warning
    });
  } catch (err) {
    console.error('cerca-catasto', err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({
      error: 'Errore durante la ricerca catastale.',
      detail: String(err && err.message || err)
    });
  }
}

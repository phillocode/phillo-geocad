import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

const WFS = 'https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php';
const COMUNI_URL = 'https://www1.agenziaentrate.gov.it/servizi/codici/ricerca/VisualizzaTabella.php?ArcName=00T4';
const PARQUET_BASE = 'https://raw.githubusercontent.com/ondata/dati_catastali/main/S_0000_ITALIA/anagrafica/';
const PARQUET_INDEX = PARQUET_BASE + 'index.parquet';

let comuniCache = null;
let comuniCacheAt = 0;
let regionByComuneCache = new Map();
const COMUNI_CACHE_MS = 24 * 60 * 60 * 1000;

function bad(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

function decodeHtml(s) {
  const named = {
    amp: '&', quot: '"', apos: "'", nbsp: ' ',
    agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì',
    ograve: 'ò', ugrave: 'ù', aacute: 'á', iacute: 'í',
    oacute: 'ó', uacute: 'ú'
  };
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^A-Z0-9']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchText(url, timeout = 12000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: {
        'User-Agent': 'Phillo-GeoCAD/13',
        'Accept': 'text/html,application/xml,text/xml,*/*;q=0.8'
      }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

async function getComuni() {
  if (comuniCache && Date.now() - comuniCacheAt < COMUNI_CACHE_MS) return comuniCache;
  const html = await fetchText(COMUNI_URL);
  const rows = [];
  const re = /<td[^>]*>\s*([A-Z]\d{3})\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = re.exec(html))) {
    const name = decodeHtml(m[2]);
    rows.push({ code: m[1].toUpperCase(), name, norm: normalizeName(name) });
  }
  if (!rows.length) throw new Error('Tabella comuni non leggibile');
  comuniCache = rows;
  comuniCacheAt = Date.now();
  return rows;
}

async function resolveComune(value) {
  const raw = String(value || '').trim();
  if (/^[A-Za-z]\d{3}$/.test(raw)) {
    const code = raw.toUpperCase();
    try {
      const comuni = await getComuni();
      const found = comuni.find(x => x.code === code);
      return found || { code, name: code, norm: code };
    } catch {
      return { code, name: code, norm: code };
    }
  }

  const norm = normalizeName(raw);
  if (!norm) throw Object.assign(new Error('Comune mancante'), { status: 400 });
  const comuni = await getComuni();
  const exact = comuni.filter(x => x.norm === norm);
  if (exact.length === 1) return exact[0];

  const starts = comuni.filter(x => x.norm.startsWith(norm));
  const candidates = exact.length ? exact : starts;
  if (candidates.length === 1) return candidates[0];

  const err = new Error(candidates.length ? 'Comune ambiguo' : 'Comune non trovato');
  err.status = candidates.length ? 409 : 404;
  err.options = candidates.slice(0, 12);
  throw err;
}

function normalizeFoglio(value) {
  const raw = String(value || '').trim();
  if (!/^\d{1,4}$/.test(raw)) return null;
  return raw.padStart(4, '0');
}

function normalizeParticella(value) {
  const raw = String(value || '').trim().toUpperCase();
  return raw && /^[A-Z0-9._/-]+$/.test(raw) ? raw : null;
}

async function parquetQuery(url, columns, filter, timeout = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const file = await asyncBufferFromUrl({
      url,
      requestInit: {
        signal: ctl.signal,
        headers: { 'User-Agent': 'Phillo-GeoCAD/13' }
      }
    });

    return await parquetReadObjects({
      file,
      columns,
      filter,
      compressors,
      useOffsetIndex: true,
      usePageIndex: true,
      filterStrict: true
    });
  } finally {
    clearTimeout(timer);
  }
}

async function findRegionFile(comuneCode) {
  if (regionByComuneCache.has(comuneCode)) return regionByComuneCache.get(comuneCode);

  const rows = await parquetQuery(
    PARQUET_INDEX,
    ['comune', 'file', 'CODISTAT', 'DENOMINAZIONE_IT'],
    { comune: { $eq: comuneCode } }
  );
  const row = rows[0];
  if (!row?.file) return null;
  const result = {
    file: String(row.file),
    denomination: row.DENOMINAZIONE_IT ? String(row.DENOMINAZIONE_IT) : null,
    codistat: row.CODISTAT ? String(row.CODISTAT) : null
  };
  regionByComuneCache.set(comuneCode, result);
  return result;
}

async function findParcelIndex(comuneCode, foglio, particella, regionFile) {
  const rows = await parquetQuery(
    PARQUET_BASE + encodeURIComponent(regionFile),
    ['INSPIREID_LOCALID', 'comune', 'foglio', 'particella', 'x', 'y'],
    {
      comune: { $eq: comuneCode },
      foglio: { $eq: foglio },
      particella: { $eq: particella }
    },
    20000
  );
  return rows[0] || null;
}

function parseCorners(block) {
  const lo = block.match(/<gml:lowerCorner[^>]*>\s*([^<]+)<\/gml:lowerCorner>/i);
  const hi = block.match(/<gml:upperCorner[^>]*>\s*([^<]+)<\/gml:upperCorner>/i);
  if (!lo || !hi) return null;
  const a = lo[1].trim().split(/\s+/).map(Number);
  const b = hi[1].trim().split(/\s+/).map(Number);
  if (a.length < 2 || b.length < 2 || !a.every(Number.isFinite) || !b.every(Number.isFinite)) return null;

  return {
    south: Math.min(a[0], b[0]),
    west: Math.min(a[1], b[1]),
    north: Math.max(a[0], b[0]),
    east: Math.max(a[1], b[1])
  };
}

function parseMembers(xml) {
  const out = [];
  const re = /<wfs:member>([\s\S]*?)<\/wfs:member>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const localId = (b.match(/<CP:INSPIREID_LOCALID[^>]*>\s*([^<]+)<\/CP:INSPIREID_LOCALID>/i) || [])[1];
    const ref = (b.match(/<CP:NATIONALCADASTRALREFERENCE[^>]*>\s*([^<]+)<\/CP:NATIONALCADASTRALREFERENCE>/i) || [])[1];
    const label = (b.match(/<CP:LABEL[^>]*>\s*([^<]+)<\/CP:LABEL>/i) || [])[1];
    const admin = (b.match(/<CP:ADMINISTRATIVEUNIT[^>]*>\s*([^<]+)<\/CP:ADMINISTRATIVEUNIT>/i) || [])[1];
    const bounds = parseCorners(b);
    if (!bounds) continue;
    out.push({
      localId: decodeHtml(localId || ''),
      ref: decodeHtml(ref || ''),
      label: decodeHtml(label || ''),
      administrativeUnit: decodeHtml(admin || ''),
      bounds,
      center: {
        lat: (bounds.south + bounds.north) / 2,
        lng: (bounds.west + bounds.east) / 2
      }
    });
  }
  return out;
}

async function fetchParcelGeometry(lat, lng, expectedLocalId) {
  const radii = [0.000003, 0.00001, 0.00005];

  for (const radius of radii) {
    const qs = new URLSearchParams({
      language: 'ita',
      SERVICE: 'WFS',
      VERSION: '2.0.0',
      REQUEST: 'GetFeature',
      TYPENAMES: 'CP:CadastralParcel',
      SRSNAME: 'urn:ogc:def:crs:EPSG::6706',
      COUNT: '100',
      BBOX: [
        (lat - radius).toFixed(7),
        (lng - radius).toFixed(7),
        (lat + radius).toFixed(7),
        (lng + radius).toFixed(7)
      ].join(',')
    });

    const xml = await fetchText(WFS + '?' + qs.toString(), 15000);
    const members = parseMembers(xml);
    const exact = members.find(x => x.localId === expectedLocalId);
    if (exact) return exact;

    // Fallback: il punto indice è garantito interno alla particella; se il WFS
    // restituisce un solo elemento, possiamo usarlo anche se manca il localId.
    if (members.length === 1) return members[0];
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return bad(res, 405, 'Method not allowed');
  }

  const comuneInput = String(req.query.comune || '').trim();
  const foglio = normalizeFoglio(req.query.foglio);
  const particella = normalizeParticella(req.query.particella);

  if (!comuneInput || !foglio || !particella) {
    return bad(res, 400, 'Inserisci Comune, Foglio e Particella validi');
  }

  let comune;
  try {
    comune = await resolveComune(comuneInput);
  } catch (err) {
    return bad(res, err.status || 404, err.message || 'Comune non trovato', {
      options: err.options || []
    });
  }

  try {
    const region = await findRegionFile(comune.code);
    if (!region) return bad(res, 404, 'Comune non presente nell’indice catastale', { comune });

    const indexed = await findParcelIndex(comune.code, foglio, particella, region.file);
    if (!indexed) {
      return bad(res, 404, 'Particella non trovata nell’indice catastale', {
        comune,
        foglio,
        particella
      });
    }

    const lng = Number(indexed.x) / 1000000;
    const lat = Number(indexed.y) / 1000000;
    const localId = String(indexed.INSPIREID_LOCALID || '');

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !localId) {
      return bad(res, 502, 'Indice catastale incompleto per la particella richiesta');
    }

    const geometry = await fetchParcelGeometry(lat, lng, localId);
    const fallbackBounds = {
      south: lat - 0.00005,
      west: lng - 0.00005,
      north: lat + 0.00005,
      east: lng + 0.00005
    };

    const result = geometry || {
      localId,
      ref: localId.replace(/^IT\.AGE\.PLA\./, ''),
      label: particella,
      administrativeUnit: comune.code,
      bounds: fallbackBounds,
      center: { lat, lng }
    };

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      comune: {
        code: comune.code,
        name: region.denomination || comune.name
      },
      foglio,
      particella,
      source: geometry ? 'indice+WFS' : 'indice',
      indexPoint: { lat, lng },
      ...result
    });
  } catch (err) {
    const message = err?.name === 'AbortError'
      ? 'Timeout durante la ricerca catastale'
      : String(err?.message || err);
    return bad(res, 502, 'Ricerca catastale non disponibile', { detail: message });
  }
}

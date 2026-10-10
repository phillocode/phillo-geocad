const WFS = 'https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php';
const COMUNI_URL = 'https://www1.agenziaentrate.gov.it/servizi/codici/ricerca/VisualizzaTabella.php?ArcName=00T4';

let comuniCache = null;
let comuniCacheAt = 0;
const COMUNI_CACHE_MS = 24 * 60 * 60 * 1000;

function bad(res, status, message, extra = {}) {
  res.status(status).json({ error: message, ...extra });
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

async function fetchText(url, timeout = 10000) {
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
  const html = await fetchText(COMUNI_URL, 12000);
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
    return { code: raw.toUpperCase(), name: raw.toUpperCase() };
  }
  const norm = normalizeName(raw);
  if (!norm) throw new Error('Comune mancante');
  const comuni = await getComuni();
  const exact = comuni.filter(x => x.norm === norm);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const err = new Error('Comune ambiguo');
    err.options = exact.slice(0, 10);
    throw err;
  }
  const starts = comuni.filter(x => x.norm.startsWith(norm));
  if (starts.length === 1) return starts[0];
  const contains = comuni.filter(x => x.norm.includes(norm));
  if (contains.length === 1) return contains[0];
  const err = new Error(starts.length || contains.length ? 'Comune ambiguo' : 'Comune non trovato');
  err.options = (starts.length ? starts : contains).slice(0, 10);
  throw err;
}

function cqlQuote(s) {
  return String(s).replace(/'/g, "''");
}

function parseCorners(block) {
  const lo = block.match(/<gml:lowerCorner[^>]*>\s*([^<]+)<\/gml:lowerCorner>/i);
  const hi = block.match(/<gml:upperCorner[^>]*>\s*([^<]+)<\/gml:upperCorner>/i);
  if (!lo || !hi) return null;
  const a = lo[1].trim().split(/\s+/).map(Number);
  const b = hi[1].trim().split(/\s+/).map(Number);
  if (a.length < 2 || b.length < 2 || !a.every(Number.isFinite) || !b.every(Number.isFinite)) return null;
  // EPSG:6706 nel servizio AdE viene restituito con ordine latitudine, longitudine.
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
    const ref = (b.match(/<CP:NATIONALCADASTRALREFERENCE[^>]*>\s*([^<]+)<\/CP:NATIONALCADASTRALREFERENCE>/i) || [])[1];
    const label = (b.match(/<CP:LABEL[^>]*>\s*([^<]+)<\/CP:LABEL>/i) || [])[1];
    const admin = (b.match(/<CP:ADMINISTRATIVEUNIT[^>]*>\s*([^<]+)<\/CP:ADMINISTRATIVEUNIT>/i) || [])[1];
    const bounds = parseCorners(b);
    if (!ref || !bounds) continue;
    const sheetToken = (ref.match(/_([^.]*)\./) || [])[1] || '';
    out.push({
      ref: decodeHtml(ref),
      label: decodeHtml(label || ''),
      administrativeUnit: decodeHtml(admin || ''),
      sheetToken,
      bounds,
      center: {
        lat: (bounds.south + bounds.north) / 2,
        lng: (bounds.west + bounds.east) / 2
      }
    });
  }
  return out;
}

function matchFoglio(items, foglioInput) {
  const raw = String(foglioInput || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return [];
  const m = raw.match(/^(\d+)([A-Z]?)$/);
  if (!m) return [];
  const num = m[1].padStart(4, '0');
  const suffix = m[2];
  if (suffix) return items.filter(x => x.sheetToken.startsWith(num + suffix));
  const exactBase = items.filter(x => x.sheetToken === num + '00');
  if (exactBase.length) return exactBase;
  return items.filter(x => x.sheetToken.startsWith(num));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return bad(res, 405, 'Method not allowed');
  }

  const comuneInput = String(req.query.comune || '').trim();
  const foglio = String(req.query.foglio || '').trim();
  const particella = String(req.query.particella || '').trim();

  if (!comuneInput || !foglio || !particella) {
    return bad(res, 400, 'Inserisci Comune, Foglio e Particella');
  }

  let comune;
  try {
    comune = await resolveComune(comuneInput);
  } catch (err) {
    return bad(res, err.message === 'Comune ambiguo' ? 409 : 404, err.message, {
      options: err.options || []
    });
  }

  const cql = "ADMINISTRATIVEUNIT='" + cqlQuote(comune.code) +
    "' AND LABEL='" + cqlQuote(particella) + "'";

  const qs = new URLSearchParams({
    language: 'ita',
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: 'CP:CadastralParcel',
    SRSNAME: 'urn:ogc:def:crs:EPSG::6706',
    COUNT: '100',
    CQL_FILTER: cql
  });

  let xml;
  try {
    xml = await fetchText(WFS + '?' + qs.toString(), 15000);
  } catch (err) {
    return bad(res, 502, 'Servizio WFS catastale non disponibile');
  }

  const all = parseMembers(xml);
  const matches = matchFoglio(all, foglio);

  if (!matches.length) {
    return bad(res, 404, 'Particella non trovata', {
      comune,
      foundSameParcelOtherSheets: all.map(x => x.ref).slice(0, 20)
    });
  }

  if (matches.length > 1) {
    return bad(res, 409, 'Più particelle corrispondono alla ricerca', {
      comune,
      matches: matches.map(x => x.ref).slice(0, 20)
    });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).json({
    comune,
    foglio,
    particella,
    ...matches[0]
  });
}

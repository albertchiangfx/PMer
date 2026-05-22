const express = require('express');

const router = express.Router();

const ALLOWED_COUNTRIES = new Set([
  'TW',
  'US',
  'JP',
  'CN',
  'HK',
  'SG',
  'KR',
  'GB',
  'DE',
  'FR',
  'AU',
  'CA',
]);

const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function readJsonResponse(res) {
  if (res.status === 204 || res.status === 404) return [];
  const text = await res.text();
  if (!text || !text.trim()) return [];
  return JSON.parse(text);
}

async function fetchNagerYear(year, countryCode) {
  const key = `nager|${year}|${countryCode}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    const err = new Error(`Holiday API ${res.status} for ${countryCode}/${year}`);
    err.status = res.status === 404 ? 404 : 502;
    throw err;
  }
  const rows = await readJsonResponse(res);
  const data = (rows || []).map((row) => ({
    date: String(row.date || '').slice(0, 10),
    localName: row.localName || row.name,
    name: row.name,
    countryCode,
  }));
  cache.set(key, { at: Date.now(), data });
  return data;
}

/** 台灣：中華民國政府行政機關辦公日曆（api.pin-yi.me） */
async function fetchTaiwanYear(year) {
  const key = `tw|${year}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const url = `https://api.pin-yi.me/taiwan-calendar/${year}/`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    redirect: 'follow',
  });
  if (!res.ok) {
    const err = new Error(`Taiwan calendar API ${res.status} for ${year}`);
    err.status = 502;
    throw err;
  }
  const rows = await readJsonResponse(res);
  const data = (rows || [])
    .filter((row) => row.isHoliday)
    .map((row) => {
      const raw = String(row.date || '');
      const date =
        raw.length === 8
          ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
          : String(row.date_format || '').replace(/\//g, '-').slice(0, 10);
      const label = String(row.caption || '').trim() || '國定假日';
      return {
        date,
        localName: label,
        name: label,
        countryCode: 'TW',
      };
    })
    .filter((row) => row.date);
  cache.set(key, { at: Date.now(), data });
  return data;
}

async function fetchCountryYear(year, countryCode) {
  if (countryCode === 'TW') return fetchTaiwanYear(year);
  return fetchNagerYear(year, countryCode);
}

/**
 * GET /api/holidays/public?year=2026&countries=TW,US
 */
router.get('/public', async (req, res, next) => {
  try {
    const year = Number.parseInt(String(req.query.year || ''), 10);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Invalid year' });
    }

    const countries = String(req.query.countries || 'TW,US')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter((c) => ALLOWED_COUNTRIES.has(c));

    const codes = countries.length ? countries : ['TW', 'US'];
    const batches = await Promise.all(
      codes.map(async (countryCode) => {
        try {
          return await fetchCountryYear(year, countryCode);
        } catch (e) {
          if (e.status === 404) return [];
          throw e;
        }
      })
    );

    res.json(batches.flat().filter((r) => r.date));
  } catch (err) {
    next(err);
  }
});

module.exports = router;

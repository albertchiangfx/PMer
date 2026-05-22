import {
  eachDayOfInterval,
  format,
  getYear,
  isValid,
  isWeekend,
  parseISO,
} from 'date-fns';
import { api } from './api';

/** 預設顯示：台、日、美、英 */
export const BASE_HOLIDAY_COUNTRIES = ['TW', 'JP', 'US', 'GB'];

export const DEFAULT_HOLIDAY_COUNTRIES = [...BASE_HOLIDAY_COUNTRIES];

/** 可透過「＋」新增的國家 */
export const HOLIDAY_COUNTRY_OPTIONS = [
  { code: 'TW', label: '台灣' },
  { code: 'JP', label: '日本' },
  { code: 'US', label: '美國' },
  { code: 'GB', label: '英國' },
  { code: 'CN', label: '中國' },
  { code: 'HK', label: '香港' },
  { code: 'SG', label: '新加坡' },
  { code: 'KR', label: '韓國' },
  { code: 'DE', label: '德國' },
  { code: 'FR', label: '法國' },
  { code: 'AU', label: '澳洲' },
  { code: 'CA', label: '加拿大' },
];

const ALLOWED = new Set(HOLIDAY_COUNTRY_OPTIONS.map((c) => c.code));

export const ADDABLE_HOLIDAY_COUNTRIES = HOLIDAY_COUNTRY_OPTIONS.filter(
  (c) => !BASE_HOLIDAY_COUNTRIES.includes(c.code)
);

function settingsStorageKey(projectId) {
  return `pmer-holiday-enabled-${String(projectId || 'global')}`;
}

function legacyExtraStorageKey(projectId) {
  return `pmer-holiday-extra-${String(projectId || 'global')}`;
}

function normalizeEnabled(codes) {
  return [...new Set((codes || []).map((c) => String(c).toUpperCase()).filter((c) => ALLOWED.has(c)))];
}

/** 讀取此專案已啟用的國定假日地區（台日美英可關閉） */
export function loadEnabledHolidayCountries(projectId) {
  if (typeof window === 'undefined') return [...DEFAULT_HOLIDAY_COUNTRIES];
  try {
    const raw = localStorage.getItem(settingsStorageKey(projectId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.enabled)) {
        const enabled = normalizeEnabled(parsed.enabled);
        if (enabled.length) return enabled;
      }
      if (Array.isArray(parsed)) {
        const enabled = normalizeEnabled(parsed);
        if (enabled.length) return enabled;
      }
    }
    const legacy = localStorage.getItem(legacyExtraStorageKey(projectId));
    if (legacy) {
      const extra = JSON.parse(legacy);
      if (Array.isArray(extra)) {
        return normalizeEnabled([...BASE_HOLIDAY_COUNTRIES, ...extra]);
      }
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_HOLIDAY_COUNTRIES];
}

export function saveEnabledHolidayCountries(projectId, enabledCodes) {
  if (typeof window === 'undefined') return;
  const enabled = normalizeEnabled(enabledCodes);
  localStorage.setItem(
    settingsStorageKey(projectId),
    JSON.stringify({ enabled: enabled.length ? enabled : [] })
  );
}

export function resolveHolidayCountries(projectId, enabledCodes) {
  if (Array.isArray(enabledCodes)) return normalizeEnabled(enabledCodes);
  return loadEnabledHolidayCountries(projectId);
}

/** @deprecated */
export function loadExtraHolidayCountries(projectId) {
  return loadEnabledHolidayCountries(projectId).filter((c) => !BASE_HOLIDAY_COUNTRIES.includes(c));
}

/** @deprecated */
export function saveExtraHolidayCountries(projectId, extraCodes) {
  const baseOn = loadEnabledHolidayCountries(projectId).filter((c) =>
    BASE_HOLIDAY_COUNTRIES.includes(c)
  );
  saveEnabledHolidayCountries(projectId, [
    ...baseOn,
    ...normalizeEnabled(extraCodes).filter((c) => !BASE_HOLIDAY_COUNTRIES.includes(c)),
  ]);
}

/** @deprecated */
export function loadHolidayCountryCodes(projectId) {
  return loadEnabledHolidayCountries(projectId);
}

export function countryLabel(code) {
  return HOLIDAY_COUNTRY_OPTIONS.find((c) => c.code === code)?.label || code;
}

const cache = new Map();

function toYmd(d) {
  if (!d) return '';
  if (d instanceof Date && isValid(d)) return format(d, 'yyyy-MM-dd');
  return String(d).slice(0, 10);
}

function toDate(d) {
  const s = toYmd(d);
  if (!s) return null;
  const p = parseISO(s);
  return isValid(p) ? p : null;
}

function yearsInRange(start, end) {
  const ys = new Set();
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return [getYear(new Date())];
  let y = getYear(s);
  const yEnd = getYear(e);
  while (y <= yEnd) {
    ys.add(y);
    y += 1;
  }
  return [...ys];
}

async function fetchYearHolidays(year, countryCodes) {
  const codes = [...countryCodes].sort().join(',');
  const key = `${year}|${codes}`;
  if (cache.has(key)) return cache.get(key);

  const rows = await api.getPublicHolidays({ year, countries: codes });
  cache.set(key, rows);
  return rows;
}

/**
 * @param {Date|string} rangeStart
 * @param {Date|string} rangeEnd
 * @param {string[]} countryCodes
 */
export async function loadHolidayIndex(rangeStart, rangeEnd, countryCodes) {
  if (!countryCodes?.length) {
    return { dateSet: new Set(), byDate: new Map() };
  }
  const codes = countryCodes;
  const dateSet = new Set();
  const byDate = new Map();

  const years = yearsInRange(rangeStart, rangeEnd);
  const batches = await Promise.all(years.map((y) => fetchYearHolidays(y, codes)));

  for (const list of batches) {
    for (const h of list || []) {
      const date = toYmd(h.date);
      if (!date) continue;
      dateSet.add(date);
      const entry = {
        localName: h.localName || h.name || '國定假日',
        countryCode: h.countryCode || '',
      };
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(entry);
    }
  }

  return { dateSet, byDate };
}

/** 起訖日含當天，排除週末與國定假日 */
export function countWorkingDaysInclusive(start, end, holidayYmdSet) {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e || e < s) return 0;
  const hol = holidayYmdSet instanceof Set ? holidayYmdSet : new Set();
  return eachDayOfInterval({ start: s, end: e }).filter((d) => {
    if (isWeekend(d)) return false;
    return !hol.has(toYmd(d));
  }).length;
}

export function holidayTooltip(ymd, holidayByDate) {
  if (!holidayByDate?.get) return '';
  const items = holidayByDate.get(ymd);
  if (!items?.length) return '';
  return items.map((h) => `${h.countryCode} ${h.localName}`).join('、');
}

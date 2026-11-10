import { timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 30;
const MAX_CONDITIONS = 2000;
const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' });
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function bucket(dayNumber) {
  return `day-${dayNumber % HISTORY_DAYS}`;
}

function normalizeCondition(data) {
  if (!data || !['website', 'idfarm'].includes(data.channel)) return null;
  const ids = list => Array.isArray(list) && list.length <= 500 &&
    list.every(id => typeof id === 'string' && /^ba-\d{3,6}$/.test(id));
  if (!ids(data.required) || !ids(data.preferred)) return null;
  const band = value => Number.isInteger(value) && value >= 0 && value <= 995 && value % 5 === 0;
  if (!band(data.minBand) || !(data.maxBand === null ||
      band(data.maxBand) && data.minBand <= data.maxBand)) return null;
  const minFes = data.minFes === undefined ? 0 : data.minFes;
  if (!Number.isInteger(minFes) || minFes < 0 || minFes > 500) return null;
  const required = [...new Set(data.required)].sort();
  const preferred = [...new Set(data.preferred)].filter(id => !required.includes(id)).sort();
  return [data.channel, required, preferred, data.minBand, data.maxBand, minFes];
}

async function countSearch(store, dayNumber, condition) {
  const key = bucket(dayNumber);
  const match = JSON.stringify(condition);
  for (let attempt = 0; attempt < 6; attempt++) {
    const entry = await store.getWithMetadata(key, { type: 'json' });
    if (entry && entry.data.day > dayNumber) return false;
    const counts = entry?.data.day === dayNumber ? entry.data.counts : {};
    if (!Object.hasOwn(counts, match) && Object.keys(counts).length >= MAX_CONDITIONS) return false;
    counts[match] = (counts[match] ?? 0) + 1;
    const writeOptions = entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true };
    if ((await store.setJSON(key, { day: dayNumber, counts }, writeOptions)).modified) return true;
    await new Promise(resolve => setTimeout(resolve, 25 + 25 * attempt + Math.random() * 30));
  }
  return false;
}

function increment(map, key, count) {
  map.set(key, (map.get(key) ?? 0) + count);
}

const top = map => [...map].sort(([a, aCount], [b, bCount]) => bCount - aCount || a.localeCompare(b)).slice(0, 15);

async function readSummary(store, today, days, channel) {
  const end = Date.parse(today) / DAY_MS;
  const offsets = Array.from({ length: days }, (_, index) => end - index);
  const entries = await Promise.all(offsets.map(day => store.get(bucket(day), { type: 'json' })));
  const required = new Map(), preferred = new Map(), budgets = new Map(), conditions = new Map(), fesCounts = new Map();
  let total = 0;
  for (const [index, entry] of entries.entries()) {
    if (entry?.day !== offsets[index]) continue;
    for (const [key, count] of Object.entries(entry.counts)) {
      const [source, must, wish, min, max, minFes = 0] = JSON.parse(key);
      if (channel !== 'all' && channel !== source) continue;
      total += count;
      for (const student of must) increment(required, student, count);
      for (const student of wish) increment(preferred, student, count);
      increment(budgets, JSON.stringify([min, max]), count);
      increment(fesCounts, String(minFes), count);
      if (must.length || wish.length || minFes) increment(conditions, JSON.stringify([must, wish, min, max, minFes]), count);
    }
  }
  return { total, required: top(required), preferred: top(preferred),
    budgets: top(budgets).map(([key, count]) => [...JSON.parse(key), count]),
    fesCounts: top(fesCounts).map(([minimum, count]) => [Number(minimum), count]),
    conditions: top(conditions).map(([key, count]) => {
      const [must, wish, min, max, minFes] = JSON.parse(key);
      return [must, wish, min, max, count, minFes];
    }) };
}

export async function handleSearchStats(request, token, openStore, now = new Date()) {
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return json({ error: 'disabled' }, 503);
  const url = new URL(request.url);
  const today = dateFormat.format(now);

  if (request.method === 'POST') {
    if (request.headers.get('origin') !== url.origin ||
        !/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) {
      return json({ error: 'invalid_request' }, 403);
    }
    let condition;
    try {
      const body = await request.text();
      if (body.length <= 10_000) condition = normalizeCondition(JSON.parse(body));
    } catch {
      return json({ error: 'invalid_condition' }, 400);
    }
    if (!condition) return json({ error: 'invalid_condition' }, 400);
    if (!await countSearch(openStore(), Date.parse(today) / DAY_MS, condition)) {
      return json({ error: 'temporarily_unavailable' }, 503);
    }
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }

  if (request.method === 'GET') {
    const supplied = Buffer.from(request.headers.get('authorization') ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return json({ error: 'unauthorized' }, 401);
    }
    const days = Number(url.searchParams.get('days') ?? 28);
    const channel = url.searchParams.get('channel') ?? 'all';
    if (![7, 28].includes(days) || !['all', 'website', 'idfarm'].includes(channel)) {
      return json({ error: 'invalid_filter' }, 400);
    }
    return json({ today, days, channel, ...await readSummary(openStore(), today, days, channel) });
  }
  return json({ error: 'method_not_allowed' }, 405);
}

export default function (request) {
  return handleSearchStats(request, process.env.SEARCH_STATS_TOKEN,
    () => getStore({ name: 'search-condition-stats', consistency: 'strong' }));
}

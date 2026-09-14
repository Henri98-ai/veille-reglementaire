const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');
const SOURCES_FILE = path.join(DATA_DIR, 'sources.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const DEFAULT_SOURCES_FILE = path.join(__dirname, '..', 'config', 'sources.json');

function ensureFile(file, defaultContent) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultContent, null, 2));
  }
}

function init() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  ensureFile(ITEMS_FILE, []);
  if (!fs.existsSync(SOURCES_FILE)) {
    const defaults = JSON.parse(fs.readFileSync(DEFAULT_SOURCES_FILE, 'utf-8'));
    fs.writeFileSync(SOURCES_FILE, JSON.stringify(defaults, null, 2));
  }
  ensureFile(STATE_FILE, { lastRun: null, lastRunSummary: [] });
  ensureFile(SETTINGS_FILE, {
    emailEnabled: true,
    recipients: (process.env.MAIL_TO || '').split(',').map((s) => s.trim()).filter(Boolean),
    sendEvenIfEmpty: true
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function hashKey(sourceId, url, title) {
  return crypto.createHash('sha1').update(`${sourceId}|${url || ''}|${title}`).digest('hex');
}

// ---------- Items ----------
function getItems() {
  return readJson(ITEMS_FILE);
}

function saveItems(items) {
  writeJson(ITEMS_FILE, items);
}

/**
 * Fusionne de nouveaux items scrapés avec l'existant (dédoublonnage par hash).
 * Retourne { added, newItems } où newItems contient les items réellement ajoutés
 * (utile pour construire la synthèse email du jour).
 */
function upsertItems(newItems) {
  const items = getItems();
  const index = new Map(items.map((it) => [it.id, it]));
  const addedItems = [];

  for (const raw of newItems) {
    const id = hashKey(raw.sourceId, raw.url, raw.title);
    if (index.has(id)) continue;
    const item = {
      id,
      sourceId: raw.sourceId,
      sourceName: raw.sourceName,
      title: raw.title,
      url: raw.url || null,
      date: raw.date ? new Date(raw.date).toISOString() : null,
      summary: raw.summary || '',
      categories: raw.categories || [],
      firstSeen: new Date().toISOString(),
      manual: !!raw.manual,
      read: false,
      important: false,
      shareTeam: false,
      shareClient: false,
      note: ''
    };
    items.push(item);
    index.set(id, item);
    addedItems.push(item);
  }

  // Tri par date décroissante (les items sans date passent en fin)
  items.sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });

  saveItems(items);
  return { added: addedItems.length, newItems: addedItems };
}

function updateItem(id, patch) {
  const items = getItems();
  const idx = items.findIndex((it) => it.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch };
  saveItems(items);
  return items[idx];
}

function addManualItem({ title, url, date, summary, categories, sourceName }) {
  const raw = {
    sourceId: 'manuel',
    sourceName: sourceName || 'Ajout manuel',
    title,
    url,
    date: date || new Date().toISOString(),
    summary,
    categories,
    manual: true
  };
  upsertItems([raw]);
}

// ---------- Sources ----------
function getSources() {
  return readJson(SOURCES_FILE);
}
function saveSources(sources) {
  writeJson(SOURCES_FILE, sources);
}
function upsertSource(source) {
  const sources = getSources();
  const idx = sources.findIndex((s) => s.id === source.id);
  if (idx === -1) sources.push(source);
  else sources[idx] = { ...sources[idx], ...source };
  saveSources(sources);
}
function deleteSource(id) {
  const sources = getSources().filter((s) => s.id !== id);
  saveSources(sources);
}

// ---------- State ----------
function getState() {
  return readJson(STATE_FILE);
}
function setState(patch) {
  const state = getState();
  writeJson(STATE_FILE, { ...state, ...patch });
}

// ---------- Settings ----------
function getSettings() {
  return readJson(SETTINGS_FILE);
}
function setSettings(patch) {
  const settings = getSettings();
  const updated = { ...settings, ...patch };
  writeJson(SETTINGS_FILE, updated);
  return updated;
}

module.exports = {
  init,
  getItems,
  upsertItems,
  updateItem,
  addManualItem,
  getSources,
  saveSources,
  upsertSource,
  deleteSource,
  getState,
  setState,
  getSettings,
  setSettings
};

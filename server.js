const express = require('express');
const session = require('express-session');
const path = require('path');
const cron = require('node-cron');

const store = require('./lib/store');
const { runAggregation } = require('./lib/aggregate');
const { CATEGORY_LABELS } = require('./lib/categorize');

store.init();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_CODE = process.env.ADMIN_CODE || 'changeme';

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'veille-reglementaire-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12 } // 12h
  })
);
app.use(express.static(path.join(__dirname, 'public')));

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Non authentifié' });
}

// ---------- Auth ----------
app.post('/api/admin/login', (req, res) => {
  const { code } = req.body || {};
  if (code && code === ADMIN_CODE) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Code incorrect' });
});
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
app.get('/api/admin/status', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// ---------- Items (lecture publique) ----------
app.get('/api/items', (req, res) => {
  const { category, sourceId, days, q } = req.query;
  let items = store.getItems();

  if (category) items = items.filter((it) => it.categories.includes(category));
  if (sourceId) items = items.filter((it) => it.sourceId === sourceId);
  if (days) {
    const cutoff = Date.now() - Number(days) * 24 * 3600 * 1000;
    items = items.filter((it) => !it.date || new Date(it.date).getTime() >= cutoff);
  }
  if (q) {
    const needle = q.toLowerCase();
    items = items.filter((it) => it.title.toLowerCase().includes(needle) || (it.summary || '').toLowerCase().includes(needle));
  }

  res.json({ items, categoryLabels: CATEGORY_LABELS });
});

app.get('/api/digest', (req, res) => {
  const items = store.getItems().filter((it) => it.shareClient);
  res.json({ items, categoryLabels: CATEGORY_LABELS });
});

app.get('/api/state', (req, res) => {
  res.json(store.getState());
});

app.get('/api/sources', (req, res) => {
  // Vue publique allégée (pas d'URL sensible de config si besoin plus tard)
  res.json(store.getSources());
});

// ---------- Actions (admin uniquement) ----------
app.post('/api/refresh', requireAdmin, async (req, res) => {
  try {
    const result = await runAggregation();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/items/:id/flag', requireAdmin, (req, res) => {
  const { field, value, note } = req.body || {};
  const allowed = ['read', 'important', 'shareTeam', 'shareClient'];
  if (!allowed.includes(field)) return res.status(400).json({ error: 'Champ non autorisé' });
  const patch = { [field]: !!value };
  if (typeof note === 'string') patch.note = note;
  const updated = store.updateItem(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'Item introuvable' });
  res.json({ ok: true, item: updated });
});

app.post('/api/items/manual', requireAdmin, (req, res) => {
  const { title, url, date, summary, categories, sourceName } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Titre requis' });
  store.addManualItem({ title, url, date, summary, categories: categories || [], sourceName });
  res.json({ ok: true });
});

app.post('/api/sources', requireAdmin, (req, res) => {
  const source = req.body;
  if (!source || !source.id || !source.url) return res.status(400).json({ error: 'id et url requis' });
  store.upsertSource(source);
  res.json({ ok: true });
});
app.delete('/api/sources/:id', requireAdmin, (req, res) => {
  store.deleteSource(req.params.id);
  res.json({ ok: true });
});

// ---------- Pages ----------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/digest', (req, res) => res.sendFile(path.join(__dirname, 'public', 'digest.html')));

// ---------- Planification quotidienne ----------
// Tous les jours ouvrés à 7h15, heure de Paris
cron.schedule('15 7 * * 1-5', () => {
  console.log('[cron] Lancement de la veille quotidienne...');
  runAggregation()
    .then((r) => console.log(`[cron] Terminé : ${r.totalAdded} nouvel(le)s actualité(s)`))
    .catch((err) => console.error('[cron] Erreur :', err.message));
}, { timezone: 'Europe/Paris' });

app.listen(PORT, () => {
  console.log(`Veille réglementaire lancée sur le port ${PORT}`);
  // Premier scrape au démarrage si aucune donnée n'existe encore
  if (store.getItems().length === 0) {
    runAggregation().then((r) => console.log(`Scrape initial : ${r.totalAdded} actualité(s) ajoutée(s)`));
  }
});

const store = require('./store');
const { scrapeSource } = require('./scraper');
const { categorize } = require('./categorize');

async function runAggregation() {
  const sources = store.getSources().filter((s) => s.enabled !== false);
  const summary = [];
  let totalAdded = 0;

  for (const source of sources) {
    const result = await scrapeSource(source);
    if (!result.ok) {
      summary.push({ sourceId: source.id, sourceName: source.name, ok: false, error: result.error, added: 0 });
      continue;
    }

    const enriched = result.items.map((item) => ({
      ...item,
      sourceId: source.id,
      sourceName: source.name,
      categories: categorize(`${item.title} ${item.summary || ''}`, source.defaultCategories || [])
    }));

    const added = store.upsertItems(enriched);
    totalAdded += added;
    summary.push({ sourceId: source.id, sourceName: source.name, ok: true, error: null, added, found: enriched.length });
  }

  store.setState({ lastRun: new Date().toISOString(), lastRunSummary: summary });
  return { totalAdded, summary };
}

module.exports = { runAggregation };

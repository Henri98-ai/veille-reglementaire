const store = require('./store');
const { scrapeSource } = require('./scraper');
const { categorize } = require('./categorize');
const { sendDailyDigest } = require('./mailer');

async function runAggregation() {
  const sources = store.getSources().filter((s) => s.enabled !== false);
  const summary = [];
  let totalAdded = 0;
  const allNewItems = [];

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
      categories: Array.from(
        new Set([
          ...categorize(`${item.title} ${item.summary || ''}`, source.defaultCategories || []),
          ...(source.forceCategories || [])
        ])
      )
    }));

    const { added, newItems } = store.upsertItems(enriched);
    totalAdded += added;
    allNewItems.push(...newItems);
    summary.push({ sourceId: source.id, sourceName: source.name, ok: true, error: null, added, found: enriched.length });
  }

  store.setState({ lastRun: new Date().toISOString(), lastRunSummary: summary });
  return { totalAdded, summary, newItems: allNewItems };
}

/** Lance l'agrégation puis envoie la synthèse email du jour selon les réglages. */
async function runAggregationAndNotify(dashboardUrl) {
  const result = await runAggregation();
  const settings = store.getSettings();

  let emailResult = { sent: false, reason: 'Envoi désactivé dans les réglages' };
  if (settings.emailEnabled && (result.newItems.length > 0 || settings.sendEvenIfEmpty)) {
    emailResult = await sendDailyDigest({
      items: result.newItems,
      recipients: settings.recipients,
      dashboardUrl: dashboardUrl || ''
    });
  }

  store.setState({ lastEmail: { at: new Date().toISOString(), ...emailResult, itemCount: result.newItems.length } });
  return { ...result, emailResult };
}

module.exports = { runAggregation, runAggregationAndNotify };

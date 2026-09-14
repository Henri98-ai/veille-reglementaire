const cheerio = require('cheerio');
const fetch = require('node-fetch');
const RSSParser = require('rss-parser');
const rssParser = new RSSParser({ timeout: 15000 });

const DATE_RE = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/;

const MONTHS_FR = {
  janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11, decembre: 11
};
// Ex: "27 mai 2026", "1er septembre 2026", "Publié le 15 décembre 2025"
const DATE_FR_RE = new RegExp(
  `(\\d{1,2})(?:er)?\\s+(${Object.keys(MONTHS_FR).join('|')})\\s+(\\d{4})`,
  'i'
);

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 VeilleReglementaireBot/1.0',
  Accept: 'text/html,application/xhtml+xml,application/xml,application/rss+xml;q=0.9,*/*;q=0.8'
};

function parseFrDate(str) {
  if (!str) return null;
  const m = str.match(DATE_RE);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    const date = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!isNaN(date.getTime())) return date;
  }
  const mFr = str.match(DATE_FR_RE);
  if (mFr) {
    const [, d, monthName, y] = mFr;
    const monthIdx = MONTHS_FR[monthName.toLowerCase()];
    const date = new Date(Number(y), monthIdx, Number(d));
    if (!isNaN(date.getTime())) return date;
  }
  return null;
}

function hasDate(str) {
  return DATE_RE.test(str) || DATE_FR_RE.test(str);
}

function absoluteUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch (e) {
    return null;
  }
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: HEADERS, timeout: 20000 });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.text();
}

/** Type "rss" : flux RSS/Atom standard */
async function scrapeRss(source) {
  const feed = await rssParser.parseURL(source.url);
  return (feed.items || []).slice(0, 40).map((item) => ({
    title: (item.title || '').trim(),
    url: item.link,
    date: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null,
    summary: (item.contentSnippet || item.content || '').slice(0, 400)
  }));
}

/**
 * Type "html-list" : structure connue (ex. BOFiP) où chaque item est un titre
 * (itemSelector) contenant un lien (titleSelector), suivi d'une date en texte libre
 * dans le même bloc parent.
 */
async function scrapeHtmlList(source) {
  const html = await fetchHtml(source.url);
  const $ = cheerio.load(html);
  const results = [];

  $(source.itemSelector || 'h2').each((_, el) => {
    const $el = $(el);
    const $link = source.titleSelector ? $el.find(source.titleSelector).first() : $el.find('a').first();
    const title = $link.text().trim();
    const href = $link.attr('href');
    if (!title || !href) return;

    // La date se trouve généralement juste après, dans le bloc parent ou le frère suivant
    let dateText = $el.next().text();
    if (!hasDate(dateText)) {
      dateText = $el.parent().text();
    }
    const date = parseFrDate(dateText);

    results.push({
      title,
      url: absoluteUrl(href, source.url),
      date,
      summary: ''
    });
  });

  return results.slice(0, 40);
}

/**
 * Type "html-generic" : scraping heuristique pour les pages sans structure connue.
 * On récupère tous les liens dont le texte ressemble à un titre d'actualité
 * (longueur suffisante, pas un lien de nav/footer trivial).
 */
async function scrapeHtmlGeneric(source) {
  const html = await fetchHtml(source.url);
  const $ = cheerio.load(html);
  const seen = new Set();
  const results = [];

  $('a').each((_, el) => {
    const $el = $(el);
    const title = $el.text().replace(/\s+/g, ' ').trim();
    const href = $el.attr('href');
    if (!href || !title) return;
    if (title.length < 30 || title.length > 300) return; // filtre les liens de nav/menus
    const url = absoluteUrl(href, source.url);
    if (!url || seen.has(url)) return;
    seen.add(url);

    // Cherche une date à proximité (parent, grand-parent)
    let dateText = $el.parent().text();
    if (!hasDate(dateText)) dateText = $el.closest('article, li, div').text();
    const date = parseFrDate(dateText);

    results.push({ title, url, date, summary: '' });
  });

  return results.slice(0, 40);
}

async function scrapeSource(source) {
  try {
    let items;
    if (source.type === 'rss') items = await scrapeRss(source);
    else if (source.type === 'html-list') items = await scrapeHtmlList(source);
    else items = await scrapeHtmlGeneric(source);

    return { ok: true, items, error: null };
  } catch (err) {
    return { ok: false, items: [], error: err.message };
  }
}

module.exports = { scrapeSource, parseFrDate };

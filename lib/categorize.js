const fs = require('fs');
const path = require('path');

function loadKeywords() {
  const file = path.join(__dirname, '..', 'config', 'keywords.json');
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

const CATEGORY_LABELS = {
  comptabilite: 'Comptabilité',
  fiscalite: 'Fiscalité',
  facturation_electronique: 'Facturation électronique',
  ia: 'Intelligence artificielle',
  droit_affaires: 'Droit des affaires'
};

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // retire les accents pour un matching robuste
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Détermine les catégories d'un item à partir de son titre (+ résumé éventuel).
 * Retourne toujours au moins une catégorie (fallback = defaultCategories de la source).
 * Utilise des limites de mots pour éviter les faux positifs sur les sigles courts
 * (ex. "IS" ne doit pas matcher dans "listées").
 */
function categorize(text, defaultCategories = []) {
  const keywords = loadKeywords();
  const normalizedText = normalize(text);
  const matched = new Set();

  for (const [category, terms] of Object.entries(keywords)) {
    for (const term of terms) {
      const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(normalize(term))}(?:$|[^a-z0-9])`, 'i');
      if (pattern.test(normalizedText)) {
        matched.add(category);
        break;
      }
    }
  }

  if (matched.size === 0) {
    defaultCategories.forEach((c) => matched.add(c));
  }

  if (matched.size === 0) {
    matched.add('fiscalite'); // filet de sécurité
  }

  return Array.from(matched);
}

module.exports = { categorize, CATEGORY_LABELS, loadKeywords };

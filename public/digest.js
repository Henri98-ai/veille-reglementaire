let currentItems = [];
let categoryLabels = {};

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function itemCard(item) {
  const cats = item.categories.map((c) => `<span class="tag ${c}">${categoryLabels[c] || c}</span>`).join('');
  return `
    <div class="card">
      <div class="cats">${cats}</div>
      <h3><a href="${item.url || '#'}" target="_blank" rel="noopener">${item.title}</a></h3>
      <div class="source-line">${item.sourceName} · ${fmtDate(item.date)}</div>
      ${item.summary ? `<div class="summary">${item.summary}</div>` : ''}
      ${item.note ? `<div class="summary" style="margin-top:6px;font-style:italic">${item.note}</div>` : ''}
    </div>`;
}

function buildPlainText() {
  const grouped = {};
  currentItems.forEach((it) => {
    const cat = it.categories[0] || 'autre';
    grouped[cat] = grouped[cat] || [];
    grouped[cat].push(it);
  });

  let text = `VEILLE RÉGLEMENTAIRE — ${new Date().toLocaleDateString('fr-FR')}\n\n`;
  for (const [cat, items] of Object.entries(grouped)) {
    text += `--- ${categoryLabels[cat] || cat} ---\n`;
    items.forEach((it) => {
      text += `• ${it.title}${it.date ? ' (' + fmtDate(it.date) + ')' : ''}\n`;
      if (it.url) text += `  ${it.url}\n`;
      if (it.note) text += `  Note : ${it.note}\n`;
    });
    text += '\n';
  }
  return text;
}

document.getElementById('copyBtn').addEventListener('click', () => {
  const text = buildPlainText();
  const box = document.getElementById('copyPreview');
  box.style.display = 'block';
  box.textContent = text;
  navigator.clipboard?.writeText(text);
});

(async function loadDigest() {
  const res = await fetch('/api/digest');
  const data = await res.json();
  categoryLabels = data.categoryLabels;
  currentItems = data.items;

  document.getElementById('resultCount').textContent = `${data.items.length} actualité(s) sélectionnée(s)`;
  const list = document.getElementById('itemsList');
  list.innerHTML = data.items.length
    ? data.items.map(itemCard).join('')
    : `<div class="empty">Aucune actualité sélectionnée pour le moment.</div>`;
})();

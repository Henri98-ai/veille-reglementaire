let state = { category: 'all', sourceId: '', days: '7', q: '', isAdmin: false };
let categoryLabels = {};

function fmtDate(iso) {
  if (!iso) return 'Date inconnue';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

async function checkAdmin() {
  const res = await fetch('/api/admin/status');
  const data = await res.json();
  state.isAdmin = data.isAdmin;
}

async function loadSources() {
  const res = await fetch('/api/sources');
  const sources = await res.json();
  const select = document.getElementById('sourceFilter');
  sources.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    select.appendChild(opt);
  });
}

async function loadState() {
  const res = await fetch('/api/state');
  const s = await res.json();
  const info = document.getElementById('lastRunInfo');
  if (s.lastRun) {
    info.textContent = `Dernière mise à jour : ${new Date(s.lastRun).toLocaleString('fr-FR')}`;
  } else {
    info.textContent = 'Aucune veille exécutée pour le moment';
  }
}

function itemCard(item) {
  const cats = item.categories
    .map((c) => `<span class="tag ${c}">${categoryLabels[c] || c}</span>`)
    .join('');

  const adminBlock = state.isAdmin
    ? `<div class="admin-actions" data-id="${item.id}">
        <label><input type="checkbox" data-field="important" ${item.important ? 'checked' : ''}/> Important</label>
        <label><input type="checkbox" data-field="shareTeam" ${item.shareTeam ? 'checked' : ''}/> Partager équipe</label>
        <label><input type="checkbox" data-field="shareClient" ${item.shareClient ? 'checked' : ''}/> Partager clients</label>
      </div>`
    : '';

  return `
    <div class="card">
      <div class="cats">${cats}</div>
      <h3><a href="${item.url || '#'}" target="_blank" rel="noopener">${item.title}</a></h3>
      <div class="source-line">${item.sourceName} · ${fmtDate(item.date)}</div>
      ${item.summary ? `<div class="summary">${item.summary}</div>` : ''}
      ${adminBlock}
    </div>`;
}

async function loadItems() {
  const params = new URLSearchParams();
  if (state.category !== 'all') params.set('category', state.category);
  if (state.sourceId) params.set('sourceId', state.sourceId);
  if (state.days) params.set('days', state.days);
  if (state.q) params.set('q', state.q);

  const res = await fetch('/api/items?' + params.toString());
  const data = await res.json();
  categoryLabels = data.categoryLabels;

  const list = document.getElementById('itemsList');
  document.getElementById('resultCount').textContent = `${data.items.length} actualité(s)`;

  if (data.items.length === 0) {
    list.innerHTML = `<div class="empty">Aucune actualité pour ces filtres.</div>`;
    return;
  }

  list.innerHTML = data.items.map(itemCard).join('');

  if (state.isAdmin) {
    list.querySelectorAll('.admin-actions input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', async (e) => {
        const id = e.target.closest('.admin-actions').dataset.id;
        const field = e.target.dataset.field;
        await fetch(`/api/items/${id}/flag`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field, value: e.target.checked })
        });
      });
    });
  }
}

function bindFilters() {
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.category = chip.dataset.cat;
      loadItems();
    });
  });
  document.getElementById('sourceFilter').addEventListener('change', (e) => {
    state.sourceId = e.target.value;
    loadItems();
  });
  document.getElementById('daysFilter').addEventListener('change', (e) => {
    state.days = e.target.value;
    loadItems();
  });
  let searchTimeout;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.q = e.target.value;
      loadItems();
    }, 300);
  });
}

(async function initDashboard() {
  await checkAdmin();
  await loadSources();
  await loadState();
  bindFilters();
  await loadItems();
})();

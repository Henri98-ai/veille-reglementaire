let categoryLabels = {};

function fmtDate(iso) {
  if (!iso) return 'Date inconnue';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

async function checkAdmin() {
  const res = await fetch('/api/admin/status');
  const data = await res.json();
  if (data.isAdmin) showPanel();
}

function showPanel() {
  document.getElementById('loginBox').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'block';
  document.getElementById('logoutLink').style.display = 'inline';
  loadState();
  loadSources();
  loadAdminItems();
  loadSettings();
}

async function loadSettings() {
  const res = await fetch('/api/settings');
  const s = await res.json();
  document.getElementById('emailRecipients').value = (s.recipients || []).join(', ');
  document.getElementById('emailEnabled').checked = !!s.emailEnabled;
  document.getElementById('sendEvenIfEmpty').checked = !!s.sendEvenIfEmpty;
}

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  const recipients = document
    .getElementById('emailRecipients')
    .value.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const emailEnabled = document.getElementById('emailEnabled').checked;
  const sendEvenIfEmpty = document.getElementById('sendEvenIfEmpty').checked;

  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipients, emailEnabled, sendEvenIfEmpty })
  });
  const data = await res.json();
  document.getElementById('settingsResult').textContent = data.ok ? '✅ Réglages enregistrés.' : 'Erreur.';
});

document.getElementById('testEmailBtn').addEventListener('click', async () => {
  const btn = document.getElementById('testEmailBtn');
  btn.disabled = true;
  btn.textContent = 'Envoi en cours...';
  const res = await fetch('/api/settings/test-email', { method: 'POST' });
  const data = await res.json();
  btn.disabled = false;
  btn.textContent = 'Envoyer un email de test';
  document.getElementById('settingsResult').textContent = data.sent
    ? '✅ Email de test envoyé.'
    : '⚠️ Non envoyé : ' + data.reason;
});

document.getElementById('loginBtn').addEventListener('click', async () => {
  const code = document.getElementById('codeInput').value;
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  const data = await res.json();
  if (data.ok) showPanel();
  else document.getElementById('loginError').textContent = 'Code incorrect.';
});

document.getElementById('logoutLink').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/admin/logout', { method: 'POST' });
  location.reload();
});

async function loadState() {
  const res = await fetch('/api/state');
  const s = await res.json();
  const info = document.getElementById('stateInfo');
  let text = s.lastRun
    ? `Dernière exécution : ${new Date(s.lastRun).toLocaleString('fr-FR')}`
    : 'Aucune veille exécutée pour le moment.';
  if (s.lastEmail) {
    text += ` — Dernier email (${s.lastEmail.itemCount} actu(s)) : ${
      s.lastEmail.sent ? 'envoyé' : 'non envoyé (' + s.lastEmail.reason + ')'
    } à ${new Date(s.lastEmail.at).toLocaleString('fr-FR')}`;
  }
  info.textContent = text;
}

document.getElementById('refreshBtn').addEventListener('click', async () => {
  const btn = document.getElementById('refreshBtn');
  btn.disabled = true;
  btn.textContent = 'Veille en cours...';
  const res = await fetch('/api/refresh', { method: 'POST' });
  const data = await res.json();
  btn.disabled = false;
  btn.textContent = 'Lancer la veille maintenant';

  const resultDiv = document.getElementById('refreshResult');
  if (data.ok) {
    const lines = data.summary.map((s) =>
      s.ok
        ? `✅ ${s.sourceName} — ${s.added} nouvelle(s) sur ${s.found} trouvée(s)`
        : `⚠️ ${s.sourceName} — erreur : ${s.error}`
    );
    resultDiv.innerHTML = `<strong>${data.totalAdded} nouvelle(s) actualité(s) au total</strong><br>` + lines.join('<br>');
  } else {
    resultDiv.textContent = 'Erreur : ' + data.error;
  }
  loadState();
  loadAdminItems();
});

async function loadSources() {
  const res = await fetch('/api/sources');
  const sources = await res.json();
  const tbody = document.querySelector('#sourcesTable tbody');
  tbody.innerHTML = sources
    .map(
      (s) => `
    <tr>
      <td>${s.name}<br><span style="font-size:0.72rem;color:var(--slate)">${s.url}</span></td>
      <td>${s.type}</td>
      <td>—</td>
      <td><input type="checkbox" data-id="${s.id}" class="toggle-source" ${s.enabled !== false ? 'checked' : ''}/></td>
      <td><button class="btn danger" data-id="${s.id}" style="padding:4px 8px;font-size:0.75rem" onclick="deleteSource('${s.id}')">Supprimer</button></td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('.toggle-source').forEach((cb) => {
    cb.addEventListener('change', async (e) => {
      const source = sources.find((s) => s.id === e.target.dataset.id);
      source.enabled = e.target.checked;
      await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(source)
      });
    });
  });
}

async function deleteSource(id) {
  if (!confirm('Supprimer cette source ?')) return;
  await fetch('/api/sources/' + id, { method: 'DELETE' });
  loadSources();
}

document.getElementById('addSourceBtn').addEventListener('click', async () => {
  const id = document.getElementById('newId').value.trim();
  const name = document.getElementById('newName').value.trim();
  const url = document.getElementById('newUrl').value.trim();
  const type = document.getElementById('newType').value;
  const defaultCategories = Array.from(document.getElementById('newCategories').selectedOptions).map((o) => o.value);

  if (!id || !name || !url) {
    alert('Identifiant, nom et URL sont requis.');
    return;
  }

  await fetch('/api/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name, url, type, defaultCategories, enabled: true })
  });

  document.getElementById('newId').value = '';
  document.getElementById('newName').value = '';
  document.getElementById('newUrl').value = '';
  loadSources();
});

document.getElementById('addManualBtn').addEventListener('click', async () => {
  const title = document.getElementById('manualTitle').value.trim();
  const url = document.getElementById('manualUrl').value.trim();
  const date = document.getElementById('manualDate').value;
  const summary = document.getElementById('manualSummary').value.trim();
  const categories = Array.from(document.getElementById('manualCategories').selectedOptions).map((o) => o.value);

  if (!title) {
    alert('Le titre est requis.');
    return;
  }

  await fetch('/api/items/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, url, date: date ? new Date(date).toISOString() : null, summary, categories })
  });

  document.getElementById('manualTitle').value = '';
  document.getElementById('manualUrl').value = '';
  document.getElementById('manualSummary').value = '';
  loadAdminItems();
});

async function loadAdminItems() {
  const res = await fetch('/api/items?days=14');
  const data = await res.json();
  categoryLabels = data.categoryLabels;
  const list = document.getElementById('adminItemsList');

  list.innerHTML = data.items
    .map(
      (item) => `
    <div class="card">
      <div class="cats">${item.categories.map((c) => `<span class="tag ${c}">${categoryLabels[c] || c}</span>`).join('')}</div>
      <h3><a href="${item.url || '#'}" target="_blank" rel="noopener">${item.title}</a></h3>
      <div class="source-line">${item.sourceName} · ${fmtDate(item.date)}</div>
      <div class="admin-actions" data-id="${item.id}">
        <label><input type="checkbox" data-field="important" ${item.important ? 'checked' : ''}/> Important</label>
        <label><input type="checkbox" data-field="shareTeam" ${item.shareTeam ? 'checked' : ''}/> Partager équipe</label>
        <label><input type="checkbox" data-field="shareClient" ${item.shareClient ? 'checked' : ''}/> Partager clients</label>
      </div>
    </div>`
    )
    .join('');

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

checkAdmin();

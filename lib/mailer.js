const nodemailer = require('nodemailer');
const { CATEGORY_LABELS } = require('./categorize');

function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: SMTP_SECURE === 'true', // true pour le port 465, false pour 587/25
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function groupByCategory(items) {
  const groups = {};
  items.forEach((it) => {
    const cats = it.categories && it.categories.length ? it.categories : ['autre'];
    cats.forEach((cat) => {
      groups[cat] = groups[cat] || [];
      groups[cat].push(it);
    });
  });
  return groups;
}

function buildHtml(items, dashboardUrl) {
  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if (items.length === 0) {
    return `<div style="font-family:Segoe UI,Arial,sans-serif;color:#0f2237;max-width:600px;margin:auto">
      <h2 style="margin-bottom:4px">Veille réglementaire — ${dateLabel}</h2>
      <p style="color:#4a5b6c">Aucune nouvelle actualité détectée aujourd'hui sur les sources suivies.</p>
      <p><a href="${dashboardUrl}" style="color:#0f2237">Consulter le dashboard</a></p>
    </div>`;
  }

  const groups = groupByCategory(items);
  const colors = { comptabilite: '#1c6e5e', fiscalite: '#8a5a00', facturation_electronique: '#4b3b8f' };

  const sections = Object.entries(groups)
    .map(([cat, catItems]) => {
      const color = colors[cat] || '#0f2237';
      const rows = catItems
        .map(
          (it) => `
        <li style="margin-bottom:10px">
          <a href="${it.url || '#'}" style="color:#0f2237;font-weight:600;text-decoration:none">${it.title}</a>
          <div style="font-size:12px;color:#4a5b6c">${it.sourceName}${it.date ? ' · ' + fmtDate(it.date) : ''}</div>
        </li>`
        )
        .join('');
      return `
        <h3 style="color:${color};border-bottom:2px solid ${color};padding-bottom:4px;font-size:15px">
          ${CATEGORY_LABELS[cat] || cat} (${catItems.length})
        </h3>
        <ul style="padding-left:18px;margin-top:8px">${rows}</ul>`;
    })
    .join('');

  return `<div style="font-family:Segoe UI,Arial,sans-serif;color:#0f2237;max-width:600px;margin:auto">
    <h2 style="margin-bottom:4px">Veille réglementaire — ${dateLabel}</h2>
    <p style="color:#4a5b6c;margin-top:0">${items.length} nouvelle(s) actualité(s) détectée(s) aujourd'hui.</p>
    ${sections}
    <p style="margin-top:24px"><a href="${dashboardUrl}" style="color:#0f2237">Consulter le dashboard complet</a></p>
  </div>`;
}

function buildText(items) {
  if (items.length === 0) return "Aucune nouvelle actualité détectée aujourd'hui.";
  const groups = groupByCategory(items);
  let text = '';
  for (const [cat, catItems] of Object.entries(groups)) {
    text += `--- ${CATEGORY_LABELS[cat] || cat} ---\n`;
    catItems.forEach((it) => {
      text += `• ${it.title}${it.date ? ' (' + fmtDate(it.date) + ')' : ''}\n`;
      if (it.url) text += `  ${it.url}\n`;
    });
    text += '\n';
  }
  return text;
}

/**
 * Envoie la synthèse quotidienne. Retourne { sent, reason } — ne lève jamais
 * d'exception pour ne pas interrompre le job de veille en cas de souci mail.
 */
async function sendDailyDigest({ items, recipients, dashboardUrl }) {
  if (!recipients || recipients.length === 0) {
    return { sent: false, reason: 'Aucun destinataire configuré' };
  }

  const transport = getTransport();
  if (!transport) {
    return { sent: false, reason: 'Configuration SMTP manquante (variables SMTP_HOST/SMTP_USER/SMTP_PASS)' };
  }

  const dateLabel = new Date().toLocaleDateString('fr-FR');
  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: recipients.join(','),
      subject: `Veille réglementaire du ${dateLabel} — ${items.length} nouvelle(s) actualité(s)`,
      text: buildText(items),
      html: buildHtml(items, dashboardUrl)
    });
    return { sent: true, reason: null };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendDailyDigest, buildHtml, buildText };

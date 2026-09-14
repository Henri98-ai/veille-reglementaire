const nodemailer = require('nodemailer');
const fetch = require('node-fetch');
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

/**
 * Envoi via l'API HTTP de Brevo (port 443, jamais bloqué) plutôt que via SMTP.
 * À utiliser en priorité sur les hébergeurs qui bloquent les ports SMTP sortants
 * (ex. Render en offre gratuite depuis septembre 2025).
 */
async function sendViaBrevoApi({ recipients, subject, html, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.MAIL_FROM || process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !fromEmail) return null; // signale "non configuré" pour tomber sur le SMTP

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: 'Veille réglementaire' },
      to: recipients.map((email) => ({ email })),
      subject,
      htmlContent: html,
      textContent: text
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo API ${res.status} : ${body.slice(0, 300)}`);
  }
  return true;
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
  const colors = {
    comptabilite: '#1c6e5e',
    fiscalite: '#8a5a00',
    facturation_electronique: '#4b3b8f',
    ia: '#b0225a',
    droit_affaires: '#1f5a8a'
  };

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
 * Essaie d'abord l'API HTTP Brevo (si configurée), puis se rabat sur le SMTP classique.
 */
async function sendDailyDigest({ items, recipients, dashboardUrl }) {
  if (!recipients || recipients.length === 0) {
    return { sent: false, reason: 'Aucun destinataire configuré' };
  }

  const dateLabel = new Date().toLocaleDateString('fr-FR');
  const subject = `Veille réglementaire du ${dateLabel} — ${items.length} nouvelle(s) actualité(s)`;
  const text = buildText(items);
  const html = buildHtml(items, dashboardUrl);

  // 1) API HTTP Brevo, si configurée (fonctionne même quand les ports SMTP sont bloqués)
  try {
    const sentViaApi = await sendViaBrevoApi({ recipients, subject, html, text });
    if (sentViaApi) return { sent: true, reason: null, via: 'brevo-api' };
  } catch (err) {
    return { sent: false, reason: err.message, via: 'brevo-api' };
  }

  // 2) Repli SMTP classique
  const transport = getTransport();
  if (!transport) {
    return {
      sent: false,
      reason: 'Aucune configuration email trouvée (ni BREVO_API_KEY, ni SMTP_HOST/SMTP_USER/SMTP_PASS)'
    };
  }

  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: recipients.join(','),
      subject,
      text,
      html
    });
    return { sent: true, reason: null, via: 'smtp' };
  } catch (err) {
    return { sent: false, reason: err.message, via: 'smtp' };
  }
}

module.exports = { sendDailyDigest, buildHtml, buildText };

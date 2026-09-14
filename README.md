# Veille réglementaire — Comptabilité / Fiscalité / Facturation électronique

Outil de veille quotidienne qui agrège plusieurs sources officielles françaises,
catégorise automatiquement les actualités (Comptabilité, Fiscalité, Facturation
électronique) et permet de sélectionner des items à partager en interne ou avec
des clients.

## Fonctionnement

- Un scrape automatique tourne chaque jour ouvré à 7h15 (heure de Paris) via `node-cron`.
- Chaque source est soit un flux RSS, soit une page HTML scrapée (structure connue
  ou heuristique générique).
- Les actualités sont catégorisées par mots-clés (`config/keywords.json`, éditable).
- Le dashboard principal (`/`) est en lecture libre pour toute l'équipe.
- L'espace admin (`/admin`, protégé par un code) permet de :
  - déclencher un scrape manuel et voir le statut de chaque source,
  - ajouter/modifier/désactiver des sources,
  - ajouter une actualité manuellement,
  - cocher "Partager clients" sur les items à faire apparaître dans le digest public.
- Le digest client (`/digest`) est une page en lecture seule, à partager telle
  quelle (lien) ou copiable en texte brut pour un email.

## Sources incluses au démarrage

- BOFiP — Actualités doctrinales (scrape HTML)
- Économie.gouv.fr — Toutes actualités (RSS)
- Impots.gouv.fr — Actualités professionnels (scrape générique)
- ANC — Autorité des normes comptables (scrape générique)
- Conseil Supérieur de l'Ordre des Experts-Comptables (scrape générique)
- Portail officiel de la facturation électronique (scrape générique)
- Service-Public.fr — Actualités professionnels (scrape générique)

Les sources en "scrape générique" sont heuristiques (elles n'ont pas de flux RSS
propre) : après le premier déploiement, utilisez le bouton **"Lancer la veille
maintenant"** dans `/admin` pour voir, source par source, si des actualités sont
bien remontées. Si une source ne remonte rien ou remonte du bruit, il suffit de
retoucher son URL/type dans l'admin, ou de me redemander d'ajuster le sélecteur
de scraping correspondant dans `lib/scraper.js`.

Vous pouvez ajouter d'autres sources à tout moment depuis `/admin` (RSS de
préférence quand il existe — c'est plus fiable qu'un scrape HTML).

## Installation locale

```bash
npm install
ADMIN_CODE=votre_code node server.js
```

Puis ouvrir http://localhost:3000

## Déploiement sur Render (même pattern que vos autres outils)

1. Créer un dépôt GitHub (ex: `Henri98-ai/veille-reglementaire`) et y pousser ce code.
2. Sur Render : **New > Web Service**, connecter le dépôt GitHub.
3. Build command : `npm install`
4. Start command : `npm start`
5. Ajouter les variables d'environnement :
   - `ADMIN_CODE` = votre code d'accès admin (à changer, ne pas garder "changeme")
   - `SESSION_SECRET` = une chaîne aléatoire quelconque
6. Déployer.

⚠️ Sur le plan gratuit Render, le disque n'est pas garanti persistant entre
redéploiements (il l'est entre redémarrages simples). Les actualités déjà
collectées peuvent donc être perdues lors d'un futur déploiement de mise à jour
du code — ce n'est pas grave puisque la veille se régénère automatiquement,
mais les items marqués "Partager clients"/"Important" seraient à re-sélectionner
dans ce cas. Si cela devient gênant, on pourra migrer vers une petite base
Postgres gratuite Render en complément.

## Synthèse quotidienne par email

Chaque jour ouvré à 7h15 (heure de Paris), juste après le scrape, un email
récapitulatif est envoyé avec toutes les nouvelles actualités du jour,
groupées par catégorie (ou un court message "aucune nouveauté" si rien n'a
été trouvé, pour garder un rythme quotidien prévisible).

⚠️ **Important si vous êtes sur le plan gratuit de Render** : depuis
septembre 2025, Render bloque tout le trafic SMTP sortant (ports 25, 465, 587)
sur les services web gratuits. Un SMTP classique (Gmail, Outlook, OVH...) ne
fonctionnera donc jamais tant que le service n'est pas passé sur un plan payant.
La solution retenue ici est d'envoyer les emails via l'**API HTTP de Brevo**
(port 443, jamais bloqué), qui a un plan gratuit de 300 emails/jour largement
suffisant pour cet usage.

Configuration recommandée (variables d'environnement Render) :

- `BREVO_API_KEY` — clé API générée dans Brevo (SMTP & API > API Keys)
- `MAIL_FROM` — adresse d'expédition (n'a pas besoin d'être hébergée chez Brevo,
  une adresse Gmail ou autre convient très bien comme simple champ "expéditeur")
- `PUBLIC_URL` — l'URL Render de l'app (ex. `https://veille-reglementaire.onrender.com`),
  utilisée comme lien "Consulter le dashboard" dans l'email

Si vous préférez malgré tout du SMTP classique (par exemple sur un plan Render
payant, où les ports SMTP ne sont plus bloqués), les variables suivantes
restent supportées en repli automatique si `BREVO_API_KEY` n'est pas définie :

- `SMTP_HOST`, `SMTP_PORT` (587 par défaut), `SMTP_SECURE` (`true` si port 465)
- `SMTP_USER`, `SMTP_PASS` — identifiants du compte d'envoi
- `MAIL_FROM` — adresse d'expédition (par défaut, reprend `SMTP_USER`)

N'importe quel fournisseur SMTP fonctionne dans ce cas (Gmail avec un mot de
passe d'application, OVH, Office 365 n'accepte plus l'authentification basique
depuis 2022-2023 donc à éviter, Brevo lui-même en mode SMTP, etc.).

Les destinataires et l'activation/désactivation de l'envoi se gèrent ensuite
directement dans `/admin` (section "Synthèse quotidienne par email"), avec un
bouton "Envoyer un email de test" pour vérifier la configuration sans attendre
le lendemain matin.

## Ajuster la catégorisation

Le fichier `config/keywords.json` définit les mots-clés qui déclenchent chaque
catégorie. Vous pouvez l'enrichir librement (ex: ajouter des termes propres à
bobbee ou à vos dossiers clients) — un redéploiement suffit à prendre en compte
les changements.

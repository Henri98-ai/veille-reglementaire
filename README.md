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

## Ajuster la catégorisation

Le fichier `config/keywords.json` définit les mots-clés qui déclenchent chaque
catégorie. Vous pouvez l'enrichir librement (ex: ajouter des termes propres à
bobbee ou à vos dossiers clients) — un redéploiement suffit à prendre en compte
les changements.

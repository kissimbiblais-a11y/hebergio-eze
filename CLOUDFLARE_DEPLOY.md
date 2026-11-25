# Déployer Hébergio sur votre compte Cloudflare (0 FCFA / mois — plan Free)

## Ce qui est inclus
- **Frontend & PWA installable (WebAPK)** : servis directement depuis `dist/` via Cloudflare Workers Static Assets (`wrangler.toml`).
- **API Hébergio (`/api/*`) & Sites hébergés (`/s/:slug/`)** : exécutés par `cloudflare/worker.ts` avec vérification cryptographique des jetons Firebase Auth et stockage persistant dans **Cloudflare KV**.

## Étapes de mise en ligne sur votre Cloudflare

1. **Compiler l'application frontend + PWA :**
   ```bash
   npm install
   npm run build
   ```

2. **Connecter Wrangler à votre compte Cloudflare :**
   ```bash
   npx wrangler login
   ```

3. **Créer le stockage KV pour les sites déployés (`/s/:slug/`) :**
   ```bash
   npx wrangler kv namespace create HEBERGIO_KV
   ```
   Copiez l'`id` retourné dans `wrangler.toml` sous `[[kv_namespaces]]`.

4. **(Optionnel) Ajouter vos secrets FedaPay pour Mobile Money MTN / Moov :**
   ```bash
   npx wrangler secret put FEDAPAY_PUBLIC_KEY
   npx wrangler secret put FEDAPAY_SECRET_KEY
   ```
   Pour passer en production réelle, mettez `FEDAPAY_ENV = "live"` dans `wrangler.toml`.

5. **Déployer sur Cloudflare :**
   ```bash
   npx wrangler deploy
   ```
   Cloudflare affichera votre URL publique définitive (ex. `https://hebergio.<votre-sous-domaine>.workers.dev`) accessible à tout le monde sans Google AI Studio et installable en PWA/WebAPK.

6. **Autoriser votre domaine Cloudflare dans Firebase Authentication :**
   Dans la console Firebase (`eminent-mission-mv0ns`) -> **Authentication** -> **Settings** -> **Authorized domains**, ajoutez votre domaine `*.workers.dev` (ou votre domaine personnalisé Cloudflare) afin que la connexion Google fonctionne.

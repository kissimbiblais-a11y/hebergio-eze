interface KVBinding {
  get(key: string, type?: 'text'): Promise<string | null>;
  get<T>(key: string, type: 'json'): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

interface AssetsFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface CloudflareEnv {
  ASSETS: AssetsFetcher;
  HEBERGIO_KV?: KVBinding;
  FIREBASE_PROJECT_ID?: string;
  APP_URL?: string;
  FEDAPAY_PUBLIC_KEY?: string;
  FEDAPAY_SECRET_KEY?: string;
  FEDAPAY_ENV?: string;
  KKIAPAY_PUBLIC_KEY?: string;
  KKIAPAY_PRIVATE_KEY?: string;
  KKIAPAY_SECRET?: string;
}

interface DeployFilePayload {
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
}

interface SiteRegistryEntry {
  slug: string;
  ownerUid: string;
  name: string;
  kind: 'site' | 'webapp' | 'pwa';
  description: string;
  status: 'live' | 'paused';
  entryFile: string;
  fileCount: number;
  sizeBytes: number;
  hits: number;
  updatedAt: string;
}

interface StoredSiteBundle {
  entry: SiteRegistryEntry;
  files: Record<string, { content: string; encoding: 'utf8' | 'base64' }>;
}

interface AuthedUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

interface GoogleJwk extends JsonWebKey {
  kid?: string;
}

const REGISTRY_KEY = 'hebergio:registry';
const SITE_KEY_PREFIX = 'hebergio:site:';
const JWK_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const MAX_SITE_BYTES = 8 * 1024 * 1024;
const MAX_FILES_PER_SITE = 50;
const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/;
const RESERVED_SLUGS = new Set([
  'api',
  's',
  'assets',
  'src',
  'admin',
  'login',
  'auth',
  'manifest',
  'sw',
  'health',
  'console',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.txt',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.ico',
  '.webmanifest',
  '.xml',
  '.woff',
  '.woff2',
]);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const FEDAPAY_OPERATORS: Record<string, { mode: string; country: string }> = {
  mtn_benin: { mode: 'mtn_open', country: 'bj' },
  moov_benin: { mode: 'moov', country: 'bj' },
  mtn_ci: { mode: 'mtn_ci', country: 'ci' },
  moov_ci: { mode: 'moov_ci', country: 'ci' },
  mtn_tg: { mode: 'togocel', country: 'tg' },
  moov_tg: { mode: 'moov_tg', country: 'tg' },
};

let cachedJwks: { keys: GoogleJwk[]; expiresAt: number } | null = null;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function getExt(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  const base = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot).toLowerCase() : '';
}

function sanitizeRelativePath(rawPath: string): string | null {
  if (typeof rawPath !== 'string' || !rawPath || rawPath.includes('\0')) return null;
  const cleaned = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts: string[] = [];
  for (const seg of cleaned.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..' || seg.startsWith('.')) return null;
    parts.push(seg);
  }
  if (parts.length === 0) return null;
  const normalized = parts.join('/');
  const ext = getExt(normalized);
  if (!ALLOWED_EXTENSIONS.has(ext)) return null;
  return normalized;
}

function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug) && !RESERVED_SLUGS.has(slug);
}

function base64UrlToUint8Array(input: string): Uint8Array {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

async function getGoogleJwks(): Promise<GoogleJwk[]> {
  if (cachedJwks && cachedJwks.expiresAt > Date.now()) {
    return cachedJwks.keys;
  }
  const resp = await fetch(JWK_URL);
  if (!resp.ok) {
    throw new Error('Impossible de récupérer les clés publiques Firebase.');
  }
  const data = (await resp.json()) as { keys?: GoogleJwk[] };
  const keys = Array.isArray(data.keys) ? data.keys : [];
  cachedJwks = { keys, expiresAt: Date.now() + 5 * 60 * 1000 };
  return keys;
}

async function verifyFirebaseAuth(request: Request, env: CloudflareEnv): Promise<AuthedUser> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('UNAUTH:Jeton d’authentification requis.');
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const segments = token.split('.');
  if (segments.length !== 3) {
    throw new Error('UNAUTH:Format de jeton invalide.');
  }

  const [encHeader, encPayload, encSignature] = segments;
  const decoder = new TextDecoder();
  const header = JSON.parse(decoder.decode(base64UrlToUint8Array(encHeader))) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(decoder.decode(base64UrlToUint8Array(encPayload))) as {
    exp?: number;
    iat?: number;
    aud?: string;
    iss?: string;
    sub?: string;
    email?: string;
    email_verified?: boolean;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('UNAUTH:Algorithme ou identifiant de clé invalide.');
  }

  const projectId = (env.FIREBASE_PROJECT_ID || 'eminent-mission-mv0ns').trim();
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('UNAUTH:Session expirée. Veuillez vous reconnecter.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('UNAUTH:Jeton émis dans le futur.');
  }
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('UNAUTH:Projet Firebase non concordant.');
  }
  if (!payload.sub) {
    throw new Error('UNAUTH:Identifiant utilisateur manquant.');
  }
  if (!payload.email_verified) {
    throw new Error('FORBIDDEN:Adresse e-mail non vérifiée.');
  }

  const keys = await getGoogleJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    throw new Error('UNAUTH:Clé publique de signature introuvable.');
  }

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signatureBytes = base64UrlToUint8Array(encSignature);
  const signedData = new TextEncoder().encode(`${encHeader}.${encPayload}`);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBytes.buffer as ArrayBuffer,
    signedData.buffer as ArrayBuffer
  );

  if (!valid) {
    throw new Error('UNAUTH:Signature du jeton invalide.');
  }

  return {
    uid: payload.sub,
    email: payload.email ?? null,
    emailVerified: true,
  };
}

function getPaymentConfigStatus(env: CloudflareEnv) {
  const fedapayPublic = Boolean(env.FEDAPAY_PUBLIC_KEY?.trim());
  const fedapaySecret = Boolean(env.FEDAPAY_SECRET_KEY?.trim());
  const fedapayMissing: string[] = [];
  if (!fedapayPublic) fedapayMissing.push('FEDAPAY_PUBLIC_KEY');
  if (!fedapaySecret) fedapayMissing.push('FEDAPAY_SECRET_KEY');

  const kkiapayPublic = Boolean(env.KKIAPAY_PUBLIC_KEY?.trim());
  const kkiapayPrivate = Boolean(env.KKIAPAY_PRIVATE_KEY?.trim());
  const kkiapaySecret = Boolean(env.KKIAPAY_SECRET?.trim());
  const kkiapayMissing: string[] = [];
  if (!kkiapayPublic) kkiapayMissing.push('KKIAPAY_PUBLIC_KEY');
  if (!kkiapayPrivate) kkiapayMissing.push('KKIAPAY_PRIVATE_KEY');
  if (!kkiapaySecret) kkiapayMissing.push('KKIAPAY_SECRET');

  return {
    currency: 'XOF',
    providers: {
      fedapay: {
        configured: fedapayMissing.length === 0,
        environment: env.FEDAPAY_ENV === 'live' ? 'live' : 'sandbox',
        missingVars: fedapayMissing,
        supportedOperators: ['MTN Mobile Money', 'Moov Money'],
      },
      kkiapay: {
        configured: kkiapayMissing.length === 0,
        missingVars: kkiapayMissing,
        supportedOperators: ['MTN Mobile Money', 'Moov Money'],
      },
    },
  };
}

function getFedaPayBaseUrl(env: CloudflareEnv): string {
  return env.FEDAPAY_ENV === 'live'
    ? 'https://api.fedapay.com/v1'
    : 'https://sandbox-api.fedapay.com/v1';
}

function renderNotFoundPage(slug: string, reason: 'missing' | 'paused'): Response {
  const safeSlug = slug.replace(/[<>&"]/g, '');
  const title = reason === 'paused' ? 'Site temporairement en pause' : 'Site introuvable sur Hébergio';
  const body =
    reason === 'paused'
      ? `L’espace « ${safeSlug} » a été mis en pause par son propriétaire.`
      : `Aucun site ou application n’est actuellement publié à l’adresse /s/${safeSlug}/.`;

  return new Response(
    `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Hébergio</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; display: grid; place-items: center; min-height: 100vh; padding: 1.5rem; }
    main { max-width: 32rem; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 2rem; }
    h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
    p { color: #475569; line-height: 1.6; margin: 0 0 1.25rem; }
    a { display: inline-block; background: #0369a1; color: #fff; text-decoration: none; padding: 0.625rem 1rem; border-radius: 8px; font-weight: 600; font-size: 0.875rem; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${body}</p>
    <a href="/">Retourner sur Hébergio</a>
  </main>
</body>
</html>`,
    {
      status: reason === 'paused' ? 503 : 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}

async function readRegistry(kv?: KVBinding): Promise<Record<string, SiteRegistryEntry>> {
  if (!kv) return {};
  const data = await kv.get<Record<string, SiteRegistryEntry>>(REGISTRY_KEY, 'json');
  return data && typeof data === 'object' ? data : {};
}

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    if (pathname === '/api/health' && method === 'GET') {
      return jsonResponse({
        ok: true,
        service: 'hebergio',
        runtime: 'cloudflare-workers',
        kvBound: Boolean(env.HEBERGIO_KV),
        timestamp: new Date().toISOString(),
      });
    }

    if (pathname === '/api/public-sites' && method === 'GET') {
      const registry = await readRegistry(env.HEBERGIO_KV);
      const sites = Object.values(registry)
        .filter((entry) => entry.status === 'live')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((entry) => ({
          slug: entry.slug,
          name: entry.name,
          kind: entry.kind,
          description: entry.description,
          fileCount: entry.fileCount,
          sizeBytes: entry.sizeBytes,
          hits: entry.hits,
          livePath: `/s/${entry.slug}/`,
          updatedAt: entry.updatedAt,
        }));
      return jsonResponse({ ok: true, sites });
    }

    if (pathname === '/api/payments/config' && method === 'GET') {
      return jsonResponse({ ok: true, ...getPaymentConfigStatus(env) });
    }

    // Authenticated API routes
    if (pathname.startsWith('/api/')) {
      let user: AuthedUser;
      try {
        user = await verifyFirebaseAuth(request, env);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'UNAUTH:Authentification requise.';
        if (msg.startsWith('FORBIDDEN:')) {
          return jsonResponse({ ok: false, error: msg.slice('FORBIDDEN:'.length) }, 403);
        }
        return jsonResponse({ ok: false, error: msg.replace(/^UNAUTH:/, '') }, 401);
      }

      if (pathname === '/api/payments/fedapay/validate' && method === 'GET') {
        const status = getPaymentConfigStatus(env).providers.fedapay;
        if (!status.configured) {
          return jsonResponse(
            {
              ok: false,
              code: 'PROVIDER_NOT_CONFIGURED',
              missingVars: status.missingVars,
              environment: status.environment,
              message: `Clés FedaPay absentes du serveur (${status.missingVars.join(', ')}). Ajoutez-les dans vos secrets Cloudflare pour activer MTN et Moov Money via FedaPay.`,
            },
            503
          );
        }
        try {
          const apiResp = await fetch(`${getFedaPayBaseUrl(env)}/transactions?per_page=1`, {
            headers: {
              Authorization: `Bearer ${env.FEDAPAY_SECRET_KEY}`,
              Accept: 'application/json',
            },
          });
          if (!apiResp.ok) {
            return jsonResponse(
              {
                ok: false,
                code: 'FEDAPAY_AUTH_FAILED',
                environment: status.environment,
                message: `FedaPay (${status.environment}) a rejeté la clé API (HTTP ${apiResp.status}).`,
              },
              502
            );
          }
          return jsonResponse({
            ok: true,
            environment: status.environment,
            supportedModes: Object.values(FEDAPAY_OPERATORS).map((o) => o.mode),
            message: `Connexion FedaPay (${status.environment}) validée avec succès pour MTN et Moov Money.`,
          });
        } catch (err) {
          return jsonResponse(
            {
              ok: false,
              code: 'FEDAPAY_NETWORK_ERROR',
              message: err instanceof Error ? err.message : 'Erreur réseau vers FedaPay.',
            },
            502
          );
        }
      }

      const verifyMatch = pathname.match(/^\/api\/payments\/fedapay\/verify\/([^/]+)$/);
      if (verifyMatch && method === 'GET') {
        const txId = decodeURIComponent(verifyMatch[1]).replace(/[^0-9]/g, '');
        if (!txId) {
          return jsonResponse({ ok: false, error: 'Identifiant de transaction invalide.' }, 400);
        }
        const status = getPaymentConfigStatus(env).providers.fedapay;
        if (!status.configured) {
          return jsonResponse(
            { ok: false, code: 'PROVIDER_NOT_CONFIGURED', missingVars: status.missingVars },
            503
          );
        }
        try {
          const resp = await fetch(`${getFedaPayBaseUrl(env)}/transactions/${txId}`, {
            headers: {
              Authorization: `Bearer ${env.FEDAPAY_SECRET_KEY}`,
              Accept: 'application/json',
            },
          });
          const data = (await resp.json()) as Record<string, unknown>;
          const txObj = (data['v1/transaction'] as Record<string, unknown> | undefined) || data;
          if (!resp.ok) {
            return jsonResponse(
              { ok: false, error: 'Impossible de vérifier la transaction FedaPay.', details: data },
              502
            );
          }
          return jsonResponse({
            ok: true,
            transactionId: txId,
            status: String(txObj.status || 'unknown'),
            amount: txObj.amount,
          });
        } catch (err) {
          return jsonResponse(
            { ok: false, error: err instanceof Error ? err.message : 'Erreur réseau vers FedaPay.' },
            502
          );
        }
      }

      if (pathname === '/api/payments/checkout' && method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as {
          provider?: 'fedapay' | 'kkiapay';
          planId?: 'pro' | 'enterprise';
          operator?: string;
          phone?: string;
          directPush?: boolean;
        };
        if (body.provider !== 'fedapay' && body.provider !== 'kkiapay') {
          return jsonResponse({ ok: false, error: 'Fournisseur Mobile Money invalide.' }, 400);
        }
        if (body.planId !== 'pro' && body.planId !== 'enterprise') {
          return jsonResponse({ ok: false, error: 'Formule payante invalide.' }, 400);
        }

        const amountFcfa = body.planId === 'pro' ? 5000 : 15000;
        const status = getPaymentConfigStatus(env);
        const providerStatus = status.providers[body.provider];
        if (!providerStatus.configured) {
          return jsonResponse(
            {
              ok: false,
              code: 'PROVIDER_NOT_CONFIGURED',
              provider: body.provider,
              missingVars: providerStatus.missingVars,
              message: `Le paiement réel via ${body.provider === 'fedapay' ? 'FedaPay' : 'KKiaPay'} nécessite la configuration de vos secrets Cloudflare (${providerStatus.missingVars.join(', ')}).`,
            },
            503
          );
        }

        if (body.provider === 'fedapay') {
          const baseUrl = getFedaPayBaseUrl(env);
          const opMapping = FEDAPAY_OPERATORS[body.operator || 'mtn_benin'] || FEDAPAY_OPERATORS.mtn_benin;
          const callbackUrl = env.APP_URL ? `${env.APP_URL}/#console` : `${url.origin}/#console`;

          try {
            const txResp = await fetch(`${baseUrl}/transactions`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${env.FEDAPAY_SECRET_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                description: `Abonnement Hébergio ${body.planId.toUpperCase()} (${opMapping.mode})`,
                amount: amountFcfa,
                currency: { iso: 'XOF' },
                callback_url: callbackUrl,
                customer: {
                  email: user.email || undefined,
                  phone_number: body.phone ? { number: body.phone, country: opMapping.country } : undefined,
                },
              }),
            });
            const txData = (await txResp.json()) as Record<string, unknown>;
            const txObj = (txData['v1/transaction'] as Record<string, unknown> | undefined) || txData;
            const txId = txObj?.id ? String(txObj.id) : null;

            if (!txResp.ok || !txId) {
              return jsonResponse(
                { ok: false, error: 'FedaPay a refusé l’initialisation de la transaction.', details: txData },
                502
              );
            }

            const tokenResp = await fetch(`${baseUrl}/transactions/${txId}/token`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${env.FEDAPAY_SECRET_KEY}`,
                'Content-Type': 'application/json',
              },
            });
            const tokenData = (await tokenResp.json()) as Record<string, unknown>;
            const paymentToken = tokenData?.token ? String(tokenData.token) : null;
            const checkoutUrl = tokenData?.url ? String(tokenData.url) : null;

            if (!tokenResp.ok || !paymentToken) {
              return jsonResponse(
                { ok: false, error: 'Transaction créée mais génération du jeton FedaPay échouée.' },
                502
              );
            }

            if (body.directPush && body.phone) {
              const pushResp = await fetch(`${baseUrl}/transactions/${txId}/${opMapping.mode}`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${env.FEDAPAY_SECRET_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  token: paymentToken,
                  phone_number: { number: body.phone, country: opMapping.country },
                }),
              });
              if (!pushResp.ok) {
                const pushErr = (await pushResp.json()) as Record<string, unknown>;
                return jsonResponse(
                  {
                    ok: false,
                    error: `Échec de l’envoi Mobile Money (${opMapping.mode}).`,
                    checkoutUrl,
                    transactionId: txId,
                    details: pushErr,
                  },
                  502
                );
              }
            }

            return jsonResponse({
              ok: true,
              provider: 'fedapay',
              transactionId: txId,
              checkoutUrl,
              mode: opMapping.mode,
              directPush: Boolean(body.directPush && body.phone),
            });
          } catch (err) {
            return jsonResponse(
              { ok: false, error: err instanceof Error ? err.message : 'Erreur réseau vers FedaPay.' },
              502
            );
          }
        }

        return jsonResponse({
          ok: true,
          provider: 'kkiapay',
          publicKey: env.KKIAPAY_PUBLIC_KEY,
          amountFcfa,
          planId: body.planId,
        });
      }

      // Site hosting routes (require KV binding)
      if (!env.HEBERGIO_KV) {
        return jsonResponse(
          {
            ok: false,
            code: 'KV_NOT_CONFIGURED',
            error: 'Stockage Cloudflare KV (HEBERGIO_KV) non lié dans wrangler.toml.',
          },
          503
        );
      }

      const filesMatch = pathname.match(/^\/api\/sites\/([^/]+)\/files$/);
      if (filesMatch && method === 'GET') {
        const slug = decodeURIComponent(filesMatch[1]).toLowerCase();
        if (!isValidSlug(slug)) {
          return jsonResponse({ ok: false, error: 'Identifiant de site invalide.' }, 400);
        }
        const bundle = await env.HEBERGIO_KV.get<StoredSiteBundle>(`${SITE_KEY_PREFIX}${slug}`, 'json');
        if (!bundle) {
          return jsonResponse({ ok: false, error: 'Aucun déploiement serveur trouvé pour ce slug.' }, 404);
        }
        if (bundle.entry.ownerUid !== user.uid) {
          return jsonResponse({ ok: false, error: 'Accès refusé à ce projet.' }, 403);
        }
        const files: DeployFilePayload[] = Object.entries(bundle.files).map(([filePath, f]) => ({
          path: filePath,
          content: f.content,
          encoding: f.encoding,
        }));
        return jsonResponse({ ok: true, files, entry: bundle.entry });
      }

      const deployMatch = pathname.match(/^\/api\/sites\/([^/]+)\/deploy$/);
      if (deployMatch && method === 'POST') {
        const slug = decodeURIComponent(deployMatch[1]).toLowerCase();
        if (!isValidSlug(slug)) {
          return jsonResponse(
            {
              ok: false,
              error: 'Slug invalide (3–48 caractères alphanumériques et tirets uniquement, hors mots réservés).',
            },
            400
          );
        }

        const registry = await readRegistry(env.HEBERGIO_KV);
        const existingEntry = registry[slug];
        if (existingEntry && existingEntry.ownerUid !== user.uid) {
          return jsonResponse({ ok: false, error: 'Ce slug est déjà réservé par un autre compte.' }, 403);
        }

        const body = (await request.json().catch(() => ({}))) as {
          name?: string;
          kind?: 'site' | 'webapp' | 'pwa';
          description?: string;
          entryFile?: string;
          files?: DeployFilePayload[];
        };

        if (!Array.isArray(body.files) || body.files.length === 0) {
          return jsonResponse({ ok: false, error: 'Ajoutez au moins un fichier avant de déployer.' }, 400);
        }
        if (body.files.length > MAX_FILES_PER_SITE) {
          return jsonResponse({ ok: false, error: `Maximum ${MAX_FILES_PER_SITE} fichiers par site.` }, 400);
        }

        const normalizedFiles: Record<string, { content: string; encoding: 'utf8' | 'base64' }> = {};
        let totalBytes = 0;

        for (const item of body.files) {
          const cleanPath = sanitizeRelativePath(item.path);
          if (!cleanPath) {
            return jsonResponse({ ok: false, error: `Chemin ou type de fichier non autorisé : ${item.path}` }, 400);
          }
          const enc = item.encoding === 'base64' ? 'base64' : 'utf8';
          const rawContent = String(item.content || '');
          const size =
            enc === 'base64'
              ? Math.floor((rawContent.length * 3) / 4)
              : new TextEncoder().encode(rawContent).byteLength;
          totalBytes += size;
          if (totalBytes > MAX_SITE_BYTES) {
            return jsonResponse({ ok: false, error: 'La taille totale dépasse la limite de 8 Mo.' }, 400);
          }
          normalizedFiles[cleanPath] = { content: rawContent, encoding: enc };
        }

        const entryFile = sanitizeRelativePath(body.entryFile || 'index.html') || 'index.html';
        if (!normalizedFiles[entryFile]) {
          return jsonResponse({ ok: false, error: `Le fichier d’entrée ${entryFile} est requis.` }, 400);
        }

        const nextEntry: SiteRegistryEntry = {
          slug,
          ownerUid: user.uid,
          name: String(body.name || slug).slice(0, 80),
          kind: body.kind === 'webapp' || body.kind === 'pwa' ? body.kind : 'site',
          description: String(body.description || '').slice(0, 240),
          status: 'live',
          entryFile,
          fileCount: Object.keys(normalizedFiles).length,
          sizeBytes: totalBytes,
          hits: existingEntry?.hits || 0,
          updatedAt: new Date().toISOString(),
        };

        await env.HEBERGIO_KV.put(
          `${SITE_KEY_PREFIX}${slug}`,
          JSON.stringify({ entry: nextEntry, files: normalizedFiles } satisfies StoredSiteBundle)
        );
        registry[slug] = nextEntry;
        await env.HEBERGIO_KV.put(REGISTRY_KEY, JSON.stringify(registry));

        return jsonResponse({
          ok: true,
          livePath: `/s/${slug}/`,
          fileCount: nextEntry.fileCount,
          sizeBytes: nextEntry.sizeBytes,
          updatedAt: nextEntry.updatedAt,
        });
      }

      const statusMatch = pathname.match(/^\/api\/sites\/([^/]+)\/status$/);
      if (statusMatch && method === 'PATCH') {
        const slug = decodeURIComponent(statusMatch[1]).toLowerCase();
        const registry = await readRegistry(env.HEBERGIO_KV);
        const entry = registry[slug];
        if (!entry) {
          return jsonResponse({ ok: false, error: 'Site introuvable sur le serveur.' }, 404);
        }
        if (entry.ownerUid !== user.uid) {
          return jsonResponse({ ok: false, error: 'Action non autorisée.' }, 403);
        }
        const body = (await request.json().catch(() => ({}))) as { status?: string };
        if (body.status !== 'live' && body.status !== 'paused') {
          return jsonResponse({ ok: false, error: 'Statut invalide.' }, 400);
        }
        entry.status = body.status;
        entry.updatedAt = new Date().toISOString();
        registry[slug] = entry;
        await env.HEBERGIO_KV.put(REGISTRY_KEY, JSON.stringify(registry));

        const bundle = await env.HEBERGIO_KV.get<StoredSiteBundle>(`${SITE_KEY_PREFIX}${slug}`, 'json');
        if (bundle) {
          bundle.entry = entry;
          await env.HEBERGIO_KV.put(`${SITE_KEY_PREFIX}${slug}`, JSON.stringify(bundle));
        }
        return jsonResponse({ ok: true, status: entry.status });
      }

      const deleteMatch = pathname.match(/^\/api\/sites\/([^/]+)$/);
      if (deleteMatch && method === 'DELETE') {
        const slug = decodeURIComponent(deleteMatch[1]).toLowerCase();
        const registry = await readRegistry(env.HEBERGIO_KV);
        const entry = registry[slug];
        if (!entry) {
          return jsonResponse({ ok: true, deleted: false });
        }
        if (entry.ownerUid !== user.uid) {
          return jsonResponse({ ok: false, error: 'Action non autorisée.' }, 403);
        }
        delete registry[slug];
        await env.HEBERGIO_KV.put(REGISTRY_KEY, JSON.stringify(registry));
        await env.HEBERGIO_KV.delete(`${SITE_KEY_PREFIX}${slug}`);
        return jsonResponse({ ok: true, deleted: true });
      }

      return jsonResponse({ ok: false, error: 'Route API introuvable.' }, 404);
    }

    // Hosted static sites under /s/:slug/*
    const siteMatch = pathname.match(/^\/s\/([^/]+)(\/.*)?$/);
    if (siteMatch) {
      const slug = decodeURIComponent(siteMatch[1]).toLowerCase();
      const subWithSlash = siteMatch[2];
      if (!subWithSlash) {
        return Response.redirect(`${url.origin}/s/${encodeURIComponent(slug)}/`, 302);
      }
      if (!isValidSlug(slug) || !env.HEBERGIO_KV) {
        return renderNotFoundPage(slug, 'missing');
      }
      const bundle = await env.HEBERGIO_KV.get<StoredSiteBundle>(`${SITE_KEY_PREFIX}${slug}`, 'json');
      if (!bundle) {
        return renderNotFoundPage(slug, 'missing');
      }
      if (bundle.entry.status !== 'live') {
        return renderNotFoundPage(slug, 'paused');
      }

      const cleanSub = subWithSlash.replace(/^\/+/, '');
      const requestedRel = cleanSub || bundle.entry.entryFile || 'index.html';
      const sanitized = sanitizeRelativePath(requestedRel);
      let fileKey = sanitized && bundle.files[sanitized] ? sanitized : null;

      if (!fileKey && (bundle.entry.kind === 'webapp' || bundle.entry.kind === 'pwa') && !getExt(requestedRel)) {
        const fallback = bundle.entry.entryFile || 'index.html';
        if (bundle.files[fallback]) fileKey = fallback;
      }

      if (!fileKey) {
        return renderNotFoundPage(slug, 'missing');
      }

      const fileObj = bundle.files[fileKey];
      const ext = getExt(fileKey);
      const headers = new Headers({
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });

      if (ext === '.html' || ext === '.htm') {
        headers.set(
          'Content-Security-Policy',
          'sandbox allow-scripts allow-forms allow-popups allow-modals'
        );
        bundle.entry.hits = (bundle.entry.hits || 0) + 1;
        await env.HEBERGIO_KV.put(`${SITE_KEY_PREFIX}${slug}`, JSON.stringify(bundle));
        const registry = await readRegistry(env.HEBERGIO_KV);
        if (registry[slug]) {
          registry[slug].hits = bundle.entry.hits;
          await env.HEBERGIO_KV.put(REGISTRY_KEY, JSON.stringify(registry));
        }
      }

      if (fileObj.encoding === 'base64') {
        const bytes = base64ToUint8Array(fileObj.content);
        return new Response(bytes.buffer as ArrayBuffer, { status: 200, headers });
      }
      return new Response(fileObj.content, { status: 200, headers });
    }

    return env.ASSETS.fetch(request);
  },
};

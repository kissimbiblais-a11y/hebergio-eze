import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  ExternalLink,
  Globe,
  Lock,
  Moon,
  Server,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { PaymentConfigStatus, PublicSiteSummary } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface LandingViewProps {
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  publicSites: PublicSiteSummary[];
  sitesLoading: boolean;
  paymentConfig: PaymentConfigStatus | null;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onOpenConsole: () => void;
}

const SIMULATOR_OPTIONS = [
  {
    id: 'diy_free',
    title: 'Hébergement autonome',
    price: '0 FCFA / mois',
    detail: 'Jusqu’à 8 Mo par projet, éditeur en ligne, déploiement immédiat sous /s/slug/ et export libre.',
  },
  {
    id: 'setup_domain',
    title: 'Pack Mise en ligne & Domaine',
    price: '10 000 FCFA (unique)',
    detail: 'Accompagnement complet : configuration de votre nom de domaine, HTTPS et mise en ligne initiale.',
  },
  {
    id: 'pwa_seo',
    title: 'Pack PWA Installable & SEO',
    price: '15 000 FCFA (unique)',
    detail: 'Transformation de votre site en application installable Android/iOS et optimisation pour Google.',
  },
  {
    id: 'pro_plan',
    title: 'Formule Pro mensuelle',
    price: '5 000 FCFA / mois',
    detail: 'Capacité multi-projets étendue et support prioritaire avec facturation FCFA suivie.',
  },
] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export const LandingView: React.FC<LandingViewProps> = ({
  user,
  authLoading,
  authError,
  publicSites,
  sitesLoading,
  paymentConfig,
  darkMode,
  onToggleDarkMode,
  onSignIn,
  onSignOut,
  onOpenConsole,
}) => {
  const [heroImgError, setHeroImgError] = useState(false);
  const [infraImgError, setInfraImgError] = useState(false);
  const [selectedSimId, setSelectedSimId] = useState<string>('diy_free');

  // Real live availability probe state
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult, setProbeResult] = useState<{
    ok: boolean;
    latencyMs: number;
    checkedAt: string;
  } | null>(null);

  const fedapayReady = paymentConfig?.providers.fedapay.configured ?? false;
  const kkiapayReady = paymentConfig?.providers.kkiapay.configured ?? false;
  const activeSim =
    SIMULATOR_OPTIONS.find((item) => item.id === selectedSimId) || SIMULATOR_OPTIONS[0];

  async function runLiveHealthCheck() {
    setProbeLoading(true);
    const start = performance.now();
    try {
      const resp = await fetch('/api/health', { cache: 'no-store' });
      const latencyMs = Math.max(1, Math.round(performance.now() - start));
      setProbeResult({
        ok: resp.ok,
        latencyMs,
        checkedAt: new Date().toLocaleTimeString('fr-FR'),
      });
    } catch {
      const latencyMs = Math.max(1, Math.round(performance.now() - start));
      setProbeResult({
        ok: false,
        latencyMs,
        checkedAt: new Date().toLocaleTimeString('fr-FR'),
      });
    } finally {
      setProbeLoading(false);
    }
  }

  return (
    <div id="top" className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a href="#main-content" className="skip-link">
        Aller au contenu principal
      </a>

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
          <a
            href="#top"
            className="text-xl font-bold tracking-normal text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700 dark:text-white"
          >
            Hébergio
          </a>

          <nav
            aria-label="Navigation principale"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            <a
              href="#fonctionnalites"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 dark:hover:text-white"
            >
              Fonctionnalités
            </a>
            <a
              href="#sites-en-direct"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 dark:hover:text-white"
            >
              Sites en direct
            </a>
            <a
              href="#tarifs"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 dark:hover:text-white"
            >
              Tarifs FCFA
            </a>
            <a
              href="#transparence"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 dark:hover:text-white"
            >
              État réel
            </a>
          </nav>

          <div className="shrink-0">
            {user ? (
              <button
                type="button"
                onClick={onOpenConsole}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 whitespace-nowrap shrink-0"
              >
                <span>Ouvrir la console</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onSignIn()}
                disabled={authLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-800 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 whitespace-nowrap shrink-0"
              >
                <span>{authLoading ? 'Connexion...' : 'Se connecter'}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="outline-none">
        {authError && (
          <div className="mx-auto mt-4 max-w-6xl px-6">
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/60 dark:text-red-200"
            >
              {authError}
            </div>
          </div>
        )}

        {/* Hero Section */}
        <section className="mx-auto max-w-6xl px-6 pt-12 pb-10 lg:pt-16 lg:pb-14">
          <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
            <div className="flex flex-col justify-between lg:col-span-6">
              <div>
                <p className="text-sm font-semibold text-sky-700 dark:text-sky-400">
                  Plateforme Web &amp; PWA d’hébergement · Plan gratuit actif
                </p>
                <h1
                  style={{ textWrap: 'balance' }}
                  className="mt-5 text-[clamp(2.15rem,3.8vw,3.35rem)] font-bold leading-[1.24] tracking-normal text-slate-900 dark:text-white"
                >
                  Publiez vos sites et applications web en direct, sans frais obligatoires.
                </h1>
                <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
                  Hébergio vous fournit un espace authentifié pour créer vos projets, importer ou éditer vos fichiers HTML, CSS et JavaScript, et les rendre accessibles instantanément sur une adresse publique dédiée.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                {user ? (
                  <>
                    <button
                      type="button"
                      onClick={onOpenConsole}
                      className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 whitespace-nowrap shrink-0"
                    >
                      <span>Accéder à mes projets</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onSignOut()}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <span>Déconnexion ({user.email})</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onSignIn()}
                    disabled={authLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-800 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 whitespace-nowrap shrink-0"
                  >
                    <span>{authLoading ? 'Connexion en cours...' : 'Créer ou ouvrir mon espace'}</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}

                <PWAInstallButton />

                <button
                  type="button"
                  onClick={onToggleDarkMode}
                  aria-label={darkMode ? 'Activer le thème clair' : 'Activer le thème sombre'}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {darkMode ? (
                    <>
                      <Sun className="h-4 w-4" aria-hidden="true" />
                      <span>Thème clair</span>
                    </>
                  ) : (
                    <>
                      <Moon className="h-4 w-4" aria-hidden="true" />
                      <span>Thème sombre</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[280px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
                {!heroImgError ? (
                  <img
                    src="/src/assets/images/hero_cloud_studio_1795619943631.jpg"
                    alt="Développeuse gérant un déploiement web sur Hébergio depuis un studio lumineux"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgError(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full min-h-[280px] flex-col items-center justify-center p-8 text-center">
                    <Server className="h-10 w-10 text-sky-700 dark:text-sky-400" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                      Console de déploiement web et PWA Hébergio
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4-column Concrete Strip */}
          <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800 dark:bg-slate-800">
            <div className="bg-white p-6 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Offre de départ</p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                0 FCFA / mois
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Aucune carte bancaire exigée
              </p>
            </div>
            <div className="bg-white p-6 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Portabilité garantie</p>
              <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                Export en 1 clic
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Récupérez votre code source à tout moment
              </p>
            </div>
            <div className="bg-white p-6 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Publication serveur</p>
              <p className="mt-2 text-lg font-bold font-mono text-slate-900 dark:text-white">
                /s/votre-slug/
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Accessible en direct et isolée par CSP
              </p>
            </div>
            <div className="bg-white p-6 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Sécurité &amp; Compte</p>
              <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                Google Auth + RLS
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Aucune session fictive ni compte démo
              </p>
            </div>
          </div>
        </section>

        {/* Capabilities Section */}
        <section
          id="fonctionnalites"
          className="border-t border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900/50"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <h2 className="text-2xl font-bold leading-snug tracking-normal text-slate-900 sm:text-3xl dark:text-white">
                Un hébergement concret, conçu pour publier sans friction
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
                Chaque action depuis votre espace se traduit par une écriture réelle en base de données et un déploiement effectif sur le serveur HTTP.
              </p>

              <div className="mt-10 space-y-8">
                <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
                  <h3 className="text-lg font-semibold leading-snug text-slate-900 dark:text-white">
                    01. Éditeur multi-fichiers, import et export sans verrouillage
                  </h3>
                  <p className="mt-2.5 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    Démarrez depuis un modèle propre ou importez directement vos fichiers HTML, CSS, JS, JSON et images. Vous pouvez exporter l’ensemble de vos fichiers à tout moment en un clic.
                  </p>
                </div>

                <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
                  <h3 className="text-lg font-semibold leading-snug text-slate-900 dark:text-white">
                    02. Isolation des sites hébergés et protection des sessions
                  </h3>
                  <p className="mt-2.5 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    Chaque page HTML servie sous <span className="font-mono">/s/:slug/</span> reçoit une politique de bac à sable empêchant tout script hébergé d’accéder aux jetons d’authentification de votre console Hébergio.
                  </p>
                </div>

                <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
                  <h3 className="text-lg font-semibold leading-snug text-slate-900 dark:text-white">
                    03. Accompagnement clé en main pour PME &amp; créateurs
                  </h3>
                  <p className="mt-2.5 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    Besoin d’un nom de domaine personnalisé ou d’une transformation en PWA optimisée pour Google ? Commandez un pack clé en main avec référence suivie en FCFA directement depuis votre espace.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                {!infraImgError ? (
                  <img
                    src="/src/assets/images/hosting_edge_infrastructure_1795619943888.jpg"
                    alt="Architecture modulaire d’hébergement de sites et applications web Hébergio"
                    referrerPolicy="no-referrer"
                    onError={() => setInfraImgError(true)}
                    className="h-auto w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/3] flex-col items-center justify-center p-8 text-center">
                    <Globe className="h-10 w-10 text-sky-700 dark:text-sky-400" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                      Nœuds de diffusion web Hébergio
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Live Public Sites Section */}
        <section id="sites-en-direct" className="border-t border-slate-200 py-16 dark:border-slate-800">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold leading-snug tracking-normal text-slate-900 dark:text-white">
                  Sites et applications actuellement en ligne
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  Liste en temps réel issue du registre serveur. Aucun exemple fictif n’est injecté.
                </p>
              </div>
              <span className="text-sm font-medium tabular-nums text-slate-600 dark:text-slate-300">
                {sitesLoading
                  ? 'Chargement...'
                  : `${publicSites.length} site${publicSites.length > 1 ? 's' : ''} actif${publicSites.length > 1 ? 's' : ''}`}
              </span>
            </div>

            {sitesLoading ? (
              <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                  />
                ))}
              </div>
            ) : publicSites.length === 0 ? (
              <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
                <p className="text-base font-medium text-slate-900 dark:text-white">
                  Aucun site n’est encore publié sur ce serveur.
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Connectez-vous avec votre compte Google pour créer et mettre en ligne votre premier site web ou application PWA.
                </p>
              </div>
            ) : (
              <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {publicSites.map((site) => (
                  <article
                    key={site.slug}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="truncate text-base font-semibold text-slate-900 dark:text-white">
                          {site.name}
                        </h3>
                        <span className="text-xs font-medium text-emerald-700 whitespace-nowrap dark:text-emerald-400">
                          En ligne
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                        {site.kind === 'pwa' ? 'PWA' : site.kind === 'webapp' ? 'App Web' : 'Site Web'} ·{' '}
                        {site.fileCount} fichier{site.fileCount > 1 ? 's' : ''} · {formatBytes(site.sizeBytes)} ·{' '}
                        {site.hits} visite{site.hits > 1 ? 's' : ''}
                      </p>
                      {site.description && (
                        <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                          {site.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                      <span className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                        {site.livePath}
                      </span>
                      <a
                        href={site.livePath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 hover:underline whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 dark:text-sky-400"
                      >
                        <span>Visiter</span>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Pricing FCFA + Interactive Cost Simulator */}
        <section
          id="tarifs"
          className="border-t border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900/50"
        >
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-2xl font-bold leading-snug tracking-normal text-slate-900 dark:text-white">
              Tarifs &amp; Services Clé en Main en FCFA (XOF)
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Commencez gratuitement en autonomie, ou commandez un pack d’accompagnement clé en main et des capacités Pro/Entreprise avec suivi transparent.
            </p>

            {/* Interactive Budget Simulator */}
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Estimez votre coût exact selon votre besoin :
                </p>
                <div
                  role="group"
                  aria-label="Choisir un besoin"
                  className="flex flex-wrap gap-1.5 rounded-lg bg-slate-200/70 p-1 dark:bg-slate-800"
                >
                  {SIMULATOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedSimId(opt.id)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                        selectedSimId === opt.id
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                      }`}
                    >
                      {opt.title}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                <div>
                  <p className="text-lg font-bold tabular-nums text-sky-700 dark:text-sky-400">
                    {activeSim.price}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{activeSim.detail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => (user ? onOpenConsole() : void onSignIn())}
                  className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 whitespace-nowrap"
                >
                  {user ? 'Ouvrir dans la console' : 'Démarrer maintenant'}
                </button>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="flex flex-col justify-between rounded-xl border border-sky-700/40 bg-slate-50 p-6 dark:border-sky-500/40 dark:bg-slate-900">
                <div>
                  <p className="text-sm font-semibold text-sky-700 dark:text-sky-400">
                    Pour démarrer gratuitement
                  </p>
                  <h3 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Gratuit</h3>
                  <p className="mt-4 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                    0 FCFA <span className="text-sm font-normal text-slate-500">/ mois</span>
                  </p>
                  <ul className="mt-6 space-y-3.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    <li>Jusqu’à 8 Mo et 50 fichiers par projet</li>
                    <li>URL publique <span className="font-mono">/s/votre-slug/</span> immédiate</li>
                    <li>Export complet du code source à tout moment</li>
                    <li>Aucun frais ni carte requis</li>
                  </ul>
                </div>
                <div className="mt-7">
                  <button
                    type="button"
                    onClick={() => (user ? onOpenConsole() : void onSignIn())}
                    className="w-full rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                  >
                    {user ? 'Utiliser dans ma console' : 'Commencer gratuitement'}
                  </button>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                    Pour développeurs indépendants
                  </p>
                  <h3 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Pro</h3>
                  <p className="mt-4 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                    5 000 FCFA <span className="text-sm font-normal text-slate-500">/ mois</span>
                  </p>
                  <ul className="mt-6 space-y-3.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    <li>Capacité étendue pour projets multi-apps</li>
                    <li>Commande suivie avec référence ou Mobile Money (MTN / Moov)</li>
                    <li>Statut passerelle auto : {fedapayReady || kkiapayReady ? 'Prête' : 'Clés marchandes requises'}</li>
                  </ul>
                </div>
                <div className="mt-7">
                  <button
                    type="button"
                    onClick={() => (user ? onOpenConsole() : void onSignIn())}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                  >
                    Commander depuis la console
                  </button>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                    Pour agences &amp; PME
                  </p>
                  <h3 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Entreprise &amp; Packs</h3>
                  <p className="mt-4 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                    10 000 – 15 000 FCFA
                  </p>
                  <ul className="mt-6 space-y-3.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    <li>Pack Mise en ligne &amp; Domaine : 10 000 FCFA</li>
                    <li>Pack PWA Installable &amp; SEO : 15 000 FCFA</li>
                    <li>Formule Entreprise mensuelle : 15 000 FCFA / mois</li>
                  </ul>
                </div>
                <div className="mt-7">
                  <button
                    type="button"
                    onClick={() => (user ? onOpenConsole() : void onSignIn())}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                  >
                    Demander un pack clé en main
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Honest Transparency + Live Probe Section */}
        <section id="transparence" className="border-t border-slate-200 py-14 dark:border-slate-800">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Transparence technique &amp; vérification en direct
              </h2>
              <button
                type="button"
                onClick={() => void runLiveHealthCheck()}
                disabled={probeLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <Activity className="h-4 w-4 text-sky-700 dark:text-sky-400" aria-hidden="true" />
                <span>{probeLoading ? 'Mesure en cours...' : 'Tester le serveur en direct'}</span>
              </button>
            </div>

            {probeResult && (
              <div
                role="status"
                aria-live="polite"
                className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <span className={probeResult.ok ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'font-semibold text-red-700 dark:text-red-400'}>
                  {probeResult.ok ? 'Serveur HTTP opérationnel (200 OK)' : 'Serveur indisponible'}
                </span>{' '}
                · Temps de réponse mesuré : <span className="font-mono tabular-nums">{probeResult.latencyMs} ms</span> · Vérifié à {probeResult.checkedAt}
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  <h3 className="font-semibold">Garanties actives pour chaque client</h3>
                </div>
                <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  <li>Authentification Google réelle via Firebase Auth et déconnexion complète.</li>
                  <li>Stockage persistant Firestore protégé par règles de sécurité strictes par propriétaire.</li>
                  <li>Hébergement réel sous <span className="font-mono">/s/:slug/</span> isolé par politique sandbox CSP.</li>
                  <li>Portabilité totale : exportez les fichiers de vos projets à tout moment.</li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <Lock className="h-5 w-5" aria-hidden="true" />
                  <h3 className="font-semibold">Passerelles Mobile Money &amp; Commandes</h3>
                </div>
                <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  <li>
                    FedaPay (MTN/Moov FCFA) :{' '}
                    {fedapayReady
                      ? 'Clés détectées sur le serveur.'
                      : `Manquant : ${paymentConfig?.providers.fedapay.missingVars.join(', ') || 'FEDAPAY_PUBLIC_KEY, FEDAPAY_SECRET_KEY'}.`}
                  </li>
                  <li>
                    KKiaPay (MTN/Moov FCFA) :{' '}
                    {kkiapayReady
                      ? 'Clés détectées sur le serveur.'
                      : `Manquant : ${paymentConfig?.providers.kkiapay.missingVars.join(', ') || 'KKIAPAY_PUBLIC_KEY, KKIAPAY_PRIVATE_KEY, KKIAPAY_SECRET'}.`}
                  </li>
                  <li>En attendant l’encaissement automatique, les commandes génèrent une référence vérifiée côté console sans simuler de faux paiement.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-8 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 text-sm text-slate-600 dark:text-slate-400">
          <p className="font-semibold text-slate-900 dark:text-white">Hébergio</p>
          <div className="flex flex-wrap items-center gap-6">
            <a href="#fonctionnalites" className="hover:underline">Fonctionnalités</a>
            <a href="#sites-en-direct" className="hover:underline">Sites en direct</a>
            <a href="#tarifs" className="hover:underline">Tarifs FCFA</a>
            <a href="#transparence" className="hover:underline">État réel</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

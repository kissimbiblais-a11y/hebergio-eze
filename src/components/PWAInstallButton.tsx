import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        <Download className="h-4 w-4 text-sky-700 dark:text-sky-400" aria-hidden="true" />
        <span>{compact ? 'Installer PWA' : 'Installer l’application'}</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        <Smartphone className="h-4 w-4 text-sky-700 dark:text-sky-400" aria-hidden="true" />
        <span>{isIOS ? 'Installer sur iOS' : 'Application PWA'}</span>
      </button>

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <h2 id="pwa-guide-title" className="text-lg font-semibold text-slate-900 dark:text-white">
                Installer Hébergio sur votre appareil
              </h2>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Fermer la fenêtre d’installation"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {isIOS ? (
              <ol className="mt-4 space-y-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                <li>1. Appuyez sur le bouton Partager dans Safari.</li>
                <li>2. Faites défiler vers le bas puis sélectionnez Sur l’écran d’accueil.</li>
                <li>3. Confirmez en appuyant sur Ajouter.</li>
              </ol>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Ouvrez le menu de votre navigateur (icône d’installation dans la barre d’adresse ou menu ⋮) puis sélectionnez Installer Hébergio.
              </p>
            )}
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

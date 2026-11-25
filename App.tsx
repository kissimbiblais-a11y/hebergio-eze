import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  loginWithGoogle,
  logoutUser,
  testFirestoreConnection,
} from './firebase';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineIndicator } from './components/OfflineIndicator';
import { LandingView } from './components/LandingView';
import { DashboardView } from './components/DashboardView';
import type { PaymentConfigStatus, PublicSiteSummary, UserProfile } from './types';

function AppShell() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'landing' | 'console'>(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#console') {
      return 'console';
    }
    return 'landing';
  });

  const [publicSites, setPublicSites] = useState<PublicSiteSummary[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfigStatus | null>(null);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('hebergio-theme') === 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      window.localStorage.setItem('hebergio-theme', 'dark');
    } else {
      root.classList.remove('dark');
      window.localStorage.setItem('hebergio-theme', 'light');
    }
  }, [darkMode]);

  const openLanding = useCallback(() => {
    setViewMode('landing');
    if (typeof window !== 'undefined' && window.location.hash === '#console') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const openConsole = useCallback(() => {
    setViewMode('console');
    if (typeof window !== 'undefined' && window.location.hash !== '#console') {
      window.history.replaceState(null, '', '#console');
    }
  }, []);

  const refreshPublicSites = useCallback(async () => {
    try {
      const resp = await fetch('/api/public-sites');
      if (resp.ok) {
        const data = (await resp.json()) as { sites?: PublicSiteSummary[] };
        setPublicSites(Array.isArray(data.sites) ? data.sites : []);
      }
    } catch {
      // Offline cache or transient network error
    } finally {
      setSitesLoading(false);
    }
  }, []);

  useEffect(() => {
    void testFirestoreConnection();
    void refreshPublicSites();
    fetch('/api/payments/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PaymentConfigStatus | null) => {
        if (data) setPaymentConfig(data);
      })
      .catch(() => {});
  }, [refreshPublicSites]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setAuthReady(true);
        openLanding();
        return;
      }

      const userPath = `users/${nextUser.uid}`;
      try {
        const userRef = doc(db, 'users', nextUser.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        } else {
          const newProfile: UserProfile = {
            uid: nextUser.uid,
            displayName: (nextUser.displayName || nextUser.email?.split('@')[0] || 'Utilisateur').slice(0, 80),
            email: (nextUser.email || '').slice(0, 120),
            ...(nextUser.photoURL ? { photoURL: nextUser.photoURL.slice(0, 500) } : {}),
            plan: 'free',
          };
          await setDoc(userRef, {
            ...newProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setProfile(newProfile);
        }
      } catch (error) {
        handleFirestoreError(error, 'get', userPath);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, [openLanding]);

  async function handleSignIn() {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await loginWithGoogle();
      openConsole();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Connexion annulée ou impossible.';
      setAuthError(`Connexion Google impossible : ${msg}`);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    await logoutUser();
    setUser(null);
    setProfile(null);
    openLanding();
  }

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700 dark:bg-slate-950 dark:text-slate-300">
        <p className="text-sm font-medium">Initialisation sécurisée d’Hébergio...</p>
      </div>
    );
  }

  const showConsole = Boolean(user) && viewMode === 'console';

  return (
    <>
      {showConsole && user ? (
        <DashboardView
          user={user}
          profile={profile}
          publicSites={publicSites}
          paymentConfig={paymentConfig}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onRefreshPublicSites={refreshPublicSites}
          onSignOut={handleSignOut}
          onBackToHome={openLanding}
        />
      ) : (
        <LandingView
          user={user}
          authLoading={authLoading}
          authError={authError}
          publicSites={publicSites}
          sitesLoading={sitesLoading}
          paymentConfig={paymentConfig}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onOpenConsole={openConsole}
        />
      )}
      <OfflineIndicator />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}

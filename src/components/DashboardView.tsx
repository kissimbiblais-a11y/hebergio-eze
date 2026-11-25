import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Code2,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FilePlus2,
  FolderKanban,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PauseCircle,
  PlayCircle,
  Plus,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { db, handleFirestoreError } from '../firebase';
import { STARTER_TEMPLATES } from '../templates';
import type {
  DeployFile,
  DeploymentRecord,
  HostingProject,
  PaymentConfigStatus,
  PaymentRequestRecord,
  ProjectKind,
  PublicSiteSummary,
  ServiceOrderId,
  ServiceOrderRecord,
  ServiceOrderStatus,
  UserPlan,
  UserProfile,
} from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface DashboardViewProps {
  user: User;
  profile: UserProfile | null;
  publicSites: PublicSiteSummary[];
  paymentConfig: PaymentConfigStatus | null;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onRefreshPublicSites: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onBackToHome: () => void;
}

type ConsoleTab = 'overview' | 'projects' | 'editor' | 'payments' | 'admin' | 'settings';

const ADMIN_EMAIL = 'kissimbiblais@gmail.com';
const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/;
const TEXT_FILE_EXT = new Set([
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.svg',
  '.txt',
  '.md',
  '.xml',
  '.webmanifest',
]);

const SERVICE_CATALOG: Array<{
  id: ServiceOrderId;
  label: string;
  amountFcfa: number;
  cadence: string;
  summary: string;
}> = [
  {
    id: 'setup_domain',
    label: 'Pack Mise en ligne & Domaine',
    amountFcfa: 10000,
    cadence: 'Paiement unique',
    summary: 'Configuration nom de domaine, HTTPS et mise en ligne initiale accompagnée.',
  },
  {
    id: 'pwa_seo_pack',
    label: 'Pack PWA Installable & SEO',
    amountFcfa: 15000,
    cadence: 'Paiement unique',
    summary: 'Manifeste PWA complet, icônes mobiles et optimisation référencement local.',
  },
  {
    id: 'pro_monthly',
    label: 'Abonnement Hébergio Pro',
    amountFcfa: 5000,
    cadence: 'Par mois',
    summary: 'Capacité étendue multi-projets et suivi prioritaire.',
  },
  {
    id: 'enterprise_monthly',
    label: 'Abonnement Hébergio Entreprise',
    amountFcfa: 15000,
    cadence: 'Par mois',
    summary: 'Gestion multi-clients pour agences et PME avec suivi dédié.',
  },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function isTextFileName(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.');
  if (dot === -1) return false;
  return TEXT_FILE_EXT.has(filePath.slice(dot).toLowerCase());
}

function generateOrderRef(): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `HBG-${stamp}-${rand}`;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  profile,
  publicSites,
  paymentConfig,
  darkMode,
  onToggleDarkMode,
  onRefreshPublicSites,
  onSignOut,
  onBackToHome,
}) => {
  const isAdmin = Boolean(user.emailVerified && user.email === ADMIN_EMAIL);

  const [activeTab, setActiveTab] = useState<ConsoleTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Firestore real data
  const [projects, setProjects] = useState<HostingProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestRecord[]>([]);
  const [myOrders, setMyOrders] = useState<ServiceOrderRecord[]>([]);

  // Admin collections (loaded only if isAdmin)
  const [allOrders, setAllOrders] = useState<ServiceOrderRecord[]>([]);
  const [allClients, setAllClients] = useState<UserProfile[]>([]);

  // Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | ProjectKind>('all');

  // Create project modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newKind, setNewKind] = useState<ProjectKind>('site');
  const [newDescription, setNewDescription] = useState('');
  const [newTemplateId, setNewTemplateId] = useState<string>('vitrine');
  const [creatingProject, setCreatingProject] = useState(false);

  // Active editor state
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editorFiles, setEditorFiles] = useState<DeployFile[]>(STARTER_TEMPLATES[0].files);
  const [activeFilePath, setActiveFilePath] = useState<string>('index.html');
  const [newFileName, setNewFileName] = useState('');
  const [deployNote, setDeployNote] = useState('Mise à jour en ligne');
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [deploying, setDeploying] = useState(false);

  // Feedback / Live announcement
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(
    null
  );

  // Mobile Money gateway form
  const [payPlan, setPayPlan] = useState<'pro' | 'enterprise'>('pro');
  const [payProvider, setPayProvider] = useState<'fedapay' | 'kkiapay'>('fedapay');
  const [payOperator, setPayOperator] = useState<PaymentRequestRecord['operator']>('mtn_benin');
  const [payPhone, setPayPhone] = useState('');
  const [payDirectPush, setPayDirectPush] = useState(true);
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [fedapayTesting, setFedapayTesting] = useState(false);
  const [fedapayValidationResult, setFedapayValidationResult] = useState<{
    ok: boolean;
    environment?: string;
    message: string;
    missingVars?: string[];
    supportedModes?: string[];
  } | null>(null);
  const [lastFedaPayTx, setLastFedaPayTx] = useState<{
    transactionId: string;
    checkoutUrl: string | null;
    mode?: string;
    directPush?: boolean;
    status?: string;
  } | null>(null);
  const [verifyingTx, setVerifyingTx] = useState(false);

  // Turnkey Service Order form
  const [orderServiceId, setOrderServiceId] = useState<ServiceOrderId>('setup_domain');
  const [orderProjectSlug, setOrderProjectSlug] = useState('');
  const [orderPhone, setOrderPhone] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderSubmitting, setOrderSubmitting] = useState(false);

  // Profile form
  const [displayNameInput, setDisplayNameInput] = useState(
    profile?.displayName || user.displayName || ''
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [serverHealth, setServerHealth] = useState<'unknown' | 'ok' | 'error'>('unknown');
  const [pwaProof, setPwaProof] = useState<{
    checking: boolean;
    manifestOk: boolean;
    display: string | null;
    iconsCount: number;
    swActive: boolean;
    httpsOk: boolean;
  }>({
    checking: true,
    manifestOk: false,
    display: null,
    iconsCount: 0,
    swActive: false,
    httpsOk: false,
  });
  const [copiedAppLink, setCopiedAppLink] = useState(false);
  const [downloadingCfZip, setDownloadingCfZip] = useState(false);

  useEffect(() => {
    setDisplayNameInput(profile?.displayName || user.displayName || '');
  }, [profile?.displayName, user.displayName]);

  useEffect(() => {
    if (activeTab !== 'settings') return;
    let active = true;
    setPwaProof((prev) => ({ ...prev, checking: true }));

    (async () => {
      let manifestOk = false;
      let display: string | null = null;
      let iconsCount = 0;
      let swActive = false;
      const httpsOk =
        typeof window !== 'undefined' &&
        (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

      try {
        const res = await fetch('/manifest.webmanifest', { cache: 'no-store' });
        if (res.ok) {
          const manifest = (await res.json()) as {
            display?: string;
            icons?: Array<{ src?: string; sizes?: string }>;
          };
          manifestOk = Boolean(manifest && manifest.display);
          display = manifest.display || null;
          iconsCount = Array.isArray(manifest.icons) ? manifest.icons.length : 0;
        }
      } catch {
        manifestOk = false;
      }

      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          swActive = regs.some((r) => Boolean(r.active || r.installing || r.waiting));
        } catch {
          swActive = false;
        }
      }

      if (active) {
        setPwaProof({
          checking: false,
          manifestOk,
          display,
          iconsCount,
          swActive,
          httpsOk,
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [activeTab]);

  // Listen to user's projects
  useEffect(() => {
    const q = query(
      collection(db, 'projects'),
      where('ownerId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<HostingProject, 'id'>),
        }));
        setProjects(list);
        setProjectsLoading(false);
        setSelectedProjectId((prev) => {
          if (prev && list.some((p) => p.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      },
      (error) => {
        setProjectsLoading(false);
        handleFirestoreError(error, 'list', 'projects');
      }
    );
    return () => unsubscribe();
  }, [user.uid]);

  // Listen to user's payment requests
  useEffect(() => {
    const q = query(
      collection(db, 'payment_requests'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setPaymentRequests(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<PaymentRequestRecord, 'id'>),
          }))
        );
      },
      (error) => {
        handleFirestoreError(error, 'list', 'payment_requests');
      }
    );
    return () => unsubscribe();
  }, [user.uid]);

  // Listen to user's service orders
  useEffect(() => {
    const q = query(
      collection(db, 'service_orders'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setMyOrders(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ServiceOrderRecord, 'id'>),
          }))
        );
      },
      (error) => {
        handleFirestoreError(error, 'list', 'service_orders');
      }
    );
    return () => unsubscribe();
  }, [user.uid]);

  // Admin listeners (only mounted when authenticated as admin)
  useEffect(() => {
    if (!isAdmin) return;
    const unsubOrders = onSnapshot(
      query(collection(db, 'service_orders'), orderBy('createdAt', 'desc')),
      (snap) => {
        setAllOrders(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ServiceOrderRecord, 'id'>),
          }))
        );
      },
      (error) => {
        handleFirestoreError(error, 'list', 'service_orders');
      }
    );

    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), orderBy('updatedAt', 'desc')),
      (snap) => {
        setAllClients(snap.docs.map((d) => d.data() as UserProfile));
      },
      (error) => {
        handleFirestoreError(error, 'list', 'users');
      }
    );

    return () => {
      unsubOrders();
      unsubUsers();
    };
  }, [isAdmin]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  // Listen to selected project's deployment history
  useEffect(() => {
    if (!selectedProjectId) {
      setDeployments([]);
      return;
    }
    const path = `projects/${selectedProjectId}/deployments`;
    const q = query(
      collection(db, 'projects', selectedProjectId, 'deployments'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setDeployments(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<DeploymentRecord, 'id'>),
          }))
        );
      },
      (error) => {
        handleFirestoreError(error, 'list', path);
      }
    );
    return () => unsubscribe();
  }, [selectedProjectId, user.uid]);

  // Load files from server when selecting a project
  useEffect(() => {
    if (!selectedProject) return;
    let cancelled = false;
    async function loadProjectFiles() {
      setLoadingFiles(true);
      try {
        const token = await user.getIdToken();
        const resp = await fetch(`/api/sites/${encodeURIComponent(selectedProject!.slug)}/files`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const data = (await resp.json()) as { files?: DeployFile[] };
          if (!cancelled && Array.isArray(data.files) && data.files.length > 0) {
            setEditorFiles(data.files);
            setActiveFilePath(data.files[0].path);
            setLoadingFiles(false);
            return;
          }
        }
        if (!cancelled) {
          const fallback =
            STARTER_TEMPLATES.find((t) => t.kind === selectedProject!.kind) || STARTER_TEMPLATES[0];
          setEditorFiles(fallback.files.map((f) => ({ ...f })));
          setActiveFilePath(fallback.files[0].path);
        }
      } catch {
        if (!cancelled) {
          setEditorFiles(STARTER_TEMPLATES[0].files.map((f) => ({ ...f })));
          setActiveFilePath('index.html');
        }
      } finally {
        if (!cancelled) setLoadingFiles(false);
      }
    }
    void loadProjectFiles();
    return () => {
      cancelled = true;
    };
  }, [selectedProject?.id, selectedProject?.slug, user]);

  useEffect(() => {
    if (activeTab !== 'settings') return;
    fetch('/api/health')
      .then((r) => setServerHealth(r.ok ? 'ok' : 'error'))
      .catch(() => setServerHealth('error'));
  }, [activeTab]);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesKind = kindFilter === 'all' || p.kind === kindFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q);
      return matchesKind && matchesQuery;
    });
  }, [projects, kindFilter, searchQuery]);

  const totalStorageBytes = useMemo(
    () => projects.reduce((acc, p) => acc + (p.sizeBytes || 0), 0),
    [projects]
  );

  const liveProjectsCount = useMemo(
    () => projects.filter((p) => p.status === 'live').length,
    [projects]
  );

  const totalHits = useMemo(() => {
    const ownedSlugs = new Set(projects.map((p) => p.slug));
    return publicSites
      .filter((s) => ownedSlugs.has(s.slug))
      .reduce((acc, s) => acc + (s.hits || 0), 0);
  }, [projects, publicSites]);

  const activeFile = useMemo(
    () => editorFiles.find((f) => f.path === activeFilePath) ?? null,
    [editorFiles, activeFilePath]
  );

  const adminRevenueStats = useMemo(() => {
    const confirmed = allOrders
      .filter((o) => o.status === 'paid' || o.status === 'completed')
      .reduce((sum, o) => sum + (o.amountFcfa || 0), 0);
    const pending = allOrders
      .filter((o) => o.status === 'pending_payment')
      .reduce((sum, o) => sum + (o.amountFcfa || 0), 0);
    return {
      confirmed,
      pending,
      pendingCount: allOrders.filter((o) => o.status === 'pending_payment').length,
    };
  }, [allOrders]);

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = newName.trim();
    const cleanSlug = slugify(newSlug || cleanName);

    if (cleanName.length < 2 || cleanName.length > 80) {
      setNotice({ type: 'error', text: 'Le nom du projet doit contenir entre 2 et 80 caractères.' });
      return;
    }
    if (!SLUG_REGEX.test(cleanSlug)) {
      setNotice({
        type: 'error',
        text: 'Le slug doit contenir 3 à 48 caractères alphanumériques minuscules ou tirets.',
      });
      return;
    }

    setCreatingProject(true);
    setNotice(null);
    const template = STARTER_TEMPLATES.find((t) => t.id === newTemplateId) || STARTER_TEMPLATES[0];

    try {
      const docRef = await addDoc(collection(db, 'projects'), {
        ownerId: user.uid,
        name: cleanName,
        slug: cleanSlug,
        kind: newKind,
        description: newDescription.trim().slice(0, 240),
        status: 'draft',
        entryFile: 'index.html',
        fileCount: template.files.length,
        sizeBytes: template.files.reduce((sum, f) => sum + new Blob([f.content]).size, 0),
        deployCount: 0,
        livePath: `/s/${cleanSlug}/`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSelectedProjectId(docRef.id);
      setEditorFiles(template.files.map((f) => ({ ...f })));
      setActiveFilePath(template.files[0].path);
      setShowCreateModal(false);
      setNewName('');
      setNewSlug('');
      setNewDescription('');
      setActiveTab('editor');
      setNotice({
        type: 'info',
        text: `Projet « ${cleanName} » créé en brouillon. Cliquez sur « Déployer en ligne » pour le publier.`,
      });
    } catch (error) {
      handleFirestoreError(error, 'create', 'projects');
    } finally {
      setCreatingProject(false);
    }
  }

  async function handleDeploySelected() {
    if (!selectedProject) return;
    if (editorFiles.length === 0) {
      setNotice({ type: 'error', text: 'Ajoutez au moins un fichier index.html avant de déployer.' });
      return;
    }

    setDeploying(true);
    setNotice(null);

    try {
      const token = await user.getIdToken();
      const resp = await fetch(`/api/sites/${encodeURIComponent(selectedProject.slug)}/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: selectedProject.name,
          kind: selectedProject.kind,
          description: selectedProject.description,
          entryFile: selectedProject.entryFile || 'index.html',
          files: editorFiles,
        }),
      });

      const data = (await resp.json()) as {
        ok?: boolean;
        error?: string;
        livePath?: string;
        fileCount?: number;
        sizeBytes?: number;
      };

      if (!resp.ok || !data.ok) {
        setNotice({ type: 'error', text: data.error || 'Échec du déploiement sur le serveur.' });
        setDeploying(false);
        return;
      }

      const nextDeployCount = (selectedProject.deployCount || 0) + 1;
      const projectPath = `projects/${selectedProject.id}`;
      try {
        await updateDoc(doc(db, 'projects', selectedProject.id), {
          status: 'live',
          entryFile: selectedProject.entryFile || 'index.html',
          fileCount: data.fileCount ?? editorFiles.length,
          sizeBytes: data.sizeBytes ?? 0,
          deployCount: nextDeployCount,
          updatedAt: serverTimestamp(),
        });

        await addDoc(collection(db, 'projects', selectedProject.id, 'deployments'), {
          projectId: selectedProject.id,
          ownerId: user.uid,
          version: nextDeployCount,
          note: (deployNote.trim() || `Déploiement v${nextDeployCount}`).slice(0, 200),
          fileCount: data.fileCount ?? editorFiles.length,
          sizeBytes: data.sizeBytes ?? 1,
          status: 'live',
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, 'update', projectPath);
      }

      await onRefreshPublicSites();
      setNotice({
        type: 'success',
        text: `Déploiement v${nextDeployCount} publié en direct sur ${data.livePath}`,
      });
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Erreur réseau lors du déploiement.',
      });
    } finally {
      setDeploying(false);
    }
  }

  function handleExportBundle() {
    if (!selectedProject) return;
    const payload = {
      exportedFrom: 'Hébergio',
      exportedAt: new Date().toISOString(),
      project: {
        name: selectedProject.name,
        slug: selectedProject.slug,
        kind: selectedProject.kind,
        entryFile: selectedProject.entryFile,
      },
      files: editorFiles,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedProject.slug}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice({
      type: 'success',
      text: `Sauvegarde de « ${selectedProject.name} » téléchargée (${editorFiles.length} fichier(s)).`,
    });
  }

  async function handleToggleProjectStatus(project: HostingProject) {
    const nextStatus = project.status === 'live' ? 'paused' : 'live';
    try {
      const token = await user.getIdToken();
      const resp = await fetch(`/api/sites/${encodeURIComponent(project.slug)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!resp.ok) {
        const data = (await resp.json()) as { error?: string };
        setNotice({
          type: 'error',
          text: data.error || 'Déployez d’abord les fichiers depuis l’éditeur avant de changer l’état.',
        });
        return;
      }

      await updateDoc(doc(db, 'projects', project.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      await onRefreshPublicSites();
      setNotice({
        type: 'info',
        text:
          nextStatus === 'live'
            ? `Le site « ${project.name} » est de nouveau en ligne.`
            : `Le site « ${project.name} » est mis en pause.`,
      });
    } catch (error) {
      handleFirestoreError(error, 'update', `projects/${project.id}`);
    }
  }

  async function handleDeleteProject(project: HostingProject) {
    try {
      const token = await user.getIdToken();
      await fetch(`/api/sites/${encodeURIComponent(project.slug)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await deleteDoc(doc(db, 'projects', project.id));
      await onRefreshPublicSites();
      setNotice({ type: 'info', text: `Projet « ${project.name} » supprimé.` });
    } catch (error) {
      handleFirestoreError(error, 'delete', `projects/${project.id}`);
    }
  }

  async function handleLocalFilesImport(event: React.ChangeEvent<HTMLInputElement>) {
    const filesList = event.target.files;
    if (!filesList || filesList.length === 0) return;

    const imported: DeployFile[] = [];
    for (const file of Array.from(filesList)) {
      const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath
        ? (file as File & { webkitRelativePath?: string }).webkitRelativePath!.split('/').slice(1).join('/') ||
          file.name
        : file.name;

      if (isTextFileName(relPath)) {
        const text = await file.text();
        imported.push({ path: relPath, content: text, encoding: 'utf8' });
      } else {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        imported.push({ path: relPath, content: btoa(binary), encoding: 'base64' });
      }
    }

    setEditorFiles((prev) => {
      const map = new Map(prev.map((f) => [f.path, f]));
      for (const f of imported) {
        map.set(f.path, f);
      }
      return Array.from(map.values());
    });
    if (imported[0]) {
      setActiveFilePath(imported[0].path);
    }
    setNotice({
      type: 'info',
      text: `${imported.length} fichier(s) chargé(s) dans l’éditeur. Cliquez sur « Déployer en ligne » pour publier.`,
    });
    event.target.value = '';
  }

  function handleAddEmptyFile(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = newFileName.trim().replace(/^\/+/, '');
    if (!cleaned) return;
    if (!isTextFileName(cleaned)) {
      setNotice({
        type: 'error',
        text: 'Extension texte prise en charge : .html, .css, .js, .json, .svg, .txt, .md, .webmanifest.',
      });
      return;
    }
    if (editorFiles.some((f) => f.path === cleaned)) {
      setActiveFilePath(cleaned);
      setNewFileName('');
      return;
    }
    setEditorFiles((prev) => [...prev, { path: cleaned, content: '', encoding: 'utf8' }]);
    setActiveFilePath(cleaned);
    setNewFileName('');
  }

  async function handleValidateFedaPay() {
    setFedapayTesting(true);
    setFedapayValidationResult(null);
    try {
      const token = await user.getIdToken();
      const resp = await fetch('/api/payments/fedapay/validate', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        environment?: string;
        message?: string;
        missingVars?: string[];
        supportedModes?: string[];
      };
      setFedapayValidationResult({
        ok: Boolean(resp.ok && data.ok),
        environment: data.environment,
        message:
          data.message ||
          (resp.ok
            ? 'Connexion FedaPay validée.'
            : 'Clés FedaPay manquantes ou invalides sur le serveur.'),
        missingVars: Array.isArray(data.missingVars) ? data.missingVars : undefined,
        supportedModes: Array.isArray(data.supportedModes) ? data.supportedModes : undefined,
      });
    } catch {
      setFedapayValidationResult({
        ok: false,
        message: 'Impossible de joindre le serveur Hébergio pour tester FedaPay.',
      });
    } finally {
      setFedapayTesting(false);
    }
  }

  async function handleVerifyFedaPayTx(txId: string) {
    setVerifyingTx(true);
    try {
      const token = await user.getIdToken();
      const resp = await fetch(`/api/payments/fedapay/verify/${encodeURIComponent(txId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        status?: string;
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        setNotice({
          type: 'error',
          text: data.error || 'Impossible de vérifier le statut de la transaction FedaPay.',
        });
        return;
      }
      const nextStatus = data.status || 'unknown';
      setLastFedaPayTx((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      setNotice({
        type: nextStatus === 'approved' ? 'success' : 'info',
        text: `Statut réel FedaPay (#${txId}) : ${nextStatus}.`,
      });
    } catch {
      setNotice({
        type: 'error',
        text: 'Erreur réseau lors de la vérification de la transaction FedaPay.',
      });
    } finally {
      setVerifyingTx(false);
    }
  }

  async function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanPhone = payPhone.trim();
    if (cleanPhone.length < 8 || cleanPhone.length > 20) {
      setNotice({ type: 'error', text: 'Saisissez un numéro Mobile Money valide (8 à 20 caractères).' });
      return;
    }

    setPaySubmitting(true);
    setNotice(null);
    const amountFcfa = payPlan === 'pro' ? 5000 : 15000;

    try {
      const token = await user.getIdToken();
      const resp = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: payProvider,
          planId: payPlan,
          operator: payOperator,
          phone: cleanPhone,
          directPush: payProvider === 'fedapay' ? payDirectPush : false,
        }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        provider?: string;
        code?: string;
        message?: string;
        error?: string;
        transactionId?: string;
        checkoutUrl?: string | null;
        mode?: string;
        directPush?: boolean;
      };

      const isConfigRequired = resp.status === 503 && data.code === 'PROVIDER_NOT_CONFIGURED';

      await addDoc(collection(db, 'payment_requests'), {
        ownerId: user.uid,
        planId: payPlan,
        amountFcfa,
        provider: payProvider,
        operator: payOperator,
        phone: cleanPhone,
        status: isConfigRequired ? 'configuration_required' : 'pending_provider',
        createdAt: serverTimestamp(),
      });

      if (data.transactionId) {
        const safeUrl =
          typeof data.checkoutUrl === 'string' && data.checkoutUrl.startsWith('https://')
            ? data.checkoutUrl
            : null;
        setLastFedaPayTx({
          transactionId: data.transactionId,
          checkoutUrl: safeUrl,
          mode: data.mode,
          directPush: Boolean(data.directPush),
          status: 'pending',
        });
      }

      if (!resp.ok) {
        setNotice({
          type: 'error',
          text:
            data.message ||
            data.error ||
            'La passerelle Mobile Money n’est pas encore configurée sur ce serveur.',
        });
      } else if (data.provider === 'fedapay' && data.transactionId) {
        setNotice({
          type: 'success',
          text: data.directPush
            ? `Demande Mobile Money envoyée sur ${cleanPhone} (Transaction FedaPay #${data.transactionId}). Validez le code PIN sur votre téléphone puis vérifiez le statut.`
            : `Transaction FedaPay #${data.transactionId} créée. Ouvrez le lien FedaPay ci-dessous pour finaliser via MTN ou Moov Money.`,
        });
      } else {
        setNotice({
          type: 'success',
          text: 'Transaction initialisée auprès du fournisseur Mobile Money.',
        });
      }
    } catch (error) {
      handleFirestoreError(error, 'create', 'payment_requests');
    } finally {
      setPaySubmitting(false);
    }
  }

  async function handleCreateServiceOrder(e: React.FormEvent) {
    e.preventDefault();
    const cleanPhone = orderPhone.trim();
    if (cleanPhone.length < 8 || cleanPhone.length > 20) {
      setNotice({ type: 'error', text: 'Indiquez un numéro de téléphone ou WhatsApp valide (8–20 caractères).' });
      return;
    }
    const item = SERVICE_CATALOG.find((s) => s.id === orderServiceId) || SERVICE_CATALOG[0];
    const refCode = generateOrderRef();

    setOrderSubmitting(true);
    setNotice(null);
    try {
      await addDoc(collection(db, 'service_orders'), {
        ownerId: user.uid,
        ownerEmail: (user.email || '').slice(0, 120),
        ownerName: (profile?.displayName || user.displayName || 'Client').slice(0, 80),
        serviceId: item.id,
        serviceLabel: item.label,
        amountFcfa: item.amountFcfa,
        projectSlug: orderProjectSlug.trim().slice(0, 50),
        contactPhone: cleanPhone,
        notes: orderNotes.trim().slice(0, 300),
        referenceCode: refCode,
        status: 'pending_payment',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setOrderNotes('');
      setNotice({
        type: 'success',
        text: `Commande enregistrée sous la référence ${refCode} (${item.amountFcfa.toLocaleString('fr-FR')} FCFA). Statut : en attente de règlement vérifié.`,
      });
    } catch (error) {
      handleFirestoreError(error, 'create', 'service_orders');
    } finally {
      setOrderSubmitting(false);
    }
  }

  async function handleAdminUpdateOrderStatus(order: ServiceOrderRecord, status: ServiceOrderStatus) {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'service_orders', order.id), {
        status,
        updatedAt: serverTimestamp(),
      });
      setNotice({
        type: 'success',
        text: `Commande ${order.referenceCode} passée à « ${status} ».`,
      });
    } catch (error) {
      handleFirestoreError(error, 'update', `service_orders/${order.id}`);
    }
  }

  async function handleAdminUpdateUserPlan(client: UserProfile, plan: UserPlan) {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'users', client.uid), {
        plan,
        updatedAt: serverTimestamp(),
      });
      setNotice({
        type: 'success',
        text: `Offre de ${client.email} mise à jour vers « ${plan.toUpperCase()} ».`,
      });
    } catch (error) {
      handleFirestoreError(error, 'update', `users/${client.uid}`);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    const clean = displayNameInput.trim();
    if (!clean || clean.length > 80) {
      setNotice({ type: 'error', text: 'Le nom affiché doit contenir entre 1 et 80 caractères.' });
      return;
    }
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: clean,
        updatedAt: serverTimestamp(),
      });
      setNotice({ type: 'success', text: 'Profil mis à jour dans Firestore.' });
    } catch (error) {
      handleFirestoreError(error, 'update', `users/${user.uid}`);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleDownloadCloudflareZip() {
    if (!isAdmin) return;
    setDownloadingCfZip(true);
    setNotice(null);
    try {
      const token = await user.getIdToken();
      const resp = await fetch('/api/cloudflare/package.zip', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const errData = (await resp.json().catch(() => ({}))) as { error?: string };
        setNotice({
          type: 'error',
          text: errData.error || 'Impossible de générer le ZIP Cloudflare.',
        });
        return;
      }
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = 'hebergio-cloudflare-ready.zip';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);
      setNotice({
        type: 'success',
        text: 'Archive hebergio-cloudflare-ready.zip téléchargée avec succès.',
      });
    } catch {
      setNotice({
        type: 'error',
        text: 'Erreur réseau lors du téléchargement du pack Cloudflare.',
      });
    } finally {
      setDownloadingCfZip(false);
    }
  }

  const navItems: Array<{ id: ConsoleTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Vue d’ensemble', icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> },
    { id: 'projects', label: 'Mes projets', icon: <FolderKanban className="h-4 w-4" aria-hidden="true" /> },
    { id: 'editor', label: 'Éditeur & Déploiement', icon: <Code2 className="h-4 w-4" aria-hidden="true" /> },
    { id: 'payments', label: 'Paiements & Packs FCFA', icon: <CreditCard className="h-4 w-4" aria-hidden="true" /> },
    ...(isAdmin
      ? [{ id: 'admin' as const, label: 'Revenus & Clients', icon: <Banknote className="h-4 w-4" aria-hidden="true" /> }]
      : []),
    { id: 'settings', label: 'Paramètres & PWA', icon: <Settings className="h-4 w-4" aria-hidden="true" /> },
  ];

  const fedapayReady = paymentConfig?.providers.fedapay.configured ?? false;
  const kkiapayReady = paymentConfig?.providers.kkiapay.configured ?? false;

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a href="#console-main" className="skip-link">
        Aller au contenu principal de la console
      </a>

      {/* Desktop Sidebar */}
      <aside
        aria-label="Menu de la console Hébergio"
        className="hidden w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900"
      >
        <div>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onBackToHome}
              className="text-lg font-bold tracking-normal text-slate-900 hover:text-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 dark:text-white dark:hover:text-sky-400"
            >
              Hébergio
            </button>
            <button
              type="button"
              onClick={onBackToHome}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              Accueil
            </button>
          </div>

          <nav className="space-y-1 p-3">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${
                    active
                      ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {profile?.displayName || user.displayName || 'Utilisateur'}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
            <p className="mt-1 text-xs font-medium text-sky-700 dark:text-sky-400">
              Offre : {profile?.plan === 'pro' ? 'Pro' : profile?.plan === 'enterprise' ? 'Entreprise' : 'Gratuit'}
              {isAdmin ? ' · Admin' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <nav
            aria-label="Menu mobile"
            className="relative z-10 flex w-72 flex-col justify-between bg-white p-4 dark:bg-slate-900"
          >
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                <span className="text-lg font-bold text-slate-900 dark:text-white">Hébergio</span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Fermer le menu"
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-3 space-y-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      activeTab === item.id
                        ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
              <p className="truncate text-sm font-semibold">{user.email}</p>
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium dark:border-slate-700"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Déconnexion</span>
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3.5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Ouvrir le menu"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <p className="truncate text-sm font-medium text-slate-600 dark:text-slate-300">
              Console /{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {navItems.find((n) => n.id === activeTab)?.label}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onToggleDarkMode}
              aria-label={darkMode ? 'Passer en thème clair' : 'Passer en thème sombre'}
              className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {darkMode ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Nouveau projet</span>
            </button>
          </div>
        </header>

        <main id="console-main" tabIndex={-1} className="flex-1 p-6 outline-none">
          {notice && (
            <div
              role={notice.type === 'error' ? 'alert' : 'status'}
              aria-live="polite"
              className={`mb-6 flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm ${
                notice.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/60 dark:text-red-200'
                  : notice.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/60 dark:text-emerald-200'
                  : 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/60 dark:text-sky-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {notice.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : notice.type === 'error' ? (
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : null}
                <span>{notice.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setNotice(null)}
                aria-label="Fermer le message"
                className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Projets enregistrés</p>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {projects.length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Sites en ligne</p>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {liveProjectsCount}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Stockage cumulé</p>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatBytes(totalStorageBytes)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Visites servies</p>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {totalHits}
                  </p>
                </div>
              </div>

              <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Vos projets d’hébergement
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('projects')}
                    className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
                  >
                    Tout afficher
                  </button>
                </div>

                {projectsLoading ? (
                  <div className="space-y-2 p-5">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-11 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    ))}
                  </div>
                ) : projects.length === 0 ? (
                  <div className="p-8 text-center">
                    <Globe className="mx-auto h-9 w-9 text-slate-400" aria-hidden="true" />
                    <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">
                      Aucun projet créé pour le moment
                    </h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      Créez votre premier site web ou application PWA et publiez-le gratuitement sur une URL en direct.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(true)}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      <span>Créer mon premier projet</span>
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-200 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <tr>
                          <th className="px-5 py-3">Projet</th>
                          <th className="px-5 py-3">Adresse publique</th>
                          <th className="px-5 py-3">État</th>
                          <th className="px-5 py-3 text-right">Taille</th>
                          <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {projects.slice(0, 6).map((project) => (
                          <tr key={project.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">
                              {project.name}
                              <span className="ml-2 text-xs font-normal text-slate-500">
                                {project.kind === 'pwa' ? 'PWA' : project.kind === 'webapp' ? 'App' : 'Site'}
                              </span>
                            </td>
                            <td className="px-5 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                              {project.livePath}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`text-xs font-semibold ${
                                  project.status === 'live'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : project.status === 'paused'
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {project.status === 'live'
                                  ? 'En ligne'
                                  : project.status === 'paused'
                                  ? 'En pause'
                                  : 'Brouillon'}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                              {formatBytes(project.sizeBytes)}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <div className="inline-flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedProjectId(project.id);
                                    setActiveTab('editor');
                                  }}
                                  className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-400"
                                >
                                  Éditer
                                </button>
                                {project.status === 'live' && (
                                  <a
                                    href={project.livePath}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:underline dark:text-slate-200"
                                  >
                                    <span>Ouvrir</span>
                                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 2: PROJECTS */}
          {activeTab === 'projects' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="relative min-w-[240px] flex-1 max-w-md">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher par nom ou slug..."
                    aria-label="Rechercher un projet"
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-sky-700 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div
                  role="group"
                  aria-label="Filtrer par type de projet"
                  className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1 dark:bg-slate-800"
                >
                  {(
                    [
                      ['all', 'Tous'],
                      ['site', 'Sites'],
                      ['webapp', 'Apps Web'],
                      ['pwa', 'PWA'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setKindFilter(val)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                        kindFilter === val
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredProjects.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Aucun projet ne correspond à ce filtre.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {filteredProjects.map((project) => (
                    <article
                      key={project.id}
                      className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                              {project.name}
                            </h3>
                            <p className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                              {project.kind.toUpperCase()} · {project.fileCount} fichier(s) ·{' '}
                              {formatBytes(project.sizeBytes)} · v{project.deployCount}
                            </p>
                          </div>
                          <span
                            className={`text-xs font-semibold ${
                              project.status === 'live'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : project.status === 'paused'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {project.status === 'live'
                              ? 'En ligne'
                              : project.status === 'paused'
                              ? 'En pause'
                              : 'Brouillon'}
                          </span>
                        </div>
                        {project.description && (
                          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                            {project.description}
                          </p>
                        )}
                        <p className="mt-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                          {project.livePath}
                        </p>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProjectId(project.id);
                              setActiveTab('editor');
                            }}
                            className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
                          >
                            Éditer &amp; Déployer
                          </button>
                          {project.status === 'live' && (
                            <a
                              href={project.livePath}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <span>Voir en direct</span>
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            </a>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {project.deployCount > 0 && (
                            <button
                              type="button"
                              onClick={() => void handleToggleProjectStatus(project)}
                              aria-label={
                                project.status === 'live'
                                  ? `Mettre ${project.name} en pause`
                                  : `Remettre ${project.name} en ligne`
                              }
                              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              {project.status === 'live' ? (
                                <PauseCircle className="h-4 w-4" aria-hidden="true" />
                              ) : (
                                <PlayCircle className="h-4 w-4" aria-hidden="true" />
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleDeleteProject(project)}
                            aria-label={`Supprimer ${project.name}`}
                            className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: EDITOR & REAL DEPLOY + EXPORT */}
          {activeTab === 'editor' && (
            <div className="space-y-6">
              {!selectedProject ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-base font-semibold text-slate-900 dark:text-white">
                    Sélectionnez ou créez un projet pour éditer et déployer ses fichiers.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span>Nouveau projet</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center gap-3">
                      <label htmlFor="project-selector" className="text-xs font-medium text-slate-500">
                        Projet actif :
                      </label>
                      <select
                        id="project-selector"
                        value={selectedProject.id}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.livePath})
                          </option>
                        ))}
                      </select>
                      {selectedProject.status === 'live' && (
                        <a
                          href={selectedProject.livePath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 hover:underline dark:text-sky-400"
                        >
                          <span className="font-mono text-xs">{selectedProject.livePath}</span>
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleExportBundle}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Exporter (.json)</span>
                      </button>
                      <input
                        type="text"
                        value={deployNote}
                        onChange={(e) => setDeployNote(e.target.value)}
                        aria-label="Note de déploiement"
                        placeholder="Note de version..."
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => void handleDeploySelected()}
                        disabled={deploying}
                        className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 whitespace-nowrap"
                      >
                        <Rocket className="h-4 w-4" aria-hidden="true" />
                        <span>{deploying ? 'Déploiement...' : 'Déployer en ligne'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Trust & Isolation Bar */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      Isolation Sandbox CSP active
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{editorFiles.length} / 50 fichiers max</span>
                    <span aria-hidden="true">·</span>
                    <span>Export de sauvegarde disponible sans verrouillage</span>
                  </div>

                  {/* Workspace Split */}
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                          Fichiers ({editorFiles.length})
                        </h3>
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Importer</span>
                          <input
                            type="file"
                            multiple
                            onChange={(e) => void handleLocalFilesImport(e)}
                            className="sr-only"
                          />
                        </label>
                      </div>

                      <form onSubmit={handleAddEmptyFile} className="mt-3 flex gap-2">
                        <input
                          type="text"
                          value={newFileName}
                          onChange={(e) => setNewFileName(e.target.value)}
                          placeholder="ex. app.js ou pages/about.html"
                          aria-label="Nom du nouveau fichier"
                          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                        <button
                          type="submit"
                          aria-label="Ajouter ce fichier"
                          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </form>

                      {loadingFiles ? (
                        <div className="mt-4 h-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                      ) : (
                        <ul className="mt-4 space-y-1">
                          {editorFiles.map((file) => (
                            <li key={file.path} className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => setActiveFilePath(file.path)}
                                className={`min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-left font-mono text-xs ${
                                  activeFilePath === file.path
                                    ? 'bg-sky-50 font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                                }`}
                              >
                                {file.path}
                              </button>
                              {editorFiles.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditorFiles((prev) => {
                                      const next = prev.filter((f) => f.path !== file.path);
                                      if (activeFilePath === file.path && next[0]) {
                                        setActiveFilePath(next[0].path);
                                      }
                                      return next;
                                    });
                                  }}
                                  aria-label={`Retirer ${file.path}`}
                                  className="rounded p-1 text-slate-400 hover:text-red-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-8 dark:border-slate-800 dark:bg-slate-900">
                      {activeFile ? (
                        activeFile.encoding === 'base64' ? (
                          <div className="flex h-80 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
                            <p className="font-mono text-sm font-semibold">{activeFile.path}</p>
                            <p className="mt-2 text-xs text-slate-500">
                              Fichier binaire importé prêt pour le déploiement sur le serveur.
                            </p>
                          </div>
                        ) : (
                          <div>
                            <div className="mb-2 flex items-center justify-between">
                              <label
                                htmlFor="code-editor-area"
                                className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300"
                              >
                                {activeFile.path}
                              </label>
                              <span className="text-xs tabular-nums text-slate-500">
                                {formatBytes(new Blob([activeFile.content]).size)}
                              </span>
                            </div>
                            <textarea
                              id="code-editor-area"
                              value={activeFile.content}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditorFiles((prev) =>
                                  prev.map((f) =>
                                    f.path === activeFile.path ? { ...f, content: val } : f
                                  )
                                );
                              }}
                              spellCheck={false}
                              rows={18}
                              className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-900 focus:border-sky-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </div>
                        )
                      ) : (
                        <p className="text-sm text-slate-500">Sélectionnez un fichier.</p>
                      )}
                    </div>
                  </div>

                  {/* Deployment History */}
                  <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Historique réel des déploiements
                      </h3>
                    </div>
                    {deployments.length === 0 ? (
                      <p className="p-5 text-sm text-slate-500">
                        Aucun déploiement enregistré pour ce projet pour l’instant.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                            <tr>
                              <th className="px-5 py-2.5">Version</th>
                              <th className="px-5 py-2.5">Note</th>
                              <th className="px-5 py-2.5 text-right">Fichiers</th>
                              <th className="px-5 py-2.5 text-right">Taille</th>
                              <th className="px-5 py-2.5 text-right">Statut</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {deployments.map((dep) => (
                              <tr key={dep.id}>
                                <td className="px-5 py-2.5 font-mono text-xs font-semibold tabular-nums">
                                  v{dep.version}
                                </td>
                                <td className="px-5 py-2.5 text-slate-700 dark:text-slate-300">
                                  {dep.note}
                                </td>
                                <td className="px-5 py-2.5 text-right tabular-nums">{dep.fileCount}</td>
                                <td className="px-5 py-2.5 text-right tabular-nums">
                                  {formatBytes(dep.sizeBytes)}
                                </td>
                                <td className="px-5 py-2.5 text-right text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                  {dep.status === 'live' ? 'Publié' : dep.status}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          )}

          {/* TAB 4: PAYMENTS & TURNKEY SERVICE PACKS FCFA */}
          {activeTab === 'payments' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Turnkey Service Order Form */}
                <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Commander un Pack Clé en Main ou Abonnement (FCFA)
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                    Enregistrez une commande officielle avec numéro de référence unique. L’activation intervient uniquement après vérification réelle du règlement.
                  </p>

                  <form onSubmit={(e) => void handleCreateServiceOrder(e)} className="mt-5 space-y-4">
                    <div>
                      <label htmlFor="order-service" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                        Prestation ou formule choisie
                      </label>
                      <select
                        id="order-service"
                        value={orderServiceId}
                        onChange={(e) => setOrderServiceId(e.target.value as ServiceOrderId)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                      >
                        {SERVICE_CATALOG.map((svc) => (
                          <option key={svc.id} value={svc.id}>
                            {svc.label} — {svc.amountFcfa.toLocaleString('fr-FR')} FCFA ({svc.cadence})
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-xs text-slate-500">
                        {SERVICE_CATALOG.find((s) => s.id === orderServiceId)?.summary}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="order-project" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                          Projet concerné (optionnel)
                        </label>
                        <select
                          id="order-project"
                          value={orderProjectSlug}
                          onChange={(e) => setOrderProjectSlug(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        >
                          <option value="">Aucun / Nouveau projet</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.slug}>
                              {p.name} (/s/{p.slug}/)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="order-phone" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                          Téléphone / WhatsApp de suivi
                        </label>
                        <input
                          id="order-phone"
                          type="tel"
                          required
                          value={orderPhone}
                          onChange={(e) => setOrderPhone(e.target.value)}
                          placeholder="ex. +2290197000000"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="order-notes" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                        Précisions (nom de domaine souhaité, remarques...)
                      </label>
                      <textarea
                        id="order-notes"
                        rows={2}
                        maxLength={300}
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="Ex. Liaison avec mon domaine boutique.bj..."
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={orderSubmitting}
                      className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
                    >
                      {orderSubmitting ? 'Enregistrement...' : 'Générer ma commande référencée'}
                    </button>
                  </form>
                </section>

                {/* Client Orders List */}
                <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    Vos commandes &amp; références
                  </h3>
                  {myOrders.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">
                      Aucune commande enregistrée sur votre compte.
                    </p>
                  ) : (
                    <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                      {myOrders.map((ord) => (
                        <li key={ord.id} className="py-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {ord.serviceLabel}
                            </span>
                            <span className="font-mono text-xs font-bold tabular-nums">
                              {ord.amountFcfa.toLocaleString('fr-FR')} FCFA
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard?.writeText(ord.referenceCode);
                                setNotice({ type: 'info', text: `Référence ${ord.referenceCode} copiée.` });
                              }}
                              className="inline-flex items-center gap-1 font-mono hover:text-sky-700 dark:hover:text-sky-400"
                            >
                              <span>{ord.referenceCode}</span>
                              <Copy className="h-3 w-3" aria-hidden="true" />
                            </button>
                            <span
                              className={`font-semibold ${
                                ord.status === 'paid' || ord.status === 'completed'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : ord.status === 'cancelled'
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {ord.status === 'pending_payment'
                                ? 'En attente de règlement'
                                : ord.status === 'paid'
                                ? 'Payée · Activation en cours'
                                : ord.status === 'completed'
                                ? 'Activée'
                                : 'Annulée'}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {/* Mobile Money Gateways (FedaPay / KKiaPay) */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Passerelles automatiques Mobile Money (FedaPay / KKiaPay)
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Vérification directe auprès du serveur sans aucune simulation de paiement.
                  </p>

                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">FedaPay (MTN &amp; Moov)</h3>
                        <span
                          className={`text-xs font-semibold ${
                            fedapayReady
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {fedapayReady ? 'Configuré' : 'Clés requises'}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {fedapayReady
                          ? `Environnement : ${paymentConfig?.providers.fedapay.environment}`
                          : `Manquant : ${paymentConfig?.providers.fedapay.missingVars.join(', ') || 'FEDAPAY_PUBLIC_KEY, FEDAPAY_SECRET_KEY'}`}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleValidateFedaPay()}
                        disabled={fedapayTesting}
                        className="mt-3 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      >
                        {fedapayTesting
                          ? 'Vérification API FedaPay...'
                          : 'Tester / Valider FedaPay (MTN & Moov)'}
                      </button>
                      {fedapayValidationResult && (
                        <div
                          className={`mt-3 rounded-md border p-2.5 text-xs ${
                            fedapayValidationResult.ok
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-200'
                              : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-200'
                          }`}
                        >
                          <p className="font-semibold">{fedapayValidationResult.message}</p>
                          {fedapayValidationResult.supportedModes && (
                            <p className="mt-1 font-mono text-[11px]">
                              Modes actifs : {fedapayValidationResult.supportedModes.join(', ')}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">KKiaPay</h3>
                        <span
                          className={`text-xs font-semibold ${
                            kkiapayReady
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {kkiapayReady ? 'Configuré' : 'Clés requises'}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {kkiapayReady
                          ? 'Prêt pour encaissement MTN / Moov'
                          : `Manquant : ${paymentConfig?.providers.kkiapay.missingVars.join(', ') || 'KKIAPAY_PUBLIC_KEY, KKIAPAY_PRIVATE_KEY, KKIAPAY_SECRET'}`}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={(e) => void handlePaymentSubmit(e)} className="mt-5 space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="pay-plan" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                          Formule
                        </label>
                        <select
                          id="pay-plan"
                          value={payPlan}
                          onChange={(e) => setPayPlan(e.target.value as 'pro' | 'enterprise')}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        >
                          <option value="pro">Pro — 5 000 FCFA / mois</option>
                          <option value="enterprise">Entreprise — 15 000 FCFA / mois</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="pay-provider" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                          Passerelle
                        </label>
                        <select
                          id="pay-provider"
                          value={payProvider}
                          onChange={(e) => setPayProvider(e.target.value as 'fedapay' | 'kkiapay')}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        >
                          <option value="fedapay">FedaPay (MTN / Moov FCFA)</option>
                          <option value="kkiapay">KKiaPay (MTN / Moov FCFA)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="pay-operator" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                          Opérateur
                        </label>
                        <select
                          id="pay-operator"
                          value={payOperator}
                          onChange={(e) => setPayOperator(e.target.value as PaymentRequestRecord['operator'])}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        >
                          <option value="mtn_benin">MTN Mobile Money (Bénin)</option>
                          <option value="moov_benin">Moov Money (Bénin)</option>
                          <option value="mtn_ci">MTN MoMo (Côte d’Ivoire)</option>
                          <option value="moov_ci">Moov Money (Côte d’Ivoire)</option>
                          <option value="mtn_tg">Mixx / MTN (Togo)</option>
                          <option value="moov_tg">Moov Money (Togo)</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="pay-phone" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                          Numéro Mobile Money
                        </label>
                        <input
                          id="pay-phone"
                          type="tel"
                          required
                          value={payPhone}
                          onChange={(e) => setPayPhone(e.target.value)}
                          placeholder="ex. +2290197000000"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        />
                      </div>
                    </div>

                    {payProvider === 'fedapay' && (
                      <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={payDirectPush}
                          onChange={(e) => setPayDirectPush(e.target.checked)}
                          className="mt-0.5 rounded border-slate-300 text-sky-700 focus:ring-sky-700"
                        />
                        <span>
                          Envoyer une demande directe sur mon téléphone MTN / Moov (USSD) sans quitter l’application
                        </span>
                      </label>
                    )}

                    <button
                      type="submit"
                      disabled={paySubmitting}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                    >
                      {paySubmitting
                        ? 'Initialisation FedaPay / Mobile Money...'
                        : fedapayReady || kkiapayReady
                        ? 'Lancer le paiement Mobile Money'
                        : 'Tester / Enregistrer une demande Mobile Money'}
                    </button>
                  </form>

                  {lastFedaPayTx && (
                    <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4 text-xs dark:border-sky-900/60 dark:bg-sky-950/40">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-sky-950 dark:text-sky-100">
                          Transaction FedaPay #{lastFedaPayTx.transactionId}
                          {lastFedaPayTx.mode ? ` · Mode ${lastFedaPayTx.mode}` : ''}
                        </p>
                        <span className="font-mono font-semibold text-sky-800 dark:text-sky-300">
                          Statut : {lastFedaPayTx.status || 'pending'}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {lastFedaPayTx.checkoutUrl && (
                          <a
                            href={lastFedaPayTx.checkoutUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-3 py-1.5 font-semibold text-white hover:bg-sky-800"
                          >
                            <span>Ouvrir la page FedaPay</span>
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleVerifyFedaPayTx(lastFedaPayTx.transactionId)}
                          disabled={verifyingTx}
                          className="rounded-md border border-sky-300 bg-white px-3 py-1.5 font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-60 dark:border-sky-800 dark:bg-slate-900 dark:text-sky-100"
                        >
                          {verifyingTx ? 'Vérification...' : 'Vérifier le statut FedaPay'}
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    Tentatives Mobile Money
                  </h3>
                  {paymentRequests.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">
                      Aucune tentative enregistrée.
                    </p>
                  ) : (
                    <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                      {paymentRequests.map((req) => (
                        <li key={req.id} className="py-3 text-sm">
                          <div className="flex items-center justify-between font-medium">
                            <span>
                              {req.planId.toUpperCase()} · {req.amountFcfa.toLocaleString('fr-FR')} FCFA
                            </span>
                            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                              {req.status === 'configuration_required'
                                ? 'Clés marchandes requises'
                                : 'En attente fournisseur'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {req.provider.toUpperCase()} · {req.operator} · {req.phone}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* TAB 5: ADMIN REVENUE & CLIENT MANAGEMENT */}
          {activeTab === 'admin' && isAdmin && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Revenus confirmés (FCFA)
                  </p>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {adminRevenueStats.confirmed.toLocaleString('fr-FR')} FCFA
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Commandes en attente ({adminRevenueStats.pendingCount})
                  </p>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                    {adminRevenueStats.pending.toLocaleString('fr-FR')} FCFA
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Clients inscrits
                  </p>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {allClients.length}
                  </p>
                </div>
              </div>

              {/* Orders Management Table */}
              <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Commandes clients à traiter
                  </h2>
                </div>
                {allOrders.length === 0 ? (
                  <p className="p-6 text-sm text-slate-500">Aucune commande client pour le moment.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                        <tr>
                          <th className="px-5 py-3">Référence</th>
                          <th className="px-5 py-3">Client</th>
                          <th className="px-5 py-3">Prestation</th>
                          <th className="px-5 py-3 text-right">Montant</th>
                          <th className="px-5 py-3">Statut</th>
                          <th className="px-5 py-3 text-right">Action Admin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {allOrders.map((ord) => (
                          <tr key={ord.id}>
                            <td className="px-5 py-3 font-mono text-xs font-semibold">
                              {ord.referenceCode}
                            </td>
                            <td className="px-5 py-3">
                              <p className="font-medium">{ord.ownerName}</p>
                              <p className="text-xs text-slate-500">{ord.ownerEmail} · {ord.contactPhone}</p>
                            </td>
                            <td className="px-5 py-3">
                              <p>{ord.serviceLabel}</p>
                              {ord.projectSlug && (
                                <p className="font-mono text-xs text-slate-500">/s/{ord.projectSlug}/</p>
                              )}
                            </td>
                            <td className="px-5 py-3 text-right font-semibold tabular-nums">
                              {ord.amountFcfa.toLocaleString('fr-FR')} FCFA
                            </td>
                            <td className="px-5 py-3 text-xs font-semibold">
                              {ord.status}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <div className="inline-flex items-center gap-2">
                                {ord.status === 'pending_payment' && (
                                  <button
                                    type="button"
                                    onClick={() => void handleAdminUpdateOrderStatus(ord, 'paid')}
                                    className="rounded bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800"
                                  >
                                    Confirmer paiement
                                  </button>
                                )}
                                {ord.status === 'paid' && (
                                  <button
                                    type="button"
                                    onClick={() => void handleAdminUpdateOrderStatus(ord, 'completed')}
                                    className="rounded bg-sky-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-800"
                                  >
                                    Marquer activée
                                  </button>
                                )}
                                {ord.status !== 'cancelled' && ord.status !== 'completed' && (
                                  <button
                                    type="button"
                                    onClick={() => void handleAdminUpdateOrderStatus(ord, 'cancelled')}
                                    className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                  >
                                    Annuler
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Clients & Plan Upgrade Table */}
              <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Comptes clients &amp; activation d’offres
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                      <tr>
                        <th className="px-5 py-3">Client</th>
                        <th className="px-5 py-3">E-mail</th>
                        <th className="px-5 py-3">Offre active</th>
                        <th className="px-5 py-3 text-right">Changer d’offre</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {allClients.map((client) => (
                        <tr key={client.uid}>
                          <td className="px-5 py-3 font-medium">{client.displayName}</td>
                          <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{client.email}</td>
                          <td className="px-5 py-3 font-semibold uppercase text-xs">{client.plan}</td>
                          <td className="px-5 py-3 text-right">
                            <select
                              aria-label={`Offre de ${client.email}`}
                              value={client.plan}
                              onChange={(e) =>
                                void handleAdminUpdateUserPlan(client, e.target.value as UserPlan)
                              }
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-800"
                            >
                              <option value="free">Gratuit</option>
                              <option value="pro">Pro</option>
                              <option value="enterprise">Entreprise</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* TAB 6: SETTINGS & PWA */}
          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Profil du compte
                </h2>
                <form onSubmit={(e) => void handleSaveProfile(e)} className="mt-4 space-y-4">
                  <div>
                    <label htmlFor="profile-name" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                      Nom affiché
                    </label>
                    <input
                      id="profile-name"
                      type="text"
                      value={displayNameInput}
                      onChange={(e) => setDisplayNameInput(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                      Adresse e-mail vérifiée
                    </label>
                    <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{user.email}</p>
                  </div>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
                  >
                    {savingProfile ? 'Enregistrement...' : 'Enregistrer le profil'}
                  </button>
                </form>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Application WebAPK / PWA prête à partager
                </h2>
                <div className="mt-5 space-y-5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
                    <div>
                      <p className="font-medium">Installation directe (Android / iOS / Bureau)</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        Ajoutez Hébergio comme application WebAPK sans Play Store ni frais.
                      </p>
                    </div>
                    <PWAInstallButton compact />
                  </div>

                  <div className="space-y-3 border-b border-slate-100 pb-4 dark:border-slate-800">
                    <p className="font-medium">Preuves techniques vérifiées en direct</p>
                    <ul className="space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      <li>
                        Manifeste Web App :{' '}
                        <span className={pwaProof.manifestOk ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'font-semibold text-amber-700 dark:text-amber-400'}>
                          {pwaProof.checking
                            ? 'Vérification...'
                            : pwaProof.manifestOk
                            ? `Valide (${pwaProof.display}, ${pwaProof.iconsCount} icônes 192/512px)`
                            : 'Non détecté'}
                        </span>
                      </li>
                      <li>
                        Service Worker (hors-ligne &amp; WebAPK) :{' '}
                        <span className={pwaProof.swActive ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'font-semibold text-amber-700 dark:text-amber-400'}>
                          {pwaProof.checking ? 'Vérification...' : pwaProof.swActive ? 'Actif et enregistré' : 'En attente d’enregistrement'}
                        </span>
                      </li>
                      <li>
                        Origine sécurisée HTTPS :{' '}
                        <span className={pwaProof.httpsOk ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'font-semibold text-amber-700 dark:text-amber-400'}>
                          {pwaProof.httpsOk ? 'Conforme' : 'HTTPS requis'}
                        </span>
                      </li>
                    </ul>

                    {typeof window !== 'undefined' && (() => {
                      const isDevPreview = window.location.hostname.startsWith('ais-dev-');
                      const publicShareUrl = isDevPreview
                        ? window.location.origin.replace('https://ais-dev-', 'https://ais-pre-')
                        : window.location.origin;

                      return (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                            {isDevPreview
                              ? 'Lien public à partager sans Google AI Studio (actif après clic sur Partager / Déployer dans AI Studio) :'
                              : 'Lien public actif de votre application WebAPK à partager :'}
                          </p>
                          <p className="mt-2 break-all font-mono text-xs text-slate-900 dark:text-slate-100">
                            {publicShareUrl}
                          </p>
                          {isDevPreview && (
                            <p className="mt-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                              Vous consultez actuellement l’aperçu privé développeur. Pour que tout le monde puisse ouvrir et installer le lien public ci-dessus sans compte Google AI Studio, cliquez sur « Share / Deploy » en haut de Google AI Studio.
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard?.writeText(publicShareUrl);
                                setCopiedAppLink(true);
                                setTimeout(() => setCopiedAppLink(false), 2500);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
                            >
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{copiedAppLink ? 'Lien copié !' : 'Copier le lien public'}</span>
                            </button>
                            <a
                              href="/manifest.webmanifest"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              <span>Voir /manifest.webmanifest</span>
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            </a>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {isAdmin && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
                      <div className="max-w-md">
                        <p className="font-medium">Pack complet pour votre Cloudflare (.zip)</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">
                          Contient wrangler.toml, cloudflare/worker.ts, le dossier dist/ déjà compilé et le guide CLOUDFLARE_DEPLOY.md.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDownloadCloudflareZip()}
                        disabled={downloadingCfZip}
                        className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-60 whitespace-nowrap"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {downloadingCfZip ? 'Préparation du ZIP...' : 'Télécharger le ZIP Cloudflare'}
                        </span>
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                    <div>
                      <p className="font-medium">Contraste &amp; Thème</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        Basculer entre thème clair et thème sombre.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onToggleDarkMode}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
                    >
                      {darkMode ? 'Thème clair' : 'Thème sombre'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Serveur d’hébergement HTTP</span>
                    <span
                      className={`text-xs font-semibold ${
                        serverHealth === 'ok'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {serverHealth === 'ok' ? 'Opérationnel (HTTP 200)' : 'Vérification...'}
                    </span>
                  </div>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-project-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <h2 id="create-project-title" className="text-lg font-bold text-slate-900 dark:text-white">
                Créer un nouveau projet d’hébergement
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                aria-label="Fermer"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateProject(e)} className="mt-5 space-y-4">
              <div>
                <label htmlFor="new-project-name" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Nom du projet
                </label>
                <input
                  id="new-project-name"
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewName(val);
                    if (!newSlug || newSlug === slugify(newName)) {
                      setNewSlug(slugify(val));
                    }
                  }}
                  placeholder="Ex. Boutique Kofi Cotonou"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div>
                <label htmlFor="new-project-slug" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Slug de l’adresse (/s/slug/)
                </label>
                <input
                  id="new-project-slug"
                  type="text"
                  required
                  value={newSlug}
                  onChange={(e) => setNewSlug(slugify(e.target.value))}
                  placeholder="boutique-kofi"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="new-project-kind" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Type d’hébergement
                  </label>
                  <select
                    id="new-project-kind"
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as ProjectKind)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="site">Site Web statique</option>
                    <option value="webapp">Application Web (SPA)</option>
                    <option value="pwa">Progressive Web App (PWA)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="new-project-template" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Modèle de départ
                  </label>
                  <select
                    id="new-project-template"
                    value={newTemplateId}
                    onChange={(e) => setNewTemplateId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    {STARTER_TEMPLATES.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="new-project-desc" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Description (optionnelle)
                </label>
                <textarea
                  id="new-project-desc"
                  rows={2}
                  maxLength={240}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Brève description publique du site ou de l’application..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creatingProject}
                  className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
                >
                  {creatingProject ? 'Création...' : 'Créer le projet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

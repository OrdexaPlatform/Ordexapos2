/**
 * PWA Service & Installation Manager
 * Handles Service Worker registration, beforeinstallprompt event capture,
 * install prompts, and standalone display mode detection.
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const installListeners: Array<(canInstall: boolean) => void> = [];

export function isPwaStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const isStandaloneDisplay = 
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://') ||
      localStorage.getItem('ordexa_pwa_installed') === 'true';
    return isStandaloneDisplay;
  } catch {
    return false;
  }
}

export function initPwaManager() {
  if (typeof window === 'undefined') return;

  // Listen for beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
    notifyListeners(true);
  });

  // Listen for appinstalled
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    try {
      localStorage.setItem('ordexa_pwa_installed', 'true');
    } catch {}
    notifyListeners(false);
    console.log('[PWA] Application successfully installed.');
  });
}

function notifyListeners(canInstall: boolean) {
  installListeners.forEach((listener) => {
    try {
      listener(canInstall);
    } catch (e) {
      console.error('[PWA] Error notifying listener:', e);
    }
  });
}

export function subscribeToInstallPrompt(callback: (canInstall: boolean) => void): () => void {
  installListeners.push(callback);
  callback(Boolean(deferredInstallPrompt));
  return () => {
    const idx = installListeners.indexOf(callback);
    if (idx !== -1) installListeners.splice(idx, 1);
  };
}

export async function promptPwaInstall(): Promise<'accepted' | 'dismissed' | 'unsupported'> {
  if (!deferredInstallPrompt) {
    return 'unsupported';
  }

  try {
    await deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    notifyListeners(false);
    return choice.outcome;
  } catch (err) {
    console.warn('[PWA] Prompt install error:', err);
    return 'unsupported';
  }
}

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker registered scope:', registration.scope);
      })
      .catch((error) => {
        console.warn('[PWA] Service Worker registration failed:', error);
      });
  });
}

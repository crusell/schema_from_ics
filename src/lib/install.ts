/**
 * When to offer "Installera". Chromium browsers (Android, desktop) fire
 * `beforeinstallprompt` and can show their own install dialog; iOS has no
 * such API, so there we explain "Lägg till på hemskärmen" instead. Nothing is
 * offered when the app already runs installed (standalone).
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode = 'prompt' | 'ios' | null;

export function isStandalone(win: Pick<Window, 'matchMedia'>, nav: Navigator): boolean {
  return win.matchMedia('(display-mode: standalone)').matches || (nav as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone/iPad, including iPadOS which reports itself as a Mac with touch. */
export function isIos(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'>): boolean {
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

export function installMode(o: { standalone: boolean; ios: boolean; hasPrompt: boolean }): InstallMode {
  if (o.standalone) return null;
  if (o.hasPrompt) return 'prompt';
  return o.ios ? 'ios' : null;
}

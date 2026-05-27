"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "nearby-eats:install-dismissed-until";
// Dismiss for 7 days before showing again.
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const until = Number(window.localStorage.getItem(DISMISS_KEY) ?? "0");
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

function dismissForAWhile() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
  } catch {
    // ignore
  }
}

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari sets this non-standard property when launched from home screen.
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    // One-time read of navigator/matchMedia — values are stable for the
    // lifetime of the component, so initializing in an effect is correct.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsIOS(iOS);
    setIsStandalone(standalone);
    setHidden(standalone || isDismissed());

    if (standalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (isStandalone || hidden) return null;
  // Show on iOS (no event available) or once we've captured beforeinstallprompt elsewhere.
  if (!isIOS && !installEvent) return null;

  const handleDismiss = () => {
    dismissForAWhile();
    setHidden(true);
  };

  const handleInstall = async () => {
    if (installEvent) {
      try {
        await installEvent.prompt();
        const choice = await installEvent.userChoice;
        if (choice.outcome === "accepted") {
          setHidden(true);
        } else {
          dismissForAWhile();
          setHidden(true);
        }
      } catch {
        dismissForAWhile();
        setHidden(true);
      }
      setInstallEvent(null);
    } else if (isIOS) {
      setShowIosHelp(true);
    }
  };

  return (
    <div className="bg-blue-50 border-b border-blue-200">
      <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <span className="text-xl shrink-0" aria-hidden>📲</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-blue-900">
            Install Nearby Eats
          </p>
          <p className="text-[11px] sm:text-xs text-blue-800/80">
            Get visit reminders when you sit down at a restaurant.
          </p>
        </div>
        <button
          onClick={handleInstall}
          className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md px-3 py-1.5 transition-colors shrink-0"
        >
          {isIOS ? "How" : "Install"}
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="text-blue-700/60 hover:text-blue-900 shrink-0 px-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {showIosHelp && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowIosHelp(false);
          }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-w-sm w-full mx-0 sm:mx-4 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Add to Home Screen</h2>
            <ol className="space-y-3 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="font-semibold text-blue-600 shrink-0">1.</span>
                <span>
                  Tap the <strong>Share</strong> button{" "}
                  <span aria-label="share" className="inline-block align-text-bottom">⎋</span>{" "}
                  at the bottom of Safari.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-semibold text-blue-600 shrink-0">2.</span>
                <span>
                  Scroll down and choose <strong>Add to Home Screen</strong>{" "}
                  <span aria-label="add" className="inline-block">➕</span>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-semibold text-blue-600 shrink-0">3.</span>
                <span>Tap <strong>Add</strong>. Open Nearby Eats from your home screen to enable notifications.</span>
              </li>
            </ol>
            <p className="mt-4 text-xs text-gray-500">
              Apple requires this step before web apps can send notifications on iPhone.
            </p>
            <button
              onClick={() => setShowIosHelp(false)}
              className="mt-5 w-full text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md py-2"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

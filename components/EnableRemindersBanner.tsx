"use client";

import { useEffect, useState } from "react";
import { usePushSubscription } from "@/hooks/usePushSubscription";

const DISMISS_KEY = "nearby-eats:reminders-dismissed-until";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

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

export default function EnableRemindersBanner() {
  const { status, enable } = usePushSubscription();
  const [hidden, setHidden] = useState(true);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window));
    setHidden(isDismissed());
  }, []);

  if (hidden) return null;
  if (status === "unknown" || status === "subscribed" || status === "unsupported" || status === "denied") {
    return null;
  }
  // On iOS, only useful once installed to home screen. Hide otherwise — the install banner handles that case.
  if (isIOS && !isStandalone) return null;

  const handleEnable = async () => {
    setWorking(true);
    try {
      await enable();
    } finally {
      setWorking(false);
      setHidden(true);
    }
  };

  const handleDismiss = () => {
    dismissForAWhile();
    setHidden(true);
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <span className="text-xl shrink-0" aria-hidden>🔔</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-amber-900">
            Enable visit reminders
          </p>
          <p className="text-[11px] sm:text-xs text-amber-800/80">
            We&apos;ll nudge you after 10 minutes at a new restaurant.
          </p>
        </div>
        <button
          onClick={handleEnable}
          disabled={working}
          className="text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 rounded-md px-3 py-1.5 transition-colors shrink-0"
        >
          {working ? "…" : "Enable"}
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="text-amber-700/60 hover:text-amber-900 shrink-0 px-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

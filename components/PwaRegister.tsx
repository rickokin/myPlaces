"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on mount. Kept silent on failure — push
 * features simply won't work, but the rest of the app is unaffected.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
      } catch (err) {
        console.warn("[PwaRegister] Service worker registration failed", err);
      }
    };

    register();
  }, []);

  return null;
}

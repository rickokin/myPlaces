"use client";

import { useState } from "react";
import type { PushStatus } from "@/lib/push-client";

type Props = {
  onClose: () => void;
  pushStatus: PushStatus | "unknown";
  stationaryRemindersEnabled: boolean;
  onStationaryRemindersChange: (enabled: boolean) => void;
};

export default function SettingsModal({
  onClose,
  pushStatus,
  stationaryRemindersEnabled,
  onStationaryRemindersChange,
}: Props) {
  // We let the user toggle the *preference* regardless of push state — the
  // reminder hook independently gates on a live push subscription. When push
  // is detected as not ready we show a passive hint instead of disabling the
  // control, since browser/PWA quirks can sometimes report a stale state.
  const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const handleSendTest = async () => {
    setTestState("sending");
    setTestMessage(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        delivered?: number;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setTestState("sent");
      setTestMessage(
        typeof data.delivered === "number"
          ? `Sent to ${data.delivered} device${data.delivered === 1 ? "" : "s"}.`
          : "Sent."
      );
    } catch (err) {
      setTestState("error");
      setTestMessage(err instanceof Error ? err.message : "Failed to send test notification.");
    }
  };

  const pushWarning =
    pushStatus === "denied"
      ? "Notifications are blocked in your browser. Allow them in browser settings to receive these reminders."
      : pushStatus === "unsupported"
        ? "This browser doesn't support push notifications, so reminders can't be delivered here."
        : pushStatus === "unprompted"
          ? "Enable notifications (from the banner at the top) to actually receive these reminders."
          : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <section className="border-t border-gray-100 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
            Notifications
          </h3>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={stationaryRemindersEnabled}
              onChange={(e) => onStationaryRemindersChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">
                Notify me when I&apos;ve been in one place for 2 minutes
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                In addition to the existing restaurant reminders, get nudged
                anywhere you stay put for 2+ minutes.
              </p>
              {pushWarning && (
                <p className="text-xs text-amber-700 mt-1.5">{pushWarning}</p>
              )}
            </div>
          </label>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">Send Test</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Fire a test push to this account for debugging.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSendTest}
                disabled={testState === "sending"}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed border border-blue-200 hover:border-blue-300 disabled:border-gray-200 rounded-md px-3 py-1.5 transition-colors"
              >
                {testState === "sending" ? "Sending..." : "Send Test"}
              </button>
            </div>
            {testMessage && (
              <p
                className={`text-xs mt-2 ${
                  testState === "error" ? "text-red-600" : "text-gray-600"
                }`}
              >
                {testMessage}
              </p>
            )}
          </div>
        </section>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md px-4 py-2 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getPushStatus,
  enablePush,
  disablePush,
  PUSH_STATUS_EVENT,
  type PushStatus,
} from "@/lib/push-client";

export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus | "unknown">("unknown");

  const refresh = useCallback(async () => {
    const s = await getPushStatus();
    setStatus(s);
  }, []);

  useEffect(() => {
    // Effect kicks off an async refresh that reads the SW registration —
    // setStatus happens after an await, so it is not synchronous in the
    // effect body. The rule still flags the call site; silence it here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // Stay in sync with other components: when push is enabled/disabled
    // anywhere on the page, re-read the underlying state.
    if (typeof window === "undefined") return;
    const onChanged = () => {
      refresh();
    };
    window.addEventListener(PUSH_STATUS_EVENT, onChanged);
    return () => window.removeEventListener(PUSH_STATUS_EVENT, onChanged);
  }, [refresh]);

  const enable = useCallback(async () => {
    const result = await enablePush();
    setStatus(result);
    return result;
  }, []);

  const disable = useCallback(async () => {
    await disablePush();
    await refresh();
  }, [refresh]);

  return { status, enable, disable, refresh };
}

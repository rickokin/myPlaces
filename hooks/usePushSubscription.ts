"use client";

import { useCallback, useEffect, useState } from "react";
import { getPushStatus, enablePush, disablePush, type PushStatus } from "@/lib/push-client";

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

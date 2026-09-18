"use client";

import { useEffect, useState } from "react";

/** Whether this deployment can check event results automatically. */
export function useResolverAvailable() {
  const [available, setAvailable] = useState<boolean>();
  useEffect(() => {
    let cancelled = false;
    fetch("/api/resolve")
      .then((r) => r.json())
      .then((b) => !cancelled && setAvailable(!!b.available))
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
}

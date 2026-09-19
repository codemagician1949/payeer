"use client";

import { useEffect, useState } from "react";

/** Which sign-in methods this deployment's Reown project actually offers. */
export function useSignInOptions() {
  const [options, setOptions] = useState<{ email: boolean; socials: boolean }>();
  useEffect(() => {
    let cancelled = false;
    fetch("/api/signin-options")
      .then((r) => r.json())
      .then((o) => !cancelled && setOptions(o))
      .catch(() => !cancelled && setOptions({ email: false, socials: false }));
    return () => {
      cancelled = true;
    };
  }, []);
  return options;
}

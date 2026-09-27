"use client";

import { useEffect } from "react";
import { withBasePath } from "@/lib/base-path";

/**
 * Регистрация service worker'а PWA. Только в production — в dev
 * закешированные ответы мешают hot reload'у.
 */
export default function SwRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker
        .register(withBasePath("/sw.js"))
        .catch((err) => {
          console.error("SW registration failed:", err);
        });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}

"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { LANGS, translate, type Lang, type TKey } from "@/lib/i18n";

type Theme = "light" | "dark";
type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: TKey, v?: Record<string, string | number>) => string;
  theme: Theme;
  toggleTheme: () => void;
};

const AppCtx = createContext<Ctx | null>(null);

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

export function readLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* xususiy rejimda localStorage bo'lmasligi mumkin */
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("uz");
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    try {
      const l = localStorage.getItem("nf_lang") as Lang | null;
      if (l && LANGS.includes(l)) setLangState(l);
    } catch {}
    const attr = document.documentElement.dataset.theme;
    if (attr === "dark" || attr === "light") setTheme(attr);
    else setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.documentElement.lang = l;
    try {
      localStorage.setItem("nf_lang", l);
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem("nf_theme", next);
      } catch {}
      return next;
    });
  }, []);

  const t = useCallback((k: TKey, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);

  return <AppCtx.Provider value={{ lang, setLang, t, theme, toggleTheme }}>{children}</AppCtx.Provider>;
}

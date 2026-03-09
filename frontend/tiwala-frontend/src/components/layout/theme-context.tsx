"use client";

import { createContext, useContext, type ReactNode } from "react";

export type AppTheme = "light" | "dark";

type AppThemeContextValue = {
  theme: AppTheme;
  isDarkTheme: boolean;
  setTheme: (nextTheme: AppTheme) => void;
  toggleTheme: () => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

type AppThemeProviderProps = {
  value: AppThemeContextValue;
  children: ReactNode;
};

export function AppThemeProvider({ value, children }: AppThemeProviderProps) {
  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used within AppThemeProvider.");
  }
  return context;
}

"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ nonce, children }: { nonce?: string; children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
      {children}
    </NextThemesProvider>
  );
}

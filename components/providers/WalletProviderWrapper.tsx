"use client";

import { WalletProvider } from "@/contexts/WalletContext";

export function WalletProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WalletProvider>{children}</WalletProvider>;
}

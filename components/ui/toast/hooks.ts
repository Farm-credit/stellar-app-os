"use client";

import { createContext, useContext } from "react";
import { ToastData } from "./types";

export const ToastContext = createContext<{
  addToast: (data: Omit<ToastData, "id">) => void;
  removeToast: (id: string) => void;
} | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx;
};
"use client";

import { useState, useCallback } from "react";
import { ToastData, ToastPosition } from "./types";
import { ToastContext } from "./hooks";
import { ToastContainer } from "./toast-container";

export function ToastProvider({
  children,
  position = "top-right",
}: {
  children: React.ReactNode;
  position?: ToastPosition;
}) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((toast: Omit<ToastData, "id">) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, ...toast }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}

      <ToastContainer
        toasts={toasts}
        remove={removeToast}
        position={position}
      />
    </ToastContext.Provider>
  );
}
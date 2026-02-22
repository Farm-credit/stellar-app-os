import { useEffect } from "react";
import { ToastData } from "./types";

interface Props extends ToastData {
  remove: (id: string) => void;
}

const variantClasses = {
  success: "bg-green-600 text-white",
  error: "bg-red-600 text-white",
  warning: "bg-yellow-500 text-black",
  info: "bg-blue-600 text-white",
};

export function Toast({ id, message, variant, duration, remove }: Props) {
  useEffect(() => {
    const timer = setTimeout(() => remove(id), duration ?? 4000);
    return () => clearTimeout(timer);
  }, [id, duration, remove]);

  return (
    <div
      className={`rounded-md shadow-lg px-4 py-3 flex items-start gap-3 w-full max-w-sm transition-all duration-300 ${variantClasses[variant]}`}
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
    >
      <p className="flex-1">{message}</p>

      <button
        onClick={() => remove(id)}
        aria-label="Dismiss notification"
        className="text-white/80 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
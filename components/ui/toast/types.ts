export type ToastVariant = "success" | "error" | "warning" | "info";

export type ToastPosition =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left";

export interface ToastData {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}
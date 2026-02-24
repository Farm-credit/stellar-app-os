import { Toast } from "./toast";
import { ToastData, ToastPosition } from "./types";

interface Props {
  toasts: ToastData[];
  remove: (id: string) => void;
  position: ToastPosition;
}

export function ToastContainer({ toasts, remove, position }: Props) {
  const pos = {
    "top-right": "top-4 right-4",
    "top-left": "top-4 left-4",
    "bottom-right": "bottom-4 right-4",
    "bottom-left": "bottom-4 left-4",
  }[position];

  return (
    <div className={`fixed z-50 ${pos} space-y-3`}>
      {toasts.map((t) => (
        <Toast key={t.id} {...t} remove={remove} />
      ))}
    </div>
  );
}
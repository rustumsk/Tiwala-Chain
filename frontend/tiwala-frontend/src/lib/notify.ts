import { toast } from "sonner";

export function notifyError(message: string) {
  toast.error(message);
}

export function notifySuccess(message: string) {
  toast.success(message);
}

export function notifyInfo(message: string) {
  toast(message);
}


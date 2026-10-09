import { toast } from "sonner";

export const ORDER_DELIVERED_EVENT = "pop9:order-delivered";
const pending = new Map<string, symbol>();
export const readyNotificationId = (orderId: string) => `order-ready:${orderId}`;
export const beginReadyNotification = (orderId: string) => {
  const token = Symbol(orderId);
  pending.set(orderId, token);
  return token;
};
export const isCurrentReadyNotification = (orderId: string, token: symbol) => pending.get(orderId) === token;
export const dismissReadyNotification = (orderId: string) => {
  pending.delete(orderId);
  toast.dismiss(readyNotificationId(orderId));
};

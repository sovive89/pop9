export interface CheckoutClient {
  id: string;
  name: string;
  phone: string | null;
  consumed: number;
  service: number;
  paid: number;
  paidService: number;
  remaining: number;
}
export interface CheckoutSnapshot {
  totalConsumed: number;
  totalService: number;
  totalPaid: number;
  remaining: number;
  openOrders: number;
  clients: CheckoutClient[];
}

export enum OrderStatus {
  PendingPayment = "PENDING_PAYMENT",
  Paid = "PAID",
  Closed = "CLOSED"
}

export const orderStatuses = Object.values(OrderStatus);

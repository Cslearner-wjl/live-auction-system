import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AuctionStatus as PrismaAuctionStatus,
  BidStatus as PrismaBidStatus,
  OrderStatus as PrismaOrderStatus,
  type Bid,
  type Order
} from "@prisma/client";
import { AuctionErrorCode, OrderStatus } from "@live-auction/shared";
import { ApiException } from "../common/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { UserOrdersService } from "./user-orders.service";

class FakeUserOrderPrisma {
  readonly now = new Date("2026-05-31T12:00:00.000Z");
  readonly orders = new Map<string, Order>();
  readonly bids: Array<
    Bid & {
      auction: {
        id: string;
        item: { name: string };
        order: { id: string; status: PrismaOrderStatus } | null;
        status: PrismaAuctionStatus;
        currentPriceFen: number;
        highestBidderId: string | null;
        endTime: Date | null;
      };
    }
  > = [];

  readonly bid = {
    findMany: async ({ where }: { where: { userId: string; status: PrismaBidStatus } }) =>
      this.bids.filter((bid) => bid.userId === where.userId && bid.status === where.status)
  };

  readonly order = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const order = this.orders.get(where.id);

      if (!order) {
        return null;
      }

      return {
        ...order,
        item: {
          name: "成交商品",
          imageUrl: "https://example.com/item.png"
        },
        auction: {
          status: PrismaAuctionStatus.ENDED_SOLD
        }
      };
    },
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const order = this.orders.get(where.id);

      if (!order) {
        throw new Error(`Order ${where.id} not found`);
      }

      return order;
    },
    updateMany: async ({
      where,
      data
    }: {
      where: { id: string; status?: PrismaOrderStatus };
      data: Partial<Order>;
    }) => {
      const order = this.orders.get(where.id);

      if (!order) {
        return { count: 0 };
      }

      if (where.status && order.status !== where.status) {
        return { count: 0 };
      }

      const updated = {
        ...order,
        ...data,
        updatedAt: this.now
      };
      this.orders.set(where.id, updated);
      return { count: 1 };
    }
  };

  async $transaction<T>(operation: (tx: this) => Promise<T>): Promise<T> {
    return operation(this);
  }
}

describe("UserOrdersService", () => {
  it("lists current user auction history grouped by auction", async () => {
    const { prisma, service } = makeUserOrdersService();
    prisma.bids.push(
      makeBid("bid_1", "auction_1", "user_1", 1000),
      makeBid("bid_2", "auction_1", "user_1", 2000),
      makeBid("bid_3", "auction_2", "user_2", 3000)
    );

    const history = await service.listAuctionHistory("user_1", {
      page: "1",
      pageSize: "20"
    });

    assert.equal(history.page.total, 1);
    assert.equal(history.items[0]?.auctionId, "auction_1");
    assert.equal(history.items[0]?.orderId, "order_1");
    assert.equal(history.items[0]?.orderStatus, OrderStatus.PendingPayment);
    assert.equal(history.items[0]?.myHighestBidFen, 2000);
    assert.equal(history.items[0]?.won, true);
  });

  it("allows only the buyer to view and mock-pay an order once", async () => {
    const { prisma, service } = makeUserOrdersService();
    prisma.orders.set("order_1", makeOrder("order_1", "user_1"));

    const order = await service.getOrder("order_1", "user_1");
    assert.equal(order.id, "order_1");
    assert.equal(order.status, OrderStatus.PendingPayment);

    await assert.rejects(
      () => service.getOrder("order_1", "user_2"),
      (error: unknown) =>
        error instanceof ApiException &&
        getApiErrorCode(error) === AuctionErrorCode.Forbidden
    );

    const paid = await service.mockPay("order_1", "user_1");
    assert.equal(paid.status, OrderStatus.Paid);
    assert.equal(prisma.orders.get("order_1")?.status, PrismaOrderStatus.PAID);

    await assert.rejects(
      () => service.mockPay("order_1", "user_1"),
      (error: unknown) =>
        error instanceof ApiException &&
        getApiErrorCode(error) === AuctionErrorCode.OrderAlreadyPaid
    );
  });
});

function makeUserOrdersService() {
  const prisma = new FakeUserOrderPrisma();
  const service = new UserOrdersService(prisma as unknown as PrismaService);
  return { prisma, service };
}

function makeBid(
  id: string,
  auctionId: string,
  userId: string,
  amountFen: number
): FakeUserOrderPrisma["bids"][number] {
  const now = new Date("2026-05-31T12:00:00.000Z");

  return {
    id,
    auctionId,
    userId,
    amountFen,
    clientBidId: id,
    serverSeq: Number(id.replace(/\D/g, "")),
    status: PrismaBidStatus.ACCEPTED,
    rejectReason: null,
    createdAt: now,
      auction: {
        id: auctionId,
        item: {
          name: `商品 ${auctionId}`
        },
        order:
          auctionId === "auction_1"
            ? {
                id: "order_1",
                status: PrismaOrderStatus.PENDING_PAYMENT
              }
            : null,
        status: PrismaAuctionStatus.ENDED_SOLD,
        currentPriceFen: 2000,
      highestBidderId: "user_1",
      endTime: now
    }
  };
}

function makeOrder(id: string, buyerId: string): Order {
  const now = new Date("2026-05-31T12:00:00.000Z");

  return {
    id,
    auctionId: "auction_1",
    itemId: "item_1",
    buyerId,
    amountFen: 2000,
    status: PrismaOrderStatus.PENDING_PAYMENT,
    paidAt: null,
    createdAt: now,
    updatedAt: now
  };
}

function getApiErrorCode(error: ApiException): unknown {
  const response = error.getResponse();

  return typeof response === "object" && response !== null && "code" in response
    ? response.code
    : undefined;
}

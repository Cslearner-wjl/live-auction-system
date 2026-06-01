import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  AuctionStatus as PrismaAuctionStatus,
  BidStatus as PrismaBidStatus,
  OrderStatus as PrismaOrderStatus,
  type AuctionItem,
  type AuctionSession,
  type Bid,
  type Order
} from "@prisma/client";
import { AuctionErrorCode, AuctionStatus, OrderStatus } from "@live-auction/shared";
import { ApiException, conflict, notFound } from "../common/api-error";
import {
  type PageMeta,
  type PaginationInput,
  parsePagination,
  toPageMeta
} from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";

export interface UserAuctionHistoryItemDto {
  auctionId: string;
  orderId: string | null;
  orderStatus: OrderStatus | null;
  itemName: string;
  myHighestBidFen: number;
  finalPriceFen: number | null;
  status: AuctionStatus;
  won: boolean;
  endedAt: string | null;
}

export interface UserAuctionHistoryDto {
  items: UserAuctionHistoryItemDto[];
  page: PageMeta;
}

export interface UserOrderDto {
  id: string;
  auctionId: string;
  itemId: string;
  buyerId: string;
  amountFen: number;
  status: OrderStatus;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  itemName?: string;
  itemImageUrl?: string;
  auctionStatus?: AuctionStatus;
}

export interface MockPayResultDto {
  orderId: string;
  status: OrderStatus.Paid;
  paidAt: string;
}

type BidWithAuction = Bid & {
  auction: AuctionSession & {
    item: Pick<AuctionItem, "name">;
    order: Pick<Order, "id" | "status"> | null;
  };
};

type OrderWithRelations = Order & {
  item?: Pick<AuctionItem, "name" | "imageUrl">;
  auction?: Pick<AuctionSession, "status">;
};

@Injectable()
export class UserOrdersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listAuctionHistory(
    userId: string,
    query: PaginationInput
  ): Promise<UserAuctionHistoryDto> {
    const pagination = parsePagination(query);
    const bids = await this.prisma.bid.findMany({
      where: {
        userId,
        status: PrismaBidStatus.ACCEPTED
      },
      include: {
        auction: {
          include: {
            item: {
              select: {
                name: true
              }
            },
            order: {
              select: {
                id: true,
                status: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    const items = toAuctionHistoryItems(userId, bids);
    const pageItems = items.slice(pagination.skip, pagination.skip + pagination.take);

    return {
      items: pageItems,
      page: toPageMeta(pagination, items.length)
    };
  }

  async getOrder(orderId: string, userId: string): Promise<UserOrderDto> {
    const order = await this.findOrder(orderId);
    assertOrderBuyer(order, userId);
    return toUserOrderDto(order);
  }

  async mockPay(orderId: string, userId: string): Promise<MockPayResultDto> {
    const paidAt = new Date();

    const paidOrder = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId }
      });

      if (!order) {
        throw notFound(AuctionErrorCode.OrderNotFound, "订单不存在", { orderId });
      }

      assertOrderBuyer(order, userId);

      if (order.status !== PrismaOrderStatus.PENDING_PAYMENT) {
        throw conflict(AuctionErrorCode.OrderAlreadyPaid, "订单不可重复支付", {
          orderId,
          status: order.status,
          paidAt: order.paidAt?.toISOString() ?? null
        });
      }

      const updated = await tx.order.updateMany({
        where: {
          id: orderId,
          status: PrismaOrderStatus.PENDING_PAYMENT
        },
        data: {
          status: PrismaOrderStatus.PAID,
          paidAt
        }
      });

      if (updated.count !== 1) {
        throw conflict(AuctionErrorCode.OrderAlreadyPaid, "订单不可重复支付", {
          orderId,
          status: order.status,
          paidAt: order.paidAt?.toISOString() ?? null
        });
      }

      return tx.order.findUniqueOrThrow({
        where: { id: orderId }
      });
    });

    return {
      orderId: paidOrder.id,
      status: OrderStatus.Paid,
      paidAt: paidOrder.paidAt?.toISOString() ?? paidAt.toISOString()
    };
  }

  private async findOrder(orderId: string): Promise<OrderWithRelations> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        item: {
          select: {
            name: true,
            imageUrl: true
          }
        },
        auction: {
          select: {
            status: true
          }
        }
      }
    });

    if (!order) {
      throw notFound(AuctionErrorCode.OrderNotFound, "订单不存在", { orderId });
    }

    return order;
  }
}

function toAuctionHistoryItems(
  userId: string,
  bids: BidWithAuction[]
): UserAuctionHistoryItemDto[] {
  const byAuction = new Map<string, UserAuctionHistoryItemDto>();

  for (const bid of bids) {
    const auction = bid.auction;
    const existing = byAuction.get(auction.id);
    const myHighestBidFen = Math.max(existing?.myHighestBidFen ?? 0, bid.amountFen);

    byAuction.set(auction.id, {
      auctionId: auction.id,
      orderId: auction.order?.id ?? null,
      orderStatus: auction.order?.status
        ? (auction.order.status as OrderStatus)
        : null,
      itemName: auction.item.name,
      myHighestBidFen,
      finalPriceFen:
        auction.status === PrismaAuctionStatus.ENDED_SOLD
          ? auction.currentPriceFen
          : null,
      status: auction.status as AuctionStatus,
      won:
        auction.status === PrismaAuctionStatus.ENDED_SOLD &&
        auction.highestBidderId === userId,
      endedAt: auction.endTime?.toISOString() ?? null
    });
  }

  return [...byAuction.values()];
}

function assertOrderBuyer(order: Pick<Order, "id" | "buyerId">, userId: string): void {
  if (order.buyerId !== userId) {
    throw new ApiException(HttpStatus.FORBIDDEN, AuctionErrorCode.Forbidden, "无权访问该订单", {
      orderId: order.id
    });
  }
}

function toUserOrderDto(order: OrderWithRelations): UserOrderDto {
  return {
    id: order.id,
    auctionId: order.auctionId,
    itemId: order.itemId,
    buyerId: order.buyerId,
    amountFen: order.amountFen,
    status: order.status as OrderStatus,
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    itemName: order.item?.name,
    itemImageUrl: order.item?.imageUrl,
    auctionStatus: order.auction?.status as AuctionStatus | undefined
  };
}

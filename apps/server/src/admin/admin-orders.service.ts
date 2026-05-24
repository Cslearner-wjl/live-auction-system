import { Inject, Injectable } from "@nestjs/common";
import { OrderStatus as PrismaOrderStatus, type Order } from "@prisma/client";
import { AuctionErrorCode, OrderStatus, orderStatuses } from "@live-auction/shared";
import { notFound, validationFailed } from "../common/api-error";
import {
  type PageMeta,
  type PaginationInput,
  parsePagination,
  toPageMeta
} from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";

export interface OrderDto {
  id: string;
  auctionId: string;
  itemId: string;
  buyerId: string;
  amountFen: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrderListDto {
  items: OrderDto[];
  page: PageMeta;
}

@Injectable()
export class AdminOrdersService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService
  ) {}

  async listOrders(query: PaginationInput & { status?: unknown }): Promise<OrderListDto> {
    const pagination = parsePagination(query);
    const status = parseOrderStatusFilter(query.status);
    const where = status ? { status: status as PrismaOrderStatus } : {};

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.order.count({ where })
    ]);

    return {
      items: orders.map(toOrderDto),
      page: toPageMeta(pagination, total)
    };
  }

  async getOrder(orderId: string): Promise<OrderDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw notFound(AuctionErrorCode.OrderNotFound, "订单不存在", { orderId });
    }

    return toOrderDto(order);
  }
}

export function parseOrderStatusFilter(value: unknown): OrderStatus | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string" || !orderStatuses.includes(value as OrderStatus)) {
    throw validationFailed("status", "订单状态不合法", {
      allowed: orderStatuses
    });
  }

  return value as OrderStatus;
}

function toOrderDto(order: Order): OrderDto {
  return {
    id: order.id,
    auctionId: order.auctionId,
    itemId: order.itemId,
    buyerId: order.buyerId,
    amountFen: order.amountFen,
    status: order.status as OrderStatus,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString()
  };
}

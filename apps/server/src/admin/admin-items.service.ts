import { Inject, Injectable } from "@nestjs/common";
import type { AuctionItem } from "@prisma/client";
import { AuctionErrorCode } from "@live-auction/shared";
import { notFound } from "../common/api-error";
import {
  type PageMeta,
  type PaginationInput,
  parsePagination,
  toPageMeta
} from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import {
  type ItemPatch,
  type ItemPayload,
  type ItemValues,
  parseCreateItem,
  parsePatchItem
} from "./item.validation";

export interface ItemDto {
  id: string;
  name: string;
  imageUrl: string;
  description: string;
  sellingPoints: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ItemListDto {
  items: ItemDto[];
  page: PageMeta;
}

@Injectable()
export class AdminItemsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createItem(payload: ItemPayload, createdById: string): Promise<ItemDto> {
    const values = parseCreateItem(payload);
    const item = await this.prisma.auctionItem.create({
      data: {
        ...values,
        createdById
      }
    });

    return toItemDto(item);
  }

  async listItems(query: PaginationInput): Promise<ItemListDto> {
    const pagination = parsePagination(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auctionItem.findMany({
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.auctionItem.count()
    ]);

    return {
      items: items.map(toItemDto),
      page: toPageMeta(pagination, total)
    };
  }

  async getItem(itemId: string): Promise<ItemDto> {
    const item = await this.prisma.auctionItem.findUnique({
      where: { id: itemId }
    });

    if (!item) {
      throw notFound(AuctionErrorCode.ItemNotFound, "商品不存在", { itemId });
    }

    return toItemDto(item);
  }

  async updateItem(itemId: string, payload: ItemPayload): Promise<ItemDto> {
    const patch = parsePatchItem(payload);
    const existing = await this.prisma.auctionItem.findUnique({
      where: { id: itemId }
    });

    if (!existing) {
      throw notFound(AuctionErrorCode.ItemNotFound, "商品不存在", { itemId });
    }

    const item = await this.prisma.auctionItem.update({
      where: { id: itemId },
      data: toItemUpdateData(patch)
    });

    return toItemDto(item);
  }
}

export function toItemDto(item: AuctionItem): ItemDto {
  return {
    id: item.id,
    name: item.name,
    imageUrl: item.imageUrl,
    description: item.description,
    sellingPoints: normalizeSellingPoints(item.sellingPoints),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function toItemUpdateData(patch: ItemPatch): ItemPatch {
  return patch;
}

function normalizeSellingPoints(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((point): point is string => typeof point === "string");
}

import { Inject, Injectable } from "@nestjs/common";
import {
  AuctionStatus as PrismaAuctionStatus,
  type AuctionItem,
  type AuctionRule,
  type AuctionSession
} from "@prisma/client";
import { AuctionErrorCode, AuctionStatus } from "@live-auction/shared";
import {
  type AuctionRulePayload,
  type AuctionRuleValues,
  assertAuctionRuleEditable,
  parsePatchAuctionRule
} from "../auction/auction-rule.validation";
import { AuctionSchedulerService } from "../auction/auction-scheduler.service";
import { AuctionStateMachineService } from "../auction/auction-state-machine.service";
import { notFound } from "../common/api-error";
import {
  type PageMeta,
  type PaginationInput,
  parsePagination,
  toPageMeta
} from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import {
  type CancelAuctionPayload,
  type CreateAuctionPayload,
  parseAuctionStatusFilter,
  parseCancelAuction,
  parseCreateAuction
} from "./auction.validation";

type AuctionWithRelations = AuctionSession & {
  item?: AuctionItem;
  rule?: AuctionRule;
};

export interface AuctionRuleDto {
  startPriceFen: number;
  incrementFen: number;
  durationSeconds: number;
  capPriceFen: number;
  antiSnipingWindowSeconds: number;
  extensionSeconds: number;
  maxExtensionCount: number;
}

export interface AuctionItemSummaryDto {
  id: string;
  name: string;
  imageUrl: string;
}

export interface AuctionDto {
  id: string;
  roomId: string;
  itemId: string;
  status: AuctionStatus;
  startPriceFen: number;
  currentPriceFen: number;
  incrementFen: number;
  capPriceFen: number;
  startTime: string | null;
  endTime: string | null;
  extendedCount: number;
  highestBidderId: string | null;
  bidCount: number;
  version: number;
  item?: AuctionItemSummaryDto;
  rule?: AuctionRuleDto;
}

export interface AuctionListItemDto extends Omit<AuctionDto, "item" | "rule"> {
  itemName: string;
  itemImageUrl: string;
}

export interface AuctionListDto {
  items: AuctionListItemDto[];
  page: PageMeta;
}

export interface CancelAuctionDto {
  auctionId: string;
  status: AuctionStatus.Cancelled;
  reason: string;
  cancelledAt: string;
}

@Injectable()
export class AdminAuctionsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(AuctionStateMachineService)
    private readonly stateMachine: AuctionStateMachineService,
    @Inject(AuctionSchedulerService)
    private readonly scheduler: AuctionSchedulerService
  ) {}

  async createAuction(payload: CreateAuctionPayload): Promise<AuctionDto> {
    const values = parseCreateAuction(payload);
    await this.ensureRoomExists(values.roomId);
    await this.ensureItemExists(values.itemId);

    const auction = await this.prisma.$transaction(async (tx) => {
      const rule = await tx.auctionRule.create({
        data: values.rule
      });

      return tx.auctionSession.create({
        data: {
          roomId: values.roomId,
          itemId: values.itemId,
          ruleId: rule.id,
          status: PrismaAuctionStatus.SCHEDULED,
          startPriceFen: values.rule.startPriceFen,
          currentPriceFen: values.rule.startPriceFen,
          incrementFen: values.rule.incrementFen,
          capPriceFen: values.rule.capPriceFen
        },
        include: {
          item: true,
          rule: true
        }
      });
    });

    return toAuctionDto(auction);
  }

  async listAuctions(query: PaginationInput & { status?: unknown }): Promise<AuctionListDto> {
    const pagination = parsePagination(query);
    const status = parseAuctionStatusFilter(query.status);
    const where = status ? { status: status as PrismaAuctionStatus } : {};

    const [auctions, total] = await this.prisma.$transaction([
      this.prisma.auctionSession.findMany({
        where,
        include: { item: true },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.auctionSession.count({ where })
    ]);

    return {
      items: auctions.map(toAuctionListItemDto),
      page: toPageMeta(pagination, total)
    };
  }

  async getAuction(auctionId: string): Promise<AuctionDto> {
    const auction = await this.findAuctionWithRelations(auctionId);
    return toAuctionDto(auction);
  }

  async updateRules(auctionId: string, payload: AuctionRulePayload): Promise<AuctionDto> {
    const auction = await this.findAuctionWithRelations(auctionId);
    assertAuctionRuleEditable(auction.status as AuctionStatus, auctionId);

    if (!auction.rule) {
      throw notFound(AuctionErrorCode.AuctionNotFound, "竞拍规则不存在", { auctionId });
    }

    const patch = parsePatchAuctionRule(payload, toRuleValues(auction.rule));
    const auctionPatch: Partial<Pick<AuctionSession, "startPriceFen" | "currentPriceFen" | "incrementFen" | "capPriceFen">> = {};

    if (patch.startPriceFen !== undefined) {
      auctionPatch.startPriceFen = patch.startPriceFen;
      auctionPatch.currentPriceFen = patch.startPriceFen;
    }

    if (patch.incrementFen !== undefined) {
      auctionPatch.incrementFen = patch.incrementFen;
    }

    if (patch.capPriceFen !== undefined) {
      auctionPatch.capPriceFen = patch.capPriceFen;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.auctionRule.update({
        where: { id: auction.rule?.id },
        data: patch
      });

      return tx.auctionSession.update({
        where: { id: auctionId },
        data: {
          ...auctionPatch,
          version: {
            increment: 1
          }
        },
        include: {
          item: true,
          rule: true
        }
      });
    });

    return toAuctionDto(updated);
  }

  async startAuction(auctionId: string): Promise<AuctionDto> {
    const auction = await this.stateMachine.startAuction(auctionId);
    this.scheduler.scheduleEndTimer(auction);
    return this.getAuction(auctionId);
  }

  async cancelAuction(
    auctionId: string,
    payload: CancelAuctionPayload
  ): Promise<CancelAuctionDto> {
    const reason = parseCancelAuction(payload);
    await this.stateMachine.cancelAuction(auctionId);
    this.scheduler.clearEndTimer(auctionId);

    return {
      auctionId,
      status: AuctionStatus.Cancelled,
      reason,
      cancelledAt: new Date().toISOString()
    };
  }

  private async ensureRoomExists(roomId: string): Promise<void> {
    const room = await this.prisma.liveRoom.findUnique({
      where: { id: roomId },
      select: { id: true }
    });

    if (!room) {
      throw notFound(AuctionErrorCode.RoomNotFound, "直播间不存在", { roomId });
    }
  }

  private async ensureItemExists(itemId: string): Promise<void> {
    const item = await this.prisma.auctionItem.findUnique({
      where: { id: itemId },
      select: { id: true }
    });

    if (!item) {
      throw notFound(AuctionErrorCode.ItemNotFound, "商品不存在", { itemId });
    }
  }

  private async findAuctionWithRelations(auctionId: string): Promise<AuctionWithRelations> {
    const auction = await this.prisma.auctionSession.findUnique({
      where: { id: auctionId },
      include: {
        item: true,
        rule: true
      }
    });

    if (!auction) {
      throw notFound(AuctionErrorCode.AuctionNotFound, "竞拍不存在", { auctionId });
    }

    return auction;
  }
}

export function toAuctionDto(auction: AuctionWithRelations): AuctionDto {
  return {
    id: auction.id,
    roomId: auction.roomId,
    itemId: auction.itemId,
    status: auction.status as AuctionStatus,
    startPriceFen: auction.startPriceFen,
    currentPriceFen: auction.currentPriceFen,
    incrementFen: auction.incrementFen,
    capPriceFen: auction.capPriceFen,
    startTime: auction.startTime?.toISOString() ?? null,
    endTime: auction.endTime?.toISOString() ?? null,
    extendedCount: auction.extendedCount,
    highestBidderId: auction.highestBidderId,
    bidCount: auction.bidCount,
    version: auction.version,
    item: auction.item
      ? {
          id: auction.item.id,
          name: auction.item.name,
          imageUrl: auction.item.imageUrl
        }
      : undefined,
    rule: auction.rule ? toRuleDto(auction.rule) : undefined
  };
}

function toAuctionListItemDto(auction: AuctionSession & { item: AuctionItem }): AuctionListItemDto {
  return {
    id: auction.id,
    roomId: auction.roomId,
    itemId: auction.itemId,
    itemName: auction.item.name,
    itemImageUrl: auction.item.imageUrl,
    status: auction.status as AuctionStatus,
    startPriceFen: auction.startPriceFen,
    currentPriceFen: auction.currentPriceFen,
    incrementFen: auction.incrementFen,
    capPriceFen: auction.capPriceFen,
    startTime: auction.startTime?.toISOString() ?? null,
    endTime: auction.endTime?.toISOString() ?? null,
    extendedCount: auction.extendedCount,
    highestBidderId: auction.highestBidderId,
    bidCount: auction.bidCount,
    version: auction.version
  };
}

function toRuleDto(rule: AuctionRule): AuctionRuleDto {
  return toRuleValues(rule);
}

function toRuleValues(rule: AuctionRule): AuctionRuleValues {
  return {
    startPriceFen: rule.startPriceFen,
    incrementFen: rule.incrementFen,
    durationSeconds: rule.durationSeconds,
    capPriceFen: rule.capPriceFen,
    antiSnipingWindowSeconds: rule.antiSnipingWindowSeconds,
    extensionSeconds: rule.extensionSeconds,
    maxExtensionCount: rule.maxExtensionCount
  };
}

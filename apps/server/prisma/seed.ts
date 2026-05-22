import {
  AuctionStatus,
  LiveRoomStatus,
  PrismaClient,
  UserRole
} from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const databaseUrl = new URL(
  process.env.DATABASE_URL ?? "mysql://auction:change_me@127.0.0.1:3307/live_auction"
);
const database = databaseUrl.pathname.replace(/^\//, "");
const adapter = new PrismaMariaDb(
  {
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port || 3306),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database,
    connectionLimit: 5,
    connectTimeout: 1000
  },
  { database }
);

const prisma = new PrismaClient({ adapter });

async function main() {
  const admin = await prisma.user.upsert({
    where: { id: "admin_1" },
    update: {
      displayName: "Demo Admin",
      maskedName: "Admin",
      role: UserRole.ADMIN
    },
    create: {
      id: "admin_1",
      displayName: "Demo Admin",
      maskedName: "Admin",
      role: UserRole.ADMIN
    }
  });

  await prisma.user.upsert({
    where: { id: "user_1" },
    update: {
      displayName: "Demo Bidder 1",
      maskedName: "User 1",
      role: UserRole.BIDDER
    },
    create: {
      id: "user_1",
      displayName: "Demo Bidder 1",
      maskedName: "User 1",
      role: UserRole.BIDDER
    }
  });

  await prisma.user.upsert({
    where: { id: "user_2" },
    update: {
      displayName: "Demo Bidder 2",
      maskedName: "User 2",
      role: UserRole.BIDDER
    },
    create: {
      id: "user_2",
      displayName: "Demo Bidder 2",
      maskedName: "User 2",
      role: UserRole.BIDDER
    }
  });

  const room = await prisma.liveRoom.upsert({
    where: { id: "room_1" },
    update: {
      title: "Demo Live Auction Room",
      hostUserId: admin.id,
      status: LiveRoomStatus.LIVE
    },
    create: {
      id: "room_1",
      title: "Demo Live Auction Room",
      hostUserId: admin.id,
      status: LiveRoomStatus.LIVE
    }
  });

  const item = await prisma.auctionItem.upsert({
    where: { id: "item_1" },
    update: {
      name: "Demo Jade Bracelet",
      imageUrl: "https://example.com/demo-jade-bracelet.png",
      description: "Demo item for the live auction flow.",
      sellingPoints: ["certificate-ready", "free-shipping"],
      createdById: admin.id
    },
    create: {
      id: "item_1",
      name: "Demo Jade Bracelet",
      imageUrl: "https://example.com/demo-jade-bracelet.png",
      description: "Demo item for the live auction flow.",
      sellingPoints: ["certificate-ready", "free-shipping"],
      createdById: admin.id
    }
  });

  const rule = await prisma.auctionRule.upsert({
    where: { id: "rule_1" },
    update: {
      startPriceFen: 0,
      incrementFen: 1000,
      durationSeconds: 300,
      capPriceFen: 100000,
      antiSnipingWindowSeconds: 10,
      extensionSeconds: 15,
      maxExtensionCount: 3
    },
    create: {
      id: "rule_1",
      startPriceFen: 0,
      incrementFen: 1000,
      durationSeconds: 300,
      capPriceFen: 100000,
      antiSnipingWindowSeconds: 10,
      extensionSeconds: 15,
      maxExtensionCount: 3
    }
  });

  await prisma.auctionSession.upsert({
    where: { id: "auction_1" },
    update: {
      roomId: room.id,
      itemId: item.id,
      ruleId: rule.id,
      status: AuctionStatus.SCHEDULED,
      startTime: null,
      endTime: null,
      startPriceFen: rule.startPriceFen,
      currentPriceFen: rule.startPriceFen,
      incrementFen: rule.incrementFen,
      capPriceFen: rule.capPriceFen,
      highestBidderId: null,
      bidCount: 0,
      extendedCount: 0,
      serverSeq: 0,
      version: 1
    },
    create: {
      id: "auction_1",
      roomId: room.id,
      itemId: item.id,
      ruleId: rule.id,
      status: AuctionStatus.SCHEDULED,
      startPriceFen: rule.startPriceFen,
      currentPriceFen: rule.startPriceFen,
      incrementFen: rule.incrementFen,
      capPriceFen: rule.capPriceFen
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

import { expect, test, type Browser, type Page } from "@playwright/test";

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:3100";
const ADMIN_BASE_URL =
  process.env.PLAYWRIGHT_ADMIN_BASE_URL ?? "http://localhost:5273";
const MOBILE_BASE_URL =
  process.env.PLAYWRIGHT_MOBILE_BASE_URL ?? "http://localhost:5274";
const ROOM_ID = "room_1";

test.describe("P2 browser live auction flow", () => {
  test("creates, starts, bids, recovers snapshot, settles at cap, pays, and shows admin order", async ({
    page: adminPage,
    browser
  }) => {
    const itemName = `P2 Playwright 封顶竞拍 ${Date.now()}`;

    await createAuctionThroughAdmin(adminPage, itemName);
    const auctionId = await readCreatedAuctionId(adminPage, itemName);

    await startAuctionThroughAdmin(adminPage, auctionId, itemName);

    const user1 = await newMobilePage(browser);
    const user2 = await newMobilePage(browser);

    try {
      await openMobileAuction(user1, auctionId, "user_1", itemName);
      await openMobileAuction(user2, auctionId, "user_2", itemName);

      await placeVisibleBid(user1, "¥10");
      await expect(user1.getByTestId("my-rank")).toHaveText("第 1 名");
      await expect(user2.getByTestId("current-price")).toHaveText("¥10");

      await placeVisibleBid(user2, "¥20");
      await expect(user2.getByTestId("my-rank")).toHaveText("第 1 名");
      await expect(user1.getByTestId("bid-toast")).toContainText("你已被超越");

      await reloadMobileAuction(user1, itemName);
      await expect(user1.getByTestId("current-price")).toHaveText("¥20");
      await expect(user1.getByTestId("my-bid-amount")).toHaveText("¥10");
      await expect(user1.getByTestId("my-rank")).toHaveText("第 2 名");

      await placeVisibleBid(user1, "¥30");
      await expectWinnerResult(user1);

      const orderId = await readOrderId(user1);
      await user1.getByTestId("mock-pay-button").click();
      await expect(user1.getByTestId("mock-pay-button")).toHaveText("已完成支付");

      await expectAdminOrder(adminPage, orderId, itemName);
    } finally {
      await user2.close();
      await user1.close();
    }
  });
});

async function createAuctionThroughAdmin(page: Page, itemName: string) {
  await page.goto(`${ADMIN_BASE_URL}/admin/items/new`);
  await expect(page.getByRole("heading", { name: "创建商品和竞拍" })).toBeVisible();

  await page.getByLabel("商品名称").fill(itemName);
  await page.getByLabel("商品图片 URL").fill("https://example.com/p2-playwright.png");
  await page.getByLabel("商品介绍").fill("Playwright P2 全链路竞拍验收商品。");
  await page.getByLabel("卖点标签").fill("P2验收,封顶成交");
  await page.getByLabel("直播间 ID").fill(ROOM_ID);
  await page.getByLabel("竞拍时长（秒）").fill("120");
  await page.getByLabel("起拍价（元）").fill("0");
  await page.getByLabel("固定加价（元）").fill("10");
  await page.getByLabel("封顶价（元）").fill("30");
  await page.getByLabel("防狙击窗口（秒）").fill("10");
  await page.getByLabel("延时时长（秒）").fill("15");
  await page.getByLabel("最大延时次数").fill("0");

  await page.getByTestId("create-auction-submit").click();
  await expect(page.getByTestId("admin-notice")).toContainText(`已创建商品「${itemName}」`);
}

async function readCreatedAuctionId(page: Page, itemName: string): Promise<string> {
  const notice = await page.getByTestId("admin-notice").innerText();
  const match = /竞拍\s+(\S+)\s+已进入/.exec(notice);

  if (!match?.[1]) {
    throw new Error(`Cannot parse auction id from admin notice for ${itemName}: ${notice}`);
  }

  return match[1];
}

async function startAuctionThroughAdmin(page: Page, auctionId: string, itemName: string) {
  const row = page.getByTestId("admin-auction-row").filter({ hasText: itemName });

  await expect(row).toContainText("未开始");
  await row.getByTestId(`start-auction-${auctionId}`).click();
  await expect(row).toContainText("竞拍中");
}

async function newMobilePage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });

  return context.newPage();
}

async function openMobileAuction(
  page: Page,
  auctionId: string,
  userId: string,
  itemName: string
) {
  await page.goto(mobileAuctionUrl(auctionId, userId));
  await openPanelFromMiniCard(page, itemName);
  await expect(page.getByTestId("current-price")).toHaveText("¥0");
}

async function reloadMobileAuction(page: Page, itemName: string) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await openPanelFromMiniCard(page, itemName);
}

async function openPanelFromMiniCard(page: Page, itemName: string) {
  const miniCard = page.getByTestId("auction-mini-card");

  await expect(miniCard).toContainText(itemName);
  await miniCard.click();
  await expect(page.getByTestId("auction-panel")).toBeVisible();
}

async function placeVisibleBid(page: Page, expectedAmount: string) {
  await expect(page.getByTestId("selected-bid-amount")).toHaveText(expectedAmount);
  await page.getByTestId("primary-bid-button").click();
  await expect(page.getByTestId("current-price")).toHaveText(expectedAmount);
}

async function expectWinnerResult(page: Page) {
  const modal = page.getByTestId("auction-result-modal");

  try {
    await expect(modal).toBeVisible({ timeout: 20_000 });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(modal).toBeVisible({ timeout: 20_000 });
  }

  await expect(modal).toContainText("恭喜成交");
  await expect(modal).toContainText("¥30");
  await expect(page.getByTestId("result-order-code")).toBeVisible();
}

async function readOrderId(page: Page): Promise<string> {
  const orderText = await page.getByTestId("result-order-code").innerText();
  const match = /订单\s+(\S+)/.exec(orderText);

  if (!match?.[1]) {
    throw new Error(`Cannot parse order id from result modal: ${orderText}`);
  }

  return match[1];
}

async function expectAdminOrder(page: Page, orderId: string, itemName: string) {
  await page.goto(`${ADMIN_BASE_URL}/admin/orders`);
  await page.getByLabel("刷新后台数据").click();

  const row = page.getByTestId("admin-order-row").filter({ hasText: orderId });
  await expect(row).toContainText(itemName, { timeout: 20_000 });
  await expect(row).toContainText("¥30");
  await expect(row).toContainText("已支付");
}

function mobileAuctionUrl(auctionId: string, userId: string): string {
  const params = new URLSearchParams({
    roomId: ROOM_ID,
    auctionId,
    userId,
    apiBaseUrl: API_BASE_URL,
    socketUrl: API_BASE_URL
  });

  return `${MOBILE_BASE_URL}/?${params.toString()}`;
}

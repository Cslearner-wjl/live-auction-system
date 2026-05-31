import { type FormEvent, useEffect, useMemo, useState } from "react";
import { AuctionStatus, OrderStatus } from "@live-auction/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const ADMIN_HEADERS = {
  "X-Demo-User-Id": "admin_1",
  "X-Demo-Role": "admin"
};

type ViewKey = "auctions" | "create" | "orders";
type LoadState = "idle" | "loading" | "ready" | "error";

interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface ItemDto {
  id: string;
  name: string;
  imageUrl: string;
  description: string;
  sellingPoints: string[];
  createdAt: string;
  updatedAt: string;
}

interface CreateAuctionForm {
  roomId: string;
  name: string;
  imageUrl: string;
  description: string;
  sellingPointsText: string;
  startPriceYuan: string;
  incrementYuan: string;
  durationSeconds: string;
  capPriceYuan: string;
  antiSnipingWindowSeconds: string;
  extensionSeconds: string;
  maxExtensionCount: string;
}

interface CreateAuctionPayload {
  roomId: string;
  itemId: string;
  startPriceFen: number;
  incrementFen: number;
  durationSeconds: number;
  capPriceFen: number;
  antiSnipingWindowSeconds: number;
  extensionSeconds: number;
  maxExtensionCount: number;
}

interface AuctionListItem {
  id: string;
  roomId: string;
  itemId: string;
  itemName: string;
  itemImageUrl: string;
  itemSellingPoints?: string[];
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
}

interface AuctionDto {
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
}

interface AuctionListResponse {
  items: AuctionListItem[];
  page: PageMeta;
}

interface OrderListItem {
  id: string;
  auctionId: string;
  itemId: string;
  buyerId: string;
  amountFen: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  itemName?: string;
  itemImageUrl?: string;
  buyerMaskedName?: string;
  auctionStatus?: string;
}

interface OrderListResponse {
  items: OrderListItem[];
  page: PageMeta;
}

interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

const initialCreateAuctionForm: CreateAuctionForm = {
  roomId: "room_1",
  name: "",
  imageUrl: "",
  description: "",
  sellingPointsText: "",
  startPriceYuan: "0",
  incrementYuan: "10",
  durationSeconds: "300",
  capPriceYuan: "1000",
  antiSnipingWindowSeconds: "10",
  extensionSeconds: "15",
  maxExtensionCount: "3"
};

const viewPaths: Record<ViewKey, string> = {
  auctions: "/admin/auctions",
  create: "/admin/items/new",
  orders: "/admin/orders"
};

const auctionStatusOptions: Array<{ label: string; value: AuctionStatus | "ALL" }> = [
  { label: "全部", value: "ALL" },
  { label: "未开始", value: AuctionStatus.Scheduled },
  { label: "竞拍中", value: AuctionStatus.Running },
  { label: "已成交", value: AuctionStatus.EndedSold },
  { label: "已流拍", value: AuctionStatus.EndedUnsold },
  { label: "已取消", value: AuctionStatus.Cancelled }
];

const statusLabels: Record<AuctionStatus, string> = {
  [AuctionStatus.Draft]: "草稿",
  [AuctionStatus.Scheduled]: "未开始",
  [AuctionStatus.Running]: "竞拍中",
  [AuctionStatus.EndedSold]: "已成交",
  [AuctionStatus.EndedUnsold]: "已流拍",
  [AuctionStatus.Cancelled]: "已取消"
};

const orderStatusLabels: Record<OrderStatus, string> = {
  [OrderStatus.PendingPayment]: "待支付",
  [OrderStatus.Paid]: "已支付",
  [OrderStatus.Closed]: "已关闭"
};

export function App() {
  const [view, setView] = useState<ViewKey>(() => viewFromPath(window.location.pathname));
  const [auctionStatus, setAuctionStatus] = useState<AuctionStatus | "ALL">("ALL");
  const [auctions, setAuctions] = useState<AuctionListResponse | null>(null);
  const [orders, setOrders] = useState<OrderListResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "error">("info");
  const [now, setNow] = useState(() => Date.now());
  const [busyAuctionId, setBusyAuctionId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateAuctionForm>(initialCreateAuctionForm);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handlePopState = () => setView(viewFromPath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    void refreshDashboard();
  }, [auctionStatus]);

  const runningCount = useMemo(
    () => auctions?.items.filter((item) => item.status === AuctionStatus.Running).length ?? 0,
    [auctions]
  );
  const orderTotal = orders?.page.total ?? 0;

  function switchView(nextView: ViewKey) {
    setView(nextView);
    window.history.pushState(null, "", viewPaths[nextView]);
  }

  function updateCreateForm<Field extends keyof CreateAuctionForm>(
    field: Field,
    value: CreateAuctionForm[Field]
  ) {
    setCreateForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function refreshDashboard(statusOverride: AuctionStatus | "ALL" = auctionStatus) {
    setLoadState("loading");
    setMessage(null);
    setMessageTone("info");

    try {
      const [auctionResult, orderResult] = await Promise.all([
        fetchAuctions(statusOverride),
        fetchOrders()
      ]);
      setAuctions(auctionResult);
      setOrders(orderResult);
      setLoadState("ready");
    } catch (error: unknown) {
      setLoadState("error");
      setMessageTone("error");
      setMessage(toErrorMessage(error));
    }
  }

  async function submitCreateAuction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateSubmitting(true);
    setMessage(null);
    setMessageTone("info");

    let createdItem: ItemDto | null = null;

    try {
      const itemPayload = toCreateItemPayload(createForm);
      const auctionPayload = toCreateAuctionPayload(createForm, "__pending_item_id__");

      createdItem = await requestJson<ItemDto>("/admin/items", {
        method: "POST",
        body: JSON.stringify(itemPayload)
      });

      const auction = await requestJson<AuctionDto>("/admin/auctions", {
        method: "POST",
        body: JSON.stringify({
          ...auctionPayload,
          itemId: createdItem.id
        })
      });

      setCreateForm({
        ...initialCreateAuctionForm,
        roomId: createForm.roomId
      });
      setAuctionStatus("ALL");
      await refreshDashboard("ALL");
      switchView("auctions");
      setMessageTone("info");
      setMessage(`已创建商品「${createdItem.name}」，竞拍 ${auction.id} 已进入未开始列表。`);
    } catch (error: unknown) {
      const suffix = createdItem
        ? " 商品已创建但竞拍未创建，请检查直播间和规则后重新提交。"
        : "";
      setMessageTone("error");
      setMessage(`${toErrorMessage(error)}${suffix}`);
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function startAuction(auctionId: string) {
    await mutateAuction(auctionId, () =>
      requestJson(`/admin/auctions/${auctionId}/start`, { method: "POST" })
    );
  }

  async function cancelAuction(auctionId: string) {
    const reason = window.prompt("请输入取消原因", "主播确认商品状态异常");

    if (!reason?.trim()) {
      return;
    }

    await mutateAuction(auctionId, () =>
      requestJson(`/admin/auctions/${auctionId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() })
      })
    );
  }

  async function mutateAuction(auctionId: string, operation: () => Promise<unknown>) {
    setBusyAuctionId(auctionId);
    setMessage(null);
    setMessageTone("info");

    try {
      await operation();
      await refreshDashboard();
      setMessageTone("info");
      setMessage("操作已提交，列表已刷新。");
    } catch (error: unknown) {
      setMessageTone("error");
      setMessage(toErrorMessage(error));
    } finally {
      setBusyAuctionId(null);
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Merchant Console</p>
          <h1>直播竞拍管理后台</h1>
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => void refreshDashboard()}
            title="刷新后台数据"
            aria-label="刷新后台数据"
            disabled={loadState === "loading"}
          >
            ↻
          </button>
          <span className="status-pill">Day 10</span>
        </div>
      </header>

      <section className="summary-band" aria-label="dashboard summary">
        <div>
          <span>竞拍总数</span>
          <strong>{auctions?.page.total ?? 0}</strong>
        </div>
        <div>
          <span>进行中</span>
          <strong>{runningCount}</strong>
        </div>
        <div>
          <span>订单总数</span>
          <strong>{orderTotal}</strong>
        </div>
      </section>

      {message ? <p className={messageTone === "error" ? "notice error" : "notice"}>{message}</p> : null}

      <nav className="tabs" aria-label="admin views">
        <button
          type="button"
          className={view === "auctions" ? "active" : ""}
          onClick={() => switchView("auctions")}
        >
          竞拍进度
        </button>
        <button
          type="button"
          className={view === "create" ? "active" : ""}
          onClick={() => switchView("create")}
        >
          商品上架
        </button>
        <button
          type="button"
          className={view === "orders" ? "active" : ""}
          onClick={() => switchView("orders")}
        >
          成交订单
        </button>
      </nav>

      {view === "auctions" ? (
        <section className="panel" aria-label="auction list">
          <div className="panel-toolbar">
            <div>
              <h2>竞拍列表</h2>
              <p>查看状态、剩余时间、当前价和可执行操作。</p>
            </div>
            <label className="field-inline">
              <span>状态</span>
              <select
                value={auctionStatus}
                onChange={(event) =>
                  setAuctionStatus(event.target.value as AuctionStatus | "ALL")
                }
              >
                {auctionStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>商品</th>
                  <th>规则</th>
                  <th>当前价</th>
                  <th>出价</th>
                  <th>状态</th>
                  <th>剩余时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {auctions?.items.map((auction) => (
                  <tr key={auction.id}>
                    <td>
                      <ProductCell
                        imageUrl={auction.itemImageUrl}
                        name={auction.itemName}
                        tags={auction.itemSellingPoints ?? []}
                      />
                    </td>
                    <td>
                      <div className="metric-list">
                        <span>起拍 {formatFen(auction.startPriceFen)}</span>
                        <span>加价 {formatFen(auction.incrementFen)}</span>
                        <span>封顶 {formatFen(auction.capPriceFen)}</span>
                      </div>
                    </td>
                    <td>
                      <strong>{formatFen(auction.currentPriceFen)}</strong>
                      <small>{auction.status === AuctionStatus.EndedSold ? "成交金额" : "当前出价"}</small>
                    </td>
                    <td>
                      <strong>{auction.bidCount}</strong>
                      <small>{auction.highestBidderId ? `领先 ${auction.highestBidderId}` : "暂无出价"}</small>
                    </td>
                    <td>
                      <StatusBadge status={auction.status} />
                    </td>
                    <td>{formatRemaining(auction, now)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          onClick={() => void startAuction(auction.id)}
                          disabled={
                            auction.status !== AuctionStatus.Scheduled ||
                            busyAuctionId === auction.id
                          }
                        >
                          启动
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void cancelAuction(auction.id)}
                          disabled={
                            ![AuctionStatus.Scheduled, AuctionStatus.Running].includes(
                              auction.status
                            ) || busyAuctionId === auction.id
                          }
                        >
                          取消
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {auctions?.items.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <p className="empty-state">暂无竞拍数据。</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {view === "create" ? (
        <section className="panel" aria-label="create auction">
          <div className="panel-toolbar">
            <div>
              <h2>创建商品和竞拍</h2>
              <p>提交后生成未开始竞拍，可在列表中启动。</p>
            </div>
          </div>

          <form className="create-form" onSubmit={(event) => void submitCreateAuction(event)}>
            <div className="form-section">
              <h3>商品信息</h3>
              <div className="form-grid">
                <label>
                  <span>商品名称</span>
                  <input
                    value={createForm.name}
                    maxLength={80}
                    onChange={(event) => updateCreateForm("name", event.target.value)}
                    placeholder="翡翠手镯"
                    required
                  />
                </label>
                <label>
                  <span>商品图片 URL</span>
                  <input
                    value={createForm.imageUrl}
                    maxLength={500}
                    onChange={(event) => updateCreateForm("imageUrl", event.target.value)}
                    placeholder="https://example.com/item.png"
                    required
                  />
                </label>
                <label className="span-2">
                  <span>商品介绍</span>
                  <textarea
                    value={createForm.description}
                    maxLength={2000}
                    onChange={(event) => updateCreateForm("description", event.target.value)}
                    rows={4}
                    required
                  />
                </label>
                <label className="span-2">
                  <span>卖点标签</span>
                  <input
                    value={createForm.sellingPointsText}
                    onChange={(event) => updateCreateForm("sellingPointsText", event.target.value)}
                    placeholder="支持鉴定，顺丰包邮"
                  />
                </label>
              </div>
            </div>

            <div className="form-section">
              <h3>竞拍规则</h3>
              <div className="form-grid">
                <label>
                  <span>直播间 ID</span>
                  <input
                    value={createForm.roomId}
                    maxLength={191}
                    onChange={(event) => updateCreateForm("roomId", event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>竞拍时长（秒）</span>
                  <input
                    value={createForm.durationSeconds}
                    inputMode="numeric"
                    onChange={(event) => updateCreateForm("durationSeconds", event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>起拍价（元）</span>
                  <input
                    value={createForm.startPriceYuan}
                    inputMode="decimal"
                    onChange={(event) => updateCreateForm("startPriceYuan", event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>固定加价（元）</span>
                  <input
                    value={createForm.incrementYuan}
                    inputMode="decimal"
                    onChange={(event) => updateCreateForm("incrementYuan", event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>封顶价（元）</span>
                  <input
                    value={createForm.capPriceYuan}
                    inputMode="decimal"
                    onChange={(event) => updateCreateForm("capPriceYuan", event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>防狙击窗口（秒）</span>
                  <input
                    value={createForm.antiSnipingWindowSeconds}
                    inputMode="numeric"
                    onChange={(event) =>
                      updateCreateForm("antiSnipingWindowSeconds", event.target.value)
                    }
                    required
                  />
                </label>
                <label>
                  <span>延时时长（秒）</span>
                  <input
                    value={createForm.extensionSeconds}
                    inputMode="numeric"
                    onChange={(event) => updateCreateForm("extensionSeconds", event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>最大延时次数</span>
                  <input
                    value={createForm.maxExtensionCount}
                    inputMode="numeric"
                    onChange={(event) => updateCreateForm("maxExtensionCount", event.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="primary" disabled={createSubmitting}>
                {createSubmitting ? "创建中" : "创建竞拍"}
              </button>
              <button
                type="button"
                onClick={() => setCreateForm(initialCreateAuctionForm)}
                disabled={createSubmitting}
              >
                重置
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {view === "orders" ? (
        <section className="panel" aria-label="order list">
          <div className="panel-toolbar">
            <div>
              <h2>订单列表</h2>
              <p>展示成交订单、买家、成交金额和支付状态。</p>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>商品</th>
                  <th>订单</th>
                  <th>买家</th>
                  <th>成交金额</th>
                  <th>订单状态</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {orders?.items.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <ProductCell
                        imageUrl={order.itemImageUrl ?? ""}
                        name={order.itemName ?? order.itemId}
                        tags={order.auctionStatus ? [order.auctionStatus] : []}
                      />
                    </td>
                    <td>
                      <strong>{order.id}</strong>
                      <small>竞拍 {order.auctionId}</small>
                    </td>
                    <td>
                      <strong>{order.buyerMaskedName ?? order.buyerId}</strong>
                      <small>{order.buyerId}</small>
                    </td>
                    <td>
                      <strong>{formatFen(order.amountFen)}</strong>
                    </td>
                    <td>
                      <span className={`order-badge ${order.status.toLowerCase()}`}>
                        {orderStatusLabels[order.status]}
                      </span>
                    </td>
                    <td>{formatDateTime(order.createdAt)}</td>
                  </tr>
                ))}
                {orders?.items.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <p className="empty-state">暂无订单数据。</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {loadState === "loading" ? <div className="loading-bar" /> : null}
    </main>
  );
}

function ProductCell({
  imageUrl,
  name,
  tags
}: {
  imageUrl: string;
  name: string;
  tags: string[];
}) {
  return (
    <div className="product-cell">
      <img src={imageUrl || "https://placehold.co/96x96?text=Item"} alt="" />
      <div>
        <strong>{name}</strong>
        <div className="tag-row">
          {tags.length > 0 ? (
            tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)
          ) : (
            <span>无标签</span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AuctionStatus }) {
  return <span className={`auction-badge ${status.toLowerCase()}`}>{statusLabels[status]}</span>;
}

async function fetchAuctions(status: AuctionStatus | "ALL"): Promise<AuctionListResponse> {
  const query = new URLSearchParams({ page: "1", pageSize: "50" });

  if (status !== "ALL") {
    query.set("status", status);
  }

  return requestJson<AuctionListResponse>(`/admin/auctions?${query.toString()}`);
}

async function fetchOrders(): Promise<OrderListResponse> {
  return requestJson<OrderListResponse>("/admin/orders?page=1&pageSize=50");
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...ADMIN_HEADERS,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    }
  });
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | T | null;

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload | null;
    throw new Error(
      errorPayload?.message
        ? `${errorPayload.code ?? response.status}: ${errorPayload.message}`
        : `HTTP ${response.status}`
    );
  }

  return payload as T;
}

function toCreateItemPayload(form: CreateAuctionForm) {
  return {
    name: readRequiredText(form.name, "商品名称"),
    imageUrl: readRequiredUrl(form.imageUrl, "商品图片 URL"),
    description: readRequiredText(form.description, "商品介绍"),
    sellingPoints: parseSellingPoints(form.sellingPointsText)
  };
}

function toCreateAuctionPayload(
  form: CreateAuctionForm,
  itemId: string
): CreateAuctionPayload {
  const startPriceFen = parseYuanToFen(form.startPriceYuan, "起拍价");
  const incrementFen = parseYuanToFen(form.incrementYuan, "固定加价");
  const capPriceFen = parseYuanToFen(form.capPriceYuan, "封顶价");

  if (incrementFen <= 0) {
    throw new Error("固定加价必须大于 0 元");
  }

  if (capPriceFen <= startPriceFen) {
    throw new Error("封顶价必须大于起拍价");
  }

  return {
    roomId: readRequiredText(form.roomId, "直播间 ID"),
    itemId,
    startPriceFen,
    incrementFen,
    durationSeconds: parsePositiveInteger(form.durationSeconds, "竞拍时长"),
    capPriceFen,
    antiSnipingWindowSeconds: parseNonNegativeInteger(
      form.antiSnipingWindowSeconds,
      "防狙击窗口"
    ),
    extensionSeconds: parseNonNegativeInteger(form.extensionSeconds, "延时时长"),
    maxExtensionCount: parseOptionalNonNegativeInteger(form.maxExtensionCount, "最大延时次数")
  };
}

function readRequiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label}不能为空`);
  }

  return normalized;
}

function readRequiredUrl(value: string, label: string): string {
  const normalized = readRequiredText(value, label);

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new Error(`${label}必须是 http 或 https URL`);
  }

  return normalized;
}

function parseSellingPoints(value: string): string[] {
  const points = value
    .split(/[\n,，]/)
    .map((point) => point.trim())
    .filter(Boolean);

  if (points.length > 10) {
    throw new Error("卖点标签最多 10 个");
  }

  const invalidPoint = points.find((point) => point.length > 30);
  if (invalidPoint) {
    throw new Error(`卖点标签「${invalidPoint}」不能超过 30 字符`);
  }

  return points;
}

function parseYuanToFen(value: string, label: string): number {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`${label}必须是非负金额，最多保留 2 位小数`);
  }

  const [yuanPart, fenPart = ""] = normalized.split(".");
  const fen = Number(yuanPart) * 100 + Number(fenPart.padEnd(2, "0"));

  if (!Number.isSafeInteger(fen)) {
    throw new Error(`${label}金额过大`);
  }

  return fen;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = parseNonNegativeInteger(value, label);
  if (parsed <= 0) {
    throw new Error(`${label}必须大于 0`);
  }

  return parsed;
}

function parseOptionalNonNegativeInteger(value: string, label: string): number {
  if (!value.trim()) {
    return 0;
  }

  return parseNonNegativeInteger(value, label);
}

function parseNonNegativeInteger(value: string, label: string): number {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label}必须是非负整数`);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label}数值过大`);
  }

  return parsed;
}

function viewFromPath(pathname: string): ViewKey {
  if (pathname.endsWith("/admin/orders")) {
    return "orders";
  }

  if (pathname.endsWith("/admin/items") || pathname.endsWith("/admin/items/new")) {
    return "create";
  }

  return "auctions";
}

function formatFen(value: number): string {
  return `¥${(value / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}

function formatRemaining(auction: AuctionListItem, now: number): string {
  if (auction.status === AuctionStatus.Scheduled) {
    return "待启动";
  }

  if (!auction.endTime) {
    return "无结束时间";
  }

  if (auction.status !== AuctionStatus.Running) {
    return formatDateTime(auction.endTime);
  }

  const remainingMs = new Date(auction.endTime).getTime() - now;

  if (remainingMs <= 0) {
    return "待结算";
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}分${seconds.toString().padStart(2, "0")}秒`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败";
}

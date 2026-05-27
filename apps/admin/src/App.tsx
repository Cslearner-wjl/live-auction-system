import { useEffect, useMemo, useState } from "react";
import { AuctionStatus, OrderStatus } from "@live-auction/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const ADMIN_HEADERS = {
  "X-Demo-User-Id": "admin_1",
  "X-Demo-Role": "admin"
};

type ViewKey = "auctions" | "orders";
type LoadState = "idle" | "loading" | "ready" | "error";

interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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
  const [view, setView] = useState<ViewKey>("auctions");
  const [auctionStatus, setAuctionStatus] = useState<AuctionStatus | "ALL">("ALL");
  const [auctions, setAuctions] = useState<AuctionListResponse | null>(null);
  const [orders, setOrders] = useState<OrderListResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busyAuctionId, setBusyAuctionId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void refreshDashboard();
  }, [auctionStatus]);

  const runningCount = useMemo(
    () => auctions?.items.filter((item) => item.status === AuctionStatus.Running).length ?? 0,
    [auctions]
  );
  const orderTotal = orders?.page.total ?? 0;

  async function refreshDashboard() {
    setLoadState("loading");
    setMessage(null);

    try {
      const [auctionResult, orderResult] = await Promise.all([
        fetchAuctions(auctionStatus),
        fetchOrders()
      ]);
      setAuctions(auctionResult);
      setOrders(orderResult);
      setLoadState("ready");
    } catch (error: unknown) {
      setLoadState("error");
      setMessage(toErrorMessage(error));
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

    try {
      await operation();
      setMessage("操作已提交，列表已刷新。");
      await refreshDashboard();
    } catch (error: unknown) {
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
          <span className="status-pill">Day 7</span>
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

      {message ? <p className={loadState === "error" ? "notice error" : "notice"}>{message}</p> : null}

      <nav className="tabs" aria-label="admin views">
        <button
          type="button"
          className={view === "auctions" ? "active" : ""}
          onClick={() => setView("auctions")}
        >
          竞拍进度
        </button>
        <button
          type="button"
          className={view === "orders" ? "active" : ""}
          onClick={() => setView("orders")}
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
              </tbody>
            </table>
          </div>
        </section>
      ) : (
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
              </tbody>
            </table>
          </div>
        </section>
      )}

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

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

interface AuctionRulePayload {
  startPriceFen: number;
  incrementFen: number;
  durationSeconds: number;
  capPriceFen: number;
  antiSnipingWindowSeconds: number;
  extensionSeconds: number;
  maxExtensionCount: number;
}

interface CreateAuctionPayload extends AuctionRulePayload {
  roomId: string;
  itemId: string;
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

interface UploadImageResponse {
  url: string;
  path: string;
}

type AiInsightSource = "mock" | "openai" | "ark" | "fallback";
type AiInsightConfidence = "low" | "medium" | "high";

interface AiAuctionInsightResponse {
  id: string;
  source: AiInsightSource;
  targetAudience: string[];
  sellingPointTags: string[];
  suggestedStartPriceFen: number;
  suggestedDealMinFen: number;
  suggestedDealMaxFen: number;
  suggestedCapPriceFen: number;
  cautionPriceFen: number;
  priceReasoning: string;
  liveScript: string;
  atmosphereCopy: string;
  riskNotes: string[];
  confidence: AiInsightConfidence;
}

interface AiInsightForm {
  id?: string;
  source: AiInsightSource;
  targetAudienceText: string;
  sellingPointTagsText: string;
  liveScript: string;
  atmosphereCopy: string;
  suggestedStartPriceYuan: string;
  suggestedDealMinYuan: string;
  suggestedDealMaxYuan: string;
  suggestedCapPriceYuan: string;
  cautionPriceYuan: string;
  priceReasoning: string;
  riskNotesText: string;
  confidence: AiInsightConfidence;
}

interface AiInsightPayload {
  id?: string;
  source: AiInsightSource;
  targetAudience: string[];
  sellingPointTags: string[];
  suggestedStartPriceFen: number;
  suggestedDealMinFen: number;
  suggestedDealMaxFen: number;
  suggestedCapPriceFen: number;
  cautionPriceFen: number;
  priceReasoning: string;
  liveScript: string;
  atmosphereCopy: string;
  riskNotes: string[];
  confidence: AiInsightConfidence;
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
  const [imageUploading, setImageUploading] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiInsightForm, setAiInsightForm] = useState<AiInsightForm | null>(null);

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

  function updateAiInsightForm<Field extends keyof AiInsightForm>(
    field: Field,
    value: AiInsightForm[Field]
  ) {
    setAiInsightForm((current) =>
      current
        ? {
            ...current,
            [field]: value
          }
        : current
    );
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

    try {
      const itemPayload = toCreateItemPayload(createForm);
      const auctionPayload = toCreateAuctionPayload(createForm, "__pending_item_id__");
      const itemName = itemPayload.name;

      const auction = await requestJson<AuctionDto>("/admin/auctions/with-item", {
        method: "POST",
        body: JSON.stringify({
          ...auctionPayload,
          itemId: undefined,
          item: itemPayload,
          ...(aiInsightForm ? { aiInsight: toAiInsightPayload(aiInsightForm) } : {})
        })
      });

      setCreateForm({
        ...initialCreateAuctionForm,
        roomId: createForm.roomId
      });
      setAiInsightForm(null);
      setAuctionStatus("ALL");
      await refreshDashboard("ALL");
      switchView("auctions");
      setMessageTone("info");
      setMessage(`已创建商品「${itemName}」，竞拍 ${auction.id} 已进入未开始列表。`);
    } catch (error: unknown) {
      setMessageTone("error");
      setMessage(toErrorMessage(error));
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function uploadLocalImage(file: File | undefined) {
    if (!file) {
      return;
    }

    setImageUploading(true);
    setMessage(null);
    setMessageTone("info");

    try {
      const base64 = await readFileAsBase64(file);
      const result = await requestJson<UploadImageResponse>("/admin/uploads/item-image", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          base64
        })
      });

      updateCreateForm("imageUrl", result.url);
      setMessageTone("info");
      setMessage("本地图片已上传，商品图片 URL 已自动填入。");
    } catch (error: unknown) {
      setMessageTone("error");
      setMessage(toErrorMessage(error));
    } finally {
      setImageUploading(false);
    }
  }

  async function generateAiInsight() {
    setAiGenerating(true);
    setMessage(null);
    setMessageTone("info");

    try {
      const rule = toAuctionRulePayload(createForm);
      const result = await requestJson<AiAuctionInsightResponse>("/admin/ai/auction-insights", {
        method: "POST",
        body: JSON.stringify({
          itemName: readRequiredText(createForm.name, "商品名称"),
          description: readRequiredText(createForm.description, "商品介绍"),
          sellingPoints: parseSellingPoints(createForm.sellingPointsText),
          roomId: readRequiredText(createForm.roomId, "直播间 ID"),
          auctionRule: rule
        })
      });

      setAiInsightForm(toAiInsightForm(result));
      setMessageTone("info");
      setMessage(
        result.source === "openai" || result.source === "ark"
          ? "AI 竞拍参考已生成，可继续编辑后创建竞拍。"
          : "AI 竞拍参考已使用 mock/fallback 生成，可继续编辑后创建竞拍。"
      );
    } catch (error: unknown) {
      setMessageTone("error");
      setMessage(toErrorMessage(error));
    } finally {
      setAiGenerating(false);
    }
  }

  function applySuggestedSellingPoints() {
    if (!aiInsightForm) {
      return;
    }

    updateCreateForm("sellingPointsText", aiInsightForm.sellingPointTagsText);
  }

  function applySuggestedStartPrice() {
    if (!aiInsightForm) {
      return;
    }

    updateCreateForm("startPriceYuan", aiInsightForm.suggestedStartPriceYuan);
  }

  function applySuggestedCapPrice() {
    if (!aiInsightForm) {
      return;
    }

    updateCreateForm("capPriceYuan", aiInsightForm.suggestedCapPriceYuan);
  }

  function resetCreateState() {
    setCreateForm(initialCreateAuctionForm);
    setAiInsightForm(null);
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

      {message ? (
        <p
          className={messageTone === "error" ? "notice error" : "notice"}
          data-testid="admin-notice"
        >
          {message}
        </p>
      ) : null}

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
            <div className="toolbar-actions">
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
              <button type="button" className="primary" onClick={() => switchView("create")}>
                添加商品
              </button>
            </div>
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
                {auctions?.items.map((auction, index) => (
                  <tr
                    key={auction.id}
                    data-testid="admin-auction-row"
                    data-auction-id={auction.id}
                  >
                    <td>
                      <ProductCell
                        index={index + 1}
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
                      <PriceCell
                        value={auction.currentPriceFen}
                        label={auction.status === AuctionStatus.EndedSold ? "成交金额" : "当前出价"}
                        active={auction.status === AuctionStatus.Running}
                      />
                    </td>
                    <td>
                      <div className="bid-count-cell">
                        <strong>{auction.bidCount}</strong>
                        <small>
                          {auction.highestBidderId ? `领先 ${auction.highestBidderId}` : "暂无出价"}
                        </small>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={auction.status} />
                    </td>
                    <td>
                      <span className="remaining-chip">{formatRemaining(auction, now)}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          data-testid={`start-auction-${auction.id}`}
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
                          data-testid={`cancel-auction-${auction.id}`}
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
                <label>
                  <span>本地图片</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    disabled={imageUploading}
                    onChange={(event) => void uploadLocalImage(event.currentTarget.files?.[0])}
                  />
                  <small>{imageUploading ? "上传中..." : "选择后会自动上传并填入 URL"}</small>
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

            <div className="form-section ai-section">
              <div className="section-heading-row">
                <div>
                  <h3>AI 竞拍参考</h3>
                  <small>生成内容可编辑，创建流程不依赖 AI 成功。</small>
                </div>
                <button
                  type="button"
                  className="primary"
                  data-testid="generate-ai-insight"
                  disabled={aiGenerating || createSubmitting}
                  onClick={() => void generateAiInsight()}
                >
                  {aiGenerating ? "生成中" : "AI 生成竞拍参考"}
                </button>
              </div>

              {aiInsightForm ? (
                <AiInsightEditor
                  value={aiInsightForm}
                  disabled={createSubmitting}
                  onChange={updateAiInsightForm}
                  onApplySellingPoints={applySuggestedSellingPoints}
                  onApplyStartPrice={applySuggestedStartPrice}
                  onApplyCapPrice={applySuggestedCapPrice}
                />
              ) : (
                <p className="ai-empty-state">未生成 AI 参考时也可以直接手动创建竞拍。</p>
              )}
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="primary"
                data-testid="create-auction-submit"
                disabled={createSubmitting}
              >
                {createSubmitting ? "创建中" : "创建竞拍"}
              </button>
              <button
                type="button"
                onClick={resetCreateState}
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
                  <tr key={order.id} data-testid="admin-order-row">
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
  index,
  imageUrl,
  name,
  tags
}: {
  index?: number;
  imageUrl: string;
  name: string;
  tags: string[];
}) {
  return (
    <div className={index ? "product-cell with-index" : "product-cell"}>
      {index ? <span className="product-index">{index.toString().padStart(2, "0")}</span> : null}
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

function PriceCell({
  value,
  label,
  active
}: {
  value: number;
  label: string;
  active: boolean;
}) {
  return (
    <div className={active ? "price-cell active" : "price-cell"}>
      <strong>{formatFen(value)}</strong>
      <small>{label}</small>
    </div>
  );
}

function StatusBadge({ status }: { status: AuctionStatus }) {
  return <span className={`auction-badge ${status.toLowerCase()}`}>{statusLabels[status]}</span>;
}

function AiInsightEditor({
  value,
  disabled,
  onChange,
  onApplySellingPoints,
  onApplyStartPrice,
  onApplyCapPrice
}: {
  value: AiInsightForm;
  disabled: boolean;
  onChange: <Field extends keyof AiInsightForm>(
    field: Field,
    nextValue: AiInsightForm[Field]
  ) => void;
  onApplySellingPoints: () => void;
  onApplyStartPrice: () => void;
  onApplyCapPrice: () => void;
}) {
  return (
    <div className="ai-insight-editor" data-testid="ai-insight-editor">
      <div className="ai-source-row">
        <span className={`ai-source ${value.source}`}>source: {value.source}</span>
        <label>
          <span>置信度</span>
          <select
            value={value.confidence}
            disabled={disabled}
            onChange={(event) =>
              onChange("confidence", event.target.value as AiInsightConfidence)
            }
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
      </div>

      <div className="form-grid">
        <label>
          <span>适合人群</span>
          <input
            value={value.targetAudienceText}
            disabled={disabled}
            onChange={(event) => onChange("targetAudienceText", event.target.value)}
          />
        </label>
        <label>
          <span>卖点标签</span>
          <input
            value={value.sellingPointTagsText}
            disabled={disabled}
            onChange={(event) => onChange("sellingPointTagsText", event.target.value)}
          />
        </label>
        <label className="span-2">
          <span>直播讲解词</span>
          <textarea
            value={value.liveScript}
            disabled={disabled}
            rows={3}
            onChange={(event) => onChange("liveScript", event.target.value)}
          />
        </label>
        <label className="span-2">
          <span>竞拍氛围话术</span>
          <textarea
            value={value.atmosphereCopy}
            disabled={disabled}
            rows={3}
            onChange={(event) => onChange("atmosphereCopy", event.target.value)}
          />
        </label>
        <label>
          <span>建议起拍价（元）</span>
          <input
            value={value.suggestedStartPriceYuan}
            inputMode="decimal"
            disabled={disabled}
            onChange={(event) => onChange("suggestedStartPriceYuan", event.target.value)}
          />
        </label>
        <label>
          <span>建议成交下限（元）</span>
          <input
            value={value.suggestedDealMinYuan}
            inputMode="decimal"
            disabled={disabled}
            onChange={(event) => onChange("suggestedDealMinYuan", event.target.value)}
          />
        </label>
        <label>
          <span>建议成交上限（元）</span>
          <input
            value={value.suggestedDealMaxYuan}
            inputMode="decimal"
            disabled={disabled}
            onChange={(event) => onChange("suggestedDealMaxYuan", event.target.value)}
          />
        </label>
        <label>
          <span>建议封顶价（元）</span>
          <input
            value={value.suggestedCapPriceYuan}
            inputMode="decimal"
            disabled={disabled}
            onChange={(event) => onChange("suggestedCapPriceYuan", event.target.value)}
          />
        </label>
        <label>
          <span>谨慎价（元）</span>
          <input
            value={value.cautionPriceYuan}
            inputMode="decimal"
            disabled={disabled}
            onChange={(event) => onChange("cautionPriceYuan", event.target.value)}
          />
        </label>
        <label className="span-2">
          <span>价格推断说明</span>
          <textarea
            value={value.priceReasoning}
            disabled={disabled}
            rows={3}
            onChange={(event) => onChange("priceReasoning", event.target.value)}
          />
        </label>
        <label className="span-2">
          <span>风险提示</span>
          <textarea
            value={value.riskNotesText}
            disabled={disabled}
            rows={3}
            onChange={(event) => onChange("riskNotesText", event.target.value)}
          />
        </label>
      </div>

      <div className="ai-actions">
        <button type="button" onClick={onApplySellingPoints} disabled={disabled}>
          应用建议卖点
        </button>
        <button type="button" onClick={onApplyStartPrice} disabled={disabled}>
          应用建议起拍价
        </button>
        <button type="button" onClick={onApplyCapPrice} disabled={disabled}>
          应用建议封顶价
        </button>
      </div>
    </div>
  );
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
  return {
    roomId: readRequiredText(form.roomId, "直播间 ID"),
    itemId,
    ...toAuctionRulePayload(form)
  };
}

function toAuctionRulePayload(form: CreateAuctionForm): AuctionRulePayload {
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

function toAiInsightForm(response: AiAuctionInsightResponse): AiInsightForm {
  return {
    id: response.id,
    source: response.source,
    targetAudienceText: response.targetAudience.join("，"),
    sellingPointTagsText: response.sellingPointTags.join("，"),
    liveScript: response.liveScript,
    atmosphereCopy: response.atmosphereCopy,
    suggestedStartPriceYuan: formatYuanInput(response.suggestedStartPriceFen),
    suggestedDealMinYuan: formatYuanInput(response.suggestedDealMinFen),
    suggestedDealMaxYuan: formatYuanInput(response.suggestedDealMaxFen),
    suggestedCapPriceYuan: formatYuanInput(response.suggestedCapPriceFen),
    cautionPriceYuan: formatYuanInput(response.cautionPriceFen),
    priceReasoning: response.priceReasoning,
    riskNotesText: response.riskNotes.join("\n"),
    confidence: response.confidence
  };
}

function toAiInsightPayload(form: AiInsightForm): AiInsightPayload {
  const suggestedStartPriceFen = parseYuanToFen(form.suggestedStartPriceYuan, "建议起拍价");
  const suggestedDealMinFen = parseYuanToFen(form.suggestedDealMinYuan, "建议成交下限");
  const suggestedDealMaxFen = parseYuanToFen(form.suggestedDealMaxYuan, "建议成交上限");
  const suggestedCapPriceFen = parseYuanToFen(form.suggestedCapPriceYuan, "建议封顶价");
  const cautionPriceFen = parseYuanToFen(form.cautionPriceYuan, "谨慎价");

  if (suggestedDealMaxFen < suggestedDealMinFen) {
    throw new Error("建议成交上限必须大于或等于下限");
  }

  if (suggestedCapPriceFen < suggestedDealMaxFen) {
    throw new Error("建议封顶价必须大于或等于建议成交上限");
  }

  if (cautionPriceFen < suggestedDealMaxFen) {
    throw new Error("谨慎价必须大于或等于建议成交上限");
  }

  return {
    id: form.id,
    source: form.source,
    targetAudience: parseDelimitedText(form.targetAudienceText, "适合人群", 6, 60),
    sellingPointTags: parseDelimitedText(form.sellingPointTagsText, "卖点标签", 8, 40),
    suggestedStartPriceFen,
    suggestedDealMinFen,
    suggestedDealMaxFen,
    suggestedCapPriceFen,
    cautionPriceFen,
    priceReasoning: readRequiredText(form.priceReasoning, "价格推断说明"),
    liveScript: readRequiredText(form.liveScript, "直播讲解词"),
    atmosphereCopy: readRequiredText(form.atmosphereCopy, "竞拍氛围话术"),
    riskNotes: parseDelimitedText(form.riskNotesText, "风险提示", 6, 120),
    confidence: form.confidence
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
  const points = splitDelimitedText(value);

  if (points.length > 10) {
    throw new Error("卖点标签最多 10 个");
  }

  const invalidPoint = points.find((point) => point.length > 30);
  if (invalidPoint) {
    throw new Error(`卖点标签「${invalidPoint}」不能超过 30 字符`);
  }

  return points;
}

function parseDelimitedText(
  value: string,
  label: string,
  maxItems: number,
  maxLength: number
): string[] {
  const items = splitDelimitedText(value);

  if (items.length === 0) {
    throw new Error(`${label}不能为空`);
  }

  if (items.length > maxItems) {
    throw new Error(`${label}最多 ${maxItems} 项`);
  }

  const invalid = items.find((item) => item.length > maxLength);
  if (invalid) {
    throw new Error(`${label}「${invalid}」不能超过 ${maxLength} 字符`);
  }

  return items;
}

function splitDelimitedText(value: string): string[] {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
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

function formatYuanInput(value: number): string {
  const yuan = Math.trunc(value / 100);
  const fen = value % 100;

  return fen === 0 ? String(yuan) : `${yuan}.${fen.toString().padStart(2, "0")}`;
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

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("读取本地图片失败"));
    reader.readAsDataURL(file);
  });
}

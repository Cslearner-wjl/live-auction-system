import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AuctionStatus,
  AuctionWebSocketEvent,
  type AuctionLeaderboardEntry,
  type AuctionSnapshot
} from "@live-auction/shared";
import {
  appendLiveComment,
  createAuctionSocket,
  createClientBidId,
  getAuctionSnapshot,
  getDisplayErrorMessage,
  joinRealtimeRooms,
  loadLiveRoom,
  placeBidByRest,
  readMobileClientConfig,
  requestSocketSnapshot,
  type LiveComment,
  type LiveRoomViewModel,
  type MobileAuctionSocket
} from "./mobile-auction-service";

type RealtimePayload = Record<string, unknown>;

export function App() {
  return <LiveRoomPage />;
}

function LiveRoomPage() {
  const config = useMemo(() => readMobileClientConfig(), []);
  const [room, setRoom] = useState<LiveRoomViewModel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedAmountFen, setSelectedAmountFen] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [realtimeState, setRealtimeState] = useState("实时连接中");
  const roomRef = useRef<LiveRoomViewModel | null>(null);
  const socketRef = useRef<MobileAuctionSocket | null>(null);
  const lastServerSeqRef = useRef(0);
  const syncInFlightRef = useRef<Promise<void> | null>(null);
  const deadlineSyncSeqRef = useRef<number | null>(null);

  const serverDriftMs = useMemo(() => {
    if (!room) {
      return 0;
    }

    return new Date(room.snapshot.serverTime).getTime() - Date.now();
  }, [room?.snapshot.serverTime]);

  const calibratedNowMs = nowMs + serverDriftMs;
  const remainingMs = room
    ? getRemainingMs(room.snapshot.endTime, calibratedNowMs)
    : 0;
  const isLeading = room?.snapshot.myRank === 1;
  const isEnded = room
    ? [
        AuctionStatus.EndedSold,
        AuctionStatus.EndedUnsold,
        AuctionStatus.Cancelled
      ].includes(room.snapshot.status)
    : false;
  const canBid =
    room?.snapshot.status === AuctionStatus.Running && remainingMs > 0 && !isEnded;

  const replaceSnapshot = useCallback(
    (snapshot: AuctionSnapshot, comment?: Omit<LiveComment, "id">) => {
      lastServerSeqRef.current = snapshot.serverSeq;
      setRoom((current) => {
        if (!current || current.auction.auctionId !== snapshot.auctionId) {
          return current;
        }

        return {
          ...current,
          viewerCount: Math.max(current.viewerCount, snapshot.participantCount + 128),
          likeCount: Math.max(current.likeCount, 9320 + snapshot.bidCount * 17),
          snapshot,
          comments: comment
            ? appendLiveComment(current.comments, comment)
            : current.comments
        };
      });
      setSelectedAmountFen((current) =>
        clampBidAmount(
          Math.max(current, snapshot.nextBidAmountFen),
          snapshot.nextBidAmountFen,
          roomRef.current?.auction.capPriceFen ?? snapshot.nextBidAmountFen
        )
      );
    },
    []
  );

  const syncSnapshot = useCallback(
    async (comment?: Omit<LiveComment, "id">) => {
      const current = roomRef.current;

      if (!current) {
        return;
      }

      if (syncInFlightRef.current) {
        return syncInFlightRef.current;
      }

      const task = getAuctionSnapshot(config, current.auction.auctionId)
        .then((snapshot) => replaceSnapshot(snapshot, comment))
        .catch((error: unknown) => {
          setToast(getDisplayErrorMessage(error));
        })
        .finally(() => {
          syncInFlightRef.current = null;
        });

      syncInFlightRef.current = task;
      return task;
    },
    [config, replaceSnapshot]
  );

  const loadInitialRoom = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const nextRoom = await loadLiveRoom(config);
      roomRef.current = nextRoom;
      lastServerSeqRef.current = nextRoom.snapshot.serverSeq;
      deadlineSyncSeqRef.current = null;
      setRoom(nextRoom);
      setSelectedAmountFen(nextRoom.snapshot.nextBidAmountFen);
      setRealtimeState("实时连接中");
    } catch (error: unknown) {
      setLoadError(getDisplayErrorMessage(error));
      setRoom(null);
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  const applySequencedEvent = useCallback(
    (
      eventType: AuctionWebSocketEvent,
      payload: RealtimePayload,
      comment?: Omit<LiveComment, "id">
    ) => {
      const current = roomRef.current;

      if (!current || !matchesCurrentAuction(current, payload)) {
        return;
      }

      const serverSeq = readNumber(payload.serverSeq);

      if (serverSeq === null) {
        void syncSnapshot(comment);
        return;
      }

      if (serverSeq <= lastServerSeqRef.current) {
        return;
      }

      if (serverSeq > lastServerSeqRef.current + 1) {
        setToast("竞拍状态已刷新");
        void syncSnapshot(comment);
        return;
      }

      lastServerSeqRef.current = serverSeq;
      setRoom((previous) => {
        if (!previous || !matchesCurrentAuction(previous, payload)) {
          return previous;
        }

        return {
          ...previous,
          snapshot: patchSnapshotFromEvent(
            previous.snapshot,
            previous.auction.incrementFen,
            previous.auction.capPriceFen,
            config.userId,
            eventType,
            payload
          ),
          comments: comment
            ? appendLiveComment(previous.comments, comment)
            : previous.comments
        };
      });

      void syncSnapshot();
    },
    [config.userId, syncSnapshot]
  );

  const handlePrivateEvent = useCallback(
    (payload: RealtimePayload, fallbackMessage: string) => {
      const current = roomRef.current;

      if (!current || !matchesCurrentAuction(current, payload)) {
        return;
      }

      const message = readString(payload.message) ?? fallbackMessage;
      setToast(message);
      setRoom((previous) =>
        previous
          ? {
              ...previous,
              comments: appendLiveComment(previous.comments, {
                kind: "system",
                author: "系统",
                text: message
              })
            }
          : previous
      );
      void syncSnapshot();
    },
    [syncSnapshot]
  );

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    void loadInitialRoom();
  }, [loadInitialRoom]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!room) {
      return;
    }

    setSelectedAmountFen((current) =>
      clampBidAmount(
        Math.max(current, room.snapshot.nextBidAmountFen),
        room.snapshot.nextBidAmountFen,
        room.auction.capPriceFen
      )
    );
  }, [room?.auction.capPriceFen, room?.snapshot.nextBidAmountFen]);

  useEffect(() => {
    if (toast === null) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!room || room.snapshot.status !== AuctionStatus.Running || remainingMs > 0) {
      return;
    }

    if (deadlineSyncSeqRef.current === room.snapshot.serverSeq) {
      return;
    }

    deadlineSyncSeqRef.current = room.snapshot.serverSeq;
    setToast("竞拍时间到，正在确认结果");
    void syncSnapshot();
  }, [remainingMs, room?.snapshot.serverSeq, room?.snapshot.status, syncSnapshot]);

  useEffect(() => {
    if (!room) {
      return;
    }

    const socket = createAuctionSocket(config);
    const activeRoomId = room.roomId;
    const activeAuctionId = room.auction.auctionId;
    socketRef.current = socket;
    let disposed = false;

    async function joinAndSync() {
      setRealtimeState("实时同步中");

      try {
        await joinRealtimeRooms(socket, activeRoomId, activeAuctionId);
        const snapshot = await requestSocketSnapshot(socket, activeAuctionId);

        if (!disposed) {
          replaceSnapshot(snapshot);
          setRealtimeState("实时已连接");
        }
      } catch (error: unknown) {
        if (!disposed) {
          setRealtimeState("实时同步失败");
          setToast(getDisplayErrorMessage(error));
          void syncSnapshot();
        }
      }
    }

    socket.on("connect", () => {
      void joinAndSync();
    });
    socket.on("disconnect", () => {
      if (!disposed) {
        setRealtimeState("实时重连中");
      }
    });
    socket.on("connect_error", (error) => {
      if (!disposed) {
        setRealtimeState("实时连接失败");
        setToast(error.message);
      }
    });
    socket.on(AuctionWebSocketEvent.AuctionSnapshot, (payload: unknown) => {
      if (isAuctionSnapshot(payload)) {
        replaceSnapshot(payload);
      }
    });
    socket.on(AuctionWebSocketEvent.AuctionStarted, (payload: RealtimePayload) => {
      applySequencedEvent(AuctionWebSocketEvent.AuctionStarted, payload, {
        kind: "system",
        author: "系统",
        text: "竞拍已开始"
      });
    });
    socket.on(AuctionWebSocketEvent.BidAccepted, (payload: RealtimePayload) => {
      const userId =
        readString(payload.userId) ?? readString(payload.highestBidderId);
      const amountFen =
        readNumber(payload.amountFen) ?? readNumber(payload.currentPriceFen);
      const maskedName = readString(payload.maskedName) ?? "用户";
      const isMine = userId === config.userId;

      applySequencedEvent(
        AuctionWebSocketEvent.BidAccepted,
        payload,
        amountFen === null
          ? undefined
          : {
              kind: isMine ? "bid" : "system",
              author: isMine ? "我" : maskedName,
              text: `${isMine ? "我" : maskedName} 出价 ${formatFen(amountFen)}`
            }
      );
    });
    socket.on(AuctionWebSocketEvent.AuctionExtended, (payload: RealtimePayload) => {
      applySequencedEvent(AuctionWebSocketEvent.AuctionExtended, payload, {
        kind: "system",
        author: "系统",
        text: "竞拍已延时"
      });
      setToast("竞拍已延时");
    });
    socket.on(AuctionWebSocketEvent.AuctionEnded, (payload: RealtimePayload) => {
      const status = readStatus(payload.status);
      const finalPriceFen = readNumber(payload.finalPriceFen);
      applySequencedEvent(AuctionWebSocketEvent.AuctionEnded, payload, {
        kind: "system",
        author: "系统",
        text:
          status === AuctionStatus.EndedSold && finalPriceFen !== null
            ? `竞拍成交，落槌价 ${formatFen(finalPriceFen)}`
            : "竞拍结束，本场流拍"
      });
      setToast(status === AuctionStatus.EndedSold ? "竞拍已成交" : "竞拍已结束");
    });
    socket.on(AuctionWebSocketEvent.OrderCreated, (payload: RealtimePayload) => {
      handlePrivateEvent(payload, "成交订单已生成");
    });
    socket.on(AuctionWebSocketEvent.AuctionCancelled, (payload: RealtimePayload) => {
      applySequencedEvent(AuctionWebSocketEvent.AuctionCancelled, payload, {
        kind: "system",
        author: "系统",
        text: "竞拍已取消"
      });
      setToast("竞拍已取消");
    });
    socket.on(AuctionWebSocketEvent.Leading, (payload: RealtimePayload) => {
      handlePrivateEvent(payload, "当前您已是最高价");
    });
    socket.on(AuctionWebSocketEvent.Outbid, (payload: RealtimePayload) => {
      handlePrivateEvent(payload, "你已被超越");
    });
    socket.on(AuctionWebSocketEvent.BidRejected, (payload: RealtimePayload) => {
      const message = readString(payload.message) ?? "出价失败";
      setToast(message);
      void syncSnapshot();
    });

    if (socket.connected) {
      void joinAndSync();
    }

    return () => {
      disposed = true;
      socketRef.current = null;
      socket.disconnect();
    };
  }, [
    applySequencedEvent,
    config,
    handlePrivateEvent,
    replaceSnapshot,
    room?.auction.auctionId,
    room?.roomId,
    syncSnapshot
  ]);

  function handleStep(direction: "down" | "up") {
    if (!room) {
      return;
    }

    setSelectedAmountFen((current) => {
      const next =
        direction === "up"
          ? current + room.auction.incrementFen
          : current - room.auction.incrementFen;
      return clampBidAmount(
        next,
        room.snapshot.nextBidAmountFen,
        room.auction.capPriceFen
      );
    });
  }

  async function handleBid() {
    if (!room || isSubmitting || !canBid || isLeading) {
      return;
    }

    const auctionId = room.auction.auctionId;
    const amountFen = selectedAmountFen;
    const clientBidId = createClientBidId();
    setIsSubmitting(true);

    try {
      const result = await placeBidByRest(config, auctionId, amountFen, clientBidId);
      setToast(
        result.reachedCapPrice
          ? "已达到封顶价，竞拍成交"
          : result.idempotent
            ? "本次出价已确认"
            : "出价成功，等待实时确认"
      );
      await syncSnapshot();
    } catch (error: unknown) {
      setToast(getDisplayErrorMessage(error));
      await syncSnapshot();
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <LiveShell>
        <StateNotice title="正在进入直播间" detail="连接竞拍服务..." />
      </LiveShell>
    );
  }

  if (!room) {
    return (
      <LiveShell>
        <StateNotice
          title="直播间加载失败"
          detail={loadError ?? "无法读取竞拍信息"}
          actionLabel="重试"
          onAction={() => void loadInitialRoom()}
        />
      </LiveShell>
    );
  }

  return (
    <main className="live-room">
      <section
        className="video-area"
        aria-label="直播画面"
        style={{ backgroundImage: `url(${room.streamPosterUrl})` }}
      >
        <LiveHeader room={room} realtimeState={realtimeState} />
        <LiveCommentList comments={room.comments} />
        <LiveActions likeCount={room.likeCount} />
      </section>

      <AuctionMiniCard
        room={room}
        remainingMs={remainingMs}
        onOpen={() => setPanelOpen(true)}
      />

      {panelOpen ? (
        <AuctionPanel
          room={room}
          remainingMs={remainingMs}
          selectedAmountFen={selectedAmountFen}
          isSubmitting={isSubmitting}
          isLeading={isLeading}
          isEnded={isEnded}
          canBid={canBid}
          onClose={() => setPanelOpen(false)}
          onStep={handleStep}
          onBid={() => void handleBid()}
        />
      ) : null}

      <BidToast message={toast} />
    </main>
  );
}

function LiveShell({ children }: { children: ReactNode }) {
  return (
    <main className="live-room">
      <section className="video-area fallback-video" aria-label="直播画面">
        {children}
      </section>
    </main>
  );
}

function StateNotice({
  title,
  detail,
  actionLabel,
  onAction
}: {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="state-notice">
      <strong>{title}</strong>
      <span>{detail}</span>
      {actionLabel ? (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function LiveHeader({
  room,
  realtimeState
}: {
  room: LiveRoomViewModel;
  realtimeState: string;
}) {
  return (
    <header className="live-header">
      <div className="host-avatar" aria-hidden="true">
        澄
      </div>
      <div className="host-copy">
        <strong>{room.hostName}</strong>
        <span>{room.hostBadge}</span>
      </div>
      <button type="button" className="follow-button">
        关注
      </button>
      <span className="viewer-count" title={realtimeState}>
        {room.viewerCount} 在线
      </span>
    </header>
  );
}

function LiveCommentList({ comments }: { comments: LiveComment[] }) {
  return (
    <section className="comment-list" aria-label="直播评论">
      {comments.map((comment) => (
        <p key={comment.id} className={`comment-row ${comment.kind}`}>
          <strong>{comment.author}</strong>
          <span>{comment.text}</span>
        </p>
      ))}
    </section>
  );
}

function LiveActions({ likeCount }: { likeCount: number }) {
  return (
    <footer className="live-actions" aria-label="直播互动">
      <button type="button" className="chat-input">
        说点什么...
      </button>
      <button type="button" className="round-action" aria-label="购物车">
        袋
      </button>
      <button type="button" className="round-action" aria-label="点赞">
        ♥
      </button>
      <span className="like-count">{formatCompact(likeCount)}</span>
    </footer>
  );
}

function AuctionMiniCard({
  room,
  remainingMs,
  onOpen
}: {
  room: LiveRoomViewModel;
  remainingMs: number;
  onOpen: () => void;
}) {
  const { auction, snapshot } = room;
  return (
    <button type="button" className="auction-mini-card" onClick={onOpen}>
      <img src={auction.item.imageUrl} alt="" />
      <span className="mini-copy">
        <small>{getPriceLabel(snapshot.status, snapshot.bidCount)}</small>
        <strong>{formatFen(snapshot.currentPriceFen)}</strong>
        <em>{auction.item.name}</em>
      </span>
      <span className="mini-meta">
        <Countdown remainingMs={remainingMs} status={snapshot.status} compact />
        <b>{snapshot.bidCount} 次出价</b>
      </span>
    </button>
  );
}

function AuctionPanel({
  room,
  remainingMs,
  selectedAmountFen,
  isSubmitting,
  isLeading,
  isEnded,
  canBid,
  onClose,
  onStep,
  onBid
}: {
  room: LiveRoomViewModel;
  remainingMs: number;
  selectedAmountFen: number;
  isSubmitting: boolean;
  isLeading: boolean;
  isEnded: boolean;
  canBid: boolean;
  onClose: () => void;
  onStep: (direction: "down" | "up") => void;
  onBid: () => void;
}) {
  const { auction, snapshot } = room;
  const bidDisabled = isSubmitting || isEnded || isLeading || !canBid;
  const bidButtonText = getBidButtonText(
    snapshot.status,
    isSubmitting,
    isLeading,
    remainingMs
  );

  return (
    <div className="sheet-layer" role="presentation">
      <button type="button" className="sheet-scrim" onClick={onClose} aria-label="关闭竞拍面板" />
      <section className="auction-panel" role="dialog" aria-modal="true" aria-label="竞拍详情">
        <header className="panel-header">
          <div className="product-media">
            <img src={auction.item.imageUrl} alt="" />
          </div>
          <div className="panel-title">
            <span className="status-chip">{statusText(snapshot.status)}</span>
            <h1>{auction.item.name}</h1>
            <p>{auction.item.description}</p>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="selling-points">
          {auction.item.sellingPoints.map((point) => (
            <span key={point}>{point}</span>
          ))}
        </div>

        <section className="price-band" aria-label="竞拍价格">
          <div>
            <span>{getPriceLabel(snapshot.status, snapshot.bidCount)}</span>
            <strong>{formatFen(snapshot.currentPriceFen)}</strong>
          </div>
          <Countdown remainingMs={remainingMs} status={snapshot.status} />
        </section>

        <section className="rule-grid" aria-label="竞拍规则">
          <Metric label="起拍价" value={formatFen(auction.startPriceFen)} />
          <Metric label="加价幅度" value={formatFen(auction.incrementFen)} />
          <Metric label="封顶价" value={formatFen(auction.capPriceFen)} />
          <Metric
            label="延时"
            value={`${auction.antiSnipingWindowSeconds}秒 / +${auction.extensionSeconds}秒`}
          />
        </section>

        <section className="my-state" aria-label="我的竞拍状态">
          <span>{isLeading ? "当前您已是最高价" : "我的出价"}</span>
          <strong>{snapshot.myBidAmountFen === null ? "暂未出价" : formatFen(snapshot.myBidAmountFen)}</strong>
          <em>{snapshot.myRank === null ? "暂无排名" : `第 ${snapshot.myRank} 名`}</em>
        </section>

        <BidStepper
          selectedAmountFen={selectedAmountFen}
          minAmountFen={snapshot.nextBidAmountFen}
          maxAmountFen={auction.capPriceFen}
          incrementFen={auction.incrementFen}
          disabled={bidDisabled}
          onStep={onStep}
        />

        <button
          type="button"
          className="primary-bid-button"
          disabled={bidDisabled}
          onClick={onBid}
        >
          {bidButtonText}
        </button>

        <Leaderboard entries={snapshot.leaderboard} />
      </section>
    </div>
  );
}

function BidStepper({
  selectedAmountFen,
  minAmountFen,
  maxAmountFen,
  incrementFen,
  disabled,
  onStep
}: {
  selectedAmountFen: number;
  minAmountFen: number;
  maxAmountFen: number;
  incrementFen: number;
  disabled: boolean;
  onStep: (direction: "down" | "up") => void;
}) {
  return (
    <section className="bid-stepper" aria-label="出价金额">
      <button
        type="button"
        aria-label={`减少 ${formatFen(incrementFen)}`}
        disabled={disabled || selectedAmountFen <= minAmountFen}
        onClick={() => onStep("down")}
      >
        −
      </button>
      <div>
        <span>本次出价</span>
        <strong>{formatFen(selectedAmountFen)}</strong>
      </div>
      <button
        type="button"
        aria-label={`增加 ${formatFen(incrementFen)}`}
        disabled={disabled || selectedAmountFen >= maxAmountFen}
        onClick={() => onStep("up")}
      >
        +
      </button>
    </section>
  );
}

function Countdown({
  remainingMs,
  status,
  compact = false
}: {
  remainingMs: number;
  status: AuctionStatus;
  compact?: boolean;
}) {
  const running = status === AuctionStatus.Running;
  const urgent = running && remainingMs <= 10_000;
  const className = compact
    ? `countdown compact${urgent ? " urgent" : ""}`
    : `countdown${urgent ? " urgent" : ""}`;

  return (
    <div className={className}>
      <span>{running ? "剩余" : "状态"}</span>
      <strong>{running ? formatDuration(remainingMs) : statusText(status)}</strong>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Leaderboard({ entries }: { entries: AuctionLeaderboardEntry[] }) {
  return (
    <section className="leaderboard" aria-label="实时排名">
      <header>
        <strong>实时排名</strong>
        <span>{entries.length === 0 ? "等待首个出价" : "Top 3"}</span>
      </header>
      {entries.length === 0 ? (
        <p className="empty-rank">暂无出价</p>
      ) : (
        entries.slice(0, 3).map((entry) => (
          <div key={entry.userId} className="rank-row">
            <span>{entry.rank}</span>
            <strong>{entry.maskedName}</strong>
            <em>{formatFen(entry.amountFen)}</em>
          </div>
        ))
      )}
    </section>
  );
}

function BidToast({ message }: { message: string | null }) {
  return message ? <div className="bid-toast">{message}</div> : null;
}

function patchSnapshotFromEvent(
  snapshot: AuctionSnapshot,
  incrementFen: number,
  capPriceFen: number,
  currentUserId: string,
  eventType: AuctionWebSocketEvent,
  payload: RealtimePayload
): AuctionSnapshot {
  const serverSeq = readNumber(payload.serverSeq) ?? snapshot.serverSeq;
  const serverTime = readString(payload.serverTime) ?? new Date().toISOString();

  if (eventType === AuctionWebSocketEvent.AuctionStarted) {
    const currentPriceFen = readNumber(payload.currentPriceFen) ?? snapshot.currentPriceFen;
    return {
      ...snapshot,
      status: AuctionStatus.Running,
      currentPriceFen,
      nextBidAmountFen: Math.min(currentPriceFen + incrementFen, capPriceFen),
      endTime: readString(payload.endTime) ?? snapshot.endTime,
      serverSeq,
      serverTime
    };
  }

  if (eventType === AuctionWebSocketEvent.BidAccepted) {
    const currentPriceFen =
      readNumber(payload.currentPriceFen) ??
      readNumber(payload.amountFen) ??
      snapshot.currentPriceFen;
    const userId =
      readString(payload.userId) ?? readString(payload.highestBidderId);
    const isMine = userId === currentUserId;

    return {
      ...snapshot,
      status: AuctionStatus.Running,
      currentPriceFen,
      nextBidAmountFen: Math.min(currentPriceFen + incrementFen, capPriceFen),
      highestBidderMaskedName:
        readString(payload.maskedName) ?? snapshot.highestBidderMaskedName,
      myBidAmountFen: isMine ? currentPriceFen : snapshot.myBidAmountFen,
      myRank: isMine ? 1 : snapshot.myRank,
      bidCount: readNumber(payload.bidCount) ?? snapshot.bidCount,
      endTime: readString(payload.endTime) ?? snapshot.endTime,
      serverSeq,
      serverTime
    };
  }

  if (eventType === AuctionWebSocketEvent.AuctionExtended) {
    return {
      ...snapshot,
      endTime: readString(payload.newEndTime) ?? readString(payload.endTime) ?? snapshot.endTime,
      serverSeq,
      serverTime
    };
  }

  if (eventType === AuctionWebSocketEvent.AuctionEnded) {
    const status = readStatus(payload.status) ?? snapshot.status;
    const finalPriceFen = readNumber(payload.finalPriceFen);

    return {
      ...snapshot,
      status,
      currentPriceFen: finalPriceFen ?? snapshot.currentPriceFen,
      nextBidAmountFen: finalPriceFen ?? snapshot.currentPriceFen,
      highestBidderMaskedName:
        readString(payload.winnerMaskedName) ?? snapshot.highestBidderMaskedName,
      serverSeq,
      serverTime
    };
  }

  if (eventType === AuctionWebSocketEvent.AuctionCancelled) {
    return {
      ...snapshot,
      status: AuctionStatus.Cancelled,
      nextBidAmountFen: snapshot.currentPriceFen,
      serverSeq,
      serverTime
    };
  }

  return {
    ...snapshot,
    serverSeq,
    serverTime
  };
}

function isAuctionSnapshot(value: unknown): value is AuctionSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AuctionSnapshot).auctionId === "string" &&
    typeof (value as AuctionSnapshot).roomId === "string" &&
    typeof (value as AuctionSnapshot).serverSeq === "number" &&
    typeof (value as AuctionSnapshot).serverTime === "string" &&
    Array.isArray((value as AuctionSnapshot).leaderboard)
  );
}

function matchesCurrentAuction(
  room: LiveRoomViewModel,
  payload: RealtimePayload
): boolean {
  const auctionId = readString(payload.auctionId);

  return auctionId === null || auctionId === room.auction.auctionId;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStatus(value: unknown): AuctionStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  return Object.values(AuctionStatus).includes(value as AuctionStatus)
    ? (value as AuctionStatus)
    : null;
}

function clampBidAmount(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getRemainingMs(endTime: string | null, nowMs: number): number {
  if (endTime === null) {
    return 0;
  }

  return Math.max(0, new Date(endTime).getTime() - nowMs);
}

function getPriceLabel(status: AuctionStatus, bidCount: number): string {
  if (status === AuctionStatus.EndedSold) {
    return "落槌价";
  }

  return bidCount === 0 ? "起拍价" : "当前最高价";
}

function getBidButtonText(
  status: AuctionStatus,
  isSubmitting: boolean,
  isLeading: boolean,
  remainingMs: number
): string {
  if (isSubmitting) {
    return "出价中";
  }

  if (isLeading) {
    return "当前您已是最高价";
  }

  if (status === AuctionStatus.Draft || status === AuctionStatus.Scheduled) {
    return "等待开拍";
  }

  if (status === AuctionStatus.Running && remainingMs <= 0) {
    return "确认结果中";
  }

  if (status === AuctionStatus.EndedSold) {
    return "竞拍已成交";
  }

  if (status === AuctionStatus.EndedUnsold) {
    return "竞拍已流拍";
  }

  if (status === AuctionStatus.Cancelled) {
    return "竞拍已取消";
  }

  return "立即出价";
}

function statusText(status: AuctionStatus): string {
  switch (status) {
    case AuctionStatus.Draft:
      return "草稿";
    case AuctionStatus.Scheduled:
      return "未开始";
    case AuctionStatus.Running:
      return "竞拍中";
    case AuctionStatus.EndedSold:
      return "已成交";
    case AuctionStatus.EndedUnsold:
      return "已流拍";
    case AuctionStatus.Cancelled:
      return "已取消";
  }
}

function formatDuration(value: number): string {
  const totalSeconds = Math.max(0, Math.ceil(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatFen(value: number): string {
  return `¥${(value / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}

function formatCompact(value: number): string {
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(1)}w`;
  }

  return value.toLocaleString("zh-CN");
}

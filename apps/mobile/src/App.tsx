export function App() {
  return (
    <main className="live-room">
      <section className="live-header">
        <div>
          <p className="room-label">Live Room</p>
          <h1>直播竞拍 H5</h1>
        </div>
        <span className="viewer-count">100 在线</span>
      </section>

      <section className="video-area" aria-label="simulated live room">
        <div className="video-copy">
          <strong>模拟直播画面</strong>
          <span>Day 1 骨架占位</span>
        </div>
      </section>

      <section className="auction-mini-card">
        <div>
          <p>竞拍商品</p>
          <strong>后续接入实时出价</strong>
        </div>
        <button type="button">查看</button>
      </section>
    </main>
  );
}

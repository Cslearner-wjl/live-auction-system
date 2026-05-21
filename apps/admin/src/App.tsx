export function App() {
  return (
    <main className="admin-shell">
      <section className="admin-header">
        <div>
          <p className="eyebrow">Merchant Console</p>
          <h1>直播竞拍管理后台</h1>
        </div>
        <span className="status-pill">Day 1 骨架</span>
      </section>

      <section className="admin-grid" aria-label="Day 1 modules">
        <article>
          <h2>商品与规则</h2>
          <p>后续实现商品创建、起拍价、固定加价、封顶价和延时规则配置。</p>
        </article>
        <article>
          <h2>竞拍控制</h2>
          <p>后续实现启动竞拍、取消异常竞拍和状态进度查看。</p>
        </article>
        <article>
          <h2>订单管理</h2>
          <p>后续展示成交订单、成交价、买家和支付状态。</p>
        </article>
      </section>
    </main>
  );
}

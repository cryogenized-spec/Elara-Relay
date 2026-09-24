const gates = [
  ['Runtime', 'Node 24.x'],
  ['Type safety', 'TS6 + TS7'],
  ['Browser proof', 'Playwright'],
  ['Review posture', 'Adversarial'],
] as const;

export function App() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="elara-title">
        <div className="eyebrow">PASS 0 · FORTRESS FLOOR</div>
        <h1 id="elara-title">Elara Relay</h1>
        <p>
          Portable operations infrastructure first. AI providers, storage hosts,
          and interfaces remain replaceable adapters.
        </p>
        <div className="status" role="status" aria-label="Foundation status">
          <span className="statusDot" aria-hidden="true" />
          Foundation online
        </div>
      </section>

      <section className="gateGrid" aria-label="Foundation gates">
        {gates.map(([label, value]) => (
          <article className="gate" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
    </main>
  );
}

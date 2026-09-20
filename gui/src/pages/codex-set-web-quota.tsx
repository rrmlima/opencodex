import { useEffect, useState } from "react";

export interface WebQuotaData {
  model: string;
  reasoningEffort: string;
  totalUsed: number;
  measuredLimit: number;
  windowHours: number;
  remainingSeconds: number;
  confidence: number;
}

export default function CodexSetWebQuota({ apiBase }: { apiBase: string }) {
  const [data, setData] = useState<WebQuotaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unmounted = false;
    const load = () => {
      fetch(`${apiBase}/api/web-quota`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!unmounted && d) {
            setData(d);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!unmounted) setLoading(false);
        });
    };
    load();
    const interval = setInterval(load, 10_000);
    return () => {
      unmounted = true;
      clearInterval(interval);
    };
  }, [apiBase]);

  if (loading && !data) {
    return <div className="card" style={{ padding: "20px" }}>Carregando Web Quota...</div>;
  }

  if (!data) {
    return (
      <div className="card" style={{ padding: "20px" }}>
        <p>A integração Web Quota não está ativa ou ainda não possui dados observados.</p>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((data.totalUsed / Math.max(1, data.measuredLimit)) * 100));

  return (
    <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0 }}>Web Quota Monitor</h3>
          <p style={{ margin: "4px 0 0", color: "var(--muted-foreground)" }}>
            {data.model} ({data.reasoningEffort} effort)
          </p>
        </div>
        <span style={{ fontSize: "12px", padding: "4px 8px", borderRadius: "4px", background: "#10b98122", color: "#10b981" }}>
          Active
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
        <div style={{ padding: "12px", borderRadius: "6px", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>Uso Observado</div>
          <div style={{ fontSize: "20px", fontWeight: "bold" }}>
            {data.totalUsed} / {data.measuredLimit}
          </div>
        </div>
        <div style={{ padding: "12px", borderRadius: "6px", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>Janela de Reset</div>
          <div style={{ fontSize: "20px", fontWeight: "bold" }}>
            {Math.floor(data.remainingSeconds / 60)} min
          </div>
        </div>
        <div style={{ padding: "12px", borderRadius: "6px", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>Janela Total</div>
          <div style={{ fontSize: "20px", fontWeight: "bold" }}>{data.windowHours}h</div>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
          <span>Consumo da Janela</span>
          <span>{pct}%</span>
        </div>
        <div style={{ height: "8px", borderRadius: "4px", background: "var(--border)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: pct > 85 ? "#ef4444" : pct > 60 ? "#f59e0b" : "#10b981",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useT } from "../i18n/shared";

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
  const t = useT();
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
    return <div className="card" style={{ padding: "20px" }}>{t("codexSet.webquota.loading")}</div>;
  }

  if (!data) {
    return (
      <div className="card" style={{ padding: "20px" }}>
        <p>{t("codexSet.webquota.empty")}</p>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((data.totalUsed / Math.max(1, data.measuredLimit)) * 100));

  return (
    <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0 }}>{t("codexSet.webquota.title")}</h3>
          <p style={{ margin: "4px 0 0", color: "var(--muted-foreground)" }}>
            <code>{data.model}</code> <span>({data.reasoningEffort})</span>
          </p>
        </div>
        <span style={{ fontSize: "12px", padding: "4px 8px", borderRadius: "4px", background: "#10b98122", color: "#10b981" }}>
          {t("codexSet.webquota.active")}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
        <div style={{ padding: "12px", borderRadius: "6px", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{t("codexSet.webquota.observedUsage")}</div>
          <div style={{ fontSize: "20px", fontWeight: "bold" }}>
            {data.totalUsed} / {data.measuredLimit}
          </div>
        </div>
        <div style={{ padding: "12px", borderRadius: "6px", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{t("codexSet.webquota.resetWindow")}</div>
          <div style={{ fontSize: "20px", fontWeight: "bold" }}>
            {Math.floor(data.remainingSeconds / 60)} <code>min</code>
          </div>
        </div>
        <div style={{ padding: "12px", borderRadius: "6px", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{t("codexSet.webquota.totalWindow")}</div>
          <div style={{ fontSize: "20px", fontWeight: "bold" }}>{data.windowHours}<code>h</code></div>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
          <span>{t("codexSet.webquota.windowConsumption")}</span>
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

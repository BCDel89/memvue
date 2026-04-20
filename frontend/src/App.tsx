import { useState, useEffect, useCallback } from "react";
import AllMemories from "./tabs/AllMemories";
import LocalFiles from "./tabs/LocalFiles";
import Graph from "./tabs/Graph";
import { Consolidate } from "./tabs/Consolidate";
import Analytics from "./tabs/Analytics";
import { Settings } from "./tabs/Settings";
import StatsBar from "./components/StatsBar";
import { api } from "./api/client";
import type { AdapterInfo } from "./api/client";

type Tab = "all" | "files" | "graph" | "consolidate" | "analytics" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "files", label: "Files" },
  { id: "graph", label: "Graph" },
  { id: "consolidate", label: "Consolidate" },
  { id: "analytics", label: "Analytics" },
  { id: "settings", label: "Settings" },
];

const USER_ID_KEY = "memvue_user_id";

export default function App() {
  const [tab, setTab] = useState<Tab>("all");
  const [userId, setUserId] = useState(
    () => localStorage.getItem(USER_ID_KEY) ?? "default"
  );
  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);
  const [stats, setStats] = useState<{ total: number; sources: Record<string, number> } | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [agentName, setAgentName] = useState("agent");
  const [entryPoints, setEntryPoints] = useState<string[]>(["MEMORY.md", "CLAUDE.md"]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    api.adapters().then(setAdapters).catch(() => {});
    setRefreshKey(k => k + 1);
    setUserId(localStorage.getItem(USER_ID_KEY) ?? "default");
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const h = await api.health();
      setConnected(true);
      const stored = localStorage.getItem(USER_ID_KEY);
      if ((!stored || stored === "default") && h.default_user_id) {
        localStorage.setItem(USER_ID_KEY, h.default_user_id);
        setUserId(h.default_user_id);
      }
      if (h.agent_name) setAgentName(h.agent_name);
      if (h.graph_entry_points?.length) setEntryPoints(h.graph_entry_points);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    api.adapters().then(setAdapters).catch(() => {});
  }, [checkHealth]);

  const loadStats = useCallback(async () => {
    try {
      const s = await api.stats(userId);
      setStats(s);
    } catch {
      // stats are best-effort
    }
  }, [userId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-gray-800 px-3 sm:px-4 py-2 flex items-center gap-3 shrink-0">
        <span className="font-semibold tracking-tight text-white shrink-0">memvue</span>

        <div
          className={`w-2 h-2 rounded-full shrink-0 ${
            connected === null ? "bg-gray-600" : connected ? "bg-emerald-500" : "bg-red-500"
          }`}
          title={connected === null ? "checking…" : connected ? "connected" : "backend unreachable"}
        />

        {/* Tab nav — scrollable so it never wraps */}
        <nav className="flex gap-0.5 overflow-x-auto flex-1 min-w-0 scrollbar-none">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors shrink-0 ${
                tab === t.id ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {stats && (
          <span className="hidden sm:inline text-xs text-gray-500 shrink-0">{stats.total.toLocaleString()} memories</span>
        )}
      </header>

      {/* Stats bar */}
      {stats && (
        <StatsBar
          total={stats.total}
          sources={stats.sources}
          onRefresh={loadStats}
        />
      )}

      {/* Tab content — flex col so children can use flex-1 to fill + scroll */}
      <main className="flex-1 flex flex-col min-h-0">
        {tab === "all" && (
          <AllMemories key={refreshKey} adapters={adapters} userId={userId} onStatsChange={loadStats} />
        )}
        {tab === "files" && (
          <LocalFiles key={refreshKey} adapters={adapters} userId={userId} onStatsChange={loadStats} />
        )}
        {tab === "graph" && <Graph key={refreshKey} userId={userId} adapters={adapters} agentName={agentName} entryPoints={entryPoints} />}
        {tab === "consolidate" && <Consolidate key={refreshKey} userId={userId} onStatsChange={loadStats} />}
        {tab === "analytics" && <Analytics key={refreshKey} userId={userId} adapters={adapters} />}
        {tab === "settings" && <Settings key={refreshKey} onRefresh={refresh} />}
      </main>

    </div>
  );
}

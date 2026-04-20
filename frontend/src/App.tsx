import { useState, useEffect, useCallback, useRef } from "react";
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
const WORKSPACES_KEY = "memvue_workspaces";

function getStoredWorkspaces(): string[] {
  try {
    return JSON.parse(localStorage.getItem(WORKSPACES_KEY) || "[]");
  } catch {
    return [];
  }
}

function addStoredWorkspace(ws: string) {
  const list = getStoredWorkspaces().filter(w => w !== ws);
  list.unshift(ws);
  localStorage.setItem(WORKSPACES_KEY, JSON.stringify(list.slice(0, 10)));
}

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
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const [workspaceInput, setWorkspaceInput] = useState("");
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>(() => getStoredWorkspaces());
  const workspaceRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    api.adapters().then(setAdapters).catch(() => {});
    setRefreshKey(k => k + 1);
    const current = localStorage.getItem(USER_ID_KEY) ?? "default";
    setUserId(current);
    addStoredWorkspace(current);
    setRecentWorkspaces(getStoredWorkspaces());
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const h = await api.health();
      setConnected(true);
      const serverWs = h.workspace || h.default_user_id;
      const stored = localStorage.getItem(USER_ID_KEY);
      if ((!stored || stored === "default") && serverWs) {
        localStorage.setItem(USER_ID_KEY, serverWs);
        setUserId(serverWs);
        addStoredWorkspace(serverWs);
        setRecentWorkspaces(getStoredWorkspaces());
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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (workspaceRef.current && !workspaceRef.current.contains(e.target as Node)) {
        setShowWorkspaceDropdown(false);
        setWorkspaceInput("");
      }
    }
    if (showWorkspaceDropdown) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showWorkspaceDropdown]);

  function switchWorkspace(ws: string) {
    const trimmed = ws.trim();
    if (!trimmed) return;
    localStorage.setItem(USER_ID_KEY, trimmed);
    setUserId(trimmed);
    addStoredWorkspace(trimmed);
    setRecentWorkspaces(getStoredWorkspaces());
    setShowWorkspaceDropdown(false);
    setWorkspaceInput("");
    setRefreshKey(k => k + 1);
  }

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

        {/* Workspace selector */}
        <div className="relative shrink-0" ref={workspaceRef}>
          <button
            onClick={() => {
              setShowWorkspaceDropdown(v => !v);
              setWorkspaceInput("");
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 rounded-md transition-colors font-mono"
            title="Switch workspace"
          >
            <span className="text-gray-500">@</span>
            <span className="max-w-[120px] truncate">{userId}</span>
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showWorkspaceDropdown && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
              <div className="p-2 border-b border-gray-800">
                <form onSubmit={e => { e.preventDefault(); switchWorkspace(workspaceInput); }}>
                  <input
                    autoFocus
                    type="text"
                    value={workspaceInput}
                    onChange={e => setWorkspaceInput(e.target.value)}
                    placeholder="Workspace name…"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-violet-500 font-mono"
                  />
                </form>
              </div>
              {recentWorkspaces.length > 0 && (
                <div className="py-1">
                  <p className="px-3 py-1 text-[10px] text-gray-600 uppercase tracking-wider">Recent</p>
                  {recentWorkspaces.map(ws => (
                    <button
                      key={ws}
                      onClick={() => switchWorkspace(ws)}
                      className={`w-full text-left px-3 py-1.5 text-xs font-mono truncate transition-colors ${
                        ws === userId
                          ? "text-violet-400 bg-violet-500/10"
                          : "text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      {ws === userId && <span className="mr-1">✓</span>}
                      {ws}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

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

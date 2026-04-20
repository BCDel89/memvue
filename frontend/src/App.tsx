import { useState, useEffect, useCallback } from "react";
import AllMemories from "./tabs/AllMemories";
import LocalFiles from "./tabs/LocalFiles";
import Graph from "./tabs/Graph";
import StatsBar from "./components/StatsBar";
import { api } from "./api/client";
import type { AdapterInfo } from "./api/client";

type Tab = "all" | "files" | "graph";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All Memories" },
  { id: "files", label: "Local Files" },
  { id: "graph", label: "Graph" },
];

const USER_ID_KEY = "memvue_user_id";
const API_KEY_KEY = "memvue_api_key";

export default function App() {
  const [tab, setTab] = useState<Tab>("all");
  const [userId, setUserId] = useState(
    () => localStorage.getItem(USER_ID_KEY) ?? "default"
  );
  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);
  const [stats, setStats] = useState<{ total: number; sources: Record<string, number> } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(
    () => localStorage.getItem(API_KEY_KEY) ?? ""
  );
  const [userIdInput, setUserIdInput] = useState(userId);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [agentName, setAgentName] = useState("agent");
  const [entryPoints, setEntryPoints] = useState<string[]>(["MEMORY.md", "CLAUDE.md"]);

  const checkHealth = useCallback(async () => {
    try {
      const h = await api.health();
      setConnected(true);
      const stored = localStorage.getItem(USER_ID_KEY);
      if ((!stored || stored === "default") && h.default_user_id) {
        localStorage.setItem(USER_ID_KEY, h.default_user_id);
        setUserId(h.default_user_id);
        setUserIdInput(h.default_user_id);
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

  function saveSettings() {
    localStorage.setItem(API_KEY_KEY, apiKeyInput);
    localStorage.setItem(USER_ID_KEY, userIdInput);
    setUserId(userIdInput);
    setShowSettings(false);
    checkHealth();
  }

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-gray-800 px-4 h-12 flex items-center gap-4 shrink-0">
        <span className="font-semibold tracking-tight text-white">memvue</span>

        <div
          className={`w-2 h-2 rounded-full ${
            connected === null
              ? "bg-gray-600"
              : connected
              ? "bg-emerald-500"
              : "bg-red-500"
          }`}
          title={connected === null ? "checking…" : connected ? "connected" : "backend unreachable"}
        />

        {/* Tabs */}
        <nav className="flex gap-1 ml-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                tab === t.id
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {stats && (
            <span className="text-xs text-gray-500">{stats.total} memories</span>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="text-gray-400 hover:text-gray-200 transition-colors"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Stats bar */}
      {stats && (
        <StatsBar
          total={stats.total}
          sources={stats.sources}
          onRefresh={loadStats}
        />
      )}

      {/* Tab content */}
      <main className="flex-1 overflow-hidden">
        {tab === "all" && (
          <AllMemories adapters={adapters} userId={userId} onStatsChange={loadStats} />
        )}
        {tab === "files" && (
          <LocalFiles adapters={adapters} userId={userId} onStatsChange={loadStats} />
        )}
        {tab === "graph" && <Graph userId={userId} adapters={adapters} agentName={agentName} entryPoints={entryPoints} />}
      </main>

      {/* Settings modal */}
      {showSettings && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={(e) => e.target === e.currentTarget && setShowSettings(false)}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Settings</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">User ID</label>
                <input
                  type="text"
                  value={userIdInput}
                  onChange={(e) => setUserIdInput(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
                  placeholder="default"
                />
                <p className="text-xs text-gray-600 mt-1">
                  Used to scope memories in mem0
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">API Key</label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
                  placeholder="Leave empty if MEMVUE_API_KEY is not set"
                />
                <p className="text-xs text-gray-600 mt-1">
                  Sent as <code className="text-gray-500">x-api-key</code> header
                </p>
              </div>

              <div className="text-xs text-gray-600 border-t border-gray-800 pt-3">
                Backend: <code className="text-gray-500">http://localhost:7700</code>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

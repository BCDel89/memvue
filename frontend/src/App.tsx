import { useState, useEffect, useCallback } from "react";
import AllMemories from "./tabs/AllMemories";
import LocalFiles from "./tabs/LocalFiles";
import Graph from "./tabs/Graph";
import { Consolidate } from "./tabs/Consolidate";
import Analytics from "./tabs/Analytics";
import StatsBar from "./components/StatsBar";
import { api } from "./api/client";
import type { AdapterInfo, LLMConfig } from "./api/client";

type Tab = "all" | "files" | "graph" | "consolidate" | "analytics";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All Memories" },
  { id: "files", label: "Local Files" },
  { id: "graph", label: "Graph" },
  { id: "consolidate", label: "Consolidate" },
  { id: "analytics", label: "Analytics" },
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
  const [extensionsInput, setExtensionsInput] = useState(".md");
  const [fsRoots, setFsRoots] = useState<string[]>([]);
  const [newRootInput, setNewRootInput] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [llmConfig, setLLMConfig] = useState<LLMConfig>({ provider: "", base_url: "", api_key: "", model: "" });
  const [llmTestStatus, setLLMTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [llmTestMessage, setLLMTestMessage] = useState("");
  const [supportUrl, setSupportUrl] = useState("");
  const [appVersion, setAppVersion] = useState("");

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
      if (h.fs_extensions?.length) setExtensionsInput(h.fs_extensions.join(","));
      if (h.fs_roots) setFsRoots(h.fs_roots);
      if (h.support_url) setSupportUrl(h.support_url);
      if (h.version) setAppVersion(h.version);
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

  async function handleAddRoot() {
    const path = newRootInput.trim();
    if (!path) return;
    try {
      const r = await api.addFsRoot(path);
      setFsRoots(r.fs_roots);
      setNewRootInput("");
      api.adapters().then(setAdapters).catch(() => {});
      setRefreshKey(k => k + 1);
    } catch (e) {
      alert(`Failed to add directory: ${e}`);
    }
  }

  async function handleRemoveRoot(path: string) {
    try {
      const r = await api.removeFsRoot(path);
      setFsRoots(r.fs_roots);
      api.adapters().then(setAdapters).catch(() => {});
      setRefreshKey(k => k + 1);
    } catch (e) {
      alert(`Failed to remove directory: ${e}`);
    }
  }

  async function handleTestLLM() {
    setLLMTestStatus("testing")
    setLLMTestMessage("")
    try {
      await api.saveLLMConfig(llmConfig)
      const r = await api.testLLM()
      setLLMTestStatus(r.ok ? "ok" : "error")
      setLLMTestMessage(r.ok ? `${r.provider} · ${r.model}` : (r.error ?? "Failed"))
    } catch (e) {
      setLLMTestStatus("error")
      setLLMTestMessage(String(e))
    }
  }

  async function saveSettings() {
    localStorage.setItem(API_KEY_KEY, apiKeyInput);
    localStorage.setItem(USER_ID_KEY, userIdInput);
    setUserId(userIdInput);
    const exts = extensionsInput.split(",").map(e => e.trim()).filter(Boolean);
    if (exts.length) {
      try { await api.updateExtensions(exts) } catch { /* non-fatal */ }
    }
    try { await api.saveLLMConfig(llmConfig) } catch { /* non-fatal */ }
    setRefreshKey(k => k + 1);
    setShowSettings(false);
    checkHealth();
  }

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-gray-800 px-4 py-1 flex flex-wrap items-center gap-x-4 gap-y-1 shrink-0 min-h-12">
        <span className="font-semibold tracking-tight text-white">memvue</span>

        <div
          className={`w-2 h-2 rounded-full shrink-0 ${
            connected === null
              ? "bg-gray-600"
              : connected
              ? "bg-emerald-500"
              : "bg-red-500"
          }`}
          title={connected === null ? "checking…" : connected ? "connected" : "backend unreachable"}
        />

        {/* Tabs — wraps below logo on very small screens */}
        <nav className="flex gap-1 sm:ml-2 order-3 sm:order-none w-full sm:w-auto pb-1 sm:pb-0">
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
            <span className="hidden sm:inline text-xs text-gray-500">{stats.total} memories</span>
          )}
          <button
            onClick={() => {
              setShowSettings(true)
              setLLMTestStatus("idle")
              api.getLLMConfig().then(setLLMConfig).catch(() => {})
            }}
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
          <AllMemories key={refreshKey} adapters={adapters} userId={userId} onStatsChange={loadStats} />
        )}
        {tab === "files" && (
          <LocalFiles key={refreshKey} adapters={adapters} userId={userId} onStatsChange={loadStats} />
        )}
        {tab === "graph" && <Graph key={refreshKey} userId={userId} adapters={adapters} agentName={agentName} entryPoints={entryPoints} />}
        {tab === "consolidate" && <Consolidate key={refreshKey} userId={userId} onStatsChange={loadStats} />}
        {tab === "analytics" && <Analytics key={refreshKey} userId={userId} adapters={adapters} />}
      </main>

      {/* Settings modal */}
      {showSettings && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50"
          onClick={(e) => e.target === e.currentTarget && setShowSettings(false)}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-t-xl sm:rounded-xl p-6 w-full max-w-md shadow-xl max-h-[90dvh] overflow-y-auto">
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

              <div>
                <label className="block text-sm text-gray-400 mb-1">File Extensions</label>
                <input
                  type="text"
                  value={extensionsInput}
                  onChange={(e) => setExtensionsInput(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
                  placeholder=".md"
                />
                <p className="text-xs text-gray-600 mt-1">
                  Comma-separated extensions to scan (e.g. <code className="text-gray-500">.md,.txt</code>)
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Memory Directories</label>
                <div className="space-y-1">
                  {fsRoots.length === 0 && (
                    <p className="text-xs text-gray-600 italic">No directories configured.</p>
                  )}
                  {fsRoots.map((root) => (
                    <div key={root} className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1">
                      <code className="flex-1 min-w-0 truncate text-xs text-gray-300" title={root}>{root}</code>
                      <button
                        onClick={() => handleRemoveRoot(root)}
                        className="text-gray-500 hover:text-red-400 px-1 text-sm"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1 mt-2">
                  <input
                    type="text"
                    value={newRootInput}
                    onChange={(e) => setNewRootInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddRoot() }}
                    className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
                    placeholder="/path/to/notes"
                  />
                  <button
                    onClick={handleAddRoot}
                    disabled={!newRootInput.trim()}
                    className="px-3 py-2 text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white rounded-lg transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* AI Features */}
              <div className="border-t border-gray-800 pt-4 space-y-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">AI Features</label>
                  <p className="text-xs text-gray-600">Optional — enables ingest, smart tagging, and digest. Works with Ollama, OpenRouter, or any OpenAI-compatible API.</p>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Provider</label>
                  <select
                    value={llmConfig.provider}
                    onChange={e => setLLMConfig(c => ({ ...c, provider: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
                  >
                    <option value="">None (AI features disabled)</option>
                    <option value="ollama">Ollama (local)</option>
                    <option value="openai_compatible">OpenAI-compatible (OpenRouter, Groq…)</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </div>

                {llmConfig.provider && llmConfig.provider !== "anthropic" && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Base URL</label>
                    <input
                      type="text"
                      value={llmConfig.base_url}
                      onChange={e => setLLMConfig(c => ({ ...c, base_url: e.target.value }))}
                      placeholder={llmConfig.provider === "ollama" ? "http://localhost:11434" : "https://openrouter.ai/api"}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                )}

                {(llmConfig.provider === "openai_compatible" || llmConfig.provider === "anthropic") && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">API Key</label>
                    <input
                      type="password"
                      value={llmConfig.api_key}
                      onChange={e => setLLMConfig(c => ({ ...c, api_key: e.target.value }))}
                      placeholder="sk-…"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                )}

                {llmConfig.provider && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Model</label>
                    <input
                      type="text"
                      value={llmConfig.model}
                      onChange={e => setLLMConfig(c => ({ ...c, model: e.target.value }))}
                      placeholder={
                        llmConfig.provider === "anthropic" ? "claude-sonnet-4-6" :
                        llmConfig.provider === "ollama" ? "gemma3:4b" : "gpt-4o"
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                )}

                {llmConfig.provider && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleTestLLM}
                      disabled={llmTestStatus === "testing" || !llmConfig.model}
                      className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 rounded-lg transition-colors"
                    >
                      {llmTestStatus === "testing" ? "Testing…" : "Test connection"}
                    </button>
                    {llmTestStatus === "ok" && (
                      <span className="text-xs text-emerald-400">✓ {llmTestMessage}</span>
                    )}
                    {llmTestStatus === "error" && (
                      <span className="text-xs text-red-400">✕ {llmTestMessage}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-800 pt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Backend: <code className="text-gray-500">http://localhost:7700</code></span>
                  {appVersion && <span className="text-gray-600">v{appVersion}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <a
                    href="https://github.com/BCDel89/memvue"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    GitHub ↗
                  </a>
                  {supportUrl && (
                    <a
                      href={supportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-pink-400 hover:text-pink-300 transition-colors"
                    >
                      ♥ Support
                    </a>
                  )}
                </div>
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

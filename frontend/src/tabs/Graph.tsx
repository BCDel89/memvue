import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api } from "../api/client";
import type { MemoryEntry, AdapterInfo } from "../api/client";
import { Loading } from "../components/Loading";
import { MemoryModal } from "../components/MemoryModal";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal";

// ── types ────────────────────────────────────────────────────────────────────

interface NodeData {
  label: string;
  nodeType: "root" | "fs" | "mem0";
  memory?: MemoryEntry;
  [key: string]: unknown;
}

type GNode = Node<NodeData>;
type GEdge = Edge;

interface Level {
  parent: MemoryEntry | null;
  nodes: MemoryEntry[];
}

// ── layout constants ──────────────────────────────────────────────────────────

const NODE_W = 120;
const NODE_H = 72;
const ROW_GAP = 120;   // vertical gap between parent and children row
const COL_GAP = 24;    // horizontal gap between siblings

const MD_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const BACKTICK_REF_RE = /`([a-zA-Z0-9_./-]+\.(?:md|txt))`/g;
const BARE_PATH_RE = /(?:^|[\s(])([a-zA-Z0-9_-]+\/[a-zA-Z0-9_/.-]+\.(?:md|txt))/g;
const MEM0_LINK_RE = /mem0:\/\/([a-f0-9-]{36})/g;
const MEM0_LIMIT = 6;

function nodeLabel(m: MemoryEntry): string {
  const fn = m.metadata?.filename as string | undefined;
  if (fn) return fn;
  if (m.source.startsWith("fs:")) return m.id;
  // mem0 — prefer topic/source_file/type, then content snippet
  const topic = m.metadata?.topic as string | undefined;
  const srcFile = m.metadata?.source_file as string | undefined;
  if (topic && srcFile) return `${topic} · ${srcFile.split("/").pop()}`;
  if (topic) return topic;
  if (srcFile) return srcFile.split("/").pop() ?? srcFile;
  const snippet = m.content.slice(0, 60).trim();
  return snippet.length < m.content.length ? snippet + "…" : snippet;
}

// ── stacked layout (all levels visible at once) ───────────────────────────────

function buildStackLayout(stack: Level[], rootId: string, agentLabel: string): { nodes: GNode[]; edges: GEdge[] } {
  const allNodes: GNode[] = [];
  const allEdges: GEdge[] = [];
  const positions = new Map<string, { x: number; y: number }>();

  const rootNodePos = { x: -NODE_W / 2, y: 0 };
  positions.set(rootId, rootNodePos);
  allNodes.push({
    id: rootId,
    type: "root",
    position: rootNodePos,
    data: { label: agentLabel, nodeType: "root" },
    draggable: true,
  });

  let rowY = NODE_H + ROW_GAP;

  for (const level of stack) {
    const parentId = level.parent ? level.parent.id : rootId;
    const parentPos = positions.get(parentId) ?? rootNodePos;
    const parentCenterX = parentPos.x + NODE_W / 2;

    const n = level.nodes.length;
    if (n === 0) { rowY += NODE_H + ROW_GAP; continue; }

    const totalW = n * NODE_W + (n - 1) * COL_GAP;
    const startX = parentCenterX - totalW / 2;

    for (let i = 0; i < n; i++) {
      const m = level.nodes[i];
      const nodePos = { x: startX + i * (NODE_W + COL_GAP), y: rowY };
      positions.set(m.id, nodePos);
      allNodes.push({
        id: m.id,
        type: "mem",
        position: nodePos,
        data: {
          label: nodeLabel(m),
          nodeType: m.source.startsWith("fs:") ? "fs" : "mem0",
          memory: m,
        },
        draggable: true,
      });
      allEdges.push({
        id: `e-${parentId}-${m.id}-${i}`,
        source: parentId,
        target: m.id,
        sourceHandle: "bottom",
        targetHandle: "top",
        style: { stroke: "#4b5563", strokeWidth: 1.5 },
        type: "smoothstep",
      });
    }

    rowY += NODE_H + ROW_GAP;
  }

  return { nodes: allNodes, edges: allEdges };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function collectFsRefs(content: string, all: MemoryEntry[]): MemoryEntry[] {
  const seen = new Set<string>();
  const result: MemoryEntry[] = [];
  const candidates = new Set<string>();

  const push = (raw: string) => {
    const link = raw.split("#")[0].split("?")[0].trim();
    if (!link) return;
    if (/^https?:\/\//i.test(link)) return;
    candidates.add(link);
    // also register the basename so "memory/foo.md" matches a file whose id is "foo.md"
    const base = link.split("/").pop();
    if (base) candidates.add(base);
  };

  for (const m of content.matchAll(MD_LINK_RE)) push(m[2]);
  for (const m of content.matchAll(BACKTICK_REF_RE)) push(m[1]);
  for (const m of content.matchAll(BARE_PATH_RE)) push(m[1]);

  for (const link of candidates) {
    const hit = all.find(
      (mem) =>
        mem.source.startsWith("fs:") &&
        (mem.id === link ||
          mem.id.endsWith("/" + link) ||
          mem.metadata?.filename === link)
    );
    if (hit && !seen.has(hit.id)) {
      seen.add(hit.id);
      result.push(hit);
    }
  }
  return result;
}

function buildMem0Query(memory: MemoryEntry): string {
  // use filename stem + first heading as the semantic query
  const filename = ((memory.metadata?.filename as string) ?? memory.id).split("/").pop() ?? "";
  const stem = filename.replace(/\.(md|txt)$/i, "").replace(/[-_]/g, " ");
  const firstHeading = memory.content.match(/^#+\s+(.+)$/m)?.[1] ?? "";
  return [stem, firstHeading].filter(Boolean).join(" ").slice(0, 200);
}

function collectMem0Ids(content: string): string[] {
  const ids: string[] = [];
  for (const m of content.matchAll(MEM0_LINK_RE)) ids.push(m[1]);
  return ids;
}

async function findRefs(
  memory: MemoryEntry,
  all: MemoryEntry[],
  userId: string
): Promise<MemoryEntry[]> {
  const fsRefs = collectFsRefs(memory.content, all);
  const seen = new Set(fsRefs.map((r) => r.id));

  // resolve explicit mem0://uuid links
  const mem0DirectRefs: MemoryEntry[] = [];
  for (const id of collectMem0Ids(memory.content)) {
    if (seen.has(id)) continue;
    try {
      const hit = await api.getMemory("mem0", id);
      seen.add(hit.id);
      mem0DirectRefs.push(hit);
    } catch {
      // memory may not exist or adapter not configured
    }
  }

  // only fall back to semantic search when there are no explicit refs at all
  const hasExplicit = fsRefs.length > 0 || mem0DirectRefs.length > 0;
  const query = hasExplicit ? "" : buildMem0Query(memory);
  const mem0SemanticRefs: MemoryEntry[] = [];
  if (query.trim()) {
    try {
      const hits = await api.search(query, "mem0", MEM0_LIMIT, userId);
      for (const h of hits) {
        if (!seen.has(h.id)) {
          seen.add(h.id);
          mem0SemanticRefs.push(h);
        }
      }
    } catch (e) {
      console.error("mem0 search failed:", query, e);
    }
  }

  return [...fsRefs, ...mem0DirectRefs, ...mem0SemanticRefs];
}

// ── custom node components ────────────────────────────────────────────────────

function RootNode({ data }: NodeProps<GNode>) {
  return (
    <div className="flex flex-col items-center" style={{ width: NODE_W }}>
      <div className="w-full py-2 px-3 rounded-xl bg-violet-600 border-2 border-violet-400 shadow-lg shadow-violet-900/60 flex items-center justify-center">
        <span className="text-white text-sm font-bold select-none">{data.label}</span>
      </div>
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

function MemNode({ data, selected }: NodeProps<GNode>) {
  const isFs = data.nodeType === "fs";
  const ring = selected ? " ring-2 ring-white/60" : "";
  return (
    <div className="flex flex-col items-center" style={{ width: NODE_W }}>
      <Handle id="top" type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        className={`w-full py-2 px-2 rounded-xl flex flex-col items-center gap-0.5 shadow-md cursor-pointer transition-all
          ${isFs ? "bg-emerald-900 border border-emerald-600" : "bg-violet-900 border border-violet-600"}
          ${ring}`}
      >
        <span className="text-xs font-mono text-center leading-tight break-all select-none line-clamp-2"
          style={{ color: isFs ? "#6ee7b7" : "#c4b5fd" }}>
          {data.label}
        </span>
      </div>
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { root: RootNode, mem: MemNode };

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  userId: string;
  adapters?: AdapterInfo[];
  agentName?: string;
  entryPoints?: string[];
}

export default function Graph({ userId, adapters, agentName = "agent", entryPoints = ["MEMORY.md", "CLAUDE.md"] }: Props) {
  const rootId = `agent:${agentName}`;
  const agentLabel = agentName.charAt(0).toUpperCase() + agentName.slice(1);
  const [nodes, setNodes, onNodesChange] = useNodesState<GNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<GEdge>([]);
  const [allMemories, setAllMemories] = useState<MemoryEntry[]>([]);
  const [stack, setStack] = useState<Level[]>([]);
  const [selected, setSelected] = useState<MemoryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; editing?: MemoryEntry }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<MemoryEntry | null>(null);
  const [copied, setCopied] = useState(false);
  const [drilling, setDrilling] = useState(false);

  function applyStack(newStack: Level[]) {
    const { nodes: n, edges: e } = buildStackLayout(newStack, rootId, agentLabel);
    setNodes(n);
    setEdges(e);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const fsAdapters = (adapters ?? []).filter((a) => a.id.startsWith("fs:"));
      const lists = fsAdapters.length
        ? await Promise.all(fsAdapters.map((a) => api.listMemories(a.id, 5000, userId)))
        : [await api.listMemories(undefined, 5000, userId)];
      const mems = lists.flat();
      setAllMemories(mems);
      const fsMems = mems.filter((m) => m.source.startsWith("fs:"));
      const entries = fsMems.filter((m) => entryPoints.some(ep => m.id === ep || m.id.endsWith("/" + ep)));
      const root: Level = { parent: null, nodes: entries.length ? entries : fsMems };
      const initialStack = [root];
      setStack(initialStack);
      applyStack(initialStack);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [userId, adapters, entryPoints]);

  useEffect(() => { load(); }, [load]);

  const onNodeClick = useCallback(
    async (_: React.MouseEvent, node: GNode) => {
      if (!node.data.memory) return;
      const mem = node.data.memory;
      setSelected(mem);

      // find which stack level this node belongs to
      const levelIdx = stack.findIndex((lvl) => lvl.nodes.some((n) => n.id === mem.id));
      if (levelIdx === -1) return;

      // trim everything below this level before drilling in
      const trimmed = stack.slice(0, levelIdx + 1);

      setDrilling(true);
      try {
        const refs = await findRefs(mem, allMemories, userId);
        if (!refs.length) {
          // no children — just trim, don't add a new level
          setStack(trimmed);
          applyStack(trimmed);
          return;
        }
        const newStack = [...trimmed, { parent: mem, nodes: refs }];
        setStack(newStack);
        applyStack(newStack);
      } finally {
        setDrilling(false);
      }
    },
    [allMemories, stack, userId]
  );

  function goBack() {
    if (stack.length <= 1) return;
    setStack((s) => {
      const newStack = s.slice(0, -1);
      applyStack(newStack);
      return newStack;
    });
  }

  function handleDelete(m: MemoryEntry) {
    setDeleteTarget(m);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(deleteTarget.source, deleteTarget.id);
      setAllMemories((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      setSelected(null);
    } catch (e) {
      alert(String(e));
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleSave(content: string, adapterId: string) {
    if (modal.editing) {
      const updated = await api.update(modal.editing.source, modal.editing.id, content);
      setAllMemories((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setSelected(updated);
    } else {
      await api.create(content, adapterId);
    }
  }

  function handleCopy(m: MemoryEntry) {
    const text = m.source === "mem0" ? `mem0://${m.id}` : m.content;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading)
    return (
      <Loading
        messages={[
          "walking the filesystem…",
          "loading entry points…",
          "resolving references…",
          "assembling pyramid…",
        ]}
      />
    );
  if (error)
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-red-400">{error}</p>
        <button onClick={load} className="text-sm text-violet-400 hover:underline">
          Retry
        </button>
      </div>
    );

  const depth = stack.length;
  const currentLevel = stack[depth - 1];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-4 py-2 text-xs text-gray-500 border-b border-gray-800">
        {depth > 1 && (
          <button
            onClick={goBack}
            className="text-violet-400 hover:text-violet-200 flex items-center gap-1 transition-colors"
          >
            ← back
          </button>
        )}
        {depth > 1 && (
          <span className="text-gray-600">
            {stack.slice(1).map((l, i) => (
              <span key={i}>
                {i > 0 && " › "}
                {(l.parent?.metadata?.filename as string) ?? l.parent?.id ?? "root"}
              </span>
            ))}
          </span>
        )}
        <span className="ml-auto text-gray-600 flex items-center gap-2">
          {drilling && (
            <span className="text-violet-400 animate-pulse">searching mem0…</span>
          )}
          {currentLevel?.nodes.length ?? 0} nodes · click to drill in
        </span>
      </div>

      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.4 }}
          minZoom={0.1}
          maxZoom={3}
          style={{ background: "#0a0a0f", width: "100%", height: "100%" }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1f2937" variant={BackgroundVariant.Dots} gap={24} size={1} />
        </ReactFlow>

        {selected && (
          <div className="absolute top-2 left-2 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-10">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium
                ${selected.source === "mem0"
                  ? "bg-violet-900/60 text-violet-300 border-violet-700"
                  : "bg-emerald-900/60 text-emerald-300 border-emerald-700"}`}>
                {selected.source.startsWith("fs:") ? "⬢ fs" : "⬡ mem0"}
              </span>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-300 px-1">✕</button>
            </div>
            <div className="px-3 pt-2 pb-2 border-b border-gray-800">
              <p className="text-xs font-mono text-gray-400 truncate" title={selected.id}>
                {(selected.metadata?.filename as string) ?? selected.id}
              </p>
              {(selected.metadata?.path as string) && (
                <p
                  className="text-[10px] font-mono text-gray-600 mt-1 break-all leading-snug"
                  title={selected.metadata.path as string}
                >
                  {selected.metadata.path as string}
                </p>
              )}
              {selected.updated_at && (
                <p className="text-xs text-gray-600 mt-1">
                  {new Date(selected.updated_at).toLocaleString()}
                </p>
              )}
            </div>
            <div className="px-3 py-2 max-h-52 overflow-y-auto">
              <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
                {selected.content}
              </p>
            </div>
            {Object.entries(selected.metadata ?? {})
              .filter(([k]) => !["path", "filename"].includes(k)).length > 0 && (
              <div className="px-3 py-2 border-t border-gray-800 flex flex-wrap gap-1">
                {Object.entries(selected.metadata ?? {})
                  .filter(([k]) => !["path", "filename"].includes(k))
                  .map(([k, v]) => (
                    <span key={k} className="inline-flex gap-1 items-center px-2 py-0.5 rounded-full text-xs bg-gray-800 border border-gray-700 text-gray-400">
                      <span className="text-gray-600">{k}</span>
                      <span>{String(v)}</span>
                    </span>
                  ))}
              </div>
            )}
            <div className="flex items-center gap-1 px-3 py-2 border-t border-gray-800">
              <button
                onClick={() => setModal({ open: true, editing: selected })}
                className="flex-1 px-2 py-1.5 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => handleCopy(selected)}
                className="flex-1 px-2 py-1.5 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              >
                {copied ? "Copied!" : selected.source === "mem0" ? "Copy link" : "Copy"}
              </button>
              <button
                onClick={() => handleDelete(selected)}
                className="flex-1 px-2 py-1.5 rounded-lg text-xs bg-red-950 hover:bg-red-900 text-red-400 hover:text-red-300 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {modal.open && (
        <MemoryModal
          memory={modal.editing}
          adapters={(adapters ?? []).filter((a) => a.id.startsWith("fs:"))}
          onSave={handleSave}
          onClose={() => setModal({ open: false })}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          label={(deleteTarget.metadata?.filename as string) ?? deleteTarget.id}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

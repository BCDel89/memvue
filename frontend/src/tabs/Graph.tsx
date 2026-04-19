import { useEffect, useRef, useState, useCallback } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { api } from "../api/client";
import type { MemoryEntry } from "../api/client";

interface GraphNode {
  id: string;
  label: string;
  type: "memory" | "source";
  color: string;
  memory?: MemoryEntry;
}

interface GraphLink {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const SOURCE_COLORS: Record<string, string> = {
  mem0: "#8b5cf6",
  default: "#10b981",
};

function sourceColor(source: string): string {
  if (source === "mem0") return SOURCE_COLORS.mem0;
  if (source.startsWith("fs:")) return SOURCE_COLORS.default;
  return "#6b7280";
}

function clusterColor(source: string): string {
  if (source === "mem0") return "#6d28d9";
  if (source.startsWith("fs:")) return "#065f46";
  return "#374151";
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

interface Props {
  userId: string;
}

export default function Graph({ userId }: Props) {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const memories = await api.listMemories(undefined, 500);
      const sources = Array.from(new Set(memories.map((m) => m.source)));

      const nodes: GraphNode[] = [
        ...sources.map((s) => ({
          id: `src:${s}`,
          label: s.startsWith("fs:") ? s.slice(3).split("/").pop() ?? s : s,
          type: "source" as const,
          color: clusterColor(s),
        })),
        ...memories.map((m) => ({
          id: m.id,
          label: truncate(m.content, 40),
          type: "memory" as const,
          color: sourceColor(m.source),
          memory: m as MemoryEntry,
        })),
      ];

      const links: GraphLink[] = memories.map((m) => ({
        source: `src:${m.source}`,
        target: m.id,
      }));

      setGraphData({ nodes, links });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleNodeHover = useCallback((node: object | null) => {
    setHovered((node as GraphNode | null));
  }, []);

  const paintNode = useCallback(
    (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode & { x: number; y: number };
      const isSource = n.type === "source";
      const r = isSource ? 10 : 5;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = n.color;
      ctx.fill();
      if (isSource || globalScale > 1.5) {
        const fontSize = isSource ? 14 / globalScale : 10 / globalScale;
        ctx.font = `${isSource ? "bold " : ""}${fontSize}px sans-serif`;
        ctx.fillStyle = "#e5e7eb";
        ctx.textAlign = "center";
        ctx.fillText(n.label, n.x, n.y + r + fontSize + 2);
      }
    },
    []
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading graph…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-400">{error}</p>
        <button onClick={load} className="text-sm text-violet-400 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const memoryCount = graphData.nodes.filter((n) => n.type === "memory").length;
  const sourceCount = graphData.nodes.filter((n) => n.type === "source").length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-4 py-2 text-xs text-gray-500 border-b border-gray-800">
        <span>{memoryCount} memories</span>
        <span>{sourceCount} sources</span>
        <span className="ml-auto">scroll to zoom · drag to pan</span>
      </div>

      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <ForceGraph2D
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height - 33}
          backgroundColor="#111827"
          nodeCanvasObject={paintNode}
          nodeCanvasObjectMode={() => "replace"}
          onNodeHover={handleNodeHover}
          linkColor={() => "#374151"}
          linkWidth={0.5}
          nodeRelSize={1}
          cooldownTicks={100}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
        />

        {hovered && hovered.type === "memory" && hovered.memory && (
          <div className="absolute bottom-4 left-4 right-4 max-w-md bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm pointer-events-none">
            <p className="text-gray-200 line-clamp-3">{hovered.memory.content}</p>
            <p className="text-gray-500 text-xs mt-1">{hovered.memory.source}</p>
          </div>
        )}

        {hovered && hovered.type === "source" && (
          <div className="absolute bottom-4 left-4 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm pointer-events-none">
            <p className="text-gray-300 font-medium">{hovered.label}</p>
          </div>
        )}
      </div>
    </div>
  );
}

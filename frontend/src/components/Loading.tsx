import { useEffect, useState } from "react";

interface Props {
  messages?: string[];
  className?: string;
}

const DEFAULT_MESSAGES = [
  "scanning memory…",
  "walking the filesystem…",
  "chasing references…",
  "warming the cache…",
  "reading from mem0…",
  "assembling the graph…",
];

export function Loading({ messages = DEFAULT_MESSAGES, className = "" }: Props) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % messages.length), 1800);
    return () => clearInterval(t);
  }, [messages.length]);

  return (
    <div className={`flex flex-col items-center justify-center h-full gap-4 ${className}`}>
      <div className="relative w-16 h-16">
        {/* Outer pulsing ring */}
        <div className="absolute inset-0 rounded-full border-2 border-violet-500/30 animate-ping" />
        {/* Rotating arc */}
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-500 border-r-violet-500/60 animate-spin" />
        {/* Core dot */}
        <div className="absolute inset-[42%] rounded-full bg-violet-400 shadow-[0_0_16px_rgba(167,139,250,0.7)]" />
      </div>

      <div className="flex flex-col items-center gap-1">
        <p
          key={idx}
          className="text-sm text-gray-400 font-mono animate-[fadeIn_0.4s_ease]"
        >
          {messages[idx]}
        </p>
        <div className="flex gap-1 mt-1">
          {messages.map((_, i) => (
            <span
              key={i}
              className={`h-1 w-1 rounded-full transition-colors ${
                i === idx ? "bg-violet-400" : "bg-gray-700"
              }`}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default Loading;

"use client";
import { useEffect, useState } from "react";

interface CountdownTimerProps {
  expiresAt: number;
  onTimeout: () => void;
}

export function CountdownTimer({ expiresAt, onTimeout }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(
    Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  );

  useEffect(() => {
    const updateRemaining = () => {
      const nextRemaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setRemaining(nextRemaining);
      if (nextRemaining <= 0) {
        onTimeout();
      }
    };

    updateRemaining();
    const iv = setInterval(() => {
      updateRemaining();
    }, 1000);
    return () => clearInterval(iv);
  }, [expiresAt, onTimeout]);

  const pct = Math.max(0, (remaining / 60) * 100);
  const color = remaining > 20 ? "#22C55E" : remaining > 10 ? "#F97316" : "#EF4444";

  return (
    <div className="relative h-2 bg-[#111111]">
      <div
        className="h-full transition-all duration-1000"
        style={{ width: `${pct}%`, background: color }}
      />
      <div
        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold"
        style={{ color }}
      >
        {remaining}s
      </div>
    </div>
  );
}

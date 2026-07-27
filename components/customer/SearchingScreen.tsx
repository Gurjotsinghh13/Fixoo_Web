"use client";
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

interface SearchingScreenProps {
  serviceName: string;
  vehicleName: string;
  totalAmount: number;
  etaMin: number;
  etaMax: number;
  searchRadius?: number;
}

const MESSAGES = [
  "Searching nearby partners...",
  "Connecting to repair experts...",
  "Almost there...",
];

export function SearchingScreen({
  serviceName,
  vehicleName,
  totalAmount,
  etaMin,
  etaMax,
  searchRadius = 3,
}: SearchingScreenProps) {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 2500);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6">
      {/* Pulsing rings */}
      <div className="relative mb-10">
        <div className="absolute inset-0 rounded-full bg-white/5 animate-ping scale-150" />
        <div className="absolute inset-0 rounded-full bg-white/10 animate-ping scale-125 animation-delay-300" />
        <div className="w-24 h-24 rounded-full bg-[#1A1A1A] border-2 border-white flex items-center justify-center relative z-10">
          <Zap className="w-10 h-10 text-white fill-white" />
        </div>
      </div>

      <h2 className="text-2xl font-bold text-white mb-2 text-center">
        {MESSAGES[msgIndex]}
      </h2>
      <p className="text-[#A1A1AA] text-sm text-center mb-8">
        Searching within {searchRadius}km radius
      </p>

      {/* Request summary */}
      <div className="w-full fixoo-card space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-[#A1A1AA]">Service</span>
          <span className="text-white font-medium">{serviceName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#A1A1AA]">Vehicle</span>
          <span className="text-white font-medium">{vehicleName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#A1A1AA]">Estimated arrival</span>
          <span className="text-white font-medium">{etaMin}–{etaMax} min</span>
        </div>
        <div className="flex justify-between border-t border-[#2A2A2A] pt-3">
          <span className="text-white font-semibold">Total</span>
          <span className="text-white font-bold text-lg">₹{totalAmount}</span>
        </div>
      </div>

      {/* Loading dots */}
      <div className="flex gap-2 mt-8">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-[#A1A1AA] animate-bounce"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}

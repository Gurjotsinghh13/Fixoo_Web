"use client";
import type { VehicleType } from "@/types";

interface VehicleCardProps {
  vehicle: VehicleType;
  selected: boolean;
  etaMin: number;
  etaMax: number;
  startingFrom: number;
  onSelect: (id: string) => void;
}

export function VehicleCard({ vehicle, selected, etaMin, etaMax, startingFrom, onSelect }: VehicleCardProps) {
  return (
    <button
      onClick={() => onSelect(vehicle.id)}
      className={`w-full text-left rounded-2xl border p-4 transition-all duration-150 ${
        selected
          ? "border-white bg-[#1A1A1A]"
          : "border-[#2A2A2A] bg-[#111111] hover:border-[#3A3A3A]"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{vehicle.icon}</span>
          <div>
            <p className="text-white font-semibold text-base">{vehicle.displayName}</p>
            <p className="text-[#A1A1AA] text-xs mt-0.5">
              Arrival: {etaMin}–{etaMax} min
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-white font-semibold">₹{startingFrom}</p>
          <p className="text-[#A1A1AA] text-xs">onwards</p>
        </div>
      </div>
      {selected && (
        <div className="mt-3 pt-3 border-t border-[#2A2A2A] flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
          <span className="text-[#22C55E] text-xs font-medium">Selected</span>
        </div>
      )}
    </button>
  );
}

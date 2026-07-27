"use client";
import { CountdownTimer } from "./CountdownTimer";
import { MapPin, IndianRupee } from "lucide-react";
import type { BroadcastPayload } from "@/types";

interface RequestCardProps {
  request: BroadcastPayload;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onTimeout: () => void;
}

export function RequestCard({ request, onAccept, onReject, onTimeout }: RequestCardProps) {
  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl overflow-hidden">
      {/* Timer bar */}
      <CountdownTimer expiresAt={request.expiresAt} onTimeout={onTimeout} />

      <div className="p-5">
        {/* Service info */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[#A1A1AA] text-xs font-medium uppercase tracking-widest mb-1">
              New Request
            </p>
            <p className="text-white font-bold text-xl">{request.serviceName}</p>
            <p className="text-[#A1A1AA] text-sm">{request.vehicleType}</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 justify-end">
              <IndianRupee className="w-5 h-5 text-[#22C55E]" />
              <span className="text-[#22C55E] text-2xl font-bold">{request.earning}</span>
            </div>
            <p className="text-[#A1A1AA] text-xs">your earning</p>
          </div>
        </div>

        {/* Location */}
        <div className="bg-[#111111] rounded-xl p-3 flex items-center gap-3 mb-5">
          <MapPin className="w-4 h-4 text-[#F97316] flex-shrink-0" />
          <div>
            <p className="text-white font-medium text-sm">{request.area}</p>
            <p className="text-[#A1A1AA] text-xs">{request.distance} km away</p>
          </div>
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onReject(request.requestId)}
            className="py-4 rounded-xl border border-[#2A2A2A] text-[#A1A1AA] font-semibold hover:border-[#3A3A3A] hover:text-white transition-all"
          >
            Decline
          </button>
          <button
            onClick={() => onAccept(request.requestId)}
            className="py-4 rounded-xl bg-white text-black font-bold hover:bg-gray-100 transition-all"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

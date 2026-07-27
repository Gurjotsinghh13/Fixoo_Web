import { Moon } from "lucide-react";

interface PricePreviewProps {
  serviceFee: number;
  platformFee: number;
  nightSurcharge: number;
  totalAmount: number;
  etaMin: number;
  etaMax: number;
  isNight: boolean;
  vehicleName: string;
  serviceName: string;
}

export function PricePreview({
  serviceFee,
  platformFee,
  nightSurcharge,
  totalAmount,
  etaMin,
  etaMax,
  isNight,
  vehicleName,
  serviceName,
}: PricePreviewProps) {
  return (
    <div className="fixoo-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-white font-semibold text-base">{serviceName}</p>
          <p className="text-[#A1A1AA] text-sm">{vehicleName}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white">₹{totalAmount}</p>
          <p className="text-[#A1A1AA] text-xs">total</p>
        </div>
      </div>

      <div className="space-y-2.5 border-t border-[#2A2A2A] pt-4">
        <div className="flex justify-between text-sm">
          <span className="text-[#A1A1AA]">Service fee</span>
          <span className="text-white">₹{serviceFee}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#A1A1AA]">Platform fee</span>
          <span className="text-white">₹{platformFee}</span>
        </div>
        {isNight && nightSurcharge > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-[#F97316] flex items-center gap-1">
              <Moon className="w-3 h-3" /> Night surcharge
            </span>
            <span className="text-[#F97316]">₹{nightSurcharge}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold border-t border-[#2A2A2A] pt-2.5">
          <span className="text-white">Total</span>
          <span className="text-white text-lg">₹{totalAmount}</span>
        </div>
      </div>

      <div className="mt-4 bg-[#111111] rounded-xl p-3 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
        <span className="text-[#A1A1AA] text-sm">
          Estimated arrival:{" "}
          <span className="text-white font-medium">{etaMin}–{etaMax} min</span>
        </span>
      </div>
    </div>
  );
}

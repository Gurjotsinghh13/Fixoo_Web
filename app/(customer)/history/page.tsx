"use client";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Clock, Zap } from "lucide-react";
import { BottomNav } from "@/components/shared/BottomNav";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { format } from "date-fns";
import Link from "next/link";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  REQUESTED: { label: "Searching", color: "text-[#F97316]" },
  ACCEPTED: { label: "Accepted", color: "text-[#3B82F6]" },
  ON_THE_WAY: { label: "On the way", color: "text-[#3B82F6]" },
  ARRIVED: { label: "Arrived", color: "text-[#8B5CF6]" },
  REPAIR_IN_PROGRESS: { label: "In progress", color: "text-[#F97316]" },
  COMPLETED: { label: "Completed", color: "text-[#22C55E]" },
  CANCELLED: { label: "Cancelled", color: "text-[#EF4444]" },
  EXPIRED: { label: "Expired", color: "text-[#A1A1AA]" },
};

export default function HistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-history"],
    queryFn: async () => {
      const res = await axios.get("/api/requests/history");
      return res.data.data;
    },
  });

  return (
    <div className="page-container min-h-screen">
      <div className="safe-top px-4 pt-4 flex items-center gap-2 mb-2">
        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
          <Zap className="w-5 h-5 text-black fill-black" />
        </div>
        <h1 className="font-bold text-lg">History</h1>
      </div>

      <div className="px-4 pb-28 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : !data?.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Clock className="w-12 h-12 text-[#2A2A2A] mb-4" />
            <p className="text-white font-semibold mb-2">No requests yet</p>
            <p className="text-[#A1A1AA] text-sm">
              Your repair history will appear here
            </p>
            <Link href="/home" className="mt-6 fixoo-btn-primary max-w-xs">
              Request Help
            </Link>
          </div>
        ) : (
          <div className="space-y-3 mt-4">
            {data.map((r: {
              id: string;
              status: string;
              service: { displayName: string; icon?: string | null };
              vehicleType: { displayName: string };
              totalAmount: number;
              area?: string;
              createdAt: string;
              partner?: { name: string } | null;
            }) => {
              const statusCfg = STATUS_CONFIG[r.status] || { label: r.status, color: "text-[#A1A1AA]" };
              const isActive = !["COMPLETED", "CANCELLED", "EXPIRED"].includes(r.status);
              return (
                <Link
                  key={r.id}
                  href={isActive ? `/tracking/${r.id}` : `/tracking/${r.id}`}
                  className="fixoo-card flex items-center gap-4 hover:border-[#3A3A3A] transition-colors block"
                >
                  <div className="text-2xl flex-shrink-0">{r.service?.icon || "🛞"}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm">{r.service?.displayName} — {r.vehicleType?.displayName}</p>
                    <p className="text-[#A1A1AA] text-xs mt-0.5">
                      {r.area || "Kota"} · {format(new Date(r.createdAt), "MMM d, h:mm a")}
                    </p>
                    {r.partner && (
                      <p className="text-[#A1A1AA] text-xs mt-0.5">{r.partner.name}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white font-semibold text-sm">₹{r.totalAmount}</p>
                    <p className={`text-xs mt-0.5 ${statusCfg.color}`}>{statusCfg.label}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav role="customer" />
    </div>
  );
}

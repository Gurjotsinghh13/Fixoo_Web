"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, RefreshCw, Zap } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

type QueueRow = {
  id: string;
  status: string;
  service: string;
  customer: string;
  partner?: string | null;
  supportReason?: string | null;
  updatedAt: string;
};

type Queues = Record<string, QueueRow[]>;

const LABELS: Record<string, string> = {
  failedRequests: "Failed Requests",
  noPartnerAvailable: "No Partner Available",
  partnerNoShow: "Partner No Show",
  customerNoShow: "Customer No Show",
  paymentIssues: "Payment Issues",
  paymentDisputes: "Payment Disputes",
  refundRequired: "Refund Required",
  supportFollowUp: "Support Follow-up",
  partnerDisconnect: "Partner Disconnect",
  stuckRequests: "Stuck Requests",
};

export default function AdminOperationsPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-operations"],
    queryFn: async () => {
      const response = await axios.get("/api/admin/operations");
      return response.data.data as Queues;
    },
    refetchInterval: 15000,
  });

  return (
    <div className="min-h-screen bg-black">
      <div className="border-b border-[#2A2A2A] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/dashboard" className="text-[#A1A1AA] hover:text-white">
            <Zap className="w-5 h-5" />
          </Link>
          <span className="text-[#2A2A2A]">/</span>
          <h1 className="text-white font-semibold">Operations</h1>
        </div>
        <button
          onClick={() => refetch()}
          title="Refresh queues"
          className="w-9 h-9 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-[#A1A1AA] hover:text-white"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="px-6 py-6 max-w-7xl mx-auto">
        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {Object.entries(LABELS).map(([key, label]) => {
              const rows = data?.[key] || [];
              return (
                <section key={key} className="fixoo-card">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-[#F97316]" />
                      <h2 className="text-white font-semibold">{label}</h2>
                    </div>
                    <span className="text-white text-sm font-bold">{rows.length}</span>
                  </div>
                  {rows.length === 0 ? (
                    <p className="text-[#52525B] text-sm">Queue is clear</p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {rows.map((row) => (
                        <Link
                          key={row.id}
                          href={`/admin/requests/${row.id}`}
                          className="block bg-[#111111] border border-[#2A2A2A] rounded-lg p-3 hover:border-[#52525B]"
                        >
                          <div className="flex justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-white text-sm font-medium truncate">{row.service}</p>
                              <p className="text-[#A1A1AA] text-xs truncate">
                                {row.customer} · {row.partner || "Unassigned"}
                              </p>
                              {row.supportReason && (
                                <p className="text-[#F97316] text-xs mt-1 truncate">{row.supportReason}</p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-white text-xs">{row.status}</p>
                              <p className="text-[#52525B] text-xs mt-1">
                                {formatDistanceToNow(new Date(row.updatedAt), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  LogOut,
  XCircle,
} from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useAuthStore } from "@/store/useAuthStore";
import { usePartnerStore } from "@/store/usePartnerStore";
import { useRequestStore } from "@/store/useRequestStore";
import { disconnectSocket } from "@/lib/socket";

const STATUS_VIEW = {
  PENDING: {
    icon: Clock,
    title: "Application submitted",
    description: "Waiting for approval from the Fixoo operations team.",
    color: "text-[#F97316]",
  },
  APPROVED: {
    icon: CheckCircle,
    title: "Application approved",
    description: "Your partner account is approved for marketplace participation.",
    color: "text-[#22C55E]",
  },
  REJECTED: {
    icon: XCircle,
    title: "Application rejected",
    description: "Your application was not approved.",
    color: "text-[#EF4444]",
  },
  SUSPENDED: {
    icon: AlertCircle,
    title: "Partner account suspended",
    description: "Marketplace access is currently suspended.",
    color: "text-[#EF4444]",
  },
} as const;

export default function PartnerApplicationStatusPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { clearUser, setUser } = useAuthStore();
  const resetPartner = usePartnerStore((state) => state.reset);
  const resetRequest = useRequestStore((state) => state.reset);
  const [loggingOut, setLoggingOut] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["partner-application-status"],
    queryFn: async () => {
      const response = await axios.get("/api/auth/me");
      const partner = response.data.data;
      setUser({ ...partner, role: "partner" });
      return partner as {
        applicationStatus: keyof typeof STATUS_VIEW;
        applicationNotes?: string | null;
        applicationNumber: string;
        name: string;
        shopName: string;
        isApproved: boolean;
        isSuspended: boolean;
      };
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await axios.post("/api/auth/logout");
      disconnectSocket();
      resetPartner();
      resetRequest();
      queryClient.clear();
      clearUser();
      router.replace("/partner/login");
    } finally {
      setLoggingOut(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <LoadingSpinner size="lg" text="Loading application..." />
      </div>
    );
  }

  const status = STATUS_VIEW[data.applicationStatus] || STATUS_VIEW.PENDING;
  const Icon = status.icon;
  const canEnterMarketplace =
    data.applicationStatus === "APPROVED" &&
    data.isApproved &&
    !data.isSuspended;

  return (
    <div className="page-container min-h-screen px-5 py-10 flex flex-col">
      <div className="flex-1 flex items-center">
        <div className="w-full">
          <div className="w-14 h-14 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center mb-6">
            <Icon className={`w-7 h-7 ${status.color}`} />
          </div>
          <p className="text-[#A1A1AA] text-sm">{data.shopName}</p>
          <h1 className="text-3xl font-bold mt-1">{status.title}</h1>
          <p className="text-[#A1A1AA] mt-3">{status.description}</p>

          <div className="fixoo-card mt-8 space-y-3">
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-[#A1A1AA]">Application number</span>
              <span className="text-white font-mono text-right break-all">
                {data.applicationNumber}
              </span>
            </div>
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-[#A1A1AA]">Status</span>
              <span className={status.color}>{data.applicationStatus}</span>
            </div>
            {data.applicationNotes && (
              <div className="border-t border-[#2A2A2A] pt-3">
                <p className="text-[#A1A1AA] text-xs uppercase tracking-widest">
                  Admin note
                </p>
                <p className="text-white text-sm mt-2">{data.applicationNotes}</p>
              </div>
            )}
          </div>

          <div className="mt-6 space-y-3">
            {canEnterMarketplace && (
              <button
                onClick={() => router.replace("/partner/dashboard")}
                className="fixoo-btn-primary"
              >
                Open Partner Dashboard
              </button>
            )}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="fixoo-btn-secondary"
            >
              {isFetching ? "Checking..." : "Check Status"}
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="mt-8 w-full flex items-center justify-center gap-2 py-4 text-[#A1A1AA]"
      >
        <LogOut className="w-4 h-4" />
        {loggingOut ? "Logging out..." : "Logout"}
      </button>
    </div>
  );
}

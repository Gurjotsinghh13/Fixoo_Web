"use client";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  TrendingUp, Users, CheckCircle, XCircle,
  Clock, Zap, AlertCircle, RefreshCw
} from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { format } from "date-fns";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import { getSocket } from "@/lib/socket";

function MetricCard({
  icon, label, value, sub, color = "text-white",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="fixoo-card">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-[#111111] flex items-center justify-center">
          {icon}
        </div>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-[#A1A1AA] text-sm mt-1">{label}</p>
      {sub && <p className="text-[#A1A1AA] text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: "text-[#F97316]",
  ACCEPTED: "text-[#3B82F6]",
  ON_THE_WAY: "text-[#3B82F6]",
  ARRIVED: "text-[#8B5CF6]",
  REPAIR_IN_PROGRESS: "text-[#F97316]",
  COMPLETED: "text-[#22C55E]",
  CANCELLED: "text-[#EF4444]",
  EXPIRED: "text-[#A1A1AA]",
};

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: async () => {
      const res = await axios.get("/api/admin/analytics");
      return res.data.data;
    },
    refetchInterval: 30000,
  });
  const { data: pilotMetrics } = useQuery({
    queryKey: ["admin-pilot-metrics"],
    queryFn: async () => {
      const res = await axios.get("/api/admin/pilot-metrics");
      return res.data.data as {
        requestsToday: number;
        completionRate: number;
        cancellationRate: number;
        avgAcceptTimeSeconds: number | null;
        avgArrivalTimeSeconds: number | null;
        partnerResponseRate: number;
        failedRequests: number;
      };
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    const socket = getSocket("admin", user.id);
    const refreshFinancials = () => {
      queryClient.invalidateQueries({ queryKey: ["admin-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pilot-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["admin-transactions"] });
    };
    socket.on("admin:request_status", refreshFinancials);
    return () => {
      socket.off("admin:request_status", refreshFinancials);
    };
  }, [queryClient, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <LoadingSpinner size="lg" text="Loading dashboard..." />
      </div>
    );
  }

  const { requests, partners, revenue, recentRequests, recentFeedback, recentActivity } = data || {};

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="border-b border-[#2A2A2A] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-black fill-black" />
          </div>
          <div>
            <p className="font-bold text-white">Fixoo Admin</p>
            <p className="text-[#A1A1AA] text-xs">Kota Operations</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="w-9 h-9 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-[#A1A1AA] hover:text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "spin-slow" : ""}`} />
          </button>
          <nav className="hidden md:flex items-center gap-1">
            {[
              ["Dashboard", "/admin/dashboard"],
              ["Applications", "/admin/partner-applications"],
              ["Partners", "/admin/partners"],
              ["Requests", "/admin/requests"],
              ["Operations", "/admin/operations"],
              ["Pricing", "/admin/pricing"],
              ["Transactions", "/admin/transactions"],
              ["Analytics", "/admin/analytics"],
            ].map(([item, href]) => (
              <a
                key={item}
                href={href}
                className="px-3 py-1.5 rounded-lg text-sm text-[#A1A1AA] hover:text-white hover:bg-[#1A1A1A] transition-colors"
              >
                {item}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <div className="px-6 py-6 max-w-7xl mx-auto">
        {/* Live status bar */}
        <div className="flex items-center gap-3 mb-6 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl px-4 py-3">
          <div className="online-dot" />
          <p className="text-[#22C55E] text-sm font-medium">
            {partners?.active || 0} partners online
          </p>
          <div className="w-px h-4 bg-[#2A2A2A]" />
          <p className="text-[#A1A1AA] text-sm">
            {requests?.today || 0} requests today
          </p>
          <div className="w-px h-4 bg-[#2A2A2A]" />
          <p className="text-[#A1A1AA] text-sm">
            {requests?.completionRate || 0}% completion rate
          </p>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <MetricCard
            icon={<TrendingUp className="w-5 h-5 text-[#22C55E]" />}
            label="Revenue today"
            value={`₹${revenue?.today || 0}`}
            sub={`₹${revenue?.thisWeek || 0} week · ₹${revenue?.thisMonth || 0} month`}
            color="text-[#22C55E]"
          />
          <MetricCard
            icon={<CheckCircle className="w-5 h-5 text-[#3B82F6]" />}
            label="Requests today"
            value={requests?.today || 0}
            sub={`${requests?.completedToday || 0} completed`}
          />
          <MetricCard
            icon={<Users className="w-5 h-5 text-[#8B5CF6]" />}
            label="Active partners"
            value={partners?.active || 0}
            sub={`${partners?.total || 0} total approved`}
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            icon={<Clock className="w-5 h-5 text-[#F97316]" />}
            label="Pending applications"
            value={partners?.pending || 0}
          />
          <MetricCard
            icon={<CheckCircle className="w-5 h-5 text-[#22C55E]" />}
            label="Approved"
            value={partners?.approved || 0}
          />
          <MetricCard
            icon={<XCircle className="w-5 h-5 text-[#EF4444]" />}
            label="Rejected"
            value={partners?.rejected || 0}
          />
          <MetricCard
            icon={<AlertCircle className="w-5 h-5 text-[#EF4444]" />}
            label="Suspended"
            value={partners?.suspended || 0}
            sub={`${partners?.active || 0} online`}
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            icon={<Clock className="w-5 h-5 text-[#3B82F6]" />}
            label="Active requests"
            value={requests?.active || 0}
          />
          <MetricCard
            icon={<AlertCircle className="w-5 h-5 text-[#EF4444]" />}
            label="Failed / follow-up"
            value={requests?.failed || 0}
            sub={`${requests?.partnerNoShows || 0} partner no-shows`}
          />
          <MetricCard
            icon={<Users className="w-5 h-5 text-[#F97316]" />}
            label="Customer no-shows"
            value={requests?.customerNoShows || 0}
          />
          <MetricCard
            icon={<TrendingUp className="w-5 h-5 text-[#F97316]" />}
            label="Pending payments"
            value={revenue?.pendingPayments || 0}
          />
        </div>

        {/* Secondary metrics */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="fixoo-card">
            <div className="flex justify-between items-start">
              <p className="text-[#A1A1AA] text-sm">Completed</p>
              <CheckCircle className="w-4 h-4 text-[#22C55E]" />
            </div>
            <p className="text-white font-bold text-xl mt-2">{requests?.completedToday || 0}</p>
            <p className="text-[#A1A1AA] text-xs mt-1">today</p>
          </div>
          <div className="fixoo-card">
            <div className="flex justify-between items-start">
              <p className="text-[#A1A1AA] text-sm">Cancelled</p>
              <XCircle className="w-4 h-4 text-[#EF4444]" />
            </div>
            <p className="text-white font-bold text-xl mt-2">{requests?.cancelledToday || 0}</p>
            <p className="text-[#A1A1AA] text-xs mt-1">today</p>
          </div>
          <div className="fixoo-card">
            <div className="flex justify-between items-start">
              <p className="text-[#A1A1AA] text-sm">Expired</p>
              <Clock className="w-4 h-4 text-[#A1A1AA]" />
            </div>
            <p className="text-white font-bold text-xl mt-2">{requests?.expiredToday || 0}</p>
            <p className="text-[#A1A1AA] text-xs mt-1">no partner found</p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
          <div className="fixoo-card">
            <p className="text-[#A1A1AA] text-sm">Requests Today</p>
            <p className="text-white font-bold text-xl mt-2">{pilotMetrics?.requestsToday || 0}</p>
          </div>
          <div className="fixoo-card">
            <p className="text-[#A1A1AA] text-sm">Completion Rate</p>
            <p className="text-white font-bold text-xl mt-2">{pilotMetrics?.completionRate || 0}%</p>
          </div>
          <div className="fixoo-card">
            <p className="text-[#A1A1AA] text-sm">Cancellation Rate</p>
            <p className="text-white font-bold text-xl mt-2">{pilotMetrics?.cancellationRate || 0}%</p>
          </div>
          <div className="fixoo-card">
            <p className="text-[#A1A1AA] text-sm">Avg Accept</p>
            <p className="text-white font-bold text-xl mt-2">
              {pilotMetrics?.avgAcceptTimeSeconds == null ? "-" : `${pilotMetrics.avgAcceptTimeSeconds}s`}
            </p>
          </div>
          <div className="fixoo-card">
            <p className="text-[#A1A1AA] text-sm">Avg Arrival</p>
            <p className="text-white font-bold text-xl mt-2">
              {pilotMetrics?.avgArrivalTimeSeconds == null ? "-" : `${pilotMetrics.avgArrivalTimeSeconds}s`}
            </p>
          </div>
          <div className="fixoo-card">
            <p className="text-[#A1A1AA] text-sm">Partner Response</p>
            <p className="text-white font-bold text-xl mt-2">{pilotMetrics?.partnerResponseRate || 0}%</p>
          </div>
        </div>

        {/* Recent requests table */}
        <div className="fixoo-card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-white font-semibold">Recent Requests</p>
            <Link href="/admin/requests" className="text-[#A1A1AA] text-sm hover:text-white">
              View all →
            </Link>
          </div>

          {!recentRequests?.length ? (
            <div className="text-center py-8">
              <p className="text-[#A1A1AA]">No requests yet today</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2A2A2A]">
                    {["Service", "Customer", "Partner", "Amount", "Status", "Time"].map((h) => (
                      <th key={h} className="text-left text-[#A1A1AA] text-xs font-medium uppercase tracking-wider pb-3 pr-4">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.map((r: {
                    id: string;
                    service: string;
                    vehicleType: string;
                    customerPhone: string;
                    partnerName?: string;
                    totalAmount: number;
                    status: string;
                    area?: string;
                    createdAt: string;
                  }) => (
                    <tr key={r.id} className="border-b border-[#2A2A2A]/50 hover:bg-[#111111]/50 transition-colors">
                      <td className="py-3 pr-4">
                        <p className="text-white text-sm font-medium">{r.service}</p>
                        <p className="text-[#A1A1AA] text-xs">{r.vehicleType} · {r.area || "Kota"}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-[#A1A1AA] text-sm font-mono">{r.customerPhone}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-[#A1A1AA] text-sm">{r.partnerName || "—"}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-white text-sm font-medium">₹{r.totalAmount}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs font-medium ${STATUS_COLORS[r.status] || "text-[#A1A1AA]"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3">
                        <p className="text-[#A1A1AA] text-xs">
                          {format(new Date(r.createdAt), "h:mm a")}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="fixoo-card mt-6">
          <p className="text-white font-semibold mb-4">Recent Feedback</p>
          {!recentFeedback?.length ? (
            <p className="text-[#A1A1AA] text-sm">No customer feedback yet</p>
          ) : (
            <div className="space-y-3">
              {recentFeedback.map((item: {
                id: string;
                requestId: string;
                rating: number;
                comment?: string | null;
                customerPhone: string;
                partnerName?: string | null;
                service: string;
                vehicleType: string;
                createdAt: string;
              }) => (
                <Link
                  key={item.id}
                  href={`/admin/requests/${item.requestId}`}
                  className="block border-b border-[#2A2A2A]/50 pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-yellow-400 text-sm">
                        {"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}
                      </p>
                      <p className="text-white text-sm mt-1">{item.comment || "No written feedback"}</p>
                      <p className="text-[#A1A1AA] text-xs mt-1">
                        {item.service} · {item.vehicleType} · {item.partnerName || "Unassigned"}
                      </p>
                    </div>
                    <p className="text-[#A1A1AA] text-xs whitespace-nowrap">
                      {format(new Date(item.createdAt), "MMM d")}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="fixoo-card mt-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-white font-semibold">Recent Admin Activity</p>
            <Link href="/admin/operations" className="text-[#A1A1AA] text-sm hover:text-white">
              Open operations
            </Link>
          </div>
          {!recentActivity?.length ? (
            <p className="text-[#A1A1AA] text-sm">No admin activity recorded yet</p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((item: {
                id: string;
                action: string;
                entity: string;
                entityId?: string | null;
                createdAt: string;
              }) => (
                <div key={item.id} className="flex items-center justify-between border-b border-[#2A2A2A]/50 pb-3">
                  <div>
                    <p className="text-white text-sm">{item.action.replaceAll("_", " ")}</p>
                    <p className="text-[#A1A1AA] text-xs">{item.entity}</p>
                  </div>
                  <p className="text-[#A1A1AA] text-xs">
                    {format(new Date(item.createdAt), "MMM d, h:mm a")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

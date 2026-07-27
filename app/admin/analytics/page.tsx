"use client";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Clock, MapPin, TrendingUp, XCircle, Zap } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useAuthStore } from "@/store/useAuthStore";
import { getSocket } from "@/lib/socket";

type AnalyticsData = {
  requestCharts: {
    daily: Array<{ date: string; requests: number; completed: number; cancelled: number }>;
    weekly: Array<{ week: string; requests: number; completed: number; cancelled: number }>;
    funnel: Array<{ status: string; count: number }>;
  };
  timings: {
    avgAcceptanceTimeSeconds: number | null;
    avgArrivalTimeSeconds: number | null;
    avgCompletionTimeSeconds: number | null;
  };
  topPartners: Array<{
    id: string;
    name: string;
    shopName: string;
    jobsCompleted: number;
    acceptanceRate: number;
    responseTimeSeconds: number | null;
    earnings: number;
  }>;
  demand: {
    byArea: Array<{ area: string; count: number }>;
    byLocality: Array<{ locality: string; count: number }>;
    byPincode: Array<{ pincode: string; count: number }>;
  };
  revenue: {
    grossTransactionValue: number;
    platformFees: number;
    partnerEarnings: number;
    daily: Array<{ date: string; gross: number; platformFees: number; partnerEarnings: number }>;
    weekly: Array<{ week: string; gross: number; platformFees: number; partnerEarnings: number }>;
    monthly: Array<{ month: string; gross: number; platformFees: number; partnerEarnings: number }>;
  };
  failedRequests: {
    expired: number;
    partnerNoShow: number;
    customerNoShow: number;
    cancelled: number;
  };
};

const funnelColors = ["#F97316", "#3B82F6", "#8B5CF6", "#22C55E", "#EF4444"];

function secondsLabel(value: number | null) {
  if (value === null) return "-";
  if (value < 60) return `${value}s`;
  return `${Math.round(value / 60)}m`;
}

function MetricCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="fixoo-card">
      <div className="w-10 h-10 rounded-xl bg-[#111111] flex items-center justify-center mb-3">
        {icon}
      </div>
      <p className="text-white text-2xl font-bold">{value}</p>
      <p className="text-[#A1A1AA] text-sm mt-1">{label}</p>
      {sub && <p className="text-[#A1A1AA] text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fixoo-card">
      <p className="text-white font-semibold mb-4">{title}</p>
      <div className="h-64">{children}</div>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-marketplace-analytics"],
    queryFn: async () => {
      const res = await axios.get("/api/admin/marketplace-analytics");
      return res.data.data as AnalyticsData;
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    const socket = getSocket("admin", user.id);
    const refreshAnalytics = () => {
      queryClient.invalidateQueries({ queryKey: ["admin-marketplace-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["admin-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["admin-transactions"] });
    };
    socket.on("admin:request_status", refreshAnalytics);
    return () => {
      socket.off("admin:request_status", refreshAnalytics);
    };
  }, [queryClient, user]);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <LoadingSpinner size="lg" text="Loading analytics..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="border-b border-[#2A2A2A] px-6 py-4 flex items-center gap-3">
        <a href="/admin/dashboard" className="text-[#A1A1AA] hover:text-white">
          <Zap className="w-5 h-5" />
        </a>
        <span className="text-[#2A2A2A]">/</span>
        <h1 className="text-white font-semibold">Marketplace Analytics</h1>
      </div>

      <div className="px-6 py-6 max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <MetricCard
            icon={<Clock className="w-5 h-5 text-[#3B82F6]" />}
            label="Avg acceptance"
            value={secondsLabel(data.timings.avgAcceptanceTimeSeconds)}
          />
          <MetricCard
            icon={<Clock className="w-5 h-5 text-[#8B5CF6]" />}
            label="Avg arrival"
            value={secondsLabel(data.timings.avgArrivalTimeSeconds)}
          />
          <MetricCard
            icon={<Clock className="w-5 h-5 text-[#22C55E]" />}
            label="Avg completion"
            value={secondsLabel(data.timings.avgCompletionTimeSeconds)}
          />
          <MetricCard
            icon={<TrendingUp className="w-5 h-5 text-[#22C55E]" />}
            label="Gross value"
            value={`Rs ${data.revenue.grossTransactionValue}`}
          />
          <MetricCard
            icon={<Activity className="w-5 h-5 text-white" />}
            label="Platform fees"
            value={`Rs ${data.revenue.platformFees}`}
          />
          <MetricCard
            icon={<XCircle className="w-5 h-5 text-[#EF4444]" />}
            label="Failed requests"
            value={Object.values(data.failedRequests).reduce((sum, count) => sum + count, 0)}
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <ChartCard title="Daily Requests">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.requestCharts.daily}>
                <CartesianGrid stroke="#2A2A2A" />
                <XAxis dataKey="date" stroke="#A1A1AA" fontSize={11} />
                <YAxis stroke="#A1A1AA" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #2A2A2A" }} />
                <Area type="monotone" dataKey="requests" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.18} />
                <Area type="monotone" dataKey="completed" stroke="#22C55E" fill="#22C55E" fillOpacity={0.16} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Weekly Requests">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.requestCharts.weekly}>
                <CartesianGrid stroke="#2A2A2A" />
                <XAxis dataKey="week" stroke="#A1A1AA" fontSize={11} />
                <YAxis stroke="#A1A1AA" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #2A2A2A" }} />
                <Line type="monotone" dataKey="requests" stroke="#3B82F6" strokeWidth={2} />
                <Line type="monotone" dataKey="completed" stroke="#22C55E" strokeWidth={2} />
                <Line type="monotone" dataKey="cancelled" stroke="#EF4444" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <ChartCard title="Request Status Funnel">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.requestCharts.funnel}>
                <CartesianGrid stroke="#2A2A2A" />
                <XAxis dataKey="status" stroke="#A1A1AA" fontSize={11} />
                <YAxis stroke="#A1A1AA" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #2A2A2A" }} />
                <Bar dataKey="count">
                  {data.requestCharts.funnel.map((entry, index) => (
                    <Cell key={entry.status} fill={funnelColors[index % funnelColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Daily Revenue">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.revenue.daily}>
                <CartesianGrid stroke="#2A2A2A" />
                <XAxis dataKey="date" stroke="#A1A1AA" fontSize={11} />
                <YAxis stroke="#A1A1AA" fontSize={11} />
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #2A2A2A" }} />
                <Area type="monotone" dataKey="gross" stroke="#ffffff" fill="#ffffff" fillOpacity={0.1} />
                <Area type="monotone" dataKey="platformFees" stroke="#22C55E" fill="#22C55E" fillOpacity={0.18} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="fixoo-card">
            <p className="text-white font-semibold mb-4">Revenue Summary</p>
            <div className="space-y-3 text-sm">
              <p className="flex justify-between text-white"><span>Gross Transaction Value</span><span>Rs {data.revenue.grossTransactionValue}</span></p>
              <p className="flex justify-between text-[#22C55E]"><span>Platform Fees</span><span>Rs {data.revenue.platformFees}</span></p>
              <p className="flex justify-between text-[#F97316]"><span>Partner Earnings</span><span>Rs {data.revenue.partnerEarnings}</span></p>
              <p className="text-[#A1A1AA] text-xs pt-2">Weekly and monthly series are available in the API response for exports.</p>
            </div>
          </div>

          <div className="fixoo-card">
            <p className="text-white font-semibold mb-4">Failed Request Analytics</p>
            <div className="space-y-3 text-sm">
              <p className="flex justify-between text-[#A1A1AA]"><span>Expired</span><span>{data.failedRequests.expired}</span></p>
              <p className="flex justify-between text-[#F97316]"><span>Partner No Show</span><span>{data.failedRequests.partnerNoShow}</span></p>
              <p className="flex justify-between text-[#EF4444]"><span>Customer No Show</span><span>{data.failedRequests.customerNoShow}</span></p>
              <p className="flex justify-between text-[#A1A1AA]"><span>Cancelled</span><span>{data.failedRequests.cancelled}</span></p>
            </div>
          </div>

          <div className="fixoo-card">
            <p className="text-white font-semibold mb-4">Demand by Area</p>
            <div className="space-y-2">
              {data.demand.byArea.slice(0, 8).map((item) => (
                <div key={item.area} className="flex items-center justify-between text-sm">
                  <span className="text-[#A1A1AA] flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> {item.area}</span>
                  <span className="text-white">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="fixoo-card overflow-x-auto">
            <p className="text-white font-semibold mb-4">Top Performing Partners</p>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2A2A2A]">
                  {["Partner", "Completed", "Accept %", "Response", "Earnings"].map((heading) => (
                    <th key={heading} className="text-left text-[#A1A1AA] text-xs font-medium uppercase tracking-wider pb-3 pr-4">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.topPartners.map((partner) => (
                  <tr key={partner.id} className="border-b border-[#2A2A2A]/50">
                    <td className="py-3 pr-4">
                      <p className="text-white text-sm">{partner.name}</p>
                      <p className="text-[#A1A1AA] text-xs">{partner.shopName}</p>
                    </td>
                    <td className="py-3 pr-4 text-white text-sm">{partner.jobsCompleted}</td>
                    <td className="py-3 pr-4 text-white text-sm">{partner.acceptanceRate}%</td>
                    <td className="py-3 pr-4 text-[#A1A1AA] text-sm">{secondsLabel(partner.responseTimeSeconds)}</td>
                    <td className="py-3 pr-4 text-[#22C55E] text-sm">Rs {partner.earnings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-6">
            <div className="fixoo-card">
              <p className="text-white font-semibold mb-4">Demand by Locality</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {data.demand.byLocality.slice(0, 10).map((item) => (
                  <p key={item.locality} className="flex justify-between text-sm bg-[#111111] rounded-lg px-3 py-2">
                    <span className="text-[#A1A1AA] truncate">{item.locality}</span>
                    <span className="text-white">{item.count}</span>
                  </p>
                ))}
              </div>
            </div>
            <div className="fixoo-card">
              <p className="text-white font-semibold mb-4">Demand by Pincode</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {data.demand.byPincode.slice(0, 10).map((item) => (
                  <p key={item.pincode} className="flex justify-between text-sm bg-[#111111] rounded-lg px-3 py-2">
                    <span className="text-[#A1A1AA]">{item.pincode}</span>
                    <span className="text-white">{item.count}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

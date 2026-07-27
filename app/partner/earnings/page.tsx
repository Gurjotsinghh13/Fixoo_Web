"use client";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { TrendingUp, CheckCircle, Star, Zap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { BottomNav } from "@/components/shared/BottomNav";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { format } from "date-fns";

export default function EarningsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["partner-earnings"],
    queryFn: async () => {
      const res = await axios.get("/api/partner/earnings");
      return res.data.data;
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const { earnings, stats, dailyBreakdown, recentJobs } = data || {};

  return (
    <div className="page-container min-h-screen">
      {/* Header */}
      <div className="safe-top px-4 pt-4 flex items-center gap-2 mb-2">
        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
          <Zap className="w-5 h-5 text-black fill-black" />
        </div>
        <h1 className="font-bold text-lg">Earnings</h1>
      </div>

      <div className="px-4 pb-28 space-y-5 overflow-y-auto">
        {/* Earnings summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Today", value: `₹${earnings?.today || 0}`, color: "text-[#22C55E]" },
            { label: "This Week", value: `₹${earnings?.thisWeek || 0}`, color: "text-white" },
            { label: "This Month", value: `₹${earnings?.thisMonth || 0}`, color: "text-white" },
          ].map((item) => (
            <div key={item.label} className="fixoo-card text-center">
              <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
              <p className="text-[#A1A1AA] text-xs mt-1">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Weekly chart */}
        {dailyBreakdown?.length > 0 && (
          <div className="fixoo-card">
            <p className="text-white font-semibold mb-4">Last 7 days</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={dailyBreakdown} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => format(new Date(d), "EEE")}
                  tick={{ fill: "#A1A1AA", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 8 }}
                  labelStyle={{ color: "#A1A1AA", fontSize: 11 }}
                  itemStyle={{ color: "#22C55E" }}
                  formatter={(v: number) => [`₹${v}`, "Earnings"]}
                  labelFormatter={(d) => format(new Date(d), "EEE, MMM d")}
                />
                <Bar dataKey="earnings" fill="#22C55E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Performance stats */}
        <div className="fixoo-card">
          <p className="text-white font-semibold mb-4">Performance</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-[#22C55E]" />
              <div>
                <p className="text-white font-bold text-xl">{stats?.completedJobs || 0}</p>
                <p className="text-[#A1A1AA] text-xs">Completed jobs</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Star className="w-8 h-8 text-yellow-400" />
              <div>
                <p className="text-white font-bold text-xl">{stats?.rating?.toFixed(1) || "—"}</p>
                <p className="text-[#A1A1AA] text-xs">Avg rating ({stats?.ratingCount || 0})</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-[#3B82F6]" />
              <div>
                <p className="text-white font-bold text-xl">{stats?.acceptanceRate || 0}%</p>
                <p className="text-[#A1A1AA] text-xs">Acceptance rate</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#2A2A2A] flex items-center justify-center text-sm font-bold">
                {stats?.averageResponseTimeSeconds == null ? "-" : `${stats.averageResponseTimeSeconds}s`}
              </div>
              <div>
                <p className="text-white font-bold text-xl">{stats?.totalJobs || 0}</p>
                <p className="text-[#A1A1AA] text-xs">Total jobs / response</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent jobs */}
        <div>
          <p className="text-white font-semibold mb-3">Recent Jobs</p>
          {recentJobs?.length === 0 ? (
            <div className="fixoo-card text-center py-8">
              <p className="text-[#A1A1AA]">No jobs yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentJobs?.map((job: {
                id: string;
                status: string;
                service: string;
                vehicleType: string;
                earning: number;
                area?: string;
                createdAt: string;
              }) => (
                <div key={job.id} className="fixoo-card flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-medium">{job.service} — {job.vehicleType}</p>
                    <p className="text-[#A1A1AA] text-xs mt-0.5">
                      {job.area || "Kota"} · {format(new Date(job.createdAt), "MMM d, h:mm a")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${job.status === "COMPLETED" ? "text-[#22C55E]" : "text-[#A1A1AA]"}`}>
                      {job.status === "COMPLETED" ? `₹${job.earning}` : job.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav role="partner" />
    </div>
  );
}

"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { format } from "date-fns";
import { Activity, CalendarDays, CheckCircle, Clock, Filter, XCircle, Zap } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

const STATUSES = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "REQUESTED", label: "Requested" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "ON_THE_WAY", label: "On the way" },
  { key: "ARRIVED", label: "Arrived" },
  { key: "REPAIR_IN_PROGRESS", label: "Repairing" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "EXPIRED", label: "Expired" },
  { key: "failed", label: "Failed queue" },
];

type AdminRequest = {
  id: string;
  status: string;
  customer: { name?: string | null; phone: string };
  partner?: { name: string; shopName: string; phone: string } | null;
  service: string;
  vehicleType: string;
  area?: string | null;
  totalAmount: number;
  broadcastsSent: number;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string | null;
  noShowType?: string | null;
  noShowReason?: string | null;
  transaction?: { status: string; platformFee: number; partnerEarning: number } | null;
};

type RequestResponse = {
  counts: {
    all: number;
    active: number;
    completed: number;
    cancelled: number;
    expired: number;
    byStatus: Record<string, number>;
  };
  requests: AdminRequest[];
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminRequestsPage() {
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());

  const query = useMemo(() => {
    const params = new URLSearchParams({ status });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }, [from, status, to]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-requests", query],
    queryFn: async () => {
      const res = await axios.get(`/api/admin/requests?${query}`);
      return res.data.data as RequestResponse;
    },
    refetchInterval: 20000,
  });

  return (
    <div className="min-h-screen bg-black">
      <div className="border-b border-[#2A2A2A] px-6 py-4 flex items-center gap-3">
        <a href="/admin/dashboard" className="text-[#A1A1AA] hover:text-white">
          <Zap className="w-5 h-5" />
        </a>
        <span className="text-[#2A2A2A]">/</span>
        <h1 className="text-white font-semibold">Requests</h1>
        {isFetching && <LoadingSpinner size="sm" />}
      </div>

      <div className="px-6 py-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <div className="fixoo-card">
            <Activity className="w-5 h-5 text-[#3B82F6] mb-2" />
            <p className="text-white text-2xl font-bold">{data?.counts.active || 0}</p>
            <p className="text-[#A1A1AA] text-sm">Active jobs</p>
          </div>
          <div className="fixoo-card">
            <CheckCircle className="w-5 h-5 text-[#22C55E] mb-2" />
            <p className="text-white text-2xl font-bold">{data?.counts.completed || 0}</p>
            <p className="text-[#A1A1AA] text-sm">Completed jobs</p>
          </div>
          <div className="fixoo-card">
            <XCircle className="w-5 h-5 text-[#EF4444] mb-2" />
            <p className="text-white text-2xl font-bold">{data?.counts.cancelled || 0}</p>
            <p className="text-[#A1A1AA] text-sm">Cancelled jobs</p>
          </div>
          <div className="fixoo-card">
            <Clock className="w-5 h-5 text-[#A1A1AA] mb-2" />
            <p className="text-white text-2xl font-bold">{data?.counts.expired || 0}</p>
            <p className="text-[#A1A1AA] text-sm">Expired jobs</p>
          </div>
          <div className="fixoo-card">
            <Filter className="w-5 h-5 text-[#F97316] mb-2" />
            <p className="text-white text-2xl font-bold">{data?.counts.all || 0}</p>
            <p className="text-[#A1A1AA] text-sm">All requests</p>
          </div>
        </div>

        <div className="fixoo-card mb-6">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
            <div className="flex-1">
              <p className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-2">Status</p>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setStatus(item.key)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium ${
                      status === item.key
                        ? "bg-white text-black"
                        : "bg-[#111111] border border-[#2A2A2A] text-[#A1A1AA] hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-2 flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" /> From
              </span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="fixoo-input py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-2 block">To</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="fixoo-input py-2 text-sm" />
            </label>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
        ) : !data?.requests.length ? (
          <div className="fixoo-card text-center py-12">
            <p className="text-[#A1A1AA]">No requests found</p>
          </div>
        ) : (
          <div className="fixoo-card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2A2A2A]">
                  {["Request", "Customer", "Partner", "Amount", "Broadcasts", "Status", "Created"].map((heading) => (
                    <th key={heading} className="text-left text-[#A1A1AA] text-xs font-medium uppercase tracking-wider pb-3 pr-4">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.requests.map((request) => (
                  <tr key={request.id} className="border-b border-[#2A2A2A]/50">
                    <td className="py-3 pr-4">
                      <a href={`/admin/requests/${request.id}`} className="text-white text-sm font-medium hover:underline">
                        {request.service}
                      </a>
                      <p className="text-[#A1A1AA] text-xs">{request.vehicleType} · {request.area || "Kota"}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-white text-sm">{request.customer.name || "Customer"}</p>
                      <p className="text-[#A1A1AA] text-xs font-mono">{request.customer.phone}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-white text-sm">{request.partner?.name || "-"}</p>
                      <p className="text-[#A1A1AA] text-xs">{request.partner?.shopName || ""}</p>
                    </td>
                    <td className="py-3 pr-4 text-white text-sm">Rs {request.totalAmount}</td>
                    <td className="py-3 pr-4 text-[#A1A1AA] text-sm">{request.broadcastsSent}</td>
                    <td className="py-3 pr-4">
                      <span className="text-white text-xs font-medium">{request.status}</span>
                      {request.cancelReason && <p className="text-[#EF4444] text-xs mt-1">{request.cancelReason}</p>}
                      {request.noShowType && <p className="text-[#F97316] text-xs mt-1">{request.noShowType} no-show</p>}
                    </td>
                    <td className="py-3 pr-4 text-[#A1A1AA] text-xs">
                      {format(new Date(request.createdAt), "MMM d, h:mm a")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

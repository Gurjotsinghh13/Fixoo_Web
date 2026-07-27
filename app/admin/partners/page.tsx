"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Search, CheckCircle, XCircle, AlertCircle, Zap } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { toast } from "@/components/shared/Toaster";
import { format } from "date-fns";

type FilterType = "all" | "pending" | "approved" | "rejected" | "suspended" | "online";

const FILTERS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "online", label: "Online" },
  { key: "suspended", label: "Suspended" },
];

interface Partner {
  id: string;
  name: string;
  shopName: string;
  phone: string;
  address?: string;
  aadhaarNumber?: string | null;
  workingHours?: string | null;
  serviceRadius: number;
  applicationStatus: string;
  applicationNotes?: string | null;
  shopPhotoUrl?: string | null;
  idProofUrl?: string | null;
  addressProofUrl?: string | null;
  lastOnlineAt?: string | null;
  lastCompletedAt?: string | null;
  isOnline: boolean;
  isApproved: boolean;
  isSuspended: boolean;
  rating: number;
  totalJobs: number;
  completedJobs: number;
  location?: { latitude: number; longitude: number; lastSeenAt: string } | null;
  activeJobs: Array<{ id: string; status: string; area?: string | null; createdAt: string }>;
  vehicleTypes: string[];
  metrics: {
    totalRequestsReceived: number;
    acceptedRequests: number;
    completedRequests: number;
    acceptanceRate: number;
    averageResponseTimeSeconds: number | null;
    completionRate: number;
    earnings: number;
  };
  inactiveFlags: {
    notOnline7Days: boolean;
    noCompletedJob14Days: boolean;
    lowAcceptanceRate: boolean;
  };
  healthScore: number;
  leaderboardRank: number;
  activities: Array<{ id: string; type: string; note?: string | null; createdAt: string }>;
  reviewNotes: Array<{ id: string; note: string; adminId?: string | null; createdAt: string }>;
  createdAt: string;
}

function DocLink({ label, href }: { label: string; href?: string | null }) {
  if (!href) return <p className="text-[#52525B] text-xs">{label}: missing</p>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="block text-[#A1A1AA] hover:text-white text-xs">
      {label}: view
    </a>
  );
}

export default function AdminPartnersPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterType>("pending");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: partners, isLoading } = useQuery({
    queryKey: ["admin-partners", filter, search],
    queryFn: async () => {
      const res = await axios.get(
        `/api/admin/partners?filter=${filter}&search=${encodeURIComponent(search)}`
      );
      return res.data.data as Partner[];
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ partnerId, action }: { partnerId: string; action: string }) => {
      const res = await axios.patch("/api/admin/partners", {
        partnerId,
        action,
        note: notes[partnerId] || undefined,
      });
      return res.data;
    },
    onSuccess: (_, { action, partnerId }) => {
      const msgs: Record<string, string> = {
        approve: "Partner approved",
        reject: "Partner rejected",
        suspend: "Partner suspended",
        unsuspend: "Partner unsuspended",
        offline: "Partner marked offline",
        note: "Note added",
      };
      toast(msgs[action] || "Done", "success");
      setNotes((current) => ({ ...current, [partnerId]: "" }));
      queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
      queryClient.invalidateQueries({ queryKey: ["admin-analytics"] });
    },
    onError: () => toast("Action failed", "error"),
  });

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="border-b border-[#2A2A2A] px-6 py-4 flex items-center gap-3">
        <a href="/admin/dashboard" className="text-[#A1A1AA] hover:text-white">
          <Zap className="w-5 h-5" />
        </a>
        <span className="text-[#2A2A2A]">/</span>
        <h1 className="text-white font-semibold">Partners</h1>
      </div>

      <div className="px-6 py-6 max-w-6xl mx-auto">
        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA]" />
            <input
              type="text"
              placeholder="Search by name, phone, shop..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="fixoo-input pl-10 py-2.5 text-sm"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === f.key
                    ? "bg-white text-black"
                    : "bg-[#1A1A1A] text-[#A1A1AA] border border-[#2A2A2A] hover:text-white"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Partners list */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : partners?.length === 0 ? (
          <div className="fixoo-card text-center py-12">
            <p className="text-[#A1A1AA]">No partners found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {partners?.map((partner) => (
              <div key={partner.id} className="fixoo-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-[#2A2A2A] flex items-center justify-center text-lg font-bold flex-shrink-0">
                      {partner.name[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-semibold">{partner.name}</p>
                        {partner.isOnline && (
                          <span className="text-xs bg-[#22C55E]/20 text-[#22C55E] px-2 py-0.5 rounded-full">
                            Online
                          </span>
                        )}
                        {partner.isSuspended && (
                          <span className="text-xs bg-[#EF4444]/20 text-[#EF4444] px-2 py-0.5 rounded-full">
                            Suspended
                          </span>
                        )}
                        {partner.applicationStatus === "PENDING" && !partner.isSuspended && (
                          <span className="text-xs bg-[#F97316]/20 text-[#F97316] px-2 py-0.5 rounded-full">
                            Pending
                          </span>
                        )}
                        {partner.applicationStatus === "REJECTED" && (
                          <span className="text-xs bg-[#EF4444]/20 text-[#EF4444] px-2 py-0.5 rounded-full">
                            Rejected
                          </span>
                        )}
                        <span className="text-xs bg-white/10 text-white px-2 py-0.5 rounded-full">
                          #{partner.leaderboardRank} leaderboard
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          partner.healthScore >= 75
                            ? "bg-[#22C55E]/20 text-[#22C55E]"
                            : partner.healthScore >= 50
                              ? "bg-[#F97316]/20 text-[#F97316]"
                              : "bg-[#EF4444]/20 text-[#EF4444]"
                        }`}>
                          Health {partner.healthScore}
                        </span>
                      </div>
                      <p className="text-[#A1A1AA] text-sm">{partner.shopName}</p>
                      <p className="text-[#A1A1AA] text-xs font-mono mt-0.5">{partner.phone}</p>
                      {partner.address && (
                        <p className="text-[#A1A1AA] text-xs mt-0.5 truncate">{partner.address}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="text-xs text-[#A1A1AA]">{partner.serviceRadius}km radius</span>
                        {partner.workingHours && (
                          <span className="text-xs text-[#A1A1AA]">{partner.workingHours}</span>
                        )}
                        {partner.aadhaarNumber && (
                          <span className="text-xs text-[#A1A1AA]">Aadhaar on file</span>
                        )}
                        {partner.lastOnlineAt && (
                          <span className="text-xs text-[#A1A1AA]">
                            Last online {format(new Date(partner.lastOnlineAt), "MMM d")}
                          </span>
                        )}
                      </div>
                      {(partner.inactiveFlags.notOnline7Days || partner.inactiveFlags.noCompletedJob14Days || partner.inactiveFlags.lowAcceptanceRate) && (
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {partner.inactiveFlags.notOnline7Days && (
                            <span className="text-xs bg-[#F97316]/15 text-[#F97316] px-2 py-0.5 rounded-full">Offline 7d</span>
                          )}
                          {partner.inactiveFlags.noCompletedJob14Days && (
                            <span className="text-xs bg-[#F97316]/15 text-[#F97316] px-2 py-0.5 rounded-full">No completion 14d</span>
                          )}
                          {partner.inactiveFlags.lowAcceptanceRate && (
                            <span className="text-xs bg-[#EF4444]/15 text-[#EF4444] px-2 py-0.5 rounded-full">Low accept rate</span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="text-xs text-[#A1A1AA]">
                          ⭐ {partner.rating?.toFixed(1) || "—"}
                        </span>
                        <span className="text-xs text-[#A1A1AA]">
                          {partner.completedJobs} jobs
                        </span>
                        {partner.vehicleTypes.length > 0 && (
                          <span className="text-xs text-[#A1A1AA]">
                            {partner.vehicleTypes.join(", ")}
                          </span>
                        )}
                        <span className="text-xs text-[#A1A1AA]">
                          Joined {format(new Date(partner.createdAt), "MMM d, yyyy")}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
                        <div className="bg-[#111111] rounded-lg px-3 py-2">
                          <p className="text-[#A1A1AA] text-[11px]">Received</p>
                          <p className="text-white text-sm font-semibold">{partner.metrics.totalRequestsReceived}</p>
                        </div>
                        <div className="bg-[#111111] rounded-lg px-3 py-2">
                          <p className="text-[#A1A1AA] text-[11px]">Accepted</p>
                          <p className="text-white text-sm font-semibold">{partner.metrics.acceptedRequests}</p>
                        </div>
                        <div className="bg-[#111111] rounded-lg px-3 py-2">
                          <p className="text-[#A1A1AA] text-[11px]">Completed</p>
                          <p className="text-white text-sm font-semibold">{partner.metrics.completedRequests}</p>
                        </div>
                        <div className="bg-[#111111] rounded-lg px-3 py-2">
                          <p className="text-[#A1A1AA] text-[11px]">Accept rate</p>
                          <p className="text-white text-sm font-semibold">{partner.metrics.acceptanceRate}%</p>
                        </div>
                        <div className="bg-[#111111] rounded-lg px-3 py-2">
                          <p className="text-[#A1A1AA] text-[11px]">Avg response</p>
                          <p className="text-white text-sm font-semibold">
                            {partner.metrics.averageResponseTimeSeconds === null ? "-" : `${partner.metrics.averageResponseTimeSeconds}s`}
                          </p>
                        </div>
                        <div className="bg-[#111111] rounded-lg px-3 py-2">
                          <p className="text-[#A1A1AA] text-[11px]">Earnings</p>
                          <p className="text-white text-sm font-semibold">Rs {partner.metrics.earnings}</p>
                        </div>
                      </div>
                      <div className="grid md:grid-cols-3 gap-3 mt-4">
                        <div className="bg-[#111111] rounded-lg p-3">
                          <p className="text-[#A1A1AA] text-[11px] uppercase tracking-widest mb-2">Documents</p>
                          <div className="space-y-1">
                            <DocLink label="Shop photo" href={partner.shopPhotoUrl} />
                            <DocLink label="ID proof" href={partner.idProofUrl} />
                            <DocLink label="Address proof" href={partner.addressProofUrl} />
                          </div>
                        </div>
                        <div className="bg-[#111111] rounded-lg p-3">
                          <p className="text-[#A1A1AA] text-[11px] uppercase tracking-widest mb-2">Activity Timeline</p>
                          <div className="space-y-2">
                            {partner.activities.length === 0 ? (
                              <p className="text-[#A1A1AA] text-xs">No activity yet</p>
                            ) : partner.activities.slice(0, 4).map((activity) => (
                              <div key={activity.id}>
                                <p className="text-white text-xs">{activity.type.replaceAll("_", " ")}</p>
                                <p className="text-[#A1A1AA] text-[11px]">
                                  {format(new Date(activity.createdAt), "MMM d, h:mm a")}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="bg-[#111111] rounded-lg p-3">
                          <p className="text-[#A1A1AA] text-[11px] uppercase tracking-widest mb-2">Review Notes</p>
                          <div className="space-y-2 mb-3">
                            {partner.reviewNotes.length === 0 ? (
                              <p className="text-[#A1A1AA] text-xs">No notes</p>
                            ) : partner.reviewNotes.slice(0, 2).map((item) => (
                              <p key={item.id} className="text-[#A1A1AA] text-xs">{item.note}</p>
                            ))}
                          </div>
                          <textarea
                            value={notes[partner.id] || ""}
                            onChange={(event) => setNotes((current) => ({ ...current, [partner.id]: event.target.value }))}
                            placeholder="Add review note"
                            className="fixoo-input min-h-16 text-xs mb-2"
                          />
                          <button
                            onClick={() => actionMutation.mutate({ partnerId: partner.id, action: "note" })}
                            disabled={!notes[partner.id]?.trim() || actionMutation.isPending}
                            className="w-full px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-medium hover:bg-white/20 transition-colors disabled:opacity-50"
                          >
                            Add note
                          </button>
                        </div>
                      </div>
                      <div className="grid md:grid-cols-2 gap-3 mt-3">
                        <div className="bg-[#111111] rounded-lg p-3">
                          <p className="text-[#A1A1AA] text-[11px] uppercase tracking-widest mb-2">Active Jobs</p>
                          {partner.activeJobs.length === 0 ? (
                            <p className="text-[#A1A1AA] text-xs">No active job</p>
                          ) : partner.activeJobs.map((job) => (
                            <a
                              key={job.id}
                              href={`/admin/requests/${job.id}`}
                              className="block text-white text-xs hover:underline"
                            >
                              {job.status.replaceAll("_", " ")} · {job.area || "Kota"}
                            </a>
                          ))}
                        </div>
                        <div className="bg-[#111111] rounded-lg p-3">
                          <p className="text-[#A1A1AA] text-[11px] uppercase tracking-widest mb-2">Last Location</p>
                          {partner.location ? (
                            <a
                              href={`https://www.google.com/maps?q=${partner.location.latitude},${partner.location.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-white text-xs hover:underline"
                            >
                              {partner.location.latitude.toFixed(5)}, {partner.location.longitude.toFixed(5)}
                            </a>
                          ) : (
                            <p className="text-[#A1A1AA] text-xs">No location reported</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {!partner.isApproved && !partner.isSuspended && partner.applicationStatus !== "REJECTED" && (
                      <>
                        <button
                          onClick={() => actionMutation.mutate({ partnerId: partner.id, action: "approve" })}
                          disabled={actionMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22C55E]/20 text-[#22C55E] text-sm font-medium hover:bg-[#22C55E]/30 transition-colors"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => actionMutation.mutate({ partnerId: partner.id, action: "reject" })}
                          disabled={actionMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EF4444]/20 text-[#EF4444] text-sm font-medium hover:bg-[#EF4444]/30 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    )}
                    {partner.isApproved && !partner.isSuspended && (
                      <>
                        {partner.isOnline && (
                          <button
                            onClick={() => actionMutation.mutate({ partnerId: partner.id, action: "offline" })}
                            disabled={actionMutation.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Offline
                          </button>
                        )}
                        <button
                          onClick={() => actionMutation.mutate({ partnerId: partner.id, action: "suspend" })}
                          disabled={actionMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F97316]/20 text-[#F97316] text-sm font-medium hover:bg-[#F97316]/30 transition-colors"
                        >
                          <AlertCircle className="w-3.5 h-3.5" /> Suspend
                        </button>
                      </>
                    )}
                    {partner.isSuspended && (
                      <button
                        onClick={() => actionMutation.mutate({ partnerId: partner.id, action: "unsuspend" })}
                        disabled={actionMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Unsuspend
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

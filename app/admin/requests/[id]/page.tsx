"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle, Clock, RefreshCw, Send, UserX, Zap } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { toast } from "@/components/shared/Toaster";
import Link from "next/link";

type RequestDetail = {
  id: string;
  status: string;
  customer: { id: string; name?: string | null; phone: string };
  partner?: { id: string; name: string; shopName: string; phone: string; isOnline: boolean; rating: number } | null;
  service: string;
  vehicleType: string;
  area?: string | null;
  address?: string | null;
  totalAmount: number;
  serviceFee: number;
  platformFee: number;
  createdAt: string;
  acceptedAt?: string;
  onTheWayAt?: string;
  arrivedAt?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string | null;
  noShowType?: string | null;
  noShowReason?: string | null;
  noShowAt?: string;
  supportStatus?: string | null;
  supportReason?: string | null;
  supportUpdatedAt?: string;
  transaction?: {
    status: string;
    totalAmount: number;
    platformFee: number;
    partnerEarning: number;
    paidAt?: string;
    refundedAt?: string;
    paymentNote?: string | null;
    paymentEvidenceUrl?: string | null;
  } | null;
  feedback?: {
    rating: number;
    comment?: string | null;
    createdAt: string;
  } | null;
  broadcasts: Array<{
    id: string;
    partner: { id: string; name: string; shopName: string; phone: string };
    response?: string | null;
    sentAt: string;
    respondedAt?: string;
  }>;
  supportNotes: Array<{ id: string; note: string; adminId?: string | null; createdAt: string }>;
  statusHistory: Array<{
    id: string;
    actorRole: string;
    fromStatus?: string | null;
    toStatus: string;
    reason?: string | null;
    createdAt: string;
  }>;
  eligiblePartners: Array<{ id: string; name: string; shopName: string; phone: string; isOnline: boolean; rating: number }>;
};

function TimelineItem({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3">
      <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
      <div>
        <p className="text-white text-sm">{label}</p>
        <p className="text-[#A1A1AA] text-xs">{format(new Date(value), "MMM d, h:mm a")}</p>
      </div>
    </div>
  );
}

export default function AdminRequestDetailPage() {
  const params = useParams();
  const requestId = params.id as string;
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [supportStatus, setSupportStatus] = useState("SUPPORT_FOLLOW_UP");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-request-detail", requestId],
    queryFn: async () => {
      const res = await axios.get(`/api/admin/requests/${requestId}`);
      return res.data.data as RequestDetail;
    },
    refetchInterval: 15000,
  });

  const actionMutation = useMutation({
    mutationFn: async (action: string) => {
      const res = await axios.patch(`/api/admin/requests/${requestId}`, {
        action,
        reason: reason || undefined,
        partnerId: action === "assign_partner" ? partnerId : undefined,
        supportStatus: action === "set_support_queue" ? supportStatus : undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      toast("Request updated", "success");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-request-detail", requestId] });
      queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
    },
    onError: (error) => {
      const msg = axios.isAxiosError(error) ? error.response?.data?.error : "Action failed";
      toast(msg || "Action failed", "error");
    },
  });

  const noteMutation = useMutation({
    mutationFn: async () => {
      const res = await axios.post(`/api/admin/requests/${requestId}/notes`, { note });
      return res.data;
    },
    onSuccess: () => {
      toast("Note added", "success");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["admin-request-detail", requestId] });
    },
    onError: () => toast("Failed to add note", "error"),
  });

  if (isLoading || !data) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="border-b border-[#2A2A2A] px-6 py-4 flex items-center gap-3">
        <a href="/admin/dashboard" className="text-[#A1A1AA] hover:text-white">
          <Zap className="w-5 h-5" />
        </a>
        <span className="text-[#2A2A2A]">/</span>
        <Link href="/admin/requests" className="text-[#A1A1AA] hover:text-white">Requests</Link>
        <span className="text-[#2A2A2A]">/</span>
        <h1 className="text-white font-semibold">{data.service}</h1>
      </div>

      <div className="px-6 py-6 max-w-7xl mx-auto grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-4">
          <div className="fixoo-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[#A1A1AA] text-xs uppercase tracking-widest">Request</p>
                <h2 className="text-white text-2xl font-bold mt-1">{data.service}</h2>
                <p className="text-[#A1A1AA] text-sm">{data.vehicleType} · {data.area || "Kota"}</p>
              </div>
              <span className="text-white text-sm font-semibold">{data.status}</span>
            </div>
            {data.noShowType && (
              <div className="mt-4 border border-[#F97316]/30 rounded-lg p-3">
                <p className="text-[#F97316] text-sm font-semibold">{data.noShowType} no-show</p>
                <p className="text-[#A1A1AA] text-xs mt-1">{data.noShowReason}</p>
              </div>
            )}
            {data.supportStatus && (
              <div className="mt-4 border border-[#F97316]/30 rounded-lg p-3">
                <p className="text-[#F97316] text-sm font-semibold">
                  {data.supportStatus.replaceAll("_", " ")}
                </p>
                <p className="text-[#A1A1AA] text-xs mt-1">{data.supportReason}</p>
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="fixoo-card">
              <p className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-3">Customer</p>
              <p className="text-white font-semibold">{data.customer.name || "Customer"}</p>
              <p className="text-[#A1A1AA] text-sm font-mono">{data.customer.phone}</p>
            </div>
            <div className="fixoo-card">
              <p className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-3">Partner</p>
              <p className="text-white font-semibold">{data.partner?.name || "Unassigned"}</p>
              <p className="text-[#A1A1AA] text-sm">{data.partner?.shopName || "-"}</p>
              {data.partner && <p className="text-[#A1A1AA] text-xs font-mono">{data.partner.phone}</p>}
            </div>
          </div>

          <div className="fixoo-card">
            <p className="text-white font-semibold mb-4">Timeline</p>
            <div className="space-y-4">
              <TimelineItem label="Created" value={data.createdAt} />
              <TimelineItem label="Accepted" value={data.acceptedAt} />
              <TimelineItem label="On the way" value={data.onTheWayAt} />
              <TimelineItem label="Arrived" value={data.arrivedAt} />
              <TimelineItem label="Repair started" value={data.startedAt} />
              <TimelineItem label="Completed" value={data.completedAt} />
              <TimelineItem label="Cancelled" value={data.cancelledAt} />
            </div>
          </div>

          <div className="fixoo-card">
            <p className="text-white font-semibold mb-4">Status History</p>
            <div className="space-y-3">
              {data.statusHistory.length === 0 ? (
                <p className="text-[#A1A1AA] text-sm">No status history yet</p>
              ) : data.statusHistory.map((item) => (
                <div key={item.id} className="border-b border-[#2A2A2A]/50 pb-3">
                  <p className="text-white text-sm">
                    {item.fromStatus || "NEW"} → {item.toStatus}
                  </p>
                  <p className="text-[#A1A1AA] text-xs">
                    {item.actorRole} · {format(new Date(item.createdAt), "MMM d, h:mm a")}
                  </p>
                  {item.reason && <p className="text-[#A1A1AA] text-xs mt-1">{item.reason}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className="fixoo-card">
            <p className="text-white font-semibold mb-4">Broadcasts</p>
            <div className="space-y-2">
              {data.broadcasts.map((broadcast) => (
                <div key={broadcast.id} className="flex justify-between gap-3 text-sm border-b border-[#2A2A2A]/50 pb-2">
                  <div>
                    <p className="text-white">{broadcast.partner.name}</p>
                    <p className="text-[#A1A1AA] text-xs">{broadcast.partner.shopName}</p>
                  </div>
                  <p className="text-[#A1A1AA]">{broadcast.response || "Pending"}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="fixoo-card">
            <p className="text-white font-semibold mb-3">Admin Actions</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason"
              className="fixoo-input min-h-20 text-sm mb-3"
            />
            <div className="grid grid-cols-1 gap-2">
              <button onClick={() => actionMutation.mutate("remove_partner")} className="fixoo-btn-secondary flex items-center justify-center gap-2">
                <UserX className="w-4 h-4" /> Remove partner
              </button>
              <button onClick={() => actionMutation.mutate("rebroadcast")} className="fixoo-btn-secondary flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" /> Rebroadcast
              </button>
              <button onClick={() => actionMutation.mutate("partner_no_show")} className="fixoo-btn-secondary flex items-center justify-center gap-2 text-[#F97316]">
                <AlertTriangle className="w-4 h-4" /> Mark Partner No Show
              </button>
              <button onClick={() => actionMutation.mutate("customer_no_show")} className="fixoo-btn-secondary flex items-center justify-center gap-2 text-[#EF4444]">
                <AlertTriangle className="w-4 h-4" /> Mark Customer No Show
              </button>
              <button onClick={() => actionMutation.mutate("cancel")} className="fixoo-btn-secondary flex items-center justify-center gap-2 text-[#EF4444]">
                <AlertTriangle className="w-4 h-4" /> Cancel request
              </button>
            </div>
          </div>

          <div className="fixoo-card">
            <p className="text-white font-semibold mb-3">Operations Queue</p>
            <select
              value={supportStatus}
              onChange={(event) => setSupportStatus(event.target.value)}
              className="fixoo-input text-sm mb-3"
            >
              <option value="PAYMENT_ISSUE">Payment issue</option>
              <option value="PAYMENT_DISPUTE">Payment dispute</option>
              <option value="REFUND_REQUIRED">Refund required</option>
              <option value="SUPPORT_FOLLOW_UP">Support follow-up</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => actionMutation.mutate("set_support_queue")}
                className="fixoo-btn-primary"
              >
                Add to queue
              </button>
              <button
                onClick={() => actionMutation.mutate("clear_support_queue")}
                disabled={!data.supportStatus}
                className="fixoo-btn-secondary"
              >
                Resolve
              </button>
            </div>
          </div>

          <div className="fixoo-card">
            <p className="text-white font-semibold mb-3">Assign Partner</p>
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="fixoo-input text-sm mb-3">
              <option value="">Select partner</option>
              {data.eligiblePartners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name} · {partner.isOnline ? "Online" : "Offline"}
                </option>
              ))}
            </select>
            <button
              onClick={() => actionMutation.mutate("assign_partner")}
              disabled={!partnerId || actionMutation.isPending}
              className="fixoo-btn-primary"
            >
              Assign selected partner
            </button>
          </div>

          <div className="fixoo-card">
            <p className="text-white font-semibold mb-3">Support Notes</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Partner called customer."
              className="fixoo-input min-h-24 text-sm mb-3"
            />
            <button onClick={() => noteMutation.mutate()} disabled={!note.trim()} className="fixoo-btn-primary flex items-center justify-center gap-2">
              <Send className="w-4 h-4" /> Add note
            </button>
            <div className="space-y-3 mt-4">
              {data.supportNotes.map((item) => (
                <div key={item.id} className="border-b border-[#2A2A2A]/50 pb-3">
                  <p className="text-white text-sm">{item.note}</p>
                  <p className="text-[#A1A1AA] text-xs mt-1">{format(new Date(item.createdAt), "MMM d, h:mm a")}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="fixoo-card">
            <p className="text-white font-semibold mb-3">Transaction</p>
            {data.transaction ? (
              <div className="space-y-2 text-sm">
                <p className="text-white flex justify-between"><span>Total</span><span>Rs {data.transaction.totalAmount}</span></p>
                <p className="text-[#A1A1AA] flex justify-between"><span>Platform</span><span>Rs {data.transaction.platformFee}</span></p>
                <p className="text-[#A1A1AA] flex justify-between"><span>Partner</span><span>Rs {data.transaction.partnerEarning}</span></p>
                <p className="text-[#A1A1AA] flex justify-between"><span>Status</span><span>{data.transaction.status}</span></p>
                {data.transaction.paymentNote && (
                  <p className="text-[#A1A1AA] text-xs">{data.transaction.paymentNote}</p>
                )}
                {data.transaction.paymentEvidenceUrl && (
                  <a
                    href={data.transaction.paymentEvidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white text-xs underline"
                  >
                    View payment evidence
                  </a>
                )}
              </div>
            ) : (
              <p className="text-[#A1A1AA] text-sm">No transaction yet</p>
            )}
          </div>

          <div className="fixoo-card">
            <p className="text-white font-semibold mb-3">Customer Feedback</p>
            {data.feedback ? (
              <div className="space-y-2">
                <p className="text-yellow-400 font-semibold">{"★".repeat(data.feedback.rating)}{"☆".repeat(5 - data.feedback.rating)}</p>
                {data.feedback.comment && <p className="text-white text-sm">{data.feedback.comment}</p>}
                <p className="text-[#A1A1AA] text-xs">
                  {format(new Date(data.feedback.createdAt), "MMM d, h:mm a")}
                </p>
              </div>
            ) : (
              <p className="text-[#A1A1AA] text-sm">No feedback submitted yet</p>
            )}
          </div>

          <div className="fixoo-card border-[#22C55E]/20">
            <CheckCircle className="w-5 h-5 text-[#22C55E] mb-2" />
            <p className="text-white font-semibold">Pilot Controls</p>
            <p className="text-[#A1A1AA] text-xs mt-1">
              Use these controls only after calling customer and partner.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

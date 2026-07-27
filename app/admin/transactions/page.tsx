"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { format } from "date-fns";
import { Banknote, HandCoins, ReceiptText, TrendingUp, Zap } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { toast } from "@/components/shared/Toaster";

type TransactionRow = {
  id: string;
  requestId: string;
  status: string;
  totalAmount: number;
  platformFee: number;
  partnerEarning: number;
  paymentMethod?: string | null;
  razorpayId?: string | null;
  paidAt?: string;
  settledAt?: string;
  refundedAt?: string;
  paymentNote?: string | null;
  paymentEvidenceUrl?: string | null;
  createdAt: string;
  partner: { name: string; shopName: string; phone: string };
  request: {
    status: string;
    area?: string | null;
    user: { name?: string | null; phone: string };
    service: { displayName: string };
    vehicleType: { displayName: string };
  };
};

type TransactionResponse = {
  totals: {
    count: number;
    totalAmount: number;
    platformFee: number;
    partnerEarning: number;
  };
  statusTotals: { pending: number; confirmed: number; refunded: number };
  transactions: TransactionRow[];
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminTransactionsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});

  const query = useMemo(() => {
    const params = new URLSearchParams({ status });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }, [from, status, to]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-transactions", query],
    queryFn: async () => {
      const res = await axios.get(`/api/admin/transactions?${query}`);
      return res.data.data as TransactionResponse;
    },
    refetchInterval: 15000,
  });

  const paymentMutation = useMutation({
    mutationFn: async ({ transactionId, action }: { transactionId: string; action: string }) => {
      const response = await axios.patch("/api/admin/transactions", {
        transactionId,
        action,
        note: notes[transactionId] || undefined,
        paymentEvidenceUrl: evidence[transactionId] || undefined,
      });
      return response.data;
    },
    onSuccess: () => {
      toast("Payment updated", "success");
      queryClient.invalidateQueries({ queryKey: ["admin-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-analytics"] });
    },
    onError: (error) => {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : "Payment action failed";
      toast(message || "Payment action failed", "error");
    },
  });

  return (
    <div className="min-h-screen bg-black">
      <div className="border-b border-[#2A2A2A] px-6 py-4 flex items-center gap-3">
        <a href="/admin/dashboard" className="text-[#A1A1AA] hover:text-white">
          <Zap className="w-5 h-5" />
        </a>
        <span className="text-[#2A2A2A]">/</span>
        <h1 className="text-white font-semibold">Transactions</h1>
      </div>

      <div className="px-6 py-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="fixoo-card">
            <ReceiptText className="w-5 h-5 text-[#3B82F6] mb-2" />
            <p className="text-white text-2xl font-bold">{data?.totals.count || 0}</p>
            <p className="text-[#A1A1AA] text-sm">Transactions</p>
          </div>
          <div className="fixoo-card">
            <Banknote className="w-5 h-5 text-white mb-2" />
            <p className="text-white text-2xl font-bold">Rs {data?.totals.totalAmount || 0}</p>
            <p className="text-[#A1A1AA] text-sm">Gross value</p>
          </div>
          <div className="fixoo-card">
            <TrendingUp className="w-5 h-5 text-[#22C55E] mb-2" />
            <p className="text-white text-2xl font-bold">Rs {data?.totals.platformFee || 0}</p>
            <p className="text-[#A1A1AA] text-sm">Fixoo commission</p>
          </div>
          <div className="fixoo-card">
            <HandCoins className="w-5 h-5 text-[#F97316] mb-2" />
            <p className="text-white text-2xl font-bold">Rs {data?.totals.partnerEarning || 0}</p>
            <p className="text-[#A1A1AA] text-sm">Partner earnings</p>
          </div>
        </div>

        <div className="fixoo-card mb-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <label className="block">
              <span className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-2 block">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="fixoo-input py-2 text-sm">
                <option value="all">All</option>
                <option value="PENDING_PAYMENT">Pending payment</option>
                <option value="PAYMENT_CONFIRMED">Payment confirmed</option>
                <option value="REFUNDED">Refunded</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-2 block">From</span>
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
        ) : !data?.transactions.length ? (
          <div className="fixoo-card text-center py-12">
            <p className="text-[#A1A1AA]">No transactions found</p>
          </div>
        ) : (
          <div className="fixoo-card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2A2A2A]">
                  {["Job", "Customer", "Partner", "Gross", "Commission", "Partner", "Status", "Payment controls"].map((heading) => (
                    <th key={heading} className="text-left text-[#A1A1AA] text-xs font-medium uppercase tracking-wider pb-3 pr-4">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((txn) => (
                  <tr key={txn.id} className="border-b border-[#2A2A2A]/50">
                    <td className="py-3 pr-4">
                      <p className="text-white text-sm font-medium">{txn.request.service.displayName}</p>
                      <p className="text-[#A1A1AA] text-xs">{txn.request.vehicleType.displayName} · {txn.request.area || "Kota"}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-white text-sm">{txn.request.user.name || "Customer"}</p>
                      <p className="text-[#A1A1AA] text-xs font-mono">{txn.request.user.phone}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-white text-sm">{txn.partner.name}</p>
                      <p className="text-[#A1A1AA] text-xs">{txn.partner.shopName}</p>
                    </td>
                    <td className="py-3 pr-4 text-white text-sm">Rs {txn.totalAmount}</td>
                    <td className="py-3 pr-4 text-[#22C55E] text-sm">Rs {txn.platformFee}</td>
                    <td className="py-3 pr-4 text-[#F97316] text-sm">Rs {txn.partnerEarning}</td>
                    <td className="py-3 pr-4 text-white text-xs">{txn.status}</td>
                    <td className="py-3 min-w-64">
                      <input
                        value={notes[txn.id] ?? txn.paymentNote ?? ""}
                        onChange={(event) => setNotes((current) => ({ ...current, [txn.id]: event.target.value }))}
                        placeholder="Payment note or refund reason"
                        className="fixoo-input py-1.5 text-xs mb-2"
                      />
                      <input
                        value={evidence[txn.id] ?? txn.paymentEvidenceUrl ?? ""}
                        onChange={(event) => setEvidence((current) => ({ ...current, [txn.id]: event.target.value }))}
                        placeholder="HTTPS evidence URL"
                        className="fixoo-input py-1.5 text-xs mb-2"
                      />
                      <div className="flex gap-2 flex-wrap">
                        {txn.status === "PENDING_PAYMENT" && (
                          <button
                            onClick={() => paymentMutation.mutate({ transactionId: txn.id, action: "confirm_cash" })}
                            className="px-2.5 py-1.5 rounded-lg bg-[#22C55E]/20 text-[#22C55E] text-xs"
                          >
                            Confirm cash
                          </button>
                        )}
                        {txn.status === "PAYMENT_CONFIRMED" && (
                          <button
                            onClick={() => paymentMutation.mutate({ transactionId: txn.id, action: "refund" })}
                            className="px-2.5 py-1.5 rounded-lg bg-[#EF4444]/20 text-[#EF4444] text-xs"
                          >
                            Mark refunded
                          </button>
                        )}
                        <button
                          onClick={() => paymentMutation.mutate({ transactionId: txn.id, action: "save_note" })}
                          className="px-2.5 py-1.5 rounded-lg bg-white/10 text-white text-xs"
                        >
                          Save note
                        </button>
                        {txn.paymentEvidenceUrl && (
                          <a
                            href={txn.paymentEvidenceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1.5 text-[#A1A1AA] text-xs"
                          >
                            View evidence
                          </a>
                        )}
                      </div>
                      <p className="text-[#52525B] text-xs mt-2">
                        {txn.refundedAt
                          ? `Refunded ${format(new Date(txn.refundedAt), "MMM d, h:mm a")}`
                          : txn.paidAt
                            ? `Paid ${format(new Date(txn.paidAt), "MMM d, h:mm a")}`
                            : "Awaiting payment confirmation"}
                      </p>
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

"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Zap, Edit2, Check, X } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { toast } from "@/components/shared/Toaster";

interface PricingItem {
  id: string;
  serviceFee: number;
  platformFee: number;
  nightSurcharge: number;
  etaMin: number;
  etaMax: number;
  isActive: boolean;
  service: { displayName: string; icon?: string | null };
  vehicleType: { displayName: string; icon?: string | null };
}

function EditableRow({ pricing }: { pricing: PricingItem }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({
    serviceFee: pricing.serviceFee,
    platformFee: pricing.platformFee,
    nightSurcharge: pricing.nightSurcharge,
    etaMin: pricing.etaMin,
    etaMax: pricing.etaMax,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await axios.patch("/api/admin/pricing", { id: pricing.id, ...values });
      return res.data;
    },
    onSuccess: () => {
      toast("Pricing updated", "success");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["admin-pricing"] });
    },
    onError: () => toast("Failed to update", "error"),
  });

  return (
    <tr className="border-b border-[#2A2A2A]/50">
      <td className="py-4 pr-4">
        <div className="flex items-center gap-2">
          <span>{pricing.service.icon}</span>
          <span className="text-white text-sm">{pricing.service.displayName}</span>
        </div>
      </td>
      <td className="py-4 pr-4">
        <div className="flex items-center gap-2">
          <span>{pricing.vehicleType.icon}</span>
          <span className="text-white text-sm">{pricing.vehicleType.displayName}</span>
        </div>
      </td>
      {editing ? (
        <>
          {[
            { key: "serviceFee", prefix: "₹" },
            { key: "platformFee", prefix: "₹" },
            { key: "nightSurcharge", prefix: "₹" },
          ].map(({ key, prefix }) => (
            <td key={key} className="py-4 pr-4">
              <div className="flex items-center gap-1">
                <span className="text-[#A1A1AA] text-sm">{prefix}</span>
                <input
                  type="number"
                  value={values[key as keyof typeof values]}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: Number(e.target.value) }))}
                  className="w-20 bg-[#111111] border border-[#2A2A2A] rounded-lg px-2 py-1 text-white text-sm focus:border-white outline-none"
                />
              </div>
            </td>
          ))}
          <td className="py-4 pr-4">
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={values.etaMin}
                onChange={(e) => setValues((v) => ({ ...v, etaMin: Number(e.target.value) }))}
                className="w-12 bg-[#111111] border border-[#2A2A2A] rounded-lg px-2 py-1 text-white text-sm focus:border-white outline-none"
              />
              <span className="text-[#A1A1AA]">–</span>
              <input
                type="number"
                value={values.etaMax}
                onChange={(e) => setValues((v) => ({ ...v, etaMax: Number(e.target.value) }))}
                className="w-12 bg-[#111111] border border-[#2A2A2A] rounded-lg px-2 py-1 text-white text-sm focus:border-white outline-none"
              />
              <span className="text-[#A1A1AA] text-xs">min</span>
            </div>
          </td>
          <td className="py-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="w-7 h-7 rounded-lg bg-[#22C55E]/20 text-[#22C55E] flex items-center justify-center hover:bg-[#22C55E]/30"
              >
                {mutation.isPending ? <LoadingSpinner size="sm" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => { setEditing(false); setValues({ serviceFee: pricing.serviceFee, platformFee: pricing.platformFee, nightSurcharge: pricing.nightSurcharge, etaMin: pricing.etaMin, etaMax: pricing.etaMax }); }}
                className="w-7 h-7 rounded-lg bg-[#EF4444]/20 text-[#EF4444] flex items-center justify-center hover:bg-[#EF4444]/30"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </td>
        </>
      ) : (
        <>
          <td className="py-4 pr-4 text-white text-sm">₹{pricing.serviceFee}</td>
          <td className="py-4 pr-4 text-white text-sm">₹{pricing.platformFee}</td>
          <td className="py-4 pr-4 text-white text-sm">₹{pricing.nightSurcharge}</td>
          <td className="py-4 pr-4 text-[#A1A1AA] text-sm">{pricing.etaMin}–{pricing.etaMax} min</td>
          <td className="py-4">
            <button
              onClick={() => setEditing(true)}
              className="w-7 h-7 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-[#A1A1AA] flex items-center justify-center hover:text-white hover:border-[#3A3A3A] transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          </td>
        </>
      )}
    </tr>
  );
}

export default function AdminPricingPage() {
  const { data: pricing, isLoading } = useQuery({
    queryKey: ["admin-pricing"],
    queryFn: async () => {
      const res = await axios.get("/api/admin/pricing");
      return res.data.data as PricingItem[];
    },
  });

  return (
    <div className="min-h-screen bg-black">
      <div className="border-b border-[#2A2A2A] px-6 py-4 flex items-center gap-3">
        <a href="/admin/dashboard" className="text-[#A1A1AA] hover:text-white">
          <Zap className="w-5 h-5" />
        </a>
        <span className="text-[#2A2A2A]">/</span>
        <h1 className="text-white font-semibold">Pricing</h1>
      </div>

      <div className="px-6 py-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">Service Pricing</h2>
          <p className="text-[#A1A1AA] text-sm mt-1">
            Click the edit icon to update fees. Changes take effect immediately.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
        ) : (
          <div className="fixoo-card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2A2A2A]">
                  {["Service", "Vehicle", "Service Fee", "Platform Fee", "Night Surcharge", "ETA", ""].map((h) => (
                    <th key={h} className="text-left text-[#A1A1AA] text-xs font-medium uppercase tracking-wider pb-3 pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pricing?.map((p) => <EditableRow key={p.id} pricing={p} />)}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 fixoo-card border-[#F97316]/30">
          <p className="text-[#F97316] text-sm font-medium">💡 Pricing guide</p>
          <p className="text-[#A1A1AA] text-xs mt-1">
            Service fee goes 100% to the partner. Platform fee is Fixoo&apos;s revenue.
            Night surcharge applies between 10 PM and 6 AM automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

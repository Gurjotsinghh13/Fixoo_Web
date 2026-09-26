"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Edit2, Check, X, Plus } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { toast } from "@/components/shared/Toaster";

interface PricingItem {
  id: string;
  serviceId: string;
  vehicleTypeId: string;
  serviceFee: number;
  platformFee: number;
  nightSurcharge: number;
  etaMin: number;
  etaMax: number;
  isActive: boolean;
  service: { id: string; displayName: string; icon?: string | null };
  vehicleType: { id: string; displayName: string; icon?: string | null };
}

interface ServiceOption {
  id: string;
  displayName: string;
  icon?: string | null;
}

interface VehicleOption {
  id: string;
  displayName: string;
  icon?: string | null;
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
      if (values.etaMin > values.etaMax) {
        throw new Error("Minimum ETA cannot be greater than Maximum ETA");
      }
      const res = await axios.patch("/api/admin/pricing", { id: pricing.id, ...values });
      return res.data;
    },
    onSuccess: () => {
      toast("Pricing updated", "success");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["admin-pricing"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(msg || "Failed to update pricing", "error");
    },
  });

  return (
    <tr className="border-b border-[#2A2A2A]/50 hover:bg-[#111111]/50">
      <td className="py-4 pr-4">
        <div className="flex items-center gap-2">
          <span>{pricing.service.icon || "🔧"}</span>
          <span className="text-white text-sm font-medium">{pricing.service.displayName}</span>
        </div>
      </td>
      <td className="py-4 pr-4">
        <div className="flex items-center gap-2">
          <span>{pricing.vehicleType.icon || "🚗"}</span>
          <span className="text-white text-sm font-medium">{pricing.vehicleType.displayName}</span>
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
                  min="0"
                  value={values[key as keyof typeof values]}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: Math.max(0, Number(e.target.value)) }))}
                  className="w-20 bg-[#111111] border border-[#2A2A2A] rounded-lg px-2 py-1 text-white text-sm focus:border-white outline-none"
                />
              </div>
            </td>
          ))}
          <td className="py-4 pr-4">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                value={values.etaMin}
                onChange={(e) => setValues((v) => ({ ...v, etaMin: Math.max(1, Number(e.target.value)) }))}
                className="w-12 bg-[#111111] border border-[#2A2A2A] rounded-lg px-2 py-1 text-white text-sm focus:border-white outline-none"
              />
              <span className="text-[#A1A1AA]">–</span>
              <input
                type="number"
                min="1"
                value={values.etaMax}
                onChange={(e) => setValues((v) => ({ ...v, etaMax: Math.max(1, Number(e.target.value)) }))}
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
                onClick={() => {
                  setEditing(false);
                  setValues({
                    serviceFee: pricing.serviceFee,
                    platformFee: pricing.platformFee,
                    nightSurcharge: pricing.nightSurcharge,
                    etaMin: pricing.etaMin,
                    etaMax: pricing.etaMax,
                  });
                }}
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
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [addValues, setAddValues] = useState({
    serviceId: "",
    vehicleTypeId: "",
    serviceFee: 100,
    platformFee: 20,
    nightSurcharge: 50,
    etaMin: 10,
    etaMax: 20,
  });

  const { data: pricing, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-pricing"],
    queryFn: async () => {
      const res = await axios.get("/api/admin/pricing");
      return res.data.data as PricingItem[];
    },
  });

  const { data: services } = useQuery({
    queryKey: ["admin-services-list"],
    queryFn: async () => {
      const res = await axios.get("/api/admin/services");
      return res.data.data as ServiceOption[];
    },
  });

  const { data: vehicleTypes } = useQuery({
    queryKey: ["admin-vehicles-list"],
    queryFn: async () => {
      const res = await axios.get("/api/admin/vehicle-types");
      return res.data.data as VehicleOption[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (addValues.etaMin > addValues.etaMax) {
        throw new Error("Minimum ETA cannot be greater than Maximum ETA");
      }
      const res = await axios.post("/api/admin/pricing", addValues);
      return res.data;
    },
    onSuccess: () => {
      toast("Pricing rule added", "success");
      setShowAdd(false);
      queryClient.invalidateQueries({ queryKey: ["admin-pricing"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(msg || "Failed to add pricing", "error");
    },
  });

  return (
    <div className="min-h-screen bg-black text-white">
      <AdminHeader onRefresh={() => refetch()} isRefreshing={isFetching} />

      <div className="px-6 py-6 max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">Service Pricing (Authoritative Source)</h1>
            <p className="text-[#A1A1AA] text-sm mt-1">
              Configure fee structures per service &amp; vehicle type. Changes update the database and take effect immediately for Customer Android.
            </p>
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="fixoo-btn-primary flex items-center gap-2 w-fit px-4 py-2 text-sm"
          >
            <Plus className="w-4 h-4" /> {showAdd ? "Cancel" : "Add Pricing Rule"}
          </button>
        </div>

        {showAdd && (
          <div className="fixoo-card border-[#3B82F6]/30 space-y-4">
            <h2 className="text-lg font-bold text-white">Add / Update Pricing Pair</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Service</label>
                <select
                  value={addValues.serviceId}
                  onChange={(e) => setAddValues((v) => ({ ...v, serviceId: e.target.value }))}
                  className="fixoo-input text-sm"
                >
                  <option value="">Select Service</option>
                  {services?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Vehicle Type</label>
                <select
                  value={addValues.vehicleTypeId}
                  onChange={(e) => setAddValues((v) => ({ ...v, vehicleTypeId: e.target.value }))}
                  className="fixoo-input text-sm"
                >
                  <option value="">Select Vehicle</option>
                  {vehicleTypes?.map((vt) => (
                    <option key={vt.id} value={vt.id}>
                      {vt.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Service Fee (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={addValues.serviceFee}
                  onChange={(e) => setAddValues((v) => ({ ...v, serviceFee: Number(e.target.value) }))}
                  className="fixoo-input text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Platform Fee (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={addValues.platformFee}
                  onChange={(e) => setAddValues((v) => ({ ...v, platformFee: Number(e.target.value) }))}
                  className="fixoo-input text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Night Surcharge (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={addValues.nightSurcharge}
                  onChange={(e) => setAddValues((v) => ({ ...v, nightSurcharge: Number(e.target.value) }))}
                  className="fixoo-input text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">ETA Min (minutes)</label>
                <input
                  type="number"
                  min="1"
                  value={addValues.etaMin}
                  onChange={(e) => setAddValues((v) => ({ ...v, etaMin: Number(e.target.value) }))}
                  className="fixoo-input text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">ETA Max (minutes)</label>
                <input
                  type="number"
                  min="1"
                  value={addValues.etaMax}
                  onChange={(e) => setAddValues((v) => ({ ...v, etaMax: Number(e.target.value) }))}
                  className="fixoo-input text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 rounded-lg bg-[#1A1A1A] text-[#A1A1AA] text-sm hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending || !addValues.serviceId || !addValues.vehicleTypeId}
                className="fixoo-btn-primary px-4 py-2 text-sm w-fit"
              >
                {addMutation.isPending ? <LoadingSpinner size="sm" /> : "Save Pricing Rule"}
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" text="Loading pricing rules..." />
          </div>
        ) : (
          <div className="fixoo-card overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#2A2A2A]">
                  {["Service", "Vehicle", "Service Fee", "Platform Fee", "Night Surcharge", "ETA Bounds", "Actions"].map((h) => (
                    <th key={h} className="text-[#A1A1AA] text-xs font-medium uppercase tracking-wider pb-3 pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pricing?.map((p) => (
                  <EditableRow key={p.id} pricing={p} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="fixoo-card border-[#F97316]/30">
          <p className="text-[#F97316] text-sm font-medium">💡 Authoritative Pricing Pipeline Guide</p>
          <p className="text-[#A1A1AA] text-xs mt-1">
            Service fee goes 100% to the partner. Platform fee is Fixoo&apos;s commission.
            Night surcharge applies between 10 PM and 6 AM automatically. Total fee served to Customer Android is:
            <code className="text-white font-mono bg-[#1A1A1A] px-1.5 py-0.5 rounded mx-1">
              totalAmount = serviceFee + platformFee + (isNight ? nightSurcharge : 0)
            </code>.
          </p>
        </div>
      </div>
    </div>
  );
}

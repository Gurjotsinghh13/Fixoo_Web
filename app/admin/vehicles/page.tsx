"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Plus, Edit2, Check, X, Car, AlertCircle } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { toast } from "@/components/shared/Toaster";

interface VehicleTypeItem {
  id: string;
  name: string;
  displayName: string;
  icon?: string | null;
  sortOrder: number;
  isActive: boolean;
  _count: { pricing: number; requests: number; partnerTypes: number };
}

export default function AdminVehiclesPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ displayName: string; icon: string; sortOrder: number }>({
    displayName: "",
    icon: "",
    sortOrder: 0,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [createValues, setCreateValues] = useState({
    name: "",
    displayName: "",
    icon: "🚗",
    sortOrder: 0,
  });

  const { data: vehicleTypes, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-vehicle-types"],
    queryFn: async () => {
      const res = await axios.get("/api/admin/vehicle-types");
      return res.data.data as VehicleTypeItem[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; displayName?: string; icon?: string; sortOrder?: number; isActive?: boolean }) => {
      const res = await axios.patch("/api/admin/vehicle-types", { id, ...payload });
      return res.data;
    },
    onSuccess: () => {
      toast("Vehicle type updated", "success");
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-vehicle-types"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pricing"] });
    },
    onError: (err) => {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : "Failed to update vehicle type";
      toast(msg || "Failed to update vehicle type", "error");
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await axios.post("/api/admin/vehicle-types", createValues);
      return res.data;
    },
    onSuccess: () => {
      toast("Vehicle type created", "success");
      setShowCreate(false);
      setCreateValues({ name: "", displayName: "", icon: "🚗", sortOrder: 0 });
      queryClient.invalidateQueries({ queryKey: ["admin-vehicle-types"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pricing"] });
    },
    onError: (err) => {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : "Failed to create vehicle type";
      toast(msg || "Failed to create vehicle type", "error");
    },
  });

  const handleStartEdit = (vt: VehicleTypeItem) => {
    setEditingId(vt.id);
    setEditValues({
      displayName: vt.displayName,
      icon: vt.icon || "🚗",
      sortOrder: vt.sortOrder,
    });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <AdminHeader onRefresh={() => refetch()} isRefreshing={isFetching} />

      <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">Vehicle Types Management</h1>
            <p className="text-[#A1A1AA] text-sm mt-1">
              Configure vehicle classifications (Bike, Car, Scooter, etc.) and sort order. Disabling a vehicle type immediately hides it from Customer Android quote calculation.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="fixoo-btn-primary flex items-center gap-2 w-fit px-4 py-2 text-sm"
          >
            <Plus className="w-4 h-4" /> {showCreate ? "Cancel" : "Add Vehicle Type"}
          </button>
        </div>

        {showCreate && (
          <div className="fixoo-card border-[#3B82F6]/30 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Car className="w-5 h-5 text-[#3B82F6]" /> Create New Vehicle Type
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Key Name (e.g. SCOOTER)</label>
                <input
                  type="text"
                  value={createValues.name}
                  onChange={(e) => setCreateValues((v) => ({ ...v, name: e.target.value }))}
                  placeholder="SCOOTER"
                  className="fixoo-input text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Display Name</label>
                <input
                  type="text"
                  value={createValues.displayName}
                  onChange={(e) => setCreateValues((v) => ({ ...v, displayName: e.target.value }))}
                  placeholder="Scooter"
                  className="fixoo-input text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Icon Emoji</label>
                <input
                  type="text"
                  value={createValues.icon}
                  onChange={(e) => setCreateValues((v) => ({ ...v, icon: e.target.value }))}
                  placeholder="🛵"
                  className="fixoo-input text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Sort Order</label>
                <input
                  type="number"
                  value={createValues.sortOrder}
                  onChange={(e) => setCreateValues((v) => ({ ...v, sortOrder: Number(e.target.value) }))}
                  placeholder="1"
                  className="fixoo-input text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg bg-[#1A1A1A] text-[#A1A1AA] text-sm hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !createValues.name || !createValues.displayName}
                className="fixoo-btn-primary px-4 py-2 text-sm w-fit"
              >
                {createMutation.isPending ? <LoadingSpinner size="sm" /> : "Save Vehicle Type"}
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" text="Loading vehicle types..." />
          </div>
        ) : !vehicleTypes?.length ? (
          <div className="fixoo-card text-center py-12 text-[#A1A1AA]">No vehicle types configured</div>
        ) : (
          <div className="fixoo-card overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#2A2A2A]">
                  {["Icon", "Key", "Display Name", "Sort Order", "Pricing Pairs", "Partners", "Requests", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-[#A1A1AA] text-xs font-medium uppercase tracking-wider pb-3 pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vehicleTypes.map((vt) => {
                  const isEditing = editingId === vt.id;
                  return (
                    <tr key={vt.id} className="border-b border-[#2A2A2A]/50 hover:bg-[#111111]/50">
                      <td className="py-3 pr-4 text-xl">{vt.icon || "🚗"}</td>
                      <td className="py-3 pr-4 text-xs font-mono text-[#A1A1AA]">{vt.name}</td>
                      <td className="py-3 pr-4 text-sm font-semibold text-white">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValues.displayName}
                            onChange={(e) => setEditValues((v) => ({ ...v, displayName: e.target.value }))}
                            className="fixoo-input text-xs py-1 px-2"
                          />
                        ) : (
                          vt.displayName
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-[#A1A1AA]">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editValues.sortOrder}
                            onChange={(e) => setEditValues((v) => ({ ...v, sortOrder: Number(e.target.value) }))}
                            className="fixoo-input text-xs py-1 px-2 w-16"
                          />
                        ) : (
                          vt.sortOrder
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-[#A1A1AA]">{vt._count.pricing} pricing rules</td>
                      <td className="py-3 pr-4 text-xs text-[#A1A1AA]">{vt._count.partnerTypes} partners</td>
                      <td className="py-3 pr-4 text-xs text-[#A1A1AA]">{vt._count.requests} requests</td>
                      <td className="py-3 pr-4">
                        <button
                          onClick={() => updateMutation.mutate({ id: vt.id, isActive: !vt.isActive })}
                          disabled={updateMutation.isPending}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            vt.isActive
                              ? "bg-[#22C55E]/20 text-[#22C55E] hover:bg-[#22C55E]/30"
                              : "bg-[#EF4444]/20 text-[#EF4444] hover:bg-[#EF4444]/30"
                          }`}
                        >
                          {vt.isActive ? "Active" : "Disabled"}
                        </button>
                      </td>
                      <td className="py-3">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updateMutation.mutate({ id: vt.id, ...editValues })}
                              disabled={updateMutation.isPending}
                              className="w-7 h-7 rounded bg-[#22C55E]/20 text-[#22C55E] flex items-center justify-center hover:bg-[#22C55E]/30"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="w-7 h-7 rounded bg-[#EF4444]/20 text-[#EF4444] flex items-center justify-center hover:bg-[#EF4444]/30"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleStartEdit(vt)}
                            className="w-7 h-7 rounded bg-[#1A1A1A] border border-[#2A2A2A] text-[#A1A1AA] flex items-center justify-center hover:text-white"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="fixoo-card border-[#3B82F6]/30 text-xs text-[#A1A1AA] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-[#3B82F6] flex-shrink-0 mt-0.5" />
          <p>
            <strong className="text-white">Authoritative Pricing Integrity:</strong> Vehicle types interact independently with pricing rules. Disabling Bike does not alter Car or Scooter pricing rules.
          </p>
        </div>
      </div>
    </div>
  );
}

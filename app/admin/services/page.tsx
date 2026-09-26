"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Plus, Edit2, Check, X, Wrench, AlertCircle } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { toast } from "@/components/shared/Toaster";

interface ServiceItem {
  id: string;
  name: string;
  displayName: string;
  description?: string | null;
  icon?: string | null;
  category: string;
  isActive: boolean;
  _count: { pricing: number; requests: number };
}

export default function AdminServicesPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ displayName: string; description: string; icon: string; category: string }>({
    displayName: "",
    description: "",
    icon: "",
    category: "",
  });

  const [showCreate, setShowCreate] = useState(false);
  const [createValues, setCreateValues] = useState({
    name: "",
    displayName: "",
    description: "",
    icon: "🔧",
    category: "ROADSIDE",
  });

  const { data: services, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-services"],
    queryFn: async () => {
      const res = await axios.get("/api/admin/services");
      return res.data.data as ServiceItem[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; displayName?: string; description?: string; icon?: string; category?: string; isActive?: boolean }) => {
      const res = await axios.patch("/api/admin/services", { id, ...payload });
      return res.data;
    },
    onSuccess: () => {
      toast("Service updated", "success");
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-services"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pricing"] });
    },
    onError: (err) => {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : "Failed to update service";
      toast(msg || "Failed to update service", "error");
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await axios.post("/api/admin/services", createValues);
      return res.data;
    },
    onSuccess: () => {
      toast("Service created", "success");
      setShowCreate(false);
      setCreateValues({ name: "", displayName: "", description: "", icon: "🔧", category: "ROADSIDE" });
      queryClient.invalidateQueries({ queryKey: ["admin-services"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pricing"] });
    },
    onError: (err) => {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : "Failed to create service";
      toast(msg || "Failed to create service", "error");
    },
  });

  const handleStartEdit = (service: ServiceItem) => {
    setEditingId(service.id);
    setEditValues({
      displayName: service.displayName,
      description: service.description || "",
      icon: service.icon || "🔧",
      category: service.category || "ROADSIDE",
    });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <AdminHeader onRefresh={() => refetch()} isRefreshing={isFetching} />

      <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">Services Management</h1>
            <p className="text-[#A1A1AA] text-sm mt-1">
              Manage platform roadside repair services. Disabling a service immediately blocks new booking quotes for Customer Android.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="fixoo-btn-primary flex items-center gap-2 w-fit px-4 py-2 text-sm"
          >
            <Plus className="w-4 h-4" /> {showCreate ? "Cancel" : "Add Service"}
          </button>
        </div>

        {showCreate && (
          <div className="fixoo-card border-[#3B82F6]/30 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Wrench className="w-5 h-5 text-[#3B82F6]" /> Create New Service
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Key Name (e.g. TOWING)</label>
                <input
                  type="text"
                  value={createValues.name}
                  onChange={(e) => setCreateValues((v) => ({ ...v, name: e.target.value }))}
                  placeholder="TOWING_SERVICE"
                  className="fixoo-input text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Display Name</label>
                <input
                  type="text"
                  value={createValues.displayName}
                  onChange={(e) => setCreateValues((v) => ({ ...v, displayName: e.target.value }))}
                  placeholder="Towing Service"
                  className="fixoo-input text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Icon (Emoji / symbol)</label>
                <input
                  type="text"
                  value={createValues.icon}
                  onChange={(e) => setCreateValues((v) => ({ ...v, icon: e.target.value }))}
                  placeholder="🚜"
                  className="fixoo-input text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Category</label>
                <input
                  type="text"
                  value={createValues.category}
                  onChange={(e) => setCreateValues((v) => ({ ...v, category: e.target.value }))}
                  placeholder="ROADSIDE"
                  className="fixoo-input text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-[#A1A1AA] mb-1">Description</label>
                <input
                  type="text"
                  value={createValues.description}
                  onChange={(e) => setCreateValues((v) => ({ ...v, description: e.target.value }))}
                  placeholder="24/7 towing assistance for disabled vehicles"
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
                {createMutation.isPending ? <LoadingSpinner size="sm" /> : "Save Service"}
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" text="Loading services..." />
          </div>
        ) : !services?.length ? (
          <div className="fixoo-card text-center py-12 text-[#A1A1AA]">No services configured</div>
        ) : (
          <div className="fixoo-card overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#2A2A2A]">
                  {["Icon", "Key", "Display Name", "Category", "Description", "Pricing Pairs", "Requests", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-[#A1A1AA] text-xs font-medium uppercase tracking-wider pb-3 pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {services.map((service) => {
                  const isEditing = editingId === service.id;
                  return (
                    <tr key={service.id} className="border-b border-[#2A2A2A]/50 hover:bg-[#111111]/50">
                      <td className="py-3 pr-4 text-xl">{service.icon || "🔧"}</td>
                      <td className="py-3 pr-4 text-xs font-mono text-[#A1A1AA]">{service.name}</td>
                      <td className="py-3 pr-4 text-sm font-semibold text-white">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValues.displayName}
                            onChange={(e) => setEditValues((v) => ({ ...v, displayName: e.target.value }))}
                            className="fixoo-input text-xs py-1 px-2"
                          />
                        ) : (
                          service.displayName
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-[#A1A1AA]">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValues.category}
                            onChange={(e) => setEditValues((v) => ({ ...v, category: e.target.value }))}
                            className="fixoo-input text-xs py-1 px-2"
                          />
                        ) : (
                          service.category
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-[#A1A1AA] max-w-xs truncate">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValues.description}
                            onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
                            className="fixoo-input text-xs py-1 px-2"
                          />
                        ) : (
                          service.description || "—"
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-[#A1A1AA]">{service._count.pricing} pricing rules</td>
                      <td className="py-3 pr-4 text-xs text-[#A1A1AA]">{service._count.requests} requests</td>
                      <td className="py-3 pr-4">
                        <button
                          onClick={() => updateMutation.mutate({ id: service.id, isActive: !service.isActive })}
                          disabled={updateMutation.isPending}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            service.isActive
                              ? "bg-[#22C55E]/20 text-[#22C55E] hover:bg-[#22C55E]/30"
                              : "bg-[#EF4444]/20 text-[#EF4444] hover:bg-[#EF4444]/30"
                          }`}
                        >
                          {service.isActive ? "Active" : "Disabled"}
                        </button>
                      </td>
                      <td className="py-3">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updateMutation.mutate({ id: service.id, ...editValues })}
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
                            onClick={() => handleStartEdit(service)}
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

        <div className="fixoo-card border-[#22C55E]/30 text-xs text-[#A1A1AA] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-[#22C55E] flex-shrink-0 mt-0.5" />
          <p>
            <strong className="text-white">Authoritative Pricing Rule:</strong> Deactivating a service deactivates all of its associated pricing rules for Customer Android quotes.
          </p>
        </div>
      </div>
    </div>
  );
}

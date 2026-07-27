"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  AlertCircle,
  CheckCircle,
  FileText,
  Search,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { toast } from "@/components/shared/Toaster";

type StatusFilter = "pending" | "approved" | "rejected" | "suspended";

type Application = {
  id: string;
  name: string;
  shopName: string;
  phone: string;
  address?: string | null;
  area?: string | null;
  pincode?: string | null;
  applicationStatus: string;
  applicationNotes?: string | null;
  shopPhotoUrl?: string | null;
  idProofUrl?: string | null;
  addressProofUrl?: string | null;
  createdAt: string;
};

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "suspended", label: "Suspended" },
];

function DocumentLink({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return value ? (
    <a
      href={value}
      target="_blank"
      rel="noreferrer"
      className="text-white text-xs flex items-center gap-1 hover:underline"
    >
      <FileText className="w-3.5 h-3.5" />
      {label}
    </a>
  ) : (
    <span className="text-[#52525B] text-xs">{label} missing</span>
  );
}

export default function PartnerApplicationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["partner-applications", filter, search],
    queryFn: async () => {
      const response = await axios.get(
        `/api/admin/partners?filter=${filter}&search=${encodeURIComponent(search)}`
      );
      return response.data.data as Application[];
    },
    refetchInterval: 30_000,
  });

  const action = useMutation({
    mutationFn: async ({
      partnerId,
      actionName,
    }: {
      partnerId: string;
      actionName: string;
    }) => {
      const note = notes[partnerId]?.trim() || "";
      if (
        ["approve", "reject", "suspend"].includes(actionName) &&
        note.length < 2
      ) {
        throw new Error(
          actionName === "approve"
            ? "Approval note is required"
            : "Reason is required"
        );
      }
      return axios.patch("/api/admin/partners", {
        partnerId,
        action: actionName,
        note,
      });
    },
    onSuccess: () => {
      toast("Application updated", "success");
      queryClient.invalidateQueries({ queryKey: ["partner-applications"] });
      queryClient.invalidateQueries({ queryKey: ["admin-analytics"] });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Application update failed";
      toast(message, "error");
    },
  });

  return (
    <div className="min-h-screen bg-black">
      <header className="border-b border-[#2A2A2A] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-[#A1A1AA] text-xs">Fixoo Operations</p>
            <h1 className="text-white font-semibold">Partner Applications</h1>
          </div>
          <a href="/admin/dashboard" className="text-[#A1A1AA] text-sm">
            Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3.5 w-4 h-4 text-[#A1A1AA]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search applications"
              className="fixoo-input pl-10"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                onClick={() => setFilter(item.key)}
                className={`px-3 py-2 rounded-lg text-sm ${
                  filter === item.key
                    ? "bg-white text-black"
                    : "bg-[#1A1A1A] text-[#A1A1AA]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 flex justify-center">
            <LoadingSpinner size="lg" />
          </div>
        ) : !data?.length ? (
          <div className="fixoo-card text-center py-14 text-[#A1A1AA]">
            No {filter} applications
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((partner) => (
              <article key={partner.id} className="fixoo-card">
                <div className="grid lg:grid-cols-[1fr_220px] gap-5">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-white font-semibold">{partner.name}</h2>
                      <span className="text-xs px-2 py-1 bg-white/10 rounded">
                        {partner.applicationStatus}
                      </span>
                    </div>
                    <p className="text-[#A1A1AA] text-sm">{partner.shopName}</p>
                    <p className="text-[#A1A1AA] text-xs mt-1">
                      +91 {partner.phone}
                    </p>
                    <p className="text-[#A1A1AA] text-xs mt-2">
                      {[partner.address, partner.area, partner.pincode]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    <p className="text-[#52525B] text-xs mt-2">
                      Applied {format(new Date(partner.createdAt), "MMM d, yyyy h:mm a")}
                    </p>

                    <div className="flex gap-4 mt-4 flex-wrap">
                      <DocumentLink label="Shop Photo" value={partner.shopPhotoUrl} />
                      <DocumentLink label="ID Proof" value={partner.idProofUrl} />
                      <DocumentLink label="Address Proof" value={partner.addressProofUrl} />
                    </div>
                    {partner.applicationNotes && (
                      <p className="text-[#A1A1AA] text-sm mt-4 border-l-2 border-[#2A2A2A] pl-3">
                        {partner.applicationNotes}
                      </p>
                    )}
                  </div>

                  <div>
                    <textarea
                      value={notes[partner.id] || ""}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [partner.id]: event.target.value,
                        }))
                      }
                      placeholder={
                        filter === "pending"
                          ? "Approval note or rejection reason"
                          : "Admin note"
                      }
                      className="fixoo-input min-h-24 text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {partner.applicationStatus === "PENDING" && (
                        <>
                          <button
                            onClick={() =>
                              action.mutate({
                                partnerId: partner.id,
                                actionName: "approve",
                              })
                            }
                            className="px-3 py-2 rounded-lg bg-[#22C55E] text-black text-sm font-semibold flex items-center justify-center gap-1"
                          >
                            <CheckCircle className="w-4 h-4" /> Approve
                          </button>
                          <button
                            onClick={() =>
                              action.mutate({
                                partnerId: partner.id,
                                actionName: "reject",
                              })
                            }
                            className="px-3 py-2 rounded-lg bg-[#EF4444]/20 text-[#EF4444] text-sm font-semibold flex items-center justify-center gap-1"
                          >
                            <XCircle className="w-4 h-4" /> Reject
                          </button>
                        </>
                      )}
                      {partner.applicationStatus === "APPROVED" && (
                        <button
                          onClick={() =>
                            action.mutate({
                              partnerId: partner.id,
                              actionName: "suspend",
                            })
                          }
                          className="col-span-2 px-3 py-2 rounded-lg bg-[#F97316]/20 text-[#F97316] text-sm font-semibold flex items-center justify-center gap-1"
                        >
                          <AlertCircle className="w-4 h-4" /> Suspend
                        </button>
                      )}
                      {partner.applicationStatus === "SUSPENDED" && (
                        <button
                          onClick={() =>
                            action.mutate({
                              partnerId: partner.id,
                              actionName: "unsuspend",
                            })
                          }
                          className="col-span-2 px-3 py-2 rounded-lg bg-white text-black text-sm font-semibold"
                        >
                          Unsuspend
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

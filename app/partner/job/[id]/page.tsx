"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Phone, MapPin, Navigation, CheckCircle, ArrowLeft } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { toast } from "@/components/shared/Toaster";
import type { ServiceRequest, RequestStatus } from "@/types";

const STATUS_ACTIONS: { from: RequestStatus; to: RequestStatus; label: string; color: string }[] = [
  { from: "ACCEPTED", to: "ON_THE_WAY", label: "I'm on my way", color: "bg-white text-black" },
  { from: "ON_THE_WAY", to: "ARRIVED", label: "I've arrived", color: "bg-white text-black" },
  { from: "ARRIVED", to: "REPAIR_IN_PROGRESS", label: "Start repair", color: "bg-white text-black" },
  { from: "REPAIR_IN_PROGRESS", to: "COMPLETED", label: "Mark as completed", color: "bg-[#22C55E] text-black" },
];

export default function ActiveJobPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const jobId = params.id as string;
  const [updating, setUpdating] = useState(false);

  const { data: job } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const res = await axios.get(`/api/requests/${jobId}`);
      return res.data.data as ServiceRequest;
    },
    refetchInterval: 5000,
  });

  const handleStatusUpdate = async (newStatus: RequestStatus) => {
    setUpdating(true);
    try {
      const res = await axios.patch("/api/requests/status", {
        requestId: jobId,
        status: newStatus,
      });
      if (res.data.success) {
        queryClient.setQueryData<ServiceRequest>(["job", jobId], (current) =>
          current ? { ...current, status: newStatus } : current
        );
        await queryClient.invalidateQueries({ queryKey: ["job", jobId] });
        await queryClient.invalidateQueries({ queryKey: ["partner-earnings"] });
        toast(
          newStatus === "COMPLETED" ? "Job completed! Great work!" : "Status updated",
          "success"
        );
        if (newStatus === "COMPLETED") {
          setTimeout(() => router.push("/partner/dashboard"), 2000);
        }
      }
    } catch {
      toast("Failed to update status", "error");
    } finally {
      setUpdating(false);
    }
  };

  if (!job) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const currentAction = STATUS_ACTIONS.find((a) => a.from === job.status);
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${job.latitude},${job.longitude}`;

  return (
    <div className="page-container min-h-screen flex flex-col">
      <div className="safe-top px-4 pt-4">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-[#A1A1AA]">
          <ArrowLeft className="w-6 h-6" />
        </button>
      </div>

      <div className="px-4 pt-2 pb-4">
        <p className="text-[#A1A1AA] text-xs uppercase tracking-widest">Active Job</p>
        <h1 className="text-2xl font-bold font-display mt-1">{job.service?.displayName}</h1>
      </div>

      <div className="flex-1 px-4 space-y-4 overflow-y-auto pb-36">
        {/* Customer info */}
        <div className="fixoo-card">
          <p className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-3">Customer</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#2A2A2A] flex items-center justify-center font-bold text-lg">
                {job.user?.name?.[0] || job.user?.phone?.[0] || "C"}
              </div>
              <div>
                <p className="text-white font-semibold">{job.user?.name || "Customer"}</p>
                <p className="text-[#A1A1AA] text-sm">{job.user?.phone}</p>
              </div>
            </div>
            <a
              href={`tel:${job.user?.phone}`}
              className="w-12 h-12 rounded-full bg-[#22C55E] flex items-center justify-center"
            >
              <Phone className="w-5 h-5 text-black" />
            </a>
          </div>
        </div>

        {/* Location */}
        <div className="fixoo-card">
          <p className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-3">Location</p>
          <div className="flex items-start gap-3 mb-3">
            <MapPin className="w-4 h-4 text-[#F97316] mt-0.5 flex-shrink-0" />
            <p className="text-white text-sm">{job.address || job.area || "Customer location"}</p>
          </div>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-[#111111] rounded-xl px-4 py-3 text-white text-sm font-medium hover:bg-[#1A1A1A] transition-colors"
          >
            <Navigation className="w-4 h-4 text-[#22C55E]" />
            Open in Google Maps
          </a>
        </div>

        {/* Job details */}
        <div className="fixoo-card">
          <p className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-3">Job Details</p>
          <div className="space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-[#A1A1AA]">Service</span>
              <span className="text-white">{job.service?.displayName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#A1A1AA]">Vehicle</span>
              <span className="text-white">{job.vehicleType?.displayName}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t border-[#2A2A2A] pt-2.5">
              <span className="text-white">Your Earning</span>
              <span className="text-[#22C55E] text-lg">₹{Number(job.serviceFee)}</span>
            </div>
          </div>
        </div>

        {/* Current status */}
        <div className="fixoo-card bg-[#111111]">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
            <p className="text-white font-medium">
              {job.status === "ACCEPTED" && "Job accepted — head to customer"}
              {job.status === "ON_THE_WAY" && "You're on the way"}
              {job.status === "ARRIVED" && "You've arrived at the location"}
              {job.status === "REPAIR_IN_PROGRESS" && "Repair in progress"}
              {job.status === "COMPLETED" && "Job completed!"}
            </p>
          </div>
        </div>

        {job.status === "COMPLETED" && (
          <div className="fixoo-card border-[#22C55E]/30 text-center">
            <CheckCircle className="w-12 h-12 text-[#22C55E] mx-auto mb-3" />
            <p className="text-white font-bold text-xl">Job Completed!</p>
            <p className="text-[#A1A1AA] text-sm mt-1">
              You earned ₹{Number(job.serviceFee)}. Great work!
            </p>
          </div>
        )}
      </div>

      {/* Action button */}
      {currentAction && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-4 pb-8 pt-4 bg-gradient-to-t from-black to-transparent safe-bottom">
          <button
            onClick={() => handleStatusUpdate(currentAction.to)}
            disabled={updating}
            className={`w-full ${currentAction.color} font-bold rounded-xl py-5 text-lg flex items-center justify-center gap-2 transition-all`}
          >
            {updating ? <LoadingSpinner size="sm" /> : currentAction.label}
          </button>
        </div>
      )}
    </div>
  );
}

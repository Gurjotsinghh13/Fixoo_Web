"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Zap, TrendingUp, CheckCircle } from "lucide-react";
import { RequestCard } from "@/components/partner/RequestCard";
import { BottomNav } from "@/components/shared/BottomNav";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { usePartnerStore } from "@/store/usePartnerStore";
import { useAuthStore } from "@/store/useAuthStore";
import { toast } from "@/components/shared/Toaster";
import { getSocket } from "@/lib/socket";
import type { BroadcastPayload } from "@/types";
import type { PartnerApplicationStatus } from "@/lib/partner-approval";

const DEFAULT_PARTNER_LOCATION = {
  latitude: 25.2138,
  longitude: 75.8648,
};

export default function PartnerDashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { isOnline, incomingRequest, setOnline, setIncomingRequest, setActiveJobId } = usePartnerStore();
  const [toggling, setToggling] = useState(false);
  const [acceptingRequestId, setAcceptingRequestId] = useState<string | null>(null);
  const [applicationStatus, setApplicationStatus] =
    useState<PartnerApplicationStatus | null>(null);
  const [marketplaceAllowed, setMarketplaceAllowed] = useState(false);
  const loadedDashboardRef = useRef(false);

  const marketplaceEnabled =
    marketplaceAllowed && applicationStatus === "APPROVED";

  const { data: earningsData } = useQuery({
    queryKey: ["partner-earnings"],
    queryFn: async () => {
      const res = await axios.get("/api/partner/earnings");
      return res.data.data as {
        earnings: { today: number };
        stats: { jobsToday: number };
      };
    },
    refetchInterval: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    enabled: marketplaceEnabled,
  });

  const todayEarnings = earningsData?.earnings.today || 0;
  const todayJobs = earningsData?.stats.jobsToday || 0;

  // Load partner state on mount
  useEffect(() => {
    if (loadedDashboardRef.current) return;
    loadedDashboardRef.current = true;

    axios.get("/api/auth/me").then((res) => {
      if (res.data.success && res.data.data.role === "partner") {
        const partnerOnline = Boolean(res.data.data.isOnline);
        const approved =
          res.data.data.applicationStatus === "APPROVED" &&
          res.data.data.isApproved &&
          !res.data.data.isSuspended;
        setApplicationStatus(res.data.data.applicationStatus || "PENDING");
        setMarketplaceAllowed(approved);
        if (!approved) {
          setOnline(false);
          router.replace("/partner/application-status");
          return;
        }
        setOnline(partnerOnline);

        if (partnerOnline && !res.data.data.location) {
          axios.post("/api/partner/online", {
            isOnline: true,
            latitude: DEFAULT_PARTNER_LOCATION.latitude,
            longitude: DEFAULT_PARTNER_LOCATION.longitude,
          }).catch(() => {});
        }
      }
    }).catch(() => {});
  }, [router, setOnline]);

  // Socket connection
  useEffect(() => {
    if (!user || !marketplaceEnabled) return;
    const socket = getSocket("partner", user.id);

    socket.on("request:broadcast", (data: BroadcastPayload) => {
      setIncomingRequest(data);
    });

    socket.on("request:taken", (data) => {
      const current = usePartnerStore.getState().incomingRequest;
      if (current?.requestId === data?.requestId) setIncomingRequest(null);
    });

    socket.on("request:expired", (data) => {
      const current = usePartnerStore.getState().incomingRequest;
      if (current?.requestId === data?.requestId) setIncomingRequest(null);
    });

    socket.on("request:cancelled", (data) => {
      const current = usePartnerStore.getState().incomingRequest;
      if (current?.requestId === data?.requestId) setIncomingRequest(null);
    });

    socket.on("partner:access_revoked", () => {
      setOnline(false);
      setIncomingRequest(null);
      router.replace("/partner/application-status");
    });

    return () => {
      socket.off("request:broadcast");
      socket.off("request:taken");
      socket.off("request:expired");
      socket.off("request:cancelled");
      socket.off("partner:access_revoked");
    };
  }, [marketplaceEnabled, router, setIncomingRequest, setOnline, user]);

  const handleToggleOnline = async () => {
    setToggling(true);
    try {
      let lat: number | undefined;
      let lon: number | undefined;

      if (!isOnline) {
        // Get location when going online
        await new Promise<void>((resolve) => {
          if (!navigator.geolocation) {
            resolve();
            return;
          }

          navigator.geolocation.getCurrentPosition(
            (pos) => { lat = pos.coords.latitude; lon = pos.coords.longitude; resolve(); },
            () => {
              lat = DEFAULT_PARTNER_LOCATION.latitude;
              lon = DEFAULT_PARTNER_LOCATION.longitude;
              resolve();
            },
            { timeout: 5000 }
          );
        });

        if (lat === undefined || lon === undefined) {
          lat = DEFAULT_PARTNER_LOCATION.latitude;
          lon = DEFAULT_PARTNER_LOCATION.longitude;
        }
      }

      const res = await axios.post("/api/partner/online", {
        isOnline: !isOnline,
        latitude: lat,
        longitude: lon,
      });

      if (res.data.success) {
        setOnline(!isOnline);
        toast(
          !isOnline ? "You are now ONLINE — accepting requests" : "You are now OFFLINE",
          !isOnline ? "success" : "info"
        );
      }
    } catch {
      toast("Failed to update status", "error");
    } finally {
      setToggling(false);
    }
  };

  const handleAccept = useCallback(async (requestId: string) => {
    if (acceptingRequestId) return;
    setAcceptingRequestId(requestId);
    try {
      const res = await axios.post("/api/requests/accept", { requestId });
      if (res.data.success) {
        await queryClient.invalidateQueries({ queryKey: ["partner-earnings"] });
        setIncomingRequest(null);
        setActiveJobId(requestId);
        toast("Request accepted!", "success");
        router.push(`/partner/job/${requestId}`);
      } else {
        toast("Request already taken", "error");
        setIncomingRequest(null);
      }
    } catch {
      toast("Failed to accept. Request may be taken.", "error");
      setIncomingRequest(null);
    } finally {
      setAcceptingRequestId(null);
    }
  }, [acceptingRequestId, queryClient, router, setActiveJobId, setIncomingRequest]);

  const handleReject = useCallback((requestId: string) => {
    const socket = getSocket("partner", user!.id);
    socket.emit("request:reject", { requestId });
    setIncomingRequest(null);
    toast("Request rejected", "info");
  }, [setIncomingRequest, user]);

  const handleTimeout = useCallback(() => {
    setIncomingRequest(null);
  }, [setIncomingRequest]);

  if (!marketplaceEnabled) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <LoadingSpinner size="lg" text="Checking partner access..." />
      </div>
    );
  }

  return (
    <div className="page-container min-h-screen">
      {/* Incoming request overlay */}
      {incomingRequest && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-end">
          <div className="w-full max-w-md mx-auto px-4 pb-6 slide-up">
            <RequestCard
              request={incomingRequest}
              onAccept={handleAccept}
              onReject={handleReject}
              onTimeout={handleTimeout}
            />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="safe-top px-4 pt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-black fill-black" />
          </div>
          <div>
            <p className="text-xs text-[#A1A1AA]">Partner</p>
            <p className="font-bold text-sm">{user?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-[#22C55E] animate-pulse" : "bg-[#A1A1AA]"}`} />
          <span className={`text-xs font-medium ${isOnline ? "text-[#22C55E]" : "text-[#A1A1AA]"}`}>
            {isOnline ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6 pb-28">
        {/* Big online toggle */}
        <div className="text-center py-8">
          <button
            onClick={handleToggleOnline}
            disabled={toggling}
            className={`w-40 h-40 rounded-full border-4 transition-all duration-300 flex flex-col items-center justify-center gap-2
              ${isOnline
                ? "border-[#22C55E] bg-[#22C55E]/10 shadow-[0_0_40px_rgba(34,197,94,0.3)]"
                : "border-[#2A2A2A] bg-[#111111]"
              }`}
          >
            {toggling ? (
              <LoadingSpinner size="md" />
            ) : (
              <>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                  isOnline ? "bg-[#22C55E]" : "bg-[#2A2A2A]"
                }`}>
                  <Zap className={`w-8 h-8 ${isOnline ? "text-black fill-black" : "text-[#A1A1AA]"}`} />
                </div>
                <span className={`text-sm font-bold ${isOnline ? "text-[#22C55E]" : "text-[#A1A1AA]"}`}>
                  {isOnline ? "ONLINE" : "GO ONLINE"}
                </span>
              </>
            )}
          </button>

          <p className="text-[#A1A1AA] text-sm mt-6">
            {isOnline
              ? "You're receiving requests. Stay ready!"
              : "Go online to start receiving requests"}
          </p>
        </div>

        {/* Today's stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="fixoo-card text-center">
            <TrendingUp className="w-5 h-5 text-[#22C55E] mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">₹{todayEarnings}</p>
            <p className="text-[#A1A1AA] text-xs mt-1">Today&apos;s earnings</p>
          </div>
          <div className="fixoo-card text-center">
            <CheckCircle className="w-5 h-5 text-[#22C55E] mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{todayJobs}</p>
            <p className="text-[#A1A1AA] text-xs mt-1">Jobs today</p>
          </div>
        </div>

        {/* Status hint */}
        {isOnline && (
          <div className="fixoo-card border-[#22C55E]/20 fade-in">
            <div className="flex items-center gap-3">
              <div className="online-dot" />
              <div>
                <p className="text-white text-sm font-medium">Waiting for requests...</p>
                <p className="text-[#A1A1AA] text-xs">
                  You&apos;ll receive a notification when someone needs help nearby
                </p>
              </div>
            </div>
          </div>
        )}

        {!user?.isApproved && (
          <div className="fixoo-card border-[#F97316]/30">
            <p className="text-[#F97316] font-medium text-sm">⏳ Account pending approval</p>
            <p className="text-[#A1A1AA] text-xs mt-1">
              Our team will review and approve your account within 24 hours.
            </p>
          </div>
        )}
      </div>

      <BottomNav role="partner" />
    </div>
  );
}

"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { MessageCircle, Phone, X, Star, Zap } from "lucide-react";
import { SearchingScreen } from "@/components/customer/SearchingScreen";
import { StatusTimeline } from "@/components/customer/StatusTimeline";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useRequestStore } from "@/store/useRequestStore";
import { useAuthStore } from "@/store/useAuthStore";
import { toast } from "@/components/shared/Toaster";
import { getSocket } from "@/lib/socket";
import type { RequestStatus, ServiceRequest } from "@/types";

export default function TrackingPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const requestId = params.id as string;
  const { user } = useAuthStore();
  const { activeRequest, updateRequestStatus, updateRequestPartner, clearRequest } = useRequestStore();
  const [cancelling, setCancelling] = useState(false);
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RequestStatus | null>(null);
  const activeRequestForPage = activeRequest?.id === requestId ? activeRequest : null;

  const { data: requestData, refetch } = useQuery({
    queryKey: ["request", requestId],
    queryFn: async () => {
      const res = await axios.get(`/api/requests/${requestId}`);
      return res.data.data as ServiceRequest;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === "COMPLETED" || status === "CANCELLED" || status === "EXPIRED") return false;
      return 10000;
    },
  });

  const { data: support } = useQuery({
    queryKey: ["support-contact"],
    queryFn: async () => {
      const res = await axios.get("/api/support");
      return res.data.data as { phone: string; whatsapp: string };
    },
  });

  const currentStatus: RequestStatus = (
    realtimeStatus ||
    requestData?.status ||
    activeRequestForPage?.status ||
    "REQUESTED"
  ) as RequestStatus;
  const partner = requestData?.partner || activeRequestForPage?.partner;

  const applyRealtimeStatus = useCallback((status: RequestStatus, event: string) => {
    if (process.env.NODE_ENV === "development") {
      console.log("[Fixoo tracking] socket status update", {
        event,
        requestId,
        status,
      });
    }

    setRealtimeStatus(status);
    updateRequestStatus(status);
    queryClient.setQueryData<ServiceRequest>(["request", requestId], (current) =>
      current ? { ...current, status } : current
    );
  }, [queryClient, requestId, updateRequestStatus]);

  useEffect(() => {
    if (!requestData?.status) return;
    setRealtimeStatus(requestData.status);
  }, [requestData?.status]);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("[Fixoo tracking] current request status", currentStatus);
    }
  }, [currentStatus]);

  // Socket connection for real-time updates
  useEffect(() => {
    if (!user) return;
    const socket = getSocket("customer", user.id);

    socket.on("request:accepted", (data) => {
      if (data.requestId !== requestId) return;
      applyRealtimeStatus("ACCEPTED", "request:accepted");
      updateRequestPartner({
        name: data.partnerName,
        shopName: data.shopName,
        phone: data.partnerPhone,
        rating: data.rating,
      });
      toast("Partner accepted your request!", "success");
      refetch();
    });

    const handleStatusUpdate = (
      event: string,
      fallbackStatus?: RequestStatus
    ) => (data: { requestId?: string; status?: RequestStatus }) => {
      if (data.requestId !== requestId) return;
      const status = data.status || fallbackStatus;
      if (!status) return;
      applyRealtimeStatus(status, event);
      if (status === "COMPLETED") {
        toast("Repair completed! Thank you for using Fixoo.", "success");
      }
    };

    const statusHandlers = {
      "request:status": handleStatusUpdate("request:status"),
      "request:on_the_way": handleStatusUpdate("request:on_the_way", "ON_THE_WAY"),
      "request:arrived": handleStatusUpdate("request:arrived", "ARRIVED"),
      "request:repair_in_progress": handleStatusUpdate(
        "request:repair_in_progress",
        "REPAIR_IN_PROGRESS"
      ),
      "request:completed": handleStatusUpdate("request:completed", "COMPLETED"),
    };

    Object.entries(statusHandlers).forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    socket.on("request:expanding", (data) => {
      if (data.requestId !== requestId) return;
      toast(`Expanding search to ${data.newRadius}km...`, "info");
    });

    socket.on("request:no_partners", (data) => {
      if (data.requestId !== requestId) return;
      applyRealtimeStatus("EXPIRED", "request:no_partners");
      toast("No partners available. Please try again.", "error");
    });

    socket.on("request:cancelled", (data) => {
      if (data.requestId !== requestId) return;
      applyRealtimeStatus("CANCELLED", "request:cancelled");
    });

    return () => {
      socket.off("request:accepted");
      Object.entries(statusHandlers).forEach(([event, handler]) => {
        socket.off(event, handler);
      });
      socket.off("request:expanding");
      socket.off("request:no_partners");
      socket.off("request:cancelled");
    };
  }, [applyRealtimeStatus, refetch, requestId, updateRequestPartner, user]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await axios.post("/api/requests/cancel", { requestId, reason: "Cancelled by customer" });
      updateRequestStatus("CANCELLED");
      toast("Request cancelled", "info");
    } catch {
      toast("Failed to cancel", "error");
    } finally {
      setCancelling(false);
    }
  };

  const handleDone = () => {
    clearRequest();
    router.push("/home");
  };

  const handleFeedbackSubmit = async () => {
    setSubmittingFeedback(true);
    try {
      await axios.post("/api/requests/feedback", { requestId, rating, comment: feedback });
      toast("Thanks for your feedback", "success");
      refetch();
    } catch (error) {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : "Failed to submit feedback";
      toast(message || "Failed to submit feedback", "error");
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (!requestData && !activeRequestForPage) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <LoadingSpinner size="lg" text="Loading request..." />
      </div>
    );
  }

  const request = requestData || activeRequestForPage;

  return (
    <div className="page-container min-h-screen flex flex-col">
      {/* Header */}
      <div className="safe-top px-4 pt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-black fill-black" />
          </div>
          <span className="font-bold">Fixoo</span>
        </div>
        {(currentStatus === "COMPLETED" || currentStatus === "CANCELLED" || currentStatus === "EXPIRED") && (
          <button onClick={handleDone} className="text-[#A1A1AA] text-sm">
            Done
          </button>
        )}
      </div>

      <div className="flex-1 px-4 py-4 overflow-y-auto pb-32 space-y-4">
        {/* Searching state */}
        {currentStatus === "REQUESTED" && request && (
          <SearchingScreen
            serviceName={(request as ServiceRequest).service?.displayName || "Puncture Repair"}
            vehicleName={(request as ServiceRequest).vehicleType?.displayName || "Bike"}
            totalAmount={Number((request as ServiceRequest).totalAmount || activeRequestForPage?.totalAmount)}
            etaMin={activeRequestForPage?.etaMin || 10}
            etaMax={activeRequestForPage?.etaMax || 20}
            searchRadius={(request as ServiceRequest).searchRadius}
          />
        )}

        {/* Partner card - shown after acceptance */}
        {partner && currentStatus !== "REQUESTED" && currentStatus !== "EXPIRED" && (
          <div className="fixoo-card slide-up">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#2A2A2A] flex items-center justify-center text-xl font-bold">
                  {partner.name?.[0] || "R"}
                </div>
                <div>
                  <p className="text-white font-semibold">{partner.name}</p>
                  <p className="text-[#A1A1AA] text-sm">{partner.shopName}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                    <span className="text-xs text-[#A1A1AA]">{partner.rating?.toFixed(1)}</span>
                  </div>
                </div>
              </div>
              <a
                href={`tel:${partner.phone}`}
                className="w-12 h-12 rounded-full bg-[#22C55E] flex items-center justify-center hover:bg-[#16a34a] transition-colors"
              >
                <Phone className="w-5 h-5 text-black" />
              </a>
            </div>

            <div className="bg-[#111111] rounded-xl p-3 text-center">
              <p className="text-[#A1A1AA] text-xs">Status</p>
              <p className="text-white font-semibold mt-1">
                {currentStatus === "ACCEPTED" && "Partner is coming to you"}
                {currentStatus === "ON_THE_WAY" && "Partner is on the way 🛵"}
                {currentStatus === "ARRIVED" && "Partner has arrived!"}
                {currentStatus === "REPAIR_IN_PROGRESS" && "Repair in progress 🔧"}
                {currentStatus === "COMPLETED" && "Repair completed ✅"}
              </p>
            </div>
          </div>
        )}

        {/* Status timeline */}
        {currentStatus !== "REQUESTED" && (
          <StatusTimeline currentStatus={currentStatus} />
        )}

        {/* Completed state */}
        {currentStatus === "COMPLETED" && (
          <div className="fixoo-card border-[#22C55E]/30 text-center slide-up">
            <div className="text-4xl mb-3">🎉</div>
            <p className="text-white font-bold text-xl mb-1">All done!</p>
            <p className="text-[#A1A1AA] text-sm mb-4">
              Your repair is complete. Total paid: ₹{Number((request as ServiceRequest)?.totalAmount || activeRequestForPage?.totalAmount)}
            </p>
            <button onClick={handleDone} className="fixoo-btn-primary">
              Back to Home
            </button>
          </div>
        )}

        {currentStatus === "COMPLETED" && requestData?.feedback && (
          <div className="fixoo-card slide-up">
            <p className="text-white font-semibold mb-2">Feedback submitted</p>
            <p className="text-yellow-400 text-lg">
              {"★".repeat(requestData.feedback.rating)}{"☆".repeat(5 - requestData.feedback.rating)}
            </p>
            {requestData.feedback.comment && (
              <p className="text-[#A1A1AA] text-sm mt-2">{requestData.feedback.comment}</p>
            )}
          </div>
        )}

        {currentStatus === "COMPLETED" && !requestData?.feedback && (
          <div className="fixoo-card slide-up">
            <p className="text-white font-semibold mb-3">Rate your repair</p>
            <div className="flex gap-2 mb-3">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  onClick={() => setRating(value)}
                  className="w-10 h-10 rounded-lg bg-[#111111] border border-[#2A2A2A] flex items-center justify-center"
                  aria-label={`${value} star rating`}
                >
                  <Star className={`w-5 h-5 ${value <= rating ? "text-yellow-400 fill-yellow-400" : "text-[#52525B]"}`} />
                </button>
              ))}
            </div>
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Tell us what went well or what needs improvement"
              className="fixoo-input min-h-24 text-sm mb-3"
            />
            <button onClick={handleFeedbackSubmit} disabled={submittingFeedback} className="fixoo-btn-primary">
              {submittingFeedback ? "Submitting..." : "Submit feedback"}
            </button>
          </div>
        )}

        <div className="fixoo-card">
          <p className="text-white font-semibold mb-2">Need support?</p>
          <p className="text-[#A1A1AA] text-sm mb-3">
            Call or WhatsApp Fixoo support for payment, partner, or request issues.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <a href={`tel:${support?.phone || ""}`} className="fixoo-btn-secondary flex items-center justify-center gap-2">
              <Phone className="w-4 h-4" /> Call
            </a>
            <a
              href={`https://wa.me/91${support?.whatsapp || ""}`}
              target="_blank"
              rel="noreferrer"
              className="fixoo-btn-secondary flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </a>
          </div>
          <a
            href={`https://wa.me/91${support?.whatsapp || ""}?text=Issue%20with%20Fixoo%20request%20${requestId}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[#EF4444]/30 text-[#EF4444] text-sm font-medium hover:bg-[#EF4444]/10 transition-colors"
          >
            Report Issue
          </a>
        </div>
      </div>

      {/* Cancel button - only for cancellable statuses */}
      {["REQUESTED", "ACCEPTED", "ON_THE_WAY"].includes(currentStatus) && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-4 pb-8 pt-4 bg-gradient-to-t from-black to-transparent safe-bottom">
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="w-full flex items-center justify-center gap-2 py-4 text-[#A1A1AA] text-sm hover:text-white transition-colors"
          >
            {cancelling ? <LoadingSpinner size="sm" /> : <><X className="w-4 h-4" /> Cancel request</>}
          </button>
        </div>
      )}
    </div>
  );
}

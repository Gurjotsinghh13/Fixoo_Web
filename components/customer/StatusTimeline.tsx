import { Check, Clock } from "lucide-react";
import type { RequestStatus } from "@/types";

const STATUS_STEPS: { key: RequestStatus; label: string; desc: string }[] = [
  { key: "REQUESTED", label: "Request placed", desc: "Finding nearby partners" },
  { key: "ACCEPTED", label: "Partner assigned", desc: "Partner accepted your request" },
  { key: "ON_THE_WAY", label: "On the way", desc: "Partner is heading to you" },
  { key: "ARRIVED", label: "Partner arrived", desc: "Partner is at your location" },
  { key: "REPAIR_IN_PROGRESS", label: "Repair in progress", desc: "Your repair is underway" },
  { key: "COMPLETED", label: "Completed", desc: "Repair done successfully!" },
];

const STATUS_ORDER = STATUS_STEPS.map((s) => s.key);

export function getTimelineStepIndex(status: RequestStatus) {
  return STATUS_ORDER.indexOf(status);
}

export function isTimelineStepComplete(status: RequestStatus, stepIndex: number) {
  const currentIndex = getTimelineStepIndex(status);
  return currentIndex >= 0 && stepIndex <= currentIndex;
}

interface StatusTimelineProps {
  currentStatus: RequestStatus;
}

export function StatusTimeline({ currentStatus }: StatusTimelineProps) {
  const currentIndex = getTimelineStepIndex(currentStatus);

  if (process.env.NODE_ENV === "development") {
    console.log("[Fixoo tracking] timeline", {
      currentStatus,
      timelineStepIndex: currentIndex,
    });
  }

  if (currentStatus === "CANCELLED" || currentStatus === "EXPIRED") {
    return (
      <div className="fixoo-card border-red-500/30">
        <p className="text-red-400 font-semibold text-center">
          {currentStatus === "CANCELLED" ? "Request Cancelled" : "Request Expired"}
        </p>
        <p className="text-[#A1A1AA] text-sm text-center mt-1">
          {currentStatus === "CANCELLED"
            ? "This request was cancelled."
            : "No partners were available. Please try again."}
        </p>
      </div>
    );
  }

  return (
    <div className="fixoo-card">
      <div className="space-y-0">
        {STATUS_STEPS.map((step, index) => {
          const isDone = isTimelineStepComplete(currentStatus, index);
          const isPending = index > currentIndex;

          return (
            <div key={step.key} className="flex gap-4">
              {/* Line + dot */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                    isDone
                      ? "bg-[#22C55E] border-[#22C55E]"
                      : "bg-transparent border-[#2A2A2A]"
                  }`}
                >
                  {isDone ? (
                    <Check className="w-4 h-4 text-black" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-[#52525B]" />
                  )}
                </div>
                {index < STATUS_STEPS.length - 1 && (
                  <div
                    className={`w-0.5 h-8 mt-1 ${
                      isDone ? "bg-[#22C55E]" : "bg-[#2A2A2A]"
                    }`}
                  />
                )}
              </div>

              {/* Content */}
              <div className="pb-8 flex-1 pt-1">
                <p
                  className={`font-medium text-sm ${
                    isPending ? "text-[#A1A1AA]" : "text-white"
                  }`}
                >
                  {step.label}
                </p>
                {isDone && (
                  <p className="text-[#A1A1AA] text-xs mt-0.5">{step.desc}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

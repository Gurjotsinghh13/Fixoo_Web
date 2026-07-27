"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OTPInput } from "@/components/shared/OTPInput";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useAuthStore } from "@/store/useAuthStore";
import { usePartnerStore } from "@/store/usePartnerStore";
import { useRequestStore } from "@/store/useRequestStore";
import { toast } from "@/components/shared/Toaster";
import { disconnectSocket } from "@/lib/socket";
import { Phone, ArrowLeft, Wrench } from "lucide-react";
import axios from "axios";
import { useQueryClient } from "@tanstack/react-query";

type Step = "phone" | "otp";

export default function PartnerLoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const resetPartner = usePartnerStore((state) => state.reset);
  const resetRequest = useRequestStore((state) => state.reset);
  const queryClient = useQueryClient();
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const handleSendOTP = async () => {
    const currentPhone = (phoneInputRef.current?.value || phone).replace(/\D/g, "");
    setPhone(currentPhone);
    if (!/^[6-9]\d{9}$/.test(currentPhone)) {
      toast("Enter a valid 10-digit mobile number", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post("/api/auth/send-otp", { phone: currentPhone, role: "partner" });
      if (res.data.success) {
        setStep("otp");
        toast("OTP sent", "success");
        startResendTimer();
      }
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.database?.recommendation || err.response?.data?.error
        : "Failed to send OTP";
      toast(msg || "Failed to send OTP", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (otp: string) => {
    setLoading(true);
    try {
      const currentPhone = (phoneInputRef.current?.value || phone).replace(/\D/g, "");
      const res = await axios.post("/api/auth/verify-otp", { phone: currentPhone, code: otp, role: "partner" });
      if (res.data.success) {
        disconnectSocket();
        resetRequest();
        resetPartner();
        queryClient.clear();
        setUser({ ...res.data.data, role: "partner" });
        router.push(
          res.data.data.applicationStatus === "APPROVED" &&
            res.data.data.isApproved &&
            !res.data.data.isSuspended
            ? "/partner/dashboard"
            : "/partner/application-status"
        );
      }
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : "Invalid OTP";
      toast(msg || "Invalid OTP", "error");
    } finally {
      setLoading(false);
    }
  };

  const startResendTimer = () => {
    setResendTimer(30);
    const iv = setInterval(() => {
      setResendTimer((t) => { if (t <= 1) { clearInterval(iv); return 0; } return t - 1; });
    }, 1000);
  };

  return (
    <div className="page-container flex flex-col min-h-screen">
      <div className="safe-top px-6 pt-6">
        {step === "otp" && (
          <button onClick={() => setStep("phone")} className="mb-8 p-2 -ml-2 text-[#A1A1AA]">
            <ArrowLeft className="w-6 h-6" />
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col px-6 pt-8">
        <div className="mb-10">
          <div className="w-12 h-12 bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl flex items-center justify-center mb-4">
            <Wrench className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold font-display mb-1">
            {step === "phone" ? "Partner Login" : "Verify OTP"}
          </h1>
          <p className="text-[#A1A1AA]">
            {step === "phone" ? "Login to your partner account" : `Sent to +91 ${phone}`}
          </p>
        </div>

        {step === "phone" ? (
          <div className="fade-in">
            <div className="relative mb-6">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#A1A1AA]" />
                <span className="text-white font-medium">+91</span>
                <div className="w-px h-5 bg-[#2A2A2A]" />
              </div>
              <input
                ref={phoneInputRef}
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && handleSendOTP()}
                placeholder="Mobile number"
                className="fixoo-input pl-[88px] text-xl tracking-widest"
                autoFocus
              />
            </div>
            <button
              onClick={handleSendOTP}
              disabled={loading}
              className="fixoo-btn-primary flex items-center justify-center gap-2"
            >
              {loading ? <LoadingSpinner size="sm" /> : "Send OTP"}
            </button>
          </div>
        ) : (
          <div className="fade-in">
            <div className="mb-8">
              <OTPInput onComplete={handleVerifyOTP} disabled={loading} />
            </div>
            {loading && <div className="flex justify-center mb-6"><LoadingSpinner text="Verifying..." /></div>}
            <div className="text-center">
              {resendTimer > 0 ? (
                <p className="text-[#A1A1AA] text-sm">Resend in {resendTimer}s</p>
              ) : (
                <button onClick={handleSendOTP} className="text-white text-sm underline underline-offset-4">
                  Resend OTP
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="px-6 pb-8 safe-bottom text-center space-y-3">
        <p className="text-[#A1A1AA] text-sm">
          New partner?{" "}
          <a href="/partner/register" className="text-white underline underline-offset-4">
            Register here
          </a>
        </p>
        <p className="text-[#A1A1AA] text-sm">
          Looking for help?{" "}
          <a href="/login" className="text-white underline underline-offset-4">
            Customer Login
          </a>
        </p>
      </div>
    </div>
  );
}

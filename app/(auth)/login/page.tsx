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
import { Phone, ArrowLeft, Zap } from "lucide-react";
import axios from "axios";
import { useQueryClient } from "@tanstack/react-query";

type Step = "phone" | "otp";

export default function LoginPage() {
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
      const res = await axios.post("/api/auth/send-otp", { phone: currentPhone, role: "customer" });
      if (res.data.success) {
        setStep("otp");
        toast("OTP sent successfully", "success");
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
      const res = await axios.post("/api/auth/verify-otp", { phone: currentPhone, code: otp, role: "customer" });
      if (res.data.success) {
        disconnectSocket();
        resetPartner();
        resetRequest();
        queryClient.clear();
        setUser({ ...res.data.data, role: "customer" });
        toast("Welcome to Fixoo!", "success");
        router.push("/home");
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
      setResendTimer((t) => {
        if (t <= 1) { clearInterval(iv); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  return (
    <div className="page-container flex flex-col min-h-screen">
      {/* Header */}
      <div className="safe-top px-6 pt-6">
        {step === "otp" && (
          <button
            onClick={() => { setStep("phone"); setPhone(""); }}
            className="mb-8 p-2 -ml-2 text-[#A1A1AA] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col px-6 pt-8">
        {/* Logo */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-black fill-black" />
            </div>
            <span className="text-2xl font-bold font-display">Fixoo</span>
          </div>
          <p className="text-[#A1A1AA] text-sm">Emergency repairs in 30 minutes</p>
        </div>

        {step === "phone" ? (
          <div className="fade-in">
            <h1 className="text-3xl font-bold font-display mb-2">Enter your number</h1>
            <p className="text-[#A1A1AA] mb-8">We&apos;ll send a verification code</p>

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

            <p className="text-center text-[#A1A1AA] text-xs mt-6">
              By continuing, you agree to Fixoo&apos;s Terms of Service
            </p>
          </div>
        ) : (
          <div className="fade-in">
            <h1 className="text-3xl font-bold font-display mb-2">Verify OTP</h1>
            <p className="text-[#A1A1AA] mb-8">
              Sent to +91 {phone}
            </p>

            <div className="mb-8">
              <OTPInput onComplete={handleVerifyOTP} disabled={loading} />
            </div>

            {loading && (
              <div className="flex justify-center mb-6">
                <LoadingSpinner text="Verifying..." />
              </div>
            )}

            <div className="text-center">
              {resendTimer > 0 ? (
                <p className="text-[#A1A1AA] text-sm">Resend OTP in {resendTimer}s</p>
              ) : (
                <button
                  onClick={handleSendOTP}
                  className="text-white text-sm underline underline-offset-4"
                >
                  Resend OTP
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Partner link */}
      <div className="px-6 pb-8 safe-bottom text-center">
        <p className="text-[#A1A1AA] text-sm">
          Are you a repair partner?{" "}
          <a href="/partner/login" className="text-white underline underline-offset-4">
            Partner Login
          </a>
        </p>
      </div>
    </div>
  );
}

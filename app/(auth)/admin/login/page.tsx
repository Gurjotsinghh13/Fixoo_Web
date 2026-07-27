"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { OTPInput } from "@/components/shared/OTPInput";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { toast } from "@/components/shared/Toaster";
import { useAuthStore } from "@/store/useAuthStore";
import { usePartnerStore } from "@/store/usePartnerStore";
import { useRequestStore } from "@/store/useRequestStore";
import { disconnectSocket } from "@/lib/socket";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminLoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  const resetPartnerStore = usePartnerStore((state) => state.reset);
  const resetRequestStore = useRequestStore((state) => state.reset);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);

  const currentPhone = () => (phoneInputRef.current?.value || phone).replace(/\D/g, "");

  const handleSendOTP = async () => {
    const normalizedPhone = currentPhone();
    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
      toast("Enter a valid 10-digit phone number", "error");
      return;
    }

    setLoading(true);
    try {
      setPhone(normalizedPhone);
      const res = await axios.post("/api/auth/send-otp", {
        phone: normalizedPhone,
        role: "admin",
      });
      if (res.data.success) {
        setStep("otp");
        toast("OTP sent", "success");
      }
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : "Failed to send OTP";
      toast(msg || "Failed to send OTP", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (otp: string) => {
    setLoading(true);
    try {
      const res = await axios.post("/api/auth/verify-otp", {
        phone: currentPhone(),
        code: otp,
        role: "admin",
      });
      if (res.data.success) {
        disconnectSocket();
        resetPartnerStore();
        resetRequestStore();
        queryClient.clear();
        setUser(res.data.data);
        toast("Welcome back", "success");
        router.push("/admin/dashboard");
      }
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : "Invalid OTP";
      toast(msg || "Invalid OTP", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center px-6">
      <div className="max-w-sm mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display mb-2">
            {step === "phone" ? "Admin Login" : "Verify OTP"}
          </h1>
          <p className="text-[#A1A1AA]">
            {step === "phone" ? "Login to the Fixoo admin dashboard" : `Sent to +91 ${phone}`}
          </p>
        </div>

        {step === "phone" ? (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#A1A1AA] mb-2">
                Phone number
              </label>
              <div className="flex items-center bg-[#111111] border border-[#2A2A2A] rounded-xl px-4 py-4 focus-within:border-white transition-colors">
                <span className="text-[#A1A1AA] mr-2">+91</span>
                <input
                  ref={phoneInputRef}
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  onKeyDown={(e) => e.key === "Enter" && handleSendOTP()}
                  className="flex-1 bg-transparent text-white text-lg outline-none"
                  placeholder="9999999999"
                  autoFocus
                />
              </div>
            </div>

            <button
              onClick={handleSendOTP}
              disabled={loading}
              className="fixoo-btn-primary"
            >
              {loading ? <LoadingSpinner size="sm" /> : "Send OTP"}
            </button>
          </div>
        ) : (
          <div>
            <OTPInput onComplete={handleVerifyOTP} disabled={loading} />
            {loading && <div className="flex justify-center mt-6"><LoadingSpinner text="Verifying..." /></div>}
            <button
              onClick={() => setStep("phone")}
              className="w-full text-[#A1A1AA] text-sm mt-6"
            >
              Change phone number
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { LogOut, User, Phone, ChevronRight, Zap } from "lucide-react";
import { BottomNav } from "@/components/shared/BottomNav";
import { useAuthStore } from "@/store/useAuthStore";
import { usePartnerStore } from "@/store/usePartnerStore";
import { useRequestStore } from "@/store/useRequestStore";
import { toast } from "@/components/shared/Toaster";
import { disconnectSocket } from "@/lib/socket";
import { useQueryClient } from "@tanstack/react-query";

export default function ProfilePage() {
  const router = useRouter();
  const { user, clearUser } = useAuthStore();
  const resetPartner = usePartnerStore((state) => state.reset);
  const resetRequest = useRequestStore((state) => state.reset);
  const queryClient = useQueryClient();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await axios.post("/api/auth/logout");
      disconnectSocket();
      resetRequest();
      resetPartner();
      queryClient.clear();
      clearUser();
      router.push("/login");
    } catch {
      toast("Logout failed", "error");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="page-container min-h-screen">
      <div className="safe-top px-4 pt-4 flex items-center gap-2 mb-2">
        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
          <Zap className="w-5 h-5 text-black fill-black" />
        </div>
        <h1 className="font-bold text-lg">Profile</h1>
      </div>

      <div className="px-4 pb-28 space-y-4 mt-4">
        {/* Avatar */}
        <div className="flex items-center gap-4 fixoo-card">
          <div className="w-16 h-16 rounded-2xl bg-[#2A2A2A] flex items-center justify-center text-2xl font-bold">
            {user?.name?.[0] || user?.phone?.[0] || "U"}
          </div>
          <div>
            <p className="text-white font-bold text-xl">{user?.name || "Fixoo User"}</p>
            <p className="text-[#A1A1AA] text-sm">+91 {user?.phone}</p>
          </div>
        </div>

        {/* Info */}
        <div className="fixoo-card space-y-0">
          {[
            { icon: <User className="w-4 h-4" />, label: "Name", value: user?.name || "Not set" },
            { icon: <Phone className="w-4 h-4" />, label: "Phone", value: `+91 ${user?.phone}` },
          ].map((item, i) => (
            <div key={i} className={`flex items-center justify-between py-3 ${i > 0 ? "border-t border-[#2A2A2A]" : ""}`}>
              <div className="flex items-center gap-3">
                <span className="text-[#A1A1AA]">{item.icon}</span>
                <div>
                  <p className="text-[#A1A1AA] text-xs">{item.label}</p>
                  <p className="text-white text-sm mt-0.5">{item.value}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#A1A1AA]" />
            </div>
          ))}
        </div>

        {/* App info */}
        <div className="fixoo-card">
          <p className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-3">About</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[#A1A1AA]">Version</span>
              <span className="text-white">1.0.0</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#A1A1AA]">City</span>
              <span className="text-white">Kota, Rajasthan</span>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border border-[#EF4444]/30 text-[#EF4444] font-medium hover:bg-[#EF4444]/10 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {loggingOut ? "Logging out..." : "Logout"}
        </button>
      </div>

      <BottomNav role="customer" />
    </div>
  );
}

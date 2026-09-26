"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { LogOut, RefreshCw, Zap } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { usePartnerStore } from "@/store/usePartnerStore";
import { useRequestStore } from "@/store/useRequestStore";
import { disconnectSocket } from "@/lib/socket";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/shared/Toaster";
import { useState } from "react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/admin/dashboard" },
  { label: "Applications", href: "/admin/partner-applications" },
  { label: "Partners", href: "/admin/partners" },
  { label: "Requests", href: "/admin/requests" },
  { label: "Operations", href: "/admin/operations" },
  { label: "Pricing", href: "/admin/pricing" },
  { label: "Services", href: "/admin/services" },
  { label: "Vehicles", href: "/admin/vehicles" },
  { label: "Transactions", href: "/admin/transactions" },
  { label: "Analytics", href: "/admin/analytics" },
];

export function AdminHeader({
  onRefresh,
  isRefreshing,
}: {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const clearUser = useAuthStore((state) => state.clearUser);
  const resetPartnerStore = usePartnerStore((state) => state.reset);
  const resetRequestStore = useRequestStore((state) => state.reset);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await axios.post("/api/auth/logout");
    } catch {
      // Ignore network errors during logout
    } finally {
      disconnectSocket();
      resetPartnerStore();
      resetRequestStore();
      queryClient.clear();
      clearUser();
      toast("Logged out successfully", "info");
      window.location.href = "/admin/login";
    }
  };

  return (
    <header className="border-b border-[#2A2A2A] bg-black sticky top-0 z-40">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4 overflow-x-auto">
        <div className="flex items-center gap-3 flex-shrink-0">
          <Link href="/admin/dashboard" className="flex items-center gap-2 text-white hover:opacity-90 transition-opacity">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-black fill-black" />
            </div>
            <div>
              <p className="font-bold text-sm leading-none text-white">Fixoo Admin</p>
              <p className="text-[#A1A1AA] text-[10px] leading-tight mt-0.5">Control Center</p>
            </div>
          </Link>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/admin/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-white text-black font-semibold"
                    : "text-[#A1A1AA] hover:text-white hover:bg-[#1A1A1A]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 flex-shrink-0">
          {onRefresh && (
            <button
              onClick={onRefresh}
              title="Refresh Data"
              className="w-8 h-8 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-[#A1A1AA] hover:text-white hover:border-[#3A3A3A] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          )}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title="Log Out"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EF4444]/15 border border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/25 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}

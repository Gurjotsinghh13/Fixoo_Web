"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { LogOut, Star, CheckCircle, Zap } from "lucide-react";
import { BottomNav } from "@/components/shared/BottomNav";
import { useAuthStore } from "@/store/useAuthStore";
import { usePartnerStore } from "@/store/usePartnerStore";
import { useRequestStore } from "@/store/useRequestStore";
import { toast } from "@/components/shared/Toaster";
import { disconnectSocket } from "@/lib/socket";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type PartnerProfile = {
  phone: string;
  name: string;
  shopName: string;
  address?: string | null;
  workingHours?: string | null;
  serviceRadius: number;
  emergencyContact?: string | null;
  shopPhotoUrl?: string | null;
  idProofUrl?: string | null;
  addressProofUrl?: string | null;
  isApproved: boolean;
};

export default function PartnerProfilePage() {
  const router = useRouter();
  const { user, clearUser } = useAuthStore();
  const resetPartner = usePartnerStore((state) => state.reset);
  const resetRequest = useRequestStore((state) => state.reset);
  const queryClient = useQueryClient();
  const [loggingOut, setLoggingOut] = useState(false);
  const [profile, setProfile] = useState<PartnerProfile | null>(null);

  const profileQuery = useQuery({
    queryKey: ["partner-profile"],
    queryFn: async () => {
      const res = await axios.get("/api/partner/profile");
      const data = res.data.data as PartnerProfile;
      setProfile(data);
      return data;
    },
  });

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!profile) return;
      await axios.patch("/api/partner/profile", profile);
    },
    onSuccess: () => {
      toast("Profile saved", "success");
      queryClient.invalidateQueries({ queryKey: ["partner-profile"] });
    },
    onError: (error) => {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : "Failed to save profile";
      toast(message || "Failed to save profile", "error");
    },
  });

  const updateProfile = (key: keyof PartnerProfile, value: string | number) => {
    setProfile((current) => current ? { ...current, [key]: value } : current);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await axios.post("/api/auth/logout");
      disconnectSocket();
      resetPartner();
      resetRequest();
      queryClient.clear();
      clearUser();
      router.push("/partner/login");
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
        <h1 className="font-bold text-lg">My Profile</h1>
      </div>

      <div className="px-4 pb-28 space-y-4 mt-4">
        <div className="fixoo-card flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#2A2A2A] flex items-center justify-center text-2xl font-bold">
            {user?.name?.[0] || "P"}
          </div>
          <div>
            <p className="text-white font-bold text-xl">{profile?.name || user?.name}</p>
            <p className="text-[#A1A1AA] text-sm">{profile?.shopName || user?.shopName}</p>
            <p className="text-[#A1A1AA] text-xs font-mono mt-1">+91 {profile?.phone || user?.phone}</p>
          </div>
        </div>

        <div className="fixoo-card space-y-3">
          <div>
            <p className="text-white font-semibold">Shop setup</p>
            <p className="text-[#A1A1AA] text-xs mt-1">Keep this updated before pilot requests start.</p>
          </div>
          <label className="block">
            <span className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-2 block">Shop Name</span>
            <input
              value={profile?.shopName || ""}
              onChange={(event) => updateProfile("shopName", event.target.value)}
              className="fixoo-input"
              placeholder="Fixoo Tyres"
            />
          </label>
          <label className="block">
            <span className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-2 block">Address</span>
            <textarea
              value={profile?.address || ""}
              onChange={(event) => updateProfile("address", event.target.value)}
              className="fixoo-input min-h-20 text-sm"
              placeholder="Shop address"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-2 block">Working Hours</span>
              <input
                value={profile?.workingHours || ""}
                onChange={(event) => updateProfile("workingHours", event.target.value)}
                className="fixoo-input"
                placeholder="9 AM - 9 PM"
              />
            </label>
            <label className="block">
              <span className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-2 block">Radius km</span>
              <input
                type="number"
                min={1}
                max={25}
                value={profile?.serviceRadius || 3}
                onChange={(event) => updateProfile("serviceRadius", Number(event.target.value))}
                className="fixoo-input"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-2 block">Emergency Contact</span>
            <input
              value={profile?.emergencyContact || ""}
              onChange={(event) => updateProfile("emergencyContact", event.target.value)}
              className="fixoo-input"
              placeholder="10-digit mobile number"
            />
          </label>
          <div className="space-y-3">
            <p className="text-white font-semibold text-sm">Documents</p>
            {[
              { key: "shopPhotoUrl", label: "Shop Photo URL" },
              { key: "idProofUrl", label: "ID Proof URL" },
              { key: "addressProofUrl", label: "Address Proof URL" },
            ].map((field) => (
              <label key={field.key} className="block">
                <span className="text-[#A1A1AA] text-xs uppercase tracking-widest mb-2 block">{field.label}</span>
                <input
                  value={(profile?.[field.key as keyof PartnerProfile] as string | null | undefined) || ""}
                  onChange={(event) => updateProfile(field.key as keyof PartnerProfile, event.target.value)}
                  className="fixoo-input"
                  placeholder="Paste document URL"
                />
              </label>
            ))}
          </div>
          <button
            onClick={() => saveProfile.mutate()}
            disabled={saveProfile.isPending || profileQuery.isLoading || !profile}
            className="fixoo-btn-primary"
          >
            {saveProfile.isPending ? "Saving..." : "Save Profile"}
          </button>
        </div>

        <div className="fixoo-card">
          <div className="flex items-center gap-2 mb-2">
            {user?.isApproved ? (
              <>
                <CheckCircle className="w-4 h-4 text-[#22C55E]" />
                <span className="text-[#22C55E] text-sm font-medium">Verified Partner</span>
              </>
            ) : (
              <>
                <Star className="w-4 h-4 text-[#F97316]" />
                <span className="text-[#F97316] text-sm font-medium">Pending Approval</span>
              </>
            )}
          </div>
          <p className="text-[#A1A1AA] text-xs">
            {user?.isApproved
              ? "Your account is verified. You can receive and accept requests."
              : "Your account is under review. You'll be notified once approved."}
          </p>
        </div>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border border-[#EF4444]/30 text-[#EF4444] font-medium hover:bg-[#EF4444]/10 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {loggingOut ? "Logging out..." : "Logout"}
        </button>
      </div>

      <BottomNav role="partner" />
    </div>
  );
}

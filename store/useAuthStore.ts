import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  user: {
    id: string;
    phone: string;
    name?: string | null;
    role: "customer" | "partner" | "admin";
    shopName?: string;
    isApproved?: boolean;
    isSuspended?: boolean;
    applicationStatus?: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
    applicationNotes?: string | null;
    applicationNumber?: string;
  } | null;
  isLoading: boolean;
  setUser: (user: AuthState["user"]) => void;
  clearUser: () => void;
  setLoading: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      setUser: (user) => set({ user }),
      clearUser: () => set({ user: null }),
      setLoading: (isLoading) => set({ isLoading }),
    }),
    { name: "fixoo-auth" }
  )
);

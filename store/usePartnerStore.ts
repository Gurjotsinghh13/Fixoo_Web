import { create } from "zustand";
import type { BroadcastPayload } from "@/types";

interface PartnerStore {
  isOnline: boolean;
  incomingRequest: BroadcastPayload | null;
  activeJobId: string | null;
  setOnline: (v: boolean) => void;
  setIncomingRequest: (req: BroadcastPayload | null) => void;
  setActiveJobId: (id: string | null) => void;
  reset: () => void;
}

export const usePartnerStore = create<PartnerStore>((set) => ({
  isOnline: false,
  incomingRequest: null,
  activeJobId: null,
  setOnline: (isOnline) => set({ isOnline }),
  setIncomingRequest: (incomingRequest) => set({ incomingRequest }),
  setActiveJobId: (activeJobId) => set({ activeJobId }),
  reset: () => set({ isOnline: false, incomingRequest: null, activeJobId: null }),
}));

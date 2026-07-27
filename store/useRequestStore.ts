import { create } from "zustand";
import type { RequestStatus, VehicleType, Service } from "@/types";

interface ActiveRequest {
  id: string;
  status: RequestStatus;
  serviceFee: number;
  platformFee: number;
  nightSurcharge: number;
  totalAmount: number;
  vehicleType: VehicleType;
  service: Service;
  etaMin: number;
  etaMax: number;
  partner?: {
    name: string;
    shopName: string;
    phone: string;
    rating: number;
  } | null;
}

interface RequestStore {
  selectedVehicleTypeId: string | null;
  selectedServiceId: string | null;
  activeRequest: ActiveRequest | null;
  setSelectedVehicle: (id: string) => void;
  setSelectedService: (id: string) => void;
  setActiveRequest: (req: ActiveRequest | null) => void;
  updateRequestStatus: (status: RequestStatus) => void;
  updateRequestPartner: (partner: ActiveRequest["partner"]) => void;
  clearRequest: () => void;
  reset: () => void;
}

export const useRequestStore = create<RequestStore>((set) => ({
  selectedVehicleTypeId: null,
  selectedServiceId: null,
  activeRequest: null,
  setSelectedVehicle: (id) => set({ selectedVehicleTypeId: id }),
  setSelectedService: (id) => set({ selectedServiceId: id }),
  setActiveRequest: (req) => set({ activeRequest: req }),
  updateRequestStatus: (status) =>
    set((state) =>
      state.activeRequest ? { activeRequest: { ...state.activeRequest, status } } : state
    ),
  updateRequestPartner: (partner) =>
    set((state) =>
      state.activeRequest ? { activeRequest: { ...state.activeRequest, partner } } : state
    ),
  clearRequest: () =>
    set({ activeRequest: null, selectedVehicleTypeId: null, selectedServiceId: null }),
  reset: () =>
    set({ activeRequest: null, selectedVehicleTypeId: null, selectedServiceId: null }),
}));

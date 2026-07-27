"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { ArrowLeft, MapPin, Shield } from "lucide-react";
import { PricePreview } from "@/components/customer/PricePreview";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useRequestStore } from "@/store/useRequestStore";
import { toast } from "@/components/shared/Toaster";
import type { ServicePricing, VehicleType, Service } from "@/types";

export default function RequestPage() {
  const router = useRouter();
  const { selectedVehicleTypeId, setActiveRequest } = useRequestStore();
  const [location, setLocation] = useState<{ lat: number; lon: number; address: string; area: string } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Fetch pricing for selected vehicle + puncture service
  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await axios.get("/api/pricing");
      return res.data.data as (ServicePricing & { vehicleType: VehicleType; service: Service })[];
    },
  });

  const selectedPricing = services?.find(
    (p) => p.vehicleTypeId === selectedVehicleTypeId
  );

  // Get detailed pricing
  const { data: pricingDetail } = useQuery({
    queryKey: ["pricing-detail", selectedVehicleTypeId],
    enabled: !!selectedVehicleTypeId && !!selectedPricing,
    queryFn: async () => {
      const res = await axios.get(
        `/api/pricing?vehicleTypeId=${selectedVehicleTypeId}&serviceId=${selectedPricing?.serviceId}`
      );
      return res.data.data as ServicePricing & { vehicleType: VehicleType; service: Service; isNight: boolean };
    },
  });

  useEffect(() => {
    if (!selectedVehicleTypeId) {
      router.replace("/home");
      return;
    }
    navigator.geolocation?.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let address = "Kota, Rajasthan";
        let area = "Kota";
        try {
          const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
          if (key) {
            const res = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${key}`
            );
            const data = await res.json();
            address = data.results?.[0]?.formatted_address || address;
            area =
              data.results?.[0]?.address_components?.find(
                (c: { types: string[] }) => c.types.includes("sublocality")
              )?.long_name || area;
          }
        } catch { /* use defaults */ }
        setLocation({ lat: latitude, lon: longitude, address, area });
        setLocationLoading(false);
      },
      () => {
        // Kota center fallback
        setLocation({ lat: 25.2138, lon: 75.8648, address: "Kota, Rajasthan", area: "Kota" });
        setLocationLoading(false);
      },
      { timeout: 8000 }
    );
  }, [router, selectedVehicleTypeId]);

  const handleConfirm = async () => {
    if (!location || !pricingDetail || !selectedVehicleTypeId) {
      toast("Location required to request help", "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await axios.post("/api/requests/create", {
        serviceId: pricingDetail.serviceId,
        vehicleTypeId: selectedVehicleTypeId,
        latitude: location.lat,
        longitude: location.lon,
        address: location.address,
        area: location.area,
      });

      if (res.data.success) {
        const { requestId, ...rest } = res.data.data;
        setActiveRequest({
          id: requestId,
          status: "REQUESTED",
          ...rest,
        });
        router.push(`/tracking/${requestId}`);
      }
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : "Failed to create request";
      toast(msg || "Something went wrong", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!selectedVehicleTypeId) return null;

  return (
    <div className="page-container min-h-screen flex flex-col">
      {/* Header */}
      <div className="safe-top px-4 pt-4">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-[#A1A1AA] hover:text-white">
          <ArrowLeft className="w-6 h-6" />
        </button>
      </div>

      <div className="px-4 pt-2 pb-4">
        <h1 className="text-2xl font-bold font-display">Confirm your request</h1>
        <p className="text-[#A1A1AA] text-sm mt-1">Review details before we find a partner</p>
      </div>

      <div className="flex-1 px-4 space-y-4 overflow-y-auto pb-40">
        {/* Location */}
        <div className="fixoo-card">
          <p className="text-[#A1A1AA] text-xs font-medium uppercase tracking-widest mb-3">
            Your location
          </p>
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-[#22C55E] mt-0.5 flex-shrink-0" />
            {locationLoading ? (
              <LoadingSpinner size="sm" text="Detecting..." />
            ) : (
              <div>
                <p className="text-white font-medium text-sm">{location?.area}</p>
                <p className="text-[#A1A1AA] text-xs mt-0.5 line-clamp-2">{location?.address}</p>
              </div>
            )}
          </div>
        </div>

        {/* Price preview */}
        {pricingDetail ? (
          <PricePreview
            serviceFee={Number(pricingDetail.serviceFee)}
            platformFee={Number(pricingDetail.platformFee)}
            nightSurcharge={Number(pricingDetail.nightSurcharge)}
            totalAmount={Number(pricingDetail.totalAmount)}
            etaMin={pricingDetail.etaMin}
            etaMax={pricingDetail.etaMax}
            isNight={pricingDetail.isNight}
            vehicleName={pricingDetail.vehicleType?.displayName || ""}
            serviceName={pricingDetail.service?.displayName || "Puncture Repair"}
          />
        ) : (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        )}

        {/* Trust signals */}
        <div className="fixoo-card flex items-start gap-3">
          <Shield className="w-5 h-5 text-[#22C55E] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-white font-medium text-sm">Verified partners only</p>
            <p className="text-[#A1A1AA] text-xs mt-0.5">
              All Fixoo partners are background-verified. You can call them once accepted.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-4 pb-8 pt-4 bg-gradient-to-t from-black to-transparent safe-bottom">
        <button
          onClick={handleConfirm}
          disabled={submitting || locationLoading || !pricingDetail}
          className="fixoo-btn-primary text-lg py-5 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <><LoadingSpinner size="sm" /> Finding partners...</>
          ) : (
            `Confirm — ₹${pricingDetail ? Number(pricingDetail.totalAmount) : "..."}`
          )}
        </button>
        <p className="text-center text-[#A1A1AA] text-xs mt-2">
          Pay after service is complete
        </p>
      </div>
    </div>
  );
}

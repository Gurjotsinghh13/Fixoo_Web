"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { MapPin, ChevronRight, Zap, Bell } from "lucide-react";
import { VehicleCard } from "@/components/customer/VehicleCard";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { BottomNav } from "@/components/shared/BottomNav";
import { useRequestStore } from "@/store/useRequestStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { VehicleType, ServicePricing } from "@/types";

interface PricingMap {
  [vehicleTypeId: string]: ServicePricing & { vehicleType: VehicleType };
}

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { selectedVehicleTypeId, setSelectedVehicle } = useRequestStore();
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationName, setLocationName] = useState("Detecting location...");
  const [locationLoading, setLocationLoading] = useState(true);

  const { data: pricingData, isLoading: pricingLoading } = useQuery({
    queryKey: ["pricing"],
    queryFn: async () => {
      const res = await axios.get("/api/pricing");
      return res.data.data as (ServicePricing & { vehicleType: VehicleType })[];
    },
  });

  const { pricingMap, vehicles } = useMemo(() => {
    const map: PricingMap = {};
    const list: VehicleType[] = [];

    pricingData?.forEach((p) => {
      if (!map[p.vehicleTypeId]) {
        map[p.vehicleTypeId] = p;
        list.push(p.vehicleType);
      }
    });

    list.sort((a, b) => a.sortOrder - b.sortOrder);
    return { pricingMap: map, vehicles: list };
  }, [pricingData]);

  useEffect(() => {
    if (vehicles.length > 0 && !selectedVehicleTypeId) {
      setSelectedVehicle(vehicles[0].id);
    }
  }, [selectedVehicleTypeId, setSelectedVehicle, vehicles]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationName("Kota, Rajasthan");
      setLocationLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation({ lat: latitude, lon: longitude });
        setLocationLoading(false);
        try {
          const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
          if (key) {
            const res = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${key}`
            );
            const data = await res.json();
            const area =
              data.results?.[0]?.address_components?.find(
                (c: { types: string[] }) => c.types.includes("sublocality")
              )?.long_name ||
              data.results?.[0]?.formatted_address?.split(",")[0] ||
              "Kota";
            setLocationName(area);
          } else {
            setLocationName("Kota, Rajasthan");
          }
        } catch {
          setLocationName("Kota, Rajasthan");
        }
      },
      () => {
        setLocationName("Kota, Rajasthan");
        setLocationLoading(false);
      },
      { timeout: 8000 }
    );
  }, []);

  const handleRequestHelp = () => {
    if (!selectedVehicleTypeId) return;
    router.push("/request");
  };

  return (
    <div className="page-container">
      <div className="safe-top px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-black fill-black" />
          </div>
          <span className="font-display font-bold text-lg">Fixoo</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="w-8 h-8 flex items-center justify-center text-[#A1A1AA]">
            <Bell className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center">
            <span className="text-xs font-semibold">{user?.name?.[0] || "U"}</span>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <button className="w-full flex items-center gap-3 bg-[#111111] border border-[#2A2A2A] rounded-xl px-4 py-3 hover:border-[#3A3A3A] transition-colors">
          <MapPin className="w-4 h-4 text-[#22C55E] flex-shrink-0" />
          <div className="flex-1 text-left">
            <p className="text-xs text-[#A1A1AA]">Your location</p>
            <p className="text-white text-sm font-medium truncate">
              {locationLoading ? "Detecting..." : locationName}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-[#A1A1AA]" />
        </button>
      </div>

      <div className="px-4 pb-32 overflow-y-auto">
        <div className="py-4">
          <h1 className="text-3xl font-bold font-display leading-tight">
            Emergency repair,<br />
            <span className="text-[#A1A1AA]">in 30 minutes.</span>
          </h1>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <div className="online-dot" />
          <span className="text-[#A1A1AA] text-sm">Partners active near you</span>
        </div>

        <div className="mb-3">
          <p className="text-[#A1A1AA] text-xs font-medium uppercase tracking-widest">
            Select vehicle
          </p>
        </div>

        {pricingLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {vehicles.map((vehicle) => {
              const pricing = pricingMap[vehicle.id];
              return (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  selected={selectedVehicleTypeId === vehicle.id}
                  etaMin={pricing?.etaMin || 10}
                  etaMax={pricing?.etaMax || 20}
                  startingFrom={Number(pricing?.serviceFee) + Number(pricing?.platformFee)}
                  onSelect={setSelectedVehicle}
                />
              );
            })}
          </div>
        )}

        <div className="mb-3">
          <p className="text-[#A1A1AA] text-xs font-medium uppercase tracking-widest mb-3">
            Service
          </p>
          <div className="fixoo-card flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">Tyre</span>
              <div>
                <p className="text-white font-medium">Puncture Repair</p>
                <p className="text-[#A1A1AA] text-xs">On-site tyre repair</p>
              </div>
            </div>
            <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-black" />
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-md px-4 pb-4 bg-gradient-to-t from-black via-black/95 to-transparent pt-6">
        <button
          onClick={handleRequestHelp}
          disabled={!selectedVehicleTypeId || pricingLoading}
          className="fixoo-btn-primary text-lg py-5 font-semibold"
        >
          Request Help Now
        </button>
        {location && (
          <p className="text-center text-[#A1A1AA] text-xs mt-2">
            Location detected - partners notified instantly
          </p>
        )}
      </div>

      <BottomNav role="customer" />
    </div>
  );
}

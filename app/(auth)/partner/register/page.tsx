"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { ArrowLeft, CheckCircle, Upload, Wrench } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { OTPInput } from "@/components/shared/OTPInput";
import { toast } from "@/components/shared/Toaster";

type Step = "form" | "otp" | "done";
type DocumentKey = "shopPhotoUrl" | "idProofUrl" | "addressProofUrl";

type VehicleTypeOption = {
  id: string;
  displayName: string;
};

const MAX_DOCUMENT_BYTES = 750_000;
const ALLOWED_DOCUMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

function readDocument(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
      reject(new Error("Use JPG, PNG, WebP or PDF files"));
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      reject(new Error("Each document must be 750 KB or smaller"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function PartnerRegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [applicationNumber, setApplicationNumber] = useState("");
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeOption[]>([]);
  const [documentNames, setDocumentNames] = useState<Record<DocumentKey, string>>({
    shopPhotoUrl: "",
    idProofUrl: "",
    addressProofUrl: "",
  });
  const [form, setForm] = useState({
    phone: "",
    name: "",
    shopName: "",
    address: "",
    area: "",
    pincode: "",
    aadhaarNumber: "",
    serviceRadius: "3",
    workingHours: "",
    emergencyContact: "",
    shopPhotoUrl: "",
    idProofUrl: "",
    addressProofUrl: "",
    vehicleTypeIds: [] as string[],
  });

  useEffect(() => {
    axios
      .get("/api/partner/register")
      .then((response) => setVehicleTypes(response.data.data || []))
      .catch(() => toast("Failed to load vehicle types", "error"));
  }, []);

  const update = (key: keyof typeof form, value: string | string[]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const validate = () => {
    const required = [
      form.phone,
      form.name,
      form.shopName,
      form.address,
      form.area,
      form.pincode,
      form.aadhaarNumber,
      form.workingHours,
      form.emergencyContact,
      form.shopPhotoUrl,
      form.idProofUrl,
      form.addressProofUrl,
    ];
    if (required.some((value) => !value.trim())) {
      return "Complete all required application fields";
    }
    if (!/^[6-9]\d{9}$/.test(form.phone)) return "Enter a valid mobile number";
    if (!/^\d{12}$/.test(form.aadhaarNumber)) return "Aadhaar must be 12 digits";
    if (!/^\d{6}$/.test(form.pincode)) return "Pincode must be 6 digits";
    if (!/^[6-9]\d{9}$/.test(form.emergencyContact)) {
      return "Enter a valid emergency contact";
    }
    if (form.vehicleTypeIds.length === 0) {
      return "Select at least one supported vehicle type";
    }
    return null;
  };

  const sendOtp = async () => {
    const validationError = validate();
    if (validationError) {
      toast(validationError, "error");
      return;
    }

    setLoading(true);
    try {
      await axios.post("/api/partner/register/send-otp", { phone: form.phone });
      setStep("otp");
      toast("Verification OTP sent", "success");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error
        : "Failed to send OTP";
      toast(message || "Failed to send OTP", "error");
    } finally {
      setLoading(false);
    }
  };

  const verifyAndSubmit = async (code: string) => {
    setLoading(true);
    try {
      const verification = await axios.post(
        "/api/partner/register/verify-otp",
        { phone: form.phone, code }
      );
      const registration = await axios.post("/api/partner/register", {
        ...form,
        registrationToken: verification.data.data.registrationToken,
      });
      setApplicationNumber(registration.data.data.applicationNumber);
      setStep("done");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.error
        : "Application submission failed";
      toast(message || "Application submission failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDocument = async (key: DocumentKey, file?: File) => {
    if (!file) return;
    try {
      const encoded = await readDocument(file);
      update(key, encoded);
      setDocumentNames((current) => ({ ...current, [key]: file.name }));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Invalid document", "error");
    }
  };

  if (step === "done") {
    return (
      <div className="page-container min-h-screen px-6 flex items-center">
        <div className="w-full text-center">
          <CheckCircle className="w-14 h-14 text-[#22C55E] mx-auto mb-6" />
          <h1 className="text-2xl font-bold">Application Submitted</h1>
          <p className="text-[#A1A1AA] mt-3">Waiting for approval.</p>
          <div className="fixoo-card mt-8 text-left">
            <p className="text-[#A1A1AA] text-xs uppercase tracking-widest">
              Application Number
            </p>
            <p className="text-white font-mono break-all mt-2">
              {applicationNumber}
            </p>
            <p className="text-[#F97316] font-semibold mt-4">PENDING</p>
          </div>
          <button
            onClick={() => router.push("/partner/login")}
            className="fixoo-btn-primary mt-6"
          >
            Continue to Login
          </button>
        </div>
      </div>
    );
  }

  if (step === "otp") {
    return (
      <div className="page-container min-h-screen px-6 flex flex-col">
        <div className="safe-top pt-6">
          <button
            onClick={() => setStep("form")}
            className="p-2 -ml-2 text-[#A1A1AA]"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
        </div>
        <div className="flex-1 flex flex-col justify-center">
          <h1 className="text-3xl font-bold">Verify phone</h1>
          <p className="text-[#A1A1AA] mt-2 mb-8">OTP sent to +91 {form.phone}</p>
          <OTPInput onComplete={verifyAndSubmit} disabled={loading} />
          {loading && (
            <div className="mt-8 flex justify-center">
              <LoadingSpinner text="Submitting application..." />
            </div>
          )}
        </div>
      </div>
    );
  }

  const fields = [
    ["name", "Owner Name", "Full legal name", "text", 100],
    ["shopName", "Shop Name", "Business name", "text", 120],
    ["phone", "Phone Number", "10-digit mobile number", "tel", 10],
    ["address", "Address", "Full shop address", "text", 300],
    ["area", "Area", "Locality in Kota", "text", 120],
    ["pincode", "Pincode", "6-digit pincode", "tel", 6],
    ["aadhaarNumber", "Aadhaar Number", "12-digit Aadhaar", "tel", 12],
    ["workingHours", "Working Hours", "e.g. 9 AM - 9 PM", "text", 120],
    ["serviceRadius", "Service Radius (km)", "3", "number", undefined],
    ["emergencyContact", "Emergency Contact", "10-digit mobile number", "tel", 10],
  ] as const;

  return (
    <div className="page-container min-h-screen">
      <div className="safe-top px-5 pt-5">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-[#A1A1AA]">
          <ArrowLeft className="w-6 h-6" />
        </button>
      </div>

      <div className="px-5 pb-10">
        <div className="w-12 h-12 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg flex items-center justify-center mt-3 mb-5">
          <Wrench className="w-6 h-6" />
        </div>
        <h1 className="text-3xl font-bold">Partner Application</h1>
        <p className="text-[#A1A1AA] mt-2 mb-8">
          Submit your shop details for Fixoo operations review.
        </p>

        <div className="space-y-4">
          {fields.map(([key, label, placeholder, type, maxLength]) => (
            <label key={key} className="block">
              <span className="fixoo-label">{label}</span>
              <input
                type={type}
                inputMode={type === "tel" || type === "number" ? "numeric" : "text"}
                maxLength={maxLength}
                min={key === "serviceRadius" ? 1 : undefined}
                max={key === "serviceRadius" ? 25 : undefined}
                value={form[key]}
                placeholder={placeholder}
                onChange={(event) =>
                  update(
                    key,
                    type === "tel"
                      ? event.target.value.replace(/\D/g, "")
                      : event.target.value
                  )
                }
                className="fixoo-input"
              />
            </label>
          ))}

          <div>
            <p className="fixoo-label">Vehicle Types Supported</p>
            <div className="grid grid-cols-2 gap-2">
              {vehicleTypes.map((vehicle) => {
                const selected = form.vehicleTypeIds.includes(vehicle.id);
                return (
                  <label
                    key={vehicle.id}
                    className={`flex items-center gap-3 border p-3 rounded-lg ${
                      selected
                        ? "border-white bg-white/10"
                        : "border-[#2A2A2A] bg-[#111111]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        update(
                          "vehicleTypeIds",
                          selected
                            ? form.vehicleTypeIds.filter((id) => id !== vehicle.id)
                            : [...form.vehicleTypeIds, vehicle.id]
                        )
                      }
                    />
                    <span className="text-sm">{vehicle.displayName}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {([
            ["shopPhotoUrl", "Shop Photo"],
            ["idProofUrl", "ID Proof"],
            ["addressProofUrl", "Address Proof"],
          ] as const).map(([key, label]) => (
            <label key={key} className="block">
              <span className="fixoo-label">{label}</span>
              <span className="fixoo-input flex items-center gap-3 cursor-pointer">
                <Upload className="w-4 h-4 text-[#A1A1AA]" />
                <span className="text-sm text-[#A1A1AA] truncate">
                  {documentNames[key] || "Choose JPG, PNG, WebP or PDF"}
                </span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(event) =>
                    handleDocument(key, event.target.files?.[0])
                  }
                />
              </span>
            </label>
          ))}
        </div>

        <button
          onClick={sendOtp}
          disabled={loading}
          className="fixoo-btn-primary mt-8 flex items-center justify-center gap-2"
        >
          {loading ? <LoadingSpinner size="sm" /> : "Verify Phone & Submit"}
        </button>
        <p className="text-center text-[#A1A1AA] text-xs mt-5">
          Already applied?{" "}
          <a href="/partner/login" className="text-white underline">
            Check application status
          </a>
        </p>
      </div>
    </div>
  );
}

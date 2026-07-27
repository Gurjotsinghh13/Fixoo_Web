"use client";
import { useRef, useState, KeyboardEvent, ClipboardEvent, FormEvent } from "react";

interface OTPInputProps {
  length?: number;
  onComplete: (otp: string) => void;
  disabled?: boolean;
}

export function OTPInput({ length = 6, onComplete, disabled = false }: OTPInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(""));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const lastCompletedOtp = useRef<string | null>(null);

  const completeOtp = (otp: string) => {
    if (otp.length !== length || lastCompletedOtp.current === otp) return;
    lastCompletedOtp.current = otp;
    onComplete(otp);
  };

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newValues = [...values];
    newValues[index] = value.slice(-1);
    setValues(newValues);

    if (value && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }

    const otp = newValues.join("");
    completeOtp(otp);
  };

  const readDomOtp = () => inputs.current.map((input) => input?.value.replace(/\D/g, "").slice(-1) || "");

  const completeFromDom = () => {
    const domValues = readDomOtp();
    const otp = domValues.join("");
    if (otp.length === length) {
      setValues(domValues);
      completeOtp(otp);
    }
  };

  const handleInput = (index: number, e: FormEvent<HTMLInputElement>) => {
    handleChange(index, e.currentTarget.value);
    setTimeout(completeFromDom, 0);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !values[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    const newValues = [...values];
    for (let i = 0; i < pasted.length; i++) {
      newValues[i] = pasted[i];
    }
    setValues(newValues);
    inputs.current[Math.min(pasted.length, length - 1)]?.focus();
    completeOtp(pasted);
  };

  return (
    <div className="flex gap-3 justify-center">
      {values.map((val, index) => (
        <input
          key={index}
          ref={(el) => { inputs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={val}
          onChange={(e) => handleChange(index, e.target.value)}
          onInput={(e) => handleInput(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onKeyUp={completeFromDom}
          onPaste={handlePaste}
          disabled={disabled}
          className={`w-12 h-14 text-center text-2xl font-semibold rounded-xl border
            bg-[#1A1A1A] text-white transition-all duration-150
            ${val ? "border-white" : "border-[#2A2A2A]"}
            focus:border-white focus:outline-none
            disabled:opacity-50`}
        />
      ))}
    </div>
  );
}

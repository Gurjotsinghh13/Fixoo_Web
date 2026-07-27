"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Clock, User } from "lucide-react";

interface NavItem {
  href: string;
  icon: React.ReactNode;
  label: string;
}

interface BottomNavProps {
  role: "customer" | "partner";
}

const customerNav: NavItem[] = [
  { href: "/home", icon: <Home className="w-5 h-5" />, label: "Home" },
  { href: "/history", icon: <Clock className="w-5 h-5" />, label: "History" },
  { href: "/profile", icon: <User className="w-5 h-5" />, label: "Profile" },
];

const partnerNav: NavItem[] = [
  { href: "/partner/dashboard", icon: <Home className="w-5 h-5" />, label: "Dashboard" },
  { href: "/partner/earnings", icon: <Clock className="w-5 h-5" />, label: "Earnings" },
  { href: "/partner/profile", icon: <User className="w-5 h-5" />, label: "Profile" },
];

export function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname();
  const items = role === "customer" ? customerNav : partnerNav;

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-[#111111] border-t border-[#2A2A2A] safe-bottom z-40">
      <div className="flex">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                active ? "text-white" : "text-[#A1A1AA]"
              }`}
            >
              {item.icon}
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

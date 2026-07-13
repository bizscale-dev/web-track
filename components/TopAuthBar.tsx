"use client";

import { useAuth } from "./AuthProvider";
import { Shield, ShieldAlert, ShieldCheck, LogOut, LayoutDashboard, Lock, Briefcase } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function TopAuthBar() {
  const { role } = useAuth();
  const pathname = usePathname();

  // THE INTERCEPTOR: Hide the top bar entirely on the login page
  if (pathname === '/') return null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/"; // Force a hard reset of the application state
  };

  return (
    <div className="sticky top-0 z-[100] w-full backdrop-blur-xl bg-white/70 border-b border-slate-200 shadow-[0_4px_30px_rgba(0,0,0,0.03)] px-4 sm:px-8 py-3 flex items-center justify-between transition-all duration-500">
      
      {/* Left Side: Clearance Status */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center w-10 h-10 rounded-full border shadow-sm transition-colors ${
          role === 'admin' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 
          role === 'manager' ? 'bg-blue-50 border-blue-200 text-blue-600' : 
          role === 'user' ? 'bg-slate-50 border-slate-200 text-slate-500' :
          'bg-purple-50 border-purple-200 text-purple-600' // Custom styling for your Staff
        }`}>
          {role === "admin" ? <ShieldCheck className="w-5 h-5" /> : 
           role === "manager" ? <Shield className="w-5 h-5" /> : 
           role === "user" ? <ShieldAlert className="w-5 h-5" /> : 
           <Briefcase className="w-5 h-5" />}
        </div>
        
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Security Clearance</span>
          {role === "admin" ? (
            <span className="text-sm font-black text-emerald-700 leading-none tracking-tight">Admin Protocol Active</span>
          ) : role === "manager" ? (
            <span className="text-sm font-black text-blue-700 leading-none tracking-tight">Manager Access</span>
          ) : role === "user" ? (
            <span className="text-sm font-black text-slate-700 leading-none tracking-tight">Standard User</span>
          ) : (
            /* DYNAMIC STAFF ROLE DISPLAY */
            <span className="text-sm font-black text-purple-700 leading-none tracking-tight">{role} Access</span>
          )}
        </div>
      </div>

      {/* Right Side: Actions & Secure Login Route */}
      <div className="flex items-center gap-4">
        {role === "user" ? (
          <Link href="/" className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm">
            <Lock className="w-4 h-4" /> Secure Login
          </Link>
        ) : (
          <div className="flex items-center gap-2 sm:gap-3">
            {/* UPGRADED: Allows both Admins and Managers to see the Command Center link */}
            {pathname !== "/admin" && pathname !== "/admin/timelines" && (role === "admin" || role === "manager") && (
              <Link href="/admin" className="hidden sm:flex items-center gap-2 text-sm font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-xl border border-blue-200 transition-all shadow-sm">
                <LayoutDashboard className="w-4 h-4" /> Command Center
              </Link>
            )}
            <button 
              onClick={handleLogout} 
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-full hover:bg-rose-500/20 hover:text-rose-300 transition-all shadow-[0_0_15px_rgba(244,63,94,0.1)]"
            >
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Drop Access</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
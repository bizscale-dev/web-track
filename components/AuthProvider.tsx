"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

type AuthContextType = {
  session: any;
  role: string;
  name: string;
  email: string;
  avatar: string; // NEW
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  role: "user",
  name: "",
  email: "",
  avatar: "",
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [role, setRole] = useState<string>("user");
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [avatar, setAvatar] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const syncSession = (nextSession: any) => {
      if (nextSession?.user) {
        setSession(nextSession);
        setRole(nextSession.user.user_metadata?.role || "user");
        setName(nextSession.user.user_metadata?.name || "Unknown Operator");
        setAvatar(nextSession.user.user_metadata?.avatar_url || "");
        setEmail(nextSession.user.email || "");
      } else {
        setSession(null);
        setRole("user");
        setName("");
        setAvatar("");
        setEmail("");
      }
    };

    async function initializeAuth() {
      const { data: { session } } = await supabase.auth.getSession();

      if (!mounted) return;

      syncSession(session);
      setLoading(false);
    }

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;

      syncSession(nextSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ session, role, name, email, avatar, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
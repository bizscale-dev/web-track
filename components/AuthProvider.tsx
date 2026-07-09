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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setRole(session.user.user_metadata?.role || "user");
        setName(session.user.user_metadata?.name || "Unknown Operator");
        setAvatar(session.user.user_metadata?.avatar_url || ""); // Extract Avatar
        setEmail(session.user.email || "");
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        setRole(session.user.user_metadata?.role || "user");
        setName(session.user.user_metadata?.name || "Unknown Operator");
        setAvatar(session.user.user_metadata?.avatar_url || ""); // Extract Avatar
        setEmail(session.user.email || "");
      } else {
        setRole("user");
        setName("");
        setAvatar("");
        setEmail("");
      }
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
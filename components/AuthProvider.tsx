"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import { applyTheme, DEFAULT_THEME, type ThemeColors } from "@/lib/theme";

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SESSION_STARTED_AT_KEY = "website-crm-session-started-at";

type AuthContextType = {
  session: any;
  role: string;
  name: string;
  email: string;
  avatar: string; // NEW
  theme: ThemeColors;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  role: "user",
  name: "",
  email: "",
  avatar: "",
  theme: DEFAULT_THEME,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [role, setRole] = useState<string>("user");
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [avatar, setAvatar] = useState<string>("");
  const [theme, setTheme] = useState<ThemeColors>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    let mounted = true;

    const readSessionStartedAt = () => {
      if (typeof window === "undefined") return null;

      const storedValue = window.localStorage.getItem(SESSION_STARTED_AT_KEY);
      if (!storedValue) return null;

      const parsedValue = Number(storedValue);
      return Number.isFinite(parsedValue) ? parsedValue : null;
    };

    const writeSessionStartedAt = (startedAt: number) => {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(SESSION_STARTED_AT_KEY, String(startedAt));
    };

    const clearSessionStartedAt = () => {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(SESSION_STARTED_AT_KEY);
    };

    const isExpired = (startedAt: number) => Date.now() - startedAt >= SESSION_TTL_MS;

    const syncSession = (nextSession: any) => {
      if (nextSession?.user) {
        setSession(nextSession);
        setRole(nextSession.user.user_metadata?.role || "user");
        setName(nextSession.user.user_metadata?.name || "Unknown Operator");
        setAvatar(nextSession.user.user_metadata?.avatar_url || "");
        setTheme({
          background: nextSession.user.user_metadata?.theme_bg || DEFAULT_THEME.background,
          card: nextSession.user.user_metadata?.theme_card || DEFAULT_THEME.card,
          button: nextSession.user.user_metadata?.theme_button || DEFAULT_THEME.button,
          accent: nextSession.user.user_metadata?.theme_accent || DEFAULT_THEME.accent,
        });
        setEmail(nextSession.user.email || "");
      } else {
        setSession(null);
        setRole("user");
        setName("");
        setAvatar("");
        setTheme(DEFAULT_THEME);
        setEmail("");
      }
    };

    const validateSession = async (nextSession: any) => {
      if (!nextSession?.user) {
        clearSessionStartedAt();
        syncSession(null);
        return;
      }

      const startedAt = readSessionStartedAt();

      if (startedAt && isExpired(startedAt)) {
        clearSessionStartedAt();
        await supabase.auth.signOut();
        return;
      }

      if (!startedAt) {
        writeSessionStartedAt(Date.now());
      }

      syncSession(nextSession);
    };

    async function initializeAuth() {
      const { data: { session } } = await supabase.auth.getSession();

      if (!mounted) return;

      await validateSession(session);
      setLoading(false);
    }

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!mounted) return;

      await validateSession(nextSession);
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
    <AuthContext.Provider value={{ session, role, name, email, avatar, theme, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
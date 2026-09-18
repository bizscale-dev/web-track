"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { X, Lock, User, Loader2, CheckCircle2, Camera, Palette } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useRouter } from "next/navigation";
import { cascadeNameUpdate, cascadeAvatarUpdate } from "@/app/actions";
import { applyTheme, DEFAULT_THEME, type ThemeColors } from "@/lib/theme";

// A broad spread across the hue wheel, offered as one-click presets —
// "any color" is still available via the native picker next to each row.
const VIVID_PRESETS = [
  "#2563eb", // blue (default)
  "#1d4ed8",
  "#4f46e5",
  "#7c3aed",
  "#9333ea",
  "#c026d3",
  "#db2777",
  "#e11d48",
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#ca8a04",
  "#65a30d",
  "#16a34a",
  "#059669",
  "#0d9488",
  "#0891b2",
  "#0284c7",
  "#475569",
  "#1e293b",
];

const BACKGROUND_PRESETS = [
  "#f6f8fc", // default
  "#ffffff",
  "#f8fafc",
  "#f1f5f9",
  "#fef2f2",
  "#fff7ed",
  "#fefce8",
  "#f0fdf4",
  "#ecfdf5",
  "#f0fdfa",
  "#eff6ff",
  "#eef2ff",
  "#faf5ff",
  "#fdf4ff",
  "#fdf2f8",
  "#0f172a", // slate dark
];

type ColorRowProps = {
  label: string;
  value: string;
  presets: string[];
  saving: boolean;
  onChange: (hex: string) => void;
};

function ColorRow({ label, value, presets, saving, onChange }: ColorRowProps) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
        <Palette className="w-3.5 h-3.5" /> {label}
        {saving && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => onChange(hex)}
            title={hex}
            className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
              value.toLowerCase() === hex.toLowerCase() ? "border-slate-900" : "border-white shadow-sm"
            }`}
            style={{ backgroundColor: hex }}
          />
        ))}
        <label
          className="relative w-7 h-7 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-slate-400 transition-colors overflow-hidden shrink-0"
          title="Pick any color"
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <Palette className="w-3 h-3 text-slate-400 pointer-events-none" />
        </label>
      </div>
    </div>
  );
}

export default function UserProfileSettings({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { session, name: currentName, email, avatar: currentAvatar, theme: currentTheme } = useAuth();
  const [newName, setNewName] = useState(currentName || "");
  const [newPassword, setNewPassword] = useState("");
  const [theme, setThemeState] = useState<ThemeColors>(currentTheme || DEFAULT_THEME);
  const [savingKey, setSavingKey] = useState<keyof ThemeColors | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const metadataKey: Record<keyof ThemeColors, string> = {
    background: "theme_bg",
    card: "theme_card",
    button: "theme_button",
    accent: "theme_accent",
  };

  const handleThemeChange = async (key: keyof ThemeColors, hex: string) => {
    const nextTheme = { ...theme, [key]: hex };
    setThemeState(nextTheme);
    applyTheme(nextTheme); // instant preview, doesn't wait on the network round-trip
    setSavingKey(key);
    const { error } = await supabase.auth.updateUser({ data: { [metadataKey[key]]: hex } });
    setSavingKey(null);
    if (error) {
      setMessage({ type: "error", text: "Couldn't save theme color: " + error.message });
      setThemeState(currentTheme);
      applyTheme(currentTheme);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user) return;

    setUploadingImage(true);
    setMessage(null);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${session.user.id}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl }
      });

      if (updateError) throw updateError;

      // Mirror onto team_members so other people (e.g. Tasks Overview) can
      // see this avatar too — user_metadata is only readable by the owner.
      if (session.user.id) {
        const cascadeRes = (await cascadeAvatarUpdate(session.user.id, publicUrl)) as unknown as {
          success: boolean;
          error?: string;
        };
        if (!cascadeRes.success) {
          console.error("Failed to cascade avatar to team_members:", cascadeRes.error);
        }
      }

      setMessage({ type: 'success', text: "Profile picture updated successfully!" });
    } catch (error: any) {
      setMessage({ type: 'error', text: "Failed to upload image: " + error.message });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const updates: any = {};
    if (newPassword.trim().length >= 6) updates.password = newPassword;
    if (newName !== currentName) updates.data = { name: newName };

    const { error } = await supabase.auth.updateUser(updates);

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {

            // --- SERVER-POWERED CASCADE UPDATE ---
            if (newName !== currentName && currentName && session?.user?.id) {
              // THE FIX: Add the unknown bridge to strictly type the Server Action response
      const cascadeRes = (await cascadeNameUpdate(currentName, newName, session.user.id)) as unknown as { success: boolean; error?: string };

      if (!cascadeRes.success) {
        console.error("Failed to update old cards:", cascadeRes.error);
      } else {
        // Force the dashboard to pull the fresh cards with the new names
      // ... rest of your code ...
          // Force the dashboard to pull the fresh cards with the new names
          router.refresh();
        }
      }

      setMessage({ type: 'success', text: "Profile settings saved! (Password updates require next login)." });
      setNewPassword("");
    }
    setLoading(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70"
      onClick={onClose}
    >
      <div
        className="bg-[var(--card)] rounded-[24px] shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
          <h2 className="text-lg font-bold text-[var(--card-foreground)]">Operator Settings</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {message && (
            <div className={`p-3 rounded-xl text-sm font-semibold flex items-center gap-2 ${message.type === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {message.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              {message.text}
            </div>
          )}

          {/* Avatar Upload Section */}
          <div className="flex flex-col items-center justify-center pb-4">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <div className="w-20 h-20 rounded-full bg-slate-100 border-2 border-slate-200 overflow-hidden flex items-center justify-center shadow-sm">
                {uploadingImage ? (
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
                ) : currentAvatar ? (
                  <img src={currentAvatar} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-slate-400" />
                )}
              </div>
              <div className="absolute inset-0 bg-slate-900/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-6 h-6 text-white" />
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
            />
            <span className="text-xs font-semibold text-slate-500 mt-2">Click to change picture</span>
          </div>

          {/* Theme — background / button / accent, each applies immediately and follows this account everywhere it logs in */}
          <div className="space-y-4 p-4 rounded-2xl bg-slate-50/70 border border-slate-100">
            <ColorRow
              label="Background"
              value={theme.background}
              presets={BACKGROUND_PRESETS}
              saving={savingKey === "background"}
              onChange={(hex) => handleThemeChange("background", hex)}
            />
            <ColorRow
              label="Card"
              value={theme.card}
              presets={BACKGROUND_PRESETS}
              saving={savingKey === "card"}
              onChange={(hex) => handleThemeChange("card", hex)}
            />
            <ColorRow
              label="Button"
              value={theme.button}
              presets={VIVID_PRESETS}
              saving={savingKey === "button"}
              onChange={(hex) => handleThemeChange("button", hex)}
            />
            <ColorRow
              label="Accent"
              value={theme.accent}
              presets={VIVID_PRESETS}
              saving={savingKey === "accent"}
              onChange={(hex) => handleThemeChange("accent", hex)}
            />
          </div>

          <form onSubmit={handleUpdate} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Account Email (Unchangeable)</label>
              <input type="email" disabled value={email || ""} className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Display Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[var(--accent)] outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">New Password (Optional)</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="password" placeholder="Leave blank to keep current" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[var(--accent)] outline-none" />
              </div>
            </div>

            <button type="submit" disabled={loading || uploadingImage} className="w-full h-12 bg-[var(--button)] hover:bg-[var(--button-hover)] text-[var(--button-text)] font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Profile Details"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { X, Lock, User, Loader2, CheckCircle2, Camera } from "lucide-react";
import { useAuth } from "./AuthProvider";

export default function UserProfileSettings({ onClose }: { onClose: () => void }) {
  const { session, name: currentName, email, avatar: currentAvatar } = useAuth();
  const [newName, setNewName] = useState(currentName || "");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      
      // --- CASCADE UPDATE LOGIC START ---
      if (newName !== currentName && currentName) {
        try {
          // 1. Update the central profiles table (so "Add Website" dropdowns update)
          if (session?.user?.id) {
            await supabase.from("profiles").update({ name: newName }).eq("id", session.user.id);
          }

          // 2. Cascade update all assigned roles in existing projects
          await supabase.from("websites").update({ developer: newName }).eq("developer", currentName);
          await supabase.from("websites").update({ content_writer: newName }).eq("content_writer", currentName);
          await supabase.from("websites").update({ seo_person: newName }).eq("seo_person", currentName);

          // 3. Update the forensics timeline so past logs match the new identity
          await supabase.from("website_activity_logs").update({ changed_by_email: newName }).eq("changed_by_email", currentName);
        } catch (cascadeError) {
          console.error("Database cascade update failed:", cascadeError);
        }
      }
      // --- CASCADE UPDATE LOGIC END ---

      setMessage({ type: 'success', text: "Profile settings saved! (Password updates require next login)." });
      setNewPassword("");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-900">Operator Settings</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
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
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
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

          <form onSubmit={handleUpdate} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Account Email (Unchangeable)</label>
              <input type="email" disabled value={email || ""} className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Display Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">New Password (Optional)</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="password" placeholder="Leave blank to keep current" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>

            <button type="submit" disabled={loading || uploadingImage} className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Profile Details"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
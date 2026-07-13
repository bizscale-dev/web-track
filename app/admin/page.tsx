"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Users, Clock, Plus, Trash2, Activity, ShieldAlert, BarChart3, CheckCircle2, Edit2, Save, X, KeyRound, Loader2, Calendar } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { WEBSITE_STATUSES } from "@/lib/statuses";
import { createSecureTeamMember, updateSecureTeamMember } from "@/app/adminActions";
import { completelyDeleteUser } from "@/app/actions";
import HolidayCalendar from "@/components/HolidayCalendar";

export default function AdminDashboard() {
  const { role, loading } = useAuth();
  const [team, setTeam] = useState<any[]>([]);
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [teamRole, setTeamRole] = useState("Developer");
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("Developer");

  // Modal State
  const [showCalendarModal, setShowCalendarModal] = useState(false);

  const [metrics, setMetrics] = useState({
    completedThisMonth: 0,
    statusCounts: {} as Record<string, number>,
    contentToCompleted: "Calculating...",
    completedToUpdated: "Calculating..."
  });

  useEffect(() => {
    if (role !== "user") {
      fetchTeam();
      calculateMetrics();
    }
  }, [role]);

  if (loading) {
    return (
      <main className="p-8 max-w-7xl mx-auto w-full min-h-[60vh] flex flex-col items-center justify-center">
        <Loader2 className="w-20 h-20 animate-spin text-blue-600 mb-6" />
        <h1 className="text-3xl font-black text-gray-900 mb-2">Decrypting session...</h1>
        <p className="text-gray-500">Checking your access level before loading Command Center.</p>
      </main>
    );
  }

  if (role === "user") {
    return (
      <main className="p-8 max-w-7xl mx-auto w-full min-h-[60vh] flex flex-col items-center justify-center">
        <ShieldAlert className="w-20 h-20 text-rose-500 mb-6 drop-shadow-[0_0_15px_rgba(244,63,94,0.4)]" />
        <h1 className="text-4xl font-black text-gray-900 mb-2">Clearance Required</h1>
        <p className="text-gray-500 mb-8">You must elevate your access to Manager or Admin to view this sector.</p>
        <Link href="/" className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition">
          Return to Main Dashboard
        </Link>
      </main>
    );
  }

  const fetchTeam = async () => {
    const { data } = await supabase.from("team_members").select("*").order("created_at", { ascending: false });
    if (data) setTeam(data);
  };

  const generatePassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let autoPass = "";
    for (let i = 0; i < 12; i++) {
      autoPass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(autoPass);
  };

  const addSecureMember = async () => {
    if (!name.trim() || !email.trim() || !password.trim() || role !== "admin") return;
    
    setIsCreating(true);
    setCreationError(null);

    const result = await createSecureTeamMember({
      name,
      email,
      password,
      role: teamRole
    });

    if (result.success && result.member) {
      setTeam([result.member, ...team]);
      setName("");
      setEmail("");
      setPassword("");
    } else {
      setCreationError(result.error || "Failed to create account.");
    }
    
    setIsCreating(false);
  };

  const deleteMember = async (id: string) => {
    if (role !== "admin") return;
    const confirmDelete = window.confirm("Are you sure? This will completely erase their account and login access.");
    if (!confirmDelete) return;

    const response = await completelyDeleteUser(id);

    if (response.success) {
      alert("Operator completely wiped from the system.");
      setTeam(team.filter((m) => m.id !== id));
    } else {
      alert("Failed to delete user: " + response.error);
    }
  };

  const startEdit = (member: any) => {
    setEditingId(member.id);
    setEditName(member.name);
    setEditRole(member.role);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditRole("Developer");
  };

  const saveEdit = async () => {
    if (!editName.trim() || role !== "admin" || !editingId) return;
    
    const response = await updateSecureTeamMember(editingId, {
      name: editName,
      role: editRole
    });

    if (response.success && response.member) {
      setTeam(team.map(t => t.id === editingId ? response.member : t));
      setEditingId(null);
    } else {
      alert("Error updating member: " + response.error);
    }
  };

  const filteredTeam = team.filter((member) => 
    member.name.toLowerCase().includes(name.toLowerCase()) || 
    (member.email && member.email.toLowerCase().includes(name.toLowerCase()))
  );

  const calculateMetrics = async () => {
    const { data: websites } = await supabase.from("websites").select("id, status, created_at");
    const { data: logs } = await supabase.from("website_activity_logs").select("*").order("created_at", { ascending: true });
    
    if (!websites || !logs) return;

    const counts: Record<string, number> = {};
    WEBSITE_STATUSES.forEach(s => counts[s] = 0);
    websites.forEach(site => {
      if (counts[site.status] !== undefined) counts[site.status]++;
    });

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let completedCount = 0;

    let contentToCompTotal = 0, contentToCompCount = 0;
    let compToUpdTotal = 0, compToUpdCount = 0;

    const logsBySite = logs.reduce((acc: any, log: any) => {
      if (!acc[log.website_id]) acc[log.website_id] = [];
      acc[log.website_id].push(log);
      return acc;
    }, {});

    Object.values(logsBySite).forEach((siteLogs: any) => {
      const completedLog = siteLogs.find((l: any) => l.new_value === "Completed");
      if (completedLog) {
        const logDate = new Date(completedLog.created_at);
        if (logDate.getMonth() === currentMonth && logDate.getFullYear() === currentYear) {
          completedCount++;
        }
      }

      const sentLog = siteLogs.find((l: any) => l.new_value === "Sent For Content");
      const contentCompLog = siteLogs.find((l: any) => l.new_value === "Content Completed");
      const contentUpdLog = siteLogs.find((l: any) => l.new_value === "Content Updated");

      if (sentLog && contentCompLog) {
        const diff = new Date(contentCompLog.created_at).getTime() - new Date(sentLog.created_at).getTime();
        if (diff > 0) {
          contentToCompTotal += diff;
          contentToCompCount++;
        }
      }

      if (contentCompLog && contentUpdLog) {
        const diff = new Date(contentUpdLog.created_at).getTime() - new Date(contentCompLog.created_at).getTime();
        if (diff > 0) {
          compToUpdTotal += diff;
          compToUpdCount++;
        }
      }
    });

    const formatTime = (ms: number) => {
      const days = Math.floor(ms / (1000 * 60 * 60 * 24));
      const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
      if (days > 0) return `${days}d ${hours}h`;
      return `${hours}h`;
    };

    setMetrics({
      completedThisMonth: completedCount,
      statusCounts: counts,
      contentToCompleted: contentToCompCount > 0 ? formatTime(contentToCompTotal / contentToCompCount) : "N/A",
      completedToUpdated: compToUpdCount > 0 ? formatTime(compToUpdTotal / compToUpdCount) : "N/A",
    });
  };

  return (
    <main className="p-4 sm:p-8 max-w-7xl mx-auto w-full">
      <div className="mb-8">
        <Link href="/" className="inline-flex items-center text-sm font-semibold text-blue-600 hover:text-blue-800 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Main Dashboard
        </Link>
        <div className="flex items-center gap-4">
          <h1 className="text-4xl font-black tracking-tight text-gray-900 sm:text-5xl">
            Command Center
          </h1>
          {role === "admin" ? (
            <span className="text-xs font-bold tracking-widest uppercase bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200 shadow-sm mt-2">Admin</span>
          ) : (
            <span className="text-xs font-bold tracking-widest uppercase bg-blue-100 text-blue-700 px-3 py-1 rounded-full border border-blue-200 shadow-sm mt-2">Manager</span>
          )}
        </div>
        
        {/* TOP HEADER CONTROLS */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-gray-500 font-medium">Intelligence overview and pipeline forensics.</p>
          
          {role === "admin" && (
            <button 
              onClick={() => setShowCalendarModal(true)}
              className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-[0_10px_30px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 hover:bg-slate-800 transition-all w-fit"
            >
              <Calendar className="w-4 h-4" /> Global Calendar
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Analytics Section */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex items-center justify-between relative overflow-hidden group">
              <div className="z-10">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Completed This Month</div>
                <div className="text-5xl font-black text-emerald-600">{metrics.completedThisMonth}</div>
              </div>
              <CheckCircle2 className="w-24 h-24 text-emerald-100 absolute -right-6 -bottom-6 group-hover:scale-110 transition-transform duration-500" />
            </div>
            
            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center z-10 relative">
                <Clock className="w-4 h-4 mr-2" /> Average Timelines
              </h2>
              <div className="space-y-4 z-10 relative">
                <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                  <span className="text-slate-600 font-medium">Sent <span className="text-slate-300 mx-1">→</span> Content Completed</span>
                  <span className="font-black text-slate-900 bg-slate-100 px-2 py-1 rounded-md">{metrics.contentToCompleted}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600 font-medium">Content Completed <span className="text-slate-300 mx-1">→</span> Content Updated</span>
                  <span className="font-black text-slate-900 bg-slate-100 px-2 py-1 rounded-md">{metrics.completedToUpdated}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-6 sm:p-8 rounded-2xl shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-900 flex items-center">
                <BarChart3 className="w-6 h-6 mr-3 text-blue-600" /> Pipeline Status
              </h2>
              <Link href="/admin/timelines" className="text-sm font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
                <Activity className="w-4 h-4" /> Forensics
              </Link>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {WEBSITE_STATUSES.map(status => (
                <div key={status} className="bg-slate-50 border border-slate-200 p-4 rounded-xl hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between group">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 truncate group-hover:text-blue-600 transition-colors" title={status}>{status}</span>
                  <span className="text-3xl font-black text-slate-900">{metrics.statusCounts[status] || 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Personnel Management Section */}
        <div className="bg-white border border-slate-200 p-6 sm:p-8 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <h2 className="text-xl font-bold text-slate-900 flex items-center mb-6">
            <Users className="w-6 h-6 mr-3 text-blue-600" /> Personnel Vault
          </h2>
          
          {role === "admin" && (
            <div className="flex flex-col gap-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Issue New Credentials</h3>
              
              {creationError && (
                <div className="p-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg">
                  {creationError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={teamRole}
                  onChange={(e) => setTeamRole(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="Developer">Developer</option>
                  <option value="Content Writer">Content Writer</option>
                  <option value="SEO Person">SEO Person</option>
                  <option value="Manager">Manager</option>
                </select>
              </div>

              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-3 pr-16 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="absolute right-2 top-[5px] px-2 py-1 bg-slate-200 text-slate-700 text-xs font-bold rounded hover:bg-slate-300 transition"
                  >
                    Auto
                  </button>
                </div>
                <button
                  type="button"
                  onClick={addSecureMember}
                  disabled={!name.trim() || !email.trim() || !password.trim() || isCreating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center shrink-0 w-[100px]"
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Deploy"}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
            {filteredTeam.map((member) => (
              <div key={member.id} className="p-3 bg-white border border-slate-200 rounded-xl group hover:border-blue-300 hover:shadow-sm transition-all">
                
                {editingId === member.id ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                      >
                        <option value="Developer">Developer</option>
                        <option value="Content Writer">Content Writer</option>
                        <option value="SEO Person">SEO Person</option>
                        <option value="Manager">Manager</option>
                      </select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={saveEdit} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-md text-xs font-bold transition">
                        <Save className="w-3.5 h-3.5" /> Save
                      </button>
                      <button onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-md text-xs font-bold transition">
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold text-lg shrink-0">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="font-bold text-sm text-slate-900 truncate">{member.name}</div>
                        <div className="flex items-center gap-2 mt-0.5 min-w-0">
                          <span className="text-xs text-slate-500 font-medium tracking-wide truncate shrink-0">{member.role}</span>
                          {member.email && (
                            <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded truncate max-w-full">
                              {member.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {role === "admin" && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                        <button onClick={() => startEdit(member)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteMember(member.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* GLOBAL HOLIDAY CALENDAR MODAL (SHRUNK TO max-w-md) */}
      {showCalendarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity">
          <div className="bg-slate-50 rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden relative border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-5 py-3 border-b border-slate-200 bg-white">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">Manage Exclusions</h3>
              </div>
              <button
                onClick={() => setShowCalendarModal(false)}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-4 max-h-[85vh] overflow-y-auto">
              <HolidayCalendar />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
"use client";
import TaskManager from "@/components/TaskManager";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { WEBSITE_STATUSES } from "@/lib/statuses";
import { triggerN8nWebhook } from "@/app/actions";
import SecureStatusDropdown from '@/components/SecureStatusDropdown';
import { useAuth } from "@/components/AuthProvider";
import { 
  ArrowLeft, ExternalLink, Key, LayoutTemplate, Lock, User, 
  Globe, Plus, Trash2, Edit2, Copy, Check, Save, FileText, ListPlus, Users 
} from "lucide-react";

// Helper to safely parse the JSON credentials column
const parseCreds = (credsString: string | null) => {
  if (!credsString) return { loginUrl: "", username: "", password: "" };
  try { return typeof credsString === 'string' ? JSON.parse(credsString) : credsString; } 
  catch { return { loginUrl: "", username: "", password: "" }; }
};

export default function ClientPage({ initialWebsite }: { initialWebsite: any }) {
  // UPGRADED: Extracting 'name' to pass to the webhook
  const { role, name } = useAuth();
  const isCommand = role === "admin" || role === "manager";
  const [website, setWebsite] = useState(initialWebsite);
  const [tasks, setTasks] = useState(initialWebsite.website_tasks || []);
  const [team, setTeam] = useState<any[]>([]);
  
  const initialCreds = parseCreds(initialWebsite.credentials);
  
  // UI States
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isEditingCreds, setIsEditingCreds] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isEditingTeam, setIsEditingTeam] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  
  // Form States
  const [credsForm, setCredsForm] = useState({
    loginUrl: initialCreds.loginUrl || "",
    username: initialCreds.username || "",
    password: initialCreds.password || ""
  });
  const [notesForm, setNotesForm] = useState(website.notes || "");
  const [newTaskForm, setNewTaskForm] = useState({ name: "", url: "" });
  const [editTaskForm, setEditTaskForm] = useState({ name: "", url: "" });
  const [teamForm, setTeamForm] = useState({
    developer: initialWebsite.developer || "",
    content_writer: initialWebsite.content_writer || "",
    seo_person: initialWebsite.seo_person || "",
    status: initialWebsite.status || "Pending",
    priority: initialWebsite.priority || "Normal"
  });

  // Strict Pipeline Logic
  const currentStatusIndex = WEBSITE_STATUSES.indexOf(website.status || "Pending");
  const allowedStatuses = currentStatusIndex !== -1 
    ? WEBSITE_STATUSES.filter((_, index) => Math.abs(index - currentStatusIndex) <= 1)
    : WEBSITE_STATUSES;

  useEffect(() => {
    const fetchTeam = async () => {
      const { data } = await supabase.from("team_members").select("*");
      if (data) setTeam(data);
    };
    fetchTeam();
  }, []);

  const developers = team.filter(t => t.role === "Developer");
  const writers = team.filter(t => t.role === "Content Writer");
  const seos = team.filter(t => t.role === "SEO Person");

  // --- UTILS ---
  const handleCopy = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // --- CREDENTIALS ---
  const handleSaveCreds = async () => {
    const { data, error } = await supabase
      .from("websites")
      .update({ credentials: JSON.stringify(credsForm) })
      .eq("id", website.id)
      .select()
      .single();

    if (error) alert("Error saving credentials: " + error.message);
    if (data && !error) {
      setWebsite(data);
      setIsEditingCreds(false);
    }
  };

  // --- TEAM & STATUS ---
  const handleSaveTeam = async () => {
    const statusChanged = website.status !== teamForm.status;
    const oldStatus = website.status;

    // Standard Users can only submit status changes, ignore other fields
    const payload = role === "user" ? { status: teamForm.status } : {
      developer: teamForm.developer || null,
      content_writer: teamForm.content_writer || null,
      seo_person: teamForm.seo_person || null,
      status: teamForm.status,
      priority: teamForm.priority
    };

    const { data, error } = await supabase
      .from("websites")
      .update(payload)
      .eq("id", website.id)
      .select()
      .single();

    if (error) alert("Error saving team details: " + error.message);
    if (data && !error) {
      setWebsite(data);
      setIsEditingTeam(false);

      if (statusChanged) {
        await supabase
          .from("website_activity_logs")
          .insert({
            website_id: website.id,
            event_type: "status_changed",
            old_value: oldStatus,
            new_value: teamForm.status,
            message: `Status changed from ${oldStatus} to ${teamForm.status}`,
          });

        triggerN8nWebhook({
          event: 'status_changed',
          websiteName: website.website_name,
          domain: website.domain,
          oldStatus: oldStatus,
          newStatus: teamForm.status,
          websiteId: website.id,
          // UPGRADED: Adding the missing parameter to satisfy the TypeScript compiler
          changedBy: name || "System Operator",
        }).catch(err => console.error("Server action failed:", err));
      }
    }
  };

  // --- NOTES ---
  const handleSaveNotes = async () => {
    const { data, error } = await supabase
      .from("websites")
      .update({ notes: notesForm })
      .eq("id", website.id)
      .select()
      .single();

    if (error) alert("Error saving notes: " + error.message);
    if (data && !error) {
      setWebsite(data);
      setIsEditingNotes(false);
    }
  };

  // --- PAGES TRACKER ---
  const handleAddTask = async () => {
    if (!newTaskForm.name) return;
    const isDuplicate = tasks.some((t: any) => t.title?.toLowerCase() === newTaskForm.name.toLowerCase() || (newTaskForm.url && t.url?.toLowerCase() === newTaskForm.url.toLowerCase()));
    if (isDuplicate) { alert("Page / URL Already Exists"); return; }

    const newTask = { website_id: website.id, title: newTaskForm.name, url: newTaskForm.url, is_completed: false };
    const { data, error } = await supabase.from("website_tasks").insert([newTask]).select();
    
    if (error) alert("Error adding page: " + error.message);
    if (data && !error) { setTasks([...tasks, ...data]); setNewTaskForm({ name: "", url: "" }); }
  };

  const handleAddDefaultPages = async () => {
    const baseUrl = website.domain ? (website.domain.startsWith('http') ? website.domain : `https://${website.domain}`).replace(/\/$/, "") : "https://example.com";
    const defaults = [
      { name: "Home", url: baseUrl }, { name: "About", url: `${baseUrl}/about` }, { name: "Service", url: `${baseUrl}/service` },
      { name: "Areas Served", url: `${baseUrl}/areas-served` }, { name: "Single Area", url: `${baseUrl}/single-area` },
      { name: "Single Service", url: `${baseUrl}/single-service` }, { name: "Contact Us", url: `${baseUrl}/contact-us` },
    ];

    const newTasks = defaults
      .filter(p => !tasks.some((t: any) => t.title?.toLowerCase() === p.name.toLowerCase() || t.url?.toLowerCase() === p.url.toLowerCase()))
      .map(p => ({ website_id: website.id, title: p.name, url: p.url, is_completed: false }));

    if (newTasks.length === 0) { alert("All default pages already exist!"); return; }

    const { data, error } = await supabase.from("website_tasks").insert(newTasks).select();
    if (error) alert("Error adding defaults: " + error.message);
    if (data && !error) setTasks([...tasks, ...data]);
  };

  const handleDeleteTask = async (id: string) => {
    const { error } = await supabase.from("website_tasks").delete().eq("id", id);
    if (error) alert("Error deleting page: " + error.message);
    if (!error) setTasks(tasks.filter((t: any) => t.id !== id));
  };

  const handleSaveEditTask = async (id: string) => {
    const { data, error } = await supabase.from("website_tasks").update({ title: editTaskForm.name, url: editTaskForm.url }).eq("id", id).select().single();
    if (error) alert("Error updating page: " + error.message);
    if (data && !error) { setTasks(tasks.map((t: any) => (t.id === id ? data : t))); setEditingTaskId(null); }
  };

  const currentCreds = parseCreds(website.credentials);
  const hasCreds = currentCreds.loginUrl || currentCreds.username || currentCreds.password;
  const displayDomain = website.domain ? (website.domain.startsWith('http') ? website.domain : `https://${website.domain}`) : "#";

  return (
    <main className="p-8 max-w-7xl mx-auto w-full">
      <div className="mb-8">
        <Link href="/dashboard" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">{website.website_name || "Website Details"}</h1>
          <a href={displayDomain} target="_blank" rel="noreferrer" className="inline-flex items-center px-4 py-2 bg-white/60 backdrop-blur-sm border border-gray-200 rounded-lg text-sm font-medium hover:bg-white transition-all shadow-sm">
            Visit Site <ExternalLink className="w-4 h-4 ml-2" />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        
        {/* LEFT COL: PAGES TRACKER */}
        <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-gray-200/60">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg mr-3"><LayoutTemplate className="w-5 h-5" /></div>
              <h2 className="text-xl font-semibold">Pages Tracker</h2>
            </div>
            <button onClick={handleAddDefaultPages} className="text-xs flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md font-medium transition-colors">
              <ListPlus className="w-4 h-4 mr-1" /> Add Defaults
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mb-6 p-3 bg-gray-50/50 border border-gray-100 rounded-xl">
            <input type="text" placeholder="Page Name" className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" value={newTaskForm.name} onChange={(e) => setNewTaskForm({...newTaskForm, name: e.target.value})} />
            <input type="text" placeholder="Page URL/Link" className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" value={newTaskForm.url} onChange={(e) => setNewTaskForm({...newTaskForm, url: e.target.value})} />
            <button onClick={handleAddTask} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shrink-0 flex items-center justify-center"><Plus className="w-5 h-5" /></button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white/50">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50/80 text-gray-600 border-b border-gray-200">
                <tr><th className="px-4 py-3 font-medium">Page Name</th><th className="px-4 py-3 font-medium">URL</th><th className="px-4 py-3 font-medium text-right">Actions</th></tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500 italic">No pages tracked yet. Add one above!</td></tr>
                ) : (
                  tasks.map((task: any) => (
                    <tr key={task.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                      {editingTaskId === task.id ? (
                        <>
                          <td className="px-4 py-2"><input type="text" className="w-full px-2 py-1 border rounded text-xs" value={editTaskForm.name} onChange={e => setEditTaskForm({...editTaskForm, name: e.target.value})} /></td>
                          <td className="px-4 py-2"><input type="text" className="w-full px-2 py-1 border rounded text-xs" value={editTaskForm.url} onChange={e => setEditTaskForm({...editTaskForm, url: e.target.value})} /></td>
                          <td className="px-4 py-2 text-right space-x-2">
                            <button onClick={() => handleSaveEditTask(task.id)} className="text-green-600 hover:text-green-800"><Save className="w-4 h-4" /></button>
                            <button onClick={() => setEditingTaskId(null)} className="text-gray-400 hover:text-gray-600">Cancel</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-medium text-gray-800">{task.title || "-"}</td>
                          <td className="px-4 py-3">{task.url ? <a href={task.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline max-w-[200px] block truncate">{task.url}</a> : "-"}</td>
                          <td className="px-4 py-3 text-right space-x-3">
                            <button onClick={() => { setEditingTaskId(task.id); setEditTaskForm({ name: task.title, url: task.url }); }} className="text-gray-400 hover:text-blue-600"><Edit2 className="w-4 h-4 inline" /></button>
                            <button onClick={() => handleDeleteTask(task.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4 inline" /></button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COL: CREDS & NOTES */}
        <div className="flex flex-col gap-6">

          <TaskManager websiteId={website.id} initialTasks={website.project_tasks || []} />
          
          {/* TEAM & STATUS BOX */}
          <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-gray-200/60">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg mr-3"><Users className="w-5 h-5" /></div>
                <h2 className="text-xl font-semibold">Team & Status</h2>
              </div>
              {isCommand && !isEditingTeam && (
                <button onClick={() => setIsEditingTeam(true)} className="text-sm text-gray-500 hover:text-purple-600 flex items-center">
                  <Edit2 className="w-4 h-4 mr-1" /> Edit
                </button>
              )}
            </div>

            {isEditingTeam ? (
              <div className="space-y-3">
                {/* Dynamically Populated & Secured Dropdowns */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                    Developer {isCommand ? null : <Lock className="w-3 h-3 text-gray-400" />}
                  </label>
                  {isCommand ? (
                    <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed bg-white" value={teamForm.developer} onChange={e => setTeamForm({...teamForm, developer: e.target.value})}>
                      <option value="">Unassigned</option>
                      {developers.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                  ) : (
                    <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-500 cursor-not-allowed select-none" title="Manager clearance required to assign staff">
                      {website.developer || "Unassigned"}
                      <Lock className="h-4 w-4 text-slate-400 ml-auto" />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                    Content Writer {isCommand ? null : <Lock className="w-3 h-3 text-gray-400" />}
                  </label>
                  {isCommand ? (
                    <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed bg-white" value={teamForm.content_writer} onChange={e => setTeamForm({...teamForm, content_writer: e.target.value})}>
                      <option value="">Unassigned</option>
                      {writers.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                    </select>
                  ) : (
                    <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-500 cursor-not-allowed select-none" title="Manager clearance required to assign staff">
                      {website.content_writer || "Unassigned"}
                      <Lock className="h-4 w-4 text-slate-400 ml-auto" />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                    SEO Person {isCommand ? null : <Lock className="w-3 h-3 text-gray-400" />}
                  </label>
                  {isCommand ? (
                    <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed bg-white" value={teamForm.seo_person} onChange={e => setTeamForm({...teamForm, seo_person: e.target.value})}>
                      <option value="">Unassigned</option>
                      {seos.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                  ) : (
                    <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-500 cursor-not-allowed select-none" title="Manager clearance required to assign staff">
                      {website.seo_person || "Unassigned"}
                      <Lock className="h-4 w-4 text-slate-400 ml-auto" />
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                    <SecureStatusDropdown site={website} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                      Priority {role === "user" && <Lock className="w-3 h-3 text-gray-400" />}
                    </label>
                    <select disabled={role === "user"} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed bg-white" value={teamForm.priority} onChange={e => setTeamForm({...teamForm, priority: e.target.value})}>
                      <option value="Low">Low</option><option value="Normal">Normal</option><option value="High">High</option><option value="Urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={handleSaveTeam} className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">Save</button>
                  <button onClick={() => { setIsEditingTeam(false); setTeamForm({ developer: website.developer || "", content_writer: website.content_writer || "", seo_person: website.seo_person || "", status: website.status || "Pending", priority: website.priority || "Normal" }); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="text-xs text-gray-500 mb-1">Developer</div>
                    <div className="text-sm font-medium text-gray-800">{website.developer || "Unassigned"}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="text-xs text-gray-500 mb-1">Content</div>
                    <div className="text-sm font-medium text-gray-800">{website.content_writer || "Unassigned"}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="text-xs text-gray-500 mb-1">SEO</div>
                    <div className="text-sm font-medium text-gray-800">{website.seo_person || "Unassigned"}</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-200/60">{website.status || "Pages Development"}</span>
                  <span className="px-3 py-1 bg-gray-50 text-gray-700 text-xs font-medium rounded-full border border-gray-200/60">{website.priority || "Normal"}</span>
                </div>
              </div>
            )}
          </div>

          {/* CREDENTIALS BOX */}
          <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-gray-200/60">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="p-2 bg-amber-100 text-amber-600 rounded-lg mr-3"><Key className="w-5 h-5" /></div>
                <h2 className="text-xl font-semibold">Website Credentials</h2>
              </div>
              {(hasCreds && !isEditingCreds) && (
                <button onClick={() => setIsEditingCreds(true)} className="text-sm text-gray-500 hover:text-blue-600 flex items-center">
                  <Edit2 className="w-4 h-4 mr-1" /> Edit
                </button>
              )}
            </div>

            {!hasCreds && !isEditingCreds ? (
              <div className="text-center py-6 bg-gray-50/50 rounded-xl border border-gray-100">
                <p className="text-gray-500 mb-3 text-sm">No credentials saved yet.</p>
                <button onClick={() => setIsEditingCreds(true)} className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors">
                  Add Credentials
                </button>
              </div>
            ) : isEditingCreds ? (
              <div className="space-y-3">
                <input type="text" placeholder="Admin Login URL" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" value={credsForm.loginUrl} onChange={e => setCredsForm({...credsForm, loginUrl: e.target.value})} />
                <input type="text" placeholder="Username" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" value={credsForm.username} onChange={e => setCredsForm({...credsForm, username: e.target.value})} />
                <input type="text" placeholder="Password" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" value={credsForm.password} onChange={e => setCredsForm({...credsForm, password: e.target.value})} />
                <div className="flex gap-2 pt-2">
                  <button onClick={handleSaveCreds} className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600">Save Credentials</button>
                  <button onClick={() => { setIsEditingCreds(false); setCredsForm({ loginUrl: currentCreds.loginUrl || "", username: currentCreds.username || "", password: currentCreds.password || "" }); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div onClick={() => handleCopy(currentCreds.loginUrl, 'url')} className="group flex items-center p-3 rounded-xl border border-gray-100 bg-white/50 cursor-pointer hover:border-amber-200 hover:shadow-sm transition-all">
                  <Globe className="w-5 h-5 text-gray-400 mr-3" />
                  <div className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-gray-700">{currentCreds.loginUrl || "N/A"}</div>
                  {copiedId === 'url' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100" />}
                </div>
                <div onClick={() => handleCopy(currentCreds.username, 'user')} className="group flex items-center p-3 rounded-xl border border-gray-100 bg-white/50 cursor-pointer hover:border-amber-200 hover:shadow-sm transition-all">
                  <User className="w-5 h-5 text-gray-400 mr-3" />
                  <div className="flex-1 text-gray-700">{currentCreds.username || "N/A"}</div>
                  {copiedId === 'user' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100" />}
                </div>
                <div onClick={() => handleCopy(currentCreds.password, 'pass')} className="group flex items-center p-3 rounded-xl border border-gray-100 bg-white/50 cursor-pointer hover:border-amber-200 hover:shadow-sm transition-all">
                  <Lock className="w-5 h-5 text-gray-400 mr-3" />
                  <div className="flex-1 text-gray-700">{currentCreds.password ? "••••••••••••••••" : "N/A"}</div>
                  {copiedId === 'pass' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100" />}
                </div>
              </div>
            )}
          </div>

          {/* NOTES TABLE / BOX */}
          <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-gray-200/60 flex-grow flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg mr-3"><FileText className="w-5 h-5" /></div>
                <h2 className="text-xl font-semibold">Notes & Details</h2>
              </div>
              {!isEditingNotes && (
                <button onClick={() => setIsEditingNotes(true)} className="text-sm text-gray-500 hover:text-emerald-600 flex items-center">
                  <Edit2 className="w-4 h-4 mr-1" /> Edit
                </button>
              )}
            </div>
            
            {isEditingNotes ? (
              <div className="flex flex-col h-full">
                <textarea className="w-full flex-grow min-h-[150px] p-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none mb-3 resize-none" placeholder="Enter notes, server details, client requests..." value={notesForm} onChange={(e) => setNotesForm(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={handleSaveNotes} className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600">Save Notes</button>
                  <button onClick={() => { setNotesForm(website.notes || ""); setIsEditingNotes(false); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Cancel</button>
                </div>
              </div>
            ) : (
              <div onClick={() => setIsEditingNotes(true)} className="flex-grow p-4 bg-gray-50/50 rounded-xl border border-gray-100 whitespace-pre-wrap text-sm text-gray-700 min-h-[150px] cursor-pointer hover:border-emerald-200 transition-colors">
                {website.notes ? website.notes : <span className="text-gray-400 italic">No notes added yet. Click here to add some.</span>}
              </div>
            )}
          </div>

        </div>
      </div>
    </main>
  );
}
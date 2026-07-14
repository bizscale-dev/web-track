"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Key, FileText, Save, Building, Users } from "lucide-react";
import { triggerN8nWebhook } from "@/app/actions";
import { useAuth } from "@/components/AuthProvider";

function parsePagesAndNotes(notesText: string, domain: string | null) {
  const baseUrl = domain 
    ? (domain.startsWith('http') ? domain : `https://${domain}`).replace(/\/$/, "")
    : "https://example.com";

  const lines = notesText.split('\n');
  const pages: { title: string; url: string }[] = [];
  const remainingNotesLines: string[] = [];
  let collecting = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    const lowerLine = line.toLowerCase();
    const isHeader = 
      lowerLine.startsWith('pages') || 
      lowerLine.startsWith('sub service') || 
      lowerLine.startsWith('sub-service') || 
      lowerLine.startsWith('sub services') || 
      lowerLine.startsWith('sub-services') || 
      lowerLine.startsWith('sub areas') || 
      lowerLine.startsWith('sub-areas');

    if (isHeader) {
      collecting = true;
      continue;
    }

    if (collecting) {
      const hasColon = line.includes(':') && !line.startsWith('http:') && !line.startsWith('https:');
      const isStopTrigger = line.startsWith('(') || line.startsWith('https://') || line.startsWith('http://') || hasColon;

      if (isStopTrigger) {
        collecting = false;
      } else if (line !== "") {
        let slug = line.toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '') 
          .trim()
          .replace(/\s+/g, '-'); 

        const isHome = slug === 'home';
        const pageUrl = isHome ? baseUrl : `${baseUrl}/${slug}`;

        pages.push({
          title: line,
          url: pageUrl
        });
        continue;
      } else {
        continue;
      }
    }

    remainingNotesLines.push(rawLine);
  }

  const remainingNotes = remainingNotesLines.join('\n').trim().replace(/\n{3,}/g, '\n\n');

  return { pages, remainingNotes };
}

export default function AddWebsitePage() {
  const router = useRouter();
  const { name } = useAuth(); // Extracted name to send to webhook
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teamMembers, setTeamMembers] = useState<{ name: string; role: string }[]>([]);

  const [formData, setFormData] = useState({
    website_name: "",
    domain: "",
    loginUrl: "",
    username: "",
    password: "",
    notes: "",
    developer: "",
    content_writer: "",
    seo_person: "",
    priority: "Normal",
  });

  useEffect(() => {
    async function fetchTeam() {
      const { data, error } = await supabase.from("team_members").select("name, role");
      if (error) console.error("Error fetching team:", error);
      if (data) {
        setTeamMembers(data);
      }
    }
    fetchTeam();
  }, []);

  const developers = teamMembers.filter((m) => m.role === "developer");
  const contentWriters = teamMembers.filter((m) => m.role === "content_writer");
  const seoPersons = teamMembers.filter((m) => m.role === "seo_person");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    if (!formData.website_name || !formData.domain) {
      alert("Please fill in the required fields (Business Name and Website URL).");
      return;
    }

    setIsSubmitting(true);

    const credentials = {
      loginUrl: formData.loginUrl,
      username: formData.username,
      password: formData.password,
    };

    const { pages, remainingNotes } = parsePagesAndNotes(formData.notes, formData.domain);

    const newWebsite = {
      website_name: formData.website_name,
      domain: formData.domain,
      credentials: JSON.stringify(credentials),
      notes: remainingNotes,
      status: "Pending",
      priority: formData.priority,
      developer: formData.developer || null,
      content_writer: formData.content_writer || null,
      seo_person: formData.seo_person || null,
    };

    const { data, error } = await supabase
      .from("websites")
      .insert([newWebsite])
      .select()
      .single();

    if (error) {
      alert("Error adding website: " + error.message);
      console.error(error);
      setIsSubmitting(false);
      return;
    }

    if (data) {
      if (pages.length > 0) {
        const tasksToInsert = pages.map(p => ({
          website_id: data.id,
          title: p.title,
          url: p.url,
          is_completed: false
        }));

        const { error: tasksError } = await supabase
          .from("website_tasks")
          .insert(tasksToInsert);
          
        if (tasksError) {
          console.error("Error inserting tasks:", tasksError);
        }
      }

      await supabase.from("website_activity_logs").insert({
        website_id: data.id,
        event_type: "Website Created",
        message: `New website '${data.website_name}' added with status 'Pending'.`,
        new_value: "Pending",
      });

      // UPGRADED: Satisfying the strict TypeScript webhook requirements
      triggerN8nWebhook({
        event: 'website_created',
        websiteName: data.website_name,
        domain: data.domain,
        oldStatus: "None", // Passed as string instead of null
        newStatus: 'Pending',
        websiteId: data.id, // Injected ID
        changedBy: name || "System Operator", // Injected Operator Name
      }).catch(err => console.error("Server action failed:", err));

      router.push(`/websites/${data.id}`);
    }
  };

  const inputCls =
    "w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none";
  const selectCls =
    "w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none";

  return (
    <main className="p-8 max-w-4xl mx-auto w-full">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Add New Website</h1>
        </div>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? "Saving..." : <><Save className="w-4 h-4 mr-2" /> Save Website</>}
        </button>
      </div>

      <div className="space-y-6">
        <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-gray-200/60">
          <div className="flex items-center mb-6">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg mr-3"><Building className="w-5 h-5" /></div>
            <h2 className="text-xl font-semibold">Basic Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Name *</label>
              <input type="text" name="website_name" required value={formData.website_name} onChange={handleChange} className={inputCls} placeholder="e.g. Acme Corp" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website URL *</label>
              <input type="text" name="domain" required value={formData.domain} onChange={handleChange} className={inputCls} placeholder="e.g. acme.com" />
            </div>
          </div>
        </div>

        <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-gray-200/60">
          <div className="flex items-center mb-6">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg mr-3"><Key className="w-5 h-5" /></div>
            <h2 className="text-xl font-semibold">Credentials <span className="text-gray-400 font-normal text-sm">(Optional)</span></h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Login URL</label>
              <input type="text" name="loginUrl" value={formData.loginUrl} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none" placeholder="e.g. /wp-admin" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input type="text" name="username" value={formData.username} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none" placeholder="Admin username" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="text" name="password" value={formData.password} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none" placeholder="Admin password" />
            </div>
          </div>
        </div>

        <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-gray-200/60">
          <div className="flex items-center mb-6">
            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg mr-3"><Users className="w-5 h-5" /></div>
            <h2 className="text-xl font-semibold">Team &amp; Priority <span className="text-gray-400 font-normal text-sm">(Optional)</span></h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Developer</label>
              <select name="developer" value={formData.developer} onChange={handleChange} className={selectCls}>
                <option value="">Unassigned</option>
                {developers.map((user, i) => (
                  <option key={`dev-${i}`} value={user.name}>{user.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content Writer</label>
              <select name="content_writer" value={formData.content_writer} onChange={handleChange} className={selectCls}>
                <option value="">Unassigned</option>
                {contentWriters.map((user, i) => (
                  <option key={`cw-${i}`} value={user.name}>{user.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SEO Person</label>
              <select name="seo_person" value={formData.seo_person} onChange={handleChange} className={selectCls}>
                <option value="">Unassigned</option>
                {seoPersons.map((user, i) => (
                  <option key={`seo-${i}`} value={user.name}>{user.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select name="priority" value={formData.priority} onChange={handleChange} className={selectCls}>
                <option value="Low">Low</option><option value="Normal">Normal</option><option value="High">High</option><option value="Urgent">Urgent</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-gray-200/60">
          <div className="flex items-center mb-6">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg mr-3"><FileText className="w-5 h-5" /></div>
            <h2 className="text-xl font-semibold">Notes <span className="text-gray-400 font-normal text-sm">(Optional)</span></h2>
          </div>
          <textarea name="notes" value={formData.notes} onChange={handleChange} rows={4} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none" placeholder="Any initial notes, client requests, or server details..." />
        </div>
      </div>
    </main>
  );
}
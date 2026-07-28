"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { Loader2, LifeBuoy, Clock, CheckCircle2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { dispatchCompletionNotification } from '@/app/actions';

interface SiteGroup {
  websiteId: number;
  websiteName: string;
  requirements: any[];
}

export default function GlobalRequirementsPage() {
  const { role, name } = useAuth();
  const [requirements, setRequirements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchGlobalRequirements();
  }, []);

  const fetchGlobalRequirements = async () => {
    // Fetches all requirements and joins the website name from the foreign key
    const { data, error } = await supabase
      .from('website_support_requirements')
      .select(`
        *,
        websites ( website_name )
      `)
      .order('is_completed', { ascending: true }) // Shows uncompleted first
      .order('created_at', { ascending: false });

    if (data) setRequirements(data);
    setIsLoading(false);
  };

  const siteGroups: SiteGroup[] = Object.values(
    requirements.reduce((groups: Record<number, SiteGroup>, req) => {
      const websiteId = req.website_id;
      if (!groups[websiteId]) {
        groups[websiteId] = {
          websiteId,
          websiteName: req.websites?.website_name || "Unknown Site",
          requirements: [],
        };
      }
      groups[websiteId].requirements.push(req);
      return groups;
    }, {})
  ).sort((a, b) => a.websiteName.localeCompare(b.websiteName));

  const isSupport = role === 'support';
  const canCheck = role === 'support' || role === 'admin';

  const toggleCompletion = async (id: string, currentStatus: boolean, websiteId: number, reqTitle: string) => {
    if (!canCheck) return;

    const now = new Date().toISOString();
    const newStatus = !currentStatus;
    
    const updatePayload = {
      is_completed: newStatus,
      completed_by_name: newStatus ? name : null,
      completed_at: newStatus ? now : null
    };

    // Optimistic Update
    setRequirements(requirements.map(r => r.id === id ? { ...r, ...updatePayload } : r));

    // Database Update
    await supabase.from('website_support_requirements').update(updatePayload).eq('id', id);

    // If it was just checked as completed, fire the webhook to notify admins/managers!
    if (newStatus === true) {
      dispatchCompletionNotification(websiteId, reqTitle, name || "Support Team");
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  if (!isSupport && role !== 'admin') {
    return (
      <div className="p-10 max-w-2xl mx-auto text-center mt-20 bg-rose-50 border border-rose-100 rounded-2xl">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Clearance Required</h1>
        <p className="text-gray-600">Only Support personnel can access the Global Requirements board.</p>
      </div>
    );
  }

  return (
    <main className="p-8 max-w-7xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-blue-600 text-white rounded-xl shadow-sm">
          <LifeBuoy className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Global Requirements</h1>
          <p className="text-gray-500 text-sm mt-1">Master support queue across all active websites.</p>
        </div>
      </div>

      {requirements.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <p className="text-center text-gray-500 py-10">No support requirements exist in the entire system.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {siteGroups.map((group) => {
            const pendingCount = group.requirements.filter((r) => !r.is_completed).length;
            return (
              <div key={group.websiteId} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/60">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-gray-900">{group.websiteName}</h2>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${pendingCount > 0 ? 'text-blue-600 bg-blue-50' : 'text-emerald-600 bg-emerald-50'}`}>
                      {pendingCount > 0 ? `${pendingCount} Pending` : 'All Completed'}
                    </span>
                  </div>
                  <Link href={`/website/${group.websiteId}`} className="text-xs text-gray-400 hover:text-blue-600 hover:underline">
                    View CRM ↗
                  </Link>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50/80 text-gray-600 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 font-medium w-10"></th>
                        <th className="px-4 py-3 font-medium">Requirement</th>
                        <th className="px-4 py-3 font-medium">Requested By</th>
                        <th className="px-4 py-3 font-medium">Completed By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.requirements.map((req) => (
                        <tr key={req.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={req.is_completed}
                              onChange={() => toggleCompletion(req.id, req.is_completed, req.website_id, req.title)}
                              disabled={!canCheck}
                              className={`w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${!canCheck ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                            />
                          </td>
                          <td className={`px-4 py-3 font-medium ${req.is_completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                            {req.title}
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            <div className="flex items-center gap-1.5 text-xs">
                              <Clock className="w-3 h-3" />
                              {req.created_by_name}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {req.is_completed && req.completed_by_name ? (
                              <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                                <CheckCircle2 className="w-3 h-3" />
                                {req.completed_by_name}
                              </div>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
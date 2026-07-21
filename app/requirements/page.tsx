"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { Loader2, LifeBuoy, Clock, CheckCircle2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { dispatchCompletionNotification } from '@/app/actions';

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

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        {requirements.length === 0 ? (
          <p className="text-center text-gray-500 py-10">No support requirements exist in the entire system.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {requirements.map((req) => (
              <div key={req.id} className={`p-4 rounded-xl border transition-all ${req.is_completed ? 'bg-gray-50 border-gray-200' : 'bg-white border-blue-200 shadow-sm hover:border-blue-400'}`}>
                
                <div className="flex justify-between items-start mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-1 rounded">
                    {req.websites?.website_name || "Unknown Site"}
                  </span>
                  <Link href={`/website/${req.website_id}`} className="text-[10px] text-gray-400 hover:text-blue-600 hover:underline">
                    View CRM ↗
                  </Link>
                </div>

                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={req.is_completed}
                    onChange={() => toggleCompletion(req.id, req.is_completed, req.website_id, req.title)}
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <div>
                    <h3 className={`text-sm font-bold mb-2 ${req.is_completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {req.title}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-medium">
                      <Clock className="w-3 h-3" />
                      Requested by {req.created_by_name}
                    </div>
                    {req.is_completed && req.completed_by_name && (
                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-medium mt-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Completed by {req.completed_by_name}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
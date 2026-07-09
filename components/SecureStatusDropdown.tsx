'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { triggerN8nWebhook } from '@/app/actions';

export default function SecureStatusDropdown({ site }: { site: any }) {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleStatusChange = async (newStatus: string) => {
    const operatorEmail = session?.user?.email || "Unknown User";
    
    // Fire the webhook with the identity attached
    await triggerN8nWebhook({
      event: 'status_update',
      websiteName: site.website_name || site.name,
      domain: site.domain || null,
      oldStatus: site.status,
      newStatus: newStatus,
      websiteId: site.id,
      changedBy: operatorEmail
    });
  };

  // If no active session, render the locked vault badge
  if (!session) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 text-gray-700 border border-gray-200 rounded-md text-sm font-semibold select-none cursor-not-allowed w-max">
        {site.status} 
        <span title="Login required to change status">🔒</span>
      </div>
    );
  }

  // If authenticated, render the fully operational dropdown
  return (
    <select 
      defaultValue={site.status}
      onChange={(e) => handleStatusChange(e.target.value)}
      className="border border-gray-200 rounded-md px-3 py-1 text-sm bg-white focus:ring-2 focus:ring-blue-500 cursor-pointer"
    >
      <option value="Pending">Pending</option>
      <option value="Pages Development">Pages Development</option>
      <option value="Sent For Content">Sent For Content</option>
      <option value="Content Completed">Content Completed</option>
      <option value="Content Updated">Content Updated</option>
      <option value="Domain Connection">Domain Connection</option>
      <option value="Completed">Completed</option>
      <option value="Initial SEO">Initial SEO</option>
    </select>
  );
}

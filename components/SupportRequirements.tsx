"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { dispatchCompletionNotification } from '@/app/actions';
import { LifeBuoy, Plus, Loader2, Trash2, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';

interface SupportItem {
  id: string;
  title: string;
  is_completed: boolean;
  created_by_name: string;
  created_at: string;
  completed_by_name: string | null;
  completed_at: string | null;
}

export default function SupportRequirements({ websiteId }: { websiteId: number }) {
  const [items, setItems] = useState<SupportItem[]>([]);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ name: string; role: string } | null>(null);

  useEffect(() => {
    fetchUserAndRequirements();
  }, [websiteId]);

  const fetchUserAndRequirements = async () => {
    setIsLoading(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (user && user.email) {
      const { data: teamMember } = await supabase
        .from('team_members')
        .select('name, role')
        .eq('email', user.email)
        .single();
      if (teamMember) setCurrentUser(teamMember);
    }

    const { data, error } = await supabase
      .from('website_support_requirements')
      .select('*')
      .eq('website_id', websiteId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setItems(data);
    }
    setIsLoading(false);
  };

  const userRole = currentUser?.role?.toLowerCase() || "";
  const canAdd = ['admin', 'manager', 'developer', 'support', 'seo person', 'content writer'].includes(userRole);
  const canCheck = userRole === 'support' || userRole === 'admin';

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemTitle.trim() || !canAdd || !currentUser) return;
    
    setIsAdding(true);
    const { data, error } = await supabase
      .from('website_support_requirements')
      .insert([{ 
        website_id: websiteId, 
        title: newItemTitle.trim(), 
        is_completed: false,
        created_by_name: currentUser.name 
      }])
      .select()
      .single();

    if (!error && data) {
      setItems([...items, data]);
      setNewItemTitle("");
    }
    setIsAdding(false);
  };

  const toggleCompletion = async (id: string, currentStatus: boolean) => {
    if (!canCheck || !currentUser) return;

    const now = new Date().toISOString();
    const newStatus = !currentStatus;
    
    const updatePayload = {
      is_completed: newStatus,
      completed_by_name: newStatus ? currentUser.name : null,
      completed_at: newStatus ? now : null
    };

    // Optimistic Update
    setItems(items.map(item => item.id === id ? { ...item, ...updatePayload } : item));

    const { error } = await supabase
      .from('website_support_requirements')
      .update(updatePayload)
      .eq('id', id);
      
    if (error) {
      // Revert if database fails...
      setItems(items.map(item => item.id === id ? { 
        ...item, 
        is_completed: currentStatus,
        completed_by_name: item.completed_by_name,
        completed_at: item.completed_at
      } : item));
      console.error("Failed to update status:", error);
    }
    else if (newStatus === true) {
      // Find the specific item so we can grab its title for the notification
      const targetItem = items.find(i => i.id === id);
      if (targetItem) {
        dispatchCompletionNotification(websiteId, targetItem.title, currentUser.name);
      }
    }
  };

  const deleteItem = async (id: string) => {
    if (!canAdd) return; 
    setItems(items.filter(item => item.id !== id));
    await supabase.from('website_support_requirements').delete().eq('id', id);
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-gray-200/60 flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-gray-200/60 flex-grow flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg mr-3">
            <LifeBuoy className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Support Requirements</h2>
        </div>
        
        {!canCheck && canAdd && (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-600 px-2 py-1 rounded border border-amber-200/50">
            <ShieldAlert className="w-3 h-3" /> Add Only Mode
          </span>
        )}
      </div>

      <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto scrollbar-thin pr-2">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No support requirements added yet.</p>
        ) : (
          items.map((item) => (
            <div 
              key={item.id} 
              className={`flex items-start gap-3 p-3 rounded-xl border transition-all group ${
                item.is_completed 
                  ? "bg-gray-50/50 border-gray-100" 
                  : "bg-white border-gray-200 hover:border-blue-300 shadow-sm"
              }`}
            >
              <div title={!canCheck ? "Only Support can mark this as complete" : ""}>
                <input
                  type="checkbox"
                  checked={item.is_completed}
                  onChange={() => toggleCompletion(item.id, item.is_completed)}
                  disabled={!canCheck}
                  className={`mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-colors ${
                    !canCheck ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium mb-1 ${item.is_completed ? "text-gray-400 line-through" : "text-gray-800"}`}>
                  {item.title}
                </p>
                
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium">
                    <Clock className="w-3 h-3" />
                    <span>Requested by <span className="text-gray-600">{item.created_by_name}</span> on {formatTime(item.created_at)}</span>
                  </div>
                  
                  {item.is_completed && item.completed_by_name && item.completed_at && (
                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-600/80 font-medium mt-0.5">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Completed by <span className="text-emerald-700">{item.completed_by_name}</span> on {formatTime(item.completed_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              {canAdd && (
                <button
                  onClick={() => deleteItem(item.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {canAdd && (
        <form onSubmit={addItem} className="flex gap-2 mt-auto p-3 bg-gray-50/50 border border-gray-100 rounded-xl">
          <input
            type="text"
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
            placeholder="Add a new requirement..."
            className="flex-1 min-w-0 px-3 py-2 text-sm bg-white border border-gray-200 text-gray-900 placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            disabled={isAdding}
          />
          <button
            type="submit"
            disabled={!newItemTitle.trim() || isAdding}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors flex items-center justify-center shrink-0"
          >
            {isAdding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          </button>
        </form>
      )}
    </div>
  );
}
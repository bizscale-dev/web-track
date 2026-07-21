"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

interface AppNotification {
  id: string;
  message: string;
  link_url: string;
  is_read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const { role } = useAuth(); 
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Only Admin, Manager, and Developer get the bell
  const showBell = ['admin', 'manager', 'developer'].includes(role || '');

  useEffect(() => {
    if (!showBell) return;

    const setupNotifications = async () => {
      const { data: { user: supabaseUser } } = await supabase.auth.getUser();
      
      if (!supabaseUser?.email) return;
      setUserEmail(supabaseUser.email);

      const { data } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('user_email', supabaseUser.email)
        .order('created_at', { ascending: false })
        .limit(20); 
      
      if (data) setNotifications(data);
    };

    setupNotifications();

    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showBell]);

  if (!showBell) return null;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAsRead = async (id: string) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
    await supabase.from('user_notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllAsRead = async () => {
    if (!userEmail) return;
    setNotifications(notifications.map(n => ({ ...n, is_read: true })));
    await supabase.from('user_notifications').update({ is_read: true }).eq('user_email', userEmail).eq('is_read', false);
  };

  // THE NEW CLICK HANDLER: Redirects, marks read, and closes dropdown
  const handleNotificationClick = (notif: AppNotification) => {
    if (!notif.is_read) {
      markAsRead(notif.id);
    }
    setIsOpen(false);
    if (notif.link_url) {
      router.push(notif.link_url);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-full transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-white rounded-full"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50">
          <div className="p-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-sm text-gray-800">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="text-[10px] text-blue-600 font-bold hover:underline">
                Mark all read
              </button>
            )}
          </div>
          
          <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">No notifications yet.</div>
            ) : (
              notifications.map(notif => (
                <div 
                  key={notif.id} 
                  className={`p-3 border-b border-gray-100 transition-colors hover:bg-gray-50 ${notif.is_read ? 'bg-white opacity-60' : 'bg-blue-50/30'}`}
                >
                  {/* Clickable Area for Redirection */}
                  <div 
                    onClick={() => handleNotificationClick(notif)} 
                    className="block cursor-pointer"
                  >
                    <p className={`text-xs ${notif.is_read ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>
                      {notif.message}
                    </p>
                    <span className="text-[9px] text-gray-400 mt-1 block">
                      {new Date(notif.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  
                  {/* Standalone Mark as Read Action */}
                  {!notif.is_read && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation(); // Prevents the redirect when just clicking the button
                        markAsRead(notif.id);
                      }} 
                      className="mt-2 text-[10px] flex items-center gap-1 text-blue-600 hover:text-blue-800 relative z-10"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Mark as read
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
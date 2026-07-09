'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function WebsiteDetailClient({ website, initialTasks, initialActivities }: any) {
  const router = useRouter();

  // Parse credentials securely
  let initialCreds = { loginUrl: '', username: '', password: '' };
  try {
    if (website.credentials) {
      const parsed = JSON.parse(website.credentials);
      if (typeof parsed === 'object') initialCreds = { ...initialCreds, ...parsed };
    }
  } catch (e) {} // Fallback for legacy empty or plain-text creds

  // Initialize state so we can perform optimistic UI updates later
  const [tasks, setTasks] = useState(initialTasks || []);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newPageUrl, setNewPageUrl] = useState('');
  const [notes, setNotes] = useState(website.notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  
  const [creds, setCreds] = useState(initialCreds);
  const [isEditingCreds, setIsEditingCreds] = useState(false);
  const [isSavingCreds, setIsSavingCreds] = useState(false);
  const [copiedField, setCopiedField] = useState('');
  
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');

  // 1. Fetch tasks directly from Supabase to completely bypass Next.js caching
  useEffect(() => {
    const fetchTasks = async () => {
      const { data, error } = await supabase
        .from('website_tasks')
        .select('*')
        .eq('website_id', website.id)
        .order('created_at', { ascending: true });
      
      if (!error && data) {
        setTasks(data);
      } else if (initialTasks) {
        setTasks(initialTasks);
      }
    };
    fetchTasks();
  }, [website.id, initialTasks]);

  useEffect(() => {
    setNotes(website.notes || '');
    try {
      if (website.credentials) {
        const parsed = JSON.parse(website.credentials);
        if (typeof parsed === 'object') {
          setCreds(current => ({ ...current, ...parsed }));
        }
      }
    } catch (e) {}
  }, [website.notes, website.credentials]);

  // 2. Force Next.js to fetch fresh data every time you visit this page 
  // (Bypasses the aggressive Next.js Client-Side Router Cache)
  useEffect(() => {
    router.refresh();
  }, [router]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const formattedUrl = newPageUrl.trim() 
      ? (/^https?:\/\//i.test(newPageUrl.trim()) ? newPageUrl.trim() : `https://${newPageUrl.trim()}`) 
      : '';

    const tempId = crypto.randomUUID(); // Temporary ID for optimistic update
    const newTask = {
      id: tempId,
      website_id: website.id,
      title: newTaskTitle,
      url: formattedUrl,
    };

    setTasks([...tasks, newTask]);
    setNewTaskTitle('');
    setNewPageUrl('');

    const { data, error } = await supabase
      .from('website_tasks')
      .insert({ website_id: website.id, title: newTask.title, url: newTask.url })
      .select()
      .single();

    if (error) {
      console.error('Failed to add task:', error);
      alert(`Failed to add page: ${error.message}`);
      setTasks(tasks.filter((t: any) => t.id !== tempId)); // Revert on failure
    } else {
      // Swap temp ID with actual DB ID silently
      setTasks((current: any) => current.map((t: any) => (t.id === tempId ? data : t)));
      router.refresh();
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    // Optimistic remove
    const previousTasks = [...tasks];
    setTasks(tasks.filter((t: any) => t.id !== taskId));

    const { error } = await supabase.from('website_tasks').delete().eq('id', taskId);

    if (error) {
      console.error('Failed to delete page:', error);
      alert(`Failed to delete page: ${error.message}`);
      setTasks(previousTasks); // Revert on failure
    } else {
      router.refresh();
    }
  };

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    const { error } = await supabase.from('websites').update({ notes }).eq('id', website.id);
    setIsSavingNotes(false);
    if (error) alert(`Failed to save notes: ${error.message}`);
    else router.refresh();
  };

  const handleSaveCredentials = async () => {
    setIsSavingCreds(true);
    const { error } = await supabase.from('websites').update({ credentials: JSON.stringify(creds) }).eq('id', website.id);
    setIsSavingCreds(false);
    if (error) alert(`Failed to save credentials: ${error.message}`);
    else {
      setIsEditingCreds(false);
      router.refresh();
    }
  };

  const handleCopy = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  };

  const startEditing = (task: any) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditUrl(task.url || '');
  };

  const handleSaveEdit = async (taskId: string) => {
    const formattedUrl = editUrl.trim() 
      ? (/^https?:\/\//i.test(editUrl.trim()) ? editUrl.trim() : `https://${editUrl.trim()}`) 
      : '';

    const previousTasks = [...tasks];
    setTasks(tasks.map((t: any) => (t.id === taskId ? { ...t, title: editTitle, url: formattedUrl } : t)));
    setEditingTaskId(null);

    const { error } = await supabase.from('website_tasks').update({ title: editTitle, url: formattedUrl }).eq('id', taskId);

    if (error) {
      console.error('Failed to update page:', error);
      alert(`Failed to update page: ${error.message}`);
      setTasks(previousTasks); // Revert on failure
    } else {
      router.refresh();
    }
  };

  const handleAddDefaultPages = async () => {
    const baseDomain = website.domain ? (website.domain.startsWith('http') ? website.domain : `https://${website.domain}`) : '';
    const defaultPages = [
      { title: 'Home', path: '' },
      { title: 'About', path: '/about' },
      { title: 'Contact Us', path: '/contact-us' },
      { title: 'Services', path: '/services' },
      { title: 'Single Service', path: '/single-service' },
      { title: 'Areas Served', path: '/areas-served' },
      { title: 'Single Area', path: '/single-area' },
    ];

    const newTasks = defaultPages.map(page => ({
      id: crypto.randomUUID(),
      website_id: website.id,
      title: page.title,
      url: baseDomain ? `${baseDomain}${page.path}` : '',
    }));

    const previousTasks = [...tasks];
    setTasks([...tasks, ...newTasks]);

    const { error } = await supabase.from('website_tasks').insert(newTasks.map(t => ({ website_id: t.website_id, title: t.title, url: t.url })));

    if (error) {
      console.error('Failed to add default pages:', error);
      alert(`Failed to add default pages: ${error.message}`);
      setTasks(previousTasks);
    } else {
      router.refresh();
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <header className="border-b border-gray-200 pb-4">
        <h1 className="text-3xl font-bold text-gray-900">{website.website_name}</h1>
        <p className="text-gray-500 mt-1">{website.domain} • Status: {website.status}</p>
      </header>

      {/* Two-Column Layout (Pages Main Focus, Info Sidebar) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Pages Tracker (Main Highlight - 2 Columns Wide) */}
        <div className="lg:col-span-2 space-y-6 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
               <h2 className="text-xl font-semibold">Pages Tracker</h2>
               <button onClick={handleAddDefaultPages} type="button" className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1.5 rounded-md font-semibold transition-colors">
                 + Add Default Pages
               </button>
             </div>
             
             <div className="space-y-4">
               <form onSubmit={handleAddTask} className="flex flex-col gap-2">
                 <div className="flex gap-2">
                   <input 
                     type="text" 
                     value={newTaskTitle}
                     onChange={(e) => setNewTaskTitle(e.target.value)}
                     placeholder="Page Name (e.g. Home)"
                     className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 outline-none"
                     required
                   />
                   <input 
                     type="text" 
                     value={newPageUrl}
                     onChange={(e) => setNewPageUrl(e.target.value)}
                     placeholder="URL (optional)"
                     className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 outline-none"
                   />
                   <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">
                     Add
                   </button>
                 </div>
               </form>
  
               <div className="space-y-2">
                 {tasks.map((task: any) => (
                   <div key={task.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors border border-gray-200">
                     {editingTaskId === task.id ? (
                       <div className="flex flex-col gap-2 w-full min-w-0">
                         <input 
                           type="text" 
                           value={editTitle} 
                           onChange={(e) => setEditTitle(e.target.value)} 
                           className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-blue-500 outline-none" 
                         />
                         <input 
                           type="text" 
                           value={editUrl} 
                           onChange={(e) => setEditUrl(e.target.value)} 
                           className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-blue-500 outline-none" 
                         />
                         <div className="flex gap-2 justify-end mt-1 shrink-0">
                           <button onClick={() => setEditingTaskId(null)} className="text-xs font-semibold px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded">Cancel</button>
                           <button onClick={() => handleSaveEdit(task.id)} className="text-xs text-white font-semibold px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded">Save</button>
                         </div>
                       </div>
                     ) : (
                       <>
                         <div className="flex flex-col min-w-0 flex-1">
                           <span className="text-sm font-medium text-gray-900 truncate">{task.title}</span>
                           {task.url && (
                             <a href={task.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mt-0.5 truncate block">
                               {task.url}
                             </a>
                           )}
                         </div>
                         <div className="flex flex-col sm:flex-row gap-2 shrink-0 ml-2">
                           <button onClick={() => startEditing(task)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded transition-colors">Edit</button>
                           <button onClick={() => handleDeleteTask(task.id)} className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 bg-red-50 hover:bg-red-100 rounded transition-colors" type="button">Remove</button>
                         </div>
                       </>
                     )}
                   </div>
                 ))}
               </div>
             </div>
        </div>

        {/* Website Info Sidebar (Right Column) */}
        <div className="lg:col-span-1 space-y-6 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
           <h2 className="text-xl font-semibold">Website Info</h2>
           
           {/* Credentials Section */}
           <div className="space-y-3 mt-4">
             <div className="flex justify-between items-center">
               <h3 className="text-sm font-semibold text-gray-700">Site Credentials</h3>
               <button onClick={() => setIsEditingCreds(!isEditingCreds)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                 {isEditingCreds ? 'Cancel' : 'Edit'}
               </button>
             </div>
             
             {isEditingCreds ? (
               <div className="space-y-2">
                 <input value={creds.loginUrl} onChange={e => setCreds({...creds, loginUrl: e.target.value})} placeholder="Login URL" className="w-full text-sm p-2 border border-gray-300 rounded-md focus:ring-blue-500 outline-none" />
                 <input value={creds.username} onChange={e => setCreds({...creds, username: e.target.value})} placeholder="Username" className="w-full text-sm p-2 border border-gray-300 rounded-md focus:ring-blue-500 outline-none" />
                 <input value={creds.password} onChange={e => setCreds({...creds, password: e.target.value})} placeholder="Password" type="text" className="w-full text-sm p-2 border border-gray-300 rounded-md focus:ring-blue-500 outline-none" />
                 <button onClick={handleSaveCredentials} disabled={isSavingCreds} className="w-full bg-gray-900 text-white p-2 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 mt-1">
                   {isSavingCreds ? 'Saving...' : 'Save Credentials'}
                 </button>
               </div>
             ) : (
               <div className="space-y-2">
                 <div onClick={() => handleCopy(creds.loginUrl, 'url')} className="relative cursor-pointer p-2 bg-gray-50 border border-gray-200 rounded-md text-sm hover:bg-gray-100 truncate group transition-colors" title="Click to copy">
                   <span className="font-semibold text-gray-600">URL: </span>{creds.loginUrl || <span className="italic text-gray-400">Not set</span>}
                   {copiedField === 'url' && <span className="absolute right-2 top-2 text-xs text-green-600 font-bold">Copied!</span>}
                 </div>
                 <div onClick={() => handleCopy(creds.username, 'user')} className="relative cursor-pointer p-2 bg-gray-50 border border-gray-200 rounded-md text-sm hover:bg-gray-100 truncate group transition-colors" title="Click to copy">
                   <span className="font-semibold text-gray-600">User: </span>{creds.username || <span className="italic text-gray-400">Not set</span>}
                   {copiedField === 'user' && <span className="absolute right-2 top-2 text-xs text-green-600 font-bold">Copied!</span>}
                 </div>
                 <div onClick={() => handleCopy(creds.password, 'pass')} className="relative cursor-pointer p-2 bg-gray-50 border border-gray-200 rounded-md text-sm hover:bg-gray-100 truncate group transition-colors" title="Click to copy">
                   <span className="font-semibold text-gray-600">Pass: </span>{creds.password || <span className="italic text-gray-400">Not set</span>}
                   {copiedField === 'pass' && <span className="absolute right-2 top-2 text-xs text-green-600 font-bold">Copied!</span>}
                 </div>
               </div>
             )}
           </div>

           {/* Notes Section */}
           <div className="space-y-3 mt-8 border-t border-gray-100 pt-6">
             <h3 className="text-sm font-semibold text-gray-700">General Notes</h3>
             <textarea 
               value={notes}
               onChange={(e) => setNotes(e.target.value)}
               placeholder="Add notes, server details, or client requests here..."
               className="w-full h-64 border border-gray-300 rounded-md p-3 text-sm focus:ring-blue-500 focus:border-blue-500 outline-none relative z-10 bg-white"
             />
             <div className="flex justify-end">
               <button 
                 onClick={handleSaveNotes} 
                 disabled={isSavingNotes}
                 className="bg-gray-900 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
               >
                 {isSavingNotes ? 'Saving...' : 'Save Notes'}
               </button>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}

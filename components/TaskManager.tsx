"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type TaskCompletion = { name: string; email: string; completedAt: string };
type Task = { id: string; text: string; completions: TaskCompletion[] };

const DEFAULT_TASK_DEFS: { id: string; text: string }[] = [
  { id: 't1', text: 'Global Font Sizes & Colors' },
  { id: 't2', text: 'Header' },
  { id: 't3', text: 'Footer' },
  { id: 't4', text: 'Pages Dev' },
  { id: 't5', text: '404 Page' },
  { id: 't6', text: 'Mobile Responsiveness' },
  { id: 't7', text: 'Content' },
  { id: 't8', text: 'Metas' },
  { id: 't9', text: 'Social Handles' },
  { id: 't10', text: 'Business Info' },
  { id: 't11', text: 'Semantic HTML' },
  { id: 't12', text: 'Accessibility Tree' },
  { id: 't13', text: 'Images' },
  { id: 't14', text: 'Business Images - Before/After' },
  { id: 't15', text: 'Links' },
  { id: 't16', text: 'Form Testing' },
  { id: 't17', text: 'Captcha' },
  { id: 't18', text: 'Original Stats' },
  { id: 't19', text: 'Wordfence Config' },
  { id: 't20', text: 'Login URL Change' },
];

const defaultTasks: Task[] = DEFAULT_TASK_DEFS.map((t) => ({ ...t, completions: [] }));

// Older saved tasks used a single `completed`/`completedAt` boolean pair.
// Normalize those into the new multi-person `completions` shape on load.
function normalizeTask(task: any): Task {
  if (Array.isArray(task.completions)) {
    return { id: task.id, text: task.text, completions: task.completions };
  }
  const completions: TaskCompletion[] = task.completed
    ? [{ name: 'Unknown', email: '', completedAt: task.completedAt || new Date().toISOString() }]
    : [];
  return { id: task.id, text: task.text, completions };
}

export default function TaskManager({ websiteId, initialTasks }: { websiteId: string, initialTasks: any[] }) {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const source = initialTasks && initialTasks.length > 0 ? initialTasks : defaultTasks;
    return source.map(normalizeTask);
  });
  const [newTaskText, setNewTaskText] = useState('');
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      let name = user.user_metadata?.name || user.email;
      const { data: teamMember } = await supabase
        .from('team_members')
        .select('name')
        .eq('email', user.email)
        .single();
      if (teamMember?.name) name = teamMember.name;

      setCurrentUser({ name, email: user.email });
    })();
  }, []);

  const saveToSupabase = async (updatedTasks: Task[]) => {
    const { error } = await supabase
      .from('websites')
      .update({ project_tasks: updatedTasks })
      .eq('id', websiteId);

    if (error) {
      console.error("Error saving tasks to Supabase:", error);
    }
  };

  const toggleTask = (id: string) => {
    if (!currentUser) return;

    const updatedTasks = tasks.map((task) => {
      if (task.id !== id) return task;

      const alreadyDone = task.completions.some((c) => c.email === currentUser.email);
      const completions = alreadyDone
        ? task.completions.filter((c) => c.email !== currentUser.email)
        : [
            ...task.completions,
            { name: currentUser.name, email: currentUser.email, completedAt: new Date().toISOString() },
          ];

      return { ...task, completions };
    });

    setTasks(updatedTasks);
    saveToSupabase(updatedTasks);
  };

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;

    const newTask: Task = {
      id: Date.now().toString(),
      text: newTaskText,
      completions: [],
    };

    const updatedTasks = [...tasks, newTask];
    setTasks(updatedTasks);
    saveToSupabase(updatedTasks);
    setNewTaskText('');
  };

  const deleteTask = (id: string) => {
    if (!window.confirm('Delete this task? This also removes everyone\'s completion history for it.')) return;

    const updatedTasks = tasks.filter((task) => task.id !== id);
    setTasks(updatedTasks);
    saveToSupabase(updatedTasks);
  };

  const existingTaskTexts = new Set(tasks.map((task) => task.text.trim().toLowerCase()));
  const missingDefaultTasks = defaultTasks.filter(
    (task) => !existingTaskTexts.has(task.text.trim().toLowerCase())
  );

  const addDefaultTasks = () => {
    if (missingDefaultTasks.length === 0) return;

    const tasksToAdd = missingDefaultTasks.map((task) => ({
      ...task,
      id: `${Date.now()}-${task.id}`,
    }));

    const updatedTasks = [...tasks, ...tasksToAdd];
    setTasks(updatedTasks);
    saveToSupabase(updatedTasks);
  };

  return (
    <div className="bg-white/90 p-6 rounded-2xl shadow-sm border border-gray-200/60 w-full h-fit">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg mr-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          Project Tasks
        </h3>
        <button
          type="button"
          onClick={addDefaultTasks}
          disabled={missingDefaultTasks.length === 0}
          title={missingDefaultTasks.length === 0 ? 'All default tasks already added' : 'Add missing default tasks'}
          className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Default Tasks
        </button>
      </div>

      <div className="space-y-2 mb-6">
        {tasks.map((task) => {
          const isCheckedByMe = !!currentUser && task.completions.some((c) => c.email === currentUser.email);
          const isDone = task.completions.length > 0;
          const sortedCompletions = [...task.completions].sort(
            (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
          );

          return (
            <div
              key={task.id}
              className={`p-3 rounded-xl transition-all border group ${
                isDone
                  ? 'bg-gray-50/50 border-gray-100'
                  : 'bg-white border-transparent hover:border-gray-100 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={isDone}
                    disabled={!currentUser}
                    onChange={() => toggleTask(task.id)}
                    title={!currentUser ? 'Loading your account...' : isCheckedByMe ? 'Mark as not done by you' : 'Mark as done by you'}
                    className="w-5 h-5 border-2 border-gray-300 rounded text-blue-600 focus:ring-blue-500 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
                  />
                  <span
                    className={`text-sm select-none flex-1 truncate transition-all duration-200 ${
                      isDone ? 'text-gray-400 line-through' : 'text-gray-700 font-medium'
                    }`}
                  >
                    {task.text}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => deleteTask(task.id)}
                  title="Delete task"
                  className="p-1.5 text-gray-300 hover:text-rose-600 hover:bg-rose-50 rounded-md opacity-0 group-hover:opacity-100 transition-all shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {sortedCompletions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 pl-8">
                  {sortedCompletions.map((c, i) => (
                    <span
                      key={`${c.email || c.name}-${i}`}
                      className="text-[10px] sm:text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md flex items-center gap-1 shrink-0 border border-emerald-100/50"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {c.name} · {new Date(c.completedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={addTask} className="mt-4 flex gap-2">
        <input
          type="text"
          value={newTaskText}
          onChange={(e) => setNewTaskText(e.target.value)}
          placeholder="Add a custom task..."
          className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
        />
        <button
          type="submit"
          disabled={!newTaskText.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </form>
    </div>
  );
}

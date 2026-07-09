"use client";
import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function TaskManager({ websiteId, initialTasks }: { websiteId: string, initialTasks: any[] }) {
  const defaultTasks = [
    { id: 't1', text: 'Pages Development', completed: false, completedAt: null },
    { id: 't2', text: 'Content Done', completed: false, completedAt: null },
    { id: 't3', text: 'Images Updated', completed: false, completedAt: null },
    { id: 't4', text: 'Links Updated', completed: false, completedAt: null },
    { id: 't5', text: 'Metas Updated', completed: false, completedAt: null },
  ];

  // Use initial tasks from Supabase if they exist, otherwise load defaults
  const [tasks, setTasks] = useState(
    initialTasks && initialTasks.length > 0 ? initialTasks : defaultTasks
  );
  const [newTaskText, setNewTaskText] = useState('');

  const saveToSupabase = async (updatedTasks: any[]) => {
    const { error } = await supabase
      .from('websites')
      .update({ project_tasks: updatedTasks })
      .eq('id', websiteId);
      
    if (error) {
      console.error("Error saving tasks to Supabase:", error);
    }
  };

  const toggleTask = (id: string) => {
    const updatedTasks = tasks.map((task: any) => {
      if (task.id === id) {
        const isCompleted = !task.completed;
        return { 
          ...task, 
          completed: isCompleted,
          completedAt: isCompleted ? new Date().toISOString() : null
        };
      }
      return task;
    });
    setTasks(updatedTasks);
    saveToSupabase(updatedTasks);
  };

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;

    const newTask = {
      id: Date.now().toString(),
      text: newTaskText,
      completed: false,
      completedAt: null
    };

    const updatedTasks = [...tasks, newTask];
    setTasks(updatedTasks);
    saveToSupabase(updatedTasks);
    setNewTaskText('');
  };

  return (
    <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-gray-200/60 w-full h-fit">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg mr-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          Project Tasks
        </h3>
      </div>

      <div className="space-y-2 mb-6">
        {tasks.map((task: any) => (
          <label
            key={task.id}
            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
              task.completed 
                ? 'bg-gray-50/50 border-gray-100' 
                : 'bg-white border-transparent hover:border-gray-100 hover:shadow-sm'
            }`}
          >
            <div className="relative flex items-center">
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() => toggleTask(task.id)}
                className="peer w-5 h-5 border-2 border-gray-300 rounded text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
              />
            </div>
            <div className="flex-1 flex items-center justify-between min-w-0">
              <span
                className={`text-sm select-none transition-all duration-200 truncate pr-2 ${
                  task.completed
                    ? 'text-gray-400 line-through'
                    : 'text-gray-700 font-medium'
                }`}
              >
                {task.text}
              </span>
              {task.completed && task.completedAt && (
                <span className="text-[10px] sm:text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md flex items-center gap-1 shrink-0 border border-emerald-100/50">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {new Date(task.completedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              )}
            </div>
          </label>
        ))}
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

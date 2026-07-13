"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Loader2 } from "lucide-react";
import { useAuth } from "./AuthProvider";

export default function HolidayCalendar() {
  const { email } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Fetch holidays on load
  useEffect(() => {
    async function fetchHolidays() {
      const { data } = await supabase.from("company_holidays").select("date");
      if (data) {
        setHolidays(new Set(data.map(h => h.date)));
      }
      setLoading(false);
    }
    fetchHolidays();
  }, []);

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const toggleHoliday = async (dateStr: string, isWeekend: boolean) => {
    if (isWeekend) return; // Weekends are permanently off

    const newHolidays = new Set(holidays);
    if (newHolidays.has(dateStr)) {
      newHolidays.delete(dateStr);
      await supabase.from("company_holidays").delete().eq("date", dateStr);
    } else {
      newHolidays.add(dateStr);
      await supabase.from("company_holidays").insert({ date: dateStr, added_by: email });
    }
    setHolidays(newHolidays);
  };

  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const days = [];
    // Empty slots for alignment
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-10 sm:h-12"></div>);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month, day);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      // Format as YYYY-MM-DD
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isHoliday = holidays.has(dateStr);
      const isOff = isWeekend || isHoliday;

      days.push(
        <button
          key={day}
          onClick={() => toggleHoliday(dateStr, isWeekend)}
          disabled={isWeekend}
          className={`h-10 sm:h-12 rounded-lg border flex flex-col items-center justify-center transition-all ${
            isWeekend 
              ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed" 
              : isHoliday
              ? "bg-rose-50 border-rose-200 text-rose-600 font-bold shadow-inner"
              : "bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:shadow-sm cursor-pointer"
          }`}
        >
          <span className="text-sm font-semibold">{day}</span>
          {isOff && <span className="text-[9px] uppercase tracking-wider mt-0.5 opacity-70">{isWeekend ? "Wknd" : "Off"}</span>}
        </button>
      );
    }
    return days;
  };

  return (
    <div className="bg-white rounded-[20px] shadow-sm border border-slate-200 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <CalIcon className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">Global Exclusions</h2>
            <p className="text-xs text-slate-500">Click a weekday to toggle holiday.</p>
          </div>
        </div>
        
        <div className="flex items-center justify-between sm:justify-end gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200">
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className="p-1.5 hover:bg-white rounded-lg transition shadow-sm">
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <span className="text-xs font-bold w-20 text-center text-slate-700">
            {currentDate.toLocaleString('default', { month: 'short', year: 'numeric' })}
          </span>
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className="p-1.5 hover:bg-white rounded-lg transition shadow-sm">
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1.5 mb-1 text-center">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div key={i} className="text-[10px] font-bold uppercase text-slate-400 py-1">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {renderCalendar()}
          </div>
        </>
      )}
    </div>
  );
}
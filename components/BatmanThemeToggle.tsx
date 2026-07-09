"use client";
import React, { useEffect, useState } from "react";

export default function BatmanThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const storedTheme = localStorage.getItem("bat-theme");
    if (storedTheme === "dark") {
      document.documentElement.classList.add("bat-mode");
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove("bat-mode");
      localStorage.setItem("bat-theme", "light");
      setIsDark(false);
    } else {
      document.documentElement.classList.add("bat-mode");
      localStorage.setItem("bat-theme", "dark");
      setIsDark(true);
    }
  };

  if (!mounted) return null;

  return (
    <>
      {isDark && (
        <style dangerouslySetInnerHTML={{__html: `
          :root { color-scheme: dark; }
          
          /* Deep Abyss Background */
          body {
            background-color: #0A2647 !important;
            background-image: none !important;
            color: #ffffff !important;
          }
          
          /* Elevated Cards */
          [class*="bg-white"], [class*="bg-slate-50"], [class*="bg-slate-100"], [class*="bg-slate-200"],
          [class*="bg-gray-50"], [class*="bg-gray-100"], [class*="bg-gray-200"] {
            background-color: #144272 !important;
            border-color: #205295 !important;
            box-shadow: 0 8px 30px rgba(10, 38, 71, 0.8) !important;
            backdrop-filter: blur(12px) !important;
          }
          
          /* FORCE ALL TEXT TO PURE WHITE */
          h1, h2, h3, h4, h5, h6, p, span, label,
          [class*="text-slate-"], [class*="text-gray-"], 
          [class*="text-blue-"], [class*="text-indigo-"], 
          [class*="text-emerald-"], [class*="text-amber-"], 
          [class*="text-red-"], [class*="text-purple-"] { 
            color: #ffffff !important; 
            text-shadow: none !important;
          }

          /* 🦇 THE FIX: Header Icons (Logos) in Website Details */
          /* Make their background the darkest abyss blue so they look like tactical insets */
          .bg-blue-100, .bg-purple-100, .bg-amber-100, .bg-emerald-100 {
            background-color: #0A2647 !important;
            border: 1px solid #205295 !important;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.3) !important;
          }
          
          /* Give the SVG icons inside them the glowing tactical accent color */
          .bg-blue-100 svg, .bg-purple-100 svg, .bg-amber-100 svg, .bg-emerald-100 svg {
            color: #2C74B3 !important;
            filter: drop-shadow(0 0 5px rgba(44, 116, 179, 0.6)) !important;
          }
          
          /* Keep the tiny status pill backgrounds readable */
          .bg-blue-50, .bg-indigo-50, .bg-emerald-50, .bg-amber-50, .bg-red-50 {
            background-color: rgba(32, 82, 149, 0.4) !important;
            border-color: #205295 !important;
          }
          
          /* Primary Buttons - Glowing Light Blue with White Text */
          .bg-blue-600, .bg-amber-500, .bg-emerald-500, .bg-purple-600, .bg-yellow-500 {
            background-color: #2C74B3 !important;
            color: #ffffff !important;
            border: none !important;
            font-weight: 800 !important;
            box-shadow: 0 0 15px rgba(44, 116, 179, 0.5) !important;
            text-shadow: none !important;
          }
          .hover\\:bg-blue-700:hover, .hover\\:bg-amber-600:hover, .hover\\:bg-emerald-600:hover {
            background-color: #205295 !important; 
            box-shadow: 0 0 25px rgba(32, 82, 149, 0.7) !important;
          }
          
          /* Search & Inputs */
          input, select, textarea {
            background-color: #0A2647 !important;
            border-color: #205295 !important;
            color: #ffffff !important;
          }
          input:focus, select:focus, textarea:focus {
            border-color: #2C74B3 !important;
            box-shadow: 0 0 0 2px rgba(44, 116, 179, 0.5) !important;
            outline: none !important;
          }
          input::placeholder {
            color: rgba(255, 255, 255, 0.6) !important;
          }
        `}} />
      )}
      
      <button
        onClick={toggleTheme}
        className={`fixed bottom-8 right-8 z-[9999] p-4 rounded-full shadow-2xl transition-all duration-500 hover:scale-110 flex items-center justify-center ${
          isDark 
            ? "bg-[#2C74B3] text-[#0A2647] shadow-[0_0_30px_rgba(44,116,179,0.5)] border-2 border-[#2C74B3]" 
            : "bg-black text-[#2C74B3] shadow-xl border border-gray-800"
        }`}
        title={isDark ? "Deactivate Protocol" : "Activate Bat-Mode"}
      >
        <svg 
          className={`w-8 h-8 transition-transform duration-700 ${isDark ? "scale-95 drop-shadow-[0_0_8px_rgba(44,116,179,0.8)]" : ""}`} 
          viewBox="0 0 24 24" 
          fill="currentColor"
        >
          <path d="M12.004,22 C12.004,22 17.653,17.432 19.349,14.613 C21.045,11.794 23.332,10.297 23.332,10.297 C23.332,10.297 21.365,10.609 19.646,9.811 C17.927,9.013 17.581,7.202 17.581,7.202 C17.581,7.202 16.591,8.336 15.111,8.441 C13.631,8.546 12.984,7.202 12.984,7.202 L12.637,4 L11.369,4 L11.022,7.202 C11.022,7.202 10.375,8.546 8.895,8.441 C7.415,8.336 6.425,7.202 6.425,7.202 C6.425,7.202 6.079,9.013 4.36,9.811 C2.641,10.609 0.674,10.297 0.674,10.297 C0.674,10.297 2.961,11.794 4.657,14.613 C6.353,17.432 12.004,22 12.004,22 Z" />
        </svg>
      </button>
    </>
  );
}

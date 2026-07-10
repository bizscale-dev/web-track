import BatmanThemeToggle from "@/components/BatmanThemeToggle";
import TopAuthBar from "@/components/TopAuthBar";
import { AuthProvider } from "@/components/AuthProvider";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Website CRM",
  description: "Website project tracking dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="bg-slate-950 text-slate-300 antialiased min-h-screen flex flex-col overflow-x-hidden">
        <AuthProvider>
          <TopAuthBar />
          <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.9),_transparent_38%),radial-gradient(circle_at_top_right,_rgba(191,219,254,0.35),_transparent_34%),linear-gradient(180deg,_rgba(255,255,255,0.92)_0%,_rgba(246,248,252,0.72)_42%,_rgba(237,242,248,0.92)_100%)]" />
            <div className="absolute -top-20 left-[-5rem] h-64 w-64 rounded-full bg-sky-300/15 blur-3xl" />
            <div className="absolute top-44 right-[-5rem] h-72 w-72 rounded-full bg-blue-200/18 blur-3xl" />
          </div>
          <div className="relative z-10 flex min-h-screen flex-col">
            {children}
          </div>
          <BatmanThemeToggle />
        </AuthProvider>
      </body>
    </html>
  );
}

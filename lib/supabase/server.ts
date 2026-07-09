import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client (no cookie auth needed for this app)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: false,
    },
  }
);

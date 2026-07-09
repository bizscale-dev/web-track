'use server';

import { createClient } from '@supabase/supabase-js';

// We initialize a special admin client using the Service Role key.
// This bypasses standard auth rules and PREVENTS the admin from being logged out.
const adminAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function createSecureTeamMember(data: { name: string; email: string; password: string; role: string }) {
  try {
    // 1. Create the official user account in Supabase Auth
    const { data: authData, error: authError } = await adminAuthClient.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true, // Auto-confirms so they don't need to check their email right now
      user_metadata: { 
        name: data.name, 
        role: data.role 
      }
    });

    if (authError) throw new Error(authError.message);

    // 2. Add them to your visual team_members database table
    const { data: dbData, error: dbError } = await adminAuthClient
      .from('team_members')
      .insert([{ 
        name: data.name, 
        email: data.email, 
        role: data.role 
      }])
      .select()
      .single();

    if (dbError) throw new Error(dbError.message);

    return { success: true, member: dbData };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

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

export async function updateSecureTeamMember(id: string, data: { name: string; role: string }) {
  try {
    // 1. Get the current (old) team member record to know their old name and email
    const { data: oldMember, error: fetchError } = await adminAuthClient
      .from('team_members')
      .select('name, email')
      .eq('id', id)
      .single();

    if (fetchError || !oldMember) {
      throw new Error(fetchError?.message || "Team member not found");
    }

    const oldName = oldMember.name;
    const newName = data.name;

    // 2. Update the team_members table
    const { data: updatedMember, error: dbError } = await adminAuthClient
      .from('team_members')
      .update({ name: newName, role: data.role })
      .eq('id', id)
      .select()
      .single();

    if (dbError) throw new Error(dbError.message);

    // 3. If name has changed, update Auth user metadata and cascade update websites & logs
    if (oldName !== newName) {
      // Find the auth user by email
      const { data: { users }, error: listError } = await adminAuthClient.auth.admin.listUsers();
      if (!listError && users) {
        const authUser = users.find(u => u.email?.toLowerCase() === oldMember.email?.toLowerCase());
        if (authUser) {
          // Update the auth user's name metadata
          await adminAuthClient.auth.admin.updateUserById(authUser.id, {
            user_metadata: { name: newName }
          });
        }
      }

      // Cascade update all assigned roles in existing projects (websites table)
      await adminAuthClient.from("websites").update({ developer: newName }).eq("developer", oldName);
      await adminAuthClient.from("websites").update({ content_writer: newName }).eq("content_writer", oldName);
      await adminAuthClient.from("websites").update({ seo_person: newName }).eq("seo_person", oldName);

      // Update the forensics timeline so past logs match the new identity
      await adminAuthClient.from("website_activity_logs").update({ changed_by_email: newName }).eq("changed_by_email", oldName);
    }

    return { success: true, member: updatedMember };
  } catch (error: any) {
    console.error("Failed to update team member securely:", error);
    return { success: false, error: error.message };
  }
}

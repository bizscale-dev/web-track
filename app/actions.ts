'use server';

import { supabase } from "@/lib/supabase";
import { createClient } from '@supabase/supabase-js';

const WEBHOOK_URL = 'https://n8n.bizscale.pk/webhook/a5a888cd-8be6-46d4-a641-03c98dd3c8b0';

export async function triggerN8nWebhook(payload: {
  event: string;
  websiteName: string;
  domain: string | null;
  oldStatus: string | null;
  newStatus: string;
  websiteId?: number;
  changedBy?: string; // Tracking the operator
}) {
  if (!WEBHOOK_URL) return { success: false, error: 'No webhook URL configured' };

  let targetWebsiteId = payload.websiteId;
  if (!targetWebsiteId) {
    const { data } = await supabase
      .from('websites')
      .select('id')
      .eq('website_name', payload.websiteName)
      .limit(1)
      .single();
    if (data) {
      targetWebsiteId = data.id;
    }
  }

  const cleanName = payload.websiteName.trim();
  const cleanDomain = payload.domain || 'N/A';
  const operator = payload.changedBy || 'System'; // Default fallback

  // 1. Generate Localized Timestamp
  const timestamp = new Date().toLocaleString('en-US', { 
    timeZone: 'Asia/Karachi',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true 
  });

  // 2. Construct the Custom Message Logic
  let customMessage = '';
  let mention = '';

  switch (payload.newStatus) {
    case 'Pending':
      customMessage = `We Have a new Business For Website Creation`;
      break;
    case 'Pages Development':
      customMessage = `Pages Development For this Site Has Started`;
      break;
    case 'Sent For Content':
      mention = `<users/102335722105092363033> <users/116242269621779042739> <users/105177322178619127353>\n`;
      
      let pagesListStr = '*(No pages found in the database for this website)*';
      if (targetWebsiteId) {
        // Querying from website_tasks as per your original code
        const { data: tasks } = await supabase
          .from('website_tasks')
          .select('title, url')
          .eq('website_id', targetWebsiteId);

        if (tasks && tasks.length > 0) {
          pagesListStr = tasks.map(t => `- ${t.title}: ${t.url || 'N/A'}`).join('\n');
        }
      }
      customMessage = `We Need Content For The Following Pages:\n\n${pagesListStr}`;
      break;
    case 'Content Completed':
      customMessage = `Content Has Been Completed & Web Can Start Content Pasting`;
      break;
    case 'Content Updated':
      customMessage = `Content Has Been Pasted On The Website\nWebsite URL: ${cleanDomain}`;
      break;
    case 'Domain Connection':
      customMessage = `Domain Has Been Connected To the Site`;
      break;
    case 'Completed':
      customMessage = `Site Is Complete\nWebsite URL: ${cleanDomain}`;
      break;
    case 'Initial SEO':
      customMessage = `Website URL: ${cleanDomain}\n\nPlease Start WEB Seo For This Website`;
      break;
    default:
      customMessage = `Status changed from ${payload.oldStatus} to ${payload.newStatus}.`;
  }

  // 3. Assemble the Final String (Using single * for Google Chat bolding)
  const formattedMessage = `${mention}*Business Name:* ${cleanName}
*Status Changed By:* ${operator}
⏱️ *Time:* ${timestamp}

${customMessage}`;

  // 4. Fire Payload to n8n
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        message: formattedMessage,
        changedBy: operator
      }),
    });

    const responseText = await res.text();

    if (!res.ok) {
      console.error(`n8n webhook rejected: ${res.status} – ${responseText}`);
      return { success: false, error: `HTTP ${res.status}` };
    }

    return { success: true };
  } catch (error) {
    console.error('Webhook server action failed:', error);
    return { success: false, error: String(error) };
  }
}

export async function completelyDeleteUser(userId: string) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    return { success: false, error: "Missing Admin database credentials." };
  }

  // 1. Initialize the Admin Client (Bypasses row level security)
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // 2. Fetch the team member to get their email
    const { data: member, error: fetchError } = await supabaseAdmin
      .from('team_members')
      .select('email')
      .eq('id', userId)
      .single();

    if (fetchError || !member) {
      throw new Error(fetchError?.message || "Team member not found.");
    }

    // 3. Find the auth user by email
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;

    const authUser = users.find(u => u.email?.toLowerCase() === member.email?.toLowerCase());

    if (authUser) {
      // 4. Nuke the user from the central Auth vault.
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      if (deleteAuthError) throw deleteAuthError;
    }

    // 5. Delete from team_members table
    const { error: deleteDbError } = await supabaseAdmin
      .from('team_members')
      .delete()
      .eq('id', userId);

    if (deleteDbError) throw deleteDbError;

    return { success: true };
  } catch (error: any) {
    console.error("Admin deletion failed:", error);
    return { success: false, error: error.message };
  }
}
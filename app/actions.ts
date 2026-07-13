'use server';

import { supabase } from "@/lib/supabase";
import { createClient } from '@supabase/supabase-js';

const WEBHOOK_URL = 'https://n8n.bizscale.pk/webhook/a5a888cd-8be6-46d4-a641-03c98dd3c8b0';

const statusEmojis: Record<string, string> = {
  'Pending': '⏳',
  'Pages Development': '💻',
  'Sent For Content Demand': '📋',
  'Sent For Content': '📝',
  'Content Completed': '✅',
  'Content Updated': '🔄',
  'Domain Connection': '🌐',
  'Completed': '🎉',
  'Initial SEO': '🚀'
};

export async function triggerN8nWebhook(payload: {
  event: string;
  websiteName: string;
  domain: string;
  oldStatus: string;
  newStatus: string;
  websiteId: number;
  changedBy: string;
  customNotes?: string;
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
  const operator = payload.changedBy || 'System';

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
      mention = `<users/102335722105092363033> <users/116242269621779042739>\n`; // Usman, Hussain
      customMessage = `We Have a new Business For Website Creation`;
      break;
    case 'Pages Development':
      mention = `<users/102335722105092363033>\n`; // Usman
      customMessage = `Pages Development For this Site Has Started`;
      break;
    case 'Sent For Content Demand':
      mention = `<users/105177322178619127353>\n`; // Ammar
      const demandNotes = payload.customNotes ? payload.customNotes : '*(No pages specified)*';
      customMessage = `Content demand requirements are needed for this site.\n\n*Target Pages / Notes:*\n${demandNotes}`;
      break;
    case 'Sent For Content':
      mention = `<users/105573790640479430955>\n`; // Haris
      let pagesListStr = '*(No pages found in the database for this website)*';
      if (targetWebsiteId) {
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
      mention = `<users/116242269621779042739>\n`; // Hussain
      customMessage = `Content has been completed and is ready for review/implementation.`;
      break;
    case 'Content Updated':
      mention = `<users/102335722105092363033>\n`; // Usman
      customMessage = `Content updates have been pushed to the site.`;
      break;
    case 'Domain Connection':
      mention = `<users/116242269621779042739>\n`; // Hussain
      customMessage = `The site is ready for domain connection and final DNS routing.`;
      break;
    case 'Completed':
      mention = `<users/102335722105092363033>\n`; // Usman
      customMessage = `Website development and launch are officially completed.`;
      break;
    case 'Initial SEO':
      mention = `<users/105177322178619127353>\n`; // Ammar
      customMessage = `The site is now handed over for Initial SEO setup.`;
      break;
    default:
      customMessage = `Status changed from ${payload.oldStatus} to ${payload.newStatus}.`;
  }

  // 3. Conditionally Inject the URL
  // Exclude URL for Domain Connection and Completed stages
  const showUrl = !['Domain Connection', 'Completed'].includes(payload.newStatus);
  const urlLine = showUrl ? `\n*URL:* ${cleanDomain}` : '';

  // 4. Assemble the Final String
  const formattedMessage = `${mention}*Business Name:* ${cleanName}${urlLine}
*Status Changed By:* ${operator}
⏱️ *Time:* ${timestamp}

${customMessage}`;

  // 5. Fire Payload to n8n
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        message: formattedMessage,
        changedBy: operator,
        emoji: statusEmojis[payload.newStatus] || ''
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

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    const { data: member, error: fetchError } = await supabaseAdmin
      .from('team_members')
      .select('email')
      .eq('id', userId)
      .single();

    if (fetchError || !member) {
      throw new Error(fetchError?.message || "Team member not found.");
    }

    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;

    const authUser = users.find(u => u.email?.toLowerCase() === member.email?.toLowerCase());

    if (authUser) {
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      if (deleteAuthError) throw deleteAuthError;
    }

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

export async function cascadeNameUpdate(oldName: string, newName: string, userId: string) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    return { success: false, error: "Missing Admin database credentials." };
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError || !user) throw new Error(userError?.message || "Auth user not found");

    if (user.email) {
      const { error: teamError } = await supabaseAdmin
        .from("team_members")
        .update({ name: newName })
        .eq("email", user.email);
      if (teamError) throw teamError;
    }

    const { error: devError } = await supabaseAdmin.from("websites").update({ developer: newName }).eq("developer", oldName);
    if (devError) throw devError;

    const { error: writerError } = await supabaseAdmin.from("websites").update({ content_writer: newName }).eq("content_writer", oldName);
    if (writerError) throw writerError;

    const { error: seoError } = await supabaseAdmin.from("websites").update({ seo_person: newName }).eq("seo_person", oldName);
    if (seoError) throw seoError;

    const { error: logError } = await supabaseAdmin.from("website_activity_logs").update({ changed_by_email: newName }).eq("changed_by_email", oldName);
    if (logError) throw logError;

    return { success: true };
  } catch (error: any) {
    console.error("Cascade update failed:", error);
    return { success: false, error: error.message };
  }
}
'use server';

import { supabase } from "@/lib/supabase";

const WEBHOOK_URL = 'https://n8n.bizscale.pk/webhook/a5a888cd-8be6-46d4-a641-03c98dd3c8b0';

function getStatusTransitionMessage(websiteName: string, oldStatus: string | null, newStatus: string): string {
  const name = websiteName.trim();
  if (oldStatus && oldStatus !== newStatus) {
    return `${name} has moved from ${oldStatus} to ${newStatus}.`;
  }
  return `${name} status changed to ${newStatus}.`;
}

export async function triggerN8nWebhook(payload: {
  event: string;
  websiteName: string;
  domain: string | null;
  oldStatus: string | null;
  newStatus: string;
  websiteId?: number;
  changedBy?: string; // <-- NEW: Tracking the operator
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

  // 1. Map Emojis to Your Specific Pipeline Stages
  const statusEmojis: Record<string, string> = {
    'Pending': '⏳',
    'Pages Development': '🛠️',
    'Sent For Content': '📝',
    'Content Completed': '✅',
    'Content Updated': '🔄',
    'Domain Connection': '🔗',
    'Completed': '🎉',
    'Initial SEO': '📈'
  };
  const emoji = statusEmojis[payload.newStatus] || '🔹';

  // 2. Generate Localized Timestamp
  const timestamp = new Date().toLocaleString('en-US', { 
    timeZone: 'Asia/Karachi',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true 
  });

  // 3. Construct the Rich Chat Notifications
  let formattedMessage = '';
  
  if (payload.newStatus === 'Sent For Content') {
    let pagesListStr = '';
    if (targetWebsiteId) {
      const { data: tasks } = await supabase
        .from('website_tasks')
        .select('title, url')
        .eq('website_id', targetWebsiteId);

      if (tasks && tasks.length > 0) {
        pagesListStr = '\n\n**Pages Required For Content:**\n' + tasks.map(t => `- ${t.title}: ${t.url || 'N/A'}`).join('\n');
      }
    }
    formattedMessage = `🔔 *Action Required:* <users/102335722105092363033> <users/116242269621779042739> <users/105177322178619127353>\n**Business Name:** ${cleanName}\n**URL:** ${cleanDomain}${pagesListStr}\n👤 *Triggered By:* ${operator}\n⏱️ *Time:* ${timestamp}`;
  } else {
    const statusMsg = getStatusTransitionMessage(cleanName, payload.oldStatus, payload.newStatus);
    formattedMessage = `**Business Name:** ${cleanName}\n**Website-Url:** ${cleanDomain}\n**Status:** ${statusMsg}\n👤 *Triggered By:* ${operator}\n⏱️ *Time:* ${timestamp}`;
  }

  // 4. Fire Payload to n8n
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        message: formattedMessage,
        changedBy: operator // Pass explicitly to n8n JSON body
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

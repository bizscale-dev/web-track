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

  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Karachi',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  // --- NEW: FETCH THE RAW ID STRING FROM THE DATABASE ---
  const triggerKey = payload.event === 'website_created' ? 'Website Created' : payload.newStatus;
  const { data: mentionRecord } = await supabase
    .from('status_mentions')
    .select('mention_string')
    .eq('status', triggerKey)
    .single();

  // If the DB has a string (e.g., "<users/123> <users/456>"), append a newline to it
  const mention = mentionRecord?.mention_string ? `${mentionRecord.mention_string}\n` : '';

  let customMessage = '';

  switch (payload.newStatus) {
    case 'Pending':
      customMessage = `We Have a new Business For Website Creation`;
      break;
    case 'Pages Development':
      customMessage = `Pages Development For this Site Has Started`;
      break;
    case 'Sent For Content Demand':
      const demandNotes = payload.customNotes ? payload.customNotes : '*(No pages specified)*';
      customMessage = `Content demand requirements are needed for this site.\n\n*Target Pages / Notes:*\n${demandNotes}`;
      break;
    case 'Sent For Content':
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
      customMessage = `Content has been completed and is ready for review/implementation.`;
      break;
    case 'Content Updated':
      customMessage = `Content updates have been pushed to the site.`;
      break;
    case 'Domain Connection':
      customMessage = `The site is ready for domain connection and final DNS routing.`;
      break;
    case 'Completed':
      customMessage = `Website development and launch are officially completed.`;
      break;
    case 'Initial SEO':
      customMessage = `The site is now handed over for Initial SEO setup.`;
      break;
    default:
      customMessage = `Status changed from ${payload.oldStatus} to ${payload.newStatus}.`;
  }

  const showUrl = !['Domain Connection', 'Completed'].includes(payload.newStatus);
  const urlLine = showUrl ? `\n*URL:* ${cleanDomain}` : '';

  // --- NEW: CONCATENATE THE MENTION STRING DIRECTLY INTO THE MESSAGE ---
  const formattedMessage = `${mention}*Business Name:* ${cleanName}${urlLine}
*Status Changed By:* ${operator}
⏱️ *Time:* ${timestamp}

${customMessage}`;

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

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ... keep your completelyDeleteUser and cascadeNameUpdate functions below exactly as they were!
export async function completelyDeleteUser(userId: string) { /* ... */ }
export async function cascadeNameUpdate(oldName: string, newName: string, userId: string) { /* ... */ }
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envConfig = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let val = match[2] || '';
    if (val.startsWith("'") && val.endsWith("'")) {
      val = val.substring(1, val.length - 1);
    } else if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    }
    envConfig[key] = val;
  }
});

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  const { data: team } = await supabase.from('team_members').select('*');
  const { data: websites } = await supabase.from('websites').select('*');

  console.log('--- TEAM MEMBERS ---');
  team.forEach(tm => {
    console.log(`Name: [${tm.name}], Email: [${tm.email}]`);
  });

  console.log('--- WEBSITES ASSIGNMENTS ---');
  websites.forEach(w => {
    console.log(`Website: [${w.website_name}]`);
    console.log(`  Developer: [${w.developer}]`);
    console.log(`  Writer:    [${w.content_writer}]`);
    console.log(`  SEO:       [${w.seo_person}]`);
  });
}
run();

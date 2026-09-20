// COPY your EXISTING working public Supabase config into a new file named supabase-config.js.
// Never put an sb_secret/service-role key in this website.
window.NEXUS_SUPABASE_URL = "YOUR_EXISTING_SUPABASE_URL";
window.NEXUS_SUPABASE_PUBLISHABLE_KEY = "YOUR_EXISTING_PUBLISHABLE_KEY";
window.nexusDb = supabase.createClient(window.NEXUS_SUPABASE_URL, window.NEXUS_SUPABASE_PUBLISHABLE_KEY);

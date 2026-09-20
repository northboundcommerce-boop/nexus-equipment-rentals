window.NEXUS_SUPABASE_URL = "https://jpcjalocxggczphuerli.supabase.co";

window.NEXUS_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_v2djn26cf7AftvS0hi8aUA_fCXVvuMP";

window.nexusDb = supabase.createClient(
  window.NEXUS_SUPABASE_URL,
  window.NEXUS_SUPABASE_PUBLISHABLE_KEY
);
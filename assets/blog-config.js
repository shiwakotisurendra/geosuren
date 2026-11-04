// Supabase connection for the blog. The publishable key is designed to be public;
// Row Level Security (see supabase-setup.sql) protects the data.
window.BLOG_CONFIG = {
  supabaseUrl: "https://bdaxwsdptqdwjlbvzprp.supabase.co",
  supabaseAnonKey: "sb_publishable_uUjrOe6BOEuvqrRsPOzCoQ_85-HqLJp",
  // Keep false if only you should write posts (users are created in the Supabase dashboard).
  allowSignup: false,
  // Extra sites whose links may be embedded (readers click to load). YouTube, Vimeo, Earth Engine apps
  // (*.earthengine.app) and OpenStreetMap embeds are built in. Example: ["observablehq.com"]
  embedHosts: []
};

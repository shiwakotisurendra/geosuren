// Fill these in from Supabase -> Project Settings -> API.
// The anon key is designed to be public; Row Level Security (see supabase-setup.sql) protects the data.
window.BLOG_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT-ref.supabase.co",
  supabaseAnonKey: "YOUR-ANON-PUBLIC-KEY",
  // Keep false if only you should write posts (create your user in the Supabase dashboard).
  // Set true to show a "Create account" option for anyone.
  allowSignup: false
};

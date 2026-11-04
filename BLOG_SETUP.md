# Geospatial blog – setup (5 minutes)

GitHub Pages is static, so login and storage come from **Supabase** (free tier). The page `blog.html` talks to it directly from the browser.

**Who can do what**
- Anonymous visitors: read posts, filter them, see them on a map.
- Logged-in users: create posts (with an optional map pin), edit and delete **their own** posts.
- This is enforced by Row Level Security in the database, not just by hiding buttons.

## Steps
1. Create a free project at https://supabase.com.
2. **SQL Editor** → paste the contents of `supabase-setup.sql` → Run.
3. **Project Settings → API**: copy the *Project URL* and the *anon public* key into `assets/blog-config.js`. (The anon key is meant to be public.)
4. **Authentication → Users → Add user**: create your own account (email + password, tick "Auto confirm").
5. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up" so nobody else can register. (Alternatively set `allowSignup: true` in `blog-config.js` if you want open registration – then anyone can post.)
6. **Authentication → URL Configuration**: set Site URL to `https://shiwakotisurendra.github.io/geosuren/`.
7. Commit and push; the existing GitHub Pages workflow deploys it.

## Writing posts
- Blank line = new paragraph; a line starting with `## ` becomes a heading.
- Location is optional: click the map, search a place name (OpenStreetMap Nominatim) or drag the pin.
- The **Map** toggle on the blog page shows all located posts as pins.

## Notes
- Post text is rendered as plain text (no HTML), so it cannot inject scripts.
- Map tiles come from OpenStreetMap; keep the attribution.

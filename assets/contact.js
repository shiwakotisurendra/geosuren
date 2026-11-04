// Contact form: saves the message to Supabase; falls back to the visitor's mail client if that fails.
(() => {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const status = document.getElementById('contact-status');
  const cfg = window.BLOG_CONFIG || {};
  const ready = window.supabase && cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('YOUR-PROJECT');
  const sb = ready ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  const mailto = (d) => {
    const body = `${d.message}\n\n— ${d.name} (${d.email})`;
    window.location.href = `mailto:${form.dataset.to}?subject=${encodeURIComponent(d.subject || 'Inquiry')}&body=${encodeURIComponent(body)}`;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    if (fd.get('website')) { form.reset(); status.textContent = 'Thank you! Your message has been sent.'; return; } // bot trap
    const d = {
      name: String(fd.get('name')).trim(), email: String(fd.get('email')).trim(),
      subject: String(fd.get('subject') || '').trim() || null, message: String(fd.get('message')).trim()
    };
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; status.textContent = 'Sending…';
    if (sb) {
      const { error } = await sb.from('messages').insert(d);
      if (!error) { form.reset(); status.textContent = 'Thank you! Your message has been sent. I usually reply within a few working days.'; btn.disabled = false; return; }
    }
    btn.disabled = false;
    status.textContent = 'Could not send directly – opening your email program instead.';
    mailto(d);
  });
})();

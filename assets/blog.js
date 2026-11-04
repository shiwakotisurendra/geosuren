// Geospatial blog: public read, logged-in create/edit/delete (Supabase + Leaflet)
(() => {
  const cfg = window.BLOG_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const configured = cfg.supabaseUrl && cfg.supabaseAnonKey &&
    !cfg.supabaseUrl.includes('YOUR-PROJECT') && !cfg.supabaseAnonKey.startsWith('YOUR-');

  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    kids.flat().forEach((c) => c != null && n.append(c.nodeType ? c : document.createTextNode(c)));
    return n;
  };
  const show = (node, on) => { node.hidden = !on; };
  const fmtDate = (s) => new Date(s).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  const msg = (text, kind) => {
    const m = $('blog-msg');
    m.textContent = text || '';
    m.classList.toggle('error', kind === 'error');
    show(m, !!text);
    if (text) m.scrollIntoView({ block: 'nearest' });
  };

  if (!configured || !window.supabase) {
    show($('blog-setup'), true);
    $('posts').replaceChildren();
    return;
  }

  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  let session = null;
  let posts = [];
  let view = 'list';
  let blogMap = null, blogLayer = null;
  let editMap = null, editMarker = null;

  // ---------- auth ----------
  const renderAuth = () => {
    const bar = $('auth-bar');
    bar.replaceChildren();
    if (session) {
      bar.append(
        el('span', {}, 'Logged in as ', el('strong', {}, session.user.email)),
        el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { await sb.auth.signOut(); } }, 'Log out')
      );
    } else {
      bar.append(el('button', { class: 'btn ghost small', type: 'button', onclick: () => { showPanel('login'); } }, 'Log in'));
    }
    show($('new-post-btn'), !!session);
    $('signup-btn').hidden = !cfg.allowSignup;
    renderPosts();
  };

  sb.auth.onAuthStateChange((_evt, s) => {
    session = s;
    renderAuth();
    if (!s && !$('editor-panel').hidden) showPanel('list');
  });

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    const { error } = await sb.auth.signInWithPassword({ email: d.get('email'), password: d.get('password') });
    if (error) return msg(error.message, 'error');
    msg('');
    e.target.reset();
    showPanel('list');
  });
  $('signup-btn').addEventListener('click', async () => {
    const f = $('login-form');
    if (!f.reportValidity()) return;
    const d = new FormData(f);
    const { data, error } = await sb.auth.signUp({ email: d.get('email'), password: d.get('password') });
    if (error) return msg(error.message, 'error');
    msg(data.session ? 'Account created.' : 'Check your inbox to confirm your email, then log in.');
    if (data.session) showPanel('list');
  });
  $('login-cancel').addEventListener('click', () => showPanel('list'));

  // ---------- panels ----------
  function showPanel(name) {
    show($('login-panel'), name === 'login');
    show($('editor-panel'), name === 'editor');
    show($('list-panel'), name === 'list');
    show($('post-view'), name === 'post');
    if (name !== 'post' && location.hash.startsWith('#post=')) history.replaceState(null, '', location.pathname);
    if (name === 'editor') setTimeout(() => editMap && editMap.invalidateSize(), 50);
    if (name === 'list' && view === 'map') setTimeout(() => blogMap && blogMap.invalidateSize(), 50);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- data ----------
  async function loadPosts() {
    const { data, error } = await sb.from('posts').select('*').order('created_at', { ascending: false });
    if (error) {
      $('posts').replaceChildren(el('p', { class: 'hint' }, 'Could not load posts.'));
      return msg(error.message, 'error');
    }
    posts = data;
    renderPosts();
    routeFromHash();
  }

  const isMine = (p) => session && p.author_id === session.user.id;
  const hasLoc = (p) => p.lat != null && p.lng != null;

  function renderPosts() {
    const q = $('blog-filter').value.trim().toLowerCase();
    const list = posts.filter((p) => !q ||
      [p.title, p.summary, p.place_name, ...(p.tags || [])].some((t) => (t || '').toLowerCase().includes(q)));
    const box = $('posts');
    box.replaceChildren();
    if (!list.length) {
      box.append(el('p', { class: 'hint' }, posts.length ? 'No posts match your filter.' : 'No posts yet.'));
    }
    list.forEach((p) => box.append(card(p)));
    renderBlogMap(list);
  }

  function card(p) {
    const actions = isMine(p)
      ? el('div', { class: 'post-actions' },
          el('button', { class: 'btn ghost small', type: 'button', onclick: () => openEditor(p) }, 'Edit'),
          el('button', { class: 'btn ghost small danger', type: 'button', onclick: () => removePost(p) }, 'Delete'))
      : null;
    return el('article', { class: 'card post-card' },
      el('div', { class: 'body' },
        el('div', { class: 'tag' }, fmtDate(p.created_at), p.place_name ? ` · 📍 ${p.place_name}` : ''),
        el('h3', {}, el('a', { href: `#post=${p.id}` }, p.title)),
        el('p', {}, p.summary || (p.body.length > 180 ? p.body.slice(0, 180) + '…' : p.body)),
        p.tags && p.tags.length ? el('ul', { class: 'chips' }, p.tags.map((t) => el('li', {}, t))) : null,
        actions));
  }

  // ---------- map of all posts ----------
  const baseLayer = () => L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap contributors'
  });

  function renderBlogMap(list) {
    if (view !== 'map') return;
    if (!blogMap) {
      blogMap = L.map('blog-map').setView([20, 10], 2);
      baseLayer().addTo(blogMap);
      blogLayer = L.layerGroup().addTo(blogMap);
    }
    blogLayer.clearLayers();
    const pts = [];
    list.filter(hasLoc).forEach((p) => {
      const pop = el('div', {}, el('strong', {}, p.title), el('br'),
        el('a', { href: `#post=${p.id}` }, 'Read post'));
      L.marker([p.lat, p.lng]).bindPopup(pop).addTo(blogLayer);
      pts.push([p.lat, p.lng]);
    });
    if (pts.length) blogMap.fitBounds(pts, { padding: [40, 40], maxZoom: 10 });
    setTimeout(() => blogMap.invalidateSize(), 50);
  }

  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.view;
    document.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    show($('blog-map'), view === 'map');
    renderPosts();
  }));
  $('blog-filter').addEventListener('input', renderPosts);

  // ---------- single post ----------
  function renderBody(text) {
    const wrap = el('div', {});
    text.split(/\n{2,}/).forEach((block) => {
      const t = block.trim();
      if (!t) return;
      if (t.startsWith('## ')) wrap.append(el('h2', {}, t.slice(3)));
      else {
        const p = el('p', {});
        t.split('\n').forEach((line, i) => { if (i) p.append(el('br')); p.append(line); });
        wrap.append(p);
      }
    });
    return wrap;
  }

  let viewMap = null;
  function openPost(p) {
    const v = $('post-view');
    if (viewMap) { viewMap.remove(); viewMap = null; }
    v.replaceChildren(
      el('p', {}, el('a', { href: 'blog.html', onclick: (e) => { e.preventDefault(); showPanel('list'); } }, '← All posts')),
      el('div', { class: 'eyebrow' }, fmtDate(p.created_at), p.updated_at && p.updated_at !== p.created_at ? ` · updated ${fmtDate(p.updated_at)}` : ''),
      el('h2', {}, p.title),
      p.summary ? el('p', { class: 'lead' }, p.summary) : null,
      p.tags && p.tags.length ? el('ul', { class: 'chips' }, p.tags.map((t) => el('li', {}, t))) : null,
      renderBody(p.body),
      hasLoc(p) ? el('div', {},
        el('h3', {}, `📍 ${p.place_name || 'Location'}`),
        el('div', { id: 'view-map', class: 'mini-map' })) : null,
      isMine(p) ? el('div', { class: 'post-actions' },
        el('button', { class: 'btn small', type: 'button', onclick: () => openEditor(p) }, 'Edit'),
        el('button', { class: 'btn ghost small danger', type: 'button', onclick: () => removePost(p) }, 'Delete')) : null,
      el('section', { id: 'comments', class: 'comments' }));
    showPanel('post');
    loadComments(p);
    history.replaceState(null, '', `#post=${p.id}`);
    if (hasLoc(p)) {
      viewMap = L.map('view-map', { scrollWheelZoom: false }).setView([p.lat, p.lng], 9);
      baseLayer().addTo(viewMap);
      L.marker([p.lat, p.lng]).addTo(viewMap);
    }
  }

  function routeFromHash() {
    const m = location.hash.match(/^#post=([0-9a-f-]{36})$/i);
    if (!m) return;
    const p = posts.find((x) => x.id === m[1]);
    if (p) openPost(p);
  }
  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#post=')) routeFromHash(); else showPanel('list');
  });

  // ---------- comments ----------
  async function loadComments(p) {
    const box = $('comments');
    if (!box) return;
    const { data, error } = await sb.from('comments').select('*').eq('post_id', p.id).order('created_at', { ascending: true });
    if (!$('comments') || box !== $('comments')) return;
    box.replaceChildren();
    if (error) { box.append(el('p', { class: 'hint' }, 'Comments could not be loaded.')); return; }
    const mine = isMine(p);
    const approved = data.filter((c) => c.approved);
    const pending = data.filter((c) => !c.approved);

    box.append(el('h3', {}, `Comments (${approved.length})`));
    if (!approved.length) box.append(el('p', { class: 'hint' }, 'No comments yet. Be the first to comment.'));
    approved.forEach((c) => box.append(commentItem(p, c, mine)));

    if (mine && pending.length) {
      box.append(el('h3', {}, `Waiting for approval (${pending.length})`));
      pending.forEach((c) => box.append(commentItem(p, c, true)));
    }

    // submit form (honeypot field "website" must stay empty)
    const status = el('p', { class: 'hint', role: 'status' });
    const name = el('input', { name: 'author_name', maxlength: '80', required: '', autocomplete: 'name' });
    const body = el('textarea', { name: 'body', rows: '4', maxlength: '2000', required: '' });
    const trap = el('input', { name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    const submit = el('button', { class: 'btn', type: 'submit' }, 'Post comment');
    const form = el('form', { class: 'contact comment-form', onsubmit: async (e) => {
      e.preventDefault();
      if (trap.value) { form.reset(); status.textContent = 'Thanks! Your comment will appear after approval.'; return; }
      submit.disabled = true;
      const { error: err } = await sb.from('comments').insert({ post_id: p.id, author_name: name.value.trim(), body: body.value.trim() });
      submit.disabled = false;
      if (err) { status.textContent = 'Could not send your comment. Please try again.'; return; }
      form.reset();
      status.textContent = 'Thanks! Your comment will appear after approval.';
    } },
      el('h3', {}, 'Leave a comment'),
      el('label', {}, 'Name', name),
      el('label', {}, 'Comment', body),
      el('div', { class: 'hp', 'aria-hidden': 'true' }, el('label', {}, 'Website', trap)),
      el('p', {}, submit), status);
    box.append(form);
  }

  function commentItem(p, c, mine) {
    const acts = mine ? el('div', { class: 'post-actions' },
      c.approved ? null : el('button', { class: 'btn small', type: 'button', onclick: async () => {
        const { error } = await sb.from('comments').update({ approved: true }).eq('id', c.id);
        if (error) return msg(error.message, 'error');
        loadComments(p);
      } }, 'Approve'),
      el('button', { class: 'btn ghost small danger', type: 'button', onclick: async () => {
        if (!confirm('Delete this comment?')) return;
        const { error } = await sb.from('comments').delete().eq('id', c.id);
        if (error) return msg(error.message, 'error');
        loadComments(p);
      } }, 'Delete')) : null;
    return el('div', { class: 'comment' + (c.approved ? '' : ' pending') },
      el('div', { class: 'comment-meta' }, el('strong', {}, c.author_name), ` · ${fmtDate(c.created_at)}`, c.approved ? '' : ' · pending'),
      el('p', {}, c.body), acts);
  }

  // ---------- editor ----------
  const f = () => $('post-form');
  function setPin(lat, lng, pan) {
    if (!editMarker) {
      editMarker = L.marker([lat, lng], { draggable: true }).addTo(editMap);
      editMarker.on('dragend', () => { const c = editMarker.getLatLng(); setPin(c.lat, c.lng); });
    } else editMarker.setLatLng([lat, lng]);
    if (pan) editMap.setView([lat, lng], Math.max(editMap.getZoom(), 9));
    $('coord-out').textContent = `Lat ${lat.toFixed(5)}, Lng ${lng.toFixed(5)}`;
  }
  function clearPin() {
    if (editMarker) { editMap.removeLayer(editMarker); editMarker = null; }
    $('coord-out').textContent = 'No location set';
  }
  function ensureEditMap() {
    if (editMap) return;
    editMap = L.map('editor-map').setView([30, 10], 2);
    baseLayer().addTo(editMap);
    editMap.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng));
  }

  function openEditor(p) {
    if (!session) return showPanel('login');
    ensureEditMap();
    const form = f();
    form.reset();
    clearPin();
    $('editor-title').textContent = p ? 'Edit post' : 'New post';
    $('post-save').textContent = p ? 'Save changes' : 'Publish';
    form.id.value = p ? p.id : '';
    if (p) {
      form.title.value = p.title;
      form.summary.value = p.summary || '';
      form.body.value = p.body;
      form.tags.value = (p.tags || []).join(', ');
      form.place_name.value = p.place_name || '';
      if (hasLoc(p)) setPin(p.lat, p.lng, true);
    } else editMap.setView([30, 10], 2);
    showPanel('editor');
  }
  $('new-post-btn').addEventListener('click', () => openEditor(null));
  $('editor-cancel').addEventListener('click', () => showPanel('list'));
  $('loc-clear').addEventListener('click', clearPin);

  async function searchPlace() {
    const q = $('place-q').value.trim();
    if (!q) return;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (!j.length) return msg('Place not found.', 'error');
      msg('');
      setPin(parseFloat(j[0].lat), parseFloat(j[0].lon), true);
      if (!f().place_name.value) f().place_name.value = j[0].display_name.split(',').slice(0, 2).join(',').trim();
    } catch { msg('Place search failed. Click the map instead.', 'error'); }
  }
  $('place-go').addEventListener('click', searchPlace);
  $('place-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchPlace(); } });

  f().addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!session) return showPanel('login');
    const form = e.target;
    const c = editMarker ? editMarker.getLatLng() : null;
    const row = {
      title: form.title.value.trim(),
      summary: form.summary.value.trim() || null,
      body: form.body.value.trim(),
      tags: form.tags.value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12),
      lat: c ? c.lat : null,
      lng: c ? c.lng : null,
      place_name: form.place_name.value.trim() || null
    };
    const btn = $('post-save');
    btn.disabled = true;
    const id = form.id.value;
    const { data, error } = id
      ? await sb.from('posts').update(row).eq('id', id).select().single()
      : await sb.from('posts').insert(row).select().single();
    btn.disabled = false;
    if (error) return msg(error.message, 'error');
    msg('');
    const i = posts.findIndex((x) => x.id === data.id);
    if (i >= 0) posts[i] = data; else posts.unshift(data);
    renderPosts();
    openPost(data);
  });

  async function removePost(p) {
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    const { error } = await sb.from('posts').delete().eq('id', p.id);
    if (error) return msg(error.message, 'error');
    posts = posts.filter((x) => x.id !== p.id);
    renderPosts();
    showPanel('list');
    msg('Post deleted.');
  }

  // ---------- start ----------
  sb.auth.getSession().then(({ data }) => { session = data.session; renderAuth(); loadPosts(); });
})();

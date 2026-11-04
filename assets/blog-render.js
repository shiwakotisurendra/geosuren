// Safe rich-text rendering for blog posts: Markdown + images + videos + click-to-load embeds.
// Depends on assets/vendor/marked.min.js and assets/vendor/purify.min.js.
(() => {
  const cfg = window.BLOG_CONFIG || {};
  const extraHosts = (cfg.embedHosts || []).map((h) => String(h).toLowerCase());

  const hostMatches = (host, pattern) => host === pattern || host.endsWith('.' + pattern);

  // Returns {kind, src, provider, ratio?} for a standalone https URL, or null.
  function parseEmbed(raw) {
    let u;
    try { u = new URL(raw); } catch { return null; }
    if (u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase();
    const path = u.pathname;

    // YouTube (privacy-enhanced domain)
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
      let id = null;
      if (host === 'youtu.be') id = path.slice(1).split('/')[0];
      else if (path === '/watch') id = u.searchParams.get('v');
      else { const m = path.match(/^\/(?:embed|shorts|live)\/([^/?]+)/); if (m) id = m[1]; }
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
        return { kind: 'iframe', provider: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${id}`, ratio: '16/9' };
      }
      return null;
    }
    // Vimeo
    if (host === 'vimeo.com' || host === 'www.vimeo.com') {
      const m = path.match(/^\/(\d+)/);
      if (m) return { kind: 'iframe', provider: 'Vimeo', src: `https://player.vimeo.com/video/${m[1]}?dnt=1`, ratio: '16/9' };
      return null;
    }
    // Google Earth Engine apps
    if (hostMatches(host, 'earthengine.app') && path.startsWith('/view/')) {
      return { kind: 'iframe', provider: 'Google Earth Engine app', src: u.href, ratio: 'app' };
    }
    // OpenStreetMap embeds (Share > HTML)
    if (host === 'www.openstreetmap.org' && path === '/export/embed.html') {
      return { kind: 'iframe', provider: 'OpenStreetMap', src: u.href, ratio: '16/10' };
    }
    // Hosts you add in assets/blog-config.js -> embedHosts
    if (extraHosts.some((p) => hostMatches(host, p))) {
      return { kind: 'iframe', provider: host, src: u.href, ratio: 'app' };
    }
    // Plain media files
    if (/\.(mp4|webm)$/i.test(path)) return { kind: 'video', src: u.href };
    if (/\.(jpe?g|png|gif|webp|avif)$/i.test(path)) return { kind: 'image', src: u.href };
    return null;
  }

  function embedNode(info) {
    if (info.kind === 'video') {
      const v = document.createElement('video');
      v.controls = true; v.preload = 'metadata'; v.setAttribute('playsinline', ''); v.src = info.src;
      v.className = 'post-media';
      return v;
    }
    if (info.kind === 'image') {
      const i = document.createElement('img');
      i.src = info.src; i.alt = ''; i.loading = 'lazy'; i.className = 'post-media';
      return i;
    }
    // Third-party iframe: only loaded after the reader clicks (privacy / GDPR)
    const box = document.createElement('div');
    box.className = 'embed embed-' + (info.ratio === 'app' ? 'app' : 'ratio');
    if (info.ratio && info.ratio !== 'app') box.style.aspectRatio = info.ratio;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn';
    btn.textContent = `▶ Load ${info.provider} content`;
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = `Loading this content connects to ${info.provider} and may set cookies.`;
    btn.addEventListener('click', () => {
      const f = document.createElement('iframe');
      f.src = info.src; f.loading = 'lazy'; f.title = info.provider + ' content';
      f.setAttribute('allowfullscreen', '');
      f.allow = 'fullscreen; picture-in-picture';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox');
      box.replaceChildren(f);
    });
    const inner = document.createElement('div');
    inner.className = 'embed-facade';
    inner.append(btn, note);
    box.append(inner);
    return box;
  }

  let hooked = false;
  function sanitize(html) {
    if (!hooked && window.DOMPurify) {
      hooked = true;
      window.DOMPurify.addHook('afterSanitizeAttributes', (n) => {
        if (n.tagName === 'A') {
          n.setAttribute('target', '_blank');
          n.setAttribute('rel', 'noopener noreferrer nofollow ugc');
        }
        if (n.tagName === 'IMG') {
          const src = n.getAttribute('src') || '';
          if (!/^https:\/\//i.test(src)) n.remove();
          else { n.setAttribute('loading', 'lazy'); n.classList.add('post-media'); }
        }
      });
    }
    return window.DOMPurify.sanitize(html, {
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'script', 'link', 'meta', 'base', 'svg', 'math'],
      FORBID_ATTR: ['style']
    });
  }

  // text -> DOM node (safe)
  function renderBody(text) {
    const wrap = document.createElement('div');
    wrap.className = 'post-body';
    if (!window.marked || !window.DOMPurify) { wrap.textContent = text; return wrap; }

    // 1) pull standalone embed/media URLs out (outside code fences) and leave markers
    const embeds = [];
    let fenced = false;
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n').map((line) => {
      if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return line; }
      if (fenced) return line;
      const t = line.trim();
      if (/^https:\/\/\S+$/.test(t)) {
        const info = parseEmbed(t);
        if (info) { embeds.push(info); return `\n%%EMBED${embeds.length - 1}%%\n`; }
      }
      return line;
    });

    // 2) markdown -> sanitized HTML
    const html = window.marked.parse(lines.join('\n'), { gfm: true, breaks: true });
    const tpl = document.createElement('template');
    tpl.innerHTML = sanitize(html);

    // 3) put embeds back as DOM we construct ourselves
    tpl.content.querySelectorAll('p').forEach((p) => {
      const m = p.textContent.trim().match(/^%%EMBED(\d+)%%$/);
      if (m && embeds[+m[1]]) p.replaceWith(embedNode(embeds[+m[1]]));
    });
    // post title is the page's h2, so demote a stray h1
    tpl.content.querySelectorAll('h1').forEach((h) => {
      const h2 = document.createElement('h2'); h2.append(...h.childNodes); h.replaceWith(h2);
    });
    wrap.append(tpl.content);
    return wrap;
  }

  // plain-text excerpt for the list cards
  function excerpt(p, max = 180) {
    if (p.summary) return p.summary;
    const t = String(p.body)
      .replace(/^\s*(```|~~~)[\s\S]*?\1/gm, ' ')
      .replace(/^https:\/\/\S+$/gm, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_`~|-]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max).trimEnd() + '…' : t;
  }

  window.BlogRender = { renderBody, excerpt, parseEmbed };
})();

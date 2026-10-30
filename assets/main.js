// Mobile menu toggle
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('nav.main-nav');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
}

// Dropdowns open on click for touch devices
document.querySelectorAll('.has-drop > button').forEach((btn) => {
  btn.addEventListener('click', () => btn.parentElement.classList.toggle('open'));
});

// Contact form: open the visitor's mail client (static site, no backend)
const form = document.querySelector('form.contact');
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const body = `${d.get('message')}\n\n— ${d.get('name')} (${d.get('email')})`;
    window.location.href =
      `mailto:${form.dataset.to}?subject=${encodeURIComponent(d.get('subject') || 'Anfrage')}&body=${encodeURIComponent(body)}`;
  });
}

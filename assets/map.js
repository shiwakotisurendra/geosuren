// Interactive Chitwan map: LST / NDVI overlays per year, built by the Python pipeline (see /pipeline).
(function () {
  var META_URL = 'data/chitwan/meta.json';
  var DEFAULT_CENTER = [27.62, 84.45];

  var map = L.map('map', { scrollWheelZoom: false }).setView(DEFAULT_CENTER, 10);
  map.on('focus', function () { map.scrollWheelZoom.enable(); });
  map.on('blur', function () { map.scrollWheelZoom.disable(); });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  L.marker([27.6833, 84.4333]).addTo(map).bindPopup('Bharatpur, Chitwan');

  var note = document.getElementById('map-note');
  var controls = document.getElementById('map-controls');

  fetch(META_URL)
    .then(function (r) { if (!r.ok) throw new Error('no data'); return r.json(); })
    .then(init)
    .catch(function () { note.hidden = false; });

  function init(meta) {
    controls.hidden = false;
    var layer = 'lst';
    var year = meta.years[meta.years.length - 1];
    var overlay = null;
    var bounds = meta.bounds;

    var yearInput = document.getElementById('year');
    var yearLabel = document.getElementById('year-label');
    var opacityInput = document.getElementById('opacity');
    var legendBar = document.getElementById('legend-bar');
    var legendMin = document.getElementById('legend-min');
    var legendMax = document.getElementById('legend-max');
    var legendTitle = document.getElementById('legend-title');

    yearInput.min = meta.years[0];
    yearInput.max = meta.years[meta.years.length - 1];
    yearInput.step = 1;
    yearInput.value = year;

    function url() { return 'data/chitwan/' + layer + '_' + year + '.png'; }

    function draw() {
      if (overlay) map.removeLayer(overlay);
      overlay = L.imageOverlay(url(), bounds, { opacity: Number(opacityInput.value) / 100, interactive: false });
      overlay.addTo(map);
      yearLabel.textContent = year;
      var l = meta.layers[layer];
      legendTitle.textContent = l.label;
      legendBar.style.background = 'linear-gradient(to right,' + l.colors.join(',') + ')';
      legendMin.textContent = l.min;
      legendMax.textContent = l.max;
      document.querySelectorAll('[data-layer]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.layer === layer));
      });
    }

    // Snap the slider to years that exist
    yearInput.addEventListener('input', function () {
      var v = Number(yearInput.value);
      year = meta.years.reduce(function (a, b) { return Math.abs(b - v) < Math.abs(a - v) ? b : a; });
      yearInput.value = year;
      draw();
    });
    opacityInput.addEventListener('input', function () {
      if (overlay) overlay.setOpacity(Number(opacityInput.value) / 100);
    });
    document.querySelectorAll('[data-layer]').forEach(function (b) {
      b.addEventListener('click', function () { layer = b.dataset.layer; draw(); });
    });

    map.fitBounds(bounds);
    draw();
    drawChart(meta);
    document.getElementById('map-source').textContent = meta.source;
  }

  function drawChart(meta) {
    var el = document.getElementById('chart');
    var pts = meta.years.map(function (y) { return { y: y, v: meta.stats[String(y)].lst_mean }; })
      .filter(function (p) { return typeof p.v === 'number'; });
    if (pts.length < 2) { el.hidden = true; return; }
    var W = 640, H = 240, m = { l: 44, r: 16, t: 16, b: 32 };
    var vmin = Math.floor(Math.min.apply(null, pts.map(function (p) { return p.v; })) - 1);
    var vmax = Math.ceil(Math.max.apply(null, pts.map(function (p) { return p.v; })) + 1);
    var y0 = pts[0].y, y1 = pts[pts.length - 1].y;
    function X(y) { return m.l + (y - y0) / (y1 - y0) * (W - m.l - m.r); }
    function Y(v) { return H - m.b - (v - vmin) / (vmax - vmin) * (H - m.t - m.b); }
    var path = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p.y).toFixed(1) + ' ' + Y(p.v).toFixed(1); }).join(' ');
    var dots = pts.map(function (p) {
      return '<circle cx="' + X(p.y).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="4" fill="#2f6b4f"><title>' + p.y + ': ' + p.v + ' °C</title></circle>';
    }).join('');
    var ticks = pts.map(function (p) {
      return '<text x="' + X(p.y).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="#5a6a62">' + p.y + '</text>';
    }).join('');
    var yticks = [vmin, (vmin + vmax) / 2, vmax].map(function (v) {
      return '<text x="' + (m.l - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#5a6a62">' + v + '</text>' +
        '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="#dde7e0"/>';
    }).join('');
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Mean land surface temperature per year">' +
      yticks + '<path d="' + path + '" fill="none" stroke="#2f6b4f" stroke-width="2.5"/>' + dots + ticks + '</svg>';
  }
})();

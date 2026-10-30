# Surendra Shiwakoti – geospatial consulting website

Static HTML/CSS/JS site, published with GitHub Pages. The interactive **Chitwan map** (`map.html`) is fed by a Python package in `pipeline/` that runs in GitHub Actions – no Google Earth Engine account needed.

## How the map data is produced
`pipeline/` (package `geosuren`) searches public Landsat 8/9 Collection 2 Level-2 scenes on the Microsoft Planetary Computer STAC API, cloud-masks them, builds a pre-monsoon (March–May) median composite per year, and writes PNG overlays plus `meta.json` to `data/chitwan/`. The page reads those files in the browser with Leaflet.

Change the area, season or colour ranges in `pipeline/src/geosuren/config.py`.

Run it locally:
```bash
pip install -e "./pipeline[stac,test]"
pytest pipeline
geosuren build --out data/chitwan --start 2023 --end 2025
python3 -m http.server 8000   # open http://localhost:8000/map.html
```

## Deployment (GitHub Pages)
1. Repository **Settings → Pages → Source: GitHub Actions** (one-time).
2. `.github/workflows/site.yml`:
   - on every push to `master`: redeploys the site;
   - monthly and via **Actions → Run workflow**: rebuilds the Landsat data, commits it to `master`, then deploys. Tick *force* to recompute all years.
3. Site: `https://shiwakotisurendra.github.io/geosuren/`

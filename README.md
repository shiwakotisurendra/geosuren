# Surendra Shiwakoti – geoconsulting website

Static HTML/CSS/JS site, no build step.

## Before publishing
- Replace `your-email@example.com` in all pages (search the folder for it) with your real address.
- Confirm that offering independent consulting is compatible with your employment contract.

## Preview
`python3 -m http.server 8000`

## Deploy on GitHub Pages
1. Create a repo (e.g. `geo-consulting`) and push this folder to `main`.
2. Settings → Pages → Source: **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` publishes on every push: `https://<user>.github.io/<repo>/`.
4. Custom domain: add a `CNAME` file and point DNS to `<user>.github.io`.

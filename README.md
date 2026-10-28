# GYM Demo

Gym's Conductor by Primewave: a demo of the gym operations platform for gym-sector prospects, in the Primewave design system (Clash Display, Markazi Text, violet-to-cyan ramp).

It covers sign-in by role (COO, Facility Manager), the Kingdom map drill-down, the network overview with recommended actions and gym comparison, Site Control (HVAC, lights, AI agents, control, integration), AI Vision (live floor in 3D, crowd heatmap, cameras, zones, machines, usage reports) and Ask Conductor. English and Arabic (RTL), light and dark themes.

All figures are generated demo data for two gyms in Riyadh (Hittin, Al Sahafa). No live system is contacted.

## Run

```bash
npm ci
npm run dev          # local dev server
npm run build        # dist/ (multi-file, relative paths)
npm run build:single # dist-single/index.html (one self-contained file)
```

## Deploy

Every push to `main` builds and publishes `dist/` to GitHub Pages through `.github/workflows/pages.yml` (Settings > Pages > Source: GitHub Actions).

All gyms, floor plans, cameras and figures in this demo are illustrative.

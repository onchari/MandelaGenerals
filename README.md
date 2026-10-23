# 📊 Inventory Management Admin Dashboard (TypeScript + Firebase Ready)

[![Live Demo](https://img.shields.io/badge/Demo-Live%20Preview-blue?style=for-the-badge)](https://onchari.github.io/MandelaGenerals/)
[![GitHub Repo](https://img.shields.io/badge/Code-GitHub-black?style=for-the-badge&logo=github)](https://github.com/onchari/MandelaGenerals)

This project now follows the shared multi-tenant business app template: the existing HTML/CSS dashboard is retained as the UI shell, while the app is structured for **Vite + TypeScript**, **Firebase Authentication**, and **Cloud Firestore**. This allows the same dashboard to be adapted into a business-specific, multi-tenant inventory system while remaining deployable on **GitHub Pages** as a static frontend.

---

## 🔎 Table of Contents

- [✨ Features](#-features)
- [🧱 Tech Stack](#-tech-stack)
- [📂 Project Structure](#-project-structure)
- [🚀 Getting Started](#-getting-started)
- [🌍 Live Demo](#-live-demo)
- [⚙️ Deployment (GitHub Pages)](#️-deployment-github-pages)
- [🛠️ Customization](#️-customization)
- [🧪 Testing Locally](#-testing-locally)
- [🗺️ Roadmap](#️-roadmap)
- [🤝 Contributing](#-contributing)
- [👤 Author & Profile](#-author--profile)

---

## ✨ Features

- 📱 **Responsive Layout** — Optimized for desktop, tablet, and mobile
- 🎨 **Modern UI Components** — Cards, tables, charts, forms, and navigation menus
- 📊 **Data Visualization** — Interactive charts and graphs
- ⚡ **Lightweight & Fast** — No heavy frameworks; easy to customize
- 🗂️ **Pre-built Pages** — Dashboard, Products, Categories, Users, Orders, Reports
- 🔐 **Clean Codebase** — Organized HTML, CSS, JS, and assets

---

## 🧱 Tech Stack

- **HTML5** — Semantic structure
- **CSS3** — Styling and responsive layout
- **JavaScript (ES6+)** — Interactivity and charts
- **Chart.js** — Extendable chart library (plug-and-play via `charts.js`)

---

## 📂 Project Structure

```
Inventory-Management-Admin-Dashboard-Html-Template/
│
├── index.html                   # Main dashboard entry
├── products.html                # Products listing & management
├── categories.html              # Category views
├── users.html                   # User management
├── orders.html                  # Orders overview
├── reports.html                 # Reports & analytics
│
├── assets/
│   ├── css/
│   │   ├── style.css            # Global styles
│   │   └── responsive.css       # Responsive helpers
│   ├── js/
│   │   ├── main.js              # Core scripts & UI logic
│   │   └── charts.js            # Chart configs & sample data
│   └── images/                  # Logos, icons, placeholders
│
├── components/                  # (Optional) Partials / includes
│   ├── header.html
│   └── sidebar.html
│
├── README.md
```

> **Note:** If your repo structure differs, update paths and filenames accordingly.

---

## 🚀 Getting Started

### 1) Clone the repository

```bash
git clone https://github.com/itrabbi24/Inventory-Management-Admin-Dashboard-Html-Template.git
cd Inventory-Management-Admin-Dashboard-Html-Template
```

### 2) Open in a browser

Just open `index.html` (or any page) in your browser.

---

## 🌍 Live Demo

Hosted on GitHub Pages:
👉 **[https://onchari.github.io/MandelaGenerals/](https://onchari.github.io/MandelaGenerals/)**

---

## ⚙️ Deployment (GitHub Pages)

The workflow in `.github/workflows/deploy.yml` builds with the production
Firebase configuration and deploys the site automatically whenever changes
are pushed to `main`. Configure the production `VITE_FIREBASE_*` repository
variables before deploying. If repository settings prevent automatic
enablement, set the build and deployment source to **GitHub Actions** in
**Repository → Settings → Pages**.
The site will be published at:

```
https://onchari.github.io/MandelaGenerals/
```

---

## 🛠️ Customization

- 🎨 **Theme & Styles:** Edit `assets/css/style.css` (colors, spacing, typography)
- 🧩 **Layout Components:** Reuse/modify `components/header.html` and `components/sidebar.html`
- 📊 **Charts:** Update datasets and options in `assets/js/charts.js`
- ♿ **Accessibility:** Add ARIA attributes and ensure proper contrast/keyboard nav
- 🌐 **Localization:** Externalize strings to easily support multiple languages

---

## 🧪 Testing Locally

### Development and production environments

The app uses separate Firebase projects:

- Development: `mandelagenerals-dev` (local Vite app and Firebase Hosting)
- Production: `mandelageneralshop` (GitHub Pages deployment)

Create `.env.development` from `.env.development.example` and `.env.production`
from `.env.production.example`. Add the matching Firebase web app configuration
to each file. These files are ignored by Git. Development mode refuses to
initialize Firebase if it is configured with the production project.

```bash
npm run dev          # Development app; uses .env.development
npm run build:dev    # Build with development Firebase configuration
npm run deploy:dev   # Deploy to the development Firebase project
npm run build        # Production build for GitHub Pages
```

Firebase CLI defaults to the development project. Production deploys through
GitHub Actions and uses the `mandelageneralshop` repository variables
(`VITE_FIREBASE_*`). To enable the GitHub Pages environment switch, also add
the development web-app settings as repository variables named
`VITE_FIREBASE_DEV_API_KEY`, `VITE_FIREBASE_DEV_AUTH_DOMAIN`,
`VITE_FIREBASE_DEV_PROJECT_ID`, `VITE_FIREBASE_DEV_STORAGE_BUCKET`,
`VITE_FIREBASE_DEV_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_DEV_APP_ID`.
The switch signs out of the current Firebase project before reloading into the
other one; each project has separate accounts and data. The switch is visible
to site visitors, but Dev data access is restricted by Firestore rules to
approved tester accounts. Dev accounts must be created by a project
administrator; self-sign-up is disabled in the Dev app.

Before deploying the updated Firestore rules, create
`environmentConfig/access` in both projects. Set `requireTesterApproval` to
`true` in Dev and `false` in Production. In Dev, create
`devTesters/{userId}` for each approved Firebase Authentication user with
`enabled: true`. The rules require these configuration documents and the
allowlisted Dev tester documents, and deny client writes to them. Deploy the
same rules to both projects; the database structure and rules stay the same,
while the configuration and business data differ.

Firebase web-app configuration is included in the public frontend bundle, so
protect data with Authentication and Firestore rules, and never put
service-account private keys in `VITE_*` variables. Do not use production data
to test development features.

- Validate HTML with the W3C validator
- Use browser dev tools Lighthouse for performance & accessibility checks
- Test responsiveness at common breakpoints (1440, 1280, 1024, 768, 576, 375)

---

## 🗺️ Roadmap

- [ ] Dark mode & theming support
- [ ] Search, filter, and sort for tables
- [ ] Modal & toast components
- [ ] Reusable form elements (validation states)
- [ ] Example API integration (mock data)

*Suggestions welcome — open an issue!*

---

## 🤝 Contributing

Contributions are appreciated!

1. **Fork** the repository
2. Create your feature branch: `git checkout -b feat/awesome-feature`
3. **Commit** changes: `git commit -m "feat: add awesome feature"`
4. **Push** to the branch: `git push origin feat/awesome-feature`
5. Open a **Pull Request**

---

## 👤 Author & Profile

**ARG Rabbi** — Web Developer focusing on clean dashboards and UI systems.

- GitHub: **[@itrabbi24](https://github.com/itrabbi24)**

If this template helps you, please **⭐ star the repo** and **follow** for updates!

---
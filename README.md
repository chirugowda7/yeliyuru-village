# Yeliyuru Village Portal (ಯೆಲಿಯೂರು ಗ್ರಾಮ ಪೋರ್ಟಲ್)

> **Official community portal and digital heritage repository for Yeliyuru Village (ಯೆಲಿಯೂರು)**  
> Devanahalli Taluk, Bengaluru Rural District, Karnataka, India  
> *The Land of Milk & Silk — ಹಾಲು ಮತ್ತು ರೇಷ್ಮೆಯ ಸಮೃದ್ಧ ನಾಡು*

---

## 🌟 Overview

**Yeliyuru Village Portal** is a modern, high-performance, responsive bilingual (English & Kannada) web portal designed to showcase the heritage, agriculture, local governance, institutions, emergency contacts, and community life of Yeliyuru village.

Created by **Chirugowda Yeliyuru** (ಚಿರು ಗೌಡ ಯೆಲಿಯೂರು).

---

## ✨ Key Features

- **🌐 100% Bilingual Support:** Instant toggle between English and Kannada (ಕನ್ನಡ) across all headings, narratives, descriptions, and data cards.
- **🎨 Modern Aesthetic Design:** Glassmorphic navigation, tailored HSL color palettes, responsive grid cards, and smooth micro-interactions.
- **🌓 Dynamic Light & Dark Mode:** Theme switcher with persistent storage and system preference detection.
- **⚡ 100% Clean Vector Icons:** Zero emojis across the entire UI; powered by high-clarity SVG vector icons inheriting theme colors.
- **🥛 Milk & Silk (Agri Hub):** Highlights Yeliyuru's status as the top producer of milk (BAMUL/KMF) and mulberry silk cocoons in Bengaluru Rural.
- **🛕 Temples & Cultural Heritage:** Detailed profiles of Sri Venugopala Swamy, Sri Gangamma Devi, Sri Basaveshwara, and historic shrines.
- **🎉 Live Festival Countdown:** Real-time countdown clock calculating days, hours, and minutes to upcoming village fairs (Jathre) and festivals.
- **📸 Interactive Photo Gallery:** Categorized grid with full-screen lightbox preview and navigation.
- **⚙️ Integrated Admin Control Panel (`admin.html`):** Password-protected dashboard to manage village details, notices, contacts, and images.
- **💾 Dual Storage Resilience:** Supports both local SQLite database (`node server.js`) and client-side IndexedDB / localStorage for zero-backend static deployment (GitHub Pages).

---

## 🚀 Live Deployment on GitHub Pages

This project is fully static-compatible and runs seamlessly on **GitHub Pages**:

1. Push this repository to GitHub.
2. In your GitHub repository, navigate to **Settings** → **Pages**.
3. Under **Branch**, select `main` and root folder `/ (root)`.
4. Click **Save**. Within 1–2 minutes, your portal will be live at:
   ```
   https://<your-username>.github.io/<repository-name>/
   ```

---

## 💻 Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)

### Getting Started
1. Clone or open the project directory:
   ```bash
   cd Yeliyuru
   ```
2. Start the local server:
   ```bash
   npm start
   ```
3. Open in your browser:
   - **Public Portal:** [http://localhost:8000](http://localhost:8000)
   - **Admin Panel:** [http://localhost:8000/admin.html](http://localhost:8000/admin.html) (Default passkey: `yeliyuru2025` or `admin123`)
   - **Database Status:** [http://localhost:8000/api/status](http://localhost:8000/api/status)

---

## 📁 Project Structure

```
├── index.html          # Public Village Portal
├── admin.html          # Admin Dashboard & Content Editor
├── styles.css          # Design system & public portal styles
├── admin.css           # Admin dashboard stylesheet
├── app.js              # Client logic, bilingual engine, counters
├── admin.js            # Admin CRUD operations & live sync
├── icons.js            # 45+ SVG vector icons & renderer
├── storage.js          # IndexedDB & localStorage persistence layer
├── data.js             # Village dataset & fallback store
├── server.js           # Native Node.js HTTP server & API endpoints
├── db.js               # SQLite database interface & migrations
├── assets/
│   └── images/         # Village photographs & banner assets
├── package.json        # Project metadata & npm scripts
└── README.md           # Documentation
```

---

## 📜 Credits & Attribution

- **Concept, Design & Development:** Chirugowda Yeliyuru (ಚಿರು ಗೌಡ ಯೆಲಿಯೂರು)
- **Community:** Yeliyuru Grama Panchayat, Devanahalli Taluk, Bengaluru Rural District, Karnataka.
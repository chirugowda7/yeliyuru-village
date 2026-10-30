/**
 * =============================================================================
 * YELIYURU VILLAGE PORTAL - APPLICATION LOGIC
 * Implements the user's pseudo-code specification:
 * 1. Setup (Language & Theme)
 * 2. Load Content (Bilingual structured village data)
 * 3. Display Header (Name, Banner, Navigation, Language switch)
 * 4. Display Sections in Order (Conditionally render 15 sections)
 * 5. Handle Visitor Actions (Nav, Language, Lightbox, Maps, Share, Contact Form)
 * 6. Automatic Features (Festival Countdown, Responsive layout)
 * =============================================================================
 */

(function () {
  'use strict';

  // Dynamic working dataset that updates on every save (shadows static file const)
  let VILLAGE_DATA = Object.assign({}, (typeof window !== 'undefined' && window.VILLAGE_DATA) || {});

  // Hydrate custom village data saved from Admin Panel if present in localStorage
  try {
    localStorage.removeItem('yeliyuru_custom_village_data');
    const customDataRaw = localStorage.getItem('yeliyuru_custom_village_data_v2');
    if (customDataRaw) {
      const parsedData = JSON.parse(customDataRaw);
      const defaultTime = Number((VILLAGE_DATA && VILLAGE_DATA.lastUpdated) || 0);
      const cachedTime = Number((parsedData && parsedData.lastUpdated) || 0);
      if (parsedData && typeof parsedData === 'object' && cachedTime >= defaultTime) {
        VILLAGE_DATA = Object.assign({}, VILLAGE_DATA, parsedData);
        window.VILLAGE_DATA = VILLAGE_DATA;
      } else {
        localStorage.removeItem('yeliyuru_custom_village_data_v2');
      }
    }
  } catch (e) {
    console.warn("Could not load custom village data from localStorage:", e);
  }

  // language = saved choice OR default to Kannada ("kn")
  const savedLang = localStorage.getItem('village_language_pref_v2');
  let currentLanguage = (savedLang === 'en' || savedLang === 'kn') ? savedLang : 'kn';

  // Vector SVG icon helper
  function iconSvg(nameOrKey, extraClass = '') {
    if (typeof window !== 'undefined' && typeof window.renderIcon === 'function') {
      return window.renderIcon(nameOrKey, extraClass);
    }
    return '';
  }

  // theme = viewer's device setting (light or dark)
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const savedTheme = localStorage.getItem('village_theme');
  let currentTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');

  // Photo Gallery State
  let currentPhotoIndex = 0;
  let villagePhotos = (VILLAGE_DATA && VILLAGE_DATA.photos) || [];

  // Track applied dataset timestamp and network state to prevent redundant re-renders
  let lastAppliedTimestamp = Number((VILLAGE_DATA && VILLAGE_DATA.lastUpdated) || 0);
  let isSyncing = false;
  let lastNetworkCheckTime = 0;

  // Apply live updated dataset to active view ONLY if data is genuinely newer
  function applyLiveDataset(freshData) {
    if (!freshData || typeof freshData !== 'object' || Object.keys(freshData).length === 0) return;
    const freshTime = Number(freshData.lastUpdated) || 0;

    // Strict guard: if fresh data is older than what was already rendered, DO NOTHING
    if (freshTime && freshTime < lastAppliedTimestamp) {
      return;
    }
    // If timestamp matches, verify if images or content changed
    if (freshTime && freshTime === lastAppliedTimestamp) {
      const bannerChanged = freshData.banner?.image && freshData.banner?.image !== VILLAGE_DATA.banner?.image;
      const panchayatChanged = freshData.panchayat?.image && freshData.panchayat?.image !== VILLAGE_DATA.panchayat?.image;
      if (!bannerChanged && !panchayatChanged) {
        return;
      }
    }

    lastAppliedTimestamp = freshTime || Date.now();
    VILLAGE_DATA = Object.assign({}, VILLAGE_DATA, freshData);
    window.VILLAGE_DATA = VILLAGE_DATA;
    if (VILLAGE_DATA.photos) {
      villagePhotos = VILLAGE_DATA.photos;
    }

    // Render cleanly once
    renderHeaderAndBanner(currentLanguage);
    renderAllSections(currentLanguage);
  }

  // Network live sync engine for mobile and desktop (strictly throttled)
  function syncNetworkData() {
    var now = Date.now();
    // Throttle checks to at most once every 5 seconds
    if (isSyncing || (now - lastNetworkCheckTime < 5000)) {
      return;
    }
    isSyncing = true;
    lastNetworkCheckTime = now;

    // 1. Try local backend server /api/data (instant for Wi-Fi mobile devices)
    fetch('/api/data?ts=' + now, { cache: 'no-store' })
      .then(function(r) {
        if (!r.ok) throw new Error('API not available');
        return r.json();
      })
      .then(function(res) {
        if (res && res.success && res.data) {
          applyLiveDataset(res.data);
        }
      })
      .catch(function() {
        // 2. Fallback: try data.json (clean JSON file, no regex needed - works on GitHub Pages)
        fetch('data.json?ts=' + now, { cache: 'no-store' })
          .then(function(r) {
            if (!r.ok) throw new Error('data.json not available');
            return r.json();
          })
          .then(function(freshData) {
            if (freshData && typeof freshData === 'object') {
              applyLiveDataset(freshData);
            }
          })
          .catch(function() {
            // 3. Last resort: parse data.js with robust extraction
            fetch('data.js?ts=' + now, { cache: 'no-store' })
              .then(function(r) { return r.text(); })
              .then(function(text) {
                // Find the JSON object between "const VILLAGE_DATA = " and the trailing ";"
                var startMarker = text.indexOf('{');
                var endMarker = text.lastIndexOf('}');
                if (startMarker !== -1 && endMarker !== -1 && endMarker > startMarker) {
                  try {
                    var jsonStr = text.substring(startMarker, endMarker + 1);
                    var freshData = JSON.parse(jsonStr);
                    applyLiveDataset(freshData);
                  } catch (parseE) {
                    // JSON parse failed silently
                  }
                }
              })
              .catch(function() {});
          });
      })
      .finally(function() {
        setTimeout(function() { isSyncing = false; }, 1000);
      });
  }

  // Hydrate from local IndexedDB cache once on startup
  function initStorageHydration() {
    if (window.VillageStorage && window.VillageStorage.loadData) {
      window.VillageStorage.loadData().then(function(idbData) {
        if (idbData && typeof idbData === 'object' && Object.keys(idbData).length > 0) {
          const defaultTime = Number((window.VILLAGE_DATA && window.VILLAGE_DATA.lastUpdated) || 0);
          const cachedTime = Number(idbData.lastUpdated || 0);
          if (cachedTime >= defaultTime) {
            applyLiveDataset(idbData);
          }
        }
      }).catch(function(err) {
        console.warn("VillageStorage load notice:", err);
      });
    }
    syncNetworkData();
  }

  // Initial load
  initStorageHydration();

  // Cross-tab live sync via BroadcastChannel (only triggers when admin publishes new data)
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      var syncBc = new BroadcastChannel('yeliyuru_sync_channel');
      syncBc.onmessage = function(ev) {
        if (ev.data && ev.data.type === 'DATA_SAVED') {
          syncNetworkData();
        }
      };
    }
  } catch (bcErr) {}

  // Sync on tab visibility change (throttled)
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
      syncNetworkData();
    }
  });

  // Auto-sync every 30 seconds for mobile users viewing GitHub Pages
  setInterval(syncNetworkData, 30000);

  // Active section keys in exact ordered sequence:
  const ORDERED_SECTIONS = [
    'about',
    'history',
    'quickFacts',
    'photos',
    'temples',
    'festivals',
    'crops',
    'panchayat',
    'schoolsHealth',
    'transport',
    'contacts',
    'notices',
    'contactForm',
    'map'
  ];

  // Translation dictionaries for static UI labels
  const UI_TEXT = {
    en: {
      siteTitle: "Yeliyuru",
      siteSub: "Devanahalli, Bengaluru Rural",
      mapsBtn: "Maps",
      shareBtn: "Share",
      adminBtn: "Admin",
      exploreBtn: "Explore Yeliyuru",
      shareMsg: "Explore Yeliyuru Village (Devanahalli Taluk, Bengaluru Rural) official portal - The Land of Milk & Silk (The Biggest Producer in the District): ",
      upcomingCountdownLabel: "Upcoming Festival Countdown",
      daysLeft: "Days Left",
      dayLeft: "Day Left",
      noUpcomingFestivals: "No upcoming festivals",
      inDays: "in",
      days: "days",
      today: "Today!",
      allPhotos: "All Photos",
      photoOf: "Photo",
      of: "of",
      viewDetails: "View Details",
      timings: "Timings",
      speciality: "Speciality",
      deity: "Presiding Deity",
      annualYield: "Acreage / Volume",
      cultivationSeason: "Season",
      irrigationType: "Facilities",
      readNotice: "Read Notice",
      callNow: "Call",
      emailUs: "Email",
      copyNumber: "Copy Phone",
      phoneCopied: "Phone number copied to clipboard!",
      chatWhatsApp: "Chat on WhatsApp",
      heroMapsBtn: "Open in Maps",
      heroShareBtn: "Share on WhatsApp",
      openInMaps: "Open in Google Maps",
      satelliteViewTitle: "Google Maps Satellite View",
      formSuccessTitle: "Thank you, we received your message",
      formRequiredError: "Please fill all required fields",
      formInvalidContact: "Please enter a valid phone or email",
      footerDesc: "The Land of Milk & Silk in Devanahalli Taluk, Bengaluru Rural District, Karnataka. The biggest producer of dairy milk and premium mulberry silk in the district.",
      footerCopy: "© 2026 Yeliyuru Grama Panchayat, Devanahalli Taluk, Bengaluru Rural District, Karnataka. All Rights Reserved.",
      footerDevCredit: "Crafted with pride by Chirugowda Yeliyuru for the community of Yeliyuru",
      creatorBadgePill: '<svg class="icon icon-sparkles" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="M19 4v4"/><path d="M21 6h-4"/></svg> Created by <strong>Chirugowda Yeliyuru</strong>',
      creatorPortalLabel: "Official Yeliyuru Community Portal",
      creatorKnText: "Devanahalli, Bengaluru Rural",
      heroCreatorLabel: "Created by <strong>Chirugowda Yeliyuru</strong>",
      navLabels: {
        about: "About",
        history: "History",
        quickFacts: "Facts",
        photos: "Photos",
        temples: "Temples",
        festivals: "Festivals",
        crops: "Milk & Silk",
        culture: "Culture",
        panchayat: "Panchayat",
        schoolsHealth: "Schools & PHC",
        transport: "Transport",
        contacts: "Contacts",
        notices: "Notices",
        contactForm: "Contact Us",
        map: "Maps"
      }
    },
    kn: {
      siteTitle: "ಯೆಲಿಯೂರು",
      siteSub: "ದೇವನಹಳ್ಳಿ, ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ",
      mapsBtn: "ನಕ್ಷೆ",
      shareBtn: "ಹಂಚಿಕೊಳ್ಳಿ",
      adminBtn: "ಆಡಳಿತ",
      exploreBtn: "ಯೆಲಿಯೂರು ದರ್ಶನ",
      shareMsg: "ಯೆಲಿಯೂರು ಗ್ರಾಮದ (ದೇವನಹಳ್ಳಿ ತಾಲೂಕು, ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ) ಅಧಿಕೃತ ಪೋರ್ಟಲ್ ವೀಕ್ಷಿಸಿ - ಹಾಲು ಮತ್ತು ರೇಷ್ಮೆಯ ನಾಡು (ಜಿಲ್ಲೆಯ ಅತಿ ದೊಡ್ಡ ಉತ್ಪಾದಕ): ",
      upcomingCountdownLabel: "ಮುಂಬರುವ ಹಬ್ಬದ ಕೌಂಟ್‌ಡೌನ್",
      daysLeft: "ದಿನಗಳು ಬಾಕಿ",
      dayLeft: "ದಿನ ಬಾಕಿ",
      noUpcomingFestivals: "ಯಾವುದೇ ಮುಂಬರುವ ಹಬ್ಬಗಳಿಲ್ಲ",
      inDays: "ಇನ್ನು",
      days: "ದಿನಗಳಲ್ಲಿ",
      today: "ಇಂದೇ ಹಬ್ಬ!",
      allPhotos: "ಎಲ್ಲಾ ಛಾಯಾಚಿತ್ರಗಳು",
      photoOf: "ಚಿತ್ರ",
      of: "ರ",
      viewDetails: "ವಿವರ ನೋಡಿ",
      timings: "ಸಮಯ",
      speciality: "ವಿಶೇಷತೆ",
      deity: "ಪ್ರಧಾನ ದೈವ",
      annualYield: "ವಿಸ್ತೀರ್ಣ / ಪ್ರಮಾಣ",
      cultivationSeason: "ಋತು",
      irrigationType: "ಸೌಲಭ್ಯ",
      readNotice: "ಪ್ರಕಟಣೆ ಓದಿ",
      callNow: "ಕರೆ ಮಾಡಿ",
      emailUs: "ಇಮೇಲ್",
      copyNumber: "ನಂಬರ್ ಕಾಪಿ",
      phoneCopied: "ಫೋನ್ ಸಂಖ್ಯೆಯನ್ನು ನಕಲಿಸಲಾಗಿದೆ!",
      chatWhatsApp: "ವಾಟ್ಸಾಪ್ ಚಾಟ್",
      heroMapsBtn: "ಗೂಗಲ್ ಮ್ಯಾಪ್ಸ್",
      heroShareBtn: "ಹಂಚಿಕೊಳ್ಳಿ",
      openInMaps: "ಗೂಗಲ್ ಮ್ಯಾಪ್ಸ್‌ನಲ್ಲಿ ವೀಕ್ಷಿಸಿ",
      satelliteViewTitle: "ಗೂಗಲ್ ಮ್ಯಾಪ್ಸ್ ಸ್ಯಾಟಲೈಟ್ ಉಪಗ್ರಹ ನೋಟ",
      formSuccessTitle: "ಧನ್ಯವಾದಗಳು, ನಿಮ್ಮ ಸಂದೇಶ ಸ್ವೀಕರಿಸಲಾಗಿದೆ",
      formRequiredError: "ದಯವಿಟ್ಟು ಎಲ್ಲಾ ಅಗತ್ಯ ವಿವರಗಳನ್ನು ಭರ್ತಿ ಮಾಡಿ",
      formInvalidContact: "ದಯವಿಟ್ಟು ಮಾನ್ಯವಾದ ಫೋನ್ ಅಥವಾ ಇಮೇಲ್ ನಮೂದಿಸಿ",
      footerDesc: "ದೇವನಹಳ್ಳಿ ತಾಲೂಕು, ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ ಜಿಲ್ಲೆಯ ಹಾಲು ಮತ್ತು ರೇಷ್ಮೆಯ ಸಮೃದ್ಧ ನಾಡು. ಜಿಲ್ಲೆಯಲ್ಲೇ ಗರಿಷ್ಠ ಹಾಲು ಮತ್ತು ರೇಷ್ಮೆ ಉತ್ಪಾದಿಸುವ ಹೆಮ್ಮೆಯ ಗ್ರಾಮ.",
      footerCopy: "© ೨೦೨೬ ಯೆಲಿಯೂರು ಗ್ರಾಮ ಪಂಚಾಯತಿ, ದೇವನಹಳ್ಳಿ ತಾಲೂಕು, ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ ಜಿಲ್ಲೆ, ಕರ್ನಾಟಕ. ಸರ್ವ ಹಕ್ಕುಗಳನ್ನು ಕಾಯ್ದಿರಿಸಲಾಗಿದೆ.",
      footerDevCredit: "ಯೆಲಿಯೂರು ಗ್ರಾಮ ಸಮುದಾಯಕ್ಕಾಗಿ ಹೆಮ್ಮೆಯಿಂದ ನಿರ್ಮಿಸಿದವರು: ಚಿರು ಗೌಡ ಯೆಲಿಯೂರು (Chirugowda Yeliyuru)",
      creatorBadgePill: '<svg class="icon icon-sparkles" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="M19 4v4"/><path d="M21 6h-4"/></svg> ನಿರ್ಮಾಣ: <strong>ಚಿರು ಗೌಡ ಯೆಲಿಯೂರು</strong>',
      creatorPortalLabel: "ಅಧಿಕೃತ ಯೆಲಿಯೂರು ಗ್ರಾಮ ಪೋರ್ಟಲ್",
      creatorKnText: "ದೇವನಹಳ್ಳಿ, ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ",
      heroCreatorLabel: "ನಿರ್ಮಾಣ: <strong>ಚಿರು ಗೌಡ ಯೆಲಿಯೂರು</strong> (Chirugowda Yeliyuru)",
      navLabels: {
        about: "ಪರಿಚಯ",
        history: "ಇತಿಹಾಸ",
        quickFacts: "ಮುಖ್ಯಾಂಶಗಳು",
        photos: "ಚಿತ್ರಗಳು",
        temples: "ದೇವಾಲಯಗಳು",
        festivals: "ಹಬ್ಬಗಳು",
        crops: "ಹಾಲು & ರೇಷ್ಮೆ",
        culture: "ಸಂಸ್ಕೃತಿ",
        panchayat: "ಪಂಚಾಯತಿ",
        schoolsHealth: "ಶಾಲೆ & ಆರೋಗ್ಯ",
        transport: "ಸಾರಿಗೆ",
        contacts: "ಸಂಪರ್ಕಗಳು",
        notices: "ಪ್ರಕಟಣೆಗಳು",
        contactForm: "ಸಂದೇಶ ಕಳುಹಿಸಿ",
        map: "ನಕ್ಷೆ"
      }
    }
  };

  // Helper to resolve localized string
  function t(obj) {
    if (!obj) return "";
    if (typeof obj === 'string') return obj;
    return obj[currentLanguage] || obj.en || "";
  }

  // Helper to generate direct 1-tap WhatsApp chat URL
  function getWhatsAppChatUrl(phone, lang) {
    const defaultNumber = "+91 98765 43210";
    const rawNumber = phone || (VILLAGE_DATA.creator && VILLAGE_DATA.creator.whatsappNumber) || defaultNumber;
    const cleanDigits = String(rawNumber).replace(/[^\d]/g, '');
    const greeting = (lang === 'kn')
      ? "ನಮಸ್ಕಾರ ಚಿರು ಗೌಡ ಅವರೇ, ಯೆಲಿಯೂರು ಗ್ರಾಮ ಪೋರ್ಟಲ್ ಕುರಿತು ಮಾತನಾಡಲು ಸಂದೇಶ ಕಳುಹಿಸುತ್ತಿದ್ದೇನೆ."
      : "Hello Chirugowda, I am reaching out to you from the Yeliyuru Village Portal.";
    return `https://wa.me/${cleanDigits}?text=${encodeURIComponent(greeting)}`;
  }

  // ---------------------------------------------------------------------------
  // 2. THEME HANDLING
  // ---------------------------------------------------------------------------
  function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
      themeIcon.innerHTML = (theme === 'dark') ? iconSvg('sun') : iconSvg('moon');
    }
    localStorage.setItem('village_theme', theme);
  }

  function toggleTheme() {
    const nextTheme = (currentTheme === 'dark') ? 'light' : 'dark';
    applyTheme(nextTheme);
    showToast((nextTheme === 'dark') ? "Dark mode enabled" : "Light mode enabled");
  }

  // Listen to system preference change if not manually locked
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('village_theme')) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });

  // ---------------------------------------------------------------------------
  // 3. DISPLAY HEADER & BANNER
  // ---------------------------------------------------------------------------
  function renderHeaderAndBanner(lang) {
    const data = VILLAGE_DATA;
    const ui = UI_TEXT[lang];

    // Document title
    document.title = (lang === 'kn') 
      ? `ಯೆಲಿಯೂರು ಗ್ರಾಮ ಪೋರ್ಟಲ್ - ದೇವನಹಳ್ಳಿ, ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ`
      : `Yeliyuru Village Portal - Devanahalli, Bengaluru Rural`;

    // Brand and Subtitle
    const navTitle = document.getElementById('nav-brand-title');
    const navSub = document.getElementById('nav-brand-sub');
    if (navTitle) navTitle.textContent = t(data.name);
    if (navSub) navSub.textContent = t(data.shortSub || data.subtitle);

    // Hero Section
    const heroSec = document.getElementById('hero');
    if (heroSec && data.banner && data.banner.image) {
      heroSec.style.backgroundImage = `url('${data.banner.image}')`;
    }
    const heroTitle = document.getElementById('hero-title');
    const heroTagline = document.getElementById('hero-tagline');
    const heroBadgeText = document.getElementById('hero-badge-text');
    if (heroTitle) heroTitle.textContent = t(data.name);
    if (heroTagline) heroTagline.textContent = t(data.tagline);
    if (heroBadgeText) heroBadgeText.textContent = t(data.subtitle);

    // Creator Top Banner (First on the Page)
    const creatorBadgePill = document.getElementById('creator-badge-pill');
    const creatorPortalLabel = document.getElementById('creator-portal-label');
    const creatorKnText = document.getElementById('creator-kn-text');
    if (creatorBadgePill) creatorBadgePill.innerHTML = ui.creatorBadgePill;
    if (creatorPortalLabel) creatorPortalLabel.textContent = ui.creatorPortalLabel;
    if (creatorKnText) creatorKnText.textContent = ui.creatorKnText;

    // Floating 1-tap WhatsApp chat button
    const floatingWhatsAppBtn = document.getElementById('floating-whatsapp-btn');
    const floatingWhatsAppText = document.getElementById('floating-whatsapp-text');
    const waUrl = getWhatsAppChatUrl(data.creator?.whatsappNumber, lang);
    if (floatingWhatsAppBtn) {
      floatingWhatsAppBtn.href = waUrl;
      floatingWhatsAppBtn.setAttribute('title', lang === 'kn' ? `ಚಿರು ಗೌಡ ಅವರೊಂದಿಗೆ ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ ಚಾಟ್ ಮಾಡಿ (${data.creator?.whatsappNumber || '+91 98765 43210'})` : `Chat with Chirugowda on WhatsApp (${data.creator?.whatsappNumber || '+91 98765 43210'})`);
    }
    if (floatingWhatsAppText) {
      floatingWhatsAppText.textContent = ui.chatWhatsApp;
    }

    // Action buttons in header and hero
    const headerMapsText = document.getElementById('header-maps-text');
    const headerShareText = document.getElementById('header-share-text');
    const headerAdminText = document.getElementById('header-admin-text');
    const heroExploreText = document.getElementById('hero-cta-explore-text');
    const heroMapsText = document.getElementById('hero-cta-maps-text');
    const heroShareText = document.getElementById('hero-cta-share-text');

    if (headerMapsText) headerMapsText.textContent = ui.mapsBtn;
    if (headerShareText) headerShareText.textContent = ui.shareBtn;
    if (headerAdminText) headerAdminText.textContent = ui.adminBtn || "Admin";
    if (heroExploreText) heroExploreText.textContent = ui.exploreBtn;
    if (heroMapsText) heroMapsText.textContent = ui.heroMapsBtn || ui.openInMaps;
    if (heroShareText) heroShareText.textContent = ui.heroShareBtn || ui.shareBtn;

    // Language switch active class
    const btnEn = document.getElementById('lang-btn-en');
    const btnKn = document.getElementById('lang-btn-kn');
    if (btnEn && btnKn) {
      btnEn.classList.toggle('active', lang === 'en');
      btnKn.classList.toggle('active', lang === 'kn');
    }

    // Body language class for font switching
    if (lang === 'kn') {
      document.body.classList.add('lang-kn');
    } else {
      document.body.classList.remove('lang-kn');
    }

    // Dynamic Navigation links
    renderNavLinks(lang);

    // Automatic Festival Countdown
    calculateAndShowFestivalCountdown(lang);

    // Footer text
    renderFooter(lang);
  }

  // Render navigation links based on available sections
  function renderNavLinks(lang) {
    const desktopMenu = document.getElementById('desktop-nav-menu');
    const mobileList = document.getElementById('mobile-nav-list');
    const ui = UI_TEXT[lang];

    let desktopHtml = '';
    let mobileHtml = '';

    ORDERED_SECTIONS.forEach(secKey => {
      if (hasSectionData(secKey)) {
        const anchorId = getSectionAnchorId(secKey);
        const label = ui.navLabels[secKey] || secKey;
        desktopHtml += `<a href="#${anchorId}" class="nav-link" data-nav="${secKey}">${label}</a>`;
        mobileHtml += `<li><a href="#${anchorId}" class="nav-link mobile-link" data-nav="${secKey}">${label}</a></li>`;
      }
    });

    // Add quick utility actions to bottom of mobile drawer
    mobileHtml += `
      <li style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem; display: flex; flex-direction: column; gap: 0.65rem;">
        <button type="button" class="btn-action-icon btn-maps" onclick="document.getElementById('header-maps-btn')?.click(); closeMobileMenu();" style="width: 100%; justify-content: center; padding: 0.75rem;">
          ${iconSvg('mapPin')} <span>${ui.mapsBtn} (Google Maps)</span>
        </button>
        <button type="button" class="btn-action-icon btn-whatsapp" onclick="document.getElementById('header-share-btn')?.click(); closeMobileMenu();" style="width: 100%; justify-content: center; padding: 0.75rem;">
          ${iconSvg('messageCircle')} <span>${ui.shareBtn} (WhatsApp)</span>
        </button>
        <a href="admin.html" class="btn-action-icon btn-admin" style="width: 100%; justify-content: center; padding: 0.75rem; text-decoration: none;">
          ${iconSvg('settings')} <span>${ui.adminBtn || 'Admin'} (ಆಡಳಿತ ಫಲಕ)</span>
        </a>
      </li>
    `;

    if (desktopMenu) desktopMenu.innerHTML = desktopHtml;
    if (mobileList) mobileList.innerHTML = mobileHtml;

    // Attach smooth scroll and mobile menu close handlers
    document.querySelectorAll('.mobile-link').forEach(link => {
      link.addEventListener('click', () => {
        closeMobileMenu();
      });
    });
  }

  function getSectionAnchorId(secKey) {
    const mapping = {
      about: 'about',
      history: 'history',
      quickFacts: 'quick-facts',
      photos: 'photos',
      temples: 'temples',
      festivals: 'festivals',
      crops: 'agriculture',
      culture: 'culture',
      panchayat: 'administration',
      schoolsHealth: 'schools-health',
      transport: 'transport',
      contacts: 'contacts',
      notices: 'notices',
      contactForm: 'contact-form',
      map: 'map'
    };
    return mapping[secKey] || secKey;
  }

  // ---------------------------------------------------------------------------
  // 4. DISPLAY SECTIONS IN ORDER (CONDITIONAL RENDERING)
  // ---------------------------------------------------------------------------
  
  // Check if section has data
  function hasSectionData(sectionKey) {
    const data = VILLAGE_DATA;
    switch (sectionKey) {
      case 'about':
        return Boolean(data.about && data.about.description);
      case 'history':
        return Boolean(data.history && data.history.narrative);
      case 'quickFacts':
        return Array.isArray(data.quickFacts) && data.quickFacts.length > 0;
      case 'photos':
        return Array.isArray(data.photos) && data.photos.length > 0;
      case 'temples':
        return Array.isArray(data.temples) && data.temples.length > 0;
      case 'festivals':
        return Array.isArray(data.festivals) && data.festivals.length > 0;
      case 'crops':
        return Array.isArray(data.crops) && data.crops.length > 0;
      case 'culture':
        return false;
      case 'panchayat':
        return Boolean(data.panchayat && (
          (Array.isArray(data.panchayat.leadership) && data.panchayat.leadership.length > 0) ||
          (Array.isArray(data.panchayat.members) && data.panchayat.members.length > 0)
        ));
      case 'schoolsHealth':
        return (Array.isArray(data.schools) && data.schools.length > 0) || (Array.isArray(data.health) && data.health.length > 0);
      case 'transport':
        return Array.isArray(data.transport) && data.transport.length > 0;
      case 'contacts':
        return Array.isArray(data.contacts) && data.contacts.length > 0;
      case 'notices':
        return Array.isArray(data.notices) && data.notices.length > 0;
      case 'contactForm':
        return Boolean(data.contactForm);
      case 'map':
        return Boolean(data.map);
      default:
        return false;
    }
  }

  // Master function to render all sections
  function renderAllSections(lang) {
    const mainContainer = document.getElementById('app-sections');
    if (!mainContainer) return;

    let sectionsHtml = '';

    ORDERED_SECTIONS.forEach(secKey => {
      // IF section has data -> render it; ELSE -> skip it
      if (hasSectionData(secKey)) {
        sectionsHtml += renderSectionHtml(secKey, lang);
      }
    });

    if (!sectionsHtml.trim()) {
      sectionsHtml = `
        <section class="section" style="padding: 4rem 1rem; text-align: center;">
          <div class="container" style="max-width: 650px; margin: 0 auto; background: var(--bg-card, rgba(255,255,255,0.05)); border: 1px dashed var(--border-color, #4b5563); border-radius: 1rem; padding: 3rem 2rem;">
            <div style="font-size: 2.5rem; margin-bottom: 1rem;">🏡</div>
            <h2 style="margin-bottom: 0.75rem; font-size: 1.5rem;">${lang === 'kn' ? 'ಗ್ರಾಮದ ವಿವರಗಳನ್ನು ಸೇರಿಸಲು ಸಿದ್ಧವಾಗಿದೆ' : 'Welcome to the Village Portal'}</h2>
            <p style="color: var(--text-muted, #9ca3af); line-height: 1.6; margin-bottom: 1.5rem;">
              ${lang === 'kn' 
                ? 'ಮಾಹಿತಿ ಮತ್ತು ಫೋಟೋಗಳನ್ನು ಆಡಳಿತ ಫಲಕದಿಂದ (Admin Panel) ಸುಲಭವಾಗಿ ಸೇರಿಸಬಹುದು.' 
                : 'No information or photos have been published yet. You can add your village details, photos, and contacts anytime from the Admin Panel.'}
            </p>
            <a href="admin.html" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.5rem; border-radius: 0.5rem; text-decoration: none; font-weight: 600;">
              <span>⚙️</span>
              <span>${lang === 'kn' ? 'ಆಡಳಿತ ಫಲಕ ತೆರೆಯಿರಿ (Admin Panel)' : 'Open Admin Panel'}</span>
            </a>
          </div>
        </section>
      `;
    }

    mainContainer.innerHTML = sectionsHtml;

    // Re-attach DOM event listeners for rendered interactive elements
    bindDynamicEventListeners();
  }

  // Section HTML Generators
  function renderSectionHtml(secKey, lang) {
    switch (secKey) {
      case 'about':
        return renderAboutSection(lang);
      case 'history':
        return renderHistorySection(lang);
      case 'quickFacts':
        return renderQuickFactsSection(lang);
      case 'photos':
        return renderPhotosSection(lang);
      case 'temples':
        return renderTemplesSection(lang);
      case 'festivals':
        return renderFestivalsSection(lang);
      case 'crops':
        return renderAgricultureSection(lang);
      case 'culture':
        return renderCultureSection(lang);
      case 'panchayat':
        return renderAdministrationSection(lang);
      case 'schoolsHealth':
        return renderSchoolsHealthSection(lang);
      case 'transport':
        return renderTransportSection(lang);
      case 'contacts':
        return renderContactsSection(lang);
      case 'notices':
        return renderNoticesSection(lang);
      case 'contactForm':
        return renderContactFormSection(lang);
      case 'map':
        return renderMapSection(lang);
      default:
        return '';
    }
  }

  // 1. About
  function renderAboutSection(lang) {
    const d = VILLAGE_DATA.about;
    const banner = VILLAGE_DATA.banner || {};
    const aboutImg = (d && d.image) || banner.image || 'assets/images/hero-banner.jpg';
    const highlights = d.highlights || [];

    const highlightsHtml = highlights.map(h => `
      <div class="village-card about-highlight-card">
        <div class="highlight-icon-wrap" aria-hidden="true">${iconSvg(h.icon)}</div>
        <div class="highlight-content">
          <h3>${t(h.title)}</h3>
          <p>${t(h.text)}</p>
        </div>
      </div>
    `).join('');

    return `
      <section class="village-section" id="about">
        <div class="container">
          <div class="section-header">
            <span class="section-eyebrow">${iconSvg('sprout')} ${lang === 'kn' ? 'ಗ್ರಾಮ ಪರಿಚಯ' : 'Discover Our Village'}</span>
            <h2 class="section-title">${t(d.heading)}</h2>
            <p class="section-subtitle">${t(d.subheading)}</p>
          </div>

          <div class="about-hero-grid">
            <div class="about-text-content">
              <p class="about-text-lead">${t(d.description)}</p>
              <div class="about-badge-stats">
                <div class="about-stat-pill">
                  <span>${iconSvg('mapPin')}</span>
                  <span>${lang === 'kn' ? 'ದೇವನಹಳ್ಳಿ, ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ' : 'Devanahalli, Bengaluru Rural'}</span>
                </div>
                <div class="about-stat-pill">
                  <span>${iconSvg('droplet')} & ${iconSvg('silkCocoon')}</span>
                  <span>${lang === 'kn' ? 'ಹಾಲು & ರೇಷ್ಮೆಯ ಸಮೃದ್ಧ ನಾಡು' : 'The Land of Milk & Silk'}</span>
                </div>
                <div class="about-stat-pill">
                  <span>${iconSvg('plane')}</span>
                  <span>${lang === 'kn' ? 'ವಿಮಾನ ನಿಲ್ದಾಣಕ್ಕೆ ಕೇವಲ ೧೮ ಕಿ.ಮೀ' : '18 km to BLR Airport'}</span>
                </div>
              </div>
            </div>
            <div class="about-visual-frame">
              <img src="${aboutImg}" alt="${t(d.heading) || 'Yeliyuru village vista'}" loading="lazy">
            </div>
          </div>

          <div class="village-grid grid-cols-2">
            ${highlightsHtml}
          </div>
        </div>
      </section>
    `;
  }

  // 2. History
  function renderHistorySection(lang) {
    const d = VILLAGE_DATA.history;
    const timeline = d.timeline || [];

    const timelineHtml = timeline.map(item => `
      <div class="timeline-item">
        <div class="timeline-dot" aria-hidden="true"></div>
        <div class="timeline-content">
          <span class="timeline-year">${item.year}</span>
          <h3 class="timeline-title">${t(item.title)}</h3>
          <p class="timeline-desc">${t(item.desc)}</p>
        </div>
      </div>
    `).join('');

    return `
      <section class="village-section" id="history">
        <div class="container">
          <div class="section-header">
            <span class="section-eyebrow">${iconSvg('scroll')} ${lang === 'kn' ? 'ಪರಂಪರೆ & ಇತಿಹಾಸ' : 'Centuries of Heritage'}</span>
            <h2 class="section-title">${t(d.heading)}</h2>
            <p class="section-subtitle">${t(d.subheading)}</p>
          </div>

          <div class="history-narrative-box">
            <p class="history-lead">${t(d.narrative)}</p>
          </div>

          <div class="timeline-container">
            ${timelineHtml}
          </div>
        </div>
      </section>
    `;
  }

  // 3. Quick Facts
  function renderQuickFactsSection(lang) {
    const facts = VILLAGE_DATA.quickFacts || [];
    const factsHtml = facts.map(f => `
      <div class="fact-card">
        <div class="fact-icon-box" aria-hidden="true">${iconSvg(f.icon)}</div>
        <div>
          <div class="fact-label">${t(f.label)}</div>
          <div class="fact-value">${t(f.value)}</div>
        </div>
      </div>
    `).join('');

    return `
      <section class="village-section" id="quick-facts">
        <div class="container">
          <div class="section-header">
            <span class="section-eyebrow">${iconSvg('barChart')} ${lang === 'kn' ? 'ತ್ವರಿತ ಅಂಕಿ-ಅಂಶಗಳು' : 'At A Glance'}</span>
            <h2 class="section-title">${lang === 'kn' ? 'ಗ್ರಾಮದ ಪ್ರಮುಖ ಮುಖ್ಯಾಂಶಗಳು' : 'Quick Facts & Profile'}</h2>
            <p class="section-subtitle">${lang === 'kn' ? 'ಯೆಲಿಯೂರಿನ ಭೌಗೋಳಿಕ, ಜನಸಂಖ್ಯಾ ಹಾಗೂ ಆಡಳಿತಾತ್ಮಕ ಸಂಕ್ಷಿಪ್ತ ವಿವರ.' : 'Essential administrative, geographic, and demographic overview of Yeliyuru.'}</p>
          </div>

          <div class="village-grid grid-cols-4">
            ${factsHtml}
          </div>
        </div>
      </section>
    `;
  }

  // 4. Photos (Gallery)
  function renderPhotosSection(lang) {
    const photos = VILLAGE_DATA.photos || [];
    const photosHtml = photos.map((p, idx) => `
      <div class="photo-gallery-item" data-photo-index="${idx}" role="button" tabindex="0" aria-label="${t(p.title)}">
        <img src="${p.url}" alt="${t(p.title)}" loading="lazy">
        <div class="photo-gallery-overlay">
          <span class="photo-gallery-tag">${t(p.tag)}</span>
          <h3 class="photo-gallery-title">${t(p.title)}</h3>
          <p class="photo-gallery-caption">${t(p.caption)}</p>
        </div>
      </div>
    `).join('');

    return `
      <section class="village-section" id="photos">
        <div class="container">
          <div class="section-header">
            <span class="section-eyebrow">${iconSvg('camera')} ${lang === 'kn' ? 'ಛಾಯಾಚಿತ್ರ ಗ್ಯಾಲರಿ' : 'Visual Gallery'}</span>
            <h2 class="section-title">${lang === 'kn' ? 'ಯೆಲಿಯೂರಿನ ಸುಂದರ ದೃಶ್ಯಾವಳಿಗಳು' : 'Village Photographic Impressions'}</h2>
            <p class="section-subtitle">${lang === 'kn' ? 'ಕ್ಲಿಕ್ ಮಾಡಿ ದೊಡ್ಡ ಪರದೆಯಲ್ಲಿ ವೀಕ್ಷಿಸಿ - ನಿಸರ್ಗ, ದೇವಾಲಯಗಳು, ಉತ್ಸವ ಮತ್ತು ಜನಜೀವನ.' : 'Click any photograph to view high resolution gallery with full slideshow controls.'}</p>
          </div>

          <div class="village-grid grid-cols-3">
            ${photosHtml}
          </div>
        </div>
      </section>
    `;
  }

  // 5. Temples
  function renderTemplesSection(lang) {
    const temples = VILLAGE_DATA.temples || [];
    const ui = UI_TEXT[lang];

    const templesHtml = temples.map(tmp => `
      <div class="temple-card">
        <img src="${tmp.image}" alt="${t(tmp.name)}" class="temple-card-image" loading="lazy">
        <div class="temple-card-body">
          <span class="temple-deity-badge">${iconSvg('landmark')} ${t(tmp.deity)}</span>
          <h3 class="temple-name">${t(tmp.name)}</h3>
          <p class="temple-history">${t(tmp.history)}</p>
          <div class="temple-meta">
            <div class="meta-row">
              <span>${iconSvg('clock')}</span>
              <span><strong>${ui.timings}:</strong> ${t(tmp.timings)}</span>
            </div>
            <div class="meta-row">
              <span>${iconSvg('sparkles')}</span>
              <span><strong>${ui.speciality}:</strong> ${t(tmp.speciality)}</span>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    return `
      <section class="village-section" id="temples">
        <div class="container">
          <div class="section-header">
            <span class="section-eyebrow">${iconSvg('landmark')} ${lang === 'kn' ? 'ಪವಿತ್ರ ಪುಣ್ಯಕ್ಷೇತ್ರಗಳು' : 'Sacred Shrines'}</span>
            <h2 class="section-title">${lang === 'kn' ? 'ದೇವಾಲಯಗಳು ಮತ್ತು ಪೂಜಾ ಪರಂಪರೆ' : 'Ancient Temples & Sanctuaries'}</h2>
            <p class="section-subtitle">${lang === 'kn' ? 'ಗ್ರಾಮದ ರಕ್ಷಕ ದೇವತೆಗಳು ಮತ್ತು ಶತಮಾನಗಳ ಇತಿಹಾಸ ಹೊಂದಿರುವ ಸುಂದರ ಶಿಲಾ ದೇಗುಲಗಳು.' : 'Centuries-old Dravidian sanctums bestowing peace, prosperity, and communal harmony.'}</p>
          </div>

          <div class="village-grid grid-cols-3">
            ${templesHtml}
          </div>
        </div>
      </section>
    `;
  }

  // 6. Festivals
  function renderFestivalsSection(lang) {
    const festivals = VILLAGE_DATA.festivals || [];
    const heroFestivalCard = document.getElementById('hero-festival-card');
    if (!festivals || festivals.length === 0) {
      if (heroFestivalCard) heroFestivalCard.style.display = 'none';
      return;
    }
    if (heroFestivalCard) heroFestivalCard.style.display = '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const festivalsHtml = festivals.map(fest => {
      const festDate = new Date(fest.date);
      festDate.setHours(0, 0, 0, 0);
      const isUpcoming = festDate >= today;
      const diffTime = festDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let countdownBadge = '';
      if (isUpcoming) {
        if (diffDays === 0) {
          countdownBadge = `<span class="countdown-live-badge">${iconSvg('flame')} ${lang === 'kn' ? 'ಇಂದೇ ಹಬ್ಬ!' : 'Today!'}</span>`;
        } else if (diffDays === 1) {
          countdownBadge = `<span class="countdown-live-badge">${iconSvg('clock')} ${lang === 'kn' ? 'ನಾಳೆಯೇ ಹಬ್ಬ!' : 'Tomorrow!'}</span>`;
        } else {
          countdownBadge = `<span class="countdown-live-badge">${iconSvg('clock')} ${diffDays} ${lang === 'kn' ? 'ದಿನಗಳು ಬಾಕಿ' : 'Days left'}</span>`;
        }
      } else {
        countdownBadge = `<span style="color:var(--text-subtle); display: inline-flex; align-items: center; gap: 0.25rem;">${iconSvg('check')} ${lang === 'kn' ? 'ಸಂಪನ್ನಗೊಂಡಿದೆ' : 'Celebrated'}</span>`;
      }

      return `
        <div class="festival-card ${isUpcoming && diffDays <= 30 ? 'upcoming-highlight' : ''}">
          <div class="festival-card-header">
            <span class="festival-date-tag">${iconSvg('calendar')} ${fest.month}</span>
            <span class="festival-tag-pill">${t(fest.tag)}</span>
          </div>
          <h3 class="festival-name">${t(fest.name)}</h3>
          <p class="festival-desc">${t(fest.description)}</p>
          <div class="festival-countdown-indicator">
            <span>${lang === 'kn' ? 'ಆಚರಣೆ ಸ್ಥಿತಿ:' : 'Status:'}</span>
            ${countdownBadge}
          </div>
        </div>
      `;
    }).join('');

    return `
      <section class="village-section" id="festivals">
        <div class="container">
          <div class="section-header">
            <span class="section-eyebrow">${iconSvg('sparkles')} ${lang === 'kn' ? 'ಸಡಗರದ ಹಬ್ಬಗಳು' : 'Celebrations & Jathre'}</span>
            <h2 class="section-title">${lang === 'kn' ? 'ಗ್ರಾಮದ ಪ್ರಮುಖ ಹಬ್ಬಗಳು & ಉತ್ಸವಗಳು' : 'Upcoming Festivals & Sacred Fairs'}</h2>
            <p class="section-subtitle">${lang === 'kn' ? 'ವರ್ಷವಿಡೀ ಗ್ರಾಮದಲ್ಲಿ ಜರುಗುವ ಜಾತ್ರೆ, ರಥೋತ್ಸವ, ನಾಡುಹಬ್ಬ ಮತ್ತು ಧಾರ್ಮಿಕ ಆಚರಣೆಗಳು.' : 'Colourful community fairs, temple chariot processions, and festive folk customs.'}</p>
          </div>

          <div class="village-grid grid-cols-3">
            ${festivalsHtml}
          </div>
        </div>
      </section>
    `;
  }

  // 7. Agriculture (Crops)
  function renderAgricultureSection(lang) {
    const crops = VILLAGE_DATA.crops || [];
    const ui = UI_TEXT[lang];

    const cropsHtml = crops.map(c => `
      <div class="crop-card">
        ${c.image ? `<div class="crop-image-cover" style="width:100%;height:180px;border-radius:12px;overflow:hidden;margin-bottom:1rem;"><img src="${c.image}" alt="${t(c.name)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy"></div>` : ''}
        <div class="crop-header">
          <span class="crop-icon-large" aria-hidden="true">${iconSvg(c.icon)}</span>
          <span class="crop-badge">${t(c.badge)}</span>
        </div>
        <h3 class="crop-title">${t(c.name)}</h3>
        <div class="crop-type-sub">${t(c.type)}</div>
        <div class="crop-stats-row">
          <div class="crop-stat-col">
            <strong>${t(c.acreage)}</strong>
            <span>${ui.annualYield}</span>
          </div>
          <div class="crop-stat-col">
            <strong>${t(c.season)}</strong>
            <span>${ui.cultivationSeason}</span>
          </div>
        </div>
        <p class="crop-desc">${t(c.description)}</p>
      </div>
    `).join('');

    return `
      <section class="village-section" id="agriculture">
        <div class="container">
          <div class="section-header">
            <span class="section-eyebrow">${iconSvg('sprout')} ${lang === 'kn' ? 'ಕೃಷಿ ಸಮೃದ್ಧಿ' : 'Bountiful Harvest'}</span>
            <h2 class="section-title">${lang === 'kn' ? 'ಯೆಲಿಯೂರಿನ ಪ್ರಮುಖ ಬೆಳೆಗಳು & ಕೃಷಿ ಪದ್ಧತಿ' : 'Agriculture, Crops & Irrigation'}</h2>
            <p class="section-subtitle">${lang === 'kn' ? 'ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ ಜಿಲ್ಲೆಯಲ್ಲೇ ಅತಿ ದೊಡ್ಡ ಹಾಲು ಮತ್ತು ರೇಷ್ಮೆ ಉತ್ಪಾದಕ ಗ್ರಾಮ; ಹೈನುಗಾರಿಕೆ ಮತ್ತು ಹಿಪ್ಪುನೇರಳೆ ರೇಷ್ಮೆ ಕೃಷಿ.' : 'The biggest producer of milk and silk in Bengaluru Rural district, driven by modern dairy cooperatives and sericulture.'}</p>
          </div>

          <div class="village-grid grid-cols-3">
            ${cropsHtml}
          </div>
        </div>
      </section>
    `;
  }

  // 8. Culture
  function renderCultureSection(lang) {
    const d = VILLAGE_DATA.culture;
    if (!d || !d.aspects || d.aspects.length === 0) return '';
    const aspects = d.aspects || [];

    const aspectsHtml = aspects.map(asp => `
      <div class="culture-card">
        <div class="culture-icon-box" aria-hidden="true">${iconSvg(asp.icon)}</div>
        <div class="culture-content">
          <h3>${t(asp.title)}</h3>
          <p>${t(asp.text)}</p>
        </div>
      </div>
    `).join('');

    return `
      <section class="village-section" id="culture">
        <div class="container">
          <div class="section-header">
            <span class="section-eyebrow">${iconSvg('theater')} ${lang === 'kn' ? 'ಜಾನಪದ ಕಲೆ & ಬದುಕು' : 'Folk Heritage'}</span>
            <h2 class="section-title">${t(d.heading)}</h2>
            <p class="section-subtitle">${t(d.subheading)}</p>
          </div>

          <div class="culture-grid-wrap">
            ${aspectsHtml}
          </div>
        </div>
      </section>
    `;
  }

  // 9. Administration (Grama Panchayat)
  function renderAdministrationSection(lang) {
    const d = VILLAGE_DATA.panchayat || {};
    const leaders = d.leadership || d.members || [];
    const services = d.services || [];

    const leadersHtml = leaders.map(lead => {
      const contactRaw = lead.contact || lead.phone || '';
      const telClean = contactRaw.replace(/[^+\d]/g, '');
      const iconKey = lead.icon || 'award';
      return `
        <div class="leader-card">
          <div class="leader-icon-circle">${iconSvg(iconKey)}</div>
          <div class="leader-role">${t(lead.role)}</div>
          <h4 class="leader-name">${t(lead.name)}</h4>
          <div class="leader-contact">
            ${telClean ? `
              <a href="tel:${telClean}" title="${lang === 'kn' ? 'ಕರೆ ಮಾಡಿ' : 'Call'}: ${t(lead.name)} (${contactRaw})">
                ${iconSvg('phone')} <span>${contactRaw}</span>
              </a>
            ` : `
              <span>${iconSvg('phone')} ${contactRaw || '—'}</span>
            `}
          </div>
        </div>
      `;
    }).join('');

    const servicesHtml = services.map(srv => `
      <div class="service-card">
        <div class="service-icon">${iconSvg('check')}</div>
        <div>
          <h4 class="service-title">${t(srv.name)}</h4>
          <p class="service-desc">${t(srv.desc)}</p>
        </div>
      </div>
    `).join('');

    const officeName = (d.office && d.office.name) || d.officeName || { en: "Yeliyuru Grama Panchayat Office", kn: "ಯೆಲಿಯೂರು ಗ್ರಾಮ ಪಂಚಾಯತಿ ಕಾರ್ಯಾಲಯ" };
    const officeAddress = (d.office && d.office.address) || d.officeAddress || { en: "Main Road, Yeliyuru, Devanahalli Taluk, Bengaluru Rural - 562110", kn: "ಮುಖ್ಯ ರಸ್ತೆ, ಯೆಲಿಯೂರು, ದೇವನಹಳ್ಳಿ ತಾಲೂಕು, ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ - ೫೬೨೧೧೦" };
    const officeHours = (d.office && d.office.workingHours) || d.workingHours || { en: "Monday to Saturday: 10:00 AM - 5:30 PM (2nd & 4th Sat Holiday)", kn: "ಸೋಮವಾರದಿಂದ ಶನಿವಾರ: ಬೆಳಗ್ಗೆ ೧೦:೦೦ - ಸಂಜೆ ೫:೩೦" };

    return `
      <section class="village-section" id="administration">
        <div class="container">
          <div class="section-header">
            <span class="section-eyebrow">${iconSvg('landmark')} ${lang === 'kn' ? 'ಗ್ರಾಮ ಆಡಳಿತ' : 'Local Self-Governance'}</span>
            <h2 class="section-title">${t(d.heading || { en: "Grama Panchayat Administration", kn: "ಗ್ರಾಮ ಪಂಚಾಯತಿ ಆಡಳಿತ" })}</h2>
            <p class="section-subtitle">${t(d.subheading || { en: "Devanahalli Taluk, Bengaluru Rural District — Dedicated to sustainable development and digital citizen services.", kn: "ದೇವನಹಳ್ಳಿ ತಾಲೂಕು, ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ ಜಿಲ್ಲೆ — ಗ್ರಾಮದ ಸಮಗ್ರ ಪ್ರಗತಿಗೆ ಬದ್ಧವಾಗಿರುವ ಪಾರದರ್ಶಕ ಆಡಳಿತ." })}</p>
          </div>

          <div class="panchayat-overview">
            <div class="panchayat-image-wrap">
              <img src="${d.image || 'assets/images/panchayat.jpg'}" alt="Yeliyuru Grama Panchayat Secretariat" loading="lazy">
            </div>
            <div class="panchayat-info-box">
              <div class="panchayat-info-card">
                <div class="panchayat-info-label">${lang === 'kn' ? 'ಕಚೇರಿ ವಿಳಾಸ' : 'Office Secretariat'}</div>
                <h4>${t(officeName)}</h4>
                <p style="color:var(--text-muted); font-size:0.9rem;">${t(officeAddress)}</p>
              </div>
              <div class="panchayat-info-card">
                <div class="panchayat-info-label">${lang === 'kn' ? 'ಕಾರ್ಯಾಲಯದ ಸಮಯ' : 'Public Working Hours'}</div>
                <p style="color:var(--text-muted); font-size:0.9rem;">${t(officeHours)}</p>
              </div>
            </div>
          </div>

          ${leaders.length > 0 ? `
          <div class="panchayat-leaders-grid">
            ${leadersHtml}
          </div>
          ` : ''}

          ${services.length > 0 ? `
          <h3 class="services-section-title">
            ${lang === 'kn' ? 'ಗ್ರಾಮ ಪಂಚಾಯತಿ ಪ್ರಮುಖ ಡಿಜಿಟಲ್ & ಸಾರ್ವಜನಿಕ ಸೇವೆಗಳು' : 'Key Citizen Services & Welfare Schemes'}
          </h3>
          <div class="services-grid">
            ${servicesHtml}
          </div>` : ''}
        </div>
      </section>
    `;
  }

  // 10. Schools & Health
  function renderSchoolsHealthSection(lang) {
    const schools = VILLAGE_DATA.schools || [];
    const health = VILLAGE_DATA.health || [];

    const schoolsHtml = schools.map(sch => `
      <div class="school-card">
        <span class="school-type-pill">${iconSvg('graduationCap')} ${sch.established}</span>
        <h3 class="school-name">${t(sch.name)}</h3>
        <div class="school-head">${t(sch.type)} | <strong>${t(sch.headmaster)}</strong></div>
        <ul class="feature-list">
          ${sch.features.map(f => `<li>${t(f)}</li>`).join('')}
        </ul>
      </div>
    `).join('');

    const healthHtml = health.map(h => `
      <div class="health-card">
        <span class="health-badge">${iconSvg('hospital')} ${t(h.tag)}</span>
        <h3 class="health-name">${t(h.name)}</h3>
        <div class="health-doctor">${t(h.incharge || h.doctor)} | ${iconSvg('clock')} ${t(h.hours || h.timings)}</div>
        <p style="font-weight:700; font-size:0.9rem; margin-bottom:0.75rem;">${iconSvg('phone')} Helpline: ${h.phone || h.contact}</p>
        <ul class="feature-list">
          ${h.services.map(s => `<li>${t(s)}</li>`).join('')}
        </ul>
      </div>
    `).join('');

    return `
      <section class="village-section" id="schools-health">
        <div class="container">
          <div class="section-header">
            <span class="section-eyebrow">${iconSvg('graduationCap')} & ${iconSvg('hospital')} ${lang === 'kn' ? 'ಶಿಕ್ಷಣ ಮತ್ತು ಆರೋಗ್ಯ' : 'Community Welfare'}</span>
            <h2 class="section-title">${lang === 'kn' ? 'ಶಾಲೆಗಳು ಹಾಗೂ ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರ' : 'Educational & Healthcare Infrastructure'}</h2>
            <p class="section-subtitle">${lang === 'kn' ? 'ಮಕ್ಕಳ ಉಜ್ವಲ ಭವಿಷ್ಯಕ್ಕಾಗಿ ಶಾಲೆಗಳು ಹಾಗೂ ೨೪ ಗಂಟೆಗಳ ತುರ್ತು ಆರೋಗ್ಯ ಸೇವೆ.' : 'Nurturing young minds and safeguarding community health round the clock.'}</p>
          </div>

          <div class="subheading-badge">${iconSvg('building')} ${lang === 'kn' ? 'ಗ್ರಾಮದ ಶಾಲೆಗಳು' : 'Educational Institutions'}</div>
          <div class="village-grid grid-cols-3" style="margin-bottom: 3.5rem;">
            ${schoolsHtml}
          </div>

          <div class="subheading-badge">${iconSvg('hospital')} ${lang === 'kn' ? 'ಆರೋಗ್ಯ ಸೌಲಭ್ಯಗಳು' : 'Healthcare & Pharmacy Facilities'}</div>
          <div class="village-grid grid-cols-2">
            ${healthHtml}
          </div>
        </div>
      </section>
    `;
  }

  // 11. Transport
  function renderTransportSection(lang) {
    const transport = VILLAGE_DATA.transport || [];

    const transportHtml = transport.map(tr => `
      <div class="transport-card">
        <div class="transport-icon-box" aria-hidden="true">${iconSvg(tr.icon)}</div>
        <div class="transport-mode">${t(tr.mode)}</div>
        <h3 class="transport-title">${t(tr.title)}</h3>
        <p class="transport-desc">${t(tr.description)}</p>
        <div class="transport-timings-box">
          <span>${iconSvg('clock')}</span>
          <span>${t(tr.timings || tr.frequency)}</span>
        </div>
      </div>
    `).join('');

    return `
      <section class="village-section" id="transport">
        <div class="container">
          <div class="section-header">
            <span class="section-eyebrow">${iconSvg('bus')} ${lang === 'kn' ? 'ಸಾರಿಗೆ ಸಂಪರ್ಕ' : 'Connectivity'}</span>
            <h2 class="section-title">${lang === 'kn' ? 'ರೈಲು, ಬಸ್ ಮತ್ತು ರಸ್ತೆ ಸಾರಿಗೆ' : 'How to Commute & Travel'}</h2>
            <p class="section-subtitle">${lang === 'kn' ? 'ಬೆಂಗಳೂರು-ಮೈಸೂರು ಮಾರ್ಗದ ರೈಲು ನಿಲ್ದಾಣ ಮತ್ತು ಹೆದ್ದಾರಿ ಬಸ್ ಸೌಲಭ್ಯ.' : 'Direct railway station, KSRTC bus corridor, and village local transit services.'}</p>
          </div>

          <div class="village-grid grid-cols-3">
            ${transportHtml}
          </div>
        </div>
      </section>
    `;
  }

  // 12. Contacts
  function renderContactsSection(lang) {
    const contacts = VILLAGE_DATA.contacts || [];
    const ui = UI_TEXT[lang];

    const creatorPhone = (VILLAGE_DATA.creator && VILLAGE_DATA.creator.whatsappNumber) || '+91 98765 43210';
    const creatorName = t(VILLAGE_DATA.creator) || 'Chirugowda Yeliyuru';
    const creatorCardHtml = `
      <div class="contact-card creator-contact-card" style="border: 1.5px solid #25d366; background: linear-gradient(135deg, var(--bg-card) 0%, rgba(37, 211, 102, 0.06) 100%);">
        <div class="contact-card-top">
          <div class="contact-icon-bubble" style="background: rgba(37, 211, 102, 0.15); color: #25d366;" aria-hidden="true">${iconSvg('messageCircle')}</div>
          <div>
            <div class="contact-category" style="color: #25d366; font-weight: 700;">${lang === 'kn' ? 'ಪೋರ್ಟಲ್ ನಿರ್ಮಾತೃ ನೇರ ಸಂಪರ್ಕ' : 'Portal Creator & Direct Helpline'}</div>
            <h3 class="contact-title">${creatorName}</h3>
          </div>
        </div>
        <div class="contact-officer">${lang === 'kn' ? 'ತಾಂತ್ರಿಕ ಮಾರ್ಗದರ್ಶನ & ಮಾಹಿತಿ ನೆರವು' : 'Technical Lead & Village Coordinator'}</div>
        <div style="font-size:0.85rem; color:var(--text-subtle); margin-bottom:1.25rem;">
          ${iconSvg('mapPin')} ${lang === 'kn' ? 'ಯೆಲಿಯೂರು ಗ್ರಾಮ, ದೇವನಹಳ್ಳಿ' : 'Yeliyuru Village, Devanahalli'} • <strong style="color: var(--text-main);">${creatorPhone}</strong>
        </div>
        <div class="contact-buttons-row">
          <a href="${getWhatsAppChatUrl(creatorPhone, lang)}" target="_blank" rel="noopener noreferrer" class="btn-contact-action" style="background:#25d366; color:#ffffff; border-color:#25d366;" title="Chat directly on WhatsApp">
            <span>${iconSvg('messageCircle')}</span>
            <span>${ui.chatWhatsApp}</span>
          </a>
          <button type="button" class="btn-contact-action btn-copy-phone" data-phone="${creatorPhone}" title="Copy phone number">
            <span>${iconSvg('copy')}</span>
            <span>${ui.copyNumber}</span>
          </button>
        </div>
      </div>
    `;

    const contactsHtml = creatorCardHtml + contacts.map(c => `
      <div class="contact-card">
        <div class="contact-card-top">
          <div class="contact-icon-bubble" aria-hidden="true">${iconSvg(c.icon)}</div>
          <div>
            <div class="contact-category">${t(c.category)}</div>
            <h3 class="contact-title">${t(c.title)}</h3>
          </div>
        </div>
        <div class="contact-officer">${t(c.officer || c.person)}</div>
        <div style="font-size:0.85rem; color:var(--text-subtle); margin-bottom:1.25rem;">
          ${iconSvg('mapPin')} ${t(c.location)}
        </div>
        <div class="contact-buttons-row">
          <a href="tel:${c.phone.replace(/[^0-9+]/g, '')}" class="btn-contact-action" title="Call directly">
            <span>${iconSvg('phone')}</span>
            <span>${ui.callNow}</span>
          </a>
          <button type="button" class="btn-contact-action btn-copy-phone" data-phone="${c.phone}" title="Copy phone number">
            <span>${iconSvg('copy')}</span>
            <span>${ui.copyNumber}</span>
          </button>
        </div>
      </div>
    `).join('');

    return `
      <section class="village-section" id="contacts">
        <div class="container">
          <div class="section-header">
            <span class="section-eyebrow">${iconSvg('phone')} ${lang === 'kn' ? 'ತುರ್ತು ಸಂಪರ್ಕ ಕೋಶ' : 'Emergency Directory'}</span>
            <h2 class="section-title">${lang === 'kn' ? 'ಅಧಿಕೃತ ಸಂಪರ್ಕ ವಿವರಗಳು & ಸಹಾಯವಾಣಿ' : 'Important Contacts & Helplines'}</h2>
            <p class="section-subtitle">${lang === 'kn' ? 'ಗ್ರಾಮ ಪಂಚಾಯತಿ, ಆಸ್ಪತ್ರೆ, ಬೆಸ್ಕಾಂ ಹಾಗೂ ಪೊಲೀಸ್ ಸಂಪರ್ಕ ವಿವರಗಳು.' : 'Instant dial or copy contact numbers for village administration and emergency services.'}</p>
          </div>

          <div class="village-grid grid-cols-3">
            ${contactsHtml}
          </div>
        </div>
      </section>
    `;
  }

  // 13. Notices
  function renderNoticesSection(lang) {
    const notices = VILLAGE_DATA.notices || [];

    const noticesHtml = notices.map(n => `
      <div class="notice-card ${n.urgent ? 'urgent-notice' : ''}">
        <div class="notice-meta-bar">
          <span class="notice-badge ${n.urgent ? 'urgent' : 'normal'}">${t(n.badge || n.category)}</span>
          <span class="notice-date">${iconSvg('calendar')} ${n.date}</span>
        </div>
        <h3 class="notice-title">${t(n.title)}</h3>
        <p class="notice-desc">${t(n.description || n.desc)}</p>
      </div>
    `).join('');

    return `
      <section class="village-section" id="notices">
        <div class="container">
          <div class="section-header">
            <span class="section-eyebrow">${iconSvg('megaphone')} ${lang === 'kn' ? 'ಸಾರ್ವಜನಿಕ ಪ್ರಕಟಣೆಗಳು' : 'Announcements'}</span>
            <h2 class="section-title">${lang === 'kn' ? 'ಗ್ರಾಮದ ಇತ್ತೀಚಿನ ಪ್ರಕಟಣೆಗಳು & ಸೂಚನೆಗಳು' : 'Public Notices & Announcements'}</h2>
            <p class="section-subtitle">${lang === 'kn' ? 'ಕಾಲುವೆ ನೀರು, ಜಾನುವಾರು ಲಸಿಕೆ, ಗ್ರಾಮ ಸಭೆ ಮತ್ತು ಯುವಜನ ಕ್ರೀಡಾ ಮಾಹಿತಿ.' : 'Official circulars, irrigation release updates, and public welfare alerts.'}</p>
          </div>

          <div class="village-grid grid-cols-2">
            ${noticesHtml}
          </div>
        </div>
      </section>
    `;
  }

  // 14. Contact Form
  function renderContactFormSection(lang) {
    const f = VILLAGE_DATA.contactForm;
    const labels = f.labels;
    const ph = f.placeholders;
    const subjects = f.subjects || [];

    const subjectOptions = subjects.map(s => `<option value="${t(s)}">${t(s)}</option>`).join('');

    return `
      <section class="village-section" id="contact-form">
        <div class="container">
          <div class="section-header">
            <span class="section-eyebrow">${iconSvg('mail')} ${lang === 'kn' ? 'ಸಂದೇಶ ಕಳುಹಿಸಿ' : 'Get In Touch'}</span>
            <h2 class="section-title">${t(f.heading)}</h2>
            <p class="section-subtitle">${t(f.subheading)}</p>
          </div>

          <div class="contact-form-container">
            <div id="form-feedback-box" class="form-feedback-message" role="alert"></div>

            <form id="village-contact-form" novalidate>
              <div class="form-group">
                <label for="form-name" class="form-label">${t(labels.name)}</label>
                <input type="text" id="form-name" class="form-control" placeholder="${t(ph.name)}" required>
              </div>

              <div class="form-group">
                <label for="form-contact" class="form-label">${t(labels.contact)}</label>
                <input type="text" id="form-contact" class="form-control" placeholder="${t(ph.contact)}" required>
              </div>

              <div class="form-group">
                <label for="form-subject" class="form-label">${t(labels.subject)}</label>
                <select id="form-subject" class="form-control">
                  ${subjectOptions}
                </select>
              </div>

              <div class="form-group">
                <label for="form-message" class="form-label">${t(labels.message)}</label>
                <textarea id="form-message" class="form-control" placeholder="${t(ph.message)}" required></textarea>
              </div>

              <button type="submit" id="form-submit-btn" class="btn-submit-form">
                <span>${iconSvg('mail')}</span>
                <span id="submit-btn-text">${t(labels.submit)}</span>
              </button>
            </form>
          </div>
        </div>
      </section>
    `;
  }

  // 15. Map
  function renderMapSection(lang) {
    const m = VILLAGE_DATA.map;
    const howToReach = m.howToReach || [];
    const ui = UI_TEXT[lang];

    const reachHtml = howToReach.map(r => `
      <div class="reach-item">
        <div class="reach-icon-box" aria-hidden="true">${iconSvg(r.icon)}</div>
        <div class="reach-text">
          <h4>${t(r.mode)}</h4>
          <p>${t(r.desc)}</p>
        </div>
      </div>
    `).join('');

    return `
      <section class="village-section" id="map">
        <div class="container">
          <div class="section-header">
            <span class="section-eyebrow">${iconSvg('map')} ${lang === 'kn' ? 'ಸ್ಥಳ & ಗೂಗಲ್ ಮ್ಯಾಪ್ಸ್' : 'Location & Google Maps'}</span>
            <h2 class="section-title">${t(m.heading)}</h2>
            <p class="section-subtitle">${t(m.subheading)}</p>
          </div>

          <!-- Featured Google Maps Satellite & Aerial Showcase Card -->
          <div class="google-map-satellite-showcase">
            <div class="map-satellite-header">
              <div class="map-pill-badge">
                <span class="live-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;box-shadow:0 0 8px #ef4444;"></span>
                <span>${ui.satelliteViewTitle}</span>
              </div>
              <span class="map-coords-badge">${iconSvg('mapPin')} ${m.coordinates}</span>
            </div>
            
            <div class="google-map-image-wrapper" id="google-map-satellite-box" role="button" tabindex="0" title="${ui.openInMaps}">
              <img src="${m.mapImage || 'assets/images/google-map.jpg'}" alt="Google Maps satellite image of Yeliyuru village Devanahalli taluk Bengaluru Rural" class="google-maps-full-img" loading="lazy">
              <div class="map-overlay-banner">
                <div class="map-overlay-info">
                  <strong>${m.locationName}</strong>
                  <span>${lang === 'kn' ? 'ಗೂಗಲ್ ಮ್ಯಾಪ್ಸ್‌ನಲ್ಲಿ ನೇರವಾಗಿ ತೆರೆಯಲು ಕ್ಲಿಕ್ ಮಾಡಿ' : 'Click to open live navigation in Google Maps'}</span>
                </div>
                <button type="button" class="btn-primary btn-maps-overlay" id="map-satellite-click-btn">
                  <span>${iconSvg('mapPin')}</span>
                  <span>${ui.openInMaps}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Interactive Live Map & Directions Grid -->
          <div class="map-layout-grid" style="margin-top: 2.5rem;">
            <div class="map-embed-wrapper">
              <iframe 
                src="${m.embedUrl}" 
                title="Yeliyuru Devanahalli Google Map" 
                loading="lazy" 
                referrerpolicy="no-referrer-when-downgrade">
              </iframe>
            </div>

            <div class="map-directions-box">
              <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:1.25rem;">
                <div style="font-size:0.8rem; font-weight:700; color:var(--text-subtle); text-transform:uppercase; margin-bottom:0.25rem;">
                  ${iconSvg('mapPin')} ${lang === 'kn' ? 'ನಿಖರ ವಿಳಾಸ' : 'Exact Location'}
                </div>
                <h4 style="font-size:1.15rem; margin-bottom:0.25rem;">${m.locationName}</h4>
                <div style="font-size:0.85rem; color:var(--text-muted);">${m.coordinates}</div>
              </div>

              ${reachHtml}

              <div class="map-cta-actions">
                <button type="button" class="btn-primary" id="map-section-open-btn">
                  <span>${iconSvg('mapPin')}</span>
                  <span>${ui.openInMaps}</span>
                </button>
                <button type="button" class="btn-secondary" id="map-section-share-btn">
                  <span>${iconSvg('messageCircle')}</span>
                  <span>${ui.shareBtn}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  // Footer text updater
  function renderFooter(lang) {
    const ui = UI_TEXT[lang];
    const footerBrandTitle = document.getElementById('footer-brand-title');
    const footerBrandSub = document.getElementById('footer-brand-sub');
    const footerBrandDesc = document.getElementById('footer-brand-desc');
    const footerCopy = document.getElementById('footer-copy-text');
    const footerDev = document.getElementById('footer-dev-credit');

    if (footerBrandTitle) footerBrandTitle.textContent = t(VILLAGE_DATA.name);
    if (footerBrandSub) footerBrandSub.textContent = t(VILLAGE_DATA.subtitle);
    if (footerBrandDesc) footerBrandDesc.textContent = ui.footerDesc;
    if (footerCopy) footerCopy.textContent = ui.footerCopy;
    if (footerDev) footerDev.textContent = ui.footerDevCredit;

    // Footer WhatsApp Link
    const footerWhatsAppLink = document.getElementById('footer-whatsapp-chat-link');
    const footerWhatsAppText = document.getElementById('footer-whatsapp-chat-text');
    const creatorPhone = (VILLAGE_DATA.creator && VILLAGE_DATA.creator.whatsappNumber) || '+91 98765 43210';
    if (footerWhatsAppLink) {
      footerWhatsAppLink.href = getWhatsAppChatUrl(creatorPhone, lang);
    }
    if (footerWhatsAppText) {
      footerWhatsAppText.textContent = `${ui.chatWhatsApp} (${creatorPhone})`;
    }
  }

  // ---------------------------------------------------------------------------
  // 5. AUTOMATIC FEATURES
  // ---------------------------------------------------------------------------
  
  /**
   * Festival Countdown Algorithm as specified:
   * today = current date
   * next = the festival with the smallest date that is >= today
   * IF none found
   *     show "No upcoming festivals"
   * ELSE
   *     show next.name + " in " + (next.date - today) + " days"
   */
  function calculateAndShowFestivalCountdown(lang) {
    const nameElem = document.getElementById('countdown-card-name');
    const daysElem = document.getElementById('countdown-card-days');
    const unitElem = document.getElementById('countdown-card-unit');
    const labelElem = document.getElementById('countdown-card-label');

    if (!nameElem || !daysElem) return;

    const ui = UI_TEXT[lang];
    if (labelElem) labelElem.textContent = ui.upcomingCountdownLabel;

    // today = current date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const festivals = VILLAGE_DATA.festivals || [];

    // Filter festivals with date >= today
    const validUpcoming = festivals
      .map(fest => {
        const d = new Date(fest.date);
        d.setHours(0, 0, 0, 0);
        return { ...fest, dateObj: d };
      })
      .filter(item => item.dateObj >= today)
      .sort((a, b) => a.dateObj - b.dateObj);

    if (validUpcoming.length === 0) {
      // IF none found -> show "No upcoming festivals"
      nameElem.textContent = ui.noUpcomingFestivals;
      daysElem.textContent = "-";
      unitElem.textContent = "";
    } else {
      // next = the festival with smallest date >= today
      const next = validUpcoming[0];
      const diffTime = next.dateObj - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const festName = t(next.name);

      if (diffDays === 0) {
        nameElem.textContent = `${festName} (${ui.today})`;
        daysElem.textContent = "0";
        unitElem.textContent = ui.today;
      } else {
        // show next.name + " in " + (next.date - today) + " days"
        if (lang === 'kn') {
          nameElem.textContent = `${festName} ${ui.inDays} ${diffDays} ${ui.days}`;
        } else {
          nameElem.textContent = `${festName} ${ui.inDays} ${diffDays} ${ui.days}`;
        }
        daysElem.textContent = diffDays;
        unitElem.textContent = (diffDays === 1) ? ui.dayLeft : ui.daysLeft;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. PHOTO GALLERY & LIGHTBOX
  // ---------------------------------------------------------------------------
  function openLightbox(index) {
    if (!villagePhotos || villagePhotos.length === 0) return;
    currentPhotoIndex = (index + villagePhotos.length) % villagePhotos.length;
    renderLightboxCurrentPhoto();
    const modal = document.getElementById('lightbox-modal');
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeLightbox() {
    const modal = document.getElementById('lightbox-modal');
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  function nextPhoto() {
    // index = (index + 1) mod number_of_photos
    currentPhotoIndex = (currentPhotoIndex + 1) % villagePhotos.length;
    renderLightboxCurrentPhoto();
  }

  function prevPhoto() {
    // index = (index - 1 + number_of_photos) mod number_of_photos
    currentPhotoIndex = (currentPhotoIndex - 1 + villagePhotos.length) % villagePhotos.length;
    renderLightboxCurrentPhoto();
  }

  function renderLightboxCurrentPhoto() {
    const photo = villagePhotos[currentPhotoIndex];
    if (!photo) return;

    const img = document.getElementById('lightbox-img');
    const counter = document.getElementById('lightbox-counter');
    const title = document.getElementById('lightbox-title');
    const desc = document.getElementById('lightbox-desc');
    const ui = UI_TEXT[currentLanguage];

    if (img) {
      img.src = photo.url;
      img.alt = t(photo.title);
    }
    if (counter) {
      counter.textContent = `${ui.photoOf} ${currentPhotoIndex + 1} ${ui.of} ${villagePhotos.length}`;
    }
    if (title) title.textContent = t(photo.title);
    if (desc) desc.textContent = t(photo.caption);
  }

  // ---------------------------------------------------------------------------
  // 7. CONTACT FORM VALIDATION
  // ---------------------------------------------------------------------------
  /**
   * validate_form algorithm:
   * IF name is empty OR message is empty
   *     show "Please fill all required fields"
   * ELSE IF phone/email is provided AND its format is wrong
   *     show "Please enter a valid phone or email"
   * ELSE
   *     send the message
   *     show "Thank you, we received your message"
   *     clear the form
   */
  function validate_form(name, contact, message, lang) {
    const feedbackBox = document.getElementById('form-feedback-box');
    const form = document.getElementById('village-contact-form');
    const ui = UI_TEXT[lang];

    name = (name || "").trim();
    contact = (contact || "").trim();
    message = (message || "").trim();

    // Reset feedback box
    feedbackBox.className = 'form-feedback-message';
    feedbackBox.style.display = 'none';

    // 1. IF name is empty OR message is empty
    if (!name || !message) {
      feedbackBox.textContent = ui.formRequiredError;
      feedbackBox.classList.add('error');
      feedbackBox.style.display = 'block';
      return false;
    }

    // 2. ELSE IF phone/email is provided AND its format is wrong
    if (contact) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      // Phone: 10 digits or international formats (e.g. +91 9876543210 or 9876543210)
      const cleanPhone = contact.replace(/[\s\-\(\)]/g, '');
      const phoneRegex = /^(\+?\d{1,4})?\d{10}$/;

      const isValidEmail = emailRegex.test(contact);
      const isValidPhone = phoneRegex.test(cleanPhone);

      if (!isValidEmail && !isValidPhone) {
        feedbackBox.textContent = ui.formInvalidContact;
        feedbackBox.classList.add('error');
        feedbackBox.style.display = 'block';
        return false;
      }
    } else {
      // If contact was empty, required field
      feedbackBox.textContent = ui.formRequiredError;
      feedbackBox.classList.add('error');
      feedbackBox.style.display = 'block';
      return false;
    }

    // 3. ELSE: send message, show "Thank you, we received your message", clear form
    const subject = document.getElementById('form-subject')?.value || "General Inquiry";
    
    // Save to SQLite Database API + Local Backup
    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contact, subject, message })
    }).catch(err => {
      console.warn("Backend API notice:", err);
    });

    try {
      const existing = JSON.parse(localStorage.getItem('village_messages') || '[]');
      existing.push({
        name,
        contact,
        subject,
        message,
        timestamp: new Date().toISOString()
      });
      localStorage.setItem('village_messages', JSON.stringify(existing));
    } catch (e) {
      console.warn("Storage error:", e);
    }

    feedbackBox.textContent = ui.formSuccessTitle;
    feedbackBox.classList.add('success');
    feedbackBox.style.display = 'block';

    showToast(ui.formSuccessTitle);

    // Clear the form
    if (form) {
      form.reset();
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // 8. VISITOR ACTIONS: SHARE & MAPS
  // ---------------------------------------------------------------------------
  function openGoogleMaps() {
    const url = VILLAGE_DATA.map.googleMapsSearchUrl;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function shareOnWhatsApp() {
    const pageUrl = window.location.href;
    const msg = UI_TEXT[currentLanguage].shareMsg + pageUrl;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  }

  // Toast notification utility
  function showToast(message) {
    const toast = document.getElementById('toast-notice');
    const toastText = document.getElementById('toast-text');
    if (!toast || !toastText) return;

    toastText.textContent = message;
    toast.classList.add('show');
    clearTimeout(window.__toastTimeout);
    window.__toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }

  // Mobile navigation drawer toggle
  function toggleMobileMenu() {
    const drawer = document.getElementById('mobile-nav-drawer');
    const btn = document.getElementById('mobile-menu-btn');
    if (!drawer) return;
    const isOpen = drawer.classList.contains('open');
    if (isOpen) {
      drawer.classList.remove('open');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    } else {
      drawer.classList.add('open');
      if (btn) btn.setAttribute('aria-expanded', 'true');
    }
  }

  function closeMobileMenu() {
    const drawer = document.getElementById('mobile-nav-drawer');
    const btn = document.getElementById('mobile-menu-btn');
    if (drawer) drawer.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  // ---------------------------------------------------------------------------
  // 9. LANGUAGE SWITCH LOGIC
  // ---------------------------------------------------------------------------
  function setLanguage(newLanguage) {
    if (newLanguage !== 'en' && newLanguage !== 'kn') return;
    currentLanguage = newLanguage;
    localStorage.setItem('village_language_pref_v2', currentLanguage);
    localStorage.setItem('village_language', currentLanguage);

    // Re-render header, banner & all sections
    renderHeaderAndBanner(currentLanguage);
    renderAllSections(currentLanguage);

    showToast((newLanguage === 'kn') ? "ಭಾಷೆಯನ್ನು ಕನ್ನಡಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ" : "Language switched to English");
  }

  // ---------------------------------------------------------------------------
  // 10. SCROLL REVEAL INTERSECTION OBSERVER
  // ---------------------------------------------------------------------------
  let scrollRevealObserver = null;

  function initScrollAnimations() {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('is-revealed'));
      return;
    }

    if (scrollRevealObserver) {
      scrollRevealObserver.disconnect();
    }

    scrollRevealObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          obs.unobserve(entry.target);
        }
      });
    }, {
      root: null,
      threshold: 0.08,
      rootMargin: '0px 0px -20px 0px'
    });

    const elementsToReveal = document.querySelectorAll(
      '.village-section .section-header, .about-hero-grid, .village-card, .fact-card, .photo-gallery-item, .temple-card, .crop-card, .leader-card, .service-card, .school-card, .health-card, .contact-card, .notice-card, .google-map-satellite-showcase, .google-map-image-wrapper, .festival-item, .history-narrative-box'
    );

    elementsToReveal.forEach(el => {
      el.classList.add('reveal-on-scroll');
      scrollRevealObserver.observe(el);
    });
  }

  // ---------------------------------------------------------------------------
  // 11. DYNAMIC EVENT LISTENERS BINDING
  // ---------------------------------------------------------------------------
  function bindDynamicEventListeners() {
    // Scroll reveal animations
    initScrollAnimations();

    // Photo gallery click handlers
    document.querySelectorAll('.photo-gallery-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const idx = parseInt(item.getAttribute('data-photo-index'), 10);
        openLightbox(idx);
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const idx = parseInt(item.getAttribute('data-photo-index'), 10);
          openLightbox(idx);
        }
      });
    });

    // Copy phone button click handlers
    document.querySelectorAll('.btn-copy-phone').forEach(btn => {
      btn.addEventListener('click', () => {
        const phone = btn.getAttribute('data-phone');
        if (phone && navigator.clipboard) {
          navigator.clipboard.writeText(phone).then(() => {
            showToast(UI_TEXT[currentLanguage].phoneCopied);
          }).catch(() => {
            showToast(phone);
          });
        } else if (phone) {
          showToast(phone);
        }
      });
    });

    // Contact Form submission
    const contactForm = document.getElementById('village-contact-form');
    if (contactForm) {
      contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('form-name')?.value;
        const contact = document.getElementById('form-contact')?.value;
        const message = document.getElementById('form-message')?.value;
        validate_form(name, contact, message, currentLanguage);
      });
    }

    // Map Section "Open in Maps" button & Satellite Box
    const mapSectionBtn = document.getElementById('map-section-open-btn');
    if (mapSectionBtn) {
      mapSectionBtn.addEventListener('click', openGoogleMaps);
    }

    const satBox = document.getElementById('google-map-satellite-box');
    if (satBox) {
      satBox.addEventListener('click', openGoogleMaps);
    }

    const satBtn = document.getElementById('map-satellite-click-btn');
    if (satBtn) {
      satBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openGoogleMaps();
      });
    }

    const mapShareBtn = document.getElementById('map-section-share-btn');
    if (mapShareBtn) {
      mapShareBtn.addEventListener('click', shareOnWhatsApp);
    }
  }

  // Global static listeners
  function initStaticListeners() {
    // Language Buttons
    const btnEn = document.getElementById('lang-btn-en');
    const btnKn = document.getElementById('lang-btn-kn');
    if (btnEn) btnEn.addEventListener('click', () => setLanguage('en'));
    if (btnKn) btnKn.addEventListener('click', () => setLanguage('kn'));

    // Theme Toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    // Header Action: Open Maps
    const headerMaps = document.getElementById('header-maps-btn');
    if (headerMaps) headerMaps.addEventListener('click', openGoogleMaps);

    const heroMaps = document.getElementById('hero-cta-maps');
    if (heroMaps) heroMaps.addEventListener('click', openGoogleMaps);

    // Header Action: Share
    const headerShare = document.getElementById('header-share-btn');
    if (headerShare) headerShare.addEventListener('click', shareOnWhatsApp);

    const heroShare = document.getElementById('hero-cta-share');
    if (heroShare) heroShare.addEventListener('click', shareOnWhatsApp);

    const footerShare = document.getElementById('footer-share-link');
    if (footerShare) {
      footerShare.addEventListener('click', (e) => {
        e.preventDefault();
        shareOnWhatsApp();
      });
    }

    const footerMaps = document.getElementById('footer-maps-link');
    if (footerMaps) {
      footerMaps.addEventListener('click', (e) => {
        e.preventDefault();
        openGoogleMaps();
      });
    }

    // Mobile Menu Toggle
    const mobileBtn = document.getElementById('mobile-menu-btn');
    if (mobileBtn) mobileBtn.addEventListener('click', toggleMobileMenu);

    // Lightbox Controls
    const lbClose = document.getElementById('lightbox-close-btn');
    const lbNext = document.getElementById('lightbox-next-btn');
    const lbPrev = document.getElementById('lightbox-prev-btn');
    const lbModal = document.getElementById('lightbox-modal');

    if (lbClose) lbClose.addEventListener('click', closeLightbox);
    if (lbNext) lbNext.addEventListener('click', nextPhoto);
    if (lbPrev) lbPrev.addEventListener('click', prevPhoto);

    if (lbModal) {
      lbModal.addEventListener('click', (e) => {
        if (e.target === lbModal) closeLightbox();
      });
    }

    // Keyboard navigation for Lightbox
    window.addEventListener('keydown', (e) => {
      if (document.getElementById('lightbox-modal')?.classList.contains('active')) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowRight') nextPhoto();
        if (e.key === 'ArrowLeft') prevPhoto();
      }
    });

    // Back to Top Button
    const bttBtn = document.getElementById('back-to-top-btn');
    window.addEventListener('scroll', () => {
      if (bttBtn) {
        if (window.scrollY > 400) {
          bttBtn.classList.add('visible');
        } else {
          bttBtn.classList.remove('visible');
        }
      }
    });

    if (bttBtn) {
      bttBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 11. INITIALIZATION LIFECYCLE
  // ---------------------------------------------------------------------------
  function init() {
    // 1. Setup Theme
    applyTheme(currentTheme);

    // 2. Setup Language & Render Header / Banner
    renderHeaderAndBanner(currentLanguage);

    // 3. Render 15 Sections in Order conditionally
    renderAllSections(currentLanguage);

    // 4. Attach Static Event Listeners
    initStaticListeners();

    console.log("Yeliyuru Village Portal initialized successfully.");
  }

  // Start application on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

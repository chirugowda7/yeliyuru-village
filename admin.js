/**
 * =============================================================================
 * YELIYURU VILLAGE PORTAL - ADMIN CONTROLLER LOGIC
 * Full editing of images, bilingual content, statistics, temples, festivals,
 * notices, and directory contacts with instant live preview & data.js export.
 * =============================================================================
 */

(function () {
  'use strict';

  // 1. DATA STATE
  let currentData = null;
  const LOCAL_STORAGE_KEY = 'yeliyuru_custom_village_data';
  const CLOSE_ICON_SVG = '<svg class="icon icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  function iconSvg(name) {
    if (!name) return '';
    return (window.YELIYURU_ICONS && window.YELIYURU_ICONS[name]) || '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
  }

  // Initialize data from IndexedDB or localStorage or default VILLAGE_DATA
  function initData() {
    const defaultSource = (typeof VILLAGE_DATA !== 'undefined' ? VILLAGE_DATA : window.VILLAGE_DATA) || {};
    const defaultTime = Number(defaultSource.lastUpdated || 0);

    let saved = null;
    try {
      const savedRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedRaw) {
        saved = JSON.parse(savedRaw);
      }
    } catch (e) {
      console.warn("localStorage read warning:", e);
    }

    const savedTime = Number((saved && saved.lastUpdated) || 0);

    // If local saved data is older than bundled data.js, discard outdated browser cache
    if (saved && savedTime >= defaultTime) {
      currentData = saved;
    } else {
      currentData = JSON.parse(JSON.stringify(defaultSource));
      try {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      } catch (e) {}
    }
    if (currentData) delete currentData.culture;

    // Also load from IndexedDB (handles multi-megabyte photo sets without quota limits)
    if (window.VillageStorage && window.VillageStorage.loadData) {
      window.VillageStorage.loadData().then(idbData => {
        if (idbData && typeof idbData === 'object' && Object.keys(idbData).length > 0) {
          const cachedTime = Number(idbData.lastUpdated || 0);
          const curTime = Number((currentData && currentData.lastUpdated) || 0);
          if (cachedTime >= defaultTime && cachedTime >= curTime) {
            currentData = idbData;
            delete currentData.culture;
            populateAllFields();
            markSaved();
          }
        }
      }).catch(err => {
        console.warn("IndexedDB load notice:", err);
      });
    }

    // Also hydrate from backend server /api/data if running
    fetch('/api/data', { cache: 'no-store' }).then(r => r.json()).then(res => {
      if (res && res.success && res.data) {
        const srvData = res.data;
        const curTime = Number((currentData && currentData.lastUpdated) || 0);
        const srvTime = Number((srvData && srvData.lastUpdated) || 0);
        if (srvTime >= defaultTime && (!curTime || srvTime > curTime)) {
          currentData = srvData;
          delete currentData.culture;
          populateAllFields();
          markSaved();
        }
      }
    }).catch(() => {});
  }

  // 2. THEME SETUP
  function initTheme() {
    const savedTheme = localStorage.getItem('village_theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
      themeIcon.innerHTML = (savedTheme === 'dark') ?
        (window.YELIYURU_ICONS?.sun || '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/></svg>') :
        (window.YELIYURU_ICONS?.moon || '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>');
    }

    const toggleBtn = document.getElementById('admin-theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const active = document.documentElement.getAttribute('data-theme');
        const next = (active === 'dark') ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('village_theme', next);
        if (themeIcon) {
          themeIcon.innerHTML = (next === 'dark') ?
            (window.YELIYURU_ICONS?.sun || '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/></svg>') :
            (window.YELIYURU_ICONS?.moon || '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>');
        }
        showToast((next === 'dark') ? "Dark theme enabled" : "Light theme enabled");
      });
    }
  }

  // 3. TOAST NOTIFICATION HELPER
  function showToast(msg, isError = false) {
    const toast = document.getElementById('admin-toast');
    const toastMsg = document.getElementById('toast-msg');
    const toastIcon = document.getElementById('toast-icon');
    if (!toast || !toastMsg) return;

    toastMsg.textContent = msg;
    if (toastIcon) {
      toastIcon.innerHTML = isError ?
        (window.YELIYURU_ICONS?.lightbulb || '!') :
        (window.YELIYURU_ICONS?.check || '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>');
    }
    toast.className = 'admin-toast ' + (isError ? 'toast-danger' : '');
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }

  // 4. IMAGE UPLOAD HELPER (AUTOMATIC COMPRESSION & PREVIEW)
  function attachImageUploader(fileInputEl, urlInputEl, previewImgEl, onUpdate) {
    if (!fileInputEl || !urlInputEl || !previewImgEl) return;

    // When file chosen from computer
    fileInputEl.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      showToast("Optimizing image for fast web performance...");

      try {
        let optimizedDataUrl;
        if (window.VillageStorage && window.VillageStorage.compressImageFile) {
          // Compress high-resolution 5MB-10MB photos down to ~70KB-120KB web-friendly JPEG
          optimizedDataUrl = await window.VillageStorage.compressImageFile(file, 1200, 900, 0.82);
        } else {
          // Fallback
          optimizedDataUrl = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = ev => res(ev.target.result);
            r.onerror = rej;
            r.readAsDataURL(file);
          });
        }

        previewImgEl.src = optimizedDataUrl;
        previewImgEl.style.display = 'block';
        urlInputEl.value = optimizedDataUrl;
        if (onUpdate) onUpdate(optimizedDataUrl);
        showToast("Publishing image to live mobile portal...", false);
        await saveAllChanges({ pushGit: true });
        showToast("✅ Image uploaded, optimized & published live to mobile!");
      } catch (err) {
        console.error("Image optimization error:", err);
        showToast("Error processing image: " + err.message, true);
      }
    });

    // When URL or relative path typed manually
    urlInputEl.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      previewImgEl.src = val;
      previewImgEl.style.display = val ? 'block' : 'none';
      if (onUpdate) onUpdate(val);
      markUnsaved();
    });
  }

  // Unsaved changes status
  function markUnsaved() {
    const status = document.getElementById('save-status');
    const statusText = document.getElementById('status-text');
    if (status && statusText) {
      status.classList.add('unsaved');
      statusText.textContent = "Unsaved changes";
    }
  }

  function markSaved() {
    const status = document.getElementById('save-status');
    const statusText = document.getElementById('status-text');
    if (status && statusText) {
      status.classList.remove('unsaved');
      statusText.textContent = "All changes synced";
    }
  }

  // 5. SIDEBAR TAB NAVIGATION
  function initTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    const panels = document.querySelectorAll('.tab-panel');

    navItems.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');

        navItems.forEach(i => i.classList.remove('active'));
        btn.classList.add('active');

        panels.forEach(p => {
          if (p.id === targetTab) {
            p.classList.add('active');
          } else {
            p.classList.remove('active');
          }
        });

        // Scroll main view to top
        const main = document.querySelector('.admin-main');
        if (main) main.scrollTop = 0;
      });
    });
  }

  // ===========================================================================
  // 6. POPULATE & BIND FORM FIELDS
  // ===========================================================================

  function populateAllFields() {
    populateGeneral();
    populateAbout();
    populateHistory();
    populateQuickFacts();
    populatePhotos();
    populateAgriculture();
    populateTemples();
    populateFestivals();
    populatePanchayat();
    populateSchools();
    populateTransport();
    populateContacts();
    populateNotices();
    populateMap();
    updateBadges();
  }

  function updateBadges() {
    const badgeFacts = document.getElementById('badge-facts');
    const badgePhotos = document.getElementById('badge-photos');
    const badgeTemples = document.getElementById('badge-temples');
    const badgeFestivals = document.getElementById('badge-festivals');
    const badgeMembers = document.getElementById('badge-members');
    const badgeSchools = document.getElementById('badge-schools');
    const badgeContacts = document.getElementById('badge-contacts');
    const badgeNotices = document.getElementById('badge-notices');

    if (badgeFacts) badgeFacts.textContent = (currentData.quickFacts || []).length;
    if (badgePhotos) badgePhotos.textContent = (currentData.photos || []).length;
    if (badgeTemples) badgeTemples.textContent = (currentData.temples || []).length;
    if (badgeFestivals) badgeFestivals.textContent = (currentData.festivals || []).length;
    if (badgeMembers && currentData.panchayat) {
      badgeMembers.textContent = (currentData.panchayat.leadership || currentData.panchayat.members || []).length;
    }
    if (badgeSchools) badgeSchools.textContent = (currentData.schools || []).length + (currentData.health || []).length;
    if (badgeContacts) badgeContacts.textContent = (currentData.contacts || []).length;
    if (badgeNotices) badgeNotices.textContent = (currentData.notices || []).length;
  }

  function updateWhatsAppTestLink() {
    const input = document.getElementById('gen-creator-whatsapp');
    const testBtn = document.getElementById('btn-test-whatsapp');
    if (!input || !testBtn) return;
    const cleanDigits = (input.value || '').replace(/[^\d]/g, '');
    if (cleanDigits) {
      testBtn.href = `https://wa.me/${cleanDigits}?text=${encodeURIComponent("ನಮಸ್ಕಾರ ಚಿರು ಗೌಡ ಅವರೇ, ಯೆಲಿಯೂರು ಗ್ರಾಮ ಪೋರ್ಟಲ್ ಕುರಿತು ಸಂದೇಶ ಕಳುಹಿಸುತ್ತಿದ್ದೇನೆ.")}`;
      testBtn.style.pointerEvents = 'auto';
      testBtn.style.opacity = '1';
    } else {
      testBtn.href = '#';
      testBtn.style.pointerEvents = 'none';
      testBtn.style.opacity = '0.5';
    }
  }

  // --- TAB 1: GENERAL & BANNER ---
  function populateGeneral() {
    const d = currentData;
    // Names
    setVal('gen-name-en', d.name?.en);
    setVal('gen-name-kn', d.name?.kn);
    setVal('gen-shortsub-en', d.shortSub?.en);
    setVal('gen-shortsub-kn', d.shortSub?.kn);
    setVal('gen-subtitle-en', d.subtitle?.en);
    setVal('gen-subtitle-kn', d.subtitle?.kn);
    setVal('gen-tagline-en', d.tagline?.en);
    setVal('gen-tagline-kn', d.tagline?.kn);

    // Creator & WhatsApp
    if (!d.creator) d.creator = {};
    setVal('gen-creator-en', d.creator.en || 'Chirugowda Yeliyuru');
    setVal('gen-creator-kn', d.creator.kn || 'ಚಿರು ಗೌಡ ಯೆಲಿಯೂರು');
    setVal('gen-creator-whatsapp', d.creator.whatsappNumber || '+91 98765 43210');
    updateWhatsAppTestLink();

    const waInput = document.getElementById('gen-creator-whatsapp');
    if (waInput && !waInput.dataset.bound) {
      waInput.dataset.bound = 'true';
      waInput.addEventListener('input', updateWhatsAppTestLink);
    }

    // Banner & Meta
    if (d.banner) {
      setVal('url-hero-banner', d.banner.image);
      const prev = document.getElementById('preview-hero-banner');
      if (prev) {
        if (d.banner.image) {
          prev.src = d.banner.image;
          prev.style.display = 'block';
        } else {
          prev.src = '';
          prev.style.display = 'none';
        }
      }
      setVal('meta-pincode', d.banner.pincode);
      setVal('meta-elevation', d.banner.elevation);
      setVal('meta-taluk-en', d.banner.taluk?.en);
      setVal('meta-taluk-kn', d.banner.taluk?.kn);
      setVal('meta-district-en', d.banner.district?.en);
      setVal('meta-district-kn', d.banner.district?.kn);
    }

    attachImageUploader(
      document.getElementById('file-hero-banner'),
      document.getElementById('url-hero-banner'),
      document.getElementById('preview-hero-banner'),
      (imgSrc) => {
        if (!currentData.banner) currentData.banner = {};
        currentData.banner.image = imgSrc;
      }
    );
  }

  function readGeneral() {
    if (!currentData.name) currentData.name = {};
    currentData.name.en = getVal('gen-name-en');
    currentData.name.kn = getVal('gen-name-kn');

    if (!currentData.shortSub) currentData.shortSub = {};
    currentData.shortSub.en = getVal('gen-shortsub-en');
    currentData.shortSub.kn = getVal('gen-shortsub-kn');

    if (!currentData.subtitle) currentData.subtitle = {};
    currentData.subtitle.en = getVal('gen-subtitle-en');
    currentData.subtitle.kn = getVal('gen-subtitle-kn');

    if (!currentData.tagline) currentData.tagline = {};
    currentData.tagline.en = getVal('gen-tagline-en');
    currentData.tagline.kn = getVal('gen-tagline-kn');

    if (!currentData.creator) currentData.creator = {};
    currentData.creator.en = getVal('gen-creator-en') || 'Chirugowda Yeliyuru';
    currentData.creator.kn = getVal('gen-creator-kn') || 'ಚಿರು ಗೌಡ ಯೆಲಿಯೂರು';
    currentData.creator.whatsappNumber = getVal('gen-creator-whatsapp') || '+91 98765 43210';

    if (!currentData.banner) currentData.banner = {};
    currentData.banner.image = getVal('url-hero-banner');
    currentData.banner.pincode = getVal('meta-pincode');
    currentData.banner.elevation = getVal('meta-elevation');

    if (!currentData.banner.taluk) currentData.banner.taluk = {};
    currentData.banner.taluk.en = getVal('meta-taluk-en');
    currentData.banner.taluk.kn = getVal('meta-taluk-kn');

    if (!currentData.banner.district) currentData.banner.district = {};
    currentData.banner.district.en = getVal('meta-district-en');
    currentData.banner.district.kn = getVal('meta-district-kn');
  }

  // --- TAB 2: ABOUT ---
  function populateAbout() {
    const a = currentData.about || {};
    setVal('about-heading-en', a.heading?.en);
    setVal('about-heading-kn', a.heading?.kn);
    setVal('about-subheading-en', a.subheading?.en);
    setVal('about-subheading-kn', a.subheading?.kn);
    setVal('about-desc-en', a.description?.en);
    setVal('about-desc-kn', a.description?.kn);

    renderAboutHighlights();
  }

  function renderAboutHighlights() {
    const list = document.getElementById('about-highlights-list');
    if (!list) return;
    const highlights = currentData.about?.highlights || [];
    list.innerHTML = highlights.map((h, idx) => `
      <div class="dynamic-item-card" data-idx="${idx}">
        <div class="grid-3">
          <div class="form-group">
            <label>Icon Key</label>
            <input type="text" class="form-control h-icon" value="${escapeHtml(window.normalizeIconKey ? window.normalizeIconKey(h.icon, 'sprout') : (h.icon || 'sprout'))}">
          </div>
          <div class="form-group">
            <label>Title (English)</label>
            <input type="text" class="form-control h-title-en" value="${escapeHtml(h.title?.en || '')}">
          </div>
          <div class="form-group">
            <label>Title (Kannada)</label>
            <input type="text" class="form-control h-title-kn" value="${escapeHtml(h.title?.kn || '')}">
          </div>
        </div>
        <div class="grid-2 mt-3">
          <div class="form-group">
            <label>Text (English)</label>
            <input type="text" class="form-control h-text-en" value="${escapeHtml(h.text?.en || '')}">
          </div>
          <div class="form-group">
            <label>Text (Kannada)</label>
            <input type="text" class="form-control h-text-kn" value="${escapeHtml(h.text?.kn || '')}">
          </div>
        </div>
      </div>
    `).join('');
  }

  function readAbout() {
    if (!currentData.about) currentData.about = {};
    currentData.about.heading = { en: getVal('about-heading-en'), kn: getVal('about-heading-kn') };
    currentData.about.subheading = { en: getVal('about-subheading-en'), kn: getVal('about-subheading-kn') };
    currentData.about.description = { en: getVal('about-desc-en'), kn: getVal('about-desc-kn') };

    const items = document.querySelectorAll('#about-highlights-list .dynamic-item-card');
    const highlights = [];
    items.forEach(card => {
      const iconInput = card.querySelector('.h-icon')?.value.trim();
      highlights.push({
        icon: window.normalizeIconKey ? window.normalizeIconKey(iconInput, 'sprout') : (iconInput || 'sprout'),
        title: {
          en: card.querySelector('.h-title-en').value.trim(),
          kn: card.querySelector('.h-title-kn').value.trim()
        },
        text: {
          en: card.querySelector('.h-text-en').value.trim(),
          kn: card.querySelector('.h-text-kn').value.trim()
        }
      });
    });
    currentData.about.highlights = highlights;
  }

  // --- TAB 3: HISTORY ---
  function populateHistory() {
    const h = currentData.history || {};
    setVal('history-heading-en', h.heading?.en);
    setVal('history-heading-kn', h.heading?.kn);
    setVal('history-narrative-en', h.narrative?.en);
    setVal('history-narrative-kn', h.narrative?.kn);
    renderTimeline();

    const addBtn = document.getElementById('btn-add-milestone');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!currentData.history) currentData.history = {};
        if (!currentData.history.timeline) currentData.history.timeline = [];
        currentData.history.timeline.push({
          year: "New Era",
          title: { en: "Historical Milestone", kn: "ಐತಿಹಾಸಿಕ ಘಟ್ಟ" },
          desc: { en: "Description of the milestone...", kn: "ವಿವರಣೆ..." }
        });
        renderTimeline();
        markUnsaved();
      };
    }
  }

  function renderTimeline() {
    const list = document.getElementById('timeline-list');
    if (!list) return;
    const timeline = currentData.history?.timeline || [];
    list.innerHTML = timeline.map((m, idx) => `
      <div class="dynamic-item-card" data-idx="${idx}">
        <button type="button" class="item-delete-btn" onclick="window.adminDeleteTimeline(${idx})" title="Remove era">${CLOSE_ICON_SVG}</button>
        <div class="grid-3">
          <div class="form-group">
            <label>Era / Year</label>
            <input type="text" class="form-control t-year" value="${escapeHtml(m.year || '')}">
          </div>
          <div class="form-group">
            <label>Title (English)</label>
            <input type="text" class="form-control t-title-en" value="${escapeHtml(m.title?.en || '')}">
          </div>
          <div class="form-group">
            <label>Title (Kannada)</label>
            <input type="text" class="form-control t-title-kn" value="${escapeHtml(m.title?.kn || '')}">
          </div>
        </div>
        <div class="grid-2 mt-3">
          <div class="form-group">
            <label>Description (English)</label>
            <input type="text" class="form-control t-desc-en" value="${escapeHtml(m.desc?.en || '')}">
          </div>
          <div class="form-group">
            <label>Description (Kannada)</label>
            <input type="text" class="form-control t-desc-kn" value="${escapeHtml(m.desc?.kn || '')}">
          </div>
        </div>
      </div>
    `).join('');
  }

  window.adminDeleteTimeline = function (idx) {
    readHistory();
    if (idx >= 0 && currentData.history && currentData.history.timeline && idx < currentData.history.timeline.length) {
      const removed = currentData.history.timeline.splice(idx, 1)[0];
      renderTimeline();
      markUnsaved();
      const era = removed?.year || removed?.title?.en || "Milestone";
      showToast(`Removed milestone "${era}". Remember to click "Save All Changes" to sync.`);
    }
  };

  function readHistory() {
    if (!currentData.history) currentData.history = {};
    currentData.history.heading = { en: getVal('history-heading-en'), kn: getVal('history-heading-kn') };
    currentData.history.narrative = { en: getVal('history-narrative-en'), kn: getVal('history-narrative-kn') };

    const items = document.querySelectorAll('#timeline-list .dynamic-item-card');
    const timeline = [];
    items.forEach(card => {
      timeline.push({
        year: card.querySelector('.t-year').value.trim(),
        title: {
          en: card.querySelector('.t-title-en').value.trim(),
          kn: card.querySelector('.t-title-kn').value.trim()
        },
        desc: {
          en: card.querySelector('.t-desc-en').value.trim(),
          kn: card.querySelector('.t-desc-kn').value.trim()
        }
      });
    });
    currentData.history.timeline = timeline;
  }

  // --- TAB 4: QUICK FACTS ---
  function populateQuickFacts() {
    renderQuickFacts();
    const addBtn = document.getElementById('btn-add-fact');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!currentData.quickFacts) currentData.quickFacts = [];
        currentData.quickFacts.push({
          id: "fact_" + Date.now(),
          icon: "mapPin",
          label: { en: "New Fact", kn: "ಹೊಸ ಅಂಶ" },
          value: { en: "Value Details", kn: "ವಿವರ" }
        });
        renderQuickFacts();
        updateBadges();
        markUnsaved();
      };
    }
  }

  function renderQuickFacts() {
    const container = document.getElementById('facts-container');
    if (!container) return;
    const facts = currentData.quickFacts || [];
    container.innerHTML = facts.map((f, idx) => `
      <div class="admin-card dynamic-item-card" data-idx="${idx}">
        <button type="button" class="item-delete-btn" onclick="window.adminDeleteFact(${idx})" title="Delete fact">${CLOSE_ICON_SVG}</button>
        <div class="form-group">
          <label>Icon Key</label>
          <input type="text" class="form-control f-icon" value="${escapeHtml(window.normalizeIconKey ? window.normalizeIconKey(f.icon, 'mapPin') : (f.icon || 'mapPin'))}" style="width: 140px;">
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>Label (English)</label>
            <input type="text" class="form-control f-lbl-en" value="${escapeHtml(f.label?.en || '')}">
          </div>
          <div class="form-group">
            <label>Label (Kannada)</label>
            <input type="text" class="form-control f-lbl-kn" value="${escapeHtml(f.label?.kn || '')}">
          </div>
        </div>
        <div class="grid-2 mt-3">
          <div class="form-group">
            <label>Value (English)</label>
            <input type="text" class="form-control f-val-en" value="${escapeHtml(f.value?.en || '')}">
          </div>
          <div class="form-group">
            <label>Value (Kannada)</label>
            <input type="text" class="form-control f-val-kn" value="${escapeHtml(f.value?.kn || '')}">
          </div>
        </div>
      </div>
    `).join('');
  }

  window.adminDeleteFact = function (idx) {
    readQuickFacts();
    if (idx >= 0 && idx < currentData.quickFacts.length) {
      currentData.quickFacts.splice(idx, 1);
      renderQuickFacts();
      updateBadges();
      markUnsaved();
      showToast("Fact removed. Remember to click 'Save All Changes' to sync.");
    }
  };

  function readQuickFacts() {
    const cards = document.querySelectorAll('#facts-container .dynamic-item-card');
    const facts = [];
    cards.forEach((card, idx) => {
      const origId = currentData.quickFacts[idx]?.id || ("fact_" + idx);
      const iconInput = card.querySelector('.f-icon')?.value.trim();
      facts.push({
        id: origId,
        icon: window.normalizeIconKey ? window.normalizeIconKey(iconInput, 'mapPin') : (iconInput || 'mapPin'),
        label: {
          en: card.querySelector('.f-lbl-en').value.trim(),
          kn: card.querySelector('.f-lbl-kn').value.trim()
        },
        value: {
          en: card.querySelector('.f-val-en').value.trim(),
          kn: card.querySelector('.f-val-kn').value.trim()
        }
      });
    });
    currentData.quickFacts = facts;
  }

  // --- TAB 5: PHOTO GALLERY ---
  function populatePhotos() {
    renderPhotosGrid();
    const addBtn = document.getElementById('btn-add-photo');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!currentData.photos) currentData.photos = [];
        currentData.photos.push({
          id: Date.now(),
          url: "",
          title: { en: "New Gallery Photo", kn: "ಹೊಸ ಛಾಯಾಚಿತ್ರ" },
          caption: { en: "Description of photo...", kn: "ಚಿತ್ರದ ವಿವರಣೆ..." },
          tag: { en: "Village Life", kn: "ಗ್ರಾಮ ಜೀವನ" }
        });
        renderPhotosGrid();
        updateBadges();
        markUnsaved();
        showToast("New photo slot added. Upload image or enter URL.");
      };
    }
  }

  function renderPhotosGrid() {
    const grid = document.getElementById('photos-grid');
    if (!grid) return;
    const photos = currentData.photos || [];

    grid.innerHTML = photos.map((p, idx) => `
      <div class="photo-admin-card" data-idx="${idx}">
        <div class="photo-card-img-wrap">
          <img src="${escapeHtml(p.url || '')}" id="preview-photo-${idx}" alt="Gallery Preview" style="${p.url ? 'display:block;' : 'display:none;'}">
        </div>
        <div class="photo-card-body">
          <div class="form-group">
            <label>Upload From Computer</label>
            <input type="file" accept="image/*" class="form-control file-input photo-file-input" data-idx="${idx}">
          </div>
          <div class="form-group">
            <label>Or Image Path / URL</label>
            <input type="text" class="form-control p-url" data-idx="${idx}" value="${escapeHtml(p.url || '')}">
          </div>
          <div class="form-group">
            <label>Title (English)</label>
            <input type="text" class="form-control p-title-en" value="${escapeHtml(p.title?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಶೀರ್ಷಿಕೆ (ಕನ್ನಡ)</label>
            <input type="text" class="form-control p-title-kn" value="${escapeHtml(p.title?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Caption (English)</label>
            <textarea class="form-control p-cap-en" rows="2">${escapeHtml(p.caption?.en || '')}</textarea>
          </div>
          <div class="form-group">
            <label>ವಿವರಣೆ (ಕನ್ನಡ)</label>
            <textarea class="form-control p-cap-kn" rows="2">${escapeHtml(p.caption?.kn || '')}</textarea>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label>Tag (EN)</label>
              <input type="text" class="form-control p-tag-en" value="${escapeHtml(p.tag?.en || '')}">
            </div>
            <div class="form-group">
              <label>ಟ್ಯಾಗ್ (KN)</label>
              <input type="text" class="form-control p-tag-kn" value="${escapeHtml(p.tag?.kn || '')}">
            </div>
          </div>
          <div class="photo-card-actions">
            <span class="preview-badge">#${idx + 1}</span>
            <button type="button" class="btn btn-sm btn-danger-outline" onclick="window.adminDeletePhoto(${idx})">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              <span>Delete Photo</span>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    // Attach file uploader events for each photo card
    document.querySelectorAll('.photo-file-input').forEach(input => {
      const idx = input.getAttribute('data-idx');
      const preview = document.getElementById(`preview-photo-${idx}`);
      const urlInput = document.querySelector(`.p-url[data-idx="${idx}"]`);

      attachImageUploader(input, urlInput, preview, (imgSrc) => {
        if (currentData.photos[idx]) {
          currentData.photos[idx].url = imgSrc;
        }
      });
    });
  }

  window.adminDeletePhoto = function (idx) {
    readPhotos();
    if (idx >= 0 && currentData.photos && idx < currentData.photos.length) {
      const removed = currentData.photos.splice(idx, 1)[0];
      renderPhotosGrid();
      updateBadges();
      markUnsaved();
      const title = removed?.title?.en || removed?.title?.kn || "Photo";
      showToast(`Removed photo "${title}". Remember to click "Save All Changes" to sync.`);
    }
  };

  function readPhotos() {
    const cards = document.querySelectorAll('.photo-admin-card');
    const photos = [];
    cards.forEach((card, idx) => {
      const origId = currentData.photos[idx]?.id || idx + 1;
      photos.push({
        id: origId,
        url: card.querySelector('.p-url').value.trim(),
        title: {
          en: card.querySelector('.p-title-en').value.trim(),
          kn: card.querySelector('.p-title-kn').value.trim()
        },
        caption: {
          en: card.querySelector('.p-cap-en').value.trim(),
          kn: card.querySelector('.p-cap-kn').value.trim()
        },
        tag: {
          en: card.querySelector('.p-tag-en').value.trim(),
          kn: card.querySelector('.p-tag-kn').value.trim()
        }
      });
    });
    currentData.photos = photos;
  }

  // --- TAB 6: MILK & SILK (AGRICULTURE) ---
  function populateAgriculture() {
    renderAgriculture();
    const addBtn = document.getElementById('btn-add-crop');
    if (addBtn) {
      addBtn.onclick = () => window.adminAddCrop();
    }
  }

  window.adminAddCrop = function () {
    if (!currentData.crops) currentData.crops = [];
    currentData.crops.push({
      id: "crop_" + Date.now(),
      name: { en: "Agricultural Sector / Crop", kn: "ಕೃಷಿ ವಲಯ / ಬೆಳೆ" },
      annualProduction: { en: "", kn: "" },
      areaCovered: { en: "", kn: "" },
      description: { en: "", kn: "" },
      image: ""
    });
    renderAgriculture();
    markUnsaved();
    showToast("New agriculture card added. Upload photo or fill details.");
  };

  window.adminDeleteCrop = function (idx) {
    readAgriculture();
    if (idx >= 0 && currentData.crops && idx < currentData.crops.length) {
      const removed = currentData.crops.splice(idx, 1)[0];
      renderAgriculture();
      markUnsaved();
      const title = removed?.name?.en || removed?.name?.kn || "Crop";
      showToast(`Removed "${title}". Remember to click "Save All Changes" to sync.`);
    }
  };

  function renderAgriculture() {
    const container = document.getElementById('agriculture-crops-container');
    if (!container) return;
    const crops = currentData.crops || [];

    if (crops.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem 1rem; background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
          <p style="color: var(--text-muted); margin-bottom: 1rem;">No agriculture sectors or crops added yet.</p>
          <button type="button" class="btn btn-primary" onclick="window.adminAddCrop()">+ Add Agricultural Crop / Sector</button>
        </div>
      `;
      return;
    }

    container.innerHTML = crops.map((crop, idx) => `
      <div class="admin-card card-full dynamic-item-card" data-idx="${idx}">
        <button type="button" class="item-delete-btn" onclick="window.adminDeleteCrop(${idx})" title="Delete sector">${CLOSE_ICON_SVG}</button>
        <h2 class="card-title">${escapeHtml(crop.name?.en || 'Crop Sector')} / ${escapeHtml(crop.name?.kn || '')}</h2>
        
        <div class="image-uploader-wrapper">
          <div class="image-preview-container">
            <img id="preview-crop-${idx}" src="${escapeHtml(crop.image || '')}" alt="Crop Preview" class="image-preview" style="${crop.image ? 'display:block;' : 'display:none;'}">
          </div>
          <div class="image-inputs">
            <div class="form-group">
              <label>Upload Image from Computer</label>
              <input type="file" accept="image/*" class="form-control file-input crop-file-input" data-idx="${idx}">
            </div>
            <div class="form-group">
              <label>Image URL / Path</label>
              <input type="text" class="form-control crop-url" data-idx="${idx}" value="${escapeHtml(crop.image || '')}" placeholder="Upload above or enter image URL...">
            </div>
          </div>
        </div>

        <div class="grid-2 mt-4">
          <div class="form-group">
            <label>Name (English)</label>
            <input type="text" class="form-control crop-name-en" value="${escapeHtml(crop.name?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಹೆಸರು (ಕನ್ನಡ)</label>
            <input type="text" class="form-control crop-name-kn" value="${escapeHtml(crop.name?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Annual Production (English)</label>
            <input type="text" class="form-control crop-yield-en" value="${escapeHtml(crop.annualProduction?.en || '')}">
          </div>
          <div class="form-group">
            <label>ವಾರ್ಷಿಕ ಉತ್ಪಾದನೆ (ಕನ್ನಡ)</label>
            <input type="text" class="form-control crop-yield-kn" value="${escapeHtml(crop.annualProduction?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Area / Extent (English)</label>
            <input type="text" class="form-control crop-area-en" value="${escapeHtml(crop.areaCovered?.en || '')}">
          </div>
          <div class="form-group">
            <label>ವಿಸ್ತೀರ್ಣ (ಕನ್ನಡ)</label>
            <input type="text" class="form-control crop-area-kn" value="${escapeHtml(crop.areaCovered?.kn || '')}">
          </div>
        </div>

        <div class="form-group mt-3">
          <label>Description (English)</label>
          <textarea class="form-control crop-desc-en" rows="3">${escapeHtml(crop.description?.en || '')}</textarea>
        </div>
        <div class="form-group mt-3">
          <label>ವಿವರಣೆ (ಕನ್ನಡ)</label>
          <textarea class="form-control crop-desc-kn" rows="3">${escapeHtml(crop.description?.kn || '')}</textarea>
        </div>
      </div>
    `).join('');

    // Attach uploader
    document.querySelectorAll('.crop-file-input').forEach(input => {
      const idx = input.getAttribute('data-idx');
      const preview = document.getElementById(`preview-crop-${idx}`);
      const urlInput = document.querySelector(`.crop-url[data-idx="${idx}"]`);
      attachImageUploader(input, urlInput, preview, (imgSrc) => {
        if (currentData.crops[idx]) currentData.crops[idx].image = imgSrc;
      });
    });
  }

  function readAgriculture() {
    const cards = document.querySelectorAll('#agriculture-crops-container .dynamic-item-card');
    const crops = [];
    cards.forEach((card, idx) => {
      const origId = currentData.crops[idx]?.id || ("crop_" + idx);
      crops.push({
        id: origId,
        image: card.querySelector('.crop-url').value.trim(),
        name: {
          en: card.querySelector('.crop-name-en').value.trim(),
          kn: card.querySelector('.crop-name-kn').value.trim()
        },
        annualProduction: {
          en: card.querySelector('.crop-yield-en').value.trim(),
          kn: card.querySelector('.crop-yield-kn').value.trim()
        },
        areaCovered: {
          en: card.querySelector('.crop-area-en').value.trim(),
          kn: card.querySelector('.crop-area-kn').value.trim()
        },
        description: {
          en: card.querySelector('.crop-desc-en').value.trim(),
          kn: card.querySelector('.crop-desc-kn').value.trim()
        }
      });
    });
    currentData.crops = crops;
  }

  // --- TAB 7: TEMPLES ---
  function populateTemples() {
    renderTemples();
    const addBtn = document.getElementById('btn-add-temple');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!currentData.temples) currentData.temples = [];
        currentData.temples.push({
          name: { en: "New Temple Shrine", kn: "ಹೊಸ ದೇವಾಲಯ" },
          deity: { en: "Presiding Deity", kn: "ಪ್ರಧಾನ ದೈವ" },
          era: { en: "Historic Era", kn: "ಐತಿಹಾಸಿಕ ಕಾಲ" },
          timings: { en: "6:00 AM - 8:00 PM", kn: "ಬೆಳಗ್ಗೆ ೬:೦೦ - ರಾತ್ರಿ ೮:೦೦" },
          speciality: { en: "Special spiritual significance", kn: "ವಿಶೇಷ ಮಹಿಮೆ" },
          image: ""
        });
        renderTemples();
        updateBadges();
        markUnsaved();
      };
    }
  }

  function renderTemples() {
    const container = document.getElementById('temples-container');
    if (!container) return;
    const temples = currentData.temples || [];

    container.innerHTML = temples.map((t, idx) => `
      <div class="admin-card dynamic-item-card" data-idx="${idx}">
        <button type="button" class="item-delete-btn" onclick="window.adminDeleteTemple(${idx})" title="Delete temple">${CLOSE_ICON_SVG}</button>
        <h2 class="card-title">${escapeHtml(t.name?.en || 'Temple')}</h2>
        
        <div class="image-uploader-wrapper mb-3">
          <div class="image-preview-container">
            <img id="preview-temple-${idx}" src="${escapeHtml(t.image || '')}" alt="Temple Preview" class="image-preview" style="${t.image ? 'display:block;' : 'display:none;'}">
          </div>
          <div class="image-inputs">
            <div class="form-group">
              <label>Upload Photo</label>
              <input type="file" accept="image/*" class="form-control file-input temple-file-input" data-idx="${idx}">
            </div>
            <div class="form-group">
              <label>Image URL / Path</label>
              <input type="text" class="form-control temple-url" data-idx="${idx}" value="${escapeHtml(t.image || '')}">
            </div>
          </div>
        </div>

        <div class="grid-2">
          <div class="form-group">
            <label>Temple Name (EN)</label>
            <input type="text" class="form-control tm-name-en" value="${escapeHtml(t.name?.en || '')}">
          </div>
          <div class="form-group">
            <label>ದೇವಾಲಯದ ಹೆಸರು (KN)</label>
            <input type="text" class="form-control tm-name-kn" value="${escapeHtml(t.name?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Presiding Deity (EN)</label>
            <input type="text" class="form-control tm-deity-en" value="${escapeHtml(t.deity?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಪ್ರಧಾನ ದೈವ (KN)</label>
            <input type="text" class="form-control tm-deity-kn" value="${escapeHtml(t.deity?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Timings (EN)</label>
            <input type="text" class="form-control tm-time-en" value="${escapeHtml(t.timings?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಸಮಯ (KN)</label>
            <input type="text" class="form-control tm-time-kn" value="${escapeHtml(t.timings?.kn || '')}">
          </div>
        </div>

        <div class="form-group mt-3">
          <label>Speciality (EN)</label>
          <input type="text" class="form-control tm-spec-en" value="${escapeHtml(t.speciality?.en || '')}">
        </div>
        <div class="form-group mt-3">
          <label>ವಿಶೇಷತೆ (KN)</label>
          <input type="text" class="form-control tm-spec-kn" value="${escapeHtml(t.speciality?.kn || '')}">
        </div>

        <div class="card-footer-actions mt-3" style="display: flex; justify-content: flex-end; border-top: 1px solid var(--border-color); padding-top: 0.85rem;">
          <button type="button" class="btn btn-sm btn-danger-outline" onclick="window.adminDeleteTemple(${idx})" title="Delete this temple">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            <span>Delete This Temple</span>
          </button>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.temple-file-input').forEach(input => {
      const idx = input.getAttribute('data-idx');
      const preview = document.getElementById(`preview-temple-${idx}`);
      const urlInput = document.querySelector(`.temple-url[data-idx="${idx}"]`);
      attachImageUploader(input, urlInput, preview, (imgSrc) => {
        if (currentData.temples[idx]) currentData.temples[idx].image = imgSrc;
      });
    });
  }

  window.adminDeleteTemple = function (idx) {
    readTemples();
    if (idx >= 0 && idx < currentData.temples.length) {
      const removed = currentData.temples.splice(idx, 1)[0];
      renderTemples();
      updateBadges();
      markUnsaved();
      const name = removed?.name?.en || removed?.name?.kn || "Temple";
      showToast(`Removed "${name}". Remember to click "Save All Changes" to sync.`);
    }
  };

  function readTemples() {
    const cards = document.querySelectorAll('#temples-container .admin-card');
    const temples = [];
    cards.forEach((card, idx) => {
      const orig = (currentData.temples && currentData.temples[idx]) || {};
      temples.push({
        ...orig,
        image: card.querySelector('.temple-url')?.value?.trim() ?? orig.image ?? '',
        name: {
          en: card.querySelector('.tm-name-en')?.value?.trim() ?? orig.name?.en ?? '',
          kn: card.querySelector('.tm-name-kn')?.value?.trim() ?? orig.name?.kn ?? ''
        },
        deity: {
          en: card.querySelector('.tm-deity-en')?.value?.trim() ?? orig.deity?.en ?? '',
          kn: card.querySelector('.tm-deity-kn')?.value?.trim() ?? orig.deity?.kn ?? ''
        },
        timings: {
          en: card.querySelector('.tm-time-en')?.value?.trim() ?? orig.timings?.en ?? '',
          kn: card.querySelector('.tm-time-kn')?.value?.trim() ?? orig.timings?.kn ?? ''
        },
        speciality: {
          en: card.querySelector('.tm-spec-en')?.value?.trim() ?? orig.speciality?.en ?? '',
          kn: card.querySelector('.tm-spec-kn')?.value?.trim() ?? orig.speciality?.kn ?? ''
        }
      });
    });
    currentData.temples = temples;
  }

  // --- TAB 8: FESTIVALS ---
  function populateFestivals() {
    renderFestivals();
    const addBtn = document.getElementById('btn-add-festival');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!currentData.festivals) currentData.festivals = [];
        const nextMonth = new Date();
        nextMonth.setDate(nextMonth.getDate() + 30);
        const yyyy = nextMonth.getFullYear();
        const mm = String(nextMonth.getMonth() + 1).padStart(2, '0');
        const dd = String(nextMonth.getDate()).padStart(2, '0');

        currentData.festivals.push({
          name: { en: "New Festival Celebration", kn: "ಹೊಸ ಹಬ್ಬದ ಆಚರಣೆ" },
          date: `${yyyy}-${mm}-${dd}`,
          period: { en: "Annual Festive Season", kn: "ವಾರ್ಷಿಕ ಸಂಭ್ರಮ" },
          highlights: { en: "Special pooja, cultural programs", kn: "ವಿಶೇಷ ಪೂಜೆ, ಸಾಂಸ್ಕೃತಿಕ ಕಾರ್ಯಕ್ರಮ" },
          description: { en: "Festival description...", kn: "ಹಬ್ಬದ ವಿವರಣೆ..." }
        });
        renderFestivals();
        updateBadges();
        markUnsaved();
      };
    }
  }

  function renderFestivals() {
    const container = document.getElementById('festivals-container');
    if (!container) return;
    const festivals = currentData.festivals || [];

    container.innerHTML = festivals.map((f, idx) => `
      <div class="admin-card dynamic-item-card" data-idx="${idx}">
        <button type="button" class="item-delete-btn" onclick="window.adminDeleteFestival(${idx})" title="Delete festival">${CLOSE_ICON_SVG}</button>
        <h2 class="card-title">${escapeHtml(f.name?.en || 'Festival')}</h2>
        
        <div class="grid-3">
          <div class="form-group">
            <label>Event Date (YYYY-MM-DD)</label>
            <input type="date" class="form-control fes-date" value="${escapeHtml(f.date || '')}">
            <small class="form-hint">Drives the live homepage countdown!</small>
          </div>
          <div class="form-group">
            <label>Name (English)</label>
            <input type="text" class="form-control fes-name-en" value="${escapeHtml(f.name?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಹಬ್ಬದ ಹೆಸರು (ಕನ್ನಡ)</label>
            <input type="text" class="form-control fes-name-kn" value="${escapeHtml(f.name?.kn || '')}">
          </div>
        </div>

        <div class="grid-2 mt-3">
          <div class="form-group">
            <label>Highlights (English)</label>
            <input type="text" class="form-control fes-high-en" value="${escapeHtml(f.highlights?.en || '')}">
          </div>
          <div class="form-group">
            <label>ವಿಶೇಷತೆಗಳು (ಕನ್ನಡ)</label>
            <input type="text" class="form-control fes-high-kn" value="${escapeHtml(f.highlights?.kn || '')}">
          </div>
        </div>

        <div class="form-group mt-3">
          <label>Description (English)</label>
          <textarea class="form-control fes-desc-en" rows="2">${escapeHtml(f.description?.en || '')}</textarea>
        </div>
        <div class="form-group mt-3">
          <label>ವಿವರಣೆ (ಕನ್ನಡ)</label>
          <textarea class="form-control fes-desc-kn" rows="2">${escapeHtml(f.description?.kn || '')}</textarea>
        </div>

        <div class="card-footer-actions mt-3" style="display: flex; justify-content: flex-end; border-top: 1px solid var(--border-color); padding-top: 0.85rem;">
          <button type="button" class="btn btn-sm btn-danger-outline" onclick="window.adminDeleteFestival(${idx})" title="Delete this festival">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            <span>Delete This Festival</span>
          </button>
        </div>
      </div>
    `).join('');
  }

  window.adminDeleteFestival = function (idx) {
    // 1. Sync current inputs so edits in other cards aren't lost
    readFestivals();

    if (idx >= 0 && idx < currentData.festivals.length) {
      const removed = currentData.festivals.splice(idx, 1)[0];
      renderFestivals();
      updateBadges();
      markUnsaved();
      const name = removed?.name?.en || removed?.name?.kn || "Festival";
      showToast(`Removed "${name}". Remember to click "Save All Changes" to sync.`);
    }
  };

  function readFestivals() {
    const cards = document.querySelectorAll('#festivals-container .admin-card');
    const festivals = [];
    cards.forEach((card, idx) => {
      const orig = (currentData.festivals && currentData.festivals[idx]) || {};
      festivals.push({
        ...orig,
        date: card.querySelector('.fes-date')?.value?.trim() ?? orig.date ?? '',
        name: {
          en: card.querySelector('.fes-name-en')?.value?.trim() ?? orig.name?.en ?? '',
          kn: card.querySelector('.fes-name-kn')?.value?.trim() ?? orig.name?.kn ?? ''
        },
        highlights: {
          en: card.querySelector('.fes-high-en')?.value?.trim() ?? orig.highlights?.en ?? '',
          kn: card.querySelector('.fes-high-kn')?.value?.trim() ?? orig.highlights?.kn ?? ''
        },
        description: {
          en: card.querySelector('.fes-desc-en')?.value?.trim() ?? orig.description?.en ?? '',
          kn: card.querySelector('.fes-desc-kn')?.value?.trim() ?? orig.description?.kn ?? ''
        }
      });
    });
    currentData.festivals = festivals;
  }


  // --- TAB 10: PANCHAYAT ---
  const LEADERSHIP_ICON_OPTIONS = [
    { value: 'award', label: 'Award / Medal (ಅಧ್ಯಕ್ಷರು / President)' },
    { value: 'clipboard', label: 'Clipboard (PDO / Officer)' },
    { value: 'handshake', label: 'Handshake (ಉಪಾಧ್ಯಕ್ಷರು / Vice President)' },
    { value: 'users', label: 'Users / Council (ಸದಸ್ಯರು / Members)' },
    { value: 'shield', label: 'Shield / Security (ರಕ್ಷಣೆ & ಆಡಳಿತ)' },
    { value: 'landmark', label: 'Landmark / Bhavan (ಪಂಚಾಯತಿ ಭವನ)' },
    { value: 'phone', label: 'Phone / Helpline (ಸಂಪರ್ಕ)' },
    { value: 'check', label: 'Check / Verified (ಅಧಿಕೃತ)' }
  ];

  function populatePanchayat() {
    const p = currentData.panchayat || {};

    // 1. Headings
    setVal('panchayat-heading-en', p.heading?.en || 'Grama Panchayat Administration');
    setVal('panchayat-heading-kn', p.heading?.kn || 'ಗ್ರಾಮ ಪಂಚಾಯತಿ ಆಡಳಿತ');
    setVal('panchayat-subheading-en', p.subheading?.en || 'Devanahalli Taluk, Bengaluru Rural District — Dedicated to sustainable development and digital citizen services.');
    setVal('panchayat-subheading-kn', p.subheading?.kn || 'ದೇವನಹಳ್ಳಿ ತಾಲೂಕು, ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ ಜಿಲ್ಲೆ — ಗ್ರಾಮದ ಸಮಗ್ರ ಪ್ರಗತಿಗೆ ಬದ್ಧವಾಗಿರುವ ಪಾರದರ್ಶಕ ಆಡಳಿತ.');

    // 2. Photo
    setVal('url-panchayat-img', p.image || 'assets/images/panchayat.jpg');
    const prev = document.getElementById('preview-panchayat-img');
    if (prev) {
      if (p.image) {
        prev.src = p.image;
        prev.style.display = 'block';
      } else {
        prev.src = '';
        prev.style.display = 'none';
      }
    }

    // 3. Office Details
    const off = p.office || {};
    setVal('panchayat-office-name-en', off.name?.en || 'Yeliyuru Grama Panchayat Office');
    setVal('panchayat-office-name-kn', off.name?.kn || 'ಯೆಲಿಯೂರು ಗ್ರಾಮ ಪಂಚಾಯತಿ ಕಾರ್ಯಾಲಯ');
    setVal('panchayat-address-en', off.address?.en || p.officeAddress?.en || 'Main Road, Yeliyuru, Devanahalli Taluk, Bengaluru Rural - 562110');
    setVal('panchayat-address-kn', off.address?.kn || p.officeAddress?.kn || 'ಮುಖ್ಯ ರಸ್ತೆ, ಯೆಲಿಯೂರು, ದೇವನಹಳ್ಳಿ ತಾಲೂಕು, ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ - ೫೬೨೧೧೦');
    setVal('panchayat-hours-en', off.workingHours?.en || p.workingHours?.en || 'Monday to Saturday: 10:00 AM - 5:30 PM (2nd & 4th Sat Holiday)');
    setVal('panchayat-hours-kn', off.workingHours?.kn || p.workingHours?.kn || 'ಸೋಮವಾರದಿಂದ ಶನಿವಾರ: ಬೆಳಗ್ಗೆ ೧೦:೦೦ - ಸಂಜೆ ೫:೩೦');

    attachImageUploader(
      document.getElementById('file-panchayat-img'),
      document.getElementById('url-panchayat-img'),
      document.getElementById('preview-panchayat-img'),
      (imgSrc) => {
        if (!currentData.panchayat) currentData.panchayat = {};
        currentData.panchayat.image = imgSrc;
        markUnsaved();
      }
    );

    // 4. Ensure leadership list exists and is synced
    if (!p.leadership && p.members) {
      p.leadership = p.members;
    } else if (p.leadership && !p.members) {
      p.members = p.leadership;
    } else if (!p.leadership && !p.members) {
      p.leadership = [];
      p.members = [];
    }

    renderPanchayatMembers();
    const addBtn = document.getElementById('btn-add-member');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!currentData.panchayat) currentData.panchayat = {};
        const leaders = currentData.panchayat.leadership || currentData.panchayat.members || [];
        leaders.push({
          role: { en: "Panchayat Member (ಸದಸ್ಯರು)", kn: "ಗ್ರಾಮ ಪಂಚಾಯತಿ ಸದಸ್ಯರು" },
          name: { en: "Official / Member Name", kn: "ಅಧಿಕಾರಿ / ಸದಸ್ಯರ ಹೆಸರು" },
          contact: "+91 98000 00000",
          icon: "award"
        });
        currentData.panchayat.leadership = leaders;
        currentData.panchayat.members = leaders;
        renderPanchayatMembers();
        updateBadges();
        markUnsaved();
      };
    }

    // 5. Services List
    renderPanchayatServices();
    const addSrvBtn = document.getElementById('btn-add-service');
    if (addSrvBtn) {
      addSrvBtn.onclick = () => {
        if (!currentData.panchayat) currentData.panchayat = {};
        if (!currentData.panchayat.services) currentData.panchayat.services = [];
        currentData.panchayat.services.push({
          name: { en: "Citizen Service Name", kn: "ಸಾರ್ವಜನಿಕ ಸೇವೆ ಹೆಸರು" },
          desc: { en: "Description of service, documentation, and procedures.", kn: "ಸೇವೆಯ ವಿವರಣೆ ಹಾಗೂ ಅಗತ್ಯ ದಾಖಲೆಗಳು." }
        });
        renderPanchayatServices();
        markUnsaved();
      };
    }
  }

  function renderPanchayatMembers() {
    const list = document.getElementById('panchayat-members-list');
    if (!list) return;
    const leaders = currentData.panchayat?.leadership || currentData.panchayat?.members || [];

    if (leaders.length === 0) {
      list.innerHTML = `
        <div style="padding:1.5rem; text-align:center; color:var(--text-muted); background:var(--bg-card); border-radius:var(--radius-md); border:1px dashed var(--border-color); font-size:0.9rem;">
          No leadership contacts listed. Click <strong>"+ Add Official / Leader"</strong> above whenever you want to add official members.
        </div>
      `;
      return;
    }

    list.innerHTML = leaders.map((m, idx) => {
      const iconKey = m.icon || 'award';
      const roleKn = m.role?.kn || '';
      const roleEn = m.role?.en || '';
      const nameKn = m.name?.kn || '';
      const nameEn = m.name?.en || '';
      const phone = m.contact || m.phone || '';

      const iconOptionsHtml = LEADERSHIP_ICON_OPTIONS.map(opt => `
        <option value="${opt.value}" ${opt.value === iconKey ? 'selected' : ''}>${opt.label}</option>
      `).join('');

      return `
        <div class="dynamic-item-card" data-idx="${idx}">
          <div class="item-card-header">
            <span class="item-badge-pill">
              ${iconSvg(iconKey)}
              <span>Official #${idx + 1}: <strong>${escapeHtml(nameKn || nameEn || 'Leader')}</strong></span>
            </span>
            <div class="item-actions-group">
              <button type="button" class="item-move-btn" onclick="window.adminMoveLeader(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} title="Move Up">▲</button>
              <button type="button" class="item-move-btn" onclick="window.adminMoveLeader(${idx}, 1)" ${idx === leaders.length - 1 ? 'disabled' : ''} title="Move Down">▼</button>
              <button type="button" class="item-delete-btn-inline" onclick="window.adminDeleteMember(${idx})" title="Remove official">${CLOSE_ICON_SVG}</button>
            </div>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label>Official Name (English)</label>
              <input type="text" class="form-control mem-name-en" value="${escapeHtml(nameEn)}" placeholder="e.g. Smt. Jayamma Kumar" oninput="window.adminUpdateLeaderPreview(${idx})">
            </div>
            <div class="form-group">
              <label>ಅಧಿಕಾರಿಯ ಹೆಸರು (ಕನ್ನಡ)</label>
              <input type="text" class="form-control mem-name-kn" value="${escapeHtml(nameKn)}" placeholder="ಉದಾ: ಶ್ರೀಮತಿ ಜಯಮ್ಮ ಕುಮಾರ್" oninput="window.adminUpdateLeaderPreview(${idx})">
            </div>
            <div class="form-group">
              <label>Role / Position (English)</label>
              <input type="text" class="form-control mem-role-en" value="${escapeHtml(roleEn)}" placeholder="e.g. Panchayat President (ಅಧ್ಯಕ್ಷರು)" oninput="window.adminUpdateLeaderPreview(${idx})">
            </div>
            <div class="form-group">
              <label>ಹುದ್ದೆ / ಪದವಿ (ಕನ್ನಡ)</label>
              <input type="text" class="form-control mem-role-kn" value="${escapeHtml(roleKn)}" placeholder="ಉದಾ: ಗ್ರಾಮ ಪಂಚಾಯತಿ ಅಧ್ಯಕ್ಷರು" oninput="window.adminUpdateLeaderPreview(${idx})">
            </div>
            <div class="form-group">
              <label>Direct Phone / Contact Number</label>
              <input type="text" class="form-control mem-phone" value="${escapeHtml(phone)}" placeholder="e.g. +91 98451 22340" oninput="window.adminUpdateLeaderPreview(${idx})">
            </div>
            <div class="form-group">
              <label>Display Icon Badge</label>
              <select class="form-control mem-icon" onchange="window.adminUpdateLeaderPreview(${idx})">
                ${iconOptionsHtml}
              </select>
            </div>
          </div>

          <!-- Live Card Preview -->
          <div class="leader-preview-box" id="leader-preview-${idx}">
            <div class="leader-preview-icon" id="leader-prev-icon-${idx}">
              ${iconSvg(iconKey)}
            </div>
            <div class="leader-preview-info">
              <div class="leader-preview-role" id="leader-prev-role-${idx}">${escapeHtml(roleKn || roleEn || 'ಹುದ್ದೆ')}</div>
              <div class="leader-preview-name" id="leader-prev-name-${idx}">${escapeHtml(nameKn || nameEn || 'ಹೆಸರು')}</div>
              <div class="leader-preview-phone" id="leader-prev-phone-${idx}">
                ${iconSvg('phone')} <span>${escapeHtml(phone || '—')}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  window.adminUpdateLeaderPreview = function(idx) {
    const card = document.querySelector(`#panchayat-members-list .dynamic-item-card[data-idx="${idx}"]`);
    if (!card) return;
    const nameKn = card.querySelector('.mem-name-kn')?.value.trim();
    const nameEn = card.querySelector('.mem-name-en')?.value.trim();
    const roleKn = card.querySelector('.mem-role-kn')?.value.trim();
    const roleEn = card.querySelector('.mem-role-en')?.value.trim();
    const phone = card.querySelector('.mem-phone')?.value.trim();
    const icon = card.querySelector('.mem-icon')?.value.trim() || 'award';

    const prevIcon = document.getElementById(`leader-prev-icon-${idx}`);
    const prevRole = document.getElementById(`leader-prev-role-${idx}`);
    const prevName = document.getElementById(`leader-prev-name-${idx}`);
    const prevPhone = document.getElementById(`leader-prev-phone-${idx}`);

    if (prevIcon) prevIcon.innerHTML = iconSvg(icon);
    if (prevRole) prevRole.textContent = roleKn || roleEn || 'ಹುದ್ದೆ';
    if (prevName) prevName.textContent = nameKn || nameEn || 'ಹೆಸರು';
    if (prevPhone) prevPhone.innerHTML = `${iconSvg('phone')} <span>${phone || '—'}</span>`;
    markUnsaved();
  };

  window.adminMoveLeader = function(idx, direction) {
    readPanchayat();
    const leaders = currentData.panchayat?.leadership || [];
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= leaders.length) return;
    const temp = leaders[idx];
    leaders[idx] = leaders[targetIdx];
    leaders[targetIdx] = temp;
    currentData.panchayat.leadership = leaders;
    currentData.panchayat.members = leaders;
    renderPanchayatMembers();
    markUnsaved();
  };

  window.adminDeleteMember = function (idx) {
    readPanchayat();
    const leaders = currentData.panchayat?.leadership || currentData.panchayat?.members || [];
    if (idx >= 0 && idx < leaders.length) {
      const removed = leaders.splice(idx, 1)[0];
      currentData.panchayat.leadership = leaders;
      currentData.panchayat.members = leaders;
      renderPanchayatMembers();
      updateBadges();
      markUnsaved();
      const name = removed?.name?.kn || removed?.name?.en || "Officer";
      showToast(`Removed "${name}". Click "Save Changes" to sync.`);
    }
  };

  function renderPanchayatServices() {
    const list = document.getElementById('panchayat-services-list');
    if (!list) return;
    const services = currentData.panchayat?.services || [];

    list.innerHTML = services.map((s, idx) => `
      <div class="dynamic-item-card" data-idx="${idx}">
        <button type="button" class="item-delete-btn" onclick="window.adminDeleteService(${idx})" title="Remove service">${CLOSE_ICON_SVG}</button>
        <div class="grid-2">
          <div class="form-group">
            <label>Service Name (English)</label>
            <input type="text" class="form-control srv-name-en" value="${escapeHtml(s.name?.en || '')}" placeholder="e.g. Grama One & E-Swathu Certificates">
          </div>
          <div class="form-group">
            <label>ಸೇವೆಯ ಹೆಸರು (ಕನ್ನಡ)</label>
            <input type="text" class="form-control srv-name-kn" value="${escapeHtml(s.name?.kn || '')}" placeholder="ಉದಾ: ಗ್ರಾಮ ಒನ್ ಮತ್ತು ಇ-ಸ್ವತ್ತು ಖಾತಾ ಸೇವೆಗಳು">
          </div>
          <div class="form-group">
            <label>Description (English)</label>
            <textarea class="form-control srv-desc-en" rows="2" placeholder="Digital property records, Khatha registration...">${escapeHtml(s.desc?.en || '')}</textarea>
          </div>
          <div class="form-group">
            <label>ವಿವರಣೆ (ಕನ್ನಡ)</label>
            <textarea class="form-control srv-desc-kn" rows="2" placeholder="ಕಂಪ್ಯೂಟರೀಕೃತ ಆಸ್ತಿ ದಾಖಲೆಗಳು...">${escapeHtml(s.desc?.kn || '')}</textarea>
          </div>
        </div>
      </div>
    `).join('');
  }

  window.adminDeleteService = function (idx) {
    readPanchayat();
    const services = currentData.panchayat?.services || [];
    if (idx >= 0 && idx < services.length) {
      const removed = services.splice(idx, 1)[0];
      currentData.panchayat.services = services;
      renderPanchayatServices();
      markUnsaved();
      const name = removed?.name?.kn || removed?.name?.en || "Service";
      showToast(`Removed "${name}". Click "Save Changes" to sync.`);
    }
  };

  function readPanchayat() {
    if (!currentData.panchayat) currentData.panchayat = {};

    currentData.panchayat.heading = {
      en: getVal('panchayat-heading-en') || "Grama Panchayat Administration",
      kn: getVal('panchayat-heading-kn') || "ಗ್ರಾಮ ಪಂಚಾಯತಿ ಆಡಳಿತ"
    };
    currentData.panchayat.subheading = {
      en: getVal('panchayat-subheading-en'),
      kn: getVal('panchayat-subheading-kn')
    };
    currentData.panchayat.image = getVal('url-panchayat-img') || 'assets/images/panchayat.jpg';

    const office = {
      name: {
        en: getVal('panchayat-office-name-en') || "Yeliyuru Grama Panchayat Office",
        kn: getVal('panchayat-office-name-kn') || "ಯೆಲಿಯೂರು ಗ್ರಾಮ ಪಂಚಾಯತಿ ಕಾರ್ಯಾಲಯ"
      },
      address: {
        en: getVal('panchayat-address-en'),
        kn: getVal('panchayat-address-kn')
      },
      workingHours: {
        en: getVal('panchayat-hours-en'),
        kn: getVal('panchayat-hours-kn')
      }
    };
    currentData.panchayat.office = office;
    currentData.panchayat.officeAddress = office.address;
    currentData.panchayat.workingHours = office.workingHours;

    // Read leadership items
    const memberCards = document.querySelectorAll('#panchayat-members-list .dynamic-item-card');
    const leadership = [];
    memberCards.forEach(card => {
      leadership.push({
        name: {
          en: card.querySelector('.mem-name-en')?.value.trim() || '',
          kn: card.querySelector('.mem-name-kn')?.value.trim() || ''
        },
        role: {
          en: card.querySelector('.mem-role-en')?.value.trim() || '',
          kn: card.querySelector('.mem-role-kn')?.value.trim() || ''
        },
        contact: card.querySelector('.mem-phone')?.value.trim() || '',
        icon: card.querySelector('.mem-icon')?.value.trim() || 'award'
      });
    });
    currentData.panchayat.leadership = leadership;
    currentData.panchayat.members = leadership;

    // Read services items
    const serviceCards = document.querySelectorAll('#panchayat-services-list .dynamic-item-card');
    const services = [];
    serviceCards.forEach(card => {
      services.push({
        name: {
          en: card.querySelector('.srv-name-en')?.value.trim() || '',
          kn: card.querySelector('.srv-name-kn')?.value.trim() || ''
        },
        desc: {
          en: card.querySelector('.srv-desc-en')?.value.trim() || '',
          kn: card.querySelector('.srv-desc-kn')?.value.trim() || ''
        }
      });
    });
    if (services.length > 0 || currentData.panchayat.services) {
      currentData.panchayat.services = services;
    }
  }

  // --- TAB 11: SCHOOLS & HEALTH ---
  function populateSchools() {
    const prev = document.getElementById('preview-school-img');
    const schImg = currentData.schools?.[0]?.image || '';
    setVal('url-school-img', schImg);
    if (prev) {
      if (schImg) {
        prev.src = schImg;
        prev.style.display = 'block';
      } else {
        prev.src = '';
        prev.style.display = 'none';
      }
    }

    attachImageUploader(
      document.getElementById('file-school-img'),
      document.getElementById('url-school-img'),
      document.getElementById('preview-school-img'),
      (imgSrc) => {
        if (currentData.schools && currentData.schools[0]) currentData.schools[0].image = imgSrc;
      }
    );

    renderSchoolsList();
    renderHealthList();
  }

  function renderSchoolsList() {
    const list = document.getElementById('schools-list');
    if (!list) return;
    const schools = currentData.schools || [];
    list.innerHTML = schools.map((s, idx) => `
      <div class="dynamic-item-card" data-idx="${idx}">
        <div class="grid-2">
          <div class="form-group">
            <label>School Name (EN)</label>
            <input type="text" class="form-control sch-name-en" value="${escapeHtml(s.name?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಶಾಲೆಯ ಹೆಸರು (KN)</label>
            <input type="text" class="form-control sch-name-kn" value="${escapeHtml(s.name?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Type / Grades (EN)</label>
            <input type="text" class="form-control sch-type-en" value="${escapeHtml(s.type?.en || '')}">
          </div>
          <div class="form-group">
            <label>ವಿವರ (KN)</label>
            <input type="text" class="form-control sch-type-kn" value="${escapeHtml(s.type?.kn || '')}">
          </div>
        </div>
      </div>
    `).join('');
  }

  function renderHealthList() {
    const list = document.getElementById('health-list');
    if (!list) return;
    const health = currentData.health || [];
    list.innerHTML = health.map((h, idx) => `
      <div class="dynamic-item-card" data-idx="${idx}">
        <div class="grid-2">
          <div class="form-group">
            <label>Facility Name (EN)</label>
            <input type="text" class="form-control hlt-name-en" value="${escapeHtml(h.name?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಆರೋಗ್ಯ ಕೇಂದ್ರ (KN)</label>
            <input type="text" class="form-control hlt-name-kn" value="${escapeHtml(h.name?.kn || '')}">
          </div>
          <div class="form-group">
            <label>Doctor / Officer (EN)</label>
            <input type="text" class="form-control hlt-doc-en" value="${escapeHtml(h.doctor?.en || '')}">
          </div>
          <div class="form-group">
            <label>ವೈದ್ಯಾಧಿಕಾರಿ (KN)</label>
            <input type="text" class="form-control hlt-doc-kn" value="${escapeHtml(h.doctor?.kn || '')}">
          </div>
        </div>
      </div>
    `).join('');
  }

  function readSchools() {
    const schImg = getVal('url-school-img');
    if (currentData.schools && currentData.schools[0] && schImg) {
      currentData.schools[0].image = schImg;
    }
    const schCards = document.querySelectorAll('#schools-list .dynamic-item-card');
    schCards.forEach((card, idx) => {
      if (currentData.schools[idx]) {
        currentData.schools[idx].name = { en: card.querySelector('.sch-name-en').value.trim(), kn: card.querySelector('.sch-name-kn').value.trim() };
        currentData.schools[idx].type = { en: card.querySelector('.sch-type-en').value.trim(), kn: card.querySelector('.sch-type-kn').value.trim() };
      }
    });

    const hltCards = document.querySelectorAll('#health-list .dynamic-item-card');
    hltCards.forEach((card, idx) => {
      if (currentData.health[idx]) {
        currentData.health[idx].name = { en: card.querySelector('.hlt-name-en').value.trim(), kn: card.querySelector('.hlt-name-kn').value.trim() };
        currentData.health[idx].doctor = { en: card.querySelector('.hlt-doc-en').value.trim(), kn: card.querySelector('.hlt-doc-kn').value.trim() };
      }
    });
  }

  // --- TAB 12: TRANSPORT ---
  function populateTransport() {
    const tr = currentData.transport || {};
    setVal('transport-road-en', tr.road?.en);
    setVal('transport-road-kn', tr.road?.kn);
    setVal('transport-airport-en', tr.airport?.en);
    setVal('transport-airport-kn', tr.airport?.kn);
    setVal('transport-rail-en', tr.rail?.en);
    setVal('transport-rail-kn', tr.rail?.kn);
  }

  function readTransport() {
    if (!currentData.transport) currentData.transport = {};
    currentData.transport.road = { en: getVal('transport-road-en'), kn: getVal('transport-road-kn') };
    currentData.transport.airport = { en: getVal('transport-airport-en'), kn: getVal('transport-airport-kn') };
    currentData.transport.rail = { en: getVal('transport-rail-en'), kn: getVal('transport-rail-kn') };
  }

  // --- TAB 13: CONTACTS ---
  const CONTACT_ICON_OPTIONS = [
    { value: 'landmark', label: 'Landmark / Government (ಆಡಳಿತ)' },
    { value: 'droplet', label: 'Droplet / Milk Dairy (ಹಾಲು ಸಂಘ)' },
    { value: 'silkCocoon', label: 'Silk / Agriculture (ರೇಷ್ಮೆ & ಕೃಷಿ)' },
    { value: 'hospital', label: 'Hospital / Health (ಆರೋಗ್ಯ)' },
    { value: 'phone', label: 'Phone / Emergency (ತುರ್ತು ಕರೆ)' },
    { value: 'shield', label: 'Shield / Police & Security (ಪೊಲೀಸ್)' },
    { value: 'zap', label: 'Power / Electricity BESCOM (ವಿದ್ಯುತ್)' },
    { value: 'bus', label: 'Bus / Transport (ಸಾರಿಗೆ)' },
    { value: 'users', label: 'Users / Public Service (ಸೇವೆ)' }
  ];

  function populateContacts() {
    renderContacts();
    const addBtn = document.getElementById('btn-add-contact');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!currentData.contacts) currentData.contacts = [];
        currentData.contacts.push({
          id: 'contact_' + Date.now(),
          category: { en: "Public Services", kn: "ಸಾರ್ವಜನಿಕ ಸೇವೆ" },
          title: { en: "Service / Office Title", kn: "ಕಚೇರಿ / ಸಂಸ್ಥೆಯ ಹೆಸರು" },
          officer: { en: "Officer / Person In-charge", kn: "ಅಧಿಕಾರಿ / ಸಂಪರ್ಕ ವ್ಯಕ್ತಿ" },
          phone: "+91 90000 00000",
          email: "",
          location: { en: "Yeliyuru, Devanahalli Tq", kn: "ಯೆಲಿಯೂರು, ದೇವನಹಳ್ಳಿ ತಾ." },
          icon: "phone"
        });
        renderContacts();
        updateBadges();
        markUnsaved();
      };
    }
  }

  function renderContacts() {
    const container = document.getElementById('contacts-container');
    if (!container) return;
    const contacts = currentData.contacts || [];

    container.innerHTML = contacts.map((c, idx) => {
      const titleEn = c.title?.en || c.name?.en || '';
      const titleKn = c.title?.kn || c.name?.kn || '';
      const officerEn = c.officer?.en || c.role?.en || '';
      const officerKn = c.officer?.kn || c.role?.kn || '';
      const catEn = c.category?.en || '';
      const catKn = c.category?.kn || '';
      const locEn = c.location?.en || '';
      const locKn = c.location?.kn || '';
      const phone = c.phone || '';
      const email = c.email || '';
      const iconKey = c.icon || 'phone';

      const iconOptionsHtml = CONTACT_ICON_OPTIONS.map(opt => `
        <option value="${opt.value}" ${opt.value === iconKey ? 'selected' : ''}>${opt.label}</option>
      `).join('');

      return `
        <div class="admin-card dynamic-item-card" data-idx="${idx}">
          <div class="item-card-header">
            <span class="item-badge-pill">
              ${iconSvg(iconKey)}
              <span>Directory #${idx + 1}: <strong>${escapeHtml(titleKn || titleEn || 'Contact')}</strong></span>
            </span>
            <button type="button" class="item-delete-btn-inline" onclick="window.adminDeleteContact(${idx})" title="Delete contact">${CLOSE_ICON_SVG}</button>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label>Office / Service Title (English)</label>
              <input type="text" class="form-control c-title-en" value="${escapeHtml(titleEn)}" placeholder="e.g. Yeliyuru Grama Panchayat Office">
            </div>
            <div class="form-group">
              <label>ಕಚೇರಿ / ಸಂಸ್ಥೆಯ ಹೆಸರು (ಕನ್ನಡ)</label>
              <input type="text" class="form-control c-title-kn" value="${escapeHtml(titleKn)}" placeholder="ಉದಾ: ಯೆಲಿಯೂರು ಗ್ರಾಮ ಪಂಚಾಯತಿ ಕಾರ್ಯಾಲಯ">
            </div>
            <div class="form-group">
              <label>Officer / Person in Charge (English)</label>
              <input type="text" class="form-control c-officer-en" value="${escapeHtml(officerEn)}" placeholder="e.g. Panchayat Development Officer (PDO)">
            </div>
            <div class="form-group">
              <label>ಅಧಿಕಾರಿ / ಸಂಪರ್ಕ ವ್ಯಕ್ತಿ (ಕನ್ನಡ)</label>
              <input type="text" class="form-control c-officer-kn" value="${escapeHtml(officerKn)}" placeholder="ಉದಾ: ಪಂಚಾಯತ್ ಅಭಿವೃದ್ಧಿ ಅಧಿಕಾರಿ (PDO)">
            </div>
            <div class="form-group">
              <label>Department / Category (English)</label>
              <input type="text" class="form-control c-cat-en" value="${escapeHtml(catEn)}" placeholder="e.g. Administration, Health, Police">
            </div>
            <div class="form-group">
              <label>ವರ್ಗ / ಇಲಾಖೆ (ಕನ್ನಡ)</label>
              <input type="text" class="form-control c-cat-kn" value="${escapeHtml(catKn)}" placeholder="ಉದಾ: ಆಡಳಿತ, ಆರೋಗ್ಯ, ಪೊಲೀಸ್">
            </div>
            <div class="form-group">
              <label>Phone / Helpline Number</label>
              <input type="text" class="form-control c-phone" value="${escapeHtml(phone)}" placeholder="e.g. +91 80276 82140">
            </div>
            <div class="form-group">
              <label>Email Address (Optional)</label>
              <input type="email" class="form-control c-email" value="${escapeHtml(email)}" placeholder="e.g. panchayat@karnataka.gov.in">
            </div>
            <div class="form-group">
              <label>Location / Address (English)</label>
              <input type="text" class="form-control c-loc-en" value="${escapeHtml(locEn)}" placeholder="e.g. Panchayat Bhavan, Yeliyuru">
            </div>
            <div class="form-group">
              <label>ಸ್ಥಳ / ವಿಳಾಸ (ಕನ್ನಡ)</label>
              <input type="text" class="form-control c-loc-kn" value="${escapeHtml(locKn)}" placeholder="ಉದಾ: ಪಂಚಾಯತಿ ಭವನ, ಯೆಲಿಯೂರು">
            </div>
            <div class="form-group" style="grid-column: 1 / -1;">
              <label>Display Icon</label>
              <select class="form-control c-icon">
                ${iconOptionsHtml}
              </select>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  window.adminDeleteContact = function (idx) {
    readContacts();
    if (idx >= 0 && currentData.contacts && idx < currentData.contacts.length) {
      const removed = currentData.contacts.splice(idx, 1)[0];
      renderContacts();
      updateBadges();
      markUnsaved();
      const name = removed?.title?.kn || removed?.title?.en || removed?.name?.en || "Contact";
      showToast(`Removed "${name}". Remember to click "Save Changes" to sync.`);
    }
  };

  function readContacts() {
    const cards = document.querySelectorAll('#contacts-container .dynamic-item-card');
    const contacts = [];
    cards.forEach((card, idx) => {
      const orig = (currentData.contacts && currentData.contacts[idx]) || {};
      const titleEn = card.querySelector('.c-title-en')?.value.trim() || '';
      const titleKn = card.querySelector('.c-title-kn')?.value.trim() || '';
      const officerEn = card.querySelector('.c-officer-en')?.value.trim() || '';
      const officerKn = card.querySelector('.c-officer-kn')?.value.trim() || '';
      const catEn = card.querySelector('.c-cat-en')?.value.trim() || 'Public Services';
      const catKn = card.querySelector('.c-cat-kn')?.value.trim() || 'ಸಾರ್ವಜನಿಕ ಸೇವೆ';
      const locEn = card.querySelector('.c-loc-en')?.value.trim() || '';
      const locKn = card.querySelector('.c-loc-kn')?.value.trim() || '';
      const phone = card.querySelector('.c-phone')?.value.trim() || '';
      const email = card.querySelector('.c-email')?.value.trim() || '';
      const icon = card.querySelector('.c-icon')?.value.trim() || 'phone';

      contacts.push({
        ...orig,
        id: orig.id || ('contact_' + idx),
        title: { en: titleEn, kn: titleKn },
        name: { en: titleEn, kn: titleKn },
        officer: { en: officerEn, kn: officerKn },
        role: { en: officerEn, kn: officerKn },
        category: { en: catEn, kn: catKn },
        location: { en: locEn, kn: locKn },
        phone: phone,
        email: email,
        icon: icon,
        available: orig.available || { en: "24x7", kn: "೨೪x೭ ಲಭ್ಯ" }
      });
    });
    currentData.contacts = contacts;
  }

  // --- TAB 14: NOTICES ---
  function populateNotices() {
    renderNotices();
    const addBtn = document.getElementById('btn-add-notice');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!currentData.notices) currentData.notices = [];
        const today = new Date().toISOString().split('T')[0];
        currentData.notices.unshift({
          id: "notice_" + Date.now(),
          date: today,
          urgency: "High",
          department: { en: "Grama Panchayat", kn: "ಗ್ರಾಮ ಪಂಚಾಯತಿ" },
          title: { en: "New Public Announcement", kn: "ಹೊಸ ಸಾರ್ವಜನಿಕ ಪ್ರಕಟಣೆ" },
          content: { en: "Important notice content here...", kn: "ಪ್ರಮುಖ ಪ್ರಕಟಣೆಯ ವಿವರ ಇಲ್ಲಿದೆ..." }
        });
        renderNotices();
        updateBadges();
        markUnsaved();
      };
    }
  }

  function renderNotices() {
    const container = document.getElementById('notices-container');
    if (!container) return;
    const notices = currentData.notices || [];

    container.innerHTML = notices.map((n, idx) => `
      <div class="admin-card dynamic-item-card" data-idx="${idx}">
        <button type="button" class="item-delete-btn" onclick="window.adminDeleteNotice(${idx})" title="Delete notice">${CLOSE_ICON_SVG}</button>
        <div class="grid-3">
          <div class="form-group">
            <label>Notice Date</label>
            <input type="date" class="form-control n-date" value="${escapeHtml(n.date || '')}">
          </div>
          <div class="form-group">
            <label>Urgency Level</label>
            <select class="form-control n-urgency">
              <option value="High" ${n.urgency === 'High' ? 'selected' : ''}>High (Alert)</option>
              <option value="Medium" ${n.urgency === 'Medium' ? 'selected' : ''}>Medium</option>
              <option value="Low" ${n.urgency === 'Low' ? 'selected' : ''}>Low (General)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Department (EN)</label>
            <input type="text" class="form-control n-dept-en" value="${escapeHtml(n.department?.en || '')}">
          </div>
        </div>

        <div class="grid-2 mt-3">
          <div class="form-group">
            <label>Notice Title (English)</label>
            <input type="text" class="form-control n-title-en" value="${escapeHtml(n.title?.en || '')}">
          </div>
          <div class="form-group">
            <label>ಪ್ರಕಟಣೆ ಶೀರ್ಷಿಕೆ (ಕನ್ನಡ)</label>
            <input type="text" class="form-control n-title-kn" value="${escapeHtml(n.title?.kn || '')}">
          </div>
        </div>

        <div class="form-group mt-3">
          <label>Full Content (English)</label>
          <textarea class="form-control n-content-en" rows="3">${escapeHtml(n.content?.en || '')}</textarea>
        </div>
        <div class="form-group mt-3">
          <label>ಸಂಪೂರ್ಣ ವಿವರ (ಕನ್ನಡ)</label>
          <textarea class="form-control n-content-kn" rows="3">${escapeHtml(n.content?.kn || '')}</textarea>
        </div>
      </div>
    `).join('');
  }

  window.adminDeleteNotice = function (idx) {
    readNotices();
    if (idx >= 0 && currentData.notices && idx < currentData.notices.length) {
      const removed = currentData.notices.splice(idx, 1)[0];
      renderNotices();
      updateBadges();
      markUnsaved();
      const title = removed?.title?.en || removed?.title?.kn || "Notice";
      showToast(`Removed "${title}". Remember to click "Save All Changes" to sync.`);
    }
  };

  function readNotices() {
    const cards = document.querySelectorAll('#notices-container .admin-card');
    const notices = [];
    cards.forEach((card, idx) => {
      const orig = currentData.notices[idx] || {};
      notices.push({
        ...orig,
        date: card.querySelector('.n-date').value.trim(),
        urgency: card.querySelector('.n-urgency').value,
        department: { en: card.querySelector('.n-dept-en').value.trim(), kn: orig.department?.kn || "ಗ್ರಾಮ ಪಂಚಾಯತಿ" },
        title: { en: card.querySelector('.n-title-en').value.trim(), kn: card.querySelector('.n-title-kn').value.trim() },
        content: { en: card.querySelector('.n-content-en').value.trim(), kn: card.querySelector('.n-content-kn').value.trim() }
      });
    });
    currentData.notices = notices;
  }

  // --- TAB 15: GOOGLE MAPS ---
  function populateMap() {
    const m = currentData.map || {};
    setVal('url-satellite-img', m.satelliteImage);
    const prev = document.getElementById('preview-satellite-img');
    const satImg = m.satelliteImage || m.mapImage || '';
    if (prev) {
      if (satImg) {
        prev.src = satImg;
        prev.style.display = 'block';
      } else {
        prev.src = '';
        prev.style.display = 'none';
      }
    }

    setVal('map-coords', m.coordinates);
    setVal('map-elevation', m.elevation);
    setVal('map-url-search', m.googleMapsSearchUrl);
    setVal('map-url-embed', m.embedUrl);

    attachImageUploader(
      document.getElementById('file-satellite-img'),
      document.getElementById('url-satellite-img'),
      document.getElementById('preview-satellite-img'),
      (imgSrc) => {
        if (!currentData.map) currentData.map = {};
        currentData.map.satelliteImage = imgSrc;
      }
    );
  }

  function readMap() {
    if (!currentData.map) currentData.map = {};
    currentData.map.satelliteImage = getVal('url-satellite-img');
    currentData.map.coordinates = getVal('map-coords');
    currentData.map.elevation = getVal('map-elevation');
    currentData.map.googleMapsSearchUrl = getVal('map-url-search');
    currentData.map.embedUrl = getVal('map-url-embed');
  }

  // ===========================================================================
  // 7. SAVE, EXPORT, COPY & RESET HANDLERS
  // ===========================================================================

  function collectAllData() {
    readGeneral();
    readAbout();
    readHistory();
    readQuickFacts();
    readPhotos();
    readAgriculture();
    readTemples();
    readFestivals();
    delete currentData.culture;
    readPanchayat();
    readSchools();
    readTransport();
    readContacts();
    readNotices();
    readMap();
    currentData.lastUpdated = Date.now();
  }

  async function saveAllChanges(options = {}) {
    collectAllData();
    const shouldPushGit = options.pushGit === true;
    try {
      // 1. Save to browser IndexedDB & localStorage first (instant & offline)
      if (window.VillageStorage && window.VillageStorage.saveData) {
        await window.VillageStorage.saveData(currentData);
      } else {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentData));
      }

      // 2. Broadcast local update across open browser tabs
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          new BroadcastChannel('yeliyuru_sync_channel').postMessage({ type: 'DATA_SAVED', timestamp: Date.now() });
        }
      } catch (bcE) {}

      // 3. Post to Node.js backend server (writes to SQLite yeliyuru.db & data.js on disk)
      let serverSaved = false;
      let gitPushed = false;
      try {
        const payload = Object.assign({}, currentData, { pushToGit: shouldPushGit });
        const res = await fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const json = await res.json();
          serverSaved = true;
          if (json.git && json.git.pushed) {
            gitPushed = true;
          }
        }
      } catch (apiErr) {
        console.warn("Backend API sync notice:", apiErr);
      }

      markSaved();

      if (serverSaved && gitPushed) {
        showToast("✅ Saved to SQLite DB & Pushed to Live Mobile (GitHub Pages)!");
      } else if (serverSaved) {
        showToast("✅ Changes saved to SQLite Database and data.js successfully!");
      } else {
        showToast("All changes saved in browser storage. (Local server offline)");
      }
    } catch (e) {
      console.error("Save error:", e);
      showToast("Error saving data: " + e.message, true);
    }
  }

  async function publishToMobile() {
    const btn = document.getElementById('btn-publish-live');
    const oldHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-inline"></span> Publishing to Mobile...';
    }
    showToast("Publishing updates to GitHub Pages for Mobile access...", false);

    try {
      await saveAllChanges({ pushGit: true });
      showToast("🚀 Live on Mobile! (Local Wi-Fi at 192.168.1.16:8000 updates instantly; GitHub Pages in ~30s)");
    } catch (e) {
      showToast("Publish error: " + e.message, true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
      }
    }
  }

  function exportDataJsFile() {
    collectAllData();
    const fileHeader = `/**
 * Yeliyuru Village Comprehensive Dataset
 * Location: Devanahalli Taluk, Bengaluru Rural District, Karnataka (562110)
 * Identity: The Land of Milk and Silk | Biggest Producer in Bengaluru Rural
 * Exported from Yeliyuru Admin Portal
 */

const VILLAGE_DATA = ${JSON.stringify(currentData, null, 2)};
`;

    const blob = new Blob([fileHeader], { type: 'application/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Downloaded updated data.js! Replace data.js in your project to keep changes permanently.");
  }

  function copyCodeToClipboard() {
    collectAllData();
    const code = `const VILLAGE_DATA = ${JSON.stringify(currentData, null, 2)};`;
    navigator.clipboard.writeText(code).then(() => {
      showToast("Copied updated data.js code to clipboard!");
    }).catch(err => {
      showToast("Failed to copy code: " + err, true);
    });
  }

  async function resetToDefault() {
    if (confirm("Are you sure you want to revert all custom changes? This will reload the original default village dataset.")) {
      if (window.VillageStorage && window.VillageStorage.clearData) {
        await window.VillageStorage.clearData();
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
      const source = (typeof VILLAGE_DATA !== 'undefined' ? VILLAGE_DATA : window.VILLAGE_DATA) || {};
      currentData = JSON.parse(JSON.stringify(source));
      populateAllFields();
      markSaved();
      showToast("Reset to default village data successfully!");
    }
  }

  // Helper utils
  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  }

  function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ===========================================================================
  // 8. SECURITY & PASSWORD GATE ('chiru_yeliyuru_2026')
  // ===========================================================================
  const VALID_ADMIN_PASSWORDS = ['chiru_yeliyuru_2026', 'yeliyuru@admin2026'];
  const AUTH_SESSION_KEY = 'yeliyuru_admin_auth_session';

  function initSecurityGate() {
    const overlay = document.getElementById('admin-auth-overlay');
    const form = document.getElementById('admin-login-form');
    const input = document.getElementById('admin-pass-input');
    const errorMsg = document.getElementById('auth-error-msg');
    const togglePassBtn = document.getElementById('btn-toggle-pass');
    const logoutBtn = document.getElementById('btn-admin-logout');

    const isAuthenticated = sessionStorage.getItem(AUTH_SESSION_KEY) === 'true';

    if (isAuthenticated) {
      if (overlay) overlay.classList.add('hidden');
    } else {
      if (overlay) overlay.classList.remove('hidden');
      if (input) setTimeout(() => input.focus(), 250);
    }

    // Toggle password visibility
    if (togglePassBtn && input) {
      togglePassBtn.addEventListener('click', () => {
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        togglePassBtn.innerHTML = isPass ?
          (window.YELIYURU_ICONS?.eyeOff || '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="2" x2="22" y2="22"/></svg>') :
          (window.YELIYURU_ICONS?.eye || '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg>');
      });
    }

    // Login verification
    function checkLogin() {
      const entered = (input ? input.value : '').trim();
      if (VALID_ADMIN_PASSWORDS.includes(entered)) {
        sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
        if (overlay) overlay.classList.add('hidden');
        if (errorMsg) errorMsg.classList.remove('show');
        if (input) input.value = '';
        showToast("Welcome Admin! Logged in successfully.");
      } else {
        if (errorMsg) {
          errorMsg.textContent = "Incorrect password! Please try again.";
          errorMsg.classList.add('show');
        }
        const card = document.querySelector('.admin-auth-card');
        if (card) {
          card.classList.add('auth-shake');
          setTimeout(() => card.classList.remove('auth-shake'), 450);
        }
        if (input) {
          input.value = '';
          input.focus();
        }
      }
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        checkLogin();
      });
    }

    const submitBtn = document.getElementById('btn-submit-auth');
    if (submitBtn) {
      submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        checkLogin();
      });
    }

    // Logout handler
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        if (overlay) overlay.classList.remove('hidden');
        if (errorMsg) errorMsg.classList.remove('show');
        if (input) {
          input.value = '';
          setTimeout(() => input.focus(), 250);
        }
        showToast("Logged out of admin panel.");
      });
    }
  }

  // Database health check & status indicator
  async function checkDatabaseStatus() {
    const dbIndicator = document.getElementById('db-status-text');
    if (!dbIndicator) return;
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.database) {
          const totalRows = Object.values(json.database.counts || {}).reduce((a, b) => a + b, 0);
          dbIndicator.textContent = `SQLite DB (${totalRows} records)`;
          const pill = document.getElementById('db-status-indicator');
          if (pill) {
            pill.title = `SQLite Database: yeliyuru.db (${json.database.sizeFormatted}, ${totalRows} records total)`;
          }
          const dot = document.querySelector('.db-dot');
          if (dot) dot.style.backgroundColor = '#10b981';
          return;
        }
      }
    } catch (e) {
      dbIndicator.textContent = 'IndexedDB Mode';
      const pill = document.getElementById('db-status-indicator');
      if (pill) {
        pill.title = 'Client-side storage active (IndexedDB)';
      }
      const dot = document.querySelector('.db-dot');
      if (dot) dot.style.backgroundColor = '#f59e0b';
    }
  }

  // 9. EVENT ATTACHMENTS & BOOTSTRAP
  document.addEventListener('DOMContentLoaded', () => {
    initData();
    initTheme();
    initSecurityGate();
    initTabs();
    populateAllFields();
    checkDatabaseStatus();

    // Unified Save & Publish Live Button (saves to IndexedDB, SQLite DB, data.js, and pushes to GitHub)
    const btnSave = document.getElementById('btn-save-all');
    if (btnSave) {
      btnSave.addEventListener('click', async () => {
        const oldHtml = btnSave.innerHTML;
        btnSave.disabled = true;
        btnSave.innerHTML = '<span class="spinner-inline"></span> Saving & Publishing...';
        try {
          await saveAllChanges({ pushGit: true });
        } finally {
          btnSave.disabled = false;
          btnSave.innerHTML = oldHtml;
        }
      });
    }

    // Tools dropdown toggle
    const toolsToggle = document.getElementById('btn-tools-toggle');
    const toolsMenu = document.getElementById('tools-dropdown-menu');
    if (toolsToggle && toolsMenu) {
      toolsToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toolsMenu.classList.toggle('show');
      });
      document.addEventListener('click', () => {
        toolsMenu.classList.remove('show');
      });
      toolsMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        toolsMenu.classList.remove('show');
      });
    }

    document.querySelectorAll('.btn-save-quick').forEach(b => {
      b.addEventListener('click', () => saveAllChanges({ pushGit: true }));
    });

    // Export file
    const btnExport = document.getElementById('btn-export-file');
    if (btnExport) btnExport.addEventListener('click', exportDataJsFile);

    // Copy code
    const btnCopy = document.getElementById('btn-copy-code');
    if (btnCopy) btnCopy.addEventListener('click', copyCodeToClipboard);

    // Reset default
    const btnReset = document.getElementById('btn-reset-default');
    if (btnReset) btnReset.addEventListener('click', resetToDefault);

    // Auto-save on 'View Portal' click so changes never get lost
    document.querySelectorAll('a[href="index.html"]').forEach(link => {
      link.addEventListener('click', () => {
        saveAllChanges({ pushGit: false });
      });
    });

    // Mark unsaved on any input change & debounced auto-save (local & SQLite)
    let autoSaveTimer = null;
    const adminMain = document.querySelector('.admin-main');
    if (adminMain) {
      adminMain.addEventListener('input', () => {
        markUnsaved();
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
          saveAllChanges({ pushGit: false });
        }, 1500);
      });
    }
  });

})();

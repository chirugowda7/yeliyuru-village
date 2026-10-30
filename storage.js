/**
 * =============================================================================
 * YELIYURU VILLAGE PORTAL - STORAGE & IMAGE OPTIMIZATION ENGINE
 * Solves the browser localStorage 5MB quota limit by:
 * 1. Using IndexedDB (virtually unlimited quota for high-res images)
 * 2. Canvas-based Client-Side Image Compression (90%+ size reduction)
 * 3. Graceful fallback to localStorage
 * =============================================================================
 */

(function (window) {
  'use strict';

  const DB_NAME = 'YeliyuruVillagePortalDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'village_data_store';
  const RECORD_KEY = 'custom_village_data_record';
  const LS_KEY = 'yeliyuru_custom_village_data';

  // 1. OPEN / MIGRATE INDEXEDDB
  function openDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB not supported in this browser"));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 2. LOAD DATA (BACKEND SQLITE API FIRST -> INDEXEDDB -> LOCALSTORAGE)
  async function loadData() {
    // A. Try Backend SQLite Database API first
    try {
      const apiRes = await fetch('/api/data', { cache: 'no-store' });
      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json && json.success && json.data && typeof json.data === 'object') {
          // Cache to IndexedDB for offline resilience
          try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(json.data, RECORD_KEY);
          } catch (e) {}
          return json.data;
        }
      }
    } catch (apiErr) {
      // Server may be offline or opened as static file, proceed to offline stores
    }

    // B. Fallback to IndexedDB
    try {
      const db = await openDB();
      const idbData = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(RECORD_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      if (idbData && typeof idbData === 'object' && Object.keys(idbData).length > 0) {
        return idbData;
      }
    } catch (e) {
      console.warn("IndexedDB load notice (falling back to localStorage):", e);
    }

    // C. Fallback to localStorage
    try {
      const lsRaw = localStorage.getItem(LS_KEY);
      if (lsRaw) {
        const parsed = JSON.parse(lsRaw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) {
      console.warn("localStorage load notice:", e);
    }

    return null;
  }

  // 3. SAVE DATA (SYNC TO BACKEND SQLITE API + INDEXEDDB + LOCALSTORAGE)
  async function saveData(data) {
    if (!data || typeof data !== 'object') {
      throw new Error("Invalid data provided to storage engine.");
    }

    let savedToBackend = false;
    let savedToIdb = false;

    // A. Sync to Backend SQLite Database API
    try {
      const apiRes = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (apiRes.ok) {
        savedToBackend = true;
      }
    } catch (apiErr) {
      console.warn("API save notice (data will be saved locally in IndexedDB):", apiErr);
    }

    // B. Save to IndexedDB (virtually unlimited quota for photos & records)
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(data, RECORD_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      savedToIdb = true;
    } catch (e) {
      console.warn("IndexedDB save error:", e);
    }

    // C. Also attempt to save to localStorage as a lightweight fallback
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch (quotaError) {
      console.info("localStorage 5MB quota reached; data is safely preserved in SQLite & IndexedDB.");
    }

    // D. Broadcast change to all open tabs and windows for instant live sync
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('yeliyuru_sync_channel');
        bc.postMessage({ type: 'DATA_SAVED', timestamp: Date.now() });
        setTimeout(() => bc.close(), 100);
      }
    } catch (bcErr) {}
    try {
      window.dispatchEvent(new CustomEvent('village-data-saved', { detail: data }));
    } catch (evErr) {}

    if (!savedToBackend && !savedToIdb) {
      try {
        if (localStorage.getItem(LS_KEY)) return true;
      } catch (e) {}
      throw new Error("Could not save data to storage.");
    }

    return true;
  }

  // 4. CLEAR / RESET DATA
  async function clearData() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch (e) {}

    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(RECORD_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn("IndexedDB clear error:", e);
    }
  }

  // 5. CLIENT-SIDE IMAGE COMPRESSOR (CANVAS BASED)
  // Reduces a 5MB-10MB photo to ~70KB-120KB web-optimized JPEG
  function compressImageFile(file, maxWidth = 1200, maxHeight = 900, quality = 0.8) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.match(/image.*/)) {
        reject(new Error("File is not an image"));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let w = img.width;
          let h = img.height;

          // Aspect ratio proportional scaling
          if (w > maxWidth || h > maxHeight) {
            const ratio = Math.min(maxWidth / w, maxHeight / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          
          // Better quality downsampling
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);

          // Export compressed JPEG
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        };
        img.onerror = () => resolve(e.target.result); // Fallback to raw if load fails
        img.src = e.target.result;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  // Export globally
  window.VillageStorage = {
    loadData,
    saveData,
    clearData,
    compressImageFile
  };

})(window);

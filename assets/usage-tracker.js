/**
 * 本地使用统计（三工具共用，localStorage）
 * 从上线后累计，不追溯历史操作。
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'channelMaterialUsageStats_v1';
    function makeStartLabel() {
        const d = new Date();
        const ms = String(d.getMilliseconds()).padStart(3, '0');
        const tail = String(Math.floor(Math.random() * 10));
        return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}.${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}:${ms}${tail}`;
    }

    function emptyBucket() {
        return {
            test: { verifyRuns: 0, mismatchRuns: 0, perfectMatchRuns: 0 },
            photo: {
                imagesImported: 0, configsImported: 0, specsCreated: 0, configsSaved: 0,
                quickCrop: 0, logoEditor: 0, logosImported: 0, logoSave: 0
            },
            video: {
                videosImported: 0, configsImported: 0, quickCrop: 0
            }
        };
    }

    function cloneBucket(b) {
        return {
            test: { ...b.test },
            photo: { ...b.photo },
            video: { ...b.video }
        };
    }

    function loadStore() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                const fresh = { totals: emptyBucket(), months: {}, startedAt: makeStartLabel() };
                saveStore(fresh);
                return fresh;
            }
            const parsed = JSON.parse(raw);
            const totals = { ...emptyBucket(), ...(parsed.totals || {}) };
            totals.test = { ...emptyBucket().test, ...(totals.test || {}) };
            totals.photo = { ...emptyBucket().photo, ...(totals.photo || {}) };
            totals.video = { ...emptyBucket().video, ...(totals.video || {}) };
            const store = { totals, months: parsed.months && typeof parsed.months === 'object' ? parsed.months : {}, startedAt: parsed.startedAt || makeStartLabel() };
            if (!parsed.startedAt) saveStore(store);
            return store;
        } catch (e) {
            const fresh = { totals: emptyBucket(), months: {}, startedAt: makeStartLabel() };
            saveStore(fresh);
            return fresh;
        }
    }

    function saveStore(store) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        } catch (e) {
            console.warn('UsageTracker save failed', e);
        }
    }

    function monthKey(d) {
        const dt = d || new Date();
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    }

    function ensureMonth(store, key) {
        if (!store.months[key]) store.months[key] = emptyBucket();
        const b = store.months[key];
        b.test = { ...emptyBucket().test, ...b.test };
        b.photo = { ...emptyBucket().photo, ...b.photo };
        b.video = { ...emptyBucket().video, ...b.video };
        return b;
    }

    function bump(tool, field, n) {
        const delta = Math.max(0, Number(n) || 0);
        if (!delta) return;
        if (!['test', 'photo', 'video'].includes(tool)) return;
        const store = loadStore();
        const mk = monthKey();
        const month = ensureMonth(store, mk);
        if (typeof store.totals[tool][field] !== 'number') store.totals[tool][field] = 0;
        if (typeof month[tool][field] !== 'number') month[tool][field] = 0;
        store.totals[tool][field] += delta;
        month[tool][field] += delta;
        saveStore(store);
    }

    function trackTestVerify(stats) {
        const s = stats || {};
        const matched = Math.max(0, Number(s.matchedCount) || 0);
        const errors = Math.max(0, Number(s.errorCount) || 0);
        const missing = Math.max(0, Number(s.missingCount) || 0);
        const extra = Math.max(0, Number(s.extraCount) || 0);
        bump('test', 'verifyRuns', 1);
        if (errors + missing + extra > 0) bump('test', 'mismatchRuns', 1);
        const perfect = Math.max(0, matched - errors);
        if (perfect > 0) bump('test', 'perfectMatchRuns', 1);
    }

    const UsageTracker = {
        bump,
        loadStore,
        trackTestVerify() {
            trackTestVerify.apply(null, arguments);
        },
        trackPhotoImagesImported(n) { bump('photo', 'imagesImported', n); },
        trackPhotoConfigImported() { bump('photo', 'configsImported', 1); },
        trackPhotoSpecCreated() { bump('photo', 'specsCreated', 1); },
        trackPhotoConfigSaved() { bump('photo', 'configsSaved', 1); },
        trackPhotoQuickCrop() { bump('photo', 'quickCrop', 1); },
        trackPhotoLogoEditor() { bump('photo', 'logoEditor', 1); },
        trackPhotoLogosImported(n) { bump('photo', 'logosImported', n); },
        trackPhotoLogoSave() { bump('photo', 'logoSave', 1); },
        trackVideoImported(n) { bump('video', 'videosImported', n); },
        trackVideoConfigImported() { bump('video', 'configsImported', 1); },
        trackVideoQuickCrop() { bump('video', 'quickCrop', 1); }
    };

    global.UsageTracker = UsageTracker;
})(typeof window !== 'undefined' ? window : global);

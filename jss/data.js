// --- DATA PROCESSING (Refactored for Cache Support) ---
function processRawData(rawData) {
    if (!Array.isArray(rawData)) return;

    // Reset arrays
    database = []; newsData = []; videoPopups = []; sportsData = []; salesScripts = []; quizQuestions = []; arenaQuizQuestions = []; quickDecisionQuestions = [];

    // Single pass optimization
    rawData.forEach(i => {
        const type = (i.Type || '').toLowerCase();
        const category = (i.Category || '').toLowerCase();

        // Database (Cards)
        if (['card', 'bilgi', 'teknik', 'kampanya', 'ikna'].includes(type)) {
            database.push({
                id: i.id, // Anti-Grafiti: ID saklanmalı
                title: i.Title, category: i.Category, text: i.Text, script: i.Script, code: i.Code, link: i.Link, image: i.Image, date: formatDateToDDMMYYYY(i.Date)
            });
        }
        // News
        else if (type === 'news') {
            newsData.push({
                id: i.id, // Anti-Grafiti: ID saklanmalı
                date: formatDateToDDMMYYYY(i.Date),
                title: i.Title,
                desc: i.Text,
                type: i.Category,
                status: i.Status,
                image: i.Image,
                isMandatory: (i.IsMandatory === true || String(i.IsMandatory) === 'true'),
                targetGroups: i.TargetGroups || '',
                popupTimer: parseInt(i.PopupTimer) || 30
            });
        }
        // Sport
        else if (type === 'sport') {
            sportsData.push({
                id: i.id, // Anti-Grafiti: ID eklenmeli
                title: i.Title, icon: i.Icon, desc: i.Text, tip: i.Tip, detail: i.Detail, pronunciation: i.Pronunciation
            });
        }
        // Sales
        else if (type === 'sales') {
            salesScripts.push({
                id: i.id, // Anti-Grafiti: ID eklenmeli
                title: i.Title, text: i.Text
            });
        }
        // Quiz
        else if (type === 'quiz') {
            const qObj = {
                q: i.Text, 
                opts: i.QuizOptions ? i.QuizOptions.split(',').map(o => o.trim()) : [], 
                a: parseInt(i.QuizAnswer),
                rewardSteps: parseInt(i.Detail || 3) // Reward steps stored in Detail
            };
            
            // DİKKAT: Arena ödül sorularını ayır, diğer oyuna karışmasın!
            if (String(i.Category || '').toLowerCase() === 'arena ödül') {
                qObj.id = i.id; // ID'yi burada mutlaka saklıyoruz
                arenaQuizQuestions.push(qObj);
            } else {
                quizQuestions.push(qObj);
            }
        }
        // Quick Decision
        else if (type === 'quickdecision') {
            const opts = String(i.QuizOptions || '').split('|').map(x => x.trim()).filter(Boolean);
            let a = parseInt(i.QuizAnswer, 10);
            if (isNaN(a)) a = 0;
            if (a < 0) a = 0;
            if (opts.length && a >= opts.length) a = opts.length - 1;
            const exp = (i.Detail || '').toString().trim();
            if ((i.Text || '').toString().trim() && Array.isArray(opts) && opts.length >= 2) {
                quickDecisionQuestions.push({ q: (i.Text || '').toString().trim(), opts, a, exp });
            }
        }
        // Video Popup
        else if (type === 'video') {
            videoPopups.push({
                id: i.id,
                title: i.Title || 'Video',
                url: i.Link || '',
                targetGroups: i.TargetGroups || '',
                status: i.Status || 'Aktif',
                date: i.Date // Anti-Grafiti: Tarih eklenmeli
            });
        }
    });

    // Post-process
    database.sort((a, b) => parseDateTRToTS(b.date) - parseDateTRToTS(a.date));
    newsData.sort((a, b) => parseDateTRToTS(b.date) - parseDateTRToTS(a.date));
    try { applySportsRights(); } catch (e) { }

    // cardsData alias removed

    if (currentCategory === 'fav') { filterCategory(document.querySelector('.btn-fav'), 'fav'); }
    else {
        activeCards = database;
        if (currentCategory === 'home') { showHomeScreen(); }
        else { hideHomeScreen(); renderCards(database); }
    }
    startTicker();
    try { updateSearchResultCount(activeCards.length || database.length, database.length); } catch (e) { }
}

async function loadContentData(isBackground = false, forceRefresh = false) {
    const CACHE_KEY = "sSportContentCache";
    const CACHE_DATE_KEY = "sSportContentCacheDate";
    const loader = document.getElementById('loading');
    let loadedFromCache = false;

    // 📅 GÜNLÜK ÖNBELLEK: Bugünkü tarih ile karşılaştır
    const today = new Date().toDateString(); // "Sat Apr 19 2026"
    const cachedDate = localStorage.getItem(CACHE_DATE_KEY);
    const isCacheToday = (cachedDate === today);

    // 1. Aynı gün içinde cache tazeyse → PusulaDB'ye gitme, sadece cache'ten yükle
    if (!forceRefresh && isCacheToday) {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed && Array.isArray(parsed) && parsed.length > 0) {
                    if (loader) loader.style.display = 'none';
                    processRawData(parsed);
                    loadedFromCache = true;
                    if (typeof __dataLoadedResolve === "function") __dataLoadedResolve();
                    if (typeof filterContent === "function") filterContent();
                    if (typeof startTicker === "function") startTicker();
                    if (!isBackground) {
                        setTimeout(checkMandatoryAnnouncements, 2000);
                        setTimeout(checkVideoPopups, 3500);
                    }
                    console.log("[Pusula] İçerikler günlük önbellekten yüklendi (PusulaDB'ye istek gitmedi).");
                    return; // ✅ PusulaDB'ye istek gönderme!
                }
            }
        } catch (e) { }
    }

    // 2. Cache yoksa, eski günse veya forceRefresh ise → PusulaDB'den taze çek
    try {
        if (!isBackground && loader) loader.style.display = 'block';

        const { data, error } = await window.PusulaDB.content.loadMainData();
        if (error) throw error;

        if (loader) loader.style.display = 'none';

        // 📅 Cache'i ve tarihi kaydet
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(CACHE_DATE_KEY, today); // Bugünün tarihini kaydet
        console.log("[Pusula] İçerikler PusulaDB'den çekildi, günlük önbelleğe alındı. Tarih:", today);
        processRawData(data);
    } catch (err) {
        console.error("[Pusula] Supabase Load error:", err);
        // Hata durumunda eski cache'ten yükle (tarih fark etmeksizin)
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed && Array.isArray(parsed) && parsed.length > 0) {
                    processRawData(parsed);
                }
            }
        } catch (_) { }
        if (!loadedFromCache && loader) {
            loader.innerHTML = 'Veriler yüklenirken bir hata oluştu: ' + err.message;
        }
    } finally {
        if (typeof __dataLoadedResolve === "function") __dataLoadedResolve();
        if (typeof filterContent === "function") filterContent();
        if (typeof startTicker === "function") startTicker();

        if (!isBackground) {
            setTimeout(checkMandatoryAnnouncements, 2000);
            setTimeout(checkVideoPopups, 3500);
        }

        // ✅ 30dk background timer KALDIRILDI
        // Artık günlük cache var, arka planda sürekli güncelleme yapmıyoruz.
        // Admin içerik eklediğinde loadContentData(false, true) çağrılarak yenilensin.
    }
}
// --- WIZARD İŞLEMLERİ (Supabase) ---
async function loadWizardData() {
    try {
        const { data, error } = await window.PusulaDB.content.loadWizard();
        if (error) throw error;

        wizardStepsData = {};
        (data || []).map(normalizeKeys).forEach(row => {
            if (!row.stepId) return;
            const stepId = String(row.stepId).trim();

            const opts = [];
            let optRaw = row.options || "";
            if (optRaw) {
                String(optRaw).split(',').forEach(p => {
                    const parts = p.trim().split('|');
                    // Format: "Text | NextId" veya "Text | NextId | Style"
                    if (parts.length >= 2) {
                        opts.push({
                            text: parts[0].trim(),
                            next: parts[1].trim(),
                            style: parts[2] ? parts[2].trim() : 'primary'
                        });
                    }
                });
            }

            wizardStepsData[stepId] = {
                title: row.title || row.Title || "",
                text: row.text || row.Text || "",
                script: row.script || "",
                result: row.result || "",
                alert: row.alert || "",
                options: opts
            };
        });
        console.log("[Wizard] Data Loaded:", Object.keys(wizardStepsData).length, "steps");
    } catch (err) {
        console.error("[Pusula] Wizard Fetch Error:", err);
    }
}

async function loadTechWizardData() {
    try {
        const { data, error } = await window.PusulaDB.content.loadTechWizard();
        if (error) throw error;

        techWizardData = {};
        (data || []).map(normalizeKeys).forEach(row => {
            if (!row.stepId) return;
            const stepId = String(row.stepId).trim();

            const btns = [];
            let optRaw = row.options || ""; // normalizeKeys sayesinde Buttons da options oldu
            if (optRaw) {
                String(optRaw).split(',').forEach(b => {
                    const parts = b.trim().split('|');
                    if (parts.length >= 2) {
                        btns.push({
                            text: parts[0].trim(),
                            next: parts[1].trim(),
                            style: parts[2] ? parts[2].trim() : 'primary'
                        });
                    }
                });
            }

            techWizardData[stepId] = {
                title: row.title || row.Title || "",
                text: row.text || row.Text || "",
                script: row.script || "",
                alert: row.alert || "",
                result: row.result || "",
                buttons: btns,
                options: btns // her ihtimale karşı
            };
        });
        console.log("[TechWizard] Data Loaded:", Object.keys(techWizardData).length, "steps");
    } catch (err) {
        console.error("[Pusula] TechWizard Fetch Error:", err);
    }
}

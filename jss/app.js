

// 🚀 Pusula Auto-Update & Cache Buster (v1.5)
(function() {
    const currentVersion = "1.5";
    const savedVersion = localStorage.getItem("pusula_version");
    if (savedVersion !== currentVersion) {
        // Eski data cache'ini temizle ki yeni mappingler her yere işlesin
        localStorage.removeItem("sSportContentCache");
        localStorage.setItem("pusula_version", currentVersion);
        console.log("[Pusula] Sistem v" + currentVersion + " sürümüne güncellendi. Önbellek tazelendi.");
    }
})();

function formatWeekLabel(raw) {
    try {
        if (!raw) return '';
        const s = String(raw);
        const parts = s.split('-');
        if (parts.length >= 2) {
            const startStr = parts[0].trim();
            const endStr = parts[1].trim();
            const d1 = new Date(startStr);
            const d2 = new Date(endStr);
            if (!isNaN(d1) && !isNaN(d2)) {
                const sameMonth = d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
                if (sameMonth) {
                    const day1 = d1.toLocaleDateString('tr-TR', { day: '2-digit' });
                    const day2 = d2.toLocaleDateString('tr-TR', { day: '2-digit' });
                    const monthYear = d1.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
                    return `${day1} - ${day2} ${monthYear}`;
                } else {
                    const full1 = d1.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
                    const full2 = d2.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
                    return `${full1} - ${full2}`;
                }
            }
        }
    } catch (e) { }
    return raw || '';
}

function formatShiftDate(d) {
    try {
        const dt = new Date(d);
        if (!isNaN(dt)) {
            return dt.toLocaleDateString('tr-TR', { weekday: 'short', day: '2-digit', month: '2-digit' });
        }
    } catch (e) { }
    return d;
}

const BAKIM_MODU = false;

function showGlobalError(message) {
    // Kullanıcılara kırmızı bant gösterme (istek: ekran temiz kalsın)
    // Sadece konsola yaz ve (locadmin/admin ise) küçük bir toast göster.
    try { console.warn("[Pusula]", message); } catch (e) { }
    try {
        const role = localStorage.getItem("sSportRole") || "";
        if (role === "admin" || role === "locadmin") {
            Swal.fire({ toast: true, position: 'bottom-end', icon: 'warning', title: String(message || 'Uyarı'), showConfirmButton: false, timer: 2500 });
        }
    } catch (e) { }
}

// Base64 to Blob helper
function b64toBlob(b64Data, contentType = '', sliceSize = 512) {
    try {
        const byteCharacters = atob(b64Data);
        const byteArrays = [];
        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            const slice = byteCharacters.slice(offset, offset + sliceSize);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }
        return new Blob(byteArrays, { type: contentType });
    } catch (e) {
        console.error("b64toBlob error:", e);
        return null;
    }
}

// --- SUPABASE BAĞLANTISI (api_service.js'e taşındı) ---
// Global window.sb kullanılmaktadır.

// ✅ Mail Bildirim Ayarları (Google Apps Script Web App URL)
const GAS_MAIL_URL = "https://script.google.com/macros/s/AKfycbwZZbRVksffgpu_WvkgCoZehIBVTTTm5j5SEqffwheCU44Q_4d9b64kSmf40wL1SR8/exec";

// 🔐 Anti-Grafiti: GAS Secret Token (GAS tarafında aynı değer olmalı!)
// Bu token'ı GAS kodundaki SECURITY_TOKEN ile eşleştir.
const GAS_SECURITY_TOKEN = "pusula_gas_2026_gizli";

async function sendMailNotification(to, eventType, data) {
    if (!GAS_MAIL_URL || GAS_MAIL_URL.includes("X0X0")) {
        console.warn("[Pusula Mail] Mail servisi URL'si ayarlanmamış.");
        return;
    }
    try {
        // 🔐 Replay Attack Koruması: Her istekte timestamp gönder
        const timestamp = Date.now();
        const payload = {
            action: "sendEmail",
            to,
            eventType,
            data,
            token: GAS_SECURITY_TOKEN,   // GAS bu token'ı doğrulayacak
            timestamp                     // GAS 60 sn tolerans uygulayacak
        };

        await fetch(GAS_MAIL_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log("[Pusula Mail] Gönderim tetiklendi:", to, eventType);
    } catch (e) { console.error("[Pusula Mail] Hata:", e); }
}

async function saveLog(action, details) {
    if (!sb) return;
    // 🕵️ Ghost Mode: LocAdmin işlemlerini loglamıyoruz
    const user = currentUser || localStorage.getItem("sSportUser") || '-';
    if (String(user).toLowerCase() === 'locadmin') return;

    try {
        await sb.from('Logs').insert([{
            Username: user,
            Action: action,
            Details: details,
            "İP ADRESİ": globalUserIP || '-',
            Date: new Date().toISOString()
        }]);
    } catch (e) { console.error("[Pusula Log] Hata:", e); }
}

// 🌐 NEW: Google Sheets CSV Fetcher
async function fetchCSVAsJSON(url) {
    if (!url) return [];
    console.log("[Pusula CSV] İstek başlatıldı:", url);
    try {
        // Pub linki değilse, pub formatına çevirmeyi dene (docs.google.com -> /pub?output=csv)
        let csvUrl = url;
        if (url.includes("docs.google.com/spreadsheets")) {
            const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (idMatch) {
                const sheetId = idMatch[1];
                const gidMatch = url.match(/gid=([0-9]+)/);
                const gid = gidMatch ? gidMatch[1] : 0;
                // /gviz/tq endpointi "Web'de Yayınla" yapılmasa bile "Bağlantısı olan herkes" modunda çalışabilir.
                csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
                console.log("[Pusula CSV] Gviz URL kullanılıyor:", csvUrl);
            }
        }

        const response = await fetch(csvUrl);
        console.log("[Pusula CSV] Yanıt durumu:", response.status, response.ok);
        if (!response.ok) throw new Error("Dosya alınamadı (HTTP " + response.status + ")");
        
        const csvText = await response.text();
        console.log("[Pusula CSV] Ham metin boyutu:", csvText.length, "karakter");
        
        // Basit CSV Parser (virgül veya noktalı virgül ayrımı yapar)
        const lines = csvText.split(/\r?\n/).filter(l => l.trim());
        console.log("[Pusula CSV] Satır sayısı:", lines.length);
        if (lines.length < 2) {
            console.warn("[Pusula CSV] Veri yok veya sadece başlık var.");
            return [];
        }

        // Delimiter tespiti (virgül veya noktalı virgül)
        const firstLine = lines[0];
        const delimiter = (firstLine.includes(';') && !firstLine.includes(',')) ? ';' : ',';
        console.log("[Pusula CSV] Ayrıştırıcı (delimiter):", delimiter);

        const headers = firstLine.split(delimiter).map(h => h.replace(/^"|"$/g, '').trim());
        console.log("[Pusula CSV] Başlıklar:", headers);

        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const row = lines[i];
            const rowArr = [];
            let current = '';
            let inQuotes = false;
            for (let char of row) {
                if (char === '"') inQuotes = !inQuotes;
                else if (char === delimiter && !inQuotes) {
                    rowArr.push(current.trim());
                    current = '';
                } else current += char;
            }
            rowArr.push(current.trim());

            const obj = {};
            headers.forEach((h, idx) => {
                let val = (rowArr[idx] || '').replace(/^"|"$/g, '').trim();
                obj[h] = val;
            });
            data.push(obj);
        }
        console.log("[Pusula CSV] Başarıyla ayrıştırıldı. Nesne sayısı:", data.length);
        return data;
    } catch (e) {
        console.error("[Pusula CSV] HATA:", e);
        if (e.message.indexOf('fetch') > -1 || e.message.indexOf('CORS') > -1) {
            Swal.fire("Bağlantı Hatası", "Google Sheets'e erişilemedi.", "error");
        }
        throw e;
    }
}

async function fetchGSheetRawTSV(url) {
    return new Promise(async (resolve, reject) => {
        console.log("[Pusula] v8.7.2 NITRO Scraper Aktif (Turbo-Safe)");
        const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!idMatch) return reject(new Error("Geçersiz link"));
        
        const sheetId = idMatch[1];
        const gidMatch = url.match(/gid=([0-9]+)/);
        const gid = gidMatch ? gidMatch[1] : 0;
        const targetTsvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=tsv&gid=${gid}`;
        
        const proxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(targetTsvUrl)}&t=${Date.now()}`,
            `https://corsproxy.io/?${encodeURIComponent(targetTsvUrl)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetTsvUrl)}`,
            targetTsvUrl // Direct
        ];

        const fetchWithTimeout = (resource, timeout = 15000) => {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            return fetch(resource, { signal: controller.signal }).then(res => {
                clearTimeout(id);
                return res;
            });
        };

        const tryPickValidAndFastest = async () => {
            const fetchers = proxies.map((p, idx) => {
                return new Promise(async (res, rej) => {
                    try {
                        if (idx > 0) await new Promise(r => setTimeout(r, idx * 800)); 
                        const response = await fetchWithTimeout(p, 12000);
                        const text = await response.text();
                        
                        // 🕵️ Derin Doğrulama: Sadece uzunluk değil, içerik de önemli
                        const linesCount = text.split('\n').length;
                        const hasTab = text.includes('\t');
                        const hasIdentifier = text.toLowerCase().includes('tsi') || text.toLowerCase().includes('event') || text.toLowerCase().includes('match') || text.toLowerCase().includes('karşılaşma');

                        if (text && text.length > 200 && linesCount > 2 && (hasTab || hasIdentifier)) {
                            res(text);
                        } else {
                            rej("Geçersiz veya boş TSV yapısı.");
                        }
                    } catch (e) { rej(e); }
                });
            });

            try { return await Promise.any(fetchers); } 
            catch (e) { throw new Error("Yayın akışı verisi tüm hatlardan çekilemedi (CORS veya Link hatası)."); }
        };

        try {
            const tsvText = await tryPickValidAndFastest();
            const lines = tsvText.replace(/\r/g, "").split('\n').filter(l => l.trim());
            const tsvRows = lines.map(line => line.split('\t').map(c => c.trim()));

            // 🕵️‍♂️ Header Tespiti
            let idxTitle = 1, idxTime = 3, idxNote = 4, idxSpiker = 5;

            for (let i = 0; i < Math.min(tsvRows.length, 100); i++) {
                const h = tsvRows[i].map(t => t.toLowerCase());
                const foundTitle = h.findIndex(t => t.includes('event') || t.includes('karşılaşma') || t.includes('match') || t.includes('yarış'));
                // 🔍 Prioritize Kick-off/Start Time over other TSI headers
                const foundTimePrimary = h.findIndex(t => t.includes('ko/') || t.includes('ko start') || t.includes('start time'));
                const foundTimeGeneric = h.findIndex(t => t.includes('tsi') || t.includes('time') || t.includes('başlama'));
                const foundTime = foundTimePrimary > -1 ? foundTimePrimary : foundTimeGeneric;

                const foundNote = h.findIndex(t => t.includes('end time') || t.includes('notlar') || t.includes('not'));
                const foundSpiker = h.findIndex(t => t.includes('announcer') || t.includes('spiker'));

                if (foundTitle > -1 || foundTime > -1) {
                    idxTitle = foundTitle > -1 ? foundTitle : 1;
                    // Saat sütunu tespitinde daha esnek ol (B sütunu genelde saattir eğer tespit edilemezse)
                    idxTime = foundTime > -1 ? foundTime : (tsvRows[i].length > 3 ? 3 : 1);
                    idxNote = foundNote > -1 ? foundNote : 4;
                    idxSpiker = foundSpiker > -1 ? foundSpiker : 5;
                    console.log(`[Pusula] Başlıklar tespit edildi (Robust v8.7.7): T:${idxTitle} Saat:${idxTime} N:${idxNote} S:${idxSpiker}`);
                    break;
                }
            }

            const excelTimeToString = (val) => {
                const num = parseFloat(val);
                if (isNaN(num) || num < 0 || num > 1 || String(val).includes(':')) return String(val).trim();
                const totalMinutes = Math.round(num * 1440);
                const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
                const m = String(totalMinutes % 60).padStart(2, '0');
                return `${h}:${m}`;
            };

            let lastDate = "";
            const rows = tsvRows.map((cells, rIdx) => {
                const normalizedCells = cells.map(excelTimeToString);
                const isTimeFormat = (v) => /^\d{1,2}[:.]\d{2}([:.]\d{2})?$/.test(String(v).trim());

                if (normalizedCells[0] && normalizedCells[0].includes(' ')) {
                    const firstWord = normalizedCells[0].split(' ')[0];
                    if (/\d+/.test(firstWord)) lastDate = normalizedCells[0];
                } else if (normalizedCells[0] && /\d+/.test(normalizedCells[0])) {
                    lastDate = normalizedCells[0];
                }
                
                const foundStart = normalizedCells[idxTime] || "";
                
                const eVal = (normalizedCells[idxNote] || "").trim();
                const spikerVal = (normalizedCells[idxSpiker] || "").trim();

                // 🧠 v8.7 Akıllı Ayrıştırma
                // Eğer E sütunu bir saatse -> broadcastEnd'e yaz, notu boş bırak.
                // Eğer E sütunu metin ise -> details'e yaz, saati boş bırak.
                const eIsTime = isTimeFormat(eVal);

                return {
                    col_0: (cells[0] || lastDate),
                    col_1: (cells[idxTitle] || "").trim(),
                    col_3: foundStart,
                    col_4: eIsTime ? "" : eVal, // Metin değilse not alanı temiz kalmalı
                    col_5: spikerVal,
                    col_8: (normalizedCells[8] || "").trim(), // I Sütunu (LOGOLAR)
                    announcer: spikerVal,
                    details: eIsTime ? "" : eVal,
                    broadcastEnd: eIsTime ? eVal : "", // Sadece saatse mühürle
                    platformTag: (normalizedCells[8] || "").trim(),
                    _isSheet: true
                };
            }).filter(r => r.col_1 && r.col_1.length > 2 && r.col_3);

            console.log(`[Pusula] v8.6 Başarılı: ${rows.length} kayıt (Referans Sistem).`);
            resolve(rows);
        } catch (err) { reject(err); }
    });
}

// Gviz JSONP (Reserved for future non-flow tasks)
async function fetchGSheetJSONP(url) {
    return new Promise((resolve, reject) => {
        resolve([]); 
    });
}

function normalizeKeys(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(normalizeKeys);

    const n = {};
    let colENote = ""; 

    Object.keys(obj).forEach(k => {
        if (k === 'broadcastEnd') { n.broadcastEnd = obj[k]; return; } // 🚀 NÜKLEER ÖNCELİK v8.6
        let val = obj[k];
        if (k === '_isSheet') { n._isSheet = true; return; }
        if (typeof val === 'string' && (val.toLowerCase() === 'undefined' || val.toLowerCase() === 'null' || val === 'NaN')) val = '';

        if (!obj._isSheet) {
            n[k] = obj[k];
            const lower = k.toLowerCase().replace(/\s+/g, '');
            n[lower] = val;
        }
        
        // --- ÖZEL MAPPINGLER (Eski sistemden geri yüklendi) ---

        // Personel / Kullanıcı
        if (k === 'AgentName' || k === 'Username' || k === 'Temsilci' || k === 'Name' || k === 'İsim') {
            n.agent = val; n.agentName = val; n.username = val; n.temsilci = val; n.name = val;
        }

        // Çağrı / Değerlendirme Bilgileri
        if (k === 'CallID' || k === 'CallId' || k === 'Call_ID') n.callId = val;
        if (k === 'CallDate') n.callDate = formatDateToDDMMYYYY(val);
        if (k === 'Date') n.date = formatDateToDDMMYYYY(val);
        if (k === 'Tarih') {
            const formatted = formatDateToDDMMYYYY(val);
            if (!n.callDate) n.callDate = formatted;
            if (!n.date) n.date = formatted;
        }
        if (k === 'Score' || k === 'Puan' || k === 'Points') { n.score = val; n.points = val; }
        if (k === 'Orta Puan' || k === 'MediumScore') n.mediumScore = val;
        if (k === 'Kötü Puan' || k === 'BadScore') n.badScore = val;
        if (k === 'Okundu') n.isSeen = (val === true || String(val) === 'true' || String(val) === '1');
        if (k === 'Durum' || k === 'Status') n.status = val;
        if (k === 'FeedbackType') n.feedbackType = val;

        // İçerik / Başlık / Metin
        if (k === 'Başlık' || k === 'Teklif Adı' || k === 'Title') {
            n.title = val; n.head = val;
        }
        if (k === 'Key') { n.key = val; }
        if (k === 'BlockId' || k === 'blockId') { n.blockId = val; }

        // Yayın Akışı Mapping (Supabase Formal -> Simple UI)
        if (k === 'EVENT NAME - Turkish') n.event = val;
        if (k === 'START_TIME_TSI') n.time = val;
        if (k === 'ANNOUNCER') n.announcer = val;
        if (k === 'DATE') n.dateISO = val;

        if (k === 'İçerik' || k === 'Açıklama' || k === 'Description' || k === 'Metin' || k === 'Soru_Metinleri' || k === 'Soru' || k === 'Text' || k === 'Content') {
            n.content = val; n.text = val; n.description = val; n.questions = val;
        }
        if (k === 'Script' || k === 'Senaryo') { n.script = val; }
        if (k === 'Kategori' || k === 'Segment' || k === 'TargetGroup' || k === 'Konu' || k === 'VisibleGroups') {
            n.category = val; n.segment = val; n.group = val; n.subject = val; n.visibleGroups = val;
        }
        if (k === 'Görsel' || k === 'Image' || k === 'Link') { n.image = val; n.link = val; }

        // Trainings (Eğitimler)
        if (k === 'ContentLink') { n.link = val; }
        if (k === 'DocLink') { n.docLink = val; }
        if (k === 'TargetUser') { n.targetUser = val; }
        if (k === 'TargetGroup') { n.target = val; }
        if (k === 'CreatedBy') { n.creator = val; }
        if (k === 'StartDate') { n.startDate = val; }
        if (k === 'EndDate') { n.endDate = val; }
        if (k === 'Duration') { n.duration = val; }

        // Yayın Akışı (Positional Mapping - Critical for GSheet)
        const kk = String(k || '').replace(/\s+/g, ' ').trim().toUpperCase();
        // ⚠️ SADECE col_ prefix'li key'lerde pozisyonel mapping yap.
        // Header isimli key'ler (EVENT NAME, DATE vb.) zaten yukarıda yakalanıyor.
        const colIdx = k.startsWith('col_') ? parseInt(k.split('_')[1]) : -1;
        const isTime = String(val).includes(':') && String(val).trim().length <= 10;
        const isDate = String(val).match(/\d+ (ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/i);

        if (colIdx === 0 || (colIdx >= 0 && isDate)) {
            if (val) { n.dateISO = val; n.date = val; }
        } else if (colIdx === 1) {
            if (val) { n.match = val; n.event = val; n.title = val; }
        } else if (colIdx === 2) {
            if (val) n._streamStart = val;
        } else if (colIdx === 3) {
            if (val) { n.time = val; n._startTime = val; }
        }
        
        // 🚨 EKSTRA KRİTİK: col_4 (E Sütunu) hem zaman hem not olabilir.
        // else if yapma, her birini ayrı kontrol et veya colIdx'e güven.
        if (colIdx === 4) {
            // E Sütunu (Notlar)
            // 🚨 KRİTİK: Eğer veri sadece bir saat formatındaysa (06:35 gibi) bunu NOT olarak kabul etme!
            const isJustTime = /^\d{1,2}:\d{2}(:\d{2})?$/.test(String(val).trim()) && !/[a-zA-ZİıĞğÜüŞşÖö]/.test(String(val));
            if (val && !isJustTime && val !== '-' && val !== '---' && val !== 'null') {
                colENote = val;
                if (!n.time && isTime) {
                    n.time = val;
                    n._startTime = val;
                }
            } else {
                // Eğer sadece saatse orayı boşalt ki kurtarma motoru devreye girsin
                colENote = "";
            }
        }

        if (colIdx === 5 || (kk.includes('ANNOUNCER'))) {
            if (val && val !== '-' && val !== 'null') n.announcer = val;
        }

        if (kk === 'KANAL' || kk === 'PLATFORM') {
            n.channel = val;
        }

        // Notlar / Detaylar
        if (k === 'Feedback' || k === 'Geri Bildirim') n.feedback = val;
        if (k === 'Temsilci Notu' || k === 'AgentNote') n.agentNote = val;
        if (k === 'Yönetici Cevabı' || k === 'ManagerReply') n.managerReply = val;

        // --- SİHİRBAZLAR (Wizard / TechWizard) ---
        if (k === 'StepID' || k === 'StepId' || k === 'AdımID') n.stepId = val;
        if (k.toLowerCase().includes('option') || k.toLowerCase().includes('button') || k === 'Seçenekler' || k === 'Butonlar') {
            if (!n.options || String(val).includes('|')) n.options = val;
        }
        if (k === 'Alert' || k === 'Uyarı') n.alert = val;
        if (k === 'Result' || k === 'Sonuç') n.result = val;

        // Quiz / Game Results
        if (k === 'SuccessRate' || k === 'Başarı') n.average = val;
        if (k === 'TotalQuestions') n.total = val;
        if (k === 'platformTag' || k === 'col_8') n.platformTag = val;
    });


    // 🔍 v8.7.1 Akıllı Zaman Filtresi (Yayın Akışı Not Temizliği)
    const rawCol4 = String(obj['col_4'] || '').trim();
    const col4IsTime = /^\d{1,2}[:.]\d{2}([:.]\d{2})?$/.test(rawCol4);

    if (!colENote && !col4IsTime) {
        colENote = rawCol4;
    }
    
    // Geçersiz değerleri temizle ve details alanına bas
    if (colENote && !['-', '---', 'null'].includes(colENote)) {
        n.details = colENote;
    } else if (!n.details) {
        n.details = "";
    }

    // 🕵️ v8.7.3 Akıllı Teknik Not/İptal Filtresi
    const matchTitle = String(n.match || n.event || n.title || '').toLowerCase();
    const spikerText = String(obj['col_5'] || n.announcer || '').trim();
    const col4Text = String(obj['col_4'] || '').toLowerCase();
    const scanText = (matchTitle + " " + spikerText + " " + col4Text).toLowerCase();
    
    // Teknik notları ve iptalleri yakala
    const isCancelledExplicit = scanText.includes('iptal') || 
                                 scanText.includes('offtube yok') || 
                                 scanText.includes('encoder yok') || 
                                 scanText.includes('enc-') ||
                                 scanText.includes('no mbo') ||
                                 (n._streamStart && String(n._streamStart).toLowerCase() === 'yok') ||
                                 (spikerText === '-' || spikerText.toLowerCase() === 'yok');

    const isRiskli = scanText.includes('riskli');
    const isCancelled = isCancelledExplicit || isRiskli;

    if (isCancelled) {
        n.isCancelled = true;
        n.dateISO = "2099-12-31"; // İptalleri/Notları doğrudan BİLGİ sekmesine at
        const prefix = isRiskli ? `(RİSKLİ) ` : `(İPTAL) `;
        [ 'match', 'event', 'title' ].forEach(f => {
            if (n[f] && !String(n[f]).includes(prefix)) n[f] = prefix + n[f];
        });
    }

    if (matchTitle && !n.category) {
        const teams = ['stuttgart', 'dortmund', 'bayern', 'leipzig', 'wolfsburg', 'freiburg', 'hoffenheim', 'mainz', 'real madrid', 'barcelona', 'ajax', 'verona', 'porto', 'al hilal', 'galatasaray', 'fenerbahçe', 'beşiktaş', 'trabzonspor', 'bayern münih'];
        const leagues = ['bundesliga', 'laliga', 'serie a', 'premier league', 'hollanda ligi', 'ligue 1', 'süper lig', 'ziraat türkiye', 'futbol', 'saudi league', 'şampiyonlar ligi', 'avrupa ligi', 'konferans ligi'];
        const isFutbol = teams.some(kw => matchTitle.includes(kw)) || leagues.some(kw => matchTitle.includes(kw));
        if (isFutbol) n.category = 'futbol';
        else if (matchTitle.includes('nba') || matchTitle.includes('euroleague') || matchTitle.includes('basketbol')) n.category = 'basketbol';
        else if (matchTitle.includes('f1') || matchTitle.includes('formula') || matchTitle.includes('motor')) n.category = 'motor';
    }

    // --- v8.7.3 Precision Parser ---
    let dVal = n.date || n.dateISO || obj['DATE'] || obj['TARİH'] || obj['col_0'];
    let tVal = obj['col_3'] || n.time || n._startTime || obj['KO/ START TIME TSI'] || obj['KO / START TIME TSI'] || obj['START_TIME_TSI'] || obj['STREAM START TSI'] || obj['col_2'];

    if (!n.isCancelled && dVal && tVal && String(tVal).includes(':')) {
        try {
            let datePart = String(dVal).trim();
            let parsedISO = "";
            const monthsTr = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];
            const dayM = datePart.match(/(\d{1,2})/);
            const monthM = datePart.match(/(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/i);
            
            if (datePart.includes('.') && datePart.split('.').length >= 2) {
                const parts = datePart.split('.');
                const d = parts[0].trim().padStart(2, '0');
                const m = parts[1].trim().padStart(2, '0');
                let y = parts[2] ? parts[2].split(' ')[0].trim() : String(new Date().getFullYear());
                if (y.length === 2) y = '20' + y;
                parsedISO = `${y}-${m}-${d}`;
            } else if (dayM && monthM) {
                const day = dayM[1].padStart(2, '0');
                const nIdx = monthsTr.indexOf(monthM[1].toLowerCase()) + 1;
                parsedISO = `${new Date().getFullYear()}-${String(nIdx).padStart(2, '0')}-${day}`;
            } else if (datePart.includes('-') && datePart.length >= 10) {
                parsedISO = datePart.split('T')[0];
            }

            if (parsedISO && !parsedISO.includes('NaN')) {
                n.dateISO = parsedISO;
                const timeStr = String(tVal).trim();
                const timeFull = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
                const dateObj = new Date(`${parsedISO}T${timeFull}`);
                if (!isNaN(dateObj.getTime())) n.startEpoch = dateObj.getTime();
                else {
                    const fallback = new Date(`${parsedISO}T00:00:00`);
                    if (!isNaN(fallback.getTime())) n.startEpoch = fallback.getTime();
                }
            } else { n.dateISO = "2099-12-31"; }
        } catch (e) { n.dateISO = "2099-12-31"; }
    } else {
        if (n.dateISO !== "2099-12-31") n.dateISO = "2099-12-31";
    }

    // Final Clean
    if (!n.dateISO || String(n.dateISO).toLowerCase().includes('invalid')) n.dateISO = "2099-12-31";

    return n;
}

async function apiCall(action, params = {}) {
    try {
        switch (action) {
            case "getRolePermissions": {
                // 🔐 Grupları hem RolePermissions hem de Profiles tablosundan topla (Tam Dinamik)
                const [permsRes, profilesRes] = await Promise.all([
                    sb.from('RolePermissions').select('*'),
                    sb.from('profiles').select('group_name')
                ]);

                if (permsRes.error) throw permsRes.error;
                if (profilesRes.error) throw profilesRes.error;

                const perms = (permsRes.data || []).map(p => {
                    const np = normalizeKeys(p);
                    if (np.role) np.role = String(np.role).trim().toUpperCase();
                    return np;
                });
                
                // Grupları birleştir ve tekilleştir (Normalizasyon: Trim + Uppercase)
                const groupsSet = new Set();
                perms.forEach(p => { if (p.role) groupsSet.add(p.role); });
                (profilesRes.data || []).forEach(p => { 
                    if (p.group_name) groupsSet.add(String(p.group_name).trim().toUpperCase()); 
                });
                
                const groups = Array.from(groupsSet).sort();
                return { result: "success", permissions: perms, groups: groups };
            }
            case "setRolePermissions": {
                // Anti-Grafiti: Sadece admin yetki değiştirebilir
                if (!isAdminMode) return { result: "error", message: "Unauthorized" };
                const { role, perms } = params;
                // Önce bu role ait eski yetkileri temizle (veya direkt upsert kullan)
                // Daha verimli olması için her resource bazında tek tek upsert:
                for (const p of perms) {
                    await sb.from('RolePermissions').upsert({
                        Role: role,
                        Resource: p.resource || p.Resource,
                        Permission: p.permission || p.Permission,
                        Value: (typeof p.value !== 'undefined') ? p.value : p.Value
                    }, { onConflict: 'Role,Resource,Permission' });
                }
                saveLog("Yetki Güncelleme", `${role} rolü için yetkiler güncellendi.`);
                return { result: "success" };
            }
            case "fetchSingleEvaluation": {
                const { data, error } = await window.PusulaDB.quality.fetchSingleEvaluation(params.id);
                if (error) {
                    console.error("fetchSingleEvaluation error:", error);
                    return { result: "error", message: error.message };
                }
                return { result: "success", evaluation: normalizeKeys(data) };
            }
            case "fetchEvaluations": {
                const { data, error } = await window.PusulaDB.quality.fetchEvaluations(params);
                if (error) {
                    console.error("fetchEvaluations error:", error);
                    return { result: "error", message: error.message };
                }
                return { result: "success", evaluations: (data || []).map(normalizeKeys) };
            }
            case "logEvaluation": {
                const { data, error } = await sb.from('Evaluations').insert([{
                    AgentName: params.agentName,
                    Evaluator: currentUser,
                    CallID: params.callId,
                    CallDate: params.callDate,
                    Score: params.score,
                    Details: params.details,
                    Feedback: params.feedback,
                    FeedbackType: params.feedbackType,
                    Group: params.agentGroup,
                    Date: new Date().toISOString(),
                    Okundu: 0,
                    Durum: params.status || 'Tamamlandı'
                }]).select('id').single();
                if (error) throw error;

                saveLog("Değerlendirme Kaydı", `${params.agentName} | ${params.callId} | ${params.score}`);

                // ✅ MAİL BİLDİRİMİ TETİKLE
                // ✅ MAİL BİLDİRİMİ TETİKLE (Profiles Tablosundan)
                (async () => {
                    try {
                        // Users yerine profiles tablosuna bakıyoruz
                        const { data: userData } = await sb.from('profiles')
                            .select('email')
                            .ilike('username', params.agentName)
                            .maybeSingle();

                        if (userData && userData.email) {
                            // Backend'e event ve gerekli verileri gonderiyoruz
                            if (typeof sendMailNotification === 'function') {
                                const isManual = params.callId && String(params.callId).toUpperCase().startsWith('MANUEL-');
                                const eventType = isManual ? "manual_feedback" : "quality_evaluation";

                                sendMailNotification(userData.email, eventType, {
                                    agentName: params.agentName,
                                    callId: params.callId,
                                    score: params.score,
                                    feedback: params.feedback,
                                    details: params.details // Manuel feedback durumunda "Konu" buradadır
                                });
                            }
                        }
                    } catch (e) { console.error("Mail gönderme hatası:", e); }
                })();

                return { result: "success" };
            }
            case "logCard": {
                // Anti-Grafiti: Sadece admin kart ekleyebilir
                if (!isAdminMode) return { result: "error", message: "Unauthorized" };
                // Sütun isimleri için robust mapping (Data tablosu)
                const payload = {
                    Type: params.type,
                    Category: params.category,
                    Title: params.title,
                    Text: params.text,
                    Script: params.script,
                    Code: params.code,
                    Status: params.status,
                    Link: params.link,
                    Tip: params.tip,
                    Detail: params.detail,
                    Pronunciation: params.pronunciation,
                    Icon: params.icon,
                    Date: params.date || new Date().toISOString(),
                    QuizOptions: params.quizOptions,
                    QuizAnswer: params.quizAnswer
                };
                const { error } = await sb.from('Data').insert([payload]);
                if (error) throw error;
                saveLog("Yeni Kart Ekleme", `${params.title} (${params.type})`);
                return { result: "success" };
            }
            case "addCard": return await apiCall("logCard", params);
            case "editCard": {
                // Anti-Grafiti: Sadece admin kart düzenleyebilir
                if (!isAdminMode) return { result: "error", message: "Unauthorized" };
                const { error } = await sb.from('Data').update({
                    Category: params.category,
                    Title: params.title,
                    Text: params.text,
                    Script: params.script,
                    Code: params.code,
                    Link: params.link,
                    Image: params.image
                }).eq('id', params.id);
                if (error) throw error;
                saveLog("Kart Düzenleme", `${params.title} (ID: ${params.id})`);
                return { result: "success" };
            }
            case "deleteCard": {
                // Anti-Grafiti: Sadece admin kart silebilir
                if (!isAdminMode) return { result: "error", message: "Unauthorized" };
                const { error } = await sb.from('Data').delete().eq('id', params.id);
                if (error) throw error;
                saveLog("Kart Silme", `ID: ${params.id}`);
                return { result: "success" };
            }
            case "saveUser": {
                // Anti-Grafiti: Sadece admin kullanıcı düzenleyebilir
                if (!isAdminMode) return { result: "error", message: "Unauthorized" };
                // Admin: Kullanıcı Düzenleme (Sadece Profil)
                // Yeni kullanıcı oluşturma artık Supabase Auth üzerinden yapılmalı.
                const { id, username, fullName, role, group } = params;

                if (!id) {
                    return { result: "error", message: "Yeni kullanıcılar Supabase Dashboard üzerinden eklenmelidir." };
                }

                const payload = {
                    username: username,
                    full_name: fullName,
                    role: role,
                    group_name: group
                };

                const { error } = await sb.from('profiles').update(payload).eq('id', id);
                if (error) throw error;

                saveLog("Kullanıcı Profil Güncelleme", `${username} (ID: ${id})`);
                return { result: "success" };
            }
            case "deleteUser": {
                // Anti-Grafiti: Sadece admin kullanıcı silebilir
                if (!isAdminMode) return { result: "error", message: "Unauthorized" };
                // Profili sil (Auth kullanıcısı Dashboard'dan silinmeli/engellenmeli)
                const { error } = await sb.from('profiles').delete().eq('id', params.id);
                if (error) throw error;
                saveLog("Kullanıcı Profil Silme", `ID: ${params.id}`);
                return { result: "success" };
            }
            case "exportEvaluations": {
                // Rapor için verileri çek ve formatla
                let query = sb.from('Evaluations').select('*');
                if (params.targetAgent !== 'all') query = query.ilike('AgentName', params.targetAgent);
                if (params.targetGroup !== 'all') query = query.ilike('Group', params.targetGroup);

                const { data, error } = await query.order('id', { ascending: false });
                if (error) throw error;

                const normalized = (data || []).map(normalizeKeys);
                const filtered = params.targetPeriod === 'all' ? normalized : normalized.filter(e => {
                    // Tarih formatı: "DD.MM.YYYY" veya ISO
                    const d = e.callDate || e.date;
                    if (!d) return false;

                    if (d.includes('.')) {
                        const p = d.split('.');
                        if (p.length >= 3) {
                            const mm = p[1];
                            const yyyy = p[2].split(' ')[0];
                            return `${mm}-${yyyy}` === params.targetPeriod;
                        }
                    } else if (d.includes('-')) {
                        const p = d.split('-');
                        if (p.length >= 2) {
                            const yyyy = p[0];
                            const mm = p[1];
                            return `${mm}-${yyyy}` === params.targetPeriod;
                        }
                    }
                    return false;
                });

                // --- DİNAMİK KIRILIM SÜTUNLARI (BUG FIX: Kırılım Kırılım Göster) ---
                let dynamicHeaders = [];
                let questionMap = new Set();

                // 1. Tüm benzersiz kriterleri (soruları) topla
                filtered.forEach(e => {
                    try {
                        const dObj = typeof e.details === 'string' ? JSON.parse(e.details) : e.details;
                        if (Array.isArray(dObj)) {
                            dObj.forEach(it => {
                                if (it.q) questionMap.add(it.q);
                            });
                        }
                    } catch (err) { }
                });

                const uniqueQuestions = Array.from(questionMap);
                uniqueQuestions.forEach(q => {
                    dynamicHeaders.push(q);
                    dynamicHeaders.push(`Not (${q})`);
                });

                // Zengin Rapor Formatı (Old System Style)
                const headers = [
                    "Log Tarihi", "Değerleyen", "Temsilci", "Grup", "Call ID",
                    "Puan", "Genel Geri Bildirim", "Durum", "Temsilci Notu",
                    "Yönetici Cevabı", "Çağrı Tarihi", ...dynamicHeaders
                ];

                const rows = filtered.map(e => {
                    let baseRow = [
                        e.date || '', // Log Tarihi (Zaten DD.MM.YYYY formatında)
                        e.evaluator || '',
                        e.agentName || e.agent || '',
                        e.group || '',
                        e.callId || '',
                        e.score || 0,
                        e.feedback || '',
                        e.status || e.durum || '',
                        e.agentNote || '',
                        e.managerReply || '',
                        e.callDate || ''
                    ];

                    // Kriter detaylarını ayıkla
                    let evalDetails = [];
                    try {
                        evalDetails = typeof e.details === 'string' ? JSON.parse(e.details) : (e.details || []);
                        if (!Array.isArray(evalDetails)) evalDetails = [];
                    } catch (err) { evalDetails = []; }

                    // Her bir benzersiz soru için puan ve not sütunlarını doldur
                    uniqueQuestions.forEach(q => {
                        const match = evalDetails.find(it => it.q === q);
                        if (match) {
                            baseRow.push(match.score);
                            baseRow.push(match.note || '');
                        } else {
                            baseRow.push('');
                            baseRow.push('');
                        }
                    });

                    return baseRow;
                });
                return { result: "success", headers, data: rows, fileName: `Evaluations_${params.targetPeriod}.xls` };
            }
            case "updateEvaluation": {
                // Anti-Grafiti: Sadece admin tam güncelleme yapabilir
                if (!isAdminMode) return { result: "error", message: "Unauthorized: Sadece admin güncelleyebilir." };
                const { error } = await sb.from('Evaluations').update({
                    CallID: params.callId,
                    CallDate: params.callDate,
                    Score: params.score,
                    Details: params.details,
                    Feedback: params.feedback,
                    Durum: params.status
                }).eq('id', params.id);
                if (error) throw error;
                saveLog("Değerlendirme Güncelleme", `CallID: ${params.callId}`);
                return { result: "success" };
            }
            case "agentUpdateEvaluation": {
                // Temsilci SADECE kendi kaydında:
                // - Okundu: okundu işareti
                // - "Temsilci Notu": temsilci notu/görüşü (DB kolon adı)
                // Başka hiçbir alana dokunamaz!
                const allowedFields = {};
                if (typeof params.okundu !== 'undefined') allowedFields.Okundu = params.okundu ? 1 : 0;
                if (typeof params.agentNote !== 'undefined') {
                    allowedFields["Temsilci Notu"] = String(params.agentNote || '').slice(0, 1000);
                    // Durum: Bekliyor (Yönetici görsün)
                    allowedFields.Durum = 'Bekliyor';
                }

                if (Object.keys(allowedFields).length === 0) {
                    return { result: "error", message: "Güncellenecek alan bulunamadı." };
                }

                // Anti-Grafiti: Sadece kendi kaydını güncelleyebilir
                const { error: agentErr } = await sb.from('Evaluations')
                    .update(allowedFields)
                    .ilike('CallID', String(params.callId || '').replace('#', '').trim())
                    .ilike('AgentName', currentUser); // Başkasının kaydına kesinlikle dokunamaz
                if (agentErr) throw agentErr;
                return { result: "success" };
            }
            case "markEvaluationSeen": {
                // Temsilci kendi kaydını okundu işaretler
                const { error } = await sb.from('Evaluations')
                    .update({ Okundu: true })
                    .eq('CallID', params.callId)
                    .ilike('AgentName', currentUser); // Sadece kendi kaydı
                if (error) throw error;
                return { result: "success" };
            }
            case "getTrainings": {
                const username = localStorage.getItem("sSportUser") || "";
                const userGroup = localStorage.getItem("sSportGroup") || "";
                const asAdmin = !!params.asAdmin;

                const { data: tData, error: tErr } = await sb.from('Trainings').select('*').order('Date', { ascending: false });
                if (tErr) throw tErr;

                // Kullanıcı logları
                let completedSet = new Set();
                try {
                    const { data: lData, error: lErr } = await sb.from('Training_Logs').select('*').eq('Username', username);
                    if (!lErr && Array.isArray(lData)) {
                        lData.forEach(l => {
                            const st = String(l.Status || '').toLowerCase();
                            if (st === 'completed' || st === 'tamamlandi' || st === 'tamamlandı' || l.Status === 1 || l.Status === true) {
                                completedSet.add(String(l.TrainingID));
                            }
                        });
                    }
                } catch (e) { }

                const filtered = (tData || []).filter(t => {
                    if (asAdmin) return true;
                    const tg = String(t.TargetGroup || '').toLowerCase();
                    const tu = String(t.TargetUser || '').toLowerCase();
                    const st = String(t.Status || '').toLowerCase();
                    if (st && st !== 'aktif' && st !== 'active') return false;

                    if (!tg || tg === 'all' || tg === 'herkes') return true;
                    if (tg === 'group' || tg === 'grup') return String(userGroup || '').toLowerCase() === tu;
                    if (tg === 'individual' || tg === 'bireysel') return String(username || '').toLowerCase() === tu;
                    return String(userGroup || '').toLowerCase() === tg;
                });

                const trainings = filtered.map(t => {
                    const n = normalizeKeys(t);
                    n.title = n.title || t.Title || '';
                    n.desc = n.desc || t.Description || '';
                    n.link = n.link || t.ContentLink || '';
                    n.docLink = n.docLink || t.DocLink || '';
                    n.target = n.target || t.TargetGroup || 'All';
                    n.targetUser = n.targetUser || t.TargetUser || '';
                    n.creator = n.creator || t.CreatedBy || '';
                    n.startDate = n.startDate || t.StartDate || '';
                    n.endDate = n.endDate || t.EndDate || '';
                    n.duration = n.duration || t.Duration || '';
                    n.date = n.date || formatDateToDDMMYYYY(t.Date);

                    const idStr = String(t.id || t.ID || n.id || '');
                    n.isCompleted = completedSet.has(idStr);
                    return n;
                });

                return { result: "success", trainings };
            }
            case "startTraining": {
                const username = localStorage.getItem("sSportUser") || "";
                const trainingId = params.trainingId;

                // completed ise tekrar started yazma
                const { data: existing } = await sb.from('Training_Logs')
                    .select('*')
                    .eq('TrainingID', trainingId)
                    .eq('Username', username)
                    .maybeSingle();

                if (existing && String(existing.Status || '').toLowerCase() === 'completed') {
                    return { result: "success" };
                }

                const { error } = await sb.from('Training_Logs').upsert([{
                    TrainingID: trainingId,
                    Username: username,
                    Status: 'started',
                    Date: new Date().toISOString()
                }], { onConflict: 'TrainingID,Username' });

                if (error) throw error;
                saveLog("Eğitim Başlatma", `ID: ${params.trainingId}`);
                return { result: "success" };
            }
            case "completeTraining": {
                const username = localStorage.getItem("sSportUser") || "";
                const trainingId = params.trainingId;

                const { error } = await sb.from('Training_Logs').upsert([{
                    TrainingID: trainingId,
                    Username: username,
                    Status: 'completed',
                    Date: new Date().toISOString()
                }], { onConflict: 'TrainingID,Username' });

                if (error) throw error;
                saveLog("Eğitim Tamamlama", `ID: ${params.trainingId}`);
                return { result: "success" };
            }
            case "assignTraining": {
                // Anti-Grafiti: Sadece admin eğitim atayabilir
                if (!isAdminMode) return { result: "error", message: "Unauthorized" };
                const payload = {
                    Title: params.title || '',
                    Description: params.desc || '',
                    ContentLink: params.link || '',
                    DocLink: params.docLink || '',
                    TargetGroup: params.target || 'All',
                    TargetUser: params.targetAgent || '',
                    CreatedBy: currentUser, // params.creator yerine currentUser (manipülasyon önlemi)
                    StartDate: params.startDate || '',
                    EndDate: params.endDate || '',
                    Duration: params.duration || '',
                    Status: 'Aktif',
                    Date: new Date().toISOString()
                };
                const { error } = await sb.from('Trainings').insert([payload]);
                if (error) throw error;
                saveLog("Eğitim Atama", `${params.title} -> ${params.target}`);
                return { result: "success" };
            }
            case "getUserList": {
                const { data, error } = await sb.from('profiles').select('*');
                if (error) return { result: "success", users: [] };
                // Normalize keys for UI & 🕵️ LocAdmin Filtresi
                const users = (data || []).filter(u =>
                    String(u.username || u.email).toLowerCase() !== 'locadmin' &&
                    String(u.role).toLowerCase() !== 'locadmin'
                ).map(u => ({
                    id: u.id,
                    username: u.username || u.email,
                    name: u.full_name || u.username,
                    role: u.role,
                    group: u.group || u.group_name
                }));
                return { result: "success", users: users };
            }
            case "getCriteria": {
                let q = sb.from('Settings').select('*');
                if (params.group) q = q.eq('Grup', params.group);
                const { data, error } = await q.order('Sira', { ascending: true });
                if (error) throw error;

                const criteria = (data || []).map(normalizeKeys).filter(c => c.text);
                return { result: "success", criteria };
            }
            case "getShiftData": {
                const { data, error } = await sb.from('Vardiya').select('*');
                if (error) throw error;
                
                // Haftalık etiket bilgisini HomeBlocks tablosundan çek
                const { data: config, error: cErr } = await sb.from('HomeBlocks').select('Content').eq('Key', 'ShiftWeekLabel').single();
                const weekLabel = config ? config.Content : 'Haftalık Vardiya Planı';

                // Tüm talepleri çek (Kullanıcınınkiler ve arkadaş onayındakiler için)
                const { data: reqs, error: rErr } = await sb.from('ShiftRequests').select('*');
                
                if (!data || data.length === 0) return { result: "success", shifts: { allRequests: reqs || [], weekLabel: weekLabel } };

                const dayHeaders = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
                const rows = data.map(r => ({
                    id: r['İd'] || r.id || r.Id || r.ID,
                    name: r.Temsilci || r.temsilci || r.Name || r.username || '-',
                    group: (r.Grup || r.grup || r.Group || '').trim(), // Yeni: Grup bilgisi
                    cells: dayHeaders.map(h => r[h] || '')
                }));

                const myRow = rows.find(r =>
                    String(r.name).trim().toLowerCase() === String(currentUser).trim().toLowerCase()
                );

                return {
                    result: "success",
                    shifts: {
                        headers: dayHeaders,
                        rows: rows,
                        myRow: myRow,
                        allRequests: reqs || [],
                        weekLabel: weekLabel
                    }
                };
            }
            case "submitShiftRequestExtended": {
                const { error } = await sb.from('ShiftRequests').insert([{
                    username: currentUser,
                    type: params.type || 'Talep',
                    date: params.date || '',
                    shift: params.shift || '',
                    opponent: params.opponent || null,
                    note: String(params.note || '').slice(0, 500),
                    status: params.status || 'Beklemede',
                    timestamp: new Date().toISOString()
                }]);
                if (error) throw error;
                saveLog("Gelişmiş Vardiya Talebi", `${currentUser} | ${params.type} | ${params.date}`);
                return { result: "success" };
            }
            case "updateShiftRequestStatus": {
                const { error } = await sb.from('ShiftRequests').update({
                    status: params.status,
                    confirmed_at: new Date().toISOString()
                }).eq('id', params.id);
                if (error) throw error;
                return { result: "success" };
            }
            case "getAllShiftRequests": {
                const { data, error } = await sb.from('ShiftRequests').select('*').order('timestamp', { ascending: false });
                if (error) throw error;
                return { result: "success", data: data };
            }
            case "adminFinalizeShift": {
                if (!isAdminMode && !isLocAdmin) return { result: "error", message: "Yetkisiz işlem" };
                
                const { id, status, adminNote } = params;
                
                // Önce talebi çekelim ki neyi onayladığımızı bilelim
                const { data: req, error: fErr } = await sb.from('ShiftRequests').select('*').eq('id', id).single();
                if (fErr || !req) throw new Error("Talep bulunamadı");

                // Tabloyu güncelle (Status ve Admin Notu)
                const { error: uErr } = await sb.from('ShiftRequests').update({
                    status: status,
                    admin_note: adminNote,
                    approved_by: currentUser,
                    approved_at: new Date().toISOString()
                }).eq('id', id);
                if (uErr) throw uErr;

                // 🚀 EĞER ONAYLANDIYSA VE DEĞİŞİM İSE PLANI OTOMATİK GÜNCELLE
                if (status === 'Onaylandı' && req.type === 'Değişim' && req.opponent) {
                    const dayHeaders = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
                    let dayName = req.date;
                    
                    // Eğer req.date bir tarihse (eski kayıtlar için) gününü bul, değilse (Pazartesi gibi bir gün ise) direkt kullan
                    if (!dayHeaders.includes(dayName)) {
                        const reqDate = new Date(dayName);
                        if (!isNaN(reqDate)) {
                            dayName = dayHeaders[ (reqDate.getDay() + 6) % 7 ];
                        }
                    }
                    
                    if (dayHeaders.includes(dayName)) {
                        // Her iki personelin satırını çek
                        const { data: p1 } = await sb.from('Vardiya').select('*').eq('Temsilci', req.username).single();
                        const { data: p2 } = await sb.from('Vardiya').select('*').eq('Temsilci', req.opponent).single();
                        
                        if (p1 && p2) {
                            const shift1 = p1[dayName];
                            const shift2 = p2[dayName];
                            
                            // Swap yap
                            await sb.from('Vardiya').update({ [dayName]: shift2 }).eq('Temsilci', req.username);
                            await sb.from('Vardiya').update({ [dayName]: shift1 }).eq('Temsilci', req.opponent);
                            
                            saveLog("Vardiya Swap (Auto)", `${req.username} <-> ${req.opponent} | ${dayName}`);
                        }
                    }
                }

                saveLog("Vardiya Talebi Sonuçlandırma", `${id} -> ${status}`);
                return { result: "success" };
            }
            case "submitShiftRequest": {
                const { error } = await sb.from('ShiftRequests').insert([{
                    username: currentUser,
                    date: params.date || '',
                    shift: params.shift || '',
                    note: String(params.note || '').slice(0, 500),
                    timestamp: new Date().toISOString()
                }]);
                if (error) throw error;
                saveLog("Vardiya Talebi Gönderme", `${currentUser} -> ${params.date} ${params.shift}`);
                return { result: "success" };
            }

            case "fetchFeedbackLogs": {
                const { data, error } = await sb.from('Feedback_Logs').select('*');
                if (error) throw error;
                return { result: "success", feedbackLogs: (data || []).map(normalizeKeys) };
            }
            case "getTelesalesOffers": {
                const { data, error } = await sb.from('Telesatis_DataTeklifleri').select('*');
                return { result: "success", data: (data || []).map(normalizeKeys) };
            }
            case "saveAllTelesalesOffers": {
                // Anti-Grafiti: "Delete-all" deseni risklidir. Sadece tam yetkili adminler yapabilir.
                if (!isAdminMode) return { result: "error", message: "Unauthorized" };

                // Önce yedekle (rollback imkanı için logla)
                console.warn("[Pusula] Telesatış teklifleri toplu güncelleniyor. Mevcutlar temizleniyor.");
                await sb.from('Telesatis_DataTeklifleri').delete().neq('id', -0); // id=0 yoksa hepsini sil
                // Database kolon isimlerine geri map et
                const dbOffers = (params.offers || []).map(o => ({
                    Segment: o.segment || '',
                    "Teklif Adı": o.title || '',
                    "Açıklama": o.desc || '',
                    Not: o.note || '',
                    Durum: o.status || 'Aktif',
                    Görsel: o.image || ''
                }));
                const { error } = await sb.from('Telesatis_DataTeklifleri').insert(dbOffers);
                saveLog("Telesatış Teklifleri Güncelleme", `${dbOffers.length} teklif kaydedildi.`);
                return { result: error ? "error" : "success" };
            }
            case "getTelesalesScripts": {
                const { data, error } = await sb.from('Telesatis_Scripts').select('*');
                return { result: "success", items: (data || []).map(normalizeKeys) };
            }
            case "saveTelesalesScripts": {
                if (!isAdminMode) return { result: "error", message: "Unauthorized" };
                const { scripts } = params;
                await sb.from('Telesatis_Scripts').delete().neq('id', -0);
                const { error } = await sb.from('Telesatis_Scripts').insert((scripts || []).map(s => ({
                    "Başlık": s.title || '',
                    "Metin": s.text || '',
                    UpdatedAt: new Date().toISOString(),
                    UpdatedBy: (localStorage.getItem("sSportUser") || '')
                })));
                saveLog("Telesatış Script Güncelleme", `${scripts.length} script kaydedildi.`);
                return { result: error ? "error" : "success" };
            }
            case "getTechDocs": {
                const { data, error } = await sb.from('Teknik_Dokumanlar').select('*');
                return { result: "success", data: (data || []).map(normalizeKeys) };
            }
            case "getTechDocCategories": {
                const { data, error } = await sb.from('Teknik_Dokumanlar').select('Kategori');
                const cats = [...new Set(data.filter(x => x.Kategori).map(x => x.Kategori))];
                return { result: "success", categories: cats };
            }
            case "upsertTechDoc": {
                // Anti-Grafiti: Sadece admin teknik doküman ekleyebilir/düzenleyebilir
                if (!isAdminMode) return { result: "error", message: "Unauthorized" };
                // Teknik_Dokumanlar: Kategori, Başlık, İçerik, Görsel, Adım, Not, Link
                const { data: sampleData } = await sb.from('Teknik_Dokumanlar').select('*').limit(1);
                const dbCols = sampleData && sampleData[0] ? Object.keys(sampleData[0]) : [];

                const findCol = (choices) => {
                    for (let c of choices) {
                        const found = dbCols.find(x => x.toLowerCase() === c.toLowerCase());
                        if (found) return found;
                    }
                    return null;
                };

                const payload = {};
                const add = (choices, val) => {
                    const col = findCol(choices);
                    if (col) payload[col] = val;
                };

                if (params.id) add(['id', 'ID'], params.id);
                add(['Kategori', 'Category'], params.kategori);
                add(['Başlık', 'Baslik', 'Title'], params.baslik);
                add(['İçerik', 'Icerik', 'Content'], params.icerik);
                add(['Adım', 'Adim', 'Step'], params.adim || '');
                add(['Not', 'Note'], params.not || '');
                add(['Link'], params.link || '');
                add(['Görsel', 'Gorsel', 'Image', 'Resim'], params.image || null);
                add(['Durum', 'Status'], params.durum || 'Aktif');

                const { error } = await sb.from('Teknik_Dokumanlar').upsert(payload, { onConflict: findCol(['id', 'ID']) || 'id' });
                if (error) {
                    console.error("[Pusula] upsertTechDoc error:", error);
                    return { result: "error", message: error.message };
                }
                saveLog("Teknik Döküman Kayıt", `${params.baslik} (${params.kategori})`);
                return { result: "success" };
            }
            case "updateHomeBlock": {
                // Anti-Grafiti: Sadece admin ana sayfa bloklarını düzenleyebilir
                if (!isAdminMode) return { result: "error", message: "Unauthorized" };
                // Supabase'de kolon adı 'Key' (Görüntülerden teyit edildi)
                const { error } = await sb.from('HomeBlocks').upsert({
                    Key: params.key,
                    Title: params.title,
                    Content: params.content,
                    VisibleGroups: params.visibleGroups
                }, { onConflict: 'Key' });
                if (error) throw error;
                saveLog("Blok İçerik Güncelleme", `${params.key}`);
                return { result: error ? "error" : "success" };
            }
            case "updateDoc": {
                // Anti-Grafiti: Sadece admin doküman güncelleyebilir
                if (!isAdminMode) return { result: "error", message: "Unauthorized" };
                // Database kolon isimleri: Başlık, İçerik, Kategori, Görsel, Link
                const { error } = await sb.from('Teknik_Dokumanlar').update({
                    Başlık: params.title,
                    İçerik: params.content,
                    Kategori: params.category,
                    Görsel: params.image,
                    Link: params.link
                }).eq('id', params.id);
                return { result: error ? "error" : "success" };
            }
            case "getActiveUsers": {
                // Real-time Users (Heartbeat tabanlı - profiles tablosundan)
                const heartbeatThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

                const { data: activeUsers, error: uErr } = await sb
                    .from('profiles')
                    .select('*') // Tüm kolonları çek (group vs group_name hatasını önlemek için)
                    .gt('last_seen', heartbeatThreshold)
                    .order('last_seen', { ascending: false });

                if (uErr) {
                    console.error("Active Users Error:", uErr);
                    return { result: "error", message: "Veri çekilemedi: " + uErr.message };
                }

                // 🕵️ LocAdmin Filtresi (Username ve Role kontrolü)
                const users = (activeUsers || []).filter(u =>
                    String(u.username).toLowerCase() !== 'locadmin' &&
                    String(u.role).toLowerCase() !== 'locadmin'
                ).map(u => ({
                    username: u.username,
                    role: u.role,
                    group: u.group || u.group_name, // Fallback
                    last_seen: u.last_seen,
                    id: u.id
                }));
                return { result: "success", users: users };
            }
            case "logAction": {
                // 🕵️ Ghost Mode: LocAdmin loglamıyoruz
                const logUser = params.username || currentUser;
                if (String(logUser).toLowerCase() === 'locadmin') return { result: "success" };

                const { error } = await sb.from('Logs').insert([{
                    Username: logUser,
                    Action: params.action,
                    Details: params.details,
                    "İP ADRESİ": params.ip || '-',
                    Date: new Date().toISOString()
                }]);
                return { result: error ? "error" : "success" };
            }
            case "submitAgentNote": {
                // Anti-Grafiti: Temsilci sadece KENDİ kaydına not yazabilir
                // AgentName = currentUser kontrolü ile başkasının kaydına yazma engellendi
                const cleanCallId = String(params.callId || '').replace('#', '').trim();
                if (!cleanCallId || !currentUser) {
                    return { result: "error", message: "Geçersiz istek." };
                }
                const noteText = String(params.note || '').slice(0, 1000); // Max 1000 karakter
                const { error } = await sb.from('Evaluations').update({
                    "Temsilci Notu": noteText,
                    "Durum": 'Bekliyor'
                })
                    .ilike('CallID', cleanCallId)
                    .ilike('AgentName', currentUser); // 🔒 Sadece kendi kaydı!

                if (error) console.error("[Pusula Note Error]", error);
                return { result: error ? "error" : "success", message: error ? error.message : "" };
            }
            case "logQuiz": {
                // Anti-Grafiti: Username her zaman currentUser (params.username manipülasyonu önlendi)
                const { error } = await sb.from('QuizResults').insert([{
                    Username: currentUser, // params.username değil!
                    Score: params.score,
                    TotalQuestions: params.total,
                    SuccessRate: params.successRate,
                    Date: new Date().toISOString()
                }]);
                if (error) console.error("[Pusula Quiz Error]", error);
                return { result: error ? "error" : "success" };
            }
            case "getLogs": {
                const { data, error } = await sb.from('Logs')
                    .select('*')
                    .order('Date', { ascending: false })
                    .limit(500);
                if (error) throw error;
                // 🕵️ Ghost Mode: LocAdmin loglarını filtrele
                const filteredLogs = (data || []).filter(l => String(l.Username).toLowerCase() !== 'locadmin');
                return { result: "success", logs: filteredLogs };
            }
            case "resolveAgentFeedback": {
                // Anti-Grafiti: Role and Authorization Check (Management Only)
                const currentRole = (activeRole || localStorage.getItem("sSportRole") || "").toLowerCase();
                const isAuth = (isAdminMode || isLocAdmin || currentRole === 'admin' || currentRole === 'locadmin');

                if (!isAuth) {
                    console.error("[Pusula Auth Error] Unauthorized attempt.", { activeRole, isAdminMode, currentRole });
                    return { result: "error", message: `Yetki hatası: ${currentRole} rolü ile bu işlemi yapma yetkiniz bulunmamaktadır.` };
                }

                const replyText = String(params.reply || '').trim();
                const safeStatus = ['Tamamlandı', 'Bekliyor', 'Kapatıldı'].includes(params.status) ? params.status : 'Tamamlandı';

                console.log("[Pusula Debug] resolveAgentFeedback params:", params);

                const updatePayload = { "Durum": safeStatus };
                // Veritabanı şemasına göre hem 'Yönetici Cevabı' hem 'ManagerReply' kontrolü (En az birini güncelle)
                updatePayload["Yönetici Cevabı"] = replyText;
                // updatePayload["ManagerReply"] = replyText; // Eğer şema değişirse burası da açılabilir

                let query = sb.from('Evaluations').update(updatePayload);

                // ID öncelikli (Sayısal kontrol ile), yoksa CallID
                const numericId = parseInt(params.id);
                if (!isNaN(numericId) && numericId > 0) {
                    query = query.eq('id', numericId);
                } else {
                    const cleanCallId = String(params.callId || '').replace('#', '').trim();
                    if (!cleanCallId) return { result: "error", message: "Kaydı tanımlayacak ID veya CallID bulunamadı." };
                    query = query.ilike('CallID', cleanCallId);
                }

                // .select() ekleyerek güncellenen veriyi kontrol ediyoruz (Update başarısını doğrular)
                const { data, error } = await query.select();

                if (error) {
                    console.error("[Pusula DB Error] resolveAgentFeedback fail:", error);
                    return { result: "error", message: "Veritabanı hatası: " + error.message };
                }

                if (!data || data.length === 0) {
                    console.warn("[Pusula] resolveAgentFeedback: Hiçbir kayıt güncellenmedi (ID/CallID eşleşmedi).");
                    return { result: "error", message: "Güncellenecek kayıt bulunamadı. Lütfen sayfayı yenileyip tekrar deneyin." };
                }

                console.log("[Pusula Debug] Update successful:", data);

                saveLog("Yönetici Yanıtı", `ID/CallID: ${params.id || params.callId} -> ${safeStatus}`);
                return { result: "success" };
            }
            case "getBroadcastFlow": {
                // 🧠 v8.7.7 Ultra-Robotic Akıllı Önbellek
                const nowTS = Date.now();
                if (window._bfCache && (nowTS - window._bfCache.ts < 60000) && window._bfCache.v === "8.7.7" && window._bfCache.data.length > 0) {
                    console.log("[Pusula] Yayın akışı taze önbellekten yüklendi (v8.7.7).");
                    return { result: "success", items: window._bfCache.data, source: "cache", count: window._bfCache.data.length };
                }

                // URL Boş gelirse HomeBlocks'u bir kez zorla çekmeyi dene (Login çıkış sorunu çözümü)
                if (!homeBlocks || Object.keys(homeBlocks).length === 0) {
                       console.log("[Pusula Debug] HomeBlocks boş, zorla yükleniyor...");
                       await loadHomeBlocks();
                }

                const sheetUrlStr = (homeBlocks['broadcast_url']?.content || localStorage.getItem("pusula_broadcast_url") || "").trim();
                const urls = sheetUrlStr.split('|').map(u => u.trim()).filter(u => u.startsWith("http"));
                
                if (urls.length > 0) {
                    console.log("[Pusula Debug] Çoklu E-Tablo kaynağı aktif (Ham TSV):", urls);
                    try {
                        const fetchPromises = urls.map(url => fetchGSheetRawTSV(url));
                        const results = await Promise.allSettled(fetchPromises);
                        
                        let combinedItems = [];
                        let hasSuccess = false;

                        results.forEach((res, index) => {
                            if (res.status === 'fulfilled') {
                                combinedItems = combinedItems.concat(res.value);
                                hasSuccess = true;
                            }
                        });

                        if (!hasSuccess) throw new Error("Hiçbir onaylı E-Tablo verisi alınamadı.");

                        const finalItems = combinedItems.map(normalizeKeys);
                        // Önbelleğe al (v8.7.7) - Boş ise kısa tut
                        const cacheTimeOffset = finalItems.length === 0 ? 115000 : 0; // Boşsa 5 saniye sonra bitsin
                        window._bfCache = { ts: nowTS - cacheTimeOffset, data: finalItems, v: "8.7.7" };

                        return { result: "success", items: finalItems, source: "sheet", count: finalItems.length };
                    } catch (e) {
                        console.warn("[Pusula] Ham TSV fetch işlemi başarısız.", e);
                    }
                }

                const { data, error } = await sb.from('YayinAkisi').select('*');
                if (error) {
                    console.warn("[Pusula] BroadcastFlow fetch error:", error);
                    return { result: "success", items: [] };
                }
                const dbItems = (data || []).map(normalizeKeys);
                
                // 🛠 FIX: Eğer veriler boş geldiyse, cache'i bloke et veya çok kısa tut
                if (dbItems.length === 0) {
                     window._bfCache = { ts: nowTS - 115000, data: [], v: "8.7.7" }; // 5 saniye sonra expire olsun
                } else {
                     window._bfCache = { ts: nowTS, data: dbItems, v: "8.7.7" };
                }
                
                return { result: "success", items: dbItems, source: "db" };
            }
            case "uploadImage":
            case "uploadTrainingDoc": {
                const { fileName, mimeType, base64 } = params;
                const blob = b64toBlob(base64, mimeType);
                if (!blob) throw new Error("Dosya işlenemedi (Base64 Hatası)");

                const folder = (action === 'uploadImage') ? 'images' : 'trainings';
                const filePath = `${folder}/${Date.now()}_${fileName}`;

                const { data, error } = await sb.storage.from('pusula').upload(filePath, blob, {
                    contentType: mimeType,
                    cacheControl: '3600',
                    upsert: false
                });

                if (error) throw error;

                const { data: publicURL } = sb.storage.from('pusula').getPublicUrl(filePath);
                saveLog("Dosya Yükleme", `${fileName} (${folder})`);
                return { result: "success", url: publicURL.publicUrl };
            }
            case "deleteTechDoc": {
                const { error } = await sb.from('Teknik_Dokumanlar').delete().eq('id', params.id);
                if (error) {
                    console.error("[Pusula] deleteTechDoc error:", error);
                    return { result: "error", message: error.message };
                }
                saveLog("Teknik Döküman Silme", `ID: ${params.id}`);
                return { result: "success" };
            }
            case "updateShiftData": {
                if (!isAdminMode && !isLocAdmin) return { result: "error", message: "Yetki hatası." };
                const { shifts, mode } = params;
                // 'append' modu değilse önce temizle
                if (mode !== 'append') {
                    await sb.from('Vardiya').delete().not('Temsilci', 'is', null);
                }
                const { error } = await sb.from('Vardiya').insert(shifts);
                if (error) throw error;
                saveLog("Vardiya Güncelleme", `${shifts.length} personel ${mode === 'append' ? 'eklendi' : 'yenilendi'}.`);
                return { result: "success" };
            }
            case "updateBroadcastFlow": {
                if (!isAdminMode && !isLocAdmin) return { result: "error", message: "Yetki hatası." };
                const { items, mode } = params;
                if (mode !== 'append') {
                    await sb.from('YayinAkisi').delete().neq('id', -0);
                }
                const { error } = await sb.from('YayinAkisi').insert(items);
                if (error) throw error;
                saveLog("Yayın Akışı Güncelleme", `${items.length} kayıt ${mode === 'append' ? 'eklendi' : 'yenilendi'}.`);
                return { result: "success" };
            }
            default:
                console.warn(`[Pusula] Bilinmeyen apiCall action: ${action}`);
                return { result: "error", message: `Hizmet taşınıyor: ${action}` };
        }
    } catch (err) {
        console.error(`[Pusula] apiCall Error (${action}):`, err);
        return { result: "error", message: err.message };
    }
}

// SweetAlert2 yoksa minimal yedek (sessiz kırılma olmasın)
if (typeof Swal === "undefined") {
    window.Swal = {
        fire: (a, b, c) => { try { alert((a && a.title) || a || b || c || ""); } catch (e) { } },
    };
}



// Oyun Değişkenleri
let jokers = { call: 1, half: 1, double: 1 };
let doubleChanceUsed = false;
let firstAnswerIndex = -1;
const VALID_CATEGORIES = ['Teknik', 'İkna', 'Kampanya', 'Bilgi'];
const MONTH_NAMES = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
// --- GLOBAL DEĞİŞKENLER ---
let database = [], newsData = [], videoPopups = [], sportsData = [], salesScripts = [], quizQuestions = [], arenaQuizQuestions = [], quickDecisionQuestions = [];

// Data load barrier (prevents Tech/Telesales first-render flicker)
let __dataLoadedResolve;
window.__dataLoadedPromise = new Promise(r => { __dataLoadedResolve = r; });
let techWizardData = {}; // Teknik Sihirbaz Verisi
let currentUser = "";
let currentUserId = ""; // Supabase Auth ID
let globalUserIP = "";
let isAdminMode = false;
let isLocAdmin = false;
let isEditingActive = false;
let activeRole = "";
let allRolePermissions = [];
let adminUserList = [];
let sessionTimeout;
let activeCards = [];
let currentCategory = "home";
let allEvaluationsData = [];
let trainingData = [];
let feedbackLogsData = [];

// -------------------- HomeBlocks (Ana Sayfa blok içerikleri) --------------------
let homeBlocks = {}; // { quote:{...}, ... }

// 🛡️ TRAFİK POLİSİ: HomeBlocks için Promise Lock + Günlük Cache
// Aynı anda N çağrı gelse bile Supabase'e TEK istek gider.
// Aynı gün içinde zaten çektiyse cache'ten döner.
let _homeBlocksPromise = null;

async function loadHomeBlocks() {
    // 📅 Günlük Cache Kontrolü
    const today = new Date().toDateString();
    const cachedDate = localStorage.getItem('homeBlocksCacheDate');
    if (cachedDate === today && homeBlocks && Object.keys(homeBlocks).length > 0) {
        console.log('[Pusula] HomeBlocks günlük cache geçerli, Supabase atlandı.');
        try { renderHomePanels(); } catch (e) { }
        return homeBlocks;
    }
    // localStorage'dan yüklü cache varsa hemen göster
    if (cachedDate === today) {
        try {
            const cached = JSON.parse(localStorage.getItem('homeBlocksCache') || '{}');
            if (cached && Object.keys(cached).length > 0) {
                homeBlocks = cached;
                try { renderHomePanels(); } catch (e) { }
                return homeBlocks;
            }
        } catch (_) { }
    }

    // Promise Lock: Aynı anda birden fazla çağrı varsa hepsini tek isteğe bağla
    if (_homeBlocksPromise) {
        console.log('[Pusula] HomeBlocks zaten yükleniyor, bekleniyor...');
        return _homeBlocksPromise;
    }

    _homeBlocksPromise = (async () => {
        try {
            const { data, error } = await sb.from('HomeBlocks').select('*');
            if (error) throw error;

            homeBlocks = {};
            data.forEach(row => {
                const normalized = normalizeKeys(row);
                const id = (normalized.key || row.Key || normalized.blockId || row.BlockId || row.id || '').toString().toLowerCase();
                if (id) homeBlocks[id] = normalized;
            });

            console.log('[Pusula] HomeBlocks yüklendi (TEK İSTEK):', Object.keys(homeBlocks));
            try { localStorage.setItem('homeBlocksCache', JSON.stringify(homeBlocks || {})); } catch (e) { }
            try { localStorage.setItem('homeBlocksCacheDate', today); } catch (e) { }
            try { renderHomePanels(); } catch (e) { }
            return homeBlocks;
        } catch (err) {
            console.error('[Pusula] HomeBlocks Fetch Error:', err);
            try { homeBlocks = JSON.parse(localStorage.getItem('homeBlocksCache') || '{}') || {}; } catch (_) { homeBlocks = {}; }
            try { renderHomePanels(); } catch (_) { }
            return homeBlocks;
        } finally {
            // 5 dk sonra kilidi aç — kritik güncelleme olursa tekrar çeksin
            setTimeout(() => { _homeBlocksPromise = null; }, 5 * 60 * 1000);
        }
    })();

    return _homeBlocksPromise;
}

function normalizeRole(v) {
    return String(v || '').trim().toLowerCase();
}
function normalizeGroup(v) {
    if (!v) return "";
    let s = String(v).trim().toLowerCase()
        .replace(/i̇/g, 'i').replace(/ı/g, 'i')
        .replace(/ş/g, 's').replace(/ğ/g, 'g')
        .replace(/ü/g, 'u').replace(/ö/g, 'o')
        .replace(/ç/g, 'c');

    // NOT: Grup bazlı form eşleşmesi logEvaluationPopup içinde yapılıyor.
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function normalizeList(v) {
    if (!v) return [];
    return String(v).split(',').map(s => s.trim()).filter(Boolean);
}
function getMyGroup() { return normalizeGroup(localStorage.getItem("sSportGroup") || ""); }
function getMyRole() {
    // Anti-Grafiti: localStorage manipülasyonuna karşı sadece doğrulanmış oturum rolünü baz al.
    return activeRole || "";
}


// --------------------------------------------------------------------
function enterBas(e) {
    if (e.key === 'Enter') girisYap();
}
let wizardStepsData = {};
// YENİ: Chart instance'ı tutmak için
let dashboardChart = null;
let dashTrendChart = null;
let dashChannelChart = null;
let dashScoreDistChart = null;
let dashGroupAvgChart = null;
// YENİ: Feedback Log Verisi (Manuel kayıt detayları için)
// ==========================================================
// --- KALİTE PUANLAMA LOGİĞİ V2 (PROFESYONEL) ---
// ==========================================================

window.v2_setScore = function (index, score, max, type) {
    const itemEl = document.getElementById(`criteria-${index}`);
    const noteRow = document.getElementById(`note-row-${index}`);
    const buttons = itemEl.querySelectorAll('.eval-btn-v2');

    // Aktif butonu güncelle
    buttons.forEach(b => b.classList.remove('active'));
    const targetBtn = itemEl.querySelector(`.eval-btn-v2.${type}`);
    if (targetBtn) targetBtn.classList.add('active');

    // Not alanını göster/gizle
    const isFailed = Number(score) < Number(max);
    if (noteRow) {
        noteRow.style.display = isFailed ? 'block' : 'none';
    }

    // Fallback: noteRow yoksa direkt input'u bulmayı dene (Edit modunda bazen wrapper olmayabilir ama artık ekleyeceğiz)
    const noteInp = document.getElementById(`note-${index}`);
    if (noteInp && !noteRow) {
        noteInp.style.display = isFailed ? 'block' : 'none';
    }

    if (isFailed) {
        itemEl.classList.add('failed');
    } else {
        if (noteInp) noteInp.value = '';
        itemEl.classList.remove('failed');
    }

    // Buton verisini güncelle
    itemEl.setAttribute('data-current-score', score);
    window.v2_recalc();
}

window.v2_updateSlider = function (index, max) {
    const itemEl = document.getElementById(`criteria-${index}`);
    const slider = document.getElementById(`slider-${index}`);
    const valEl = document.getElementById(`val-${index}`);
    const noteRow = document.getElementById(`note-row-${index}`);

    if (!slider) return;
    const val = parseInt(slider.value);

    if (valEl) valEl.innerText = `${val} / ${max}`;

    const isFailed = Number(val) < Number(max);
    if (noteRow) {
        noteRow.style.display = isFailed ? 'block' : 'none';
    }

    // Fallback
    const noteInp = document.getElementById(`note-${index}`);
    if (noteInp && !noteRow) {
        noteInp.style.display = isFailed ? 'block' : 'none';
    }

    if (isFailed) {
        itemEl.classList.add('failed');
    } else {
        if (noteInp) noteInp.value = '';
        itemEl.classList.remove('failed');
    }

    window.v2_recalc();
}

window.v2_recalc = function () {
    let total = 0;

    // Butonlu kriterler
    document.querySelectorAll('.criteria-item-v2').forEach(item => {
        const slider = item.querySelector('input[type="range"]');
        if (slider) {
            total += parseInt(slider.value) || 0;
        } else {
            const activeBtn = item.querySelector('.eval-btn-v2.active');
            if (activeBtn) total += parseInt(activeBtn.getAttribute('data-score')) || 0;
        }
    });

    const scoreEl = document.getElementById('v2-live-score');
    if (scoreEl) {
        scoreEl.innerText = total;
        scoreEl.style.color = total >= 90 ? '#2f855a' : (total >= 75 ? '#ed8936' : '#e53e3e');
    }
}

window.v2_resetAllCriteria = function (mode, criteriaList = []) {
    for (let i = 0; i < criteriaList.length; i++) {
        const itemEl = document.getElementById(`criteria-${i}`);
        if (!itemEl) continue;

        const max = parseInt(criteriaList[i].points) || 0;
        const valEl = document.getElementById(`val-${i}`);
        const slider = document.getElementById(`slider-${i}`);
        const noteRow = document.getElementById(`note-row-${i}`);
        const noteInp = document.getElementById(`note-${i}`);

        if (mode === 'telesatis' && slider) {
            slider.value = 0;
            if (valEl) valEl.innerText = `0 / ${max}`;
        }

        if (mode === 'chat') {
            const buttons = itemEl.querySelectorAll('.eval-btn-v2');
            buttons.forEach(b => {
                b.classList.remove('active');
            });
            const zeroBtn = itemEl.querySelector('.eval-btn-v2.bad');
            if (zeroBtn) {
                zeroBtn.setAttribute('data-score', '0'); // FORCING 0 points for reset!
                zeroBtn.classList.add('active');
            }
            if (valEl) valEl.innerText = `0 / ${max}`;
        }

        // 0 puan başarısızlık olduğu için not alanlarını göster
        if (noteRow) noteRow.style.display = 'block';
        if (noteInp) noteInp.style.display = 'block';
        itemEl.classList.add('failed');
    }

    const scoreEl = document.getElementById('v2-live-score');
    if (scoreEl) {
        scoreEl.innerText = '0';
        scoreEl.style.color = '#e53e3e';
    }

    // Seçimlerin kalıcı olması ve toplam puanın tam doğrulanması için recalc çağır
    window.v2_recalc();
}

// Eski fonksiyonları V2'ye yönlendir (Geriye dönük uyumluluk için)
window.setButtonScore = (i, s, m) => window.v2_setScore(i, s, m, s === m ? 'good' : (s === 0 ? 'bad' : 'medium'));
window.recalcTotalScore = () => window.v2_recalc();
window.updateRowSliderScore = (i, m) => window.v2_updateSlider(i, m);
window.recalcTotalSliderScore = () => window.v2_recalc();

// --- YARDIMCI FONKSİYONLAR ---
function getToken() { return localStorage.getItem("sSportToken"); }
function setHomeWelcomeUser(name) {
    try {
        const el = document.getElementById("home-welcome-user");
        if (el) el.textContent = (name || "Misafir");
    } catch (e) { }
}

function getFavs() { return JSON.parse(localStorage.getItem('sSportFavs') || '[]'); }
function toggleFavorite(title) {
    event.stopPropagation();
    let favs = getFavs();
    if (favs.includes(title)) { favs = favs.filter(t => t !== title); }
    else { favs.push(title); }
    localStorage.setItem('sSportFavs', JSON.stringify(favs));
    try {
        const added = favs.includes(title);
        Swal.fire({ toast: true, position: 'top-end', icon: added ? 'success' : 'info', title: added ? 'Favorilere eklendi' : 'Favorilerden kaldırıldı', showConfirmButton: false, timer: 1200 });
    } catch (e) { }

    if (currentCategory === 'fav') { filterCategory(document.querySelector('.btn-fav'), 'fav'); }
    else { renderCards(activeCards); }
    try { updateSearchResultCount(activeCards.length || 0, database.length); } catch (e) { }
}
function isFav(title) { return getFavs().includes(title); }
function formatDateToDDMMYYYY(dateString) {
    if (!dateString) return 'N/A';
    // Eğer format dd.MM.yyyy olarak geliyorsa direkt dön
    if (dateString.match(/^\d{2}\.\d{2}\.\d{4}/)) { return dateString.split(' ')[0]; }
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) { return dateString; }
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    } catch (e) { return dateString; }
}

function processImageUrl(url) {
    if (!url) return '';
    // Drive linki düzeltme: /d/ID veya id=ID -> thumbnail?sz=w1000
    try {
        let id = '';
        const m = url.match(/\/d\/([-\w]+)/) || url.match(/id=([-\w]+)/);
        if (m && m[1]) id = m[1];
        if (id && url.includes('drive.google.com')) {
            return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000';
        }
    } catch (e) { }
    return url;
}

function parseDateTRToTS(s) {
    try {
        if (!s) return 0;
        const clean = String(s).split(' ')[0];
        if (clean.includes('.')) {
            const parts = clean.split('.');
            if (parts.length >= 3) {
                const dd = parseInt(parts[0], 10);
                const mm = parseInt(parts[1], 10);
                const yy = parseInt(parts[2], 10);
                const d = new Date(yy, mm - 1, dd);
                return d.getTime() || 0;
            }
        }
        const d = new Date(s);
        return d.getTime() || 0;
    } catch (e) { return 0; }
}

function isNew(dateStr) {
    if (!dateStr) return false;
    let date;
    if (dateStr.indexOf('.') > -1) {
        const cleanDate = dateStr.split(' ')[0];
        const parts = cleanDate.split('.');
        // GG.AA.YYYY -> YYYY-AA-GG formatına çevir
        date = new Date(parts[2], parts[1] - 1, parts[0]);
    } else {
        date = new Date(dateStr);
    }
    if (isNaN(date.getTime())) return false;
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 3;
}
function getCategorySelectHtml(currentCategory, id) {
    let options = VALID_CATEGORIES.map(cat => `<option value="${cat}" ${cat === currentCategory ? 'selected' : ''}>${cat}</option>`).join('');
    if (currentCategory && !VALID_CATEGORIES.includes(currentCategory)) {
        options = `<option value="${currentCategory}" selected>${currentCategory} (Hata)</option>` + options;
    }
    return `<select id="${id}" class="swal2-input" style="width:100%; margin-top:5px;">${options}</select>`;
}
function escapeForJsString(text) {
    if (!text) return "";
    // Template Literal interpolation (\n -> \\n) and character escaping
    return text.toString()
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\\\n')
        .replace(/\r/g, '');
}
function copyScriptContent(encodedText) {
    const text = decodeURIComponent(encodedText);
    copyText(text);
}
function copyText(t) {
    // navigator.clipboard.writeText yerine execCommand kullanıldı (iFrame uyumluluğu için)
    const textarea = document.createElement('textarea');
    textarea.value = t.replace(/\\n/g, '\n');
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        Swal.fire({ icon: 'success', title: 'Kopyalandı', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Kopyalanamadı', text: 'Lütfen manuel kopyalayın.', toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
    }
    document.body.removeChild(textarea);
}

document.addEventListener('contextmenu', event => event.preventDefault());
document.onkeydown = function (e) { if (e.keyCode == 123) return false; }

document.addEventListener('DOMContentLoaded', () => {
    // --- GLOBAL ERROR HANDLER & ANTI-GRAFITI INITIALIZATION ---
    window.onerror = function (msg, url, line) {
        console.error("[Pusula Kritik Hata]:", msg, "at", line);
        try { document.getElementById('app-preloader').style.display = 'none'; } catch (e) { }
        return false;
    };

    // --- PRELOADER FAIL-SAFE (8 Saniye) ---
    const preloaderTimeout = setTimeout(() => {
        const preloader = document.getElementById('app-preloader');
        if (preloader && preloader.style.display !== 'none') {
            console.warn("[Pusula] Preloader zorla kapatıldı (Fail-safe).");
            preloader.style.opacity = '0';
            setTimeout(() => { preloader.style.display = 'none'; }, 500);
        }
    }, 8000);

    checkSession().then(() => clearTimeout(preloaderTimeout));

    // IP Fetch (Konum destekli)
    fetch('https://ipapi.co/json/')
        .then(r => r.json())
        .then(d => { globalUserIP = `${d.ip} [${d.city || '-'}, ${d.region || '-'}]`; })
        .catch(() => { });
});


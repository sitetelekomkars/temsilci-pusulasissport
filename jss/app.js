

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

// --- SUPABASE BAĞLANTISI ---
const SUPABASE_URL = "https://psauvjohywldldgppmxz.supabase.co";
const SUPABASE_KEY = "sb_publishable_ITFx76ndmOc3UJkNbHOSlQ_kD91kq45";
const sb = (window.supabase && typeof window.supabase.createClient === 'function')
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

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

// ⚠️ KRİTİK FIX: Supabase PascalCase/Türkçe → Frontend camelCase dönüşümü
function normalizeKeys(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(normalizeKeys);

    const n = {};
    Object.keys(obj).forEach(k => {
        // Orijinal key'i koru
        n[k] = obj[k];

        // Lowercase versiyonu her zaman ekle
        let val = obj[k];
        // ⚠️ FIX: "undefined" veya "null" veya "NaN" stringlerini temizle
        if (typeof val === 'string' && (val.toLowerCase() === 'undefined' || val.toLowerCase() === 'null' || val === 'NaN')) val = '';

        const lower = k.toLowerCase().replace(/\s+/g, '');
        n[lower] = val;

        // --- ÖZEL MAPPINGLER (Ekran görüntülerinden analiz edildi) ---

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

        // Yayın Akışı (Special table keys)
        // Yayın Akışı – normalize edilmiş anahtarlar
        const kk = String(k || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();

        // DATE
        if (kk === 'DATE' || kk === 'TARİH' || kk === 'TARIH') {
            if (!n.date) n.date = val; // Zaten formatlanmışsa ezme
            n.dateISO = val;
        }

        // EVENT / MATCH
        if (
            kk === 'EVENT NAME - TURKISH' ||
            kk === 'MAC' ||
            kk === 'EVENT' ||
            kk === 'TITLE' ||
            kk === 'BAŞLIK' ||
            kk === 'BASLIK'
        ) {
            n.match = val;
            n.event = val;
        }

        // TIME / START TIME / TSİ
        if (
            kk === 'SAAT' ||
            kk === 'TIME' ||
            kk === 'START_TIME_TSI' ||
            kk === 'START TIME TSI' ||
            (kk.includes('START') && kk.includes('TIME'))
        ) {
            n.time = val;
        }

        // ANNOUNCER / PLATFORM
        if (kk === 'ANNOUNCER') {
            n.announcer = val;
        }
        if (kk === 'KANAL' || kk === 'PLATFORM') {
            n.channel = val;
        }

        // StartEpoch hesaplama (Yayın Akışı için)
        const dVal = n.date || n.dateISO;
        const tVal = n.time;

        if (dVal && tVal) {
            try {
                const datePart = String(dVal).includes('.')
                    ? String(dVal).split('.').reverse().join('-')
                    : String(dVal).split(' ')[0];

                const timePart = String(tVal).trim().length === 5
                    ? `${String(tVal).trim()}:00`
                    : String(tVal).trim();

                const isoStr = `${datePart}T${timePart}`;
                const dt = new Date(isoStr);

                if (!isNaN(dt.getTime())) {
                    n.startEpoch = dt.getTime();
                }
            } catch (e) { }
        }


        // Notlar / Detaylar
        if (k === 'Details' || k === 'Detay') n.details = obj[k];
        if (k === 'Feedback' || k === 'Geri Bildirim') n.feedback = obj[k];
        if (k === 'Temsilci Notu' || k === 'AgentNote') n.agentNote = obj[k];
        if (k === 'Yönetici Cevabı' || k === 'ManagerReply') n.managerReply = obj[k];

        // --- SİHİRBAZLAR (Wizard / TechWizard) ---
        if (k === 'StepID' || k === 'StepId' || k === 'AdımID') n.stepId = obj[k];
        if (k.toLowerCase().includes('option') || k.toLowerCase().includes('button') || k === 'Seçenekler' || k === 'Butonlar') {
            if (!n.options || String(obj[k]).includes('|')) n.options = obj[k];
        }
        if (k === 'Alert' || k === 'Uyarı') n.alert = obj[k];
        if (k === 'Result' || k === 'Sonuç') n.result = obj[k];

        // Quiz / Game Results
        if (k === 'SuccessRate' || k === 'Başarı') n.average = obj[k];
        if (k === 'TotalQuestions') n.total = obj[k];
    });
    return n;
}

async function apiCall(action, params = {}) {
    // Anti-Grafiti: Production'da hassas params loglanmıyor, sadece action adı
    if (typeof isAdminMode !== 'undefined' && isAdminMode) {
        console.log(`[Pusula] apiCall: ${action}`, params);
    } else {
        console.log(`[Pusula] apiCall: ${action}`);
    }
    try {
        switch (action) {
            case "getRolePermissions": {
                const { data, error } = await sb.from('RolePermissions').select('*');
                if (error) throw error;
                const perms = (data || []).map(normalizeKeys);
                const groups = [...new Set(perms.map(p => p.role || p.Role).filter(Boolean))];
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
            case "fetchEvaluations": {
                let query = sb.from('Evaluations').select('*');
                if (params.targetAgent && params.targetAgent !== 'all') {
                    query = query.eq('AgentName', params.targetAgent);
                } else if (params.targetGroup && params.targetGroup !== 'all') {
                    // ✅ GRUP FİLTRESİ (Bug 4 & 10 Fix: Case-insensitive match)
                    query = query.ilike('Group', params.targetGroup);
                }
                // En yeni kayıtlar her zaman en üstte gelsin (ID descending)
                const { data, error } = await query.order('id', { ascending: false });
                if (error) throw error;
                return { result: "success", evaluations: data.map(normalizeKeys) };
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
                // User screenshot shows table name is "Vardiya" and schema is horizontal (columns are dates)
                const { data, error } = await sb.from('Vardiya').select('*');
                if (error) throw error;

                if (!data || data.length === 0) return { result: "success", shifts: {} };

                // Sabit gün sütunları (yeni yapı)
                const dayHeaders = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

                const rows = data.map(r => ({
                    id: r['İd'] || r.id || r.Id || r.ID,
                    name: r.Temsilci || r.temsilci || r.Name || r.username || '-',
                    cells: dayHeaders.map(h => r[h] || '')
                }));

                // Mevcut kullanıcının satırını bul
                const myRow = rows.find(r =>
                    String(r.name).trim().toLowerCase() === String(currentUser).trim().toLowerCase()
                );

                return {
                    result: "success",
                    shifts: {
                        headers: dayHeaders,
                        rows: rows,
                        myRow: myRow,
                        weekLabel: 'Haftalık Vardiya Planı'
                    }
                };
            }
            case "submitShiftRequest": {
                // Anti-Grafiti: Spread operatörü kaldırıldı, sadece izin verilen alanlar yazılıyor
                // username her zaman currentUser (manipülasyon önlemi)
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
                // ...existing...
                const { data, error } = await sb.from('YayinAkisi').select('*');
                if (error) {
                    console.warn("[Pusula] BroadcastFlow fetch error:", error);
                    return { result: "success", items: [] };
                }
                return { result: "success", items: (data || []).map(normalizeKeys) };
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

async function loadHomeBlocks() {
    try {
        const { data, error } = await sb.from('HomeBlocks').select('*');
        if (error) throw error;

        homeBlocks = {};
        data.forEach(row => {
            const normalized = normalizeKeys(row);
            // blockId veya key/Key alanını tespit et
            const id = (normalized.key || row.Key || normalized.blockId || row.BlockId || row.id || '').toString().toLowerCase();
            if (id) homeBlocks[id] = normalized;
        });

        console.log("[Pusula] HomeBlocks yüklendi:", Object.keys(homeBlocks));

        try { localStorage.setItem('homeBlocksCache', JSON.stringify(homeBlocks || {})); } catch (e) { }
        try { renderHomePanels(); } catch (e) { }
        return homeBlocks;
    } catch (err) {
        console.error("[Pusula] HomeBlocks Fetch Error:", err);
        try { homeBlocks = JSON.parse(localStorage.getItem('homeBlocksCache') || '{}') || {}; } catch (_) { homeBlocks = {}; }
        try { renderHomePanels(); } catch (_) { }
        return homeBlocks;
    }
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
// --- BROADCAST FLOW ---
// (Duplicate fetchBroadcastFlow removed)

// (Duplicate openBroadcastFlow removed)


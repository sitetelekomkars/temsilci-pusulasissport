async function openTelesalesArea() {
    // Menü yetkisi: telesales (TeleSatış) - yetkisiz kullanıcı fullscreen'e giremesin
    try {
        const perm = (typeof menuPermissions !== "undefined" && menuPermissions) ? menuPermissions["telesales"] : null;
        if (perm && !isAllowedByPerm(perm)) {
            Swal.fire("Yetkisiz", "TeleSatış ekranına erişimin yok.", "warning");
            return;
        }
    } catch (e) { }

    const wrap = document.getElementById('telesales-fullscreen');
    if (!wrap) return;
    wrap.style.display = 'flex';
    document.body.classList.add('fs-open');
    document.body.style.overflow = 'hidden';

    // Sidebar profil
    const av = document.getElementById('t-side-avatar');
    const nm = document.getElementById('t-side-name');
    const rl = document.getElementById('t-side-role');
    if (av) av.innerText = (currentUser || 'U').trim().slice(0, 1).toUpperCase();
    if (nm) nm.innerText = currentUser || 'Kullanıcı';
    if (rl) rl.innerText = isAdminMode ? 'Admin' : 'Temsilci';

    // Data teklifleri: önce e-tabladan çekmeyi dene, olmazsa fallback
    if (telesalesOffers.length === 0) {
        let loaded = [];
        try {
            loaded = await fetchSheetObjects("getTelesalesOffers");
        } catch (e) {
            // sessiz fallback
        }
        telesalesOffers = (Array.isArray(loaded) && loaded.length)
            ? loaded.map(o => ({
                segment: o.segment || o.Segment || o.SEGMENT || '',
                title: o.title || o.Başlık || o.Baslik || o.Teklif || o['Teklif Adı'] || o['Teklif Adi'] || '',
                desc: o.desc || o.Açıklama || o.Aciklama || o.Detay || o['Detay/Not'] || '',
                note: o.note || o.Not || o.Note || '',
                image: o.image || o.Image || o.Görsel || o.Gorsel || '',
                example: o.example || o.Örnek || o.Ornek || '',
                tips: o.tips || o.İpucu || o.Ipucu || '',
                objection: o.objection || o.Itiraz || '',
                reply: o.reply || o.Cevap || ''
            }))
            : (Array.isArray(window.telesalesOffersFromSheet) && window.telesalesOffersFromSheet.length
                ? window.telesalesOffersFromSheet
                : TELESales_OFFERS_FALLBACK);
    }

    // Segment filtresi kaldırıldı
    renderTelesalesDataOffers();
    // Scriptler: sheet'ten çekmeyi dene
    await maybeLoadTelesalesScriptsFromSheet();
    renderTelesalesScripts();
    switchTelesalesTab('data');
}

function closeFullTelesales() {
    const wrap = document.getElementById('telesales-fullscreen');
    if (wrap) wrap.style.display = 'none';
    document.body.classList.remove('fs-open');
    document.body.style.overflow = '';
    
    // AI Bot'u geri getir
    const aiBot = document.getElementById('ai-widget-container');
    if (aiBot) aiBot.style.display = 'flex';
}

function switchTelesalesTab(tab) {
    document.querySelectorAll('#telesales-fullscreen .q-nav-item').forEach(i => i.classList.remove('active'));
    // Set active nav by onclick marker
    document.querySelectorAll('#telesales-fullscreen .q-nav-item').forEach(i => {
        if ((i.getAttribute('onclick') || '').includes(`"${tab}"`)) i.classList.add('active');
    });

    document.querySelectorAll('#telesales-fullscreen .q-view-section').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(`t-view-${tab}`);
    if (el) el.classList.add('active');

    // Yarışma sekmesinde AI botu gizle
    const aiBot = document.getElementById('ai-widget-container');
    if (aiBot) {
        if (tab === 'competition') aiBot.style.display = 'none';
        else aiBot.style.display = 'flex';
    }

    if (tab === 'video') renderTelesalesVideoArchive();
    if (tab === 'competition') renderTelesalesCompetition();
}

function hydrateTelesalesSegmentFilter() {
    const sel = document.getElementById('t-data-seg');
    if (!sel) return;
    const segs = Array.from(new Set((telesalesOffers || []).map(o => o.segment).filter(Boolean))).sort();
    sel.innerHTML = '<option value="all">Tüm Segmentler</option>' + segs.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
}

function renderTelesalesDataOffers() {
    const grid = document.getElementById('t-data-grid');
    if (!grid) return;

    const q = (document.getElementById('t-data-search')?.value || '').toLowerCase();

    const list = (telesalesOffers || []).filter(o => {
        const hay = `${o.title || ''} ${o.desc || ''} ${o.segment || ''} ${o.tag || ''}`.toLowerCase();
        const okQ = !q || hay.includes(q);
        return okQ;
    });

    const bar = (isAdminMode && isEditingActive) ? `
        <div style="grid-column:1/-1;display:flex;gap:10px;align-items:center;margin:6px 0 12px;">
          <button class="x-btn x-btn-admin" onclick="addTelesalesOffer()"><i class="fas fa-plus"></i> Teklif Ekle</button>
        </div>
    ` : '';

    if (list.length === 0) {
        grid.innerHTML = bar + '<div style="opacity:.7;padding:20px;grid-column:1/-1">Sonuç bulunamadı.</div>';
        const cnt = document.getElementById('t-data-count'); if (cnt) cnt.innerText = '0 kayıt';
        return;
    }

    const cnt = document.getElementById('t-data-count');
    if (cnt) cnt.innerText = `${list.length} kayıt`;

    grid.innerHTML = bar + list.map((o, idx) => {
        const processedImg = o.image ? escapeHtml(processImageUrl(o.image)) : '';
        const imgHtml = processedImg ? `<div style="height:120px;overflow:hidden;border-radius:6px;margin-bottom:8px;"><img src="${processedImg}" style="width:100%;height:100%;object-fit:cover;"></div>` : '';
        const escTitle = escapeHtml(o.title || 'Teklif');
        const escSegment = escapeHtml(o.segment || o.tag || '');
        const escDesc = escapeHtml((o.desc || '').slice(0, 140)) + ((o.desc || '').length > 140 ? '...' : '');

        return `
        <div class="q-training-card" onclick="showTelesalesOfferDetail(${idx})" style="cursor:pointer">
          ${imgHtml}
          <div class="t-training-head">
            <div style="min-width:0">
              <div class="q-item-title" style="font-size:1.02rem">${highlightText(escTitle)}</div>
            </div>
            <div class="t-training-badge">${escSegment}</div>
          </div>
          <div class="t-training-desc" style="white-space: pre-line">${highlightText(escDesc)}</div>
          <div style="margin-top:10px;color:#999;font-size:.8rem">(Detay için tıkla)</div>
          ${(isAdminMode && isEditingActive) ? `
            <div style="margin-top:12px;display:flex;gap:10px">
              <button class="x-btn x-btn-admin" onclick="event.stopPropagation(); editTelesalesOffer(${idx});"><i class="fas fa-pen"></i> Düzenle</button>
              <button class="x-btn x-btn-admin" onclick="event.stopPropagation(); deleteTelesalesOffer(${idx});"><i class="fas fa-trash"></i> Sil</button>
            </div>
          ` : ``}
        </div>
    `;
    }).join('');
}

function renderTelesalesVideoArchive() {
    const grid = document.getElementById('t-video-grid');
    if (!grid) return;

    const q = (document.getElementById('t-video-search')?.value || '').toLowerCase();
    const myGroup = (getMyGroup() || '').toLowerCase();

    const list = videoPopups.filter(v => {
        if (v.status === 'Pasif') return false;
        
        const isActuallyAdmin = (isAdminMode || isLocAdmin);
        if (isActuallyAdmin) return true; // Admin her şeyi görür

        // Target group filter: Eğer hedef grup boşsa HERKES görür.
        if (!v.targetGroups || v.targetGroups.trim() === '') return true;

        const targets = v.targetGroups.toLowerCase().split(',').map(g => g.trim());
        return targets.includes(myGroup);
    });

    if (list.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:50px; color:#94a3b8; width:100%;">
            <i class="fas fa-video-slash" style="font-size:3rem; margin-bottom:15px; display:block;"></i>
            Henüz size uygun paylaşılan bir video bulunamadı.
        </div>`;
        return;
    }

    grid.innerHTML = list.map(v => {
        const url = v.url || '';
        const isYT = url.includes("youtube.com") || url.includes("youtu.be");
        let thumb = "";
        
        if (isYT) {
            const ytId = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (ytId && ytId[1]) {
                thumb = `https://img.youtube.com/vi/${ytId[1]}/mqdefault.jpg`;
            }
        }
        
        let dateStr = 'Paylaşıldı';
        if (v.date) {
            try {
                const d = new Date(v.date);
                if (!isNaN(d.getTime())) dateStr = d.toLocaleDateString('tr-TR');
            } catch(e) {}
        }

        return `
            <div class="q-card" onclick="playSingleVideo('${v.id}')" style="cursor:pointer; transition:transform 0.2s;">
                <div class="q-card-inner">
                    <div style="position:relative; background:#1e293b; height:140px; border-radius:8px; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                        ${thumb ? `<img src="${thumb}" style="width:100%; height:100%; object-fit:cover; opacity:0.8;">` : `<i class="fas fa-play-circle" style="font-size:3rem; color:#475569;"></i>`}
                        <div class="play-overlay" style="position:absolute; background:rgba(230,0,0,0.8); width:45px; height:45px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                            <i class="fas fa-play" style="margin-left:3px;"></i>
                        </div>
                    </div>
                    <div style="margin-top:12px; font-weight:700; font-size:0.95rem; color:#0e1b42; line-height:1.3; height:2.6em; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">
                        ${escapeHtml(v.title)}
                    </div>
                    <div style="margin-top:8px; font-size:0.75rem; color:#64748b; display:flex; align-items:center; gap:5px;">
                        <i class="far fa-calendar-alt"></i> ${dateStr}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function playSingleVideo(id) {
    const vid = videoPopups.find(v => String(v.id) === String(id));
    if (!vid) return;

    const url = vid.url ? vid.url.trim() : '';
    if (!url) return;

    const isDirectVideo = url.toLowerCase().match(/\.(mp4|webm|ogg)$/);
    const embedSrc = getEmbedUrl(url);

    let videoHtml = '';
    if (isDirectVideo) {
        videoHtml = `
            <div style="background:#000; border-radius:0 0 8px 8px; overflow:hidden;">
                <video controls autoplay style="width:100%; display:block; max-height:70vh;">
                    <source src="${url}" type="video/${isDirectVideo[1]}">
                    Tarayıcınız video oynatmayı desteklemiyor.
                </video>
            </div>`;
    } else {
        videoHtml = `
            <div id="vp-embed-wrapper-archive" style="position:relative; padding-bottom:56.25%; height:0; margin: 0 -16px;">
                <iframe id="vp-iframe-archive" src="${embedSrc}"
                    style="position:absolute; top:0; left:0; width:100%; height:100%; border:none; border-radius:0 0 8px 8px;"
                    allow="autoplay; encrypted-media; fullscreen"
                    allowfullscreen>
                </iframe>
                <div id="vp-fallback-archive" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:#1a1a2e; border-radius:0 0 8px 8px; flex-direction:column; justify-content:center; align-items:center; gap:15px; padding:20px; text-align:center;">
                    <i class="fas fa-exclamation-triangle" style="font-size:2.5rem; color:#f59e0b;"></i>
                    <p style="color:#fff; font-size:1rem; font-weight:600;">Bu içerik güvenlik nedeniyle burada açılamıyor olabilir.</p>
                    <p style="color:#aaa; font-size:0.85rem; margin-top:-10px;">Videonun sahibi site dışı oynatmaya izin vermemiş olabilir.</p>
                    <a href="${url}" target="_blank" style="background:#0e1b42; color:#fff; padding:12px 24px; border-radius:8px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:10px; border:1px solid #334155;">
                        <i class="fas fa-external-link-alt"></i> Videoyu Kaynağında İzle
                    </a>
                </div>
            </div>`;
    }

    await Swal.fire({
        title: `<span style="font-size:1.1rem; color:#0e1b42; font-weight:700;"><i class="fas fa-play-circle" style="color:#e60000; margin-right:8px;"></i>${escapeHtml(vid.title)}</span>`,
        html: videoHtml,
        width: 800,
        padding: '20px 16px 16px',
        confirmButtonText: 'Kapat',
        confirmButtonColor: '#0e1b42',
        customClass: { popup: 'video-popup-modal archive-video-popup' },
        didOpen: () => {
             const iframe = document.getElementById('vp-iframe-archive');
             const fallback = document.getElementById('vp-fallback-archive');
             if (iframe && fallback) {
                 // YouTube bazen 153 hatasini sessizce verdigi icin timeout ile manuel kontrol sunuyoruz
                 // Veya kullanici iframe icinde problem yasarsa manuel linki gorebilsin diye hep link ekleyebiliriz
                 // Ama simdi 5 saniye sonra yuklenmedigini dusunurse link ciksin
                 setTimeout(() => {
                    // Eger hala hata varsa veya sadece link gorsun istersek
                    // fallback.style.display = 'flex'; 
                 }, 5000);
             }
        }
    });
}

function addTelesalesOffer() {
    Swal.fire({
        title: "TeleSatış Teklifi Ekle",
        html: `
          <input id="to-title" class="swal2-input" placeholder="Başlık*" style="margin-bottom:10px">
          <input id="to-seg" class="swal2-input" placeholder="Segment" style="margin-bottom:10px">
           <input id="to-img" class="swal2-input" placeholder="Görsel URL (İsteğe bağlı)" style="margin-bottom:10px">
          <textarea id="to-desc" class="swal2-textarea" placeholder="Açıklama" style="margin-bottom:10px"></textarea>
          <textarea id="to-note" class="swal2-textarea" placeholder="Not (Kritik Bilgi)"></textarea>
         <textarea id="to-detail" class="swal2-textarea" placeholder="Diğer Detay"></textarea>
        `,
        showCancelButton: true,
        confirmButtonText: "Ekle",
        cancelButtonText: "Vazgeç",
        preConfirm: () => {
            const title = (document.getElementById('to-title').value || '').trim();
            if (!title) return Swal.showValidationMessage("Başlık zorunlu");
            return {
                title,
                segment: (document.getElementById('to-seg').value || '').trim(),
                image: (document.getElementById('to-img').value || '').trim(),
                desc: (document.getElementById('to-desc').value || '').trim(),
                note: (document.getElementById('to-note').value || '').trim(),
                detail: (document.getElementById('to-detail').value || '').trim(),
                pk: Date.now().toString()
            };
        }
    }).then(async res => {
        if (!res.isConfirmed) return;
        const v = res.value;
        Swal.fire({ title: 'Ekleniyor...', didOpen: () => Swal.showLoading(), showConfirmButton: false });
        try {
            telesalesOffers.unshift(v);
            const d = await apiCall("saveAllTelesalesOffers", { offers: telesalesOffers });
            if (d.result === 'success') {
                Swal.fire({ icon: 'success', title: 'Eklendi', timer: 1200, showConfirmButton: false });
                renderTelesalesDataOffers();
            } else {
                telesalesOffers.shift();
                Swal.fire('Hata', d.message || 'Eklenemedi', 'error');
            }
        } catch (e) {
            Swal.fire('Hata', 'Sunucu hatası.', 'error');
        }
    });
}

async function editTelesalesOffer(idx) {
    const o = (telesalesOffers || [])[idx];
    if (!o) return;
    const { value: v } = await Swal.fire({
        title: "Teklifi Düzenle",
        html: `
          <label>Başlık</label><input id="to-title" class="swal2-input" value="${escapeHtml(o.title || '')}">
          <label>Segment</label><input id="to-seg" class="swal2-input" value="${escapeHtml(o.segment || '')}">
          <label>Görsel</label><input id="to-img" class="swal2-input" value="${escapeHtml(o.image || '')}">
          <label>Açıklama</label><textarea id="to-desc" class="swal2-textarea">${escapeHtml(o.desc || '')}</textarea>
           <label>Not</label><textarea id="to-note" class="swal2-textarea">${escapeHtml(o.note || '')}</textarea>
          <label>Detay</label><textarea id="to-detail" class="swal2-textarea">${escapeHtml(o.detail || '')}</textarea>
        `,
        showCancelButton: true,
        confirmButtonText: "Kaydet",
        preConfirm: () => {
            const title = (document.getElementById('to-title').value || '').trim();
            if (!title) return Swal.showValidationMessage("Başlık zorunlu");
            return {
                title,
                segment: (document.getElementById('to-seg').value || '').trim(),
                image: (document.getElementById('to-img').value || '').trim(),
                desc: (document.getElementById('to-desc').value || '').trim(),
                note: (document.getElementById('to-note').value || '').trim(),
                detail: (document.getElementById('to-detail').value || '').trim()
            };
        }
    });
    if (!v) return;

    Swal.fire({ title: 'Kaydediliyor...', didOpen: () => Swal.showLoading(), showConfirmButton: false });
    const oldVal = telesalesOffers[idx];
    telesalesOffers[idx] = { ...oldVal, ...v };
    try {
        const d = await apiCall("saveAllTelesalesOffers", { offers: telesalesOffers });
        if (d.result === 'success') {
            Swal.fire({ icon: 'success', title: 'Kaydedildi', timer: 1200, showConfirmButton: false });
            renderTelesalesDataOffers();
        } else {
            telesalesOffers[idx] = oldVal;
            Swal.fire('Hata', d.message || 'Kaydedilemedi', 'error');
        }
    } catch (e) {
        telesalesOffers[idx] = oldVal;
        Swal.fire('Hata', 'Sunucu hatası.', 'error');
    }
}

function deleteTelesalesOffer(idx) {
    Swal.fire({
        title: "Silinsin mi?",
        text: "Bu teklif kalıcı olarak silinecek.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sil"
    }).then(async res => {
        if (!res.isConfirmed) return;
        const oldVal = telesalesOffers[idx];
        telesalesOffers.splice(idx, 1);
        try {
            const d = await apiCall("saveAllTelesalesOffers", { offers: telesalesOffers });
            if (d.result === 'success') {
                renderTelesalesDataOffers();
                Swal.fire({ icon: 'success', title: 'Silindi', timer: 1000, showConfirmButton: false });
            } else {
                telesalesOffers.splice(idx, 0, oldVal);
                Swal.fire('Hata', d.message || 'Silinemedi', 'error');
            }
        } catch (e) {
            telesalesOffers.splice(idx, 0, oldVal);
            Swal.fire('Hata', 'Sunucu hatası.', 'error');
        }
    });
}

function showTelesalesOfferDetail(idx) {
    const o = (telesalesOffers || [])[idx];
    if (!o) return;
    const imgHtml = o.image ? `<img src="${processImageUrl(o.image)}" style="max-width:100%;border-radius:6px;margin-bottom:15px;">` : '';
    Swal.fire({
        title: escapeHtml(o.title || ''),
        html: `<div style="text-align:left;line-height:1.6">
                ${imgHtml}
                <div style="margin-bottom:10px"><b>Segment:</b> ${escapeHtml(o.segment || '-')}</div>
                 ${o.note ? `<div style="margin-bottom:10px;background:#fff3cd;padding:8px;border-radius:4px;border-left:4px solid #ffc107;white-space: pre-line"><b>Not:</b> ${escapeHtml(o.note)}</div>` : ''}
                 <div style="white-space: pre-line">${escapeHtml(o.desc || 'Detay yok.')}</div>
                 ${o.detail ? `<hr><div style="font-size:0.9rem;color:#666;white-space: pre-line">${escapeHtml(o.detail)}</div>` : ''}
              </div>`,
        showCloseButton: true,
        showConfirmButton: false,
        width: '720px',
        background: '#f8f9fa'
    });
}

function renderTelesalesScripts() {
    const area = document.getElementById('t-scripts-grid');
    if (!area) return;

    let list = (salesScripts || []);
    try {
        const ov = JSON.parse(localStorage.getItem('telesalesScriptsOverride') || '[]');
        if (Array.isArray(ov) && ov.length) list = ov;
    } catch (e) { }

    // İstek: TeleSatış Scriptler'deki ayrı "Düzenlemeyi Aç" kalksın.
    // Düzenleme sadece üst kullanıcı menüsündeki global "Düzenlemeyi Aç" aktifken yapılabilsin.
    const bar = (isAdminMode && isEditingActive) ? `
        <div style="display:flex;gap:10px;align-items:center;margin:6px 0 12px;">
          <button class="x-btn x-btn-admin" onclick="addTelesalesScript()"><i class="fas fa-plus"></i> Script Ekle</button>
        </div>
    ` : '';

    if (list.length === 0) {
        area.innerHTML = bar + '<div style="padding:16px;opacity:.7">Script bulunamadı.</div>';
        return;
    }

    area.innerHTML = bar + list.map((s, i) => {
        const escTitle = escapeHtml(s.title || 'Script');
        const escText = escapeHtml(s.text || '');
        return `
      <div class="news-item" style="border-left-color:#10b981;cursor:pointer" onclick="copyText('${escapeForJsString(s.text || '')}')">
        <span class="news-title">${escTitle}</span>
        <div class="news-desc" style="white-space:pre-line">${escText}</div>
        <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:10px">
          <div class="news-tag" style="background:rgba(16,185,129,.08);color:#10b981;border:1px solid rgba(16,185,129,.25)">Tıkla & Kopyala</div>
          ${(isAdminMode && isEditingActive) ? `
            <div style="display:flex;gap:8px">
              <button class="x-btn x-btn-admin" onclick="event.stopPropagation(); editTelesalesScript('${s.id}');"><i class="fas fa-pen"></i></button>
              <button class="x-btn x-btn-admin" onclick="event.stopPropagation(); deleteTelesalesScript(${i});"><i class="fas fa-trash"></i></button>
            </div>
          ` : ``}
        </div>
      </div>
    `;
    }).join('');
}

function getTelesalesScriptsStore() {
    try {
        const ov = JSON.parse(localStorage.getItem('telesalesScriptsOverride') || '[]');
        if (Array.isArray(ov) && ov.length) return ov;
    } catch (e) { }
    return (salesScripts || []);
}
function saveTelesalesScriptsStore(arr) {
    localStorage.setItem('telesalesScriptsOverride', JSON.stringify(arr || []));
}

function addTelesalesScript() {
    Swal.fire({
        title: "Script Ekle",
        html: `
          <input id="ts-title" class="swal2-input" placeholder="Başlık">
          <textarea id="ts-text" class="swal2-textarea" placeholder="Script metni"></textarea>
        `,
        showCancelButton: true,
        confirmButtonText: "Ekle",
        cancelButtonText: "Vazgeç",
        preConfirm: () => {
            const title = (document.getElementById('ts-title').value || '').trim();
            const text = (document.getElementById('ts-text').value || '').trim();
            if (!text) return Swal.showValidationMessage("Script metni zorunlu");
            return { id: 'local_' + Date.now(), title: title || 'Script', text };
        }
    }).then(res => {
        if (!res.isConfirmed) return;
        const arr = getTelesalesScriptsStore();
        arr.unshift(res.value);
        saveTelesalesScriptsStore(arr);
        // mümkünse sheet'e de yaz
        syncTelesalesScriptsToSheet(arr);
        renderTelesalesScripts();
    });
}

function editTelesalesScript(id) {
    const arr = getTelesalesScriptsStore();
    const idx = arr.findIndex(x => String(x.id) === String(id));
    const s = arr[idx];
    if (!s) return;
    Swal.fire({
        title: "Script Düzenle",
        html: `
          <input id="ts-title" class="swal2-input" placeholder="Başlık" value="${escapeHtml(s.title || '')}">
          <textarea id="ts-text" class="swal2-textarea" placeholder="Script metni">${escapeHtml(s.text || '')}</textarea>
        `,
        showCancelButton: true,
        confirmButtonText: "Kaydet",
        cancelButtonText: "Vazgeç",
        preConfirm: () => {
            const title = (document.getElementById('ts-title').value || '').trim();
            const text = (document.getElementById('ts-text').value || '').trim();
            if (!text) return Swal.showValidationMessage("Script metni zorunlu");
            return { ...s, title: title || 'Script', text };
        }
    }).then(res => {
        if (!res.isConfirmed) return;
        arr[idx] = res.value;
        saveTelesalesScriptsStore(arr);
        syncTelesalesScriptsToSheet(arr);
        renderTelesalesScripts();
    });
}
function deleteTelesalesScript(idx) {
    Swal.fire({ title: "Silinsin mi?", icon: "warning", showCancelButton: true, confirmButtonText: "Sil", cancelButtonText: "Vazgeç" }).then(res => {
        if (!res.isConfirmed) return;
        const arr = getTelesalesScriptsStore().filter((_, i) => i !== idx);
        saveTelesalesScriptsStore(arr);
        syncTelesalesScriptsToSheet(arr);
        renderTelesalesScripts();
    });
}

function renderTelesalesDocs() {
    const box = document.getElementById('t-docs');
    if (!box) return;
    const docs = (trainingData || []).filter(t => (t.target || '') === 'Telesatış' || (t.title || '').toLowerCase().includes('telesatış'));
    if (docs.length === 0) {
        box.innerHTML = '<div style="opacity:.7;padding:10px">Bu ekibe atanmış döküman/eğitim görünmüyor.</div>';
        return;
    }
    box.innerHTML = docs.map(d => `
      <div class="news-item" style="border-left-color:var(--secondary)">
        <span class="news-date">${escapeHtml((d.startDate || '') + (d.endDate ? (' → ' + d.endDate) : ''))}</span>
        <span class="news-title">${escapeHtml(d.title || '')}</span>
        <div class="news-desc">${escapeHtml(d.desc || '')}</div>
        ${d.link && d.link !== 'N/A' ? `<a class="btn btn-link" href="${escapeHtml(d.link)}" target="_blank">Link</a>` : ''}
        ${d.docLink && d.docLink !== 'N/A' ? `<a class="btn btn-link" href="${escapeHtml(d.docLink)}" target="_blank">Döküman</a>` : ''}
      </div>
    `).join('');
}

/* -------------------------
   TEKNİK FULLSCREEN
--------------------------*/
async function openTechArea(tab) {
    const wrap = document.getElementById('tech-fullscreen');
    if (!wrap) return;
    wrap.style.display = 'flex';
    document.body.classList.add('fs-open');
    document.body.style.overflow = 'hidden';

    // Sidebar profil
    const av = document.getElementById('x-side-avatar');
    const nm = document.getElementById('x-side-name');
    const rl = document.getElementById('x-side-role');
    if (av) av.innerText = (currentUser || 'U').trim().slice(0, 1).toUpperCase();
    if (nm) nm.innerText = currentUser || 'Kullanıcı';
    if (rl) rl.innerText = isAdminMode ? 'Admin' : 'Temsilci';

    // İlk açılışta "bozuk görünüm" (flicker) olmasın: veri gelene kadar bekle
    try {
        if ((!database || database.length === 0) && window.__dataLoadedPromise) {
            const lists = ['x-broadcast-list', 'x-access-list', 'x-app-list', 'x-activation-list', 'x-cards'];
            lists.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = '<div class="home-mini-item">Yükleniyor...</div>'; });
            await window.__dataLoadedPromise;
        }
    } catch (e) { }

    // İçerikleri (bucket/list) hazırla
    try { renderTechSections(); } catch (e) { }

    // Sekmeyi aç
    switchTechTab(tab || 'broadcast');
}

function closeFullTech() {
    const wrap = document.getElementById('tech-fullscreen');
    if (wrap) wrap.style.display = 'none';
    document.body.classList.remove('fs-open');
    document.body.style.overflow = '';
}

function switchTechTab(tab) {
    // Sidebar aktif öğeyi doğru belirle
    // (önce data-tech-tab kullan, yoksa onclick içeriği ile fallback yap)
    document.querySelectorAll('#tech-fullscreen .q-nav-item').forEach(i => i.classList.remove('active'));

    const byData = document.querySelector(`#tech-fullscreen .q-nav-item[data-tech-tab="${tab}"]`);
    if (byData) {
        byData.classList.add('active');
    } else {
        document.querySelectorAll('#tech-fullscreen .q-nav-item').forEach(i => {
            const oc = (i.getAttribute('onclick') || '');
            if (oc.includes(`'${tab}'`) || oc.includes(`\"${tab}\"`)) i.classList.add('active');
        });
    }

    document.querySelectorAll('#tech-fullscreen .q-view-section').forEach(s => s.classList.remove('active'));

    let targetView = tab;
    if (tab === 'broadcast') {
        targetView = 'wizard';
        renderTechWizardInto('x-wizard');
    }

    const el = document.getElementById(`x-view-${targetView}`);
    if (el) el.classList.add('active');
}



// --- RENDER & FILTERING ---
const DISPLAY_LIMIT = 50;
let currentDisplayCount = DISPLAY_LIMIT;

function renderCards(data) {
    try {
        activeCards = data;
        const container = document.getElementById('cardGrid');
        if (!container) return;

        if (data.length === 0) {
            container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#777;">Kayıt bulunamadı.</div>';
            return;
        }

        // Reset display count on new render
        currentDisplayCount = DISPLAY_LIMIT;

        const renderSlice = (count) => {
            const listToRender = data.slice(0, count);
            const htmlChunks = listToRender.map((item, index) => {
                const safeTitle = escapeForJsString(item.title);
                const isFavorite = isFav(item.title);
                const favClass = isFavorite ? 'fas fa-star active' : 'far fa-star';
                const newBadge = isNew(item.date) ? '<span class="new-badge">YENİ</span>' : '';
                const editIconHtml = (isAdminMode && isEditingActive) ? `<i class="fas fa-pencil-alt edit-icon" onclick="editContent(${item.id})" style="display:block;"></i>` : '';

                // Anti-Grafiti: İçeriği escapeHtml'den geçiriyoruz
                const escTitle = escapeHtml(item.title);
                const escText = escapeHtml(item.text || "").replace(/\n/g, '<br>').replace(/\*(.*?)\*/g, '<b>$1</b>');
                const escScript = escapeHtml(item.script || "");
                const escCategory = escapeHtml(item.category);
                const escLink = escapeHtml(item.link || "");
                const processedImg = item.image ? escapeHtml(processImageUrl(item.image)) : '';
                const imgNotif = processedImg ? `<div style="margin-bottom:8px;"><img src="${processedImg}" loading="lazy" onerror="this.style.display='none'" style="max-width:100%;border-radius:6px;max-height:150px;object-fit:cover;"></div>` : '';

                return `<div class="card ${item.category}">
                    ${newBadge}
                    <div class="icon-wrapper">
                        ${editIconHtml}
                        <i class="${favClass} fav-icon" onclick="toggleFavorite('${safeTitle}')"></i>
                    </div>
                    <div class="card-header">
                        <h3 class="card-title">${highlightText(escTitle)}</h3>
                        <span class="badge">${escCategory}</span>
                    </div>
                    <div class="card-content" onclick="showCardDetailByIndex(${index})">
                        ${imgNotif}
                        <div class="card-text-truncate">${highlightText(escText)}</div>
                        <div style="font-size:0.8rem; color:#999; margin-top:5px; text-align:right;">(Tamamını oku)</div>
                    </div>
                    <div class="script-box">${highlightText(escScript)}</div>
                    <div class="card-actions">
                        <button class="btn btn-copy" onclick="copyText('${escapeForJsString(item.script)}')"><i class="fas fa-copy"></i> Kopyala</button>
                        ${item.code ? `<button class="btn btn-copy" style="background:var(--secondary); color:#333;" onclick="copyText('${escapeForJsString(item.code)}')">Kod</button>` : ''}
                        ${item.link ? `<a href="${escLink}" target="_blank" rel="noreferrer" class="btn btn-link"><i class="fas fa-external-link-alt"></i> Link</a>` : ''}
                    </div>
                </div>`;
            });

            if (data.length > count) {
                htmlChunks.push(`<div id="load-more-container" style="grid-column:1/-1; text-align:center; padding:20px;">
                    <button class="btn" style="background:var(--primary); color:white; padding:10px 40px;" onclick="loadMoreCards()">Daha Fazla Yükle (${data.length - count} kaldı)</button>
                </div>`);
            }
            container.innerHTML = htmlChunks.join('');
        };

        renderSlice(currentDisplayCount);
        window.loadMoreCards = () => {
            currentDisplayCount += DISPLAY_LIMIT;
            renderSlice(currentDisplayCount);
        };

    } catch (e) {
        console.error('[renderCards]', e);
    }
}
function highlightText(content) {
    if (!content) return "";
    const searchTerm = (document.getElementById('searchInput')?.value || '').toLocaleLowerCase('tr-TR').trim();
    if (!searchTerm) return content; // Zaten escapeHtml'den geçmiş olmalı
    try {
        const regex = new RegExp(`(${searchTerm})`, "gi");
        // Sadece düz metin içinde arama yapmalı, HTML etiketlerini bozmamalı. 
        // Basit bir yöntem:
        return content.toString().replace(regex, '<span class="highlight">$1</span>');
    } catch (e) { return content; }
}

function updateSearchResultCount(count, total) {
    const el = document.getElementById('searchResultCount');
    if (!el) return;
    // sadece arama yazıldığında veya filtre fav/tekil seçildiğinde göster
    const search = (document.getElementById('searchInput')?.value || '').trim();
    const show = !!search || (currentCategory && currentCategory !== 'all');
    if (!show) { el.style.display = 'none'; el.innerText = ''; return; }
    el.style.display = 'block';
    el.innerText = `🔎 ${count} sonuç${total != null ? ' / ' + total : ''}`;
}



function filterCategory(btn, cat) {
    // Ana Sayfa özel ekran
    if (cat === "home") {
        currentCategory = "home";
        setActiveFilterButton(btn);
        showHomeScreen();
        return;
    }


    // Tam ekran modüller
    const catNorm = String(cat || '').toLowerCase();
    if (catNorm.includes('teknik')) {
        hideHomeScreen();
        openTechArea('broadcast');
        return;
    }
    if (catNorm.includes('telesat')) {
        hideHomeScreen();
        openTelesalesArea();
        return;
    }
    if (catNorm.includes('kalite')) {
        hideHomeScreen();
        // kalite için mevcut davranış: card list (varsa) - burada özel modül yoksa devam
    }
    currentCategory = cat;
    hideHomeScreen();

    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterContent();
}
function filterContent() {
    const search = document.getElementById('searchInput').value.toLocaleLowerCase('tr-TR').trim();
    // Ana sayfa (home) özel ekran:
    // - Arama boşsa ana sayfa kartları görünür (home-screen)
    // - Arama yapılırsa ana sayfadan çıkıp kartlar üzerinde filtre uygulanır
    if (currentCategory === 'home') {
        if (!search) {
            updateSearchResultCount(database.length, database.length);
            showHomeScreen();
            return;
        }
        // Arama varsa: home ekranını gizle ve tüm kartlar içinde ara
        hideHomeScreen();
    }

    let filtered = database;
    if (currentCategory === 'fav') { filtered = filtered.filter(i => isFav(i.title)); }
    else if (currentCategory !== 'all' && currentCategory !== 'home') { filtered = filtered.filter(i => i.category === currentCategory); }

    if (search) {
        filtered = filtered.filter(item => {
            const title = (item.title || "").toString().toLocaleLowerCase('tr-TR');
            const text = (item.text || "").toString().toLocaleLowerCase('tr-TR');
            const script = (item.script || "").toString().toLocaleLowerCase('tr-TR');
            const code = (item.code || "").toString().toLocaleLowerCase('tr-TR');
            return title.includes(search) || text.includes(search) || script.includes(search) || code.includes(search);
        });
    }
    activeCards = filtered;
    updateSearchResultCount(filtered.length, database.length);
    renderCards(filtered);
}
function showCardDetail(title, text) {
    // Geriye dönük uyumluluk: showCardDetail(cardObj) çağrısını da destekle
    if (title && typeof title === 'object') {
        const c = title;
        const t = c.title || c.name || 'Detay';
        const body = (c.text || c.desc || '').toString();
        const script = (c.script || '').toString();
        const alertTxt = (c.alert || '').toString();
        const link = (c.link || '').toString();
        const html = `
          <div style="text-align:left; font-size:1rem; line-height:1.6; white-space:pre-line;">
            ${escapeHtml(body).replace(/\n/g, '<br>')}
            ${link ? `<div style="margin-top:12px"><a href="${escapeHtml(link)}" target="_blank" rel="noreferrer" style="font-weight:800;color:var(--info);text-decoration:none"><i class=\"fas fa-link\"></i> Link</a></div>` : ''}
            ${script ? `<div class="tech-script-box" style="margin-top:12px">
                <span class="tech-script-label">Müşteriye iletilecek:</span>${escapeHtml(script).replace(/\n/g, '<br>')}
              </div>` : ''}
            ${alertTxt ? `<div class="tech-alert" style="margin-top:12px">${escapeHtml(alertTxt).replace(/\n/g, '<br>')}</div>` : ''}
          </div>`;
        Swal.fire({ title: t, html, showCloseButton: true, showConfirmButton: false, width: '820px', background: '#f8f9fa' });
        return;
    }

    const safeText = (text ?? '').toString();
    // Image support (passed via different flow usually, but handle basic text case)
    Swal.fire({
        title: title,
        html: `<div style="text-align:left; font-size:1rem; line-height:1.6;">${escapeHtml(safeText).replace(/\n/g, '<br>')}</div>`,
        showCloseButton: true, showConfirmButton: false, width: '600px', background: '#f8f9fa'
    });
}

function showCardDetailByIndex(index) {
    const item = activeCards[index];
    if (!item) return;

    const t = item.title || 'Detay';
    const body = (item.text || '').toString();
    const script = (item.script || '').toString();
    const link = (item.link || '').toString();
    const processedImg = item.image ? escapeHtml(processImageUrl(item.image)) : '';

    const html = `
      <div style="text-align:left; font-size:1rem; line-height:1.6; white-space:pre-line;">
        ${processedImg ? `<div style="margin-bottom:15px;text-align:center;"><img src="${processedImg}" onerror="this.style.display='none'" style="max-width:100%;border-radius:8px;"></div>` : ''}
        ${escapeHtml(body)}
        ${link ? `<div style="margin-top:12px"><a href="${escapeHtml(link)}" target="_blank" rel="noreferrer" style="font-weight:800;color:var(--info);text-decoration:none"><i class="fas fa-link"></i> Link</a></div>` : ''}
        ${script ? `<div class="tech-script-box" style="margin-top:12px">
            <span class="tech-script-label">Müşteriye iletilecek:</span>${escapeHtml(script)}
          </div>` : ''}
      </div>`;

    Swal.fire({ title: escapeHtml(t), html, showCloseButton: true, showConfirmButton: false, width: '820px', background: '#f8f9fa' });
}

function toggleEditMode() {
    // Anti-Grafiti: localStorage üzerinden yapılan sahte adminlikleri burada frontend tarafında da durduruyoruz.
    // Gerçek adminlik kontrolü Supabase RLS tarafından zaten engellenmiş olsa da, UI'ı temiz tutar.
    if (!isAdminMode && !hasPerm("EditMode")) {
        Swal.fire('Yetki Yetersiz', 'Düzenleme modunu açma yetkiniz bulunmuyor.', 'error');
        return;
    }
    isEditingActive = !isEditingActive;
    document.body.classList.toggle('editing', isEditingActive);

    const btn = document.getElementById('dropdownQuickEdit');
    if (isEditingActive) {
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-times" style="color:var(--accent);"></i> Düzenlemeyi Kapat';
        Swal.fire({ icon: 'success', title: 'Düzenleme Modu AÇIK', text: 'Kalem ikonlarına tıklayarak içerikleri düzenleyebilirsiniz.', timer: 1500, showConfirmButton: false });
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-pen" style="color:var(--secondary);"></i> Düzenlemeyi Aç';
    }
    filterContent();
    try { if (currentCategory === 'home') renderHomePanels(); } catch (e) { }
    // Fullscreen alanlarını güncelle (eğer açıklarsa butonların gelmesi için)
    if (document.getElementById('quality-fullscreen').style.display === 'flex') openQualityArea();
    if (document.getElementById('shift-fullscreen').style.display === 'flex') openShiftArea();

    if (document.getElementById('guide-modal').style.display === 'flex') openGuide();
    if (document.getElementById('sales-modal').style.display === 'flex') openSales();
    if (document.getElementById('news-modal').style.display === 'flex') openNews();
}
async function sendUpdate(id, c, v, t = 'card') {
    if (!Swal.isVisible()) Swal.fire({ title: 'Kaydediliyor...', didOpen: () => { Swal.showLoading() } });

    try {
        const { error } = await sb
            .from('Data')
            .update({ [c]: v })
            .eq('id', id);

        if (error) throw error;

        Swal.fire({ icon: 'success', title: 'Başarılı', timer: 1500, showConfirmButton: false });
        setTimeout(loadContentData, 1600);
    } catch (err) {
        console.error("Update error:", err);
        Swal.fire('Hata', 'Kaydedilemedi: ' + err.message, 'error');
    }
}
// --- CRUD OPERASYONLARI (ADMIN) ---
async function addNewCardPopup() {
    const catSelectHTML = getCategorySelectHtml('Bilgi', 'swal-new-cat');
    const { value: formValues } = await Swal.fire({
        title: 'Yeni İçerik Ekle',
        html: `
        <div style="margin-bottom:15px; text-align:left;">
            <label style="font-weight:bold; font-size:0.9rem;">Ne Ekleyeceksin?</label>
            <select id="swal-type-select" class="swal2-input" style="width:100%; margin-top:5px; height:35px; font-size:0.9rem;" onchange="toggleAddFields()">
                <option value="card"> 📌  Bilgi Kartı</option>
                <option value="news"> 📢  Duyuru</option>
                <option value="sales"> 📞  Telesatış Scripti</option>
                <option value="sport"> 🏆  Spor İçeriği</option>
                <option value="quiz"> ❓  Quiz Sorusu</option>
            </select>
        </div>
        <div id="preview-card" class="card Bilgi" style="text-align:left; box-shadow:none; border:1px solid #e0e0e0; margin-top:10px;">
            <div class="card-header" style="align-items: center; gap: 10px;">
                <input id="swal-new-title" class="swal2-input" style="margin:0; height:40px; flex-grow:1; border:none; border-bottom:2px solid #eee; padding:0 5px; font-weight:bold; color:#0e1b42;" placeholder="Başlık Giriniz...">
                <div id="cat-container" style="width: 110px;">${catSelectHTML}</div>
            </div>
            <div class="card-content" style="margin-bottom:10px;">
                <textarea id="swal-new-text" class="swal2-textarea" style="margin:0; width:100%; box-sizing:border-box; border:none; resize:none; font-family:inherit; min-height:100px; padding:10px; background:#f9f9f9;" placeholder="İçerik metni..."></textarea>
            </div>
            <div id="script-container" class="script-box" style="padding:0; border:1px solid #f0e68c;">
                <textarea id="swal-new-script" class="swal2-textarea" style="margin:0; width:100%; box-sizing:border-box; border:none; background:transparent; font-style:italic; min-height:80px; font-size:0.9rem;" placeholder="Script metni (İsteğe bağlı)..."></textarea>
            </div>
            <div id="extra-container" class="card-actions" style="margin-top:15px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div style="position:relative;"><i class="fas fa-code" style="position:absolute; left:10px; top:10px; color:#aaa;"></i><input id="swal-new-code" class="swal2-input" style="margin:0; height:35px; font-size:0.85rem; padding-left:30px;" placeholder="Kod"></div>
                <div style="position:relative;"><i class="fas fa-link" style="position:absolute; left:10px; top:10px; color:#aaa;"></i><input id="swal-new-link" class="swal2-input" style="margin:0; height:35px; font-size:0.85rem; padding-left:30px;" placeholder="Link"></div>
            </div>
            <div id="sport-extra" style="display:none; padding:10px;">
                <label style="font-weight:bold;">Kısa Açıklama (Desc)</label><input id="swal-sport-tip" class="swal2-input" placeholder="Kısa İpucu/Tip">
                <label style="font-weight:bold;">Detaylı Metin (Detail)</label><input id="swal-sport-detail" class="swal2-input" placeholder="Detaylı Açıklama (Alt Metin)">
                <label style="font-weight:bold;">Okunuşu (Pronunciation)</label><input id="swal-sport-pron" class="swal2-input" placeholder="Okunuşu">
                <label style="font-weight:bold;">İkon Sınıfı (Icon)</label><input id="swal-sport-icon" class="swal2-input" placeholder="FontAwesome İkon Sınıfı (e.g., fa-futbol)">
            </div>
            <div id="news-extra" style="display:none; padding:10px;">
                <label style="font-weight:bold;">Duyuru Tipi</label><select id="swal-news-type" class="swal2-input"><option value="info">Bilgi</option><option value="update">Değişiklik</option><option value="fix">Çözüldü</option></select>
                <label style="font-weight:bold;">Durum</label><select id="swal-news-status" class="swal2-input"><option value="Aktif">Aktif</option><option value="Pasif">Pasif (Gizle)</option></select>
            </div>
            <div id="quiz-extra" style="display:none; padding:10px;">
                <label style="font-weight:bold;">Soru Metni (Text)</label><textarea id="swal-quiz-q" class="swal2-textarea" placeholder="Quiz sorusu..."></textarea>
                <label style="font-weight:bold;">Seçenekler (Virgülle Ayırın)</label><input id="swal-quiz-opts" class="swal2-input" placeholder="Örn: şık A,şık B,şık C,şık D">
                <label style="font-weight:bold;">Doğru Cevap İndeksi</label><input id="swal-quiz-ans" type="number" class="swal2-input" placeholder="0 (A), 1 (B), 2 (C) veya 3 (D)" min="0" max="3">
            </div>
        </div>`,
        width: '700px', showCancelButton: true, confirmButtonText: '<i class="fas fa-plus"></i> Ekle', cancelButtonText: 'İptal', focusConfirm: false,
        didOpen: () => {
            const selectEl = document.getElementById('swal-new-cat');
            const cardEl = document.getElementById('preview-card');
            selectEl.style.margin = "0"; selectEl.style.height = "30px"; selectEl.style.fontSize = "0.8rem"; selectEl.style.padding = "0 5px";
            selectEl.addEventListener('change', function () { cardEl.className = 'card ' + this.value; });

            window.toggleAddFields = function () {
                const type = document.getElementById('swal-type-select').value;
                const catCont = document.getElementById('cat-container');
                const scriptCont = document.getElementById('script-container');
                const extraCont = document.getElementById('extra-container');
                const sportExtra = document.getElementById('sport-extra');
                const newsExtra = document.getElementById('news-extra');
                const quizExtra = document.getElementById('quiz-extra');
                const cardPreview = document.getElementById('preview-card');

                catCont.style.display = 'none'; scriptCont.style.display = 'none'; extraCont.style.display = 'none';
                sportExtra.style.display = 'none'; newsExtra.style.display = 'none'; quizExtra.style.display = 'none';
                document.getElementById('swal-new-title').value = ''; document.getElementById('swal-new-text').value = '';
                cardPreview.style.borderLeft = "5px solid var(--info)"; cardPreview.className = 'card Bilgi';

                if (type === 'card') {
                    catCont.style.display = 'block'; scriptCont.style.display = 'block'; extraCont.style.display = 'grid';
                    cardPreview.className = 'card ' + document.getElementById('swal-new-cat').value;
                    document.getElementById('swal-new-title').placeholder = "Başlık Giriniz..."; document.getElementById('swal-new-text').placeholder = "İçerik metni...";
                } else if (type === 'sales') {
                    scriptCont.style.display = 'block';
                    document.getElementById('swal-new-script').placeholder = "Satış Metni...";
                    cardPreview.style.borderLeft = "5px solid var(--sales)";
                    document.getElementById('swal-new-title').placeholder = "Script Başlığı..."; document.getElementById('swal-new-text').placeholder = "Sadece buraya metin girilecek.";
                } else if (type === 'sport') {
                    sportExtra.style.display = 'block';
                    cardPreview.style.borderLeft = "5px solid var(--primary)";
                    document.getElementById('swal-new-title').placeholder = "Spor Terimi Başlığı..."; document.getElementById('swal-new-text').placeholder = "Kısa Açıklama (Desc)...";
                } else if (type === 'news') {
                    newsExtra.style.display = 'block';
                    cardPreview.style.borderLeft = "5px solid var(--secondary)";
                    document.getElementById('swal-new-title').placeholder = "Duyuru Başlığı..."; document.getElementById('swal-new-text').placeholder = "Duyuru Metni (Desc)...";
                } else if (type === 'quiz') {
                    quizExtra.style.display = 'block';
                    document.getElementById('swal-new-title').placeholder = "Quiz Başlığı (Örn: Soru 1)"; document.getElementById('swal-new-text').placeholder = "Bu alan boş bırakılacak.";
                    cardPreview.style.borderLeft = "5px solid var(--quiz)";
                }
            };
        },
        preConfirm: () => {
            const type = document.getElementById('swal-type-select').value;
            const today = new Date();
            const dateStr = today.getDate() + "." + (today.getMonth() + 1) + "." + today.getFullYear();
            const quizOpts = type === 'quiz' ? document.getElementById('swal-quiz-opts').value : '';
            const quizAns = type === 'quiz' ? document.getElementById('swal-quiz-ans').value : '';
            const quizQ = type === 'quiz' ? document.getElementById('swal-quiz-q').value : '';
            if (type === 'quiz' && (!quizQ || !quizOpts || quizAns === '')) { Swal.showValidationMessage('Quiz sorusu için tüm alanlar zorunludur.'); return false; }
            return {
                cardType: type,
                category: type === 'card' ? document.getElementById('swal-new-cat').value : (type === 'news' ? document.getElementById('swal-news-type').value : ''),
                title: document.getElementById('swal-new-title').value,
                text: type === 'quiz' ? quizQ : document.getElementById('swal-new-text').value,
                script: (type === 'card' || type === 'sales') ? document.getElementById('swal-new-script').value : '',
                code: type === 'card' ? document.getElementById('swal-new-code').value : '',
                status: type === 'news' ? document.getElementById('swal-news-status').value : '',
                link: type === 'card' ? document.getElementById('swal-new-link').value : '',
                tip: type === 'sport' ? document.getElementById('swal-sport-tip').value : '',
                detail: type === 'sport' ? document.getElementById('swal-sport-detail').value : '',
                pronunciation: type === 'sport' ? document.getElementById('swal-sport-pron').value : '',
                icon: type === 'sport' ? document.getElementById('swal-sport-icon').value : '',
                date: dateStr, quizOptions: quizOpts, quizAnswer: quizAns
            }
        }
    });
    if (formValues) {
        if (!formValues.title) { Swal.fire('Hata', 'Başlık zorunlu!', 'error'); return; }
        Swal.fire({ title: 'Ekleniyor...', didOpen: () => { Swal.showLoading() } });

        try {
            const d = await apiCall("logCard", {
                type: formValues.cardType,
                category: formValues.category,
                title: formValues.title,
                text: formValues.text,
                script: formValues.script,
                code: formValues.code,
                status: formValues.status,
                link: formValues.link,
                tip: formValues.tip,
                detail: formValues.detail,
                pronunciation: formValues.pronunciation,
                icon: formValues.icon,
                date: new Date(),
                quizOptions: formValues.quizOptions,
                quizAnswer: formValues.quizAnswer
            });

            if (d.result !== "success") throw new Error(d.message || "Eklenemedi");

            Swal.fire({ icon: 'success', title: 'Başarılı', text: 'İçerik eklendi.', timer: 2000, showConfirmButton: false });
            setTimeout(loadContentData, 3500);
        } catch (err) {
            console.error("Add content error:", err);
            Swal.fire('Hata', err.message || 'Eklenemedi.', 'error');
        }
    }
}
async function editContent(id) {
    const item = database.find(x => String(x.id) === String(id));
    if (!item) {
        Swal.fire('Hata', 'İçerik bulunamadı veya ID uyuşmuyor.', 'error');
        return;
    }
    const catSelectHTML = getCategorySelectHtml(item.category, 'swal-cat');
    const { value: formValues } = await Swal.fire({
        title: 'Kartı Düzenle',
        html: `
        <div id="preview-card-edit" class="card ${item.category}" style="text-align:left; box-shadow:none; border:1px solid #e0e0e0; margin-top:10px;">
            <div class="card-header" style="align-items: center; gap: 10px;">
                <input id="swal-title" class="swal2-input" style="margin:0; height:40px; flex-grow:1; border:none; border-bottom:2px solid #eee; padding:0 5px; font-weight:bold; color:#0e1b42;" value="${item.title}" placeholder="Başlık">
                <div style="width: 110px;">${catSelectHTML}</div>
            </div>
            <div class="card-content" style="margin-bottom:10px;">
                <textarea id="swal-text" class="swal2-textarea" style="margin:0; width:100%; box-sizing:border-box; border:none; resize:none; font-family:inherit; min-height:120px; padding:10px; background:#f9f9f9;" placeholder="İçerik metni...">${(item.text || '').toString().replace(/<br>/g, '\n')}</textarea>
            </div>
            <div class="script-box" style="padding:0; border:1px solid #f0e68c;">
                <textarea id="swal-script" class="swal2-textarea" style="margin:0; width:100%; box-sizing:border-box; border:none; background:transparent; font-style:italic; min-height:80px; font-size:0.9rem;" placeholder="Script metni...">${(item.script || '').toString().replace(/<br>/g, '\n')}</textarea>
            </div>
            <div class="card-actions" style="margin-top:15px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div style="position:relative;"><i class="fas fa-code" style="position:absolute; left:10px; top:10px; color:#aaa;"></i><input id="swal-code" class="swal2-input" style="margin:0; height:35px; font-size:0.85rem; padding-left:30px;" value="${item.code || ''}" placeholder="Kod"></div>
                <div style="position:relative;"><i class="fas fa-link" style="position:absolute; left:10px; top:10px; color:#aaa;"></i><input id="swal-link" class="swal2-input" style="margin:0; height:35px; font-size:0.85rem; padding-left:30px;" value="${item.link || ''}" placeholder="Link"></div>
                <div style="position:relative;grid-column: 1 / -1;"><i class="fas fa-image" style="position:absolute; left:10px; top:10px; color:#aaa;"></i><input id="swal-image" class="swal2-input" style="margin:0; height:35px; font-size:0.85rem; padding-left:30px; width: 100%; box-sizing: border-box;" value="${item.image || ''}" placeholder="Görsel Linki (Drive vb.)"></div>
            </div>
        </div>`,
        width: '700px', showCancelButton: true, confirmButtonText: '<i class="fas fa-save"></i> Kaydet', cancelButtonText: 'İptal', focusConfirm: false,
        didOpen: () => {
            const selectEl = document.getElementById('swal-cat');
            const cardEl = document.getElementById('preview-card-edit');
            selectEl.style.margin = "0"; selectEl.style.height = "30px"; selectEl.style.fontSize = "0.8rem"; selectEl.style.padding = "0 5px";
            selectEl.addEventListener('change', function () { cardEl.className = 'card ' + this.value; });
        },
        preConfirm: () => {
            return {
                cat: document.getElementById('swal-cat').value,
                title: document.getElementById('swal-title').value,
                text: document.getElementById('swal-text').value,
                script: document.getElementById('swal-script').value,
                code: document.getElementById('swal-code').value,
                link: document.getElementById('swal-link').value,
                image: document.getElementById('swal-image').value
            }
        }
    });
    if (formValues) {
        if (formValues.cat !== item.category) sendUpdate(item.id, "Category", formValues.cat, 'card');
        if (formValues.text !== (item.text || '').replace(/<br>/g, '\n')) setTimeout(() => sendUpdate(item.id, "Text", formValues.text, 'card'), 500);
        if (formValues.script !== (item.script || '').replace(/<br>/g, '\n')) setTimeout(() => sendUpdate(item.id, "Script", formValues.script, 'card'), 1000);
        if (formValues.code !== (item.code || '')) setTimeout(() => sendUpdate(item.id, "Code", formValues.code, 'card'), 1500);
        if (formValues.link !== (item.link || '')) setTimeout(() => sendUpdate(item.id, "Link", formValues.link, 'card'), 2000);
        if (formValues.image !== (item.image || '')) setTimeout(() => sendUpdate(item.id, "Image", formValues.image, 'card'), 2250);
        if (formValues.title !== item.title) setTimeout(() => sendUpdate(item.id, "Title", formValues.title, 'card'), 2500);
    }
}
async function editSport(id) {
    if (typeof event !== 'undefined' && event) event.stopPropagation();
    const s = sportsData.find(x => String(x.id) === String(id));
    if (!s) return Swal.fire('Hata', 'Spor içeriği bulunamadı.', 'error');
    const { value: formValues } = await Swal.fire({
        title: 'Spor İçeriğini Düzenle',
        html: `
        <div class="card" style="text-align:left; border-left: 5px solid var(--primary); padding:15px; background:#f8f9fa;">
            <label style="font-weight:bold;">Başlık</label><input id="swal-title" class="swal2-input" style="width:100%; margin-bottom:10px;" value="${s.title}">
            <label style="font-weight:bold;">Açıklama (Kısa)</label><textarea id="swal-desc" class="swal2-textarea" style="margin-bottom:10px;">${s.desc || ''}</textarea>
            <label style="font-weight:bold;">İpucu (Tip)</label><input id="swal-tip" class="swal2-input" style="width:100%; margin-bottom:10px;" value="${s.tip || ''}">
            <label style="font-weight:bold;">Detay (Alt Metin)</label><textarea id="swal-detail" class="swal2-textarea" style="margin-bottom:10px;">${s.detail || ''}</textarea>
            <label style="font-weight:bold;">Okunuşu</label><input id="swal-pron" class="swal2-input" style="width:100%; margin-bottom:10px;" value="${s.pronunciation || ''}">
            <label style="font-weight:bold;">İkon Sınıfı</label><input id="swal-icon" class="swal2-input" style="width:100%;" value="${s.icon || ''}">
        </div>`,
        width: '700px', showCancelButton: true, confirmButtonText: 'Kaydet',
        preConfirm: () => [
            document.getElementById('swal-title').value, document.getElementById('swal-desc').value, document.getElementById('swal-tip').value,
            document.getElementById('swal-detail').value, document.getElementById('swal-pron').value, document.getElementById('swal-icon').value
        ]
    });
    if (formValues) {
        if (formValues[1] !== (s.desc || '')) sendUpdate(s.id, "Text", formValues[1], 'sport');
        if (formValues[2] !== (s.tip || '')) setTimeout(() => sendUpdate(s.id, "Tip", formValues[2], 'sport'), 500);
        if (formValues[3] !== (s.detail || '')) setTimeout(() => sendUpdate(s.id, "Detail", formValues[3], 'sport'), 1000);
        if (formValues[4] !== (s.pronunciation || '')) setTimeout(() => sendUpdate(s.id, "Pronunciation", formValues[4], 'sport'), 1500);
        if (formValues[5] !== (s.icon || '')) setTimeout(() => sendUpdate(s.id, "Icon", formValues[5], 'sport'), 2000);
        if (formValues[0] !== s.title) setTimeout(() => sendUpdate(s.id, "Title", formValues[0], 'sport'), 2500);
    }
}
async function editSales(id) {
    if (typeof event !== 'undefined' && event) event.stopPropagation();
    const s = salesScripts.find(x => String(x.id) === String(id));
    if (!s) return Swal.fire('Hata', 'Satış scripti bulunamadı.', 'error');
    const { value: formValues } = await Swal.fire({
        title: 'Satış Metnini Düzenle',
        html: `<div class="card" style="text-align:left; border-left: 5px solid var(--sales); padding:15px; background:#ecfdf5;"><label style="font-weight:bold;">Başlık</label><input id="swal-title" class="swal2-input" style="width:100%; margin-bottom:10px;"
        value="${s.title}"><label style="font-weight:bold;">Metin</label><textarea id="swal-text" class="swal2-textarea" style="min-height:150px;">${s.text || ''}</textarea></div>`,
        width: '700px', showCancelButton: true, confirmButtonText: 'Kaydet',
        preConfirm: () => [document.getElementById('swal-title').value, document.getElementById('swal-text').value]
    });
    if (formValues) {
        if (formValues[1] !== s.text) sendUpdate(s.id, "Text", formValues[1], 'sales');
        if (formValues[0] !== s.title) setTimeout(() => sendUpdate(s.id, "Title", formValues[0], 'sales'), 500);
    }
}
async function getDistinctGroups() {
    let distinct = [];
    try {
        const { data, error } = await sb.from('profiles').select('group_name');
        if (!error && data) {
            data.forEach(u => {
                const g = (u.group_name || '').trim();
                if (g && !distinct.some(x => x.toLowerCase() === g.toLowerCase())) {
                    distinct.push(g);
                }
            });
        }
    } catch (e) { }
    return [...new Set(distinct.map(g => g.charAt(0).toUpperCase() + g.slice(1).toLowerCase()))].sort();
}

async function editNews(id) {
    const i = newsData.find(x => String(x.id) === String(id));
    if (!i) {
        console.error("[Pusula] Duyuru bulunamadı (ID uyuşmazlığı):", id);
        Swal.fire('Hata', 'Duyuru verisi bulunamadı (index/ID uyuşmazlığı).', 'error');
        return;
    }
    let statusOptions = `<option value="Aktif" ${i.status !== 'Pasif' ? 'selected' : ''}>Aktif</option><option value="Pasif" ${i.status === 'Pasif' ? 'selected' : ''}>Pasif</option>`;
    let typeOptions = `<option value="info" ${i.type === 'info' ? 'selected' : ''}>Bilgi</option><option value="update" ${i.type === 'update' ? 'selected' : ''}>Değişiklik</option><option value="fix" ${i.type === 'fix' ? 'selected' : ''}>Çözüldü</option>`;
    let mandatoryChecked = i.isMandatory ? 'checked' : '';

    const availableGroups = await getDistinctGroups();

    const { value: formValues, isDenied } = await Swal.fire({
        title: 'Duyuruyu Düzenle',
        html: `<div class="card" style="text-align:left; border-left: 5px solid var(--secondary); padding:15px; background:#fff8e1;">
            <label style="font-weight:bold;">Başlık</label><input id="swal-title" class="swal2-input" style="width:100%; margin-bottom:10px;" value="${i.title || ''}">
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <div style="flex:1;"><label style="font-weight:bold;">Tarih</label><input id="swal-date" class="swal2-input" style="width:100%;" value="${i.date || ''}"></div>
                <div style="flex:1;"><label style="font-weight:bold;">Tür</label><select id="swal-type" class="swal2-input" style="width:100%;">${typeOptions}</select></div>
            </div>
            <label style="font-weight:bold;">Metin</label><textarea id="swal-desc" class="swal2-textarea" style="margin-bottom:10px; height:100px;">${i.desc || ''}</textarea>
            <label style="font-weight:bold;">Görsel Linki</label><input id="swal-image" class="swal2-input" style="width:100%; margin-bottom:10px;" value="${i.image || ''}" placeholder="Görsel URL">
            <div style="background:#f1f5f9; padding:10px; border-radius:8px; margin-top:10px; border:1px dashed #cbd5e1;">
                <label style="font-weight:bold; display:flex; align-items:center; cursor:pointer;"><input type="checkbox" id="swal-mandatory" style="width:20px; height:20px; margin-right:10px;" ${mandatoryChecked}> Girişte Zorunlu Popup Olsun?</label>
                <div style="display:flex; align-items:center; gap:10px; margin:10px 0 10px 30px;">
                    <label style="font-size:0.8rem; font-weight:bold;">Kapanma Süresi (Sn):</label>
                    <input type="number" id="swal-timer" class="swal2-input" style="width:80px; height:35px; margin:0;" value="${i.popupTimer || 30}">
                </div>
                <p style="font-size:0.75rem; color:#64748b; margin:5px 0 10px 30px;">Temsilci ilk girdiğinde karşısına ana ekran kaplayan popup çıkar.</p>
                <label style="font-weight:bold; margin-left:30px;">Hedef Gruplar (Seçiniz, boşsa HERKES)</label>
                <div id="swal-group-chips" style="margin-left:30px; margin-top:10px; display:flex; flex-wrap:wrap; gap:8px;"></div>
                <input type="hidden" id="swal-groups" value="${i.targetGroups || ''}">
            </div>
            <label style="font-weight:bold; margin-top:10px; display:block;">Durum</label><select id="swal-status" class="swal2-input" style="width:100%;">${statusOptions}</select>
        </div>`,
        width: '650px', showCancelButton: true, confirmButtonText: 'Kaydet',
        showDenyButton: true,
        denyButtonText: 'Duyuruyu Sil',
        denyButtonColor: '#d33',
        didOpen: () => {
            const chipContainer = document.getElementById('swal-group-chips');
            const groupsInput = document.getElementById('swal-groups');
            let selected = (groupsInput.value || '').split(',').map(s => s.trim()).filter(Boolean);

            availableGroups.forEach(g => {
                const chip = document.createElement('span');
                chip.innerText = g;
                const isSelected = selected.some(s => s.toLowerCase() === g.toLowerCase());
                chip.style.cssText = `padding:4px 12px; border:1px solid #e2e8f0; border-radius:20px; font-size:0.75rem; font-weight:600; cursor:pointer; transition:all 0.2s; user-select:none; ${isSelected ? 'background:#0e1b42; color:white; border-color:#0e1b42;' : 'background:#fff; color:#475569;'}`;

                chip.onclick = () => {
                    const idx = selected.findIndex(s => s.toLowerCase() === g.toLowerCase());
                    if (idx > -1) {
                        selected.splice(idx, 1);
                        chip.style.background = "#fff"; chip.style.color = "#475569"; chip.style.borderColor = "#e2e8f0";
                    } else {
                        selected.push(g);
                        chip.style.background = "#0e1b42"; chip.style.color = "white"; chip.style.borderColor = "#0e1b42";
                    }
                    groupsInput.value = selected.join(', ');
                };
                chipContainer.appendChild(chip);
            });
        },
        preConfirm: () => ({
            title: document.getElementById('swal-title').value,
            date: document.getElementById('swal-date').value,
            desc: document.getElementById('swal-desc').value,
            type: document.getElementById('swal-type').value,
            status: document.getElementById('swal-status').value,
            image: document.getElementById('swal-image').value,
            isMandatory: document.getElementById('swal-mandatory').checked,
            targetGroups: document.getElementById('swal-groups').value,
            popupTimer: parseInt(document.getElementById('swal-timer').value) || 30
        })
    });

    if (isDenied) {
        const confirmDelete = await Swal.fire({
            title: 'Emin misiniz?',
            text: `"${i.title}" duyurusu tamamen silinecek!`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Evet, Sil!',
            cancelButtonText: 'İptal'
        });

        if (confirmDelete.isConfirmed) {
            Swal.fire({ title: 'Siliniyor...', didOpen: () => Swal.showLoading() });
            const res = await apiCall("deleteCard", { id: i.id });
            if (res.result === "success") {
                Swal.fire('Silindi!', 'Duyuru başarıyla kaldırıldı.', 'success');
                await loadContentData();
            } else {
                Swal.fire('Hata', res.message || 'Silinemedi.', 'error');
            }
        }
        return;
    }

    if (formValues) {
        if (formValues.date !== i.date) sendUpdate(i.id, "Date", formValues.date, 'news');
        if (formValues.desc !== i.desc) setTimeout(() => sendUpdate(i.id, "Text", formValues.desc, 'news'), 500);
        if (formValues.type !== i.type) setTimeout(() => sendUpdate(i.id, "Category", formValues.type, 'news'), 1000);
        if (formValues.status !== i.status) setTimeout(() => sendUpdate(i.id, "Status", formValues.status, 'news'), 1500);
        if (formValues.image !== (i.image || '')) setTimeout(() => sendUpdate(i.id, "Image", formValues.image, 'news'), 1750);
        if (formValues.title !== i.title) setTimeout(() => sendUpdate(i.id, "Title", formValues.title, 'news'), 2000);
        setTimeout(() => sendUpdate(i.id, "IsMandatory", formValues.isMandatory, 'news'), 2250);
        setTimeout(() => sendUpdate(i.id, "TargetGroups", formValues.targetGroups, 'news'), 2500);
        setTimeout(() => sendUpdate(i.id, "PopupTimer", formValues.popupTimer, 'news'), 2750);
    }
}
// --- STANDARD MODALS (TICKER, NEWS, GUIDE, SALES) ---
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function startTicker() {
    const t = document.getElementById('ticker-content');
    if (!t) return;
    const activeNews = (newsData || []).filter(i => i.status !== 'Pasif');
    if (activeNews.length === 0) {
        t.innerHTML = "Güncel duyuru yok.";
        t.style.animation = 'none';
        return;
    }

    const tickerHtml = activeNews.map(i => {
        const dateStr = i.date ? `[${i.date}] ` : '';
        const titleStr = i.title || '';
        // Satır sonlarını boşluk yap ve metni biraz sınırla (opsiyonel)
        const descStr = (i.desc || '').replace(/\r?\n/g, ' ').trim();

        return `<span class="ticker-item">
                    <span class="ticker-date">${escapeHtml(dateStr)}</span>
                    <span class="ticker-title" style="font-weight:700; color:#fff;">${escapeHtml(titleStr)}</span>
                    ${descStr ? `<span style="color:rgba(255,255,255,0.6); margin:0 5px;">»</span><span class="ticker-desc" style="color:rgba(255,255,255,0.8);">${escapeHtml(descStr)}</span>` : ''}
                </span>`;
    }).join(' \u00A0\u00A0\u00A0 | \u00A0\u00A0\u00A0 ');

    t.innerHTML = tickerHtml + ' \u00A0\u00A0\u00A0\u00A0 • \u00A0\u00A0\u00A0\u00A0 ' + tickerHtml;

    const charCount = t.innerText.length;
    let duration = Math.max(30, Math.round(charCount / 6));
    t.style.animation = `ticker-scroll ${duration}s linear infinite`;
}
function openNews() {
    document.getElementById('news-modal').style.display = 'flex';
    const c = document.getElementById('news-container');
    const header = document.querySelector('#news-modal .modal-header h2');
    if (header && isAdminMode && !document.getElementById('btn-add-news')) {
        const btn = document.createElement('button');
        btn.id = 'btn-add-news';
        btn.innerHTML = '<i class="fas fa-plus"></i> Duyuru Ekle';
        btn.className = 'x-btn-admin';
        btn.style.marginLeft = '20px';
        btn.style.fontSize = '0.8rem';
        btn.onclick = () => addNewContent('news');
        header.parentElement.appendChild(btn);
    }
    c.innerHTML = '';
    newsData.forEach((i, index) => {
        let cl = i.type === 'fix' ? 'tag-fix' : (i.type === 'update' ? 'tag-update' : 'tag-info');
        let tx = i.type === 'fix' ? 'Çözüldü' : (i.type === 'update' ? 'Değişiklik' : 'Bilgi');
        const item = document.createElement('div');
        item.className = 'news-item';
        if (i.isPassive) item.style.opacity = '0.6';

        let html = '';
        if (isEditingActive) html += `<button class="home-edit" onclick="editNews('${i.id}')"><i class="fas fa-pen"></i></button>`;
        html += `<span class="news-date">${i.date}</span>`;
        html += `<span class="news-title">${i.title} ${i.isPassive ? '(Pasif)' : ''}</span>`;
        if (i.image) html += `<img src="${i.image}" class="news-img" style="max-width:100%; border-radius:8px; margin:10px 0;">`;
        html += `<div class="news-desc" style="white-space: pre-line"></div>`;
        html += `<span class="news-tag ${cl}">${tx}</span>`;

        item.innerHTML = html;
        // Açıklama metnini literal (textContent) olarak basarak XSS'i önle
        item.querySelector('.news-desc').textContent = i.desc;
        c.appendChild(item);
    });
}


// =========================
// ✅ Yayın Akışı (E-Tablo'dan)
// =========================
// =========================
// ✅ Veri İçe Aktarma (Excel/Paste Importer)
// =========================
async function openDataImporter(targetTable) {
    if (!isAdminMode && !isLocAdmin) return;
    let title = targetTable === 'Vardiya' ? 'Vardiya Yükle' : 'Yayın Akışı Yükle';
    let helpText = targetTable === 'Vardiya'
        ? 'Sırasıyla şu sütunları kopyalayın: Temsilci, Pazartesi, Salı, Çarşamba, Perşembe, Cuma, Cumartesi, Pazar'
        : 'Excelden (Event/Match, Time, DateISO, Channel, Announcer, Details) sütunlarını kopyalayıp yapıştırın.';
    const { value: pasteData } = await Swal.fire({
        title: title,
        html: `<div style="text-align:left; font-size:0.85rem; color:#666; margin-bottom:10px;">${helpText}</div>
               <textarea id="swal-paste-area" class="swal2-textarea" style="height:200px; font-family:monospace; font-size:0.75rem;" placeholder="Verileri buraya yapıştırın..."></textarea>`,
        width: '800px', showCancelButton: true, confirmButtonText: 'Devam Et',
        preConfirm: () => document.getElementById('swal-paste-area').value
    });
    if (!pasteData) return;
    const lines = pasteData.trim().split('\n').filter(l => l.trim()).map(l => l.split('\t'));
    if (lines.length === 0) return;
    let items = [];
    if (targetTable === 'Vardiya') {
        const dayHeaders = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
        items = lines.filter(cols => {
            const firstCol = String(cols[0] || '').toUpperCase().trim();
            return firstCol !== 'TEMSİLCİ' && firstCol !== 'TEMSILCI' && firstCol !== 'ID' && firstCol !== '';
        }).map((cols, i) => {
            const obj = { Temsilci: (cols[0] || '').trim(), 'İd': Date.now() + i };
            dayHeaders.forEach((h, j) => { obj[h] = (cols[j + 1] || '').trim(); });
            return obj;
        });
    } else {
        // YayinAkisi - User Excel: 0:Date, 1:Event, 2:Time, 3:Details, 4:Announcer
        items = lines.filter(cols => {
            const firstCol = String(cols[0] || '').toUpperCase();
            return firstCol !== 'DATE' && firstCol !== 'TARİH' && firstCol !== '';
        }).map(cols => {
            let dateStr = (cols[0] || '').trim();
            if (dateStr.includes('.')) {
                const parts = dateStr.split('.');
                if (parts.length === 3) {
                    const d = parts[0].padStart(2, '0');
                    const m = parts[1].padStart(2, '0');
                    const y = parts[2];
                    dateStr = `${y}-${m}-${d}`;
                }
            }
            const timeStr = (cols[2] || '').trim().slice(0, 8); // TSI usually HH:MM:SS or HH:MM
            let epoch = 0;
            if (dateStr && timeStr) {
                try { epoch = new Date(dateStr + 'T' + timeStr).getTime(); } catch (e) { }
            }
            // Supabase exact column names mapping
            return {
                "DATE": dateStr,
                "EVENT NAME - Turkish": (cols[1] || '').trim(),
                "START_TIME_TSI": timeStr,
                "ANNOUNCER": (cols[4] || '').trim(),
                "details": (cols[3] || '').trim()
            };
        });
    }
    const previewHtml = `<div style="max-height:300px; overflow:auto;"><table class="shift-table" style="font-size:0.7rem;">
        <thead><tr>${Object.keys(items[0]).map(k => `<th>${k}</th>`).join('')}</tr></thead>
        <tbody>${items.slice(0, 5).map(row => `<tr>${Object.values(row).map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
        <p style="margin-top:15px; font-weight:bold; color:#0e1b42;">${items.length} satır hazırlandı. Nasıl yüklemek istersiniz?</p>`;

    const { value: mode } = await Swal.fire({
        title: 'Veri Yükleme Onayı',
        html: previewHtml,
        width: '950px',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '<i class="fas fa-trash-alt"></i> Sil ve Yeniden Yükle',
        denyButtonText: '<i class="fas fa-plus"></i> Mevcutlara Ekle',
        cancelButtonText: 'Vazgeç',
        confirmButtonColor: '#cf0a2c',
        denyButtonColor: '#2e7d32'
    });

    if (mode || (mode === false && Swal.getDenyButton())) { // confirm=true (mode is true), deny=false (mode is false but Deny was clicked)
        const uploadMode = (mode === true) ? 'overwrite' : 'append';
        if (mode === undefined) return; // Cancelled

        Swal.fire({ title: 'Yükleniyor...', didOpen: () => Swal.showLoading() });
        const res = await apiCall(targetTable === 'Vardiya' ? 'updateShiftData' : 'updateBroadcastFlow', {
            [targetTable === 'Vardiya' ? 'shifts' : 'items']: items,
            mode: uploadMode
        });

        if (res.result === 'success') {
            Swal.fire('Başarılı', `${items.length} kayıt ${uploadMode === 'append' ? 'eklendi' : 'yenilendi'}.`, 'success');
            if (targetTable === 'Vardiya') loadShiftData(); else openBroadcastFlow();
        } else {
            Swal.fire('Hata', res.message, 'error');
        }
    }
}

async function fetchBroadcastFlow() {
    try {
        const res = await apiCall('getBroadcastFlow');
        if (res.result === 'success') {
            // we return the items directly, but we can store the source if needed
            // since normalizeKeys was already called in app.js, we just return
            return res.items || [];
        }
        return [];
    } catch (err) {
        console.error("[Pusula] fetchBroadcastFlow Error:", err);
        return [];
    }
}

async function openBroadcastFlow() {
    Swal.fire({
        title: "Yayın Akışı",
        html: '<div style="padding: 40px; text-align: center; background:#fff;"><i class="fas fa-circle-notch fa-spin fa-3x" style="color:#0e1b42"></i><p style="margin-top:15px; font-weight:600; color:#555;">Veriler hazırlanıyor...</p></div>',
        showConfirmButton: false,
        width: 1100,
        padding: '0',
        background: '#fff',
        showCloseButton: true
    });

    try {
        const itemsRawResult = await apiCall('getBroadcastFlow');
        const itemsRaw = itemsRawResult.items || [];
        const sourceName = itemsRawResult.source || 'db';
        const isAdmin = (isAdminMode || isLocAdmin);

        if ((!itemsRaw || !itemsRaw.length) && !isAdmin) {
            Swal.fire("Yayın Akışı", "Yakında yayınlanacak içerik bulunamadı.", "info");
            return;
        }

        // Boş veri ama admin ise devam et, yoksa patlamasın
        const safeItemsRaw = itemsRaw || [];
        const items = [...safeItemsRaw].sort((a, b) => {
            const dtA = (a.dateISO || '') + 'T' + (a.time || '00:00');
            const dtB = (b.dateISO || '') + 'T' + (b.time || '00:00');
            return dtA.localeCompare(dtB);
        });

        const now = new Date();
        const todayISO = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        const currentTime = now.getTime();

        const byDate = {};
        items.forEach(it => {
            let key = it.dateISO || (it.date ? it.date.split('.').reverse().join('-') : 'Unknown');
            if (!byDate[key]) byDate[key] = [];
            byDate[key].push(it);
        });

        const sortedDates = Object.keys(byDate).sort();

        const formatDateLabel = (iso) => {
            if (iso === "2099-12-31") return { main: "BİLGİ", sub: "Notlar" };
            const dt = new Date(iso);
            if (iso === todayISO) return { main: "BUGÜN", sub: dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) };
            const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowISO = new Date(tomorrow.getTime() - (tomorrow.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            if (iso === tomorrowISO) return { main: "YARIN", sub: dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) };
            return { main: dt.toLocaleDateString('tr-TR', { weekday: 'short' }).toUpperCase(), sub: dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) };
        };

        const getSportIcon = (title) => {
            const t = String(title).toLowerCase();
            if (t.includes('nba') || t.includes('euroleague') || t.includes('basketbol') || t.includes('basketball') || t.includes('efes') || t.includes('fenerbahçe beko')) return 'fa-basketball-ball';
            if (t.includes('atp') || t.includes('wta') || t.includes('tenis')) return 'fa-table-tennis';
            if (t.includes('f1') || t.includes('formula')) return 'fa-flag-checkered';
            if (t.includes('moto') || t.includes('sbk') || t.includes('ssp') || t.includes('superbike') || t.includes('supersport')) return 'fa-motorcycle';
            if (t.includes('ufc') || t.includes('boks') || t.includes('boxing') || t.includes('fight') || t.includes('dövüş') || t.includes('mma') || t.includes('one championship')) return 'fa-hand-fist';
            if (t.includes('nfl') || t.includes('amerikan futbol')) return 'fa-football-ball';
            return 'fa-futbol'; // Default
        };

        const css = `
        <style>
            .bf-wrapper { font-family: 'Outfit', sans-serif; height: 90vh; display: flex; flex-direction: column; overflow: hidden; background: #fdfdfd; }
            .bf-header { background: #0e1b42; color: white; padding: 25px 30px; display: flex; justify-content: space-between; align-items: center; position: relative; }
            .bf-header::after { content: ''; position: absolute; bottom: 0; left: 0; width: 100%; height: 4px; background: linear-gradient(90deg, #cf0a2c, transparent); }
            .bf-header-title { font-size: 1.5rem; font-weight: 800; display: flex; align-items: center; gap: 10px; }
            
            .bf-tabs-nav { background: #fff; border-bottom: 1px solid #eee; display: flex; align-items: center; padding: 0 10px; position: relative; }
            .bf-tabs-scroll { overflow-x: auto; display: flex; gap: 5px; scroll-behavior: smooth; flex: 1; -ms-overflow-style: none; scrollbar-width: none; border-left: 1px solid #eee; border-right: 1px solid #eee; }
            .bf-tabs-scroll::-webkit-scrollbar { display: none; }
            
            .bf-tab { padding: 15px 20px; cursor: pointer; display: flex; flex-direction: column; align-items: center; min-width: 100px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border-bottom: 4px solid transparent; }
            .bf-tab-main { font-weight: 800; font-size: 0.85rem; color: #666; }
            .bf-tab-sub { font-size: 0.7rem; color: #999; margin-top: 2px; }
            .bf-tab:hover { background: #f9f9f9; }
            .bf-tab.active { border-bottom-color: #cf0a2c; background: rgba(207, 10, 44, 0.03); opacity: 1; }
            .bf-tab.active .bf-tab-main { color: #cf0a2c; }
            .bf-tab.active .bf-tab-sub { color: #cf0a2c; opacity: 0.7; }

            .bf-content-area { flex: 1; overflow-y: auto; padding: 10px 0; background: #fff; scroll-behavior: smooth; }
            .bf-day-pane { display: none; animation: bf-fade 0.3s ease; }
            .bf-day-pane.active { display: block; }
            
            @keyframes bf-fade { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

            .bf-event-row { display: flex; align-items: center; padding: 18px 30px; border-bottom: 1px solid #f3f4f6; transition: background 0.2s; position: relative; cursor: default; }
            .bf-event-row:hover { background: #f9fafb; }
            .bf-event-row.live { background: #fffafa; border-left: 5px solid #cf0a2c; }
            .bf-event-row.past { opacity: 0.5; }

            .bf-col-status { width: 50px; display: flex; justify-content: center; }
            .bf-sport-icon { font-size: 1.3rem; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); animation: bf-icon-float 3s ease-in-out infinite; }
            .bf-event-row:hover .bf-sport-icon { transform: scale(1.3) rotate(15deg); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1)); }
            
            /* Sport Specific Colors - Vivid Version */
            .fa-basketball-ball { color: #f59e0b; filter: drop-shadow(0 0 2px rgba(245, 158, 11, 0.2)); } /* Basketbol */
            .fa-table-tennis { color: #4ade80; filter: drop-shadow(0 0 2px rgba(74, 222, 128, 0.2)); }    /* Tenis */
            .fa-flag-checkered { color: #475569; }                                                         /* F1 */
            .fa-motorcycle { color: #e11d48; filter: drop-shadow(0 0 2px rgba(225, 29, 72, 0.2)); }       /* Motor - Canlı Kırmızı */
            .fa-hand-fist { color: #9333ea; filter: drop-shadow(0 0 2px rgba(147, 51, 234, 0.2)); }       /* Dövüş - Mor */
            .fa-football-ball { color: #92400e; }                                                         /* NFL */
            .fa-futbol { color: #0284c7; filter: drop-shadow(0 0 2px rgba(2, 132, 199, 0.2)); }           /* Futbol - Canlı Mavi */
            
            .live .bf-sport-icon { animation: pulse-icon 1s infinite alternate; }
            
            @keyframes bf-icon-float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-3px); }
            }
            
            .bf-col-time { width: 85px; font-weight: 800; color: #0e1b42; font-size: 1.1rem; }
            .past .bf-col-time { color: #999; text-decoration: line-through; }
            
            .bf-col-main { flex: 1; padding: 0 20px; }
            .bf-title { font-weight: 700; color: #1f2937; font-size: 1.05rem; line-height: 1.3; }
            .bf-sub { font-size: 0.85rem; color: #6b7280; margin-top: 4px; font-weight: 500; }
            
            .bf-col-spiker { width: 270px; display: flex; align-items: center; justify-content: flex-end; padding-right: 15px; }
            .bf-spiker-badge { background: #f8fafc; color: #475569; font-size: 0.72rem; font-weight: 700; padding: 6px 12px; border-radius: 8px; display: flex; align-items: center; gap: 8px; max-width: 100%; border: 1px solid #e2e8f0; line-height: 1.2; text-align: right; }
            .bf-spiker-badge i { font-size: 0.8rem; color: #94a3b8; }
            
            .bf-col-channel { width: 140px; display: flex; justify-content: flex-end; }
            .bf-ch-logo { max-height: 24px; filter: contrast(1.1); }
            .bf-ch-tag { background: #0e1b42; color: white; font-size: 0.7rem; font-weight: 800; padding: 4px 10px; border-radius: 4px; }
            
            .live-tag { background: #cf0a2c; color: white; font-size: 0.65rem; font-weight: 900; padding: 2px 6px; border-radius: 3px; position: absolute; top: 10px; right: 30px; letter-spacing: 0.5px; animation: flash 1.5s infinite; }
            
            @keyframes pulse-icon { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
            @keyframes flash { 0% { opacity: 1; } 50% { opacity: 0.7; } 100% { opacity: 1; } }
            
            .bf-nav-btn { background: none; border: none; padding: 15px 10px; cursor: pointer; color: #ccc; transition: color 0.2s; }
            .bf-nav-btn:hover { color: #0e1b42; }
            
            .bf-no-data { text-align: center; padding: 50px; color: #999; }
            
            .bf-event-row.cancelled .bf-col-time { color: #ccc; }

            .bf-search-container { background: #fff; padding: 15px 30px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 15px; flex-wrap: wrap; }
            .bf-search-box { position: relative; max-content: 400px; width: 350px; margin-right: 35px; }
            .bf-search-box i { position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: #999; font-size: 0.9rem; }
            .bf-search-input { width: 100%; padding: 8px 15px 8px 35px; border: 1px solid #e5e7eb; border-radius: 10px; font-size: 0.85rem; background: #f9fafb; transition: all 0.2s; outline: none; }
            .bf-search-input:focus { border-color: #0e1b42; background: #fff; box-shadow: 0 0 0 4px rgba(14, 27, 66, 0.05); }
            
            .bf-category-filters { display: flex; gap: 8px; flex-wrap: wrap; }
            .bf-cat-btn { padding: 8px 14px; border-radius: 10px; border: 1px solid #e5e7eb; background: #fff; color: #4b5563; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
            .bf-cat-btn:hover { background: #f9fafb; border-color: #cbd5e1; transform: translateY(-1px); }
            .bf-cat-btn.active { background: #0e1b42; color: white; border-color: #0e1b42; box-shadow: 0 4px 12px rgba(14, 27, 66, 0.2); }
            
            .bf-search-stats { font-size: 0.75rem; color: #6b7280; font-weight: 600; white-space: nowrap; margin-left: auto; }
            
            .bf-search-results-pane { display: none; padding-bottom: 30px; }
            .bf-search-results-pane.active { display: block; }
            .bf-search-day-header { padding: 12px 30px; background: #f1f5f9; font-size: 0.72rem; font-weight: 800; color: #475569; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; letter-spacing: 1px; }

            .bf-clock { background: rgba(255,255,255,0.1); padding: 6px 15px; border-radius: 50px; border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(5px); font-variant-numeric: tabular-nums; font-weight: 700; font-size: 0.95rem; color: #fff; display: flex; align-items: center; gap: 8px; box-shadow: inset 0 0 10px rgba(0,0,0,0.1); }
            .bf-clock i { color: #facc15; font-size: 0.8rem; }
            
            /* Glassmorphism & Neon Row */
            .bf-event-row { backdrop-filter: blur(10px); background: rgba(255, 255, 255, 0.5); }
            .bf-event-row:nth-child(even) { background: rgba(248, 250, 252, 0.5); }
            .live.bf-event-row { 
                background: rgba(207, 10, 44, 0.04) !important; 
                box-shadow: inset 0 0 20px rgba(207, 10, 44, 0.05);
            }
            .live.bf-event-row::before {
                content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
                background: #cf0a2c; box-shadow: 0 0 15px #cf0a2c; z-index: 10;
            }
        </style>
        `;

        let tabsHtml = "";
        let panesHtml = "";

        sortedDates.forEach((date, idx) => {
            const label = formatDateLabel(date);
            const isActive = (date === todayISO) || (idx === 0 && !sortedDates.includes(todayISO));

            tabsHtml += `
                <div class="bf-tab ${isActive ? 'active' : ''}" id="tab-${date}" onclick="switchBFDay('${date}', this)">
                    <span class="bf-tab-main">${label.main}</span>
                    <span class="bf-tab-sub">${label.sub}</span>
                </div>
            `;

            panesHtml += `<div id="bf-pane-${date}" class="bf-day-pane ${isActive ? 'active' : ''}">`;

            const dayItems = byDate[date];
            if (!dayItems || dayItems.length === 0) {
                panesHtml += `<div class="bf-no-data"><i class="fas fa-calendar-times-o fa-2x"></i><p>Yayın kaydı bulunamadı.</p></div>`;
            } else {
                dayItems.forEach(it => {
                    const se = Number(it.startEpoch || 0);
                    const ee = Number(it.endEpoch || (se + (2 * 60 * 60 * 1000))); // Default 2 hours if end missing

                    const isPast = currentTime > ee;
                    const isLive = currentTime >= se && currentTime <= ee;

                    const time = it.time || '--:--';
                    const title = it.event || it.title || it.match || '-';
                    const details = it.details || '';
                    const announcer = it.announcer || it.spiker || it.spikers || '';
                    const channel = String(it.channel || it.platform || '').trim();
                    const icon = getSportIcon(title);

                    let chMarkup = "";
                    if (channel) {
                        const lowCh = channel.toLowerCase();
                        if (lowCh.includes('plus')) chMarkup = `<img src="https://upload.wikimedia.org/wikipedia/tr/6/6f/S_Sport_Plus_logo.png" class="bf-ch-logo">`;
                        else if (lowCh.includes('s sport 2')) chMarkup = `<img src="https://upload.wikimedia.org/wikipedia/tr/4/4e/S_Sport_2_logo.png" class="bf-ch-logo">`;
                        else if (lowCh.includes('s sport')) chMarkup = `<img src="https://upload.wikimedia.org/wikipedia/tr/d/d4/S_Sport_logo.png" class="bf-ch-logo">`;
                        else chMarkup = `<span class="bf-ch-tag">${channel}</span>`;
                    }

                    panesHtml += `
                        <div class="bf-event-row ${isLive ? 'live' : ''} ${isPast ? 'past' : ''} ${it.isCancelled ? 'cancelled' : ''}">
                            ${isLive ? '<div class="live-tag">CANLI</div>' : ''}
                            <div class="bf-col-status"><i class="fas ${icon} bf-sport-icon"></i></div>
                            <div class="bf-col-time">${time}</div>
                            <div class="bf-col-main">
                                <div class="bf-title">${escapeHtml(title)}</div>
                                ${(details && details.trim() !== title.trim()) ? `<div class="bf-sub">${escapeHtml(details)}</div>` : ''}
                            </div>
                            <div class="bf-col-spiker">
                                ${announcer ? `<div class="bf-spiker-badge"><i class="fas fa-microphone-alt"></i> ${escapeHtml(announcer)}</div>` : ''}
                            </div>
                            <div class="bf-col-channel">${chMarkup}</div>
                        </div>
                    `;
                });
            }
            panesHtml += `</div>`;
        });

        const finalHtml = `
            ${css}
            <div class="bf-wrapper">
                <div class="bf-header">
                    <div class="bf-header-title">
                        <i class="fas fa-broadcast-tower"></i> Yayın Akışı
                        ${((isAdminMode || isLocAdmin) && isEditingActive) ? `
                            <button class="x-btn x-btn-admin" style="margin-left:15px; font-size:0.7rem; padding:4px 10px; background:#2e7d32;" onclick="setBroadcastSheetUrl()">
                                <i class="fas fa-link"></i> E-Tablo Bağla
                            </button>
                            <button class="x-btn x-btn-admin" style="margin-left:5px; font-size:0.7rem; padding:4px 10px;" onclick="openDataImporter('YayinAkisi')">
                                <i class="fas fa-upload"></i> Manuel Yükle
                            </button>
                        ` : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:20px;">
                        <div class="bf-clock" id="bf-current-clock">
                            <i class="fas fa-clock"></i> <span id="clock-text">--:--:--</span>
                        </div>
                        <div style="font-size:0.85rem; opacity:0.7; font-weight:500;">Canlı (E-Tablo)</div>
                    </div>
                </div>

                <div class="bf-search-container">
                    <div class="bf-search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" class="bf-search-input" id="bf-search-input" placeholder="Maç, kanal, spiker veya branş ara..." oninput="switchBFSearch(this.value)">
                    </div>
                    <div class="bf-category-filters">
                        <button class="bf-cat-btn active" onclick="setBFCategory(null, this)">Hepsi</button>
                        <button class="bf-cat-btn" onclick="setBFCategory('futbol', this)">⚽ Futbol</button>
                        <button class="bf-cat-btn" onclick="setBFCategory('basketbol', this)">🏀 Basketbol</button>
                        <button class="bf-cat-btn" onclick="setBFCategory('motor', this)">🏎️ Motor</button>
                        <button class="bf-cat-btn" onclick="setBFCategory('tenis', this)">🎾 Tenis</button>
                        <button class="bf-cat-btn" onclick="setBFCategory('dövüş', this)">🥊 Dövüş</button>
                    </div>
                    <div class="bf-search-stats" id="bf-search-stats" style="display:none;"></div>
                </div>

                <div class="bf-tabs-nav" id="bf-tabs-nav">
                    <button class="bf-nav-btn" onclick="document.querySelector('.bf-tabs-scroll').scrollLeft -= 200"><i class="fas fa-chevron-left"></i></button>
                    <div class="bf-tabs-scroll">
                        ${tabsHtml}
                    </div>
                    <button class="bf-nav-btn" onclick="document.querySelector('.bf-tabs-scroll').scrollLeft += 200"><i class="fas fa-chevron-right"></i></button>
                </div>
                <div class="bf-content-area">
                    <div id="bf-search-pane" class="bf-search-results-pane"></div>
                    <div id="bf-normal-panes">
                        ${panesHtml || '<div class="bf-no-data"><i class="fas fa-info-circle fa-2x" style="display:block;margin-bottom:10px;opacity:0.3;"></i><p>Henüz yayın akışı verisi yüklenmemiş.</p></div>'}
                    </div>
                </div>
            </div>
        `;

        let currentBFCat = null;
        window.setBFCategory = (cat, el) => {
            document.querySelectorAll('.bf-cat-btn').forEach(b => b.classList.remove('active'));
            if (el) el.classList.add('active');
            currentBFCat = cat;
            switchBFSearch(document.getElementById('bf-search-input').value);
        };

        let clockInterval;
        const updateBFClock = () => {
            const clockEl = document.getElementById('clock-text');
            if (clockEl) {
                const now = new Date();
                clockEl.innerText = now.toLocaleTimeString('tr-TR');
            }
        };

        window.switchBFDay = (date, el) => {
            const searchInput = document.getElementById('bf-search-input');
            if (searchInput && searchInput.value) {
                searchInput.value = '';
                switchBFSearch('');
            }

            document.querySelectorAll('.bf-tab').forEach(t => t.classList.remove('active'));
            if (el) el.classList.add('active');
            document.querySelectorAll('.bf-day-pane').forEach(p => p.classList.remove('active'));
            const pane = document.getElementById(`bf-pane-${date}`);
            if (pane) pane.classList.add('active');

            document.querySelector('.bf-content-area').scrollTop = 0;
            if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        };

        window.switchBFSearch = (query) => {
            const tabsNav = document.getElementById('bf-tabs-nav');
            const normalPanes = document.getElementById('bf-normal-panes');
            const searchPane = document.getElementById('bf-search-pane');
            const stats = document.getElementById('bf-search-stats');
            
            if ((!query || query.trim().length < 2) && !currentBFCat) {
                tabsNav.style.display = 'flex';
                normalPanes.style.display = 'block';
                searchPane.style.display = 'none';
                searchPane.innerHTML = '';
                stats.style.display = 'none';
                return;
            }

            tabsNav.style.display = 'none';
            normalPanes.style.display = 'none';
            searchPane.style.display = 'block';
            searchPane.innerHTML = '';
            stats.style.display = 'block';

            const q = query.toLowerCase().trim();
            let resultsHtml = "";
            let totalFound = 0;

            sortedDates.forEach(date => {
                const dayItems = byDate[date];
                const matches = dayItems.filter(it => {
                    const titleStr = String(it.event || it.title || it.match || '').toLowerCase();
                    const detailsStr = String(it.details || '').toLowerCase();
                    const announcerStr = String(it.announcer || it.spiker || it.spikers || '').toLowerCase();
                    const channelStr = String(it.channel || it.platform || '').toLowerCase();
                    
                    // Önce Kategori Filtresi (Eğer seçiliyse)
                    if (currentBFCat) {
                        const icon = getSportIcon(titleStr);
                        let matchesCat = false;
                        if (currentBFCat === 'futbol') matchesCat = (icon === 'fa-futbol');
                        else if (currentBFCat === 'basketbol') matchesCat = (icon === 'fa-basketball-ball');
                        else if (currentBFCat === 'motor') matchesCat = (icon === 'fa-motorcycle' || icon === 'fa-flag-checkered');
                        else if (currentBFCat === 'tenis') matchesCat = (icon === 'fa-table-tennis');
                        else if (currentBFCat === 'dövüş') matchesCat = (icon === 'fa-hand-fist');
                        
                        if (!matchesCat) return false;
                    }

                    // Sonra Metin Araması
                    if (q) {
                        return titleStr.includes(q) || detailsStr.includes(q) || announcerStr.includes(q) || channelStr.includes(q);
                    }
                    return true;
                });

                if (matches.length > 0) {
                    const label = formatDateLabel(date);
                    resultsHtml += `<div class="bf-search-day-header">${label.main} ${label.sub}</div>`;
                    
                    matches.forEach(it => {
                        totalFound++;
                        const se = Number(it.startEpoch || 0);
                        const ee = Number(it.endEpoch || (se + (2 * 60 * 60 * 1000)));
                        const isPast = currentTime > ee;
                        const isLive = currentTime >= se && currentTime <= ee;
                        const time = it.time || '--:--';
                        const title = it.event || it.title || it.match || '-';
                        const details = it.details || '';
                        const announcer = it.announcer || it.spiker || it.spikers || '';
                        const channel = String(it.channel || it.platform || '').trim();
                        const icon = getSportIcon(title);

                        let chMarkup = "";
                        if (channel) {
                            const lowCh = channel.toLowerCase();
                            if (lowCh.includes('plus')) chMarkup = `<img src="https://upload.wikimedia.org/wikipedia/tr/6/6f/S_Sport_Plus_logo.png" class="bf-ch-logo">`;
                            else if (lowCh.includes('s sport 2')) chMarkup = `<img src="https://upload.wikimedia.org/wikipedia/tr/4/4e/S_Sport_2_logo.png" class="bf-ch-logo">`;
                            else if (lowCh.includes('s sport')) chMarkup = `<img src="https://upload.wikimedia.org/wikipedia/tr/d/d4/S_Sport_logo.png" class="bf-ch-logo">`;
                            else chMarkup = `<span class="bf-ch-tag">${channel}</span>`;
                        }

                        resultsHtml += `
                            <div class="bf-event-row ${isLive ? 'live' : ''} ${isPast ? 'past' : ''} ${it.isCancelled ? 'cancelled' : ''}">
                                ${isLive ? '<div class="live-tag">CANLI</div>' : ''}
                                <div class="bf-col-status"><i class="fas ${icon} bf-sport-icon"></i></div>
                                <div class="bf-col-time">${time}</div>
                                <div class="bf-col-main">
                                    <div class="bf-title">${escapeHtml(title)}</div>
                                    ${(details && details.trim() !== title.trim()) ? `<div class="bf-sub">${escapeHtml(details)}</div>` : ''}
                                </div>
                                <div class="bf-col-spiker">
                                    ${announcer ? `<div class="bf-spiker-badge"><i class="fas fa-microphone-alt"></i> ${escapeHtml(announcer)}</div>` : ''}
                                </div>
                                <div class="bf-col-channel">${chMarkup}</div>
                            </div>
                        `;
                    });
                }
            });

            if (totalFound === 0) {
                searchPane.innerHTML = `<div class="bf-no-data"><i class="fas fa-search-minus fa-2x"></i><p>"${escapeHtml(query)}" için sonuç bulunamadı.</p></div>`;
                stats.innerText = `0 sonuç bulundu`;
            } else {
                searchPane.innerHTML = resultsHtml;
                stats.innerText = `${totalFound} sonuç bulundu`;
            }
        };

        Swal.fire({
            html: finalHtml,
            width: 1300,
            padding: '0',
            showConfirmButton: false,
            showCloseButton: true,
            background: '#fff',
            didOpen: () => {
                updateBFClock();
                clockInterval = setInterval(updateBFClock, 1000);
            },
            willClose: () => {
                clearInterval(clockInterval);
            }
        });

        // Small delay to ensure render then scroll to today
        setTimeout(() => {
            const activeTab = document.querySelector('.bf-tab.active');
            if (activeTab) activeTab.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
        }, 100);

    } catch (err) {
        console.error("Broadcast Flow Error:", err);
        Swal.fire("Sistem Hatası", "Yayın akışı şu an yüklenemiyor.", "error");
    }
}

async function setBroadcastSheetUrl() {
    const currentUrlStr = (homeBlocks['broadcast_url']?.content || localStorage.getItem("pusula_broadcast_url") || "").trim();
    const urls = currentUrlStr.split('|');
    const u1 = urls[0] || '';
    const u2 = urls[1] || '';
    const u3 = urls[2] || '';
    const u4 = urls[3] || '';

    const { value: urlObj, isDenied } = await Swal.fire({
        title: 'Çoklu E-Tablo Bağlantıları',
        html: `
            <div style="font-size:0.9rem; text-align:left; margin-bottom:15px; color:#555">
                Sistem aynı anda 4 farklı tabloyu okuyup birleştirebilir.<br>
                <b>Link 1</b> zorunludur, diğerleri opsiyoneldir.
            </div>
            <input id="swal-url1" class="swal2-input" style="margin-bottom:10px" placeholder="Link 1 (Zorunlu, Örn: https://docs...)" value="${u1}">
            <input id="swal-url2" class="swal2-input" style="margin-bottom:10px" placeholder="Link 2 (Opsiyonel Ek Tablo)" value="${u2}">
            <input id="swal-url3" class="swal2-input" style="margin-bottom:10px" placeholder="Link 3 (Opsiyonel Ek Tablo)" value="${u3}">
            <input id="swal-url4" class="swal2-input" style="margin-bottom:10px" placeholder="Link 4 (Opsiyonel Ek Tablo)" value="${u4}">
        `,
        focusConfirm: false,
        showCancelButton: true,
        showDenyButton: !!currentUrlStr,
        confirmButtonText: 'Çoklu Bağlantıyı Kaydet',
        denyButtonText: 'Tümünü Kaldır',
        cancelButtonText: 'Vazgeç',
        footer: '<div style="font-size:0.8rem; color:#666;">Tüm Pusula kullanıcıları için geçerli olacaktır. Boş bırakılan satırlar işlenmez.</div>',
        preConfirm: () => {
            const val1 = document.getElementById('swal-url1').value.trim();
            const val2 = document.getElementById('swal-url2').value.trim();
            const val3 = document.getElementById('swal-url3').value.trim();
            const val4 = document.getElementById('swal-url4').value.trim();
            
            if (!val1) {
                Swal.showValidationMessage('Link 1 (Ana Tablo) zorunludur!');
                return false;
            }
            if (!val1.includes('docs.google.com')) {
                Swal.showValidationMessage('Link 1 geçerli bir Google Sheets bağlantısı olmalıdır!');
                return false;
            }
            // Sadece dolu olan adresleri pipe | ile birleştir
            const arr = [val1];
            if (val2 && val2.includes('docs.google.com')) arr.push(val2);
            if (val3 && val3.includes('docs.google.com')) arr.push(val3);
            if (val4 && val4.includes('docs.google.com')) arr.push(val4);
            return arr.join('|');
        }
    });

    if (isDenied) {
        Swal.fire({ title: 'Kaldırılıyor...', didOpen: () => Swal.showLoading() });
        await apiCall('updateHomeBlock', { key: 'broadcast_url', content: null, title: 'Broadcast Link', visibleGroups: '' });
        
        if (homeBlocks['broadcast_url']) delete homeBlocks['broadcast_url'];
        localStorage.removeItem("pusula_broadcast_url"); 

        Swal.fire('Bağlantı Kaldırıldı', 'Sistem tekrar manuel (Supabase) verilere geri döndü.', 'info');
        openBroadcastFlow();
        return;
    }

    if (urlObj) {
        Swal.fire({ title: 'E-Tablolar Okunuyor ve Birleştiriliyor...', didOpen: () => Swal.showLoading() });
        await apiCall('updateHomeBlock', { key: 'broadcast_url', content: urlObj, title: 'Broadcast Link', visibleGroups: '' });
        homeBlocks['broadcast_url'] = { content: urlObj };
        localStorage.setItem("pusula_broadcast_url", urlObj);
        Swal.fire({
            icon: 'success',
            title: 'Tablolar Başarıyla Entegre Edildi',
            text: 'Yayın akışı her tablodan ortak olarak çekilecektir.',
            timer: 2000
        });
        openBroadcastFlow();
    }
}

// XSS koruması

function _formatBroadcastDateTr(it) {
    // Backend yeni alanları gönderiyorsa kullan
    if (it && it.dateLabelTr) return String(it.dateLabelTr);

    // Fallback: it.dateISO (yyyy-mm-dd) veya it.date
    const s = String(it?.dateISO || it?.date || "").trim();
    if (!s) return "Tarih Yok";

    // ISO yyyy-mm-dd
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric", weekday: "long" }).format(d);
    }

    // dd.mm.yyyy / dd/mm/yyyy
    const m2 = s.match(/^(\d{1,2})[\./-](\d{1,2})[\./-](\d{4})/);
    if (m2) {
        const d = new Date(Number(m2[3]), Number(m2[2]) - 1, Number(m2[1]));
        return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric", weekday: "long" }).format(d);
    }

    return s; // en kötü haliyle göster
}

function escapeHtml(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
const __escapeHtml = escapeHtml;
const _escapeHtml = escapeHtml;

// ------------------------------------------------------------
// Sağlamlaştırma (hata yönetimi + localStorage güvenli yazma)
// ------------------------------------------------------------
// 🔒 GÜVENLİK & DEBUG: Sadece adminler için detaylı log
function dlog(msg, data) {
    if (isAdminMode || isLocAdmin) {
        if (data) console.log(`[Pusula Debug] ${msg}`, data);
        else console.log(`[Pusula Debug] ${msg}`);
    }
}

function safeLocalStorageSet(key, value, maxBytes = 4 * 1024 * 1024) { // ~4MB
    try {
        const str = JSON.stringify(value);
        // Basit boyut kontrolü (UTF-16 yaklaşığı)
        if (str.length * 2 > maxBytes) {
            try { Swal.fire('Uyarı', 'Veri çok büyük, kaydedilemedi', 'warning'); } catch (e) { }
            return false;
        }
        localStorage.setItem(key, str);
        return true;
    } catch (e) {
        if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
            try { Swal.fire('Hata', 'Depolama alanı dolu', 'error'); } catch (x) { }
        } else {
            dlog('[safeLocalStorageSet]', e);
        }
        return false;
    }
}

function safeLocalStorageGet(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        return JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
}

const storage = {
    set: (k, v) => safeLocalStorageSet(k, v),
    get: (k, fb = null) => safeLocalStorageGet(k, fb),
    del: (k) => { try { localStorage.removeItem(k); } catch (e) { } }
};

// Global error handlers (kullanıcıya sade mesaj, admin'e detay log)
window.addEventListener('error', function (e) {
    try { if (isAdminMode || isLocAdmin) dlog('[Global Error]', e && (e.error || e.message) ? (e.error || e.message) : e); } catch (_) { }
    try { if (typeof showGlobalError === 'function') showGlobalError('Beklenmeyen hata: ' + (e && e.message ? e.message : 'Bilinmeyen')); } catch (_) { }
});

window.addEventListener('unhandledrejection', function (e) {
    try { if (isAdminMode || isLocAdmin) dlog('[Unhandled Promise]', e && e.reason ? e.reason : e); } catch (_) { }
    try { if (typeof showGlobalError === 'function') showGlobalError('Beklenmeyen hata: ' + (e && e.reason && e.reason.message ? e.reason.message : 'Bilinmeyen')); } catch (_) { }
});


function openGuide() {
    const css = `
    <style>
        .sg-modal-container { font-family: 'Outfit', sans-serif; display: flex; flex-direction: column; height: 92vh; background: #fdfdfe; overflow: hidden; border-radius: 16px; }
        
        /* MODAL HEADER */
        .sg-modal-header { background: #0e1b42; color: white; padding: 20px 35px; display: flex; align-items: center; justify-content: space-between; position: relative; flex-shrink: 0; }
        .sg-modal-header::after { content:''; position:absolute; bottom:0; left:0; width:100%; height:4px; background: linear-gradient(90deg, #cf0a2c, transparent); }
        .sg-header-left { display: flex; align-items: center; gap: 12px; }
        .sg-header-icon { font-size: 1.5rem; color: #fff; background: #cf0a2c; width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
        .sg-header-text h2 { margin: 0; font-size: 1.3rem; font-weight: 800; }
        .sg-header-text p { margin: 0; font-size: 0.8rem; opacity: 0.6; }

        .sg-header-right { display: flex; gap: 15px; align-items: center; }
        .sg-modal-search { position: relative; }
        .sg-modal-search input { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 8px 15px 8px 38px; color: white; width: 280px; font-size: 0.85rem; outline: none; transition: 0.3s; }
        .sg-modal-search input:focus { background: rgba(255,255,255,0.15); border-color: #fff; width: 320px; }
        .sg-modal-search i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); opacity: 0.5; font-size: 0.8rem; }

        /* CATEGORY TABS */
        .sg-cats { background: #fff; border-bottom: 1px solid #edf2f7; padding: 12px 35px; display: flex; gap: 8px; overflow-x: auto; flex-shrink: 0; }
        .sg-cat-tab { padding: 6px 16px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; color: #64748b; cursor: pointer; border: 1px solid #e2e8f0; transition: 0.2s; white-space: nowrap; }
        .sg-cat-tab:hover { border-color: #0e1b42; color: #0e1b42; }
        .sg-cat-tab.active { background: #0e1b42; color: white; border-color: #0e1b42; }

        /* BODY LAYOUT */
        .sg-modal-body { flex: 1; display: flex; overflow: hidden; background: #f8fafc; }
        
        /* LEFT: THE LIST */
        .sg-list-pane { flex: 1; overflow-y: auto; padding: 20px 35px; }
        .sg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 15px; padding-bottom: 30px; }

        /* PREMIUM CARD */
        .sg-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 18px; cursor: pointer; transition: 0.25s; position: relative; display: flex; flex-direction: column; min-height: 180px; }
        .sg-card:hover { transform: translateY(-3px); border-color: #0e1b42; box-shadow: 0 8px 15px rgba(0,0,0,0.05); }
        .sg-card.active { border-color: #0e1b42; background: #f0f7ff; box-shadow: 0 0 0 2px rgba(14,27,66,0.1); }
        
        .sg-card-icon { width: 44px; height: 44px; background: #f1f5f9; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: #0e1b42; margin-bottom: 12px; }
        .sg-card-title { font-size: 1.1rem; font-weight: 800; color: #0f172a; margin-bottom: 5px; }
        .sg-card-desc { font-size: 0.78rem; color: #64748b; line-height: 1.4; margin-bottom: 12px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        
        /* RIGHTS BADGE ON CARD */
        .sg-card-badge { margin-top: auto; padding: 6px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 800; display: flex; align-items: center; gap: 6px; }
        .sg-badge-active { background: #ecfdf5; color: #059669; border: 1px solid #bbf7d0; }
        .sg-badge-expired { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

        /* RIGHT PANEL: DETAILS */
        .sg-detail-pane { width: 420px; background: white; border-left: 1px solid #e2e8f0; display: flex; flex-direction: column; }
        .sg-detail-inner { padding: 30px; overflow-y: auto; flex: 1; }
        .sg-detail-hero { display: flex; align-items: center; gap: 15px; margin-bottom: 25px; }
        .sg-detail-lg-icon { width: 60px; height: 60px; background: #0e1b42; color: white; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; }
        .sg-detail-hero h3 { margin: 0; font-size: 1.5rem; font-weight: 800; color: #111; }
        .sg-detail-pron { color: #f59e0b; font-weight: 700; margin-top: 3px; font-size: 0.9rem; }

        .sg-detail-section { margin-bottom: 25px; }
        .sg-sec-title { font-size: 0.7rem; font-weight: 850; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
        .sg-sec-content { font-size: 0.9rem; color: #334155; line-height: 1.6; }
        
        .sg-tip-card { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 15px; display: flex; gap: 10px; color: #92400e; font-size: 0.85rem; }

        .sg-detail-placeholder { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #cbd5e1; padding: 30px; }
        .sg-detail-placeholder i { font-size: 3rem; opacity: 0.3; margin-bottom: 15px; }

        /* SCROLLBAR */
        .sg-list-pane::-webkit-scrollbar, .sg-detail-inner::-webkit-scrollbar { width: 5px; }
        .sg-list-pane::-webkit-scrollbar-thumb, .sg-detail-inner::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
    </style>
    `;

    const getCat = (icon) => {
        const iconMap = {
            'fa-futbol': 'Futbol',
            'fa-basketball': 'Basketbol',
            'fa-table-tennis': 'Tenis',
            'fa-flag-checkered': 'Yarış',
            'fa-motorcycle': 'Yarış',
            'fa-car': 'Yarış',
            'fa-hand-fist': 'Dövüş',
            'fa-volleyball-ball': 'Voleybol'
        };
        for (let k in iconMap) if (icon && icon.includes(k.replace('fa-', ''))) return iconMap[k];
        return 'Diğer';
    };

    // Kategorileri sıralı getir (Futbol ve Basketbol hep başta olsun)
    const rawCats = [...new Set(sportsData.map(s => getCat(s.icon)))];
    const prioritized = ['Futbol', 'Basketbol'];
    const otherCats = rawCats.filter(c => !prioritized.includes(c)).sort();
    const cats = ['Tümü', ...prioritized.filter(p => rawCats.includes(p)), ...otherCats];

    const modalHtml = `
        ${css}
        <div class="sg-modal-container">
            <div class="sg-modal-header">
                <div class="sg-header-left">
                    <div class="sg-header-icon"><i class="fas fa-book-open"></i></div>
                    <div class="sg-header-text">
                        <h2>Spor Rehberi</h2>
                        <p>İçerik ve Yayın Hakları Bilgi Portalı</p>
                    </div>
                </div>
                <div class="sg-header-right">
                    ${(typeof isAdminMode !== 'undefined' && isAdminMode && typeof isEditingActive !== 'undefined' && isEditingActive)
            ? `<button onclick="addNewContent('sport')" class="q-btn-add" style="background:#cf0a2c; color:white; border:none; padding:8px 15px; border-radius:8px; font-weight:800; cursor:pointer; margin-right:15px; font-family:'Outfit'">
                             <i class="fas fa-plus"></i> Yeni İçerik Ekle
                           </button>` : ''}
                    <div class="sg-modal-search">
                        <i class="fas fa-search"></i>
                        <input type="text" id="sg-search-inp" placeholder="İçerik arayın..." oninput="sgDoSearch()">
                    </div>
                </div>
            </div>
            <div class="sg-cats" id="sg-cat-area">
                ${cats.map((c, i) => `<div class="sg-cat-tab ${i === 0 ? 'active' : ''}" onclick="sgDoFilter('${c}', this)">${c}</div>`).join('')}
            </div>
            <div class="sg-modal-body">
                <div class="sg-list-pane">
                    <div class="sg-grid" id="sg-grid-inner"></div>
                    <div id="sg-none" style="display:none; text-align:center; padding:40px; color:#94a3b8">Kayıt bulunamadı.</div>
                </div>
                <div class="sg-detail-pane">
                    <div class="sg-detail-placeholder" id="sg-placeholder">
                        <i class="fas fa-hand-pointer"></i>
                        <p>Detayları görmek için bir <strong>Lige</strong> tıklayın.</p>
                    </div>
                    <div class="sg-detail-inner" id="sg-detail-content" style="display:none"></div>
                </div>
            </div>
        </div>
    `;

    Swal.fire({
        html: modalHtml, width: '98vw', padding: '0', background: '#f8fafc',
        showConfirmButton: false, showCloseButton: true,
        didOpen: () => { sgRender(); }
    });

    window.sgDoFilter = (cat, el) => {
        document.querySelectorAll('#sg-cat-area .sg-cat-tab').forEach(t => t.classList.remove('active'));
        el.classList.add('active');
        sgRender();
    };

    window.sgDoSearch = () => sgRender();

    window.sgRender = () => {
        const grid = document.getElementById('sg-grid-inner');
        if (!grid) return;
        const q = (document.getElementById('sg-search-inp')?.value || '').toLowerCase().trim();
        const cat = document.querySelector('#sg-cat-area .sg-cat-tab.active')?.innerText || 'Tümü';

        const filtered = sportsData.filter(s => {
            const matchesCat = cat === 'Tümü' || getCat(s.icon) === cat;
            const matchesQ = !q || (s.title || '').toLowerCase().includes(q) || (s.desc || '').toLowerCase().includes(q) || (s.detail || '').toLowerCase().includes(q);
            return matchesCat && matchesQ;
        });

        document.getElementById('sg-none').style.display = filtered.length === 0 ? 'block' : 'none';

        grid.innerHTML = filtered.map((s) => {
            const years = (s.detail || '').match(/20(\d{2})/g);
            const lastYear = years ? parseInt(years[years.length - 1]) : 0;
            const rightsMatch = (s.detail || '').match(/[Yy]ay[ıi]n hak[kk][ıi]\s*[bB]iti[sş]\s*[:：]?\s*(.+)/i);
            const rightsStr = (rightsMatch && rightsMatch[1] && rightsMatch[1].toLowerCase() !== 'undefined') ? rightsMatch[1].trim() : "Bilinmiyor";
            const isExp = (lastYear > 0 && lastYear < new Date().getFullYear());

            const editBtn = (typeof isAdminMode !== 'undefined' && isAdminMode && typeof isEditingActive !== 'undefined' && isEditingActive)
                ? `<div class="sg-card-edit" onclick="event.stopPropagation(); editSport('${s.id}')" style="position:absolute; top:10px; right:10px; width:30px; height:30px; background:rgba(14,27,66,0.1); color:#0e1b42; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:0.2s">
                     <i class="fas fa-pen" style="font-size:0.7rem"></i>
                   </div>` : '';

            return `
            <div class="sg-card" data-id="${s.id}" onclick="sgShowDetail('${s.id}', this)" style="position:relative">
                ${editBtn}
                <div class="sg-card-icon"><i class="fas ${s.icon || 'fa-star'}"></i></div>
                <div class="sg-card-title">${s.title}</div>
                <div class="sg-card-desc">${s.desc || ''}</div>
                <div class="sg-card-badge ${isExp ? 'sg-badge-expired' : 'sg-badge-active'}">
                    <i class="fas ${isExp ? 'fa-circle-xmark' : 'fa-circle-check'}"></i>
                    ${rightsStr}
                </div>
            </div>`;
        }).join('');
    };


    window.sgShowDetail = (id, el) => {
        document.querySelectorAll('.sg-card').forEach(c => c.classList.remove('active'));
        el.classList.add('active');
        const s = sportsData.find(x => String(x.id) === String(id));
        if (!s) return;
        const content = document.getElementById('sg-detail-content');
        const placeholder = document.getElementById('sg-placeholder');
        placeholder.style.display = 'none';
        content.style.display = 'block';

        const rightsMatch = (s.detail || '').match(/[Yy]ay[ıi]n hak[kk][ıi]\s*[bB]iti[sş]\s*[:：]?\s*(.+)/i);
        const rights = rightsMatch ? rightsMatch[1].trim() : "Bilinmiyor";
        const cleanDetail = (s.detail || '').replace(/[Yy]ay[ıi]n hak[kk][ıi]\s*[bB]iti[sş]\s*[:：]?\s*.+/i, '').trim();

        content.innerHTML = `
            <div class="sg-detail-hero">
                <div class="sg-detail-lg-icon"><i class="fas ${s.icon}"></i></div>
                <div>
                    <h3>${s.title}</h3>
                    ${s.pronunciation ? `<span class="sg-detail-pron">🗣 ${s.pronunciation}</span>` : ''}
                </div>
            </div>
            <div class="sg-detail-section">
                <div class="sg-sec-title"><i class="fas fa-shield-halved"></i> Yayın Hakları</div>
                <div class="sg-sec-content" style="font-weight:700; color:#0e1b42; font-size:1.1rem">${rights}</div>
            </div>
            <div class="sg-detail-section">
                <div class="sg-sec-title"><i class="fas fa-info-circle"></i> Genel Bilgi</div>
                <div class="sg-sec-content">${(s.desc || '').replace(/\n/g, '<br>')}</div>
            </div>
            ${cleanDetail ? `
            <div class="sg-detail-section">
                <div class="sg-sec-title"><i class="fas fa-file-invoice"></i> Detaylı Bilgi</div>
                <div class="sg-sec-content" style="background:#f1f5f9; padding:15px; border-radius:10px">${cleanDetail.replace(/\n/g, '<br>')}</div>
            </div>` : ''}
            ${s.tip && s.tip !== 'undefined' ? `<div class="sg-tip-card"><i class="fas fa-lightbulb"></i><div><strong>Not:</strong> ${s.tip}</div></div>` : ''}
        `;
    };
    sgRender();
}

// =========================================================
// ✅ SPOR REHBERİ EDİTÖRÜ (Admin Sadece)
// =========================

async function editSport(id) {
    const s = sportsData.find(x => String(x.id) === String(id));
    if (!s) return;

    const { value: v } = await Swal.fire({
        title: 'Spor Ligini Düzenle',
        html: `
            <div style="text-align:left; font-size:0.85rem;">
                <label>Lig Başlığı</label><input id="swal-title" class="swal2-input" value="${s.title || ''}">
                <label>Icon (fa-futbol, fa-basketball-ball vb.)</label><input id="swal-icon" class="swal2-input" value="${s.icon || ''}">
                <label>Okunuş</label><input id="swal-pron" class="swal2-input" value="${s.pronunciation || ''}">
                <label>Genel Bilgi</label><textarea id="swal-text" class="swal2-textarea" style="height:80px;">${s.desc || ''}</textarea>
                <label>Yayın Hakları (Bitiş formatı: 'Yayın Hakları Bitiş: [Tarih]')</label><textarea id="swal-detail" class="swal2-textarea" style="height:120px;">${s.detail || ''}</textarea>
                <label>Kritik İpucu (Not)</label><input id="swal-tip" class="swal2-input" value="${s.tip || ''}">
            </div>
        `,
        width: 600, showCancelButton: true, confirmButtonText: 'Kaydet',
        preConfirm: () => ({
            Title: document.getElementById('swal-title').value,
            Icon: document.getElementById('swal-icon').value,
            Pronunciation: document.getElementById('swal-pron').value,
            Text: document.getElementById('swal-text').value,
            Detail: document.getElementById('swal-detail').value,
            Tip: document.getElementById('swal-tip').value
        })
    });

    if (v) {
        Swal.fire({ title: 'Kaydediliyor...', didOpen: () => Swal.showLoading() });
        try {
            const { error } = await sb.from('Data').update({
                Category: 'sport',
                Title: v.Title, Icon: v.Icon, Text: v.Text, Detail: v.Detail, Tip: v.Tip, Pronunciation: v.Pronunciation
            }).eq('id', id);

            if (error) throw error;
            saveLog("Spor Rehberi Düzenleme", v.Title);
            Swal.fire('Başarılı', 'Güncellendi. Yenileniyor...', 'success');
            await loadContentData();
            sgRender();
            if (document.getElementById('sg-detail-content')?.style.display === 'block') {
                sgShowDetail(id, document.querySelector(`.sg-card[data-id="${id}"]`));
            }
        } catch (e) {
            Swal.fire('Hata', 'Kaydedilemedi: ' + e.message, 'error');
        }
    }
}

async function addNewContent(type) {
    if (!isAdminMode) return;

    if (type === 'sport') {
        const { value: v } = await Swal.fire({
            title: 'Yeni Spor Ligi Ekle',
            html: `
                <div style="text-align:left; font-size:0.85rem;">
                    <label>Lig Başlığı</label><input id="swal-title" class="swal2-input" placeholder="Örn: Trendyol Süper Lig">
                    <label>Icon (fa-futbol, fa-basketball-ball vb.)</label><input id="swal-icon" class="swal2-input" placeholder="fa-futbol">
                    <label>Okunuş</label><input id="swal-pron" class="swal2-input" placeholder="Heceleniş">
                    <label>Genel Bilgi</label><textarea id="swal-text" class="swal2-textarea" style="height:80px;"></textarea>
                    <label>Yayın Hakları (Bitiş formatı: 'Yayın Hakları Bitiş: [Tarih]')</label><textarea id="swal-detail" class="swal2-textarea" style="height:120px;"></textarea>
                    <label>Kritik İpucu (Not)</label><input id="swal-tip" class="swal2-input">
                </div>
            `,
            width: 600, showCancelButton: true, confirmButtonText: 'Ekle',
            preConfirm: () => ({
                Title: document.getElementById('swal-title').value,
                Icon: document.getElementById('swal-icon').value,
                Pronunciation: document.getElementById('swal-pron').value,
                Text: document.getElementById('swal-text').value,
                Detail: document.getElementById('swal-detail').value,
                Tip: document.getElementById('swal-tip').value
            })
        });

        if (v && v.Title) {
            Swal.fire({ title: 'Ekleniyor...', didOpen: () => Swal.showLoading() });
            try {
                const { error } = await sb.from('Data').insert({
                    Category: 'sport',
                    Title: v.Title, Icon: v.Icon, Text: v.Text, Detail: v.Detail, Tip: v.Tip, Pronunciation: v.Pronunciation
                });
                if (error) throw error;
                saveLog("Yeni Spor Ekleme", v.Title);
                Swal.fire('Başarılı', 'İçerik eklendi.', 'success');
                await loadContentData();
                sgRender();
            } catch (e) {
                Swal.fire('Hata', 'Eklenemedi: ' + e.message, 'error');
            }
        }
    } else {
        const availableGroups = await getDistinctGroups();
        // Genel İçerik (Card) Ekleme Popup'ı (v15.3 - Tam Veri Entegrasyonu)
        const { value: formValues } = await Swal.fire({
            title: 'Yeni İçerik / Duyuru Ekle',
            html: `
                <div style="text-align:left; font-size:0.85rem; padding:10px;">
                    <label style="font-weight:bold; display:block; margin-bottom:5px;">Başlık</label>
                    <input id="swal-title" class="swal2-input" style="width:100%; margin:0 0 15px 0;" placeholder="Başlık">
                    
                    <label style="font-weight:bold; display:block; margin-bottom:5px;">Kategori</label>
                    <select id="swal-cat" class="swal2-input" style="width:100%; margin:0 0 15px 0;">
                        <option value="Teknik">Teknik</option>
                        <option value="İkna">İkna</option>
                        <option value="Kampanya">Kampanya</option>
                        <option value="Bilgi">Bilgi</option>
                        <option value="news">Duyuru</option>
                        <option value="video">🎥 Video Popup</option>
                    </select>
                    
                    <div id="swal-news-extra" style="display:none; background:#fefce8; padding:15px; border-radius:10px; border:1px solid #fef08a; margin-bottom:15px;">
                        <div style="display:flex; gap:10px; margin-bottom:10px;">
                            <div style="flex:1;">
                                <label style="font-weight:bold; font-size:0.75rem;">Duyuru Türü</label>
                                <select id="swal-news-type" class="swal2-input" style="width:100%; height:35px; font-size:0.8rem; margin:5px 0 0 0;">
                                    <option value="info">Bilgi</option>
                                    <option value="update">Değişiklik</option>
                                    <option value="fix">Çözüldü</option>
                                </select>
                            </div>
                            <div style="flex:1;">
                                <label style="font-weight:bold; font-size:0.75rem;">Duyuru Tarihi</label>
                                <input id="swal-news-date" class="swal2-input" style="width:100%; height:35px; font-size:0.8rem; margin:5px 0 0 0;" value="${new Date().toLocaleDateString('tr-TR')}">
                            </div>
                        </div>
                        <label style="font-weight:bold; display:flex; align-items:center; cursor:pointer; margin-bottom:10px;">
                            <input type="checkbox" id="swal-mandatory" style="width:18px; height:18px; margin-right:10px;"> Girişte Zorunlu Popup?
                        </label>
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
                            <label style="font-size:0.75rem; font-weight:bold;">Kapanma Süresi (Sn):</label>
                            <input type="number" id="swal-timer-generic" class="swal2-input" style="width:70px; height:30px; margin:0; font-size:0.8rem;" value="30">
                        </div>
                        <label style="font-weight:bold; display:block; font-size:0.75rem;">Hedef Gruplar (Seçmezseniz Herkes)</label>
                        <div id="swal-group-chips-generic" style="display:flex; flex-wrap:wrap; gap:5px; margin-top:5px;"></div>
                        <input type="hidden" id="swal-groups-generic" value="">
                    </div>

                    <label style="font-weight:bold; display:block; margin-bottom:5px;">Açıklama / Metin</label>
                    <textarea id="swal-text" class="swal2-textarea" style="width:100%; height:100px; margin:0 0 15px 0;" placeholder="Metin içeriği..."></textarea>
                    
                    <div id="swal-card-fields">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Kısayolu (Script)</label>
                        <textarea id="swal-script" class="swal2-textarea" style="width:100%; height:80px; margin:0 0 15px 0;" placeholder="Kopyalanacak metin..."></textarea>
                        
                        <div style="display:flex; gap:10px;">
                            <div style="flex:1;">
                                <label style="font-weight:bold; display:block; margin-bottom:5px;">Grup Kodu</label>
                                <input id="swal-code" class="swal2-input" style="width:100%; margin:0 0 15px 0;" placeholder="Örn: TV01">
                            </div>
                            <div style="flex:1;">
                                <label style="font-weight:bold; display:block; margin-bottom:5px;">Görsel Linki</label>
                                <input id="swal-img" class="swal2-input" style="width:100%; margin:0 0 15px 0;" placeholder="URL">
                            </div>
                        </div>
                    </div>

                    <div id="swal-news-img-field" style="display:none;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px;">Görsel Linki</label>
                        <input id="swal-news-img" class="swal2-input" style="width:100%; margin:0 0 15px 0;" placeholder="URL">
                    </div>
                    <div id="swal-video-fields" style="display:none; background:#f0fdf4; padding:15px; border-radius:10px; border:1px solid #bbf7d0; margin-bottom:10px;">
                        <label style="font-weight:bold; display:block; margin-bottom:5px; color:#166534;"><i class="fas fa-video" style="margin-right:6px;"></i>Video URL (YouTube / Vimeo / Drive)</label>
                        <input id="swal-video-url" class="swal2-input" style="width:100%; margin:0 0 12px 0;" placeholder="https://youtube.com/watch?v=...">
                        <label style="font-weight:bold; display:block; margin-bottom:5px; color:#166534;">Hedef Grup (Seçmezseniz Herkes)</label>
                        <div id="swal-video-chip-container" style="display:flex; flex-wrap:wrap; gap:5px; margin-top:5px;"></div>
                        <input type="hidden" id="swal-video-groups" value="">
                    </div>
                </div>
            `,
            width: 600, showCancelButton: true, confirmButtonText: 'Ekle',
            didOpen: () => {
                const catSelect = document.getElementById('swal-cat');
                const newsExtra = document.getElementById('swal-news-extra');
                const cardFields = document.getElementById('swal-card-fields');
                const newsImgField = document.getElementById('swal-news-img-field');
                const chipContainer = document.getElementById('swal-group-chips-generic');
                const groupsInput = document.getElementById('swal-groups-generic');
                let selected = [];

                const updateVisibility = () => {
                    const isNews = catSelect.value === 'news';
                    const isVideo = catSelect.value === 'video';
                    newsExtra.style.display = isNews ? 'block' : 'none';
                    newsImgField.style.display = isNews ? 'block' : 'none';
                    cardFields.style.display = (isNews || isVideo) ? 'none' : 'block';
                    document.getElementById('swal-video-fields').style.display = isVideo ? 'block' : 'none';
                    document.getElementById('swal-text').closest('label')?.style.setProperty('display', isVideo ? 'none' : '');
                    if (isVideo) document.getElementById('swal-text').style.display = 'none';
                    else document.getElementById('swal-text').style.display = '';
                };

                catSelect.onchange = updateVisibility;


                availableGroups.forEach(g => {
                    const chip = document.createElement('span');
                    chip.innerText = g;
                    chip.style.cssText = "padding:3px 10px; background:#fff; border:1px solid #e2e8f0; border-radius:15px; font-size:0.7rem; font-weight:600; color:#475569; cursor:pointer; transition:all 0.2s; user-select:none;";
                    chip.onclick = () => {
                        const idx = selected.indexOf(g);
                        if (idx > -1) {
                            selected.splice(idx, 1);
                            chip.style.background = "#fff"; chip.style.color = "#475569"; chip.style.borderColor = "#e2e8f0";
                        } else {
                            selected.push(g);
                            chip.style.background = "#0e1b42"; chip.style.color = "white"; chip.style.borderColor = "#0e1b42";
                        }
                        groupsInput.value = selected.join(', ');
                    };
                    chipContainer.appendChild(chip);
                });

                // Video chip'leri
                let videoSelected = [];
                availableGroups.forEach(g => {
                    const chip = document.createElement('span');
                    chip.innerText = g;
                    chip.style.cssText = "padding:3px 10px; background:#dcfce7; border:1px solid #bbf7d0; border-radius:15px; font-size:0.7rem; font-weight:600; color:#166534; cursor:pointer; transition:all 0.2s; user-select:none;";
                    chip.onclick = () => {
                        const idx = videoSelected.indexOf(g);
                        if (idx > -1) {
                            videoSelected.splice(idx, 1);
                            chip.style.background = "#dcfce7"; chip.style.color = "#166534"; chip.style.borderColor = "#bbf7d0";
                        } else {
                            videoSelected.push(g);
                            chip.style.background = "#166534"; chip.style.color = "white"; chip.style.borderColor = "#166534";
                        }
                        document.getElementById('swal-video-groups').value = videoSelected.join(', ');
                    };
                    document.getElementById('swal-video-chip-container').appendChild(chip);
                });

                if (type === 'news') {
                    catSelect.value = 'news';
                    updateVisibility();
                }
            },
            preConfirm: () => {
                const catVal = document.getElementById('swal-cat').value;
                const isNews = catVal === 'news';
                const isVideo = catVal === 'video';
                const payload = {
                    Title: document.getElementById('swal-title').value,
                    Text: isVideo ? '' : document.getElementById('swal-text').value,
                    Status: 'Aktif'
                };

                if (isNews) {
                    payload.Type = 'news';
                    payload.Category = document.getElementById('swal-news-type').value;
                    payload.Date = document.getElementById('swal-news-date').value;
                    payload.IsMandatory = document.getElementById('swal-mandatory').checked;
                    payload.TargetGroups = document.getElementById('swal-groups-generic').value;
                    payload.PopupTimer = parseInt(document.getElementById('swal-timer-generic').value) || 30;
                    payload.Image = document.getElementById('swal-news-img').value;
                } else if (isVideo) {
                    payload.Type = 'video';
                    payload.Link = document.getElementById('swal-video-url').value.trim();
                    payload.TargetGroups = document.getElementById('swal-video-groups').value.trim();
                    payload.Date = new Date().toISOString();
                    if (!payload.Link) { Swal.showValidationMessage('Video URL zorunludur!'); return false; }
                } else {
                    payload.Type = 'card';
                    // Kategoriyi her zaman büyük harfle başlat (V15.5 - Case Sensitivity Fix)
                    const rawCat = document.getElementById('swal-cat').value;
                    payload.Category = rawCat.charAt(0).toUpperCase() + rawCat.slice(1);
                    
                    payload.Script = document.getElementById('swal-script').value;
                    payload.Code = document.getElementById('swal-code').value;
                    payload.Image = document.getElementById('swal-img').value;
                    payload.Date = new Date().toISOString();
                }
                return payload;
            }
        });

        if (formValues && formValues.Title) {
            Swal.fire({ title: 'Ekleniyor...', didOpen: () => Swal.showLoading() });
            try {
                const { error } = await sb.from('Data').insert(formValues);
                if (error) throw error;
                saveLog("Yeni İçerik/Duyuru Ekleme", formValues.Title);
                Swal.fire('Başarılı', 'Eklendi.', 'success');
                await loadContentData();
            } catch (e) {
                Swal.fire('Hata', 'Eklenemedi: ' + e.message, 'error');
            }
        }
    }
}

// Zorunlu Duyuru Popup Fonksiyonu
async function checkMandatoryAnnouncements() {
    const myGroup = (getMyGroup() || '').toLowerCase();
    const activeMandatory = newsData.filter(n => {
        if (!n.isMandatory || n.status === 'Pasif') return false;
        // Grup kontrolü
        if (!n.targetGroups || n.targetGroups.trim() === '') return true; // Herkes
        const targets = n.targetGroups.toLowerCase().split(',').map(g => g.trim());
        return targets.includes(myGroup);
    });

    if (activeMandatory.length === 0) return;

    // Supabase'den bu kullanıcının gördüğü duyuruları çek
    let dbSeenList = [];
    try {
        const { data, error } = await sb.from('SeenAnnouncements').select('ann_id, date_key').eq('user_name', currentUser);
        if (!error && data) dbSeenList = data;
    } catch (e) {
        console.error("[Pusula] Görüldü bilgisi çekilemedi:", e);
    }

    // Sadece henüz görmediklerimizi göster
    for (const ann of activeMandatory) {
        // Anti-Grafiti: Tarih değişirse tekrar gösterilmesi için key'e tarihi de ekliyoruz
        const dateKey = (ann.date || '').replace(/\s+/g, '');
        const seenKey = `seen_ann_${ann.id}_${dateKey}_${currentUser}`;

        // Veritabanı kontrolü (Ana Karar Verici)
        const isSeenInDb = dbSeenList.some(x => String(x.ann_id) === String(ann.id) && x.date_key === dateKey);

        if (isSeenInDb) continue;

        const waitTime = (ann.popupTimer || 30) * 1000;

        // Premium Popup'ı göster
        await Swal.fire({
            html: `
                <div style="text-align:left; font-family:'Outfit', sans-serif; position:relative;">
                    <!-- Üst Şerit -->
                    <div style="position:absolute; top:-40px; left:-40px; right:-40px; height:6px; background: linear-gradient(90deg, #0e1b42, #ff4d4d); border-radius:12px 12px 0 0;"></div>
                    
                    <div style="display:flex; align-items:center; gap:15px; margin-bottom:20px; border-bottom:2px solid #f1f5f9; padding-bottom:15px;">
                        <div style="width:45px; height:45px; background:#fef2f2; border-radius:12px; display:flex; align-items:center; justify-content:center; color:#ef4444; font-size:1.5rem;">
                            <i class="fas fa-bullhorn fa-beat"></i>
                        </div>
                        <div>
                            <span style="font-size:0.7rem; font-weight:800; color:#ef4444; text-transform:uppercase; letter-spacing:1px; display:block; margin-bottom:2px;">Kritik Güncelleme</span>
                            <h2 style="margin:0; font-size:1.6rem; font-weight:900; color:#0e1b42; letter-spacing:-0.5px;">${ann.title}</h2>
                        </div>
                    </div>

                    <div class="mandatory-ann-content" style="max-height:65vh; overflow-y:auto; padding-right:10px;">
                        ${ann.image ? `
                            <div style="position:relative; margin-bottom:25px;">
                                <img src="${ann.image}" style="width:100%; border-radius:16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border:1px solid #e2e8f0; object-fit:cover; max-height:400px;">
                            </div>
                        ` : ''}
                        
                        <div style="font-size:1.15rem; line-height:1.7; color:#1e293b; white-space:pre-line; background:#f8fafc; padding:20px; border-radius:16px; border-left:4px solid #0e1b42;">
                            ${ann.desc}
                        </div>
                    </div>

                    <div style="margin-top:25px; display:flex; align-items:center; justify-content:space-between; padding-top:20px; border-top:1px solid #f1f5f9;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <i class="fas fa-calendar-alt" style="color:#94a3b8;"></i>
                            <span style="font-size:0.85rem; color:#64748b; font-weight:600;">${ann.date}</span>
                        </div>
                        <div style="font-size:0.75rem; color:#94a3b8; font-style:italic; font-weight:500;">
                            <i class="fas fa-clock"></i> Otomatik kapanmaya ${ann.popupTimer || 30} saniye
                        </div>
                    </div>
                </div>
            `,
            width: 900,
            padding: '40px',
            background: '#ffffff',
            allowOutsideClick: false,
            timer: waitTime,
            timerProgressBar: true,
            confirmButtonText: '<i class="fas fa-check-circle"></i> Okudum, Anladım',
            confirmButtonColor: '#0e1b42',
            customClass: {
                confirmButton: 'premium-confirm-btn',
                popup: 'premium-mandatory-popup'
            },
            didOpen: () => {
                try { new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play(); } catch (e) { }
            }
        });

        // Gördü olarak hem locale hem DB'ye işaretle
        localStorage.setItem(seenKey, 'true');
        try {
            await sb.from('SeenAnnouncements').insert({
                ann_id: ann.id,
                user_name: currentUser,
                date_key: dateKey
            });
        } catch (e) { }
    }
}

// --- VIDEO POPUP ---
function getEmbedUrl(raw) {
    if (!raw) return '';
    raw = raw.trim();
    // YouTube
    const ytMatch = raw.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch && ytMatch[1]) {
        const ytId = ytMatch[1];
        
        // --- LOKAL DOSYA KULLANIMI (file://) DESTEĞİ ---
        // Eğer sayfa bir site gibi değil de direkt klasörden açılıyorsa origin hatasını (153) önlemek için sade link kullanıyoruz.
        if (window.location.protocol === 'file:') {
            return `https://www.youtube.com/embed/${ytId}?rel=0`;
        }

        const origin = window.location.origin;
        // Web ortamında (http/https) tam sürüm parametreler
        return `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(origin)}`;
    }
    // YouTube embed zaten
    if (raw.includes('youtube.com/embed')) return raw;
    // Vimeo
    let vMatch = raw.match(/vimeo\.com\/(\d+)/);
    if (vMatch) return `https://player.vimeo.com/video/${vMatch[1]}?autoplay=1`;
    // Drive
    let dMatch = raw.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (dMatch) return `https://drive.google.com/file/d/${dMatch[1]}/preview`;
    // Generic iframe (diger)
    return raw;
}

async function checkVideoPopups() {
    if (!videoPopups || videoPopups.length === 0) return;
    const myGroup = (getMyGroup() || '').toLowerCase();

    // Supabase'den bu kullanıcının gördüğü duyuruları çek (Video logları da aynı tabloda)
    let dbSeenList = [];
    try {
        const { data, error } = await sb.from('SeenAnnouncements').select('ann_id, date_key').eq('user_name', currentUser);
        if (!error && data) dbSeenList = data;
    } catch (e) {
        console.error("[Pusula] Video görüldü bilgisi çekilemedi:", e);
    }

    const pending = videoPopups.filter(v => {
        if (v.status === 'Pasif') return false;

        // Admin veya LocAdmin her şeyi görür (kısıtlama yok)
        const isActuallyAdmin = (isAdminMode || isLocAdmin);

        if (!isActuallyAdmin && v.targetGroups && v.targetGroups.trim() !== '') {
            const targets = v.targetGroups.toLowerCase().split(',').map(g => g.trim());
            if (!targets.includes(myGroup)) return false;
        }

        // 1. LocalStorage kontrolü (hızlı filtre)
        const key = `vp_seen_${v.id}_${currentUser}`;
        if (localStorage.getItem(key)) return false;

        // 2. Veritabanı kontrolü (silinen çerezlere karşı)
        let dateKey = 'fixed';
        if (v.date) {
            try {
                const dObj = new Date(v.date);
                if (!isNaN(dObj.getTime())) {
                    const dd = String(dObj.getDate()).padStart(2, '0');
                    const mm = String(dObj.getMonth() + 1).padStart(2, '0');
                    const yyyy = dObj.getFullYear();
                    dateKey = `${dd}.${mm}.${yyyy}`;
                }
            } catch(e) {}
        }

        const isSeenInDb = dbSeenList.some(x => String(x.ann_id) === String(v.id) && x.date_key === dateKey);

        return !isSeenInDb;
    });

    if (pending.length === 0) return;

    for (const vid of pending) {
        const url = vid.url ? vid.url.trim() : '';
        if (!url) continue;

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
                <div id="vp-embed-wrapper" style="position:relative; padding-bottom:56.25%; height:0; margin: 0 -16px;">
                    <iframe id="vp-iframe" src="${embedSrc}"
                        style="position:absolute; top:0; left:0; width:100%; height:100%; border:none; border-radius:0 0 8px 8px;"
                        allow="autoplay; encrypted-media; fullscreen"
                        allowfullscreen>
                    </iframe>
                    <div id="vp-fallback" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:#1a1a2e; border-radius:0 0 8px 8px; flex-direction:column; justify-content:center; align-items:center; gap:15px; padding:20px; text-align:center;">
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
            confirmButtonText: '<i class="fas fa-check"></i> İzledim, Kapat',
            confirmButtonColor: '#0e1b42',
            allowOutsideClick: false,
            showCloseButton: false,
            customClass: { popup: 'video-popup-modal' },
            didOpen: () => {
                const iframe = document.getElementById('vp-iframe');
                const fallback = document.getElementById('vp-fallback');
                if (iframe && fallback) {
                    iframe.onerror = () => { iframe.style.display = 'none'; fallback.style.display = 'flex'; };
                    setTimeout(() => {
                        try {
                            // Cross-origin check is limited, fallback is shown if loading feels blocked
                        } catch (e) { }
                    }, 4000);
                }
            }
        });

        const key = `vp_seen_${vid.id}_${currentUser}`;
        localStorage.setItem(key, 'true');

        // DB'ye Log At (Göründü olarak)
        try {
            let dateKey = 'fixed';
            if (vid.date) {
                const dObj = new Date(vid.date);
                const dd = String(dObj.getDate()).padStart(2, '0');
                const mm = String(dObj.getMonth() + 1).padStart(2, '0');
                const yyyy = dObj.getFullYear();
                dateKey = `${dd}.${mm}.${yyyy}`;
            }

            await sb.from('SeenAnnouncements').insert({
                ann_id: vid.id,
                user_name: currentUser,
                date_key: dateKey
            });
        } catch (e) {
            console.warn("Video görülme kaydı atılamadı:", e);
        }
    }
}

// Global Alias (İndex.html dropdown butonundan çağrılır)
function addNewCardPopup() {
    addNewContent('card');
}

function showSportDetail(idOrIndex) {
    // If idOrIndex is a number, it's index, if string it's id
    const id = isNaN(idOrIndex) ? idOrIndex : (sportsData[idOrIndex]?.id);
    openGuide();
    setTimeout(() => {
        const card = document.querySelector(`.sg-card[data-id="${id}"]`);
        if (card) card.click();
    }, 300);
}


function openSales() {
    // TeleSatış artık tam ekran modül
    openTelesalesArea();
}
function toggleSales(index) {
    const item = document.getElementById(`sales-${index}`);
    const icon = document.getElementById(`icon-${index}`);
    item.classList.toggle('active');
    if (item.classList.contains('active')) { icon.classList.replace('fa-chevron-down', 'fa-chevron-up'); }
    else { icon.classList.replace('fa-chevron-up', 'fa-chevron-down'); }
}


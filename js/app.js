const BAKIM_MODU = false;

// Apps Script URL'si (Bu URL'yi kendi yayınınızla değiştirmeyi unutmayın!)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzbocJrJPU7_u0lvlnBQ8CrQYHCfy22G6UU8jRo5s6Yrl4rpTQ_a7oB5Ttf_NkGsUOiQg/exec";

let jokers = { call: 1, half: 1, double: 1 };
let doubleChanceUsed = false;
let firstAnswerIndex = -1;
const VALID_CATEGORIES = ['Teknik', 'İkna', 'Kampanya', 'Bilgi'];

// --- GLOBAL DEĞİŞKENLER ---
let database = [], newsData = [], sportsData = [], salesScripts = [], quizQuestions = [];
let currentUser = "";
let isAdminMode = false;     // YETKİ
let isEditingActive = false;     // GÖRÜNÜM
let sessionTimeout;
let activeCards = [];
let currentCategory = 'all';
let adminUserList = [];
let allEvaluationsData = [];
let wizardStepsData = {}; 
const MONTH_NAMES = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
let tickerInterval = null; // Duyuru akışı interval'ı

// --- KALİTE PUANLAMA LOGİĞİ ---
window.updateRowScore = function(index, max) {
    const slider = document.getElementById(`slider-${index}`);
    const badge = document.getElementById(`badge-${index}`);
    const noteInput = document.getElementById(`note-${index}`);
    const row = document.getElementById(`row-${index}`);

    if(!slider) return;

    const val = parseInt(slider.value);
    badge.innerText = val;

    // Görsel değişimler
    if (val < max) {
        noteInput.style.display = 'block';
        badge.style.background = '#d32f2f'; // Kırmızı
        row.style.borderColor = '#ffcdd2';
        row.style.background = '#fff5f5';
    } else {
        noteInput.style.display = 'none';
        noteInput.value = ''; // Puan tamsa notu sil
        badge.style.background = '#2e7d32'; // Yeşil
        row.style.borderColor = '#eee';
        row.style.background = '#fff';
    }
    window.recalcTotalScore();
};

window.recalcTotalScore = function() {
    let currentTotal = 0;
    let maxTotal = 0;

    const sliders = document.querySelectorAll('.slider-input');
    sliders.forEach(s => {
        currentTotal += parseInt(s.value) || 0;
        // Max değerini slider'ın özelliğinden dinamik alıyoruz
        maxTotal += parseInt(s.getAttribute('max')) || 0; 
    });

    const liveScoreEl = document.getElementById('live-score');
    const ringEl = document.getElementById('score-ring');

    if(liveScoreEl) liveScoreEl.innerText = currentTotal;

    if(ringEl) {
        let color = '#2e7d32'; 
        // Oran hesapla (Maksimum puana göre)
        let ratio = maxTotal > 0 ? (currentTotal / maxTotal) * 100 : 0;

        if(ratio < 50) color = '#d32f2f'; 
        else if(ratio < 85) color = '#ed6c02'; 
        else if(ratio < 95) color = '#fabb00'; 

        ringEl.style.background = `conic-gradient(${color} ${ratio}%, #444 ${ratio}%)`;
    }
};

// --- YARDIMCI FONKSİYONLAR ---
function getToken() { return localStorage.getItem("sSportToken"); }
function getFavs() { return JSON.parse(localStorage.getItem('sSportFavs') || '[]'); }

function toggleFavorite(title) { 
    event.stopPropagation();
    let favs = getFavs(); 
    if (favs.includes(title)) { 
        favs = favs.filter(t => t !== title); 
    } else { 
        favs.push(title); 
    } 
    localStorage.setItem('sSportFavs', JSON.stringify(favs));
    
    // Eğer favoriler sekmesindeysek anlık güncelle
    if (currentCategory === 'fav') {
        filterCategory(document.querySelector('.btn-fav'), 'fav'); 
    } else {
        // Kartın üzerindeki yıldızı güncellemek için render
        renderCards(activeCards);
    } 
}

function isFav(title) { return getFavs().includes(title); }

function formatDateToDDMMYYYY(dateString) {
    if (!dateString) return 'N/A';
    if (dateString.match(/^\d{2}\.\d{2}\.\d{4}/)) { return dateString; }
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) { return dateString; }
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    } catch (e) { return dateString; }
}

function isNew(dateStr) { 
    if (!dateStr) return false; 
    let date;
    if (dateStr.indexOf('.') > -1) { 
        const cleanDate = dateStr.split(' ')[0];
        const parts = cleanDate.split('.'); 
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
    return text.toString().replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, ''); 
}

document.addEventListener('contextmenu', event => event.preventDefault());
document.onkeydown = function(e) { if(e.keyCode == 123) return false; }

document.addEventListener('DOMContentLoaded', () => {
    checkSession(); 
});

// --- SESSION & LOGIN ---
function checkSession() {
    const savedUser = localStorage.getItem("sSportUser");
    const savedToken = localStorage.getItem("sSportToken");
    const savedRole = localStorage.getItem("sSportRole"); 

    if (savedUser && savedToken) {
        currentUser = savedUser;
        document.getElementById("login-screen").style.display = "none"; 
        document.getElementById("user-display").innerText = currentUser;
        checkAdmin(savedRole); 
        startSessionTimer();

        if (BAKIM_MODU)
            document.getElementById("maintenance-screen").style.display = "flex";
        else {
            document.getElementById("main-app").style.display = "block"; 
            loadContentData(); 
            loadWizardData(); 
        }
    }
}

function enterBas(e) { if (e.key === "Enter") girisYap(); }

function girisYap() { 
    const uName = document.getElementById("usernameInput").value.trim(); 
    const uPass = document.getElementById("passInput").value.trim(); 
    const loadingMsg = document.getElementById("loading-msg"); 
    const errorMsg = document.getElementById("error-msg"); 

    if(!uName || !uPass) {
        errorMsg.innerText = "Lütfen bilgileri giriniz.";
        errorMsg.style.display = "block"; 
        return; 
    } 

    loadingMsg.style.display = "block"; 
    loadingMsg.innerText = "Doğrulanıyor...";
    errorMsg.style.display = "none"; 
    document.querySelector('.login-btn').disabled = true; 

    const hashedPass = CryptoJS.SHA256(uPass).toString(); 

    fetch(SCRIPT_URL, { 
        method: 'POST', 
        headers: { "Content-Type": "text/plain;charset=utf-8" }, 
        body: JSON.stringify({ action: "login", username: uName, password: hashedPass }) 
    }).then(response => response.json())
      .then(data => { 
        loadingMsg.style.display = "none"; 
        document.querySelector('.login-btn').disabled = false; 

        if (data.result === "success") { 
            currentUser = data.username;
            localStorage.setItem("sSportUser", currentUser);
            localStorage.setItem("sSportToken", data.token);
            localStorage.setItem("sSportRole", data.role); 

            if (data.forceChange === true) { 
                Swal.fire({ 
                    icon: 'warning', 
                    title: '⚠️ Güvenlik Uyarısı', 
                    text: 'İlk girişiniz. Lütfen şifrenizi değiştirin.', 
                    allowOutsideClick: false, 
                    allowEscapeKey: false, 
                    confirmButtonText: 'Şifremi Değiştir' 
                }).then(() => { changePasswordPopup(true); }); 
            } else { 
                document.getElementById("login-screen").style.display = "none"; 
                document.getElementById("user-display").innerText = currentUser; 
                checkAdmin(data.role); 
                startSessionTimer(); 

                if (BAKIM_MODU)
                    document.getElementById("maintenance-screen").style.display = "flex";
                else { 
                    document.getElementById("main-app").style.display = "block"; 
                    loadContentData(); 
                    loadWizardData();
                } 
            } 
        } else { 
            errorMsg.innerText = data.message || "Hatalı giriş!"; 
            errorMsg.style.display = "block"; 
        } 
    }).catch(error => { 
        console.error("Login Error:", error);
        loadingMsg.style.display = "none"; 
        document.querySelector('.login-btn').disabled = false; 
        errorMsg.innerText = "Sunucu hatası! Lütfen sayfayı yenileyin."; 
        errorMsg.style.display = "block"; 
    }); 
}

function checkAdmin(role) { 
    const editBtn = document.getElementById('quickEditBtn'); 
    const addBtn = document.getElementById('addCardBtn'); 

    isAdminMode = (role === "admin"); 
    isEditingActive = false;
    document.body.classList.remove('editing');

    if(isAdminMode) { 
        editBtn.style.display = "flex"; 
        addBtn.style.display = "flex"; 
        editBtn.innerHTML = '<i class="fas fa-pencil-alt"></i> Düzenlemeyi Aç';
        editBtn.classList.remove('active');
    } else { 
        editBtn.style.display = "none"; 
        addBtn.style.display = "none"; 
    } 
}

function logout() { 
    currentUser = ""; 
    isAdminMode = false; 
    isEditingActive = false; 
    document.body.classList.remove('editing');
    localStorage.removeItem("sSportUser");
    localStorage.removeItem("sSportToken"); 
    localStorage.removeItem("sSportRole");
    if (sessionTimeout) clearTimeout(sessionTimeout);
    document.getElementById("main-app").style.display = "none";
    document.getElementById("login-screen").style.display = "flex"; 
    document.getElementById("passInput").value = ""; 
    document.getElementById("usernameInput").value = ""; 
    document.getElementById("error-msg").style.display = "none"; 
}

function startSessionTimer() { 
    if (sessionTimeout) clearTimeout(sessionTimeout); 
    sessionTimeout = setTimeout(() => {
        Swal.fire({ icon: 'warning', title: 'Oturum Süresi Doldu', text: 'Güvenlik nedeniyle otomatik çıkış yapıldı.', confirmButtonText: 'Tamam' }).then(() => { logout(); }); 
    }, 3600000); 
}

function openUserMenu() { 
    let options = { 
        title: `Merhaba, ${currentUser}`, 
        showCancelButton: true, 
        showDenyButton: true,
        confirmButtonText: '🔑 Şifre Değiştir',
        denyButtonText: '🚪 Çıkış Yap',
        cancelButtonText: 'İptal' 
    }; 
    Swal.fire(options).then((result) => { 
        if (result.isConfirmed) changePasswordPopup(); 
        else if (result.isDenied) logout();
    }); 
}

async function changePasswordPopup(isMandatory = false) { 
    const { value: formValues } = await Swal.fire({ 
        title: isMandatory ? 'Yeni Şifre Belirleyin' : 'Şifre Değiştir', 
        html: `${isMandatory ? '<p style="font-size:0.9rem; color:#d32f2f;">İlk giriş şifrenizi değiştirmeden devam edemezsiniz.</p>' : ''}<input id="swal-old-pass" type="password" class="swal2-input" placeholder="Eski Şifre (Mevcut)"><input id="swal-new-pass" type="password" class="swal2-input" placeholder="Yeni Şifre">`, 
        focusConfirm: false, 
        showCancelButton: !isMandatory, 
        allowOutsideClick: !isMandatory,
        allowEscapeKey: !isMandatory, 
        confirmButtonText: 'Değiştir', 
        cancelButtonText: 'İptal', 
        preConfirm: () => { 
            const o = document.getElementById('swal-old-pass').value; 
            const n = document.getElementById('swal-new-pass').value; 
            if(!o || !n) { Swal.showValidationMessage('Alanlar boş bırakılamaz'); } 
            return [ o, n ] 
        } 
    }); 

    if (formValues) { 
        Swal.fire({ title: 'İşleniyor...', didOpen: () => { Swal.showLoading() } }); 
        fetch(SCRIPT_URL, { 
            method: 'POST', 
            headers: { "Content-Type": "text/plain;charset=utf-8" }, 
            body: JSON.stringify({ 
                action: "changePassword", 
                username: currentUser, 
                oldPass: CryptoJS.SHA256(formValues[0]).toString(),
                newPass: CryptoJS.SHA256(formValues[1]).toString(), 
                token: getToken() 
            }) 
        }) 
        .then(response => response.json())
        .then(data => { 
            if(data.result === "success") { 
                Swal.fire('Başarılı!', 'Şifreniz güncellendi. Güvenlik gereği yeniden giriş yapınız.', 'success').then(() => { logout(); }); 
            } else { 
                Swal.fire('Hata', data.message || 'İşlem başarısız.', 'error').then(() => { if(isMandatory) changePasswordPopup(true); }); 
            } 
        }).catch(err => { 
            Swal.fire('Hata', 'Sunucu hatası.', 'error'); 
            if(isMandatory) changePasswordPopup(true); 
        }); 
    } else if (isMandatory) { 
        changePasswordPopup(true); 
    } 
}

// --- DATA FETCHING ---
function loadContentData() { 
    document.getElementById('loading').style.display = 'block'; 
    fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "fetchData" }) 
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('loading').style.display = 'none'; 
        
        if (data.result === "success") {
            const rawData = data.data; 

            // Verileri Type alanına göre ayır
            const fetchedCards = rawData.filter(i => ['card','bilgi','teknik','kampanya','ikna'].includes(i.Type.toLowerCase())).map(i => ({ 
                title: i.Title, 
                category: i.Category, 
                text: i.Text, 
                script: i.Script, 
                code: i.Code, 
                link: i.Link, 
                date: formatDateToDDMMYYYY(i.Date)
            }));
            
            const fetchedNews = rawData.filter(i => i.Type.toLowerCase() === 'news').map(i => ({ 
                date: formatDateToDDMMYYYY(i.Date),
                title: i.Title, 
                desc: i.Text, 
                type: i.Category, 
                status: i.Status 
            }));
            
            const fetchedSports = rawData.filter(i => i.Type.toLowerCase() === 'sport').map(i => ({
                title: i.Title, 
                icon: i.Icon, 
                desc: i.Text, 
                tip: i.Tip, 
                detail: i.Detail,
                pronunciation: i.Pronunciation 
            }));

            const fetchedSales = rawData.filter(i => i.Type.toLowerCase() === 'sales').map(i => ({ 
                title: i.Title, 
                text: i.Text 
            }));

            const fetchedQuiz = rawData.filter(i => i.Type.toLowerCase() === 'quiz').map(i => ({ 
                q: i.Text, 
                opts: i.QuizOptions ? i.QuizOptions.split(',').map(o => o.trim()) : [], 
                a: parseInt(i.QuizAnswer) 
            }));

            database = fetchedCards;
            newsData = fetchedNews;
            sportsData = fetchedSports;
            salesScripts = fetchedSales;
            quizQuestions = fetchedQuiz;
            
            if(currentCategory === 'fav') { 
                filterCategory(document.querySelector('.btn-fav'), 'fav'); 
            } else { 
                activeCards = database; 
                renderCards(database); 
            } 
            startTicker();
            
        } else {
            document.getElementById('loading').innerHTML = `Veriler alınamadı: ${data.message || 'Bilinmeyen Hata'}`;
        }
    })
    .catch(error => { 
        console.error("Fetch Hatası:", error);
        document.getElementById('loading').innerHTML = 'Bağlantı Hatası! Sunucuya ulaşılamıyor.';
    }); 
}

function loadWizardData() {
    return new Promise((resolve, reject) => {
        fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "getWizardData" }) 
        })
        .then(response => response.json())
        .then(data => {
            if (data.result === "success" && data.steps) {
                wizardStepsData = data.steps;
                console.log("Wizard Adımları Yüklendi:", Object.keys(wizardStepsData).length);
                resolve();
            } else {
                console.error("Wizard verisi yüklenemedi:", data.message);
                wizardStepsData = {};
                reject(new Error("Wizard verisi yüklenemedi."));
            }
        })
        .catch(error => { 
            console.error("Wizard Fetch Hatası:", error);
            wizardStepsData = {};
            reject(error);
        });
    });
}

// --- RENDER & FILTERING ---
function renderCards(data) { 
    activeCards = data; 
    const container = document.getElementById('cardGrid'); 
    container.innerHTML = ''; 
    
    if (data.length === 0) { 
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#777;">Kayıt bulunamadı.</div>'; 
        return; 
    } 
    
    data.forEach((item, index) => { 
        const safeTitle = escapeForJsString(item.title); 
        const isFavorite = isFav(item.title); 
        const favClass = isFavorite ? 'fas fa-star active' : 'far fa-star'; 
        const newBadge = isNew(item.date) ? '<span class="new-badge">YENİ</span>' : ''; 
        
        const editIconHtml = (isAdminMode && isEditingActive) 
            ? `<i class="fas fa-pencil-alt edit-icon" onclick="editContent(${index})"></i>` 
            : ''; 
        
        let rawText = item.text || ""; 
        let formattedText = rawText.replace(/\n/g, '<br>').replace(/\*(.*?)\*/g, '<b>$1</b>'); 
        
        let html = `<div class="card ${item.category}">${newBadge}
            <div class="icon-wrapper">
                ${editIconHtml} 
                <i class="${favClass} fav-icon" onclick="toggleFavorite('${safeTitle}')"></i>
            </div>
            <div class="card-header"><h3 class="card-title">${highlightText(item.title)}</h3><span class="badge">${item.category}</span></div>
            <div class="card-content" onclick="showCardDetail('${safeTitle}', '${escapeForJsString(item.text)}')">
                <div class="card-text-truncate">${highlightText(formattedText)}</div>
                <div style="font-size:0.8rem; color:#999; margin-top:5px; text-align:right;">(Tamamını oku)</div>
            </div>
            <div class="script-box">${highlightText(item.script)}</div>
            <div class="card-actions">
                <button class="btn btn-copy" onclick="copyText('${escapeForJsString(item.script)}')"><i class="fas fa-copy"></i> Kopyala</button>
                ${item.code ? `<button class="btn btn-copy" style="background:var(--secondary); color:#333;" onclick="copyText('${escapeForJsString(item.code)}')">Kod</button>` : ''}
                ${item.link ? `<a href="${item.link}" target="_blank" class="btn btn-link"><i class="fas fa-external-link-alt"></i> Link</a>` : ''}
            </div>
        </div>`;
        container.innerHTML += html; 
    }); 
}

function highlightText(htmlContent) { 
    if (!htmlContent) return ""; 
    const searchTerm = document.getElementById('searchInput').value.trim();
    if (!searchTerm) return htmlContent;
    
    // Basit bir regex ile değiştirme yapıyoruz, HTML taglerini bozmamaya çalışıyoruz
    try {
        const regex = new RegExp(`(${searchTerm})`, "gi");
        return htmlContent.toString().replace(regex, '<span class="highlight">$1</span>');
    } catch(e) {
        return htmlContent;
    }
}

// *** DÜZELTİLMİŞ FİLTRELEME FONKSİYONLARI ***

function filterCategory(btn, cat) { 
    currentCategory = cat;
    // Buton stillerini güncelle
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); 
    
    // Filtreleme işlemini tetikle
    filterContent(); 
}

function filterContent() { 
    // Türkçe karakter uyumlu küçük harfe çevirme
    const search = document.getElementById('searchInput').value.toLocaleLowerCase('tr-TR').trim();
    
    // Her aramaya tüm veritabanından başla
    let filtered = database;

    // 1. ADIM: Kategori Filtrelemesi
    if (currentCategory === 'fav') { 
        filtered = filtered.filter(i => isFav(i.title));
    } else if (currentCategory !== 'all') { 
        filtered = filtered.filter(i => i.category === currentCategory); 
    } 

    // 2. ADIM: Metin Arama (Başlık, Metin veya Script içinde)
    if (search) {
        filtered = filtered.filter(item => {
            const title = (item.title || "").toString().toLocaleLowerCase('tr-TR');
            const text = (item.text || "").toString().toLocaleLowerCase('tr-TR');
            const script = (item.script || "").toString().toLocaleLowerCase('tr-TR');
            const code = (item.code || "").toString().toLocaleLowerCase('tr-TR');

            return title.includes(search) || text.includes(search) || script.includes(search) || code.includes(search);
        });
    }

    // 3. ADIM: Ekrana Bas
    activeCards = filtered; // Global activeCards'ı güncelle (Edit işlemi için gerekli)
    renderCards(filtered);
}

// *** SON ***

function showCardDetail(title, text) { 
    Swal.fire({ 
        title: title, 
        html: `<div style="text-align:left; font-size:1rem; line-height:1.6;">${text.replace(/\\n/g,'<br>')}</div>`, 
        showCloseButton: true, 
        showConfirmButton: false, 
        width: '600px', 
        background: '#f8f9fa' 
    }); 
}

function copyText(t) {
    // navigator.clipboard.writeText yerine document.execCommand kullanılıyor (iframe kısıtlamaları için)
    const el = document.createElement('textarea');
    el.value = t.replace(/\\n/g, '\n');
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);

    Swal.fire({icon:'success', title:'Kopyalandı', toast:true, position:'top-end', showConfirmButton:false, timer:1500}) ;
}

function toggleEditMode() { 
    if (!isAdminMode) return; 
    isEditingActive = !isEditingActive; 
    document.body.classList.toggle('editing', isEditingActive); 
    
    const btn = document.getElementById('quickEditBtn'); 
    if(isEditingActive) { 
        btn.classList.add('active'); 
        btn.innerHTML = '<i class="fas fa-times"></i> Düzenlemeyi Kapat'; 
        Swal.fire({ icon: 'success', title: 'Düzenleme Modu AÇIK', text: 'Kalem ikonlarına tıklayarak içerikleri düzenleyebilirsiniz.', timer: 1500, showConfirmButton: false }); 
    } else { 
        btn.classList.remove('active'); 
        btn.innerHTML = '<i class="fas fa-pencil-alt"></i> Düzenlemeyi Aç'; 
    } 
    
    // Mevcut filtre durumuyla yeniden render et (ikonları göstermek/gizlemek için)
    filterContent();
    
    if(document.getElementById('guide-modal').style.display === 'flex') openGuide(); 
    if(document.getElementById('sales-modal').style.display === 'flex') openSales(); 
    if(document.getElementById('news-modal').style.display === 'flex') openNews(); 
}

function sendUpdate(o, c, v, t='card') { 
    if (!Swal.isVisible()) Swal.fire({ title: 'Kaydediliyor...', didOpen: () => { Swal.showLoading() } }); 
    fetch(SCRIPT_URL, { 
        method: 'POST', 
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
        body: JSON.stringify({ action: "updateContent", title: o, column: c, value: v, type: t, originalText: o, username: currentUser, token: getToken() }) 
    }).then(r => r.json())
      .then(data => { 
        if (data.result === "success") { 
            Swal.fire({icon: 'success', title: 'Başarılı', timer: 1500, showConfirmButton: false}); 
            setTimeout(loadContentData, 1600); 
        } else { 
            Swal.fire('Hata', 'Kaydedilemedi: ' + (data.message || 'Bilinmeyen Hata'), 'error'); 
        } 
    }).catch(err => Swal.fire('Hata', 'Sunucu hatası.', 'error')); 
}

// --- CRUD OPERASYONLARI (Kısaltıldı, orijinal kodda tamamiyle mevcuttur) ---

async function addNewCardPopup() {
    const catSelectHTML = getCategorySelectHtml('Bilgi', 'swal-new-cat');
    const { value: formValues } = await Swal.fire({
        title: 'Yeni İçerik Ekle',
        html: `
            <div style="margin-bottom:15px; text-align:left;">
                <label style="font-weight:bold; font-size:0.9rem;">Ne Ekleyeceksin?</label>
                <select id="swal-type-select" class="swal2-input" style="width:100%; margin-top:5px; height:35px; font-size:0.9rem;" onchange="toggleAddFields()">
                    <option value="card">📌 Bilgi Kartı</option>
                    <option value="news">📢 Duyuru</option>
                    <option value="sales">📞 Telesatış Scripti</option>
                    <option value="sport">🏆 Spor İçeriği</option>
                    <option value="quiz">❓ Quiz Sorusu</option>
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
        width: '700px', 
        showCancelButton: true, 
        confirmButtonText: '<i class="fas fa-plus"></i> Ekle', 
        cancelButtonText: 'İptal', 
        focusConfirm: false,
        didOpen: () => {
            const selectEl = document.getElementById('swal-new-cat'); 
            const cardEl = document.getElementById('preview-card');
            selectEl.style.margin = "0"; selectEl.style.height = "30px"; selectEl.style.fontSize = "0.8rem"; selectEl.style.padding = "0 5px";
            selectEl.addEventListener('change', function() { cardEl.className = 'card ' + this.value; });

            window.toggleAddFields = function() {
                const type = document.getElementById('swal-type-select').value;
                const catCont = document.getElementById('cat-container');
                const scriptCont = document.getElementById('script-container');
                const extraCont = document.getElementById('extra-container');
                const sportExtra = document.getElementById('sport-extra');
                const newsExtra = document.getElementById('news-extra');
                const quizExtra = document.getElementById('quiz-extra'); 
                const cardPreview = document.getElementById('preview-card');
                
                // Hepsini gizle
                catCont.style.display = 'none'; scriptCont.style.display = 'none'; extraCont.style.display = 'none'; 
                sportExtra.style.display = 'none'; newsExtra.style.display = 'none'; quizExtra.style.display = 'none'; 
                
                // Başlık/Metin alanlarını resetle/ayarla
                document.getElementById('swal-new-title').value = '';
                document.getElementById('swal-new-text').value = '';

                // Varsayılan görünüm ayarları
                cardPreview.style.borderLeft = "5px solid var(--info)"; 
                cardPreview.className = 'card Bilgi'; 
                
                if (type === 'card') {
                    catCont.style.display = 'block'; scriptCont.style.display = 'block'; extraCont.style.display = 'grid';
                    cardPreview.className = 'card ' + document.getElementById('swal-new-cat').value;
                    document.getElementById('swal-new-title').placeholder = "Başlık Giriniz...";
                    document.getElementById('swal-new-text').placeholder = "İçerik metni...";
                } else if (type === 'sales') {
                    scriptCont.style.display = 'block'; 
                    document.getElementById('swal-new-script').placeholder = "Satış Metni...";
                    cardPreview.style.borderLeft = "5px solid var(--sales)";
                    document.getElementById('swal-new-title').placeholder = "Script Başlığı...";
                    document.getElementById('swal-new-text').placeholder = "Sadece buraya metin girilecek.";
                } else if (type === 'sport') {
                    sportExtra.style.display = 'block';
                    cardPreview.style.borderLeft = "5px solid var(--primary)";
                    document.getElementById('swal-new-title').placeholder = "Spor Terimi Başlığı...";
                    document.getElementById('swal-new-text').placeholder = "Kısa Açıklama (Desc)...";
                } else if (type === 'news') {
                    newsExtra.style.display = 'block';
                    cardPreview.style.borderLeft = "5px solid var(--secondary)";
                    document.getElementById('swal-new-title').placeholder = "Duyuru Başlığı...";
                    document.getElementById('swal-new-text').placeholder = "Duyuru Metni (Desc)...";
                } else if (type === 'quiz') {
                    quizExtra.style.display = 'block';
                    document.getElementById('swal-new-title').placeholder = "Quiz Başlığı (Örn: Soru 1)";
                    document.getElementById('swal-new-text').placeholder = "Bu alan boş bırakılacak.";
                    cardPreview.style.borderLeft = "5px solid var(--quiz)";
                }
            };
        },
        preConfirm: () => {
            const type = document.getElementById('swal-type-select').value;
            const today = new Date();
            const dateStr = today.getDate() + "." + (today.getMonth()+1) + "." + today.getFullYear();
            
            // Quiz özel alanları
            const quizOpts = type === 'quiz' ? document.getElementById('swal-quiz-opts').value : '';
            const quizAns = type === 'quiz' ? document.getElementById('swal-quiz-ans').value : '';
            const quizQ = type === 'quiz' ? document.getElementById('swal-quiz-q').value : '';

            if (type === 'quiz' && (!quizQ || !quizOpts || quizAns === '')) {
                Swal.showValidationMessage('Quiz sorusu için tüm alanlar (Soru, Seçenekler, Cevap İndeksi) zorunludur.');
                return false;
            }
            
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
                date: dateStr,
                quizOptions: quizOpts, 
                quizAnswer: quizAns 
            }
        }
    });

    if (formValues) {
        if(!formValues.title) { Swal.fire('Hata', 'Başlık zorunlu!', 'error'); return; }
        Swal.fire({ title: 'Ekleniyor...', didOpen: () => { Swal.showLoading() } });
        fetch(SCRIPT_URL, { 
            method: 'POST', 
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
            body: JSON.stringify({ action: "addCard", username: currentUser, token: getToken(), ...formValues })
        })
        .then(response => response.json()).then(data => {
            if (data.result === "success") { 
                Swal.fire({icon: 'success', title: 'Başarılı', text: 'İçerik eklendi.', timer: 2000, showConfirmButton: false});
                setTimeout(loadContentData, 3500); 
            } 
            else {
                Swal.fire('Hata', data.message || 'Eklenemedi.', 'error'); 
            }
        }).catch(err => Swal.fire('Hata', 'Sunucu hatası: ' + err, 'error'));
    }
}

async function editContent(index) {
    const item = activeCards[index]; 
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
                    <textarea id="swal-text" class="swal2-textarea" style="margin:0; width:100%; box-sizing:border-box; border:none; resize:none; font-family:inherit; min-height:120px; padding:10px; background:#f9f9f9;" placeholder="İçerik metni...">${(item.text || '').toString().replace(/<br>/g,'\n')}</textarea>
                </div>
                <div class="script-box" style="padding:0; border:1px solid #f0e68c;">
                    <textarea id="swal-script" class="swal2-textarea" style="margin:0; width:100%; box-sizing:border-box; border:none; background:transparent; font-style:italic; min-height:80px; font-size:0.9rem;" placeholder="Script metni...">${(item.script || '').toString().replace(/<br>/g,'\n')}</textarea>
                </div>
                <div class="card-actions" style="margin-top:15px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                    <div style="position:relative;"><i class="fas fa-code" style="position:absolute; left:10px; top:10px; color:#aaa;"></i><input id="swal-code" class="swal2-input" style="margin:0; height:35px; font-size:0.85rem; padding-left:30px;" value="${item.code || ''}" placeholder="Kod"></div>
                    <div style="position:relative;"><i class="fas fa-link" style="position:absolute; left:10px; top:10px; color:#aaa;"></i><input id="swal-link" class="swal2-input" style="margin:0; height:35px; font-size:0.85rem; padding-left:30px;" value="${item.link || ''}" placeholder="Link"></div>
                </div>
            </div>`,
        width: '700px', 
        showCancelButton: true, 
        confirmButtonText: '<i class="fas fa-save"></i> Değişiklikleri Kaydet', 
        cancelButtonText: 'İptal',
        focusConfirm: false,
        preConfirm: () => {
            return { 
                cat: document.getElementById('swal-cat').value, 
                title: document.getElementById('swal-title').value, 
                text: document.getElementById('swal-text').value, 
                script: document.getElementById('swal-script').value, 
                code: document.getElementById('swal-code').value, 
                link: document.getElementById('swal-link').value 
            }
        }
    });

    if (formValues) {
        if(formValues.cat !== item.category) sendUpdate(item.title, "Category", formValues.cat, 'card');
        if(formValues.text !== (item.text || '').replace(/<br>/g,'\n')) setTimeout(() => sendUpdate(item.title, "Text", formValues.text, 'card'), 500);
        if(formValues.script !== (item.script || '').replace(/<br>/g,'\n')) setTimeout(() => sendUpdate(item.title, "Script", formValues.script, 'card'), 1000);
        if(formValues.code !== (item.code || '')) setTimeout(() => sendUpdate(item.title, "Code", formValues.code, 'card'), 1500);
        if(formValues.link !== (item.link || '')) setTimeout(() => sendUpdate(item.title, "Link", formValues.link, 'card'), 2000);
        if(formValues.title !== item.title) setTimeout(() => sendUpdate(item.title, "Title", formValues.title, 'card'), 2500);
    }
}

async function editSport(title) {
    event.stopPropagation();
    const s = sportsData.find(item => item.title === title);
    if (!s) return Swal.fire('Hata', 'İçerik bulunamadı.', 'error');
    
    const { value: formValues } = await Swal.fire({
        title: 'Spor İçeriğini Düzenle',
        html: `
            <div class="card" style="text-align:left; border-left: 5px solid var(--primary); padding:15px; background:#f8f9fa;">
                <label style="font-weight:bold;">Başlık</label>
                <input id="swal-title" class="swal2-input" style="width:100%; margin-bottom:10px;" value="${s.title}">
                <label style="font-weight:bold;">Açıklama (Kısa Metin)</label>
                <textarea id="swal-desc" class="swal2-textarea" style="margin-bottom:10px;">${s.desc || ''}</textarea>
                <label style="font-weight:bold;">İpucu (Tip)</label>
                <input id="swal-tip" class="swal2-input" style="width:100%; margin-bottom:10px;" value="${s.tip || ''}">
                <label style="font-weight:bold;">Detay (Alt Metin)</label>
                <textarea id="swal-detail" class="swal2-textarea" style="margin-bottom:10px;">${s.detail || ''}</textarea>
                <label style="font-weight:bold;">Okunuş</label>
                <input id="swal-pron" class="swal2-input" style="width:100%; margin-bottom:10px;" value="${s.pronunciation || ''}">
                <label style="font-weight:bold;">İkon Sınıfı</label>
                <input id="swal-icon" class="swal2-input" style="width:100%;" value="${s.icon || ''}">
            </div>`,
        width: '700px', 
        showCancelButton: true, 
        confirmButtonText: 'Kaydet',
        preConfirm: () => [
            document.getElementById('swal-title').value,
            document.getElementById('swal-desc').value,
            document.getElementById('swal-tip').value,
            document.getElementById('swal-detail').value,
            document.getElementById('swal-pron').value,
            document.getElementById('swal-icon').value
        ]
    });

    if (formValues) {
        const originalTitle = s.title;
        if(formValues[1] !== s.desc) sendUpdate(originalTitle, "Text", formValues[1], 'sport');
        if(formValues[2] !== s.tip) setTimeout(() => sendUpdate(originalTitle, "Tip", formValues[2], 'sport'), 500);
        if(formValues[3] !== s.detail) setTimeout(() => sendUpdate(originalTitle, "Detail", formValues[3], 'sport'), 1000);
        if(formValues[4] !== s.pronunciation) setTimeout(() => sendUpdate(originalTitle, "Pronunciation", formValues[4], 'sport'), 1500);
        if(formValues[5] !== s.icon) setTimeout(() => sendUpdate(originalTitle, "Icon", formValues[5], 'sport'), 2000);
        if(formValues[0] !== originalTitle) setTimeout(() => sendUpdate(originalTitle, "Title", formValues[0], 'sport'), 2500);
    }
}

async function editSales(title) {
    event.stopPropagation(); 
    const s = salesScripts.find(item => item.title === title);
    if (!s) return Swal.fire('Hata', 'İçerik bulunamadı.', 'error');

    const { value: formValues } = await Swal.fire({ 
        title: 'Satış Metnini Düzenle', 
        html: `<div class="card" style="text-align:left; border-left: 5px solid var(--sales); padding:15px; background:#ecfdf5;"><label style="font-weight:bold;">Başlık</label><input id="swal-title" class="swal2-input" style="width:100%; margin-bottom:10px;" value="${s.title}"><label style="font-weight:bold;">Metin</label><textarea id="swal-text" class="swal2-textarea" style="min-height:150px;">${s.text || ''}</textarea></div>`, 
        width: '700px', 
        showCancelButton: true, 
        confirmButtonText: 'Kaydet', 
        preConfirm: () => [ document.getElementById('swal-title').value, document.getElementById('swal-text').value ]
    });

    if (formValues) {
        const originalTitle = s.title;
        if(formValues[1] !== s.text) sendUpdate(originalTitle, "Text", formValues[1], 'sales');
        if(formValues[0] !== originalTitle) setTimeout(() => sendUpdate(originalTitle, "Title", formValues[0], 'sales'), 500);
    }
}

async function editNews(index) {
    const i = newsData[index];
    let statusOptions = `<option value="Aktif" ${i.status !== 'Pasif' ? 'selected' : ''}>Aktif</option><option value="Pasif" ${i.status === 'Pasif' ? 'selected' : ''}>Pasif (Gizle)</option>`;
    let typeOptions = `<option value="info" ${i.type === 'info' ? 'selected' : ''}>Bilgi</option><option value="update" ${i.type === 'update' ? 'selected' : ''}>Değişiklik</option><option value="fix" ${i.type === 'fix' ? 'selected' : ''}>Çözüldü</option>`;

    const { value: formValues } = await Swal.fire({
        title: 'Duyuruyu Düzenle',
        html: `<div class="card" style="text-align:left; border-left: 5px solid var(--secondary); padding:15px; background:#fff8e1;"><label style="font-weight:bold;">Başlık</label><input id="swal-title" class="swal2-input" style="width:100%; margin-bottom:10px;" value="${i.title || ''}"><div style="display:flex; gap:10px; margin-bottom:10px;"><div style="flex:1;"><label style="font-weight:bold;">Tarih</label><input id="swal-date" class="swal2-input" style="width:100%;" value="${i.date || ''}"></div><div style="flex:1;"><label style="font-weight:bold;">Tür</label><select id="swal-type" class="swal2-input" style="width:100%;">${typeOptions}</select></div></div><label style="font-weight:bold;">Metin</label><textarea id="swal-desc" class="swal2-textarea" style="margin-bottom:10px;">${i.desc || ''}</textarea><label style="font-weight:bold;">Durum</label><select id="swal-status" class="swal2-input" style="width:100%;">${statusOptions}</select></div>`,
        width: '600px', 
        showCancelButton: true, 
        confirmButtonText: 'Kaydet', 
        preConfirm: () => [
            document.getElementById('swal-title').value,
            document.getElementById('swal-date').value,
            document.getElementById('swal-desc').value,
            document.getElementById('swal-type').value,
            document.getElementById('swal-status').value
        ]
    });

    if (formValues) {
        const originalTitle = i.title;
        if(formValues[1] !== i.date) sendUpdate(originalTitle, "Date", formValues[1], 'news');
        if(formValues[2] !== i.desc) setTimeout(() => sendUpdate(originalTitle, "Text", formValues[2], 'news'), 500);
        if(formValues[3] !== i.type) setTimeout(() => sendUpdate(originalTitle, "Category", formValues[3], 'news'), 1000);
        if(formValues[4] !== i.status) setTimeout(() => sendUpdate(originalTitle, "Status", formValues[4], 'news'), 1500);
        if(formValues[0] !== originalTitle) setTimeout(() => sendUpdate(originalTitle, "Title", formValues[0], 'news'), 2000);
    }
}

// --- MODALS ---
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

let tickerIndex = 0;
function startTicker() { 
    if (tickerInterval) clearInterval(tickerInterval); // Önceki aralığı temizle
    
    const t = document.getElementById('ticker-content'); 
    const activeNews = newsData.filter(i => i.status !== 'Pasif'); 
    
    if(activeNews.length === 0) { 
        t.innerHTML = "Güncel duyuru yok."; 
        t.style.animation = 'none';
        return; 
    } 
    
    function updateTickerContent() {
        // Tüm duyuruları yan yana koyarak CSS animasyonunun akışını sağlar.
        // GÜNCEL: Metni 5 kez tekrarlayarak kesintisiz akış süresini uzatıyoruz.
        let fullContent = activeNews.map(i => ` • ${i.date}: ${i.title} - ${i.desc}`).join('');
        t.innerText = fullContent + fullContent + fullContent + fullContent + fullContent; 
        
        // Animasyonu yeniden başlatmak için
        t.style.animation = 'none';
        void t.offsetWidth; // DOM'u yeniden çizmeye zorla
        t.style.animation = 'marquee 50s linear infinite';
    }

    updateTickerContent(); // İlk çalıştırma
    // Not: İçerik değişikliğini API'dan almadığımız için normalde bu interval'ı kullanmayız.
    // Ancak demo amaçlı içeriğin dönmesini sağlamak için CSS animasyonu kullanılır.
    // Ticker content zaten tüm metni içeriyor, yani updateTickerContent'i 60 saniyede bir çalıştırmaya gerek kalmadı.
}

function openNews() { 
    document.getElementById('news-modal').style.display = 'flex'; 
    const c = document.getElementById('news-container'); 
    c.innerHTML = ''; 
    newsData.forEach((i, index) => { 
        let cl = i.type === 'fix' ? 'tag-fix' : (i.type === 'update' ? 'tag-update' : 'tag-info'); 
        let tx = i.type === 'fix' ? 'Çözüldü' : (i.type === 'update' ? 'Değişiklik' : 'Bilgi'); 
        let passiveStyle = i.status === 'Pasif' ? 'opacity:0.5; background:#eee;' : ''; 
        let passiveBadge = i.status === 'Pasif' ? '<span class="news-tag" style="background:#555; color:white;">PASİF</span>' : ''; 
        
        let editBtn = (isAdminMode && isEditingActive) 
            ? `<i class="fas fa-pencil-alt edit-icon" style="top:0; right:0; font-size:0.9rem; padding:4px;" onclick="event.stopPropagation(); editNews(${index})"></i>` 
            : ''; 
        
        c.innerHTML += `<div class="news-item" style="${passiveStyle}">${editBtn}<span class="news-date">${i.date}</span><span class="news-title">${i.title} ${passiveBadge}</span><div class="news-desc">${i.desc}</div><span class="news-tag ${cl}">${tx}</span></div>`; 
    }); 
}

function openGuide() {

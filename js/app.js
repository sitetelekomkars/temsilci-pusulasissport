const BAKIM_MODU = false;

// Apps Script URL (Senin URL'in)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzbocJrJPU7_u0lvlnBQ8CrQYHCfy22G6UU8jRo5s6Yrl4rpTQ_a7oB5Ttf_NkGsUOiQg/exec";

// --- YENİ EKLENEN UI KODLARI ---
// Header scroll efekti
window.addEventListener('scroll', () => {
    const header = document.querySelector('.main-header');
    if (window.scrollY > 10) {
        header.style.background = 'rgba(14, 27, 66, 0.95)';
        header.style.backdropFilter = 'blur(10px)';
    } else {
        header.style.background = 'var(--primary)';
        header.style.backdropFilter = 'none';
    }
});

// Ctrl+K ile Arama Kısayolu
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('searchInput').focus();
    }
});
// ------------------------------

let jokers = { call: 1, half: 1, double: 1 };
let doubleChanceUsed = false;
let firstAnswerIndex = -1;
const VALID_CATEGORIES = ['Teknik', 'İkna', 'Kampanya', 'Bilgi'];

// --- GLOBAL DEĞİŞKENLER ---
let database = [], newsData = [], sportsData = [], salesScripts = [], quizQuestions = [];
let currentUser = "";
let isAdminMode = false;    
let isEditingActive = false;    
let sessionTimeout;
let activeCards = [];
let currentCategory = 'all';
let adminUserList = [];
let allEvaluationsData = [];
let wizardStepsData = {}; 
const MONTH_NAMES = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

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
        // İkon sadece stil değişikliği ile görünür
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

// ... Kalan fonksiyonlar (changePasswordPopup, loadContentData, renderCards, filter vb.) aynı şekilde korunuyor ...
// Sadece renderCards fonksiyonunda görsel güncellemeyi yansıtan HTML yapısını kontrol edelim:

function renderCards(data) { 
    activeCards = data; 
    const container = document.getElementById('cardGrid'); 
    container.innerHTML = ''; 
    
    if (data.length === 0) { 
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#777;"><i class="fas fa-search fa-3x" style="opacity:0.3; margin-bottom:20px;"></i><br>Aradığınız kriterlere uygun kayıt bulunamadı.</div>'; 
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
        
        // YENİ KART YAPISI (CSS Class'lar uyumlu)
        let html = `<div class="card ${item.category}">${newBadge}
            <div class="icon-wrapper">
                ${editIconHtml} 
                <i class="${favClass} fav-icon" onclick="toggleFavorite('${safeTitle}')"></i>
            </div>
            <div class="card-header">
                <h3 class="card-title">${highlightText(item.title)}</h3>
                <span class="badge">${item.category}</span>
            </div>
            <div class="card-content" onclick="showCardDetail('${safeTitle}', '${escapeForJsString(item.text)}')">
                <div class="card-text-truncate">${highlightText(formattedText)}</div>
                <div style="font-size:0.8rem; color:var(--primary); font-weight:600; margin-top:8px;">Devamını Oku <i class="fas fa-arrow-right" style="font-size:0.7rem;"></i></div>
            </div>
            <div class="script-box">${highlightText(item.script)}</div>
            <div class="card-actions">
                <button class="btn btn-copy" onclick="copyText('${escapeForJsString(item.script)}')"><i class="fas fa-copy"></i> Script</button>
                ${item.code ? `<button class="btn btn-copy" style="background:#f3f4f6;" onclick="copyText('${escapeForJsString(item.code)}')"><i class="fas fa-code"></i> Kod</button>` : ''}
                ${item.link ? `<a href="${item.link}" target="_blank" class="btn btn-link"><i class="fas fa-external-link-alt"></i> Link</a>` : ''}
            </div>
        </div>`;
        container.innerHTML += html; 
    }); 
}

// ... DİĞER FONKSİYONLARIN HEPSİ AYNI KALACAK ...
// (Buraya kodun geri kalanını kopyalayıp yapıştırabilirsiniz, ID'ler aynı olduğu için çalışacaktır.)
// Sadece filterCategory fonksiyonunda buton class isimlerini güncelledim (active class mantığı aynı)

function filterCategory(btn, cat) { 
    currentCategory = cat;
    document.querySelectorAll('.chip').forEach(b => b.classList.remove('active')); // chip class'ını seçiyoruz
    btn.classList.add('active'); 
    filterContent(); 
}

// ... Kalan tüm fonksiyonlar (showCardDetail, copyText, editContent vb.) orijinal kodunuzdaki gibi kalabilir.
// Sadece closeModal ve modal açma fonksiyonlarının ID'leri HTML ile eşleştiğinden emin olun (eşleşiyor).

// Ticker fonksiyonu (HTML'deki ID: ticker-content)
function startTicker() { 
    const t = document.getElementById('ticker-content'); 
    const activeNews = newsData.filter(i => i.status !== 'Pasif'); 
    if(activeNews.length === 0) { 
        t.innerHTML = "Güncel duyuru yok."; 
        return; 
    } 
    let tickerIndex = 0;
    function showNext() { 
        const i = activeNews[tickerIndex]; 
        // Fade effect
        t.style.opacity = 0;
        setTimeout(() => {
            t.innerHTML = `<strong>${i.date}:</strong> ${i.title}`; 
            t.style.opacity = 1;
        }, 300);
        tickerIndex = (tickerIndex + 1) % activeNews.length; 
    } 
    showNext(); 
    setInterval(showNext, 5000); // 5 saniyede bir değişsin
}

// --- DİĞER TÜM FONKSİYONLARI (CRUD, QUALITY, WIZARD VS.) BURAYA EKLEYİN ---
// Orijinal app.js dosyanızdaki diğer tüm fonksiyonları buraya yapıştırabilirsiniz.
// Sadece yukarıdaki renderCards ve filterCategory fonksiyonlarını benim verdiklerimle değiştirin.

// ... (Geri kalan kodlar) ...

// --- FİLTRELEME FONKSİYONU ---
function filterContent() { 
    const search = document.getElementById('searchInput').value.toLocaleLowerCase('tr-TR').trim();
    let filtered = database;

    if (currentCategory === 'fav') { 
        filtered = filtered.filter(i => isFav(i.title));
    } else if (currentCategory !== 'all') { 
        filtered = filtered.filter(i => i.category === currentCategory); 
    } 

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
    renderCards(filtered);
}

function highlightText(htmlContent) { 
    if (!htmlContent) return ""; 
    const searchTerm = document.getElementById('searchInput').value.trim();
    if (!searchTerm) return htmlContent;
    try {
        const regex = new RegExp(`(${searchTerm})`, "gi");
        return htmlContent.toString().replace(regex, '<span class="highlight">$1</span>');
    } catch(e) {
        return htmlContent;
    }
}
// --- SON ---

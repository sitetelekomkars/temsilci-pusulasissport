const BAKIM_MODU = false;
 
// Apps Script URL'si (Bu URL'yi kendi yayınınızla
// değiştirmeyi unutmayın!)
const SCRIPT_URL =
"https://script.google.com/macros/s/AKfycbzbocJrJPU7_u0lvlnBQ8CrQYHCfy22G6UU8jRo5s6Yrl4rpTQ_a7oB5Ttf_NkGsUOiQg/exec";
 
let jokers = { call: 1, half: 1, double: 1 };
let doubleChanceUsed = false;
let firstAnswerIndex = -1;
const VALID_CATEGORIES = ['Teknik', 'İkna', 'Kampanya',
'Bilgi'];
 
// --- GLOBAL DEĞİŞKENLER ---
let database = [], newsData = [], sportsData = [],
salesScripts = [], quizQuestions = [];
let currentUser = "";
let isAdminMode = false;    // YETKİ
let isEditingActive = false;    // GÖRÜNÜM
let sessionTimeout;
let activeCards = [];
let currentCategory = 'all';
let adminUserList = [];
let allEvaluationsData = [];
let wizardStepsData = {}; 
const MONTH_NAMES = ["Ocak", "Şubat",
"Mart", "Nisan", "Mayıs", "Haziran",
"Temmuz", "Ağustos", "Eylül", "Ekim",
"Kasım", "Aralık"];
 
// --- KALİTE PUANLAMA LOGİĞİ ---
window.updateRowScore = function(index, max) {
    const slider =
document.getElementById(`slider-${index}`);
    const badge =
document.getElementById(`badge-${index}`);
    const noteInput =
document.getElementById(`note-${index}`);
    const row =
document.getElementById(`row-${index}`);
 
    if(!slider)
return;
 
    const val =
parseInt(slider.value);
    badge.innerText =
val;
 
    // Görsel
// değişimler
    if (val < max)
{
        noteInput.style.display = 'block'; // Kırılım
// notunu göster
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
    let currentTotal =
0;
    let maxTotal = 0;
 
    const sliders =
document.querySelectorAll('.slider-input');
    sliders.forEach(s
=> {
        currentTotal
+= parseInt(s.value) || 0;
        // Max
// değerini slider'ın özelliğinden dinamik alıyoruz
        maxTotal +=
parseInt(s.getAttribute('max')) || 0; 
    });
 
    const liveScoreEl
= document.getElementById('live-score');
    const ringEl =
document.getElementById('score-ring');
 
    if(liveScoreEl)
liveScoreEl.innerText = currentTotal;
 
    if(ringEl) {
        let color =
'#2e7d32'; 
        // Oran
// hesapla (Maksimum puana göre)
        let ratio =
maxTotal > 0 ? (currentTotal / maxTotal) * 100 : 0;
 
        if(ratio <
50) color = '#d32f2f'; 
        else if(ratio
< 85) color = '#ed6c02'; 
        else if(ratio
< 95) color = '#fabb00'; 
 
        ringEl.style.background = `conic-gradient(${color} ${ratio}%, #444
${ratio}%)`;
    }
};
 
// --- YARDIMCI FONKSİYONLAR ---
function getToken() { return
localStorage.getItem("sSportToken"); }
function getFavs() { return
JSON.parse(localStorage.getItem('sSportFavs') || '[]'); }
 
window.toggleFavorite = function(title) { 
    event.stopPropagation();
    let favs =
getFavs(); 
    if
(favs.includes(title)) { 
        favs =
favs.filter(t => t !== title); 
    } else { 
        favs.push(title); 
    } 
    localStorage.setItem('sSportFavs', JSON.stringify(favs));
    
    // Eğer favoriler
// sekmesindeysek anlık güncelle
    if
(currentCategory === 'fav') {
        filterCategory(document.querySelector('.btn-fav'), 'fav'); 
    } else {
        // Kartın
// üzerindeki yıldızı güncellemek için render
        renderCards(activeCards);
    } 
}
 
function isFav(title) { return getFavs().includes(title); }
 
function formatDateToDDMMYYYY(dateString) {
    if (!dateString)
return 'N/A';
    if
(dateString.match(/^\d{2}\.\d{2}\.\d{4}/)) { return dateString; }
    try {
        const date =
new Date(dateString);
        if
(isNaN(date.getTime())) { return dateString; }
        const day =
String(date.getDate()).padStart(2, '0');
        const month =
String(date.getMonth() + 1).padStart(2, '0');
        const year =
date.getFullYear();
        return
`${day}.${month}.${year}`;
    } catch (e) {
return dateString; }
}
 
function isNew(dateStr) { 
    if (!dateStr)
return false; 
    let date;
    if
(dateStr.indexOf('.') > -1) { 
        const
cleanDate = dateStr.split(' ')[0];
        const parts =
cleanDate.split('.'); 
        date = new
Date(parts[2], parts[1] - 1, parts[0]); 
    } else { 
        date = new
Date(dateStr); 
    } 
    if
(isNaN(date.getTime())) return false; 
    const now = new
Date(); 
    const diffTime =
Math.abs(now - date);
    const diffDays =
Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays
<= 3; 
}
 
function getCategorySelectHtml(currentCategory, id) { 
    let options =
VALID_CATEGORIES.map(cat => `<option value="${cat}" ${cat ===
currentCategory ? 'selected' : ''}>${cat}</option>`).join('');
    if
(currentCategory && !VALID_CATEGORIES.includes(currentCategory)) {
        options =
`<option value="${currentCategory}" selected>${currentCategory}
(Hata)</option>` + options; 
    } 
    return `<select
id="${id}" class="swal2-input" style="width:100%;
margin-top:5px;">${options}</select>`;
}
 
function escapeForJsString(text) { 
    if (!text) return
"";
    return
text.toString().replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/"/g,
'\\"').replace(/\n/g, '\\n').replace(/\r/g, ''); 
}
 
document.addEventListener('contextmenu', event =>
event.preventDefault());
document.onkeydown = function(e) { if(e.keyCode == 123)
return false; }
 
document.addEventListener('DOMContentLoaded', () => {
    checkSession(); 
});
 
// --- SESSION & LOGIN ---
window.enterBas = function(e) { if (e.key === "Enter")
girisYap(); }
 
window.girisYap = function() { 
    const uName =
document.getElementById("usernameInput").value.trim(); 
    const uPass =
document.getElementById("passInput").value.trim(); 
    const loadingMsg =
document.getElementById("loading-msg"); 
    const errorMsg =
document.getElementById("error-msg"); 
 
    if(!uName ||
!uPass) {
        errorMsg.innerText = "Lütfen bilgileri giriniz.";
        errorMsg.style.display = "block"; 
        return; 
    } 
 
    loadingMsg.style.display = "block"; 
    loadingMsg.innerText = "Doğrulanıyor...";
    errorMsg.style.display = "none"; 
    document.querySelector('.login-btn').disabled
= true; 
 
    const hashedPass =
CryptoJS.SHA256(uPass).toString(); 
 
    fetch(SCRIPT_URL,
{ 
        method:
'POST', 
        headers: {
"Content-Type": "text/plain;charset=utf-8" }, 
        body:
JSON.stringify({ action: "login", username: uName, password:
hashedPass }) 
    }).then(response
=> response.json())
      .then(data =>
{ 
        loadingMsg.style.display = "none"; 
        document.querySelector('.login-btn').disabled
= false; 
 
        if
(data.result === "success") { 
            currentUser = data.username;
            localStorage.setItem("sSportUser", currentUser);
            localStorage.setItem("sSportToken", data.token);
            localStorage.setItem("sSportRole", data.role); 
 
            if
(data.forceChange === true) { 
                Swal.fire({ 
                    icon: 'warning', 
                    title: '⚠️ Güvenlik Uyarısı', 
                    text: 'İlk girişiniz. Lütfen şifrenizi değiştirin.', 
                    allowOutsideClick: false, 
                    allowEscapeKey: false, 
                    confirmButtonText: 'Şifremi Değiştir' 
                }).then(() => { changePasswordPopup(true); }); 
            } else { 
                document.getElementById("login-screen").style.display
= "none"; 
                document.getElementById("user-display").innerText
= currentUser; 
                checkAdmin(data.role); 
                startSessionTimer(); 
 
                if
(BAKIM_MODU)
                    document.getElementById("maintenance-screen").style.display
= "flex";
                else {
                    document.getElementById("main-app").style.display
= "block"; 
                    loadContentData(); 
                    loadWizardData();
                } 
            } 
        } else { 
            errorMsg.innerText = data.message || "Hatalı giriş!"; 
            errorMsg.style.display = "block"; 
        } 
    }).catch(error
=> { 
        console.error("Login Error:", error);
        loadingMsg.style.display = "none"; 
        document.querySelector('.login-btn').disabled
= false; 
        errorMsg.innerText = "Sunucu hatası! Lütfen sayfayı
yenileyin."; 
        errorMsg.style.display = "block"; 
    }); 
}
 
function checkSession() {
    const savedUser =
localStorage.getItem("sSportUser");
    const savedToken =
localStorage.getItem("sSportToken");
    const savedRole =
localStorage.getItem("sSportRole"); 
 
    if (savedUser
&& savedToken) {
        currentUser =
savedUser;
        document.getElementById("login-screen").style.display
= "none"; 
        document.getElementById("user-display").innerText
= currentUser;
        checkAdmin(savedRole); 
        startSessionTimer();
 
        if (BAKIM_MODU)
            document.getElementById("maintenance-screen").style.display
= "flex";
        else {
            document.getElementById("main-app").style.display
= "block"; 
            loadContentData(); 
            loadWizardData(); 
        }
    }
}
 
function checkAdmin(role) { 
    const editBtn =
document.getElementById('quickEditBtn'); 
    const addBtn =
document.getElementById('addCardBtn'); 
 
    isAdminMode =
(role === "admin"); 
    isEditingActive =
false;
    document.body.classList.remove('editing');
 
    if(isAdminMode) { 
        editBtn.style.display = "flex"; 
        addBtn.style.display = "flex"; 
        editBtn.innerHTML = '<i class="fas
fa-pencil-alt"></i> Düzenlemeyi Aç';
        editBtn.classList.remove('active');
    } else { 
        editBtn.style.display = "none"; 
        addBtn.style.display = "none"; 
    } 
}
 
window.logout = function() { 
    currentUser =
""; 
    isAdminMode =
false; 
    isEditingActive =
false; 
    document.body.classList.remove('editing');
    localStorage.removeItem("sSportUser");
    localStorage.removeItem("sSportToken"); 
    localStorage.removeItem("sSportRole");
    if (sessionTimeout) clearTimeout(sessionTimeout);
    document.getElementById("main-app").style.display
= "none";
    document.getElementById("login-screen").style.display
= "flex"; 
    document.getElementById("passInput").value = ""; 
    document.getElementById("usernameInput").value = "";
    document.getElementById("error-msg").style.display
= "none"; 
}
 
function startSessionTimer() { 
    if (sessionTimeout) clearTimeout(sessionTimeout); 
    sessionTimeout =
setTimeout(() => {
        Swal.fire({
icon: 'warning', title: 'Oturum Süresi Doldu', text: 'Güvenlik nedeniyle
otomatik çıkış yapıldı.', confirmButtonText: 'Tamam' }).then(() => {
logout(); }); 
    }, 3600000); 
}
 
window.openUserMenu = function() { 
    let options = { 
        title:
`Merhaba, ${currentUser}`, 
        showCancelButton: true, 
        showDenyButton: true,
        confirmButtonText: '🔑 Şifre Değiştir',
        denyButtonText: '🚪 Çıkış Yap',
        cancelButtonText: 'İptal' 
    }; 
    Swal.fire(options).then((result) => { 
        if
(result.isConfirmed) changePasswordPopup(); 
        else if
(result.isDenied) logout();
    }); 
}
 
async function changePasswordPopup(isMandatory = false) { 
    const { value:
formValues } = await Swal.fire({ 
        title:
isMandatory ? 'Yeni Şifre Belirleyin' : 'Şifre Değiştir', 
        html:
`${isMandatory ? '<p style="font-size:0.9rem;
color:#d32f2f;">İlk giriş şifrenizi değiştirmeden devam
edemezsiniz.</p>' : ''}<input id="swal-old-pass"
type="password" class="swal2-input" placeholder="Eski
Şifre (Mevcut)"><input id="swal-new-pass"
type="password" class="swal2-input" placeholder="Yeni
Şifre">`, 
        focusConfirm:
false, 
        showCancelButton: !isMandatory, 
        allowOutsideClick: !isMandatory,
        allowEscapeKey: !isMandatory, 
        confirmButtonText: 'Değiştir', 
        cancelButtonText: 'İptal', 
        preConfirm: ()
=> { 
            const o =
document.getElementById('swal-old-pass').value; 
            const n =
document.getElementById('swal-new-pass').value; 
            if(!o ||
!n) { Swal.showValidationMessage('Alanlar boş bırakılamaz'); } 
            return [
o, n ] 
        } 
    });
 
    if (formValues) { 
        Swal.fire({
title: 'İşleniyor...', didOpen: () => { Swal.showLoading() } }); 
        fetch(SCRIPT_URL, { 
            method:
'POST', 
            headers: {
"Content-Type": "text/plain;charset=utf-8" }, 
            body:
JSON.stringify({ 
                action: "changePassword", 
                username: currentUser, 
                oldPass: CryptoJS.SHA256(formValues[0]).toString(),
                newPass: CryptoJS.SHA256(formValues[1]).toString(), 
                token:
getToken() 
            }) 
        })
        .then(response
=> response.json())
        .then(data
=> { 
            if(data.result === "success") { 
                Swal.fire('Başarılı!', 'Şifreniz güncellendi. Güvenlik gereği yeniden
giriş yapınız.', 'success').then(() => { logout(); }); 
            } else { 
                Swal.fire('Hata', data.message || 'İşlem başarısız.', 'error').then(()
=> { if(isMandatory) changePasswordPopup(true); }); 
            } 
        }).catch(err
=> { 
            Swal.fire('Hata', 'Sunucu hatası.', 'error'); 
            if(isMandatory) changePasswordPopup(true); 
        }); 
    } else if
(isMandatory) { 
        changePasswordPopup(true); 
    } 
}
 
// --- DATA FETCHING ---
function loadContentData() { 
    document.getElementById('loading').style.display
= 'block'; 
    fetch(SCRIPT_URL,
{
        method: 'POST',
        headers: {
"Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action:
"fetchData" }) 
    })
    .then(response
=> response.json())
    .then(data => {
        document.getElementById('loading').style.display
= 'none'; 
        
        if (data.result === "success") {
            const rawData =
data.data; 
 
            // Verileri Type
// alanına göre ayır
            const fetchedCards
= rawData.filter(i =>
['card','bilgi','teknik','kampanya','ikna'].includes(i.Type.toLowerCase())).map(i
=> ({ 
                title:
i.Title, 
                category: i.Category, 
                text: i.Text, 
                script: i.Script, 
                code: i.Code, 
                link: i.Link, 
                date:
formatDateToDDMMYYYY(i.Date)
            }));
            
            const fetchedNews
= rawData.filter(i => i.Type.toLowerCase() === 'news').map(i => ({ 
                date:
formatDateToDDMMYYYY(i.Date),
                title:
i.Title, 
                desc:
i.Text, 
                type:
i.Category, 
                status: i.Status 
            }));
            
            const
fetchedSports = rawData.filter(i => i.Type.toLowerCase() === 'sport').map(i
=> ({
                title:
i.Title, 
                icon:
i.Icon, 
                desc:
i.Text, 
                tip:
i.Tip, 
                detail: i.Detail,
                pronunciation: i.Pronunciation 
            }));
 
            const fetchedSales
= rawData.filter(i => i.Type.toLowerCase() === 'sales').map(i => ({ 
                title:
i.Title, 
                text:
i.Text 
            }));
 
            const fetchedQuiz
= rawData.filter(i => i.Type.toLowerCase() === 'quiz').map(i => ({ 
                q:
i.Text, 
                opts:
i.QuizOptions ? i.QuizOptions.split(',').map(o => o.trim()) : [], 
                a:
parseInt(i.QuizAnswer) 
            }));
 
            database =
fetchedCards;
            newsData =
fetchedNews;
            sportsData =
fetchedSports;
            salesScripts =
fetchedSales;
            quizQuestions =
fetchedQuiz;
            
            if(currentCategory === 'fav') { 
                filterCategory(document.querySelector('.btn-fav'), 'fav'); 
            } else { 
                activeCards = database; 
                renderCards(database); 
            } 
            startTicker();
            
        } else {
            document.getElementById('loading').innerHTML
= `Veriler alınamadı: ${data.message || 'Bilinmeyen Hata'}`;
        }
    })
    .catch(error =>
{ 
        console.error("Fetch Hatası:", error);
        document.getElementById('loading').innerHTML
= 'Bağlantı Hatası! Sunucuya ulaşılamıyor.';
    }); 
}
 
function loadWizardData() {
    return new
Promise((resolve, reject) => {
        fetch(SCRIPT_URL,
{
            method: 'POST',
            headers: {
"Content-Type": "text/plain;charset=utf-8" },
            body:
JSON.stringify({ action: "getWizardData" }) 
        })
        .then(response
=> response.json())
        .then(data
=> {
            if (data.result === "success" && data.steps) {
                
                wizardStepsData = data.steps;
                
console.log("Wizard Adımları Yüklendi:",
Object.keys(wizardStepsData).length);
                
resolve();
            } else {
                
console.error("Wizard verisi yüklenemedi:", data.message);
                
wizardStepsData = {};
                
reject(new Error("Wizard verisi yüklenemedi."));
            }
        })
        .catch(error
=> { 
            
console.error("Wizard Fetch Hatası:", error);
            wizardStepsData =
{};
            reject(error);
        });
    });
}
 
// --- RENDER & FILTERING ---
function renderCards(data) { 
    activeCards =
data; 
    const container =
document.getElementById('cardGrid'); 
    container.innerHTML = ''; 
    
    if (data.length === 0) { 
        container.innerHTML = '<div
style="grid-column:1/-1; text-align:center; padding:20px;
color:#777;">Kayıt bulunamadı.</div>'; 
        return; 
    } 
    
    data.forEach((item, index) => { 
        const safeTitle =
escapeForJsString(item.title); 
        const isFavorite =
isFav(item.title); 
        const favClass = isFavorite ?
'fas fa-star active' : 'far fa-star'; 
        const newBadge =
isNew(item.date) ? '<span
class="new-badge">YENİ</span>' : ''; 
        
        const editIconHtml =
(isAdminMode && isEditingActive) 
            ? `<i
class="fas fa-pencil-alt edit-icon"
onclick="editContent(${index})"></i>` 
            : ''; 
        
        let rawText =
item.text || ""; 
        // Metin içindeki *kalın* işaretlemeyi HTML'e çevir
        let formattedText =
rawText.replace(/\n/g, '<br>').replace(/\*(.*?)\*/g,
'<b>$1</b>'); 
        
        let html =
`<div class="card ${item.category}">${newBadge}
            <div
class="icon-wrapper">
                
${editIconHtml} 
                
<i class="${favClass} fav-icon"
onclick="toggleFavorite('${safeTitle}')"></i>
            </div>
            <div
class="card-header"><h3
class="card-title">${highlightText(item.title)}</h3><span
class="badge">${item.category}</span></div>
            <div
class="card-content" onclick="showCardDetail('${safeTitle}',
'${escapeForJsString(item.text)}')">
                
<div class="card-text-truncate">${highlightText(formattedText)}</div>
                
<div style="font-size:0.8rem; color:#999; margin-top:5px;
text-align:right;">(Tamamını oku)</div>
            </div>
            <div
class="script-box">${highlightText(item.script)}</div>
            <div
class="card-actions">
                
<button class="btn btn-copy"
onclick="copyText('${escapeForJsString(item.script)}')"><i
class="fas fa-copy"></i> Kopyala</button>
                
${item.code ? `<button class="btn btn-copy"
style="background:var(--secondary); color:#333;"
onclick="copyText('${escapeForJsString(item.code)}')">Kod</button>`
: ''}
                
${item.link ? `<a href="${item.link}"
target="_blank" class="btn btn-link"><i
class="fas fa-external-link-alt"></i> Link</a>` : ''}
            </div>
        </div>`;
        container.innerHTML +=
html; 
    }); 
}
 
function highlightText(htmlContent) { 
    if (!htmlContent)
return ""; 
    const searchTerm =
document.getElementById('searchInput').value.toLocaleLowerCase('tr-TR').trim();
    if (!searchTerm)
return htmlContent;
    
    try {
        const regex =
new RegExp(`(${searchTerm})`, "gi");
        // Sadece metin içeriğini
// değiştirmek için, HTML tagleri dışındaki metinleri hedef alıyoruz.
        // Bu daha basit versiyon, büyük hataları önler.
        return
htmlContent.toString().replace(regex, '<span
class="highlight">$1</span>');
    } catch(e) {
        return
htmlContent;
    }
}
 
window.showCardDetail = function(title, text) { 
    Swal.fire({ 
        title: title, 
        html: `<div
style="text-align:left; font-size:1rem;
line-height:1.6; white-space: pre-wrap;">${text.replace(/\\n/g,'<br>')}</div>`, 
        showCloseButton: true, 
        showConfirmButton: false, 
        width: '600px', 
        background:
'#f8f9fa' 
    }); 
}
 
window.filterCategory = function(btn, cat) { 
    currentCategory =
cat;
    
    document.querySelectorAll('.filter-btn').forEach(b =>
b.classList.remove('active'));
    btn.classList.add('active'); 
    
    filterContent(); 
}
 
window.filterContent = function() { 
    const search =
document.getElementById('searchInput').value.toLocaleLowerCase('tr-TR').trim();
    
    let filtered =
database;
 
    // 1. ADIM:
// Kategori Filtrelemesi
    if
(currentCategory === 'fav') { 
        filtered =
filtered.filter(i => isFav(i.title));
    } else if
(currentCategory !== 'all') { 
        filtered =
filtered.filter(i => i.category === currentCategory); 
    } 
 
    // 2. ADIM: Metin
// Arama (Başlık, Metin veya Script içinde)
    if (search) {
        filtered =
filtered.filter(item => {
            const
title = (item.title || "").toString().toLocaleLowerCase('tr-TR');
            const text
= (item.text || "").toString().toLocaleLowerCase('tr-TR');
            const
script = (item.script || "").toString().toLocaleLowerCase('tr-TR');
            const code
= (item.code || "").toString().toLocaleLowerCase('tr-TR');
 
            return
title.includes(search) || text.includes(search) || script.includes(search) ||
code.includes(search);
        });
    }
 
    // 3. ADIM:
// Ekrana Bas
    activeCards =
filtered; 
    renderCards(filtered);
}
 
window.copyText = function(t) {
    navigator.clipboard.writeText(t.replace(/\\n/g,
'\n')).then(() => 
    Swal.fire({icon:'success', title:'Kopyalandı',
toast:true, position:'top-end', showConfirmButton:false, timer:1500}) ); 
}
 
window.toggleEditMode = function() { 
    if (!isAdminMode) return; 
    isEditingActive = !isEditingActive; 
    document.body.classList.toggle('editing',
isEditingActive); 
    
    const btn =
document.getElementById('quickEditBtn'); 
    if(isEditingActive) { 
        btn.classList.add('active'); 
        btn.innerHTML = '<i class="fas
fa-times"></i> Düzenlemeyi Kapat'; 
        Swal.fire({ icon: 'success',
title: 'Düzenleme Modu AÇIK', text: 'Kalem ikonlarına tıklayarak içerikleri
düzenleyebilirsiniz.', timer: 1500, showConfirmButton: false }); 
    } else { 
        btn.classList.remove('active'); 
        btn.innerHTML = '<i class="fas
fa-pencil-alt"></i> Düzenlemeyi Aç'; 
    } 
    
    // Tüm modalları yeniden render ederek düzenleme butonlarını güncelle
    filterContent();
    
    if(document.getElementById('guide-modal').style.display === 'flex')
openGuide(); 
    if(document.getElementById('sales-modal').style.display === 'flex')
openSales(); 
    if(document.getElementById('news-modal').style.display === 'flex')
openNews(); 
}
 
function sendUpdate(o, c, v, t='card') { 
    if (!Swal.isVisible()) Swal.fire({ title:
'Kaydediliyor...', didOpen: () => { Swal.showLoading() } }); 
    fetch(SCRIPT_URL,
{ 
        method:
'POST', 
        headers: {
'Content-Type': 'text/plain;charset=utf-8' }, 
        body:
JSON.stringify({ action: "updateContent", title: o, column: c, value:
v, type: t, originalText: o, username: currentUser, token: getToken() }) 
    }).then(r =>
r.json())
      .then(data =>
{ 
        if
(data.result === "success") { 
            Swal.fire({icon: 'success', title: 'Başarılı', timer: 1500,
showConfirmButton: false}); 
            setTimeout(loadContentData, 1600); 
        } else { 
            Swal.fire('Hata', 'Kaydedilemedi: ' + (data.message || 'Bilinmeyen
Hata'), 'error'); 
        } 
    }).catch(err
=> Swal.fire('Hata', 'Sunucu hatası.', 'error')); 
}
 
// --- CRUD OPERASYONLARI (Kısaltıldı) ---
window.addNewCardPopup = async function() {
    // ... (Kod aynı kaldı)
}
 
window.editContent = async function(index) {
    // ... (Kod aynı kaldı)
}
 
window.editSport = async function(title) {
    // ... (Kod aynı kaldı)
}
 
window.editSales = async function(title) {
    // ... (Kod aynı kaldı)
}
 
window.editNews = async function(index) {
    // ... (Kod aynı kaldı)
}
 
// --- MODALS ---
window.closeModal = function(id) {
    document.getElementById(id).style.display = 'none';
}
 
let tickerIndex = 0;
function startTicker() { 
    // ... (Kod aynı kaldı)
}
 
window.openNews = function() { 
    document.getElementById('news-modal').style.display
= 'flex'; 
    const c =
document.getElementById('news-container'); 
    c.innerHTML = ''; 
    newsData.forEach((i, index) => { 
        let lineColor = '#0288d1'; // Info (Mavi)
        let typeText = 'Bilgi';
        let tagClass = 'tag-info';
 
        if (i.type === 'fix') {
            lineColor = '#2e7d32'; // Success (Yeşil)
            typeText = 'Çözüldü';
            tagClass = 'tag-fix';
        } else if (i.type === 'update') {
            lineColor = '#ed6c02'; // Warning (Turuncu)
            typeText = 'Değişiklik';
            tagClass = 'tag-update';
        }
 
        // Pasif duyuru (Gizli)
        if (i.status === 'Pasif') {
            lineColor = '#999'; 
            typeText = 'Pasif';
            tagClass = 'tag-passive';
        }
        
        let passiveStyle = i.status === 'Pasif' ? 'opacity:0.7;' : '';
        
        let editBtn = (isAdminMode && isEditingActive) 
            ? `<i class="fas fa-pencil-alt edit-icon" style="top:5px; right:10px; font-size:0.9rem; padding:4px;" onclick="event.stopPropagation(); editNews(${index})"></i>` 
            : ''; 
        
        c.innerHTML += `
            <div class="news-item" style="${passiveStyle}">
                ${editBtn}
                <!-- Sol renkli dikey çizgi -->
                <div class="news-item-color-bar" style="background-color:${lineColor};"></div>

                <!-- Metin Alanı (padding-left'i CSS'e taşıdık) -->
                <div style="padding-left: 20px;">
                    <span class="news-date">${i.date}</span>
                    <span class="news-title">${i.title}</span>
                    <div class="news-desc">${i.desc}</div>
                    <span class="news-tag ${tagClass}">${typeText}</span>
                </div>
            </div>`; 
    }); 
}
 
window.openGuide = function() { 
    document.getElementById('guide-modal').style.display
= 'flex'; 
    const grid =
document.getElementById('guide-grid'); 
    grid.innerHTML = ''; 
    sportsData.forEach((s, index) => { 
        let pronHtml =
s.pronunciation ? `<div class="pronunciation-badge">🗣️
${s.pronunciation}</div>` : ''; 
        
        let editBtn = (isAdminMode && isEditingActive) 
            ? `<i class="fas fa-pencil-alt edit-icon" style="top:5px; right:5px; z-index:50;" onclick="event.stopPropagation(); editSport('${escapeForJsString(s.title)}')"></i>` 
            : ''; 
        
        // Spor rehberi kart stili
        grid.innerHTML += `<div
class="guide-item"
onclick="showSportDetail(${index})">${editBtn}<i
class="fas ${s.icon} guide-icon"></i><span
class="guide-title">${s.title}</span>${pronHtml}<div
class="guide-desc">${s.desc}</div><div
class="guide-tip"><i class="fas
fa-lightbulb"></i> ${s.tip}</div><div
style="font-size:0.8rem; color:#999; margin-top:5px;">(Detay için
tıkla)</div></div>`; 
    }); 
}
 
window.showSportDetail = function(index) { 
    const sport =
sportsData[index]; 
    const detailText =
sport.detail ? sport.detail.replace(/\n/g,'<br>') : "Bu içerik için
henüz detay eklenmemiş."; 
    const pronDetail =
sport.pronunciation ? `<div style="color:#e65100; font-weight:bold;
margin-bottom:15px;">🗣️ Okunuşu:
${sport.pronunciation}</div>` : ''; 
    Swal.fire({ 
        title: `<i class="fas
${sport.icon}" style="color:#0e1b42;"></i>
${sport.title}`, 
        html:
`${pronDetail}<div style="text-align:left; font-size:1rem;
line-height:1.6; white-space: pre-wrap;">${detailText}</div>`, 
        showCloseButton: true, 
        showConfirmButton: false, 
        width: '600px', 
        background:
'#f8f9fa' 
    }); 
}
 
window.openSales = function() { 
    document.getElementById('sales-modal').style.display
= 'flex'; 
    const c =
document.getElementById('sales-grid'); 
    c.innerHTML = ''; 
    salesScripts.forEach((s, index) => { 
        let editBtn = (isAdminMode && isEditingActive) 
            ? `<i class="fas fa-pencil-alt edit-icon" style="top:10px; right:40px; z-index:50;" onclick="event.stopPropagation(); editSales('${escapeForJsString(s.title)}')"></i>` 
            : ''; 
        
        c.innerHTML += `<div
class="sales-item" id="sales-${index}"
onclick="toggleSales('${index}')">${editBtn}<div
class="sales-header"><span class="sales-title">${s.title}</span><i
class="fas fa-chevron-down" id="icon-${index}"
style="color:#10b981;"></i></div><div
class="sales-text">${(s.text || '').replace(/\n/g,'<br>')}<div
style="text-align:right; margin-top:15px;"><button
class="btn btn-copy" onclick="event.stopPropagation();
copyText('${escapeForJsString(s.text || '')}')"><i class="fas
fa-copy"></i>
Kopyala</button></div></div></div>`; 
    }); 
}
 
window.toggleSales = function(index) { 
    const item =
document.getElementById(`sales-${index}`); 
    const icon =
document.getElementById(`icon-${index}`); 
    item.classList.toggle('active');
    if(item.classList.contains('active')){ 
        icon.classList.replace('fa-chevron-down', 'fa-chevron-up'); 
    } else { 
        icon.classList.replace('fa-chevron-up', 'fa-chevron-down'); 
    } 
}
 
// --- WIZARD FONKSİYONLARI ---
 
window.openWizard = function(){
    document.getElementById('wizard-modal').style.display='flex';
    if (Object.keys(wizardStepsData).length === 0) {
        Swal.fire({
title: 'İade Asistanı Verisi Yükleniyor...', didOpen: () =>
Swal.showLoading() });
        loadWizardData().then(() => {
            Swal.close();
            if
(wizardStepsData && wizardStepsData['start']) {
                renderStep('start');
            } else {
                document.getElementById('wizard-body').innerHTML
= '<h2 style="color:red;">Asistan verisi eksik veya hatalı. Lütfen
yöneticinizle iletişime geçin.</h2>';
            }
        }).catch(() => {
            Swal.close();
            document.getElementById('wizard-body').innerHTML
= '<h2 style="color:red;">Sunucudan veri çekme hatası oluştu.</h2>';
        });
    } else {
        renderStep('start');
    }
}
 
// Opsiyon butonuna tıklandığında sadece ilgili butonu vurgulamak ve bir sonraki adıma geçmek için yeni bir işlev
window.selectAndRenderStep = function(button, nextStep) {
    // Tüm seçeneklerdeki vurguyu kaldır
    document.querySelectorAll('#wizard-body .option-btn').forEach(btn => {
        btn.classList.remove('selected-option');
    });
    
    // Seçilen butonu vurgula
    button.classList.add('selected-option');
    
    // Kısa bir gecikmeyle bir sonraki adıma geç
    setTimeout(() => {
        renderStep(nextStep);
    }, 300); 
}

// İADE ASİSTANI ADIM RENDER İŞLEVİ (Görseldeki gibi seçimi vurgular)
function renderStep(k){ 
    const s = wizardStepsData[k];
    if (!s) {
        document.getElementById('wizard-body').innerHTML
= `<h2 style="color:red;">HATA: Adım ID'si (${k}) bulunamadı. Lütfen
yöneticinizle iletişime geçin.</h2>`;
        return;
    }
 
    const b =
document.getElementById('wizard-body');
    // Başlık ve açıklama
    let h = `<h2
style="color:var(--primary); font-size:1.4rem; margin-top:0; margin-bottom: 20px;">${s.title || 'İade Talep Analizi'}</h2>`;
    
    // Alt metin/soru metni
    if (s.text) {
        h += `<p style="font-size:1.05rem; color:#666; line-height:1.5; margin-bottom: 20px;">${s.text}</p>`;
    }
 
    // Final Adım Kontrolü
    if(s.result) { 
        let i = s.result === 'red' ? '🛑' : (s.result ===
'green' ? '✅' : '⚠️');
        let c = s.result === 'red' ? 'res-red' : (s.result === 'green' ? 'res-green' :
'res-yellow');
        
        h += `<div
class="result-box ${c}"><div
style="font-size:3rem;margin-bottom:10px;">${i}</div><h3>${s.title}</h3><p>${s.text}</p>${s.script
? `<div class="script-box">${s.script}</div>` :
''}</div><button class="restart-btn"
onclick="renderStep('start')"><i class="fas
fa-redo"></i> Başa Dön</button>`; 
    } else {
        // Ara Adım - Seçenekler
        h += `<div class="wizard-options">`;
        s.options.forEach(o => { 
            // Seçenek metninin sadece ilgili kısmı kalın yazılsın
            const optionTextHtml = `<span style="flex-grow: 1; text-align: left;">${o.text}</span>`;
            
            // Eğer butonda özellikle "Yıllık Paket (İzleme YOK)" gibi bir metin varsa, onu default sarı yap.
            // Bu sadece ilk adımın görseldeki gibi görünmesi için yapılan bir hiledir.
            const defaultSelectedClass = (k === 'start' && o.text.includes('Yıllık Paket (İzleme YOK)')) ? 'selected-option' : '';

            h += `<button class="option-btn ${defaultSelectedClass}"
            onclick="selectAndRenderStep(this, '${o.next}')">${optionTextHtml}<i
            class="fas fa-chevron-right"></i></button>`; 
        });
        h += `</div>`; 
        
        // Geri Dön butonu sadece 'start' dışında gösterilir
        if(k !== 'start')
            h += `<button class="restart-btn"
            onclick="renderStep('start')"
            style="background:#eee;color:#333;margin-top:15px; border:1px solid #ddd;">Başa
            Dön</button>`; 
    } 
    b.innerHTML = h; 
}

// --- SESSION & LOGIN ---
async function checkSession() {
    // --- SUPABASE AUTH CHECK ---
    const { data: { session }, error } = await sb.auth.getSession();

    if (!session || error) {
        console.log("[Pusula] Oturum bulunamadı, giriş ekranına yönlendiriliyor.");
        logout();
        try { document.getElementById("app-preloader").style.display = "none"; } catch (e) { }
        return;
    }

    // Oturum geçerli
    const user = session.user;
    currentUserId = user.id;

    // 1. Profil bilgisini 'profiles' tablosundan çek (En güncel yetki/grup için)
    let profileRole = 'user';
    let profileGroup = 'Genel';
    let profileName = user.email ? user.email.split('@')[0] : 'Kullanıcı';

    try {
        const { data: profile, error: pErr } = await sb.from('profiles').select('*').eq('id', user.id).single();
        if (profile) {
            profileRole = profile.role || 'user';
            // Hem 'group' hem 'group_name' kolonunu kontrol et (Veritabanı uyumluluğu için)
            profileGroup = profile.group || profile.group_name || 'Genel';
            profileName = profile.username || profileName;

            // Eğer profil varsa ve force_logout true ise
            if (profile.force_logout) {
                await sb.from('profiles').update({ force_logout: false }).eq('id', user.id);
                logout();
                Swal.fire('Oturum Kapandı', 'Yönetici tarafından çıkışınız sağlandı.', 'warning');
                return;
            }

            // ✅ ZORUNLU ŞİFRE DEĞİŞİKLİĞİ (Güvenlik Önlemi)
            if (profile.must_change_password) {
                // UI Güncellemelerini beklemeden direkt popup açalım
                document.getElementById("login-screen").style.display = "none";
                document.getElementById("app-preloader").style.display = "none";

                // Modal
                changePasswordPopup(true); // true = mandatory
                return; // Akışı durdur, şifre değişmeden içeri almasın
            }
        }
    } catch (e) {
        console.warn("Profil çekilemedi, metadata kullanılıyor.", e);
        // Fallback: Metadata
        profileRole = user.user_metadata.role || 'user';
        profileName = user.user_metadata.username || profileName;
    }

    currentUser = profileName;
    activeRole = profileRole;
    localStorage.setItem("sSportGroup", profileGroup); // Grup yetkisi için

    // UI Güncelle
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("user-display").innerText = currentUser;
    setHomeWelcomeUser(currentUser);

    checkAdmin(activeRole);
    startSessionTimer();

    localStorage.setItem("sSportUser", currentUser);
    localStorage.setItem("sSportRole", activeRole);

    if (activeRole === "admin" || activeRole === "locadmin") {
        try { fetchUserListForAdmin(); } catch (e) { }
    }

    if (BAKIM_MODU) {
        document.getElementById("maintenance-screen").style.display = "flex";
    } else {
        document.getElementById("main-app").style.removeProperty("display");
        document.getElementById("main-app").style.display = "block";
        loadPermissionsOnStartup().then(() => {
            loadHomeBlocks();
            loadContentData();
            loadWizardData();
            loadTechWizardData();
        });
    }
    // Preloader Gizle
    try { document.getElementById("app-preloader").style.display = "none"; } catch (e) { }
}
function enterBas(e) { if (e.key === "Enter") girisYap(); }
async function girisYap() {
    const emailInput = document.getElementById("usernameInput").value.trim(); // Email olarak kullanılmalı artık
    const passwordInput = document.getElementById("passInput").value.trim();
    const loadingMsg = document.getElementById("loading-msg");
    const errorMsg = document.getElementById("error-msg");

    if (!emailInput || !passwordInput) {
        errorMsg.innerText = "Lütfen e-posta ve şifrenizi giriniz.";
        errorMsg.style.display = "block";
        return;
    }


    // YENİ: Otomatik domain tamamlama (@ yoksa ekle)
    let finalEmail = emailInput;
    if (!finalEmail.includes('@')) {
        finalEmail += "@ssportplus.com";
    }

    // Email formatı kontrolü (Basit)
    if (!finalEmail.includes('@')) {
        errorMsg.innerText = "Lütfen geçerli bir e-posta adresi giriniz.";
        errorMsg.style.display = "block";
        return;
    }

    loadingMsg.style.display = "block";
    loadingMsg.innerText = "Oturum açılıyor...";
    errorMsg.style.display = "none";
    document.querySelector('.login-btn').disabled = true;

    try {
        const { data, error } = await sb.auth.signInWithPassword({
            email: finalEmail,
            password: passwordInput,
        });

        if (error) {
            throw error;
        }

        console.log("Giriş Başarılı:", data);

        // Başarılı giriş sonrası checkSession her şeyi halledecek
        await checkSession();

        loadingMsg.style.display = "none";
        document.querySelector('.login-btn').disabled = false;

        // Loglama
        try {
            apiCall("logAction", {
                action: "Giriş",
                details: "Supabase Auth Login",
                username: finalEmail
            });
        } catch (e) { console.warn("Log hatası:", e); }

    } catch (err) {
        console.error("Login Error:", err);
        loadingMsg.style.display = "none";
        document.querySelector('.login-btn').disabled = false;
        errorMsg.innerText = "Giriş başarısız: " + (err.message === "Invalid global failure" ? "Bilgiler hatalı." : err.message);
        errorMsg.style.display = "block";
    }
}

async function logout() {
    try {
        await sb.auth.signOut();
    } catch (e) { console.error("Logout error:", e); }

    currentUser = ""; currentUserId = ""; isAdminMode = false; isEditingActive = false;
    try { document.getElementById("user-display").innerText = "Misafir"; } catch (e) { }
    setHomeWelcomeUser("Misafir");
    document.body.classList.remove('editing');

    localStorage.removeItem("sSportUser");
    localStorage.removeItem("sSportToken");
    localStorage.removeItem("sSportRole");
    localStorage.removeItem("sSportGroup");
    localStorage.clear();

    if (sessionTimeout) clearTimeout(sessionTimeout);

    document.getElementById("main-app").style.display = "none";
    document.getElementById("login-screen").style.removeProperty("display");
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("passInput").value = "";
    document.getElementById("usernameInput").value = "";
    document.getElementById("error-msg").style.display = "none";

    // Fullscreen'leri kapat
    document.getElementById('quality-fullscreen').style.display = 'none';
    try { document.getElementById('tech-fullscreen').style.display = 'none'; } catch (e) { }
    try { document.getElementById('telesales-fullscreen').style.display = 'none'; } catch (e) { }

    // AI Bot'u gizle
    const aiBot = document.getElementById('ai-widget-container');
    if (aiBot) aiBot.style.display = 'none';

    try { document.getElementById("app-preloader").style.display = "none"; } catch (e) { }
    console.log("[Pusula] Çıkış yapıldı.");
}

async function forgotPasswordPopup() {
    const { value: email } = await Swal.fire({
        title: 'Şifre Sıfırlama',
        input: 'email',
        inputLabel: 'E-posta Adresiniz',
        inputPlaceholder: 'ornek@ssportplus.com',
        showCancelButton: true,
        confirmButtonText: 'Sıfırlama Linki Gönder',
        cancelButtonText: 'İptal'
    });

    if (email) {
        Swal.fire({ title: 'Gönderiliyor...', didOpen: () => { Swal.showLoading() } });

        try {
            const { error } = await sb.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin, // Şifre sıfırlama sonrası dönülecek URL
            });

            if (error) throw error;

            Swal.fire('Başarılı', 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.', 'success');
        } catch (e) {
            console.error("Forgot Pass Error:", e);
            Swal.fire('Hata', e.message || 'İşlem başarısız.', 'error');
        }
    }
}

function checkAdmin(role) {
    activeRole = role;
    const r = (role || "").toLowerCase();
    isAdminMode = (r === "admin" || r === "locadmin");
    isLocAdmin = (r === "locadmin");
    isEditingActive = false;
    document.body.classList.remove('editing');

    // Butonların görünürlüğü artık tamamen applyPermissionsToUI() üzerinden, 
    // RBAC tablosuna göre yönetiliyor.
    try { applyPermissionsToUI(); } catch (e) { }
}

// --- HEARTBEAT SYSTEM ---
let sessionInterval;
let heartbeatInterval; // Yeni Heartbeat Timer

async function sendHeartbeat() {
    if (!currentUser) return;
    try {
        if (!currentUserId) return;
        // Heartbeat (profiles tablosunu güncelle)
        const { data, error } = await sb.from('profiles')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', currentUserId)
            .select('force_logout')
            .single();

        if (data && data.force_logout === true) {
            await sb.from('profiles').update({ force_logout: false }).eq('id', currentUserId);
            Swal.fire({
                icon: 'error', title: 'Oturum Sonlandırıldı',
                text: 'Yönetici tarafından sistemden çıkarıldınız.',
                allowOutsideClick: false, confirmButtonText: 'Tamam'
            }).then(() => { logout(); });
            return;
        }
        // Multi-device kontrolü kaldırıldı (istek üzerine).
    } catch (e) { console.warn("Heartbeat failed", e); }
}


function startSessionTimer() {
    if (sessionInterval) clearInterval(sessionInterval);
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    // Initial heartbeat
    sendHeartbeat();

    // Her 30 saniyede bir heartbeat gönder
    heartbeatInterval = setInterval(() => {
        sendHeartbeat();
    }, 30000);

    // --- PERSISTENT SESSION TIMEOUT (12 Saat) ---
    const maxAge = 43200000; // 12 saat (milisaniye)
    let loginTime = localStorage.getItem("sSportLoginTime");

    // Eğer loginTime yoksa (ilk giriş), şu anı kaydet
    if (!loginTime) {
        loginTime = Date.now().toString();
        localStorage.setItem("sSportLoginTime", loginTime);
    }

    const elapsed = Date.now() - parseInt(loginTime);
    const remaining = maxAge - elapsed;

    if (remaining <= 0) {
        // Süre çoktan dolmuşsa
        console.log("[Auth] Oturum süresi dolduğu için çıkış yapılıyor.");
        logout();
        Swal.fire({ icon: 'warning', title: 'Oturum Süresi Doldu', text: '12 saatlik güvenlik süreniz dolduğu için otomatik çıkış yapıldı.', confirmButtonText: 'Tamam' });
        return;
    }

    // Kalan süre kadar timer kur
    if (window.sessionTimeout) clearTimeout(window.sessionTimeout);
    window.sessionTimeout = setTimeout(() => {
        Swal.fire({
            icon: 'warning',
            title: 'Oturum Süresi Doldu',
            text: '12 saatlik güvenlik süreniz doldu, lütfen tekrar giriş yapın.',
            confirmButtonText: 'Tamam'
        }).then(() => { logout(); });
    }, remaining);
}
function openUserMenu() { toggleUserDropdown(); }

async function changePasswordPopup(isMandatory = false) {
    const { value: newPass } = await Swal.fire({
        title: isMandatory ? '⚠️ Güvenlik Uyarısı' : 'Şifre Değiştir',
        text: isMandatory ? 'Yönetici tarafından şifrenizi değiştirmeniz istendi. Lütfen yeni bir şifre belirleyiniz.' : '',
        input: 'password',
        inputLabel: 'Yeni Şifreniz',
        inputPlaceholder: 'En az 6 karakter',
        showCancelButton: !isMandatory, // Zorunluysa iptal butonu yok
        confirmButtonText: 'Güncelle',
        cancelButtonText: 'İptal',
        allowOutsideClick: !isMandatory, // Zorunluysa dışarı tıklanmaz
        allowEscapeKey: !isMandatory,    // Zorunluysa ESC çalışmaz
        icon: isMandatory ? 'warning' : 'info',
        inputValidator: (value) => {
            if (!value || value.length < 6) return 'Şifre en az 6 karakter olmalıdır!';
        }
    });

    if (newPass) {
        Swal.fire({ title: 'Güncelleniyor...', didOpen: () => { Swal.showLoading() } });
        try {
            const { error } = await sb.auth.updateUser({ password: newPass });
            if (error) throw error;

            // ✅ Şifre değişti, zorunluluk bayrağını kaldır
            if (isMandatory) {
                await sb.from('profiles').update({ must_change_password: false }).eq('id', currentUserId);
            }

            Swal.fire({
                icon: 'success',
                title: 'Başarılı',
                text: 'Şifreniz güncellendi. Lütfen yeni şifrenizle giriş yapın.',
                confirmButtonText: 'Tamam'
            }).then(() => {
                // Güvenlik için yeniden giriş yaptırabiliriz veya direkt devam ettirebiliriz.
                // Best practice: Yeniden giriş.
                if (isMandatory) {
                    logout();
                }
            });

        } catch (e) {
            Swal.fire('Hata', 'Şifre güncellenemedi: ' + e.message, 'error');
            // Hata aldıysa ve zorunluysa tekrar aç
            if (isMandatory) setTimeout(() => changePasswordPopup(true), 2000);
        }
    } else if (isMandatory) {
        // İptal edemez, tekrar aç
        changePasswordPopup(true);
    }
}

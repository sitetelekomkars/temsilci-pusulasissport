// --- GÖRSEL YÜKLEME ARACI (Admin/LocAdmin) ---
function openImageUploader() {
    Swal.fire({
        title: 'Görsel Yükle',
        html: `
        <div style="font-size:0.9rem;color:#555;margin-bottom:15px">
           Seçtiğiniz görsel bulut sistemine yüklenecek ve size bir link verilecektir.
           Bu linki "Image" sütununa yapıştırarak kartlarda kullanabilirsiniz.
        </div>
        <input type="file" id="swal-img-input" accept="image/*" class="swal2-file" style="display:block;margin:0 auto;">
        `,
        showCancelButton: true,
        confirmButtonText: 'Yükle',
        cancelButtonText: 'İptal',
        preConfirm: () => {
            const fileInput = document.getElementById('swal-img-input');
            if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                Swal.showValidationMessage('Lütfen bir görsel seçin.');
                return;
            }
            const file = fileInput.files[0];
            // Base64 okuma
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const b64 = reader.result.split(',')[1]; // data:image/png;base64, kısmını at
                    resolve({
                        base64: b64,
                        mimeType: file.type,
                        fileName: file.name
                    });
                };
                reader.onerror = error => reject(error);
                reader.readAsDataURL(file);
            });
        }
    }).then(result => {
        if (result.isConfirmed) {
            const fileData = result.value;
            Swal.fire({ title: 'Yükleniyor...', didOpen: () => { Swal.showLoading() } });

            apiCall("uploadImage", fileData).then(res => {
                if (res.result === "success") {
                    Swal.fire({
                        icon: 'success',
                        title: 'Yüklendi!',
                        html: `
                           <div>Görsel Linki:</div>
                           <input type="text" value="${res.url}" id="uploaded-img-url" class="swal2-input" readonly>
                           <button class="btn btn-copy" style="margin-top:10px" onclick="copyText(document.getElementById('uploaded-img-url').value)">Link'i Kopyala</button>
                         `,
                        confirmButtonText: 'Tamam'
                    });
                } else {
                    Swal.fire('Hata', res.message || 'Yüklenemedi.', 'error');
                }
            }).catch(e => {
                Swal.fire('Hata', 'Sunucu hatası: ' + e, 'error');
            });
        }
    });
}

// ============================================================
// --- AKTİF KULLANICI YÖNETİMİ (v14.1) ---
// ============================================================

async function openActiveUsersPanel() {
    try {
        Swal.fire({ title: 'Yükleniyor...', didOpen: () => { Swal.showLoading() } });

        const res = await apiCall("getActiveUsers", {});

        if (!res || res.result !== "success") {
            Swal.fire("Hata", "Aktif kullanıcılar yüklenemedi", "error");
            return;
        }

        const users = res.users || [];

        if (users.length === 0) {
            Swal.fire({
                title: "👥 Aktif Kullanıcılar",
                html: '<p style="color:#999;padding:20px">Şu an aktif kullanıcı yok.</p>',
                confirmButtonText: 'Tamam'
            });
            return;
        }

        const rowsHtml = users.map((u, idx) => {
            // Online/Offline Kontrolü (65 saniye tolerans)
            const lastSeenDate = u.last_seen ? new Date(u.last_seen) : null;
            const now = new Date();
            const diffSeconds = lastSeenDate ? (now - lastSeenDate) / 1000 : 999999;
            const isOnline = diffSeconds < 65;

            const lastSeenStr = lastSeenDate ? lastSeenDate.toLocaleString('tr-TR') : '-';

            return `
                <tr style="border-bottom:1px solid #eee; background-color:${isOnline ? 'transparent' : '#f9f9f9'}">
                    <td style="padding:12px;text-align:center; color:${isOnline ? 'inherit' : '#999'}">${idx + 1}</td>
                    <td style="padding:12px;font-weight:600; color:${isOnline ? 'inherit' : '#999'}">${escapeHtml(u.username)}</td>
                    <td style="padding:12px;text-align:center">
                        <span style="display:inline-block;padding:4px 8px;border-radius:4px;font-size:0.85rem;background:${u.role === 'admin' ? '#4caf50' :
                    u.role === 'locadmin' ? '#2196f3' :
                        u.role === 'qusers' ? '#ff9800' : '#9e9e9e'
                };color:#fff;opacity:${isOnline ? 1 : 0.6}">${escapeHtml(u.role)}</span>
                    </td>
                    <td style="padding:12px;font-size:0.9rem; color:${isOnline ? 'inherit' : '#999'}">${escapeHtml(u.group || '-')}</td>
                    <td style="padding:12px;font-size:0.85rem;color:#666">${escapeHtml(lastSeenStr)}</td>
                    <td style="padding:12px;text-align:center">
                        ${isOnline
                    ? `<span style="color:#2e7d32;font-weight:bold;font-size:0.85rem;padding:4px 8px;background:#e8f5e9;border-radius:12px"><i class="fas fa-circle" style="font-size:8px;vertical-align:middle"></i> Online</span>`
                    : `<span style="color:#757575;font-weight:bold;font-size:0.85rem;padding:4px 8px;background:#eeeeee;border-radius:12px"><i class="far fa-circle" style="font-size:8px;vertical-align:middle"></i> Offline</span>`
                }
                    </td>
                    <td style="padding:12px;text-align:center">
                       ${(u.username !== currentUser) ?
                    `<button 
                            onclick="kickUser('${escapeForJsString(u.username)}', '${u.id || ''}')" 
                            style="padding:6px 12px;background:#d32f2f;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem; opacity:${isOnline ? 1 : 0.5}"
                            title="Kullanıcıyı sistemden at">
                            <i class="fas fa-power-off"></i> At
                        </button>` : '<span style="color:#ccc">-</span>'
                }
                    </td>
                </tr>
            `;
        }).join('');

        const tableHtml = `
            <div style="max-height:500px;overflow:auto;border:1px solid rgba(0,0,0,.08);border-radius:12px">
                <table style="width:100%;border-collapse:collapse">
                    <thead style="position:sticky;top:0;background:#f7f7f7;z-index:1">
                        <tr>
                            <th style="padding:12px;text-align:center">#</th>
                            <th style="padding:12px;text-align:left">Kullanıcı</th>
                            <th style="padding:12px;text-align:center">Rol</th>
                            <th style="padding:12px;text-align:left">Grup</th>
                            <th style="padding:12px;text-align:left">Son Sinyal</th>
                            <th style="padding:12px;text-align:center">Durum</th>
                            <th style="padding:12px;text-align:center">İşlem</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
            <div style="margin-top:15px;padding:10px;background:#e3f2fd;border-radius:8px;font-size:0.9rem;color:#1976d2">
                <i class="fas fa-info-circle"></i> <strong>Online:</strong> Son 1 dk içinde aktif. <strong>Offline:</strong> Son 24 saat içinde giriş yapmış.
                <br><small>Not: "At" butonu kullanıcıyı bir sonraki sinyalde (max 30sn) sistemden düşürür.</small>
            </div>
        `;

        Swal.fire({
            title: "👥 Aktif Kullanıcılar",
            html: tableHtml,
            width: 1000,
            showConfirmButton: true,
            confirmButtonText: "Kapat"
        });

    } catch (e) {
        Swal.fire("Hata", "Bir hata oluştu: " + e.message, "error");
    }
}

async function kickUser(username, userId) {
    if (!userId && username) {
        // Fallback or lookup needed if we only have username, but active users list has id now
        // But for safety, let's look up profile by username if id missing
        const { data } = await sb.from('profiles').select('id').eq('username', username).single();
        if (data) userId = data.id;
    }

    const { isConfirmed } = await Swal.fire({
        title: 'Kullanıcıyı At?',
        text: `${username} kullanıcısı sistemden atılacak.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Evet, At'
    });

    if (isConfirmed && userId) {
        try {
            const { error } = await sb.from('profiles').update({ force_logout: true }).eq('id', userId);

            if (error) throw error;

            saveLog("Kullanıcıyı Sistemden Atma", username);
            Swal.fire('Başarılı', 'Kullanıcıya çıkış komutu gönderildi (max 30sn).', 'success');
            openActiveUsersPanel();
        } catch (e) {
            console.error(e);
            Swal.fire('Hata', 'Kullanıcı atılamadı: ' + e.message, 'error');
        }
    }
}

// ============================================================
// --- GELİŞMİŞ YETKİ YÖNETİMİ (RBAC) (v14.2) ---
// ============================================================

async function fetchUserListForAdmin() {
    try {
        const res = await apiCall("getUserList", {});
        if (res && res.result === "success") {
            adminUserList = res.users || [];
            console.log("[Pusula] Admin User List loaded:", adminUserList.length);
        }
    } catch (e) {
        console.error("[Pusula] fetchUserListForAdmin error:", e);
    }
}

// ------------------------------------------------------------
// --- KULLANICI YÖNETİMİ (YENİ) ---
// ------------------------------------------------------------
async function openUserManagementPanel() {
    try {
        Swal.fire({ title: 'Yükleniyor...', didOpen: () => { Swal.showLoading() } });
        const res = await apiCall("getUserList", {});
        if (!res || res.result !== "success") throw new Error("Kullanıcı listesi alınamadı.");

        const users = res.users || [];
        const rowsHtml = users.map((u, idx) => `
            <tr style="border-bottom:1px solid #eee">
                <td style="padding:10px;text-align:center">${idx + 1}</td>
                <td style="padding:10px;"><strong>${escapeHtml(u.username || u.name)}</strong></td>
                <td style="padding:10px;">${escapeHtml(u.role || '-')}</td>
                <td style="padding:10px;">${escapeHtml(u.group || '-')}</td>
                <td style="padding:10px;text-align:center">
                    <button class="x-btn-admin" onclick="editUserPopup('${u.id}')" style="background:var(--secondary);padding:5px 10px;font-size:0.75rem;"><i class="fas fa-edit"></i> Düzenle</button>
                    <button class="x-btn-admin" onclick="deleteUser('${u.id}', '${escapeForJsString(u.username || u.name)}')" style="background:var(--accent);padding:5px 10px;font-size:0.75rem;"><i class="fas fa-trash"></i> Sil</button>
                </td>
            </tr>
        `).join('');

        const tableHtml = `
            <div style="margin-bottom:15px;text-align:right">
                <!-- Yeni Kullanıcı butonu kaldırıldı, Supabase Auth zorunlu -->
                <button class="x-btn-admin" onclick="Swal.fire('Bilgi', 'Yeni kullanıcıları Supabase Dashboard üzerinden ekleyiniz.', 'info')" style="background:#ddd; color:#555"><i class="fas fa-info-circle"></i> Kullanıcı Ekleme Hakkında</button>
            </div>
            <div style="max-height:450px;overflow:auto;border:1px solid #eee;border-radius:10px">
                <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
                    <thead style="background:#f9fafb;position:sticky;top:0;">
                        <tr>
                            <th style="padding:10px;">#</th>
                            <th style="padding:10px;text-align:left">Kullanıcı</th>
                            <th style="padding:10px;text-align:left">Rol</th>
                            <th style="padding:10px;text-align:left">Grup</th>
                            <th style="padding:10px;">İşlem</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;

        Swal.fire({
            title: "👥 Kullanıcı Yönetimi",
            html: tableHtml,
            width: 800,
            showConfirmButton: true,
            confirmButtonText: "Kapat"
        });

        // Global fonksiyon tanımları (Swal modal içinde onclick için)
        window.editUserPopup = async function (id) {
            let u = id ? users.find(x => String(x.id) === String(id)) : null;
            if (!u) return; // Sadece düzenleme

            const { value: formValues } = await Swal.fire({
                title: 'Kullanıcı Düzenle',
                html: `
                    <input id="u-name" class="swal2-input" placeholder="Kullanıcı Adı" value="${u.username || u.name || ''}" readonly style="background:#eee">
                    <p style="font-size:0.8rem;text-align:left;color:#666;margin:5px 23px;">Rol ve Grup yetkilerini güncelleyebilirsiniz.</p>
                    <select id="u-role" class="swal2-input">
                        <option value="user" ${u.role === 'user' ? 'selected' : ''}>Kullanıcı</option>
                        <option value="agent" ${u.role === 'agent' ? 'selected' : ''}>Temsilci (Agent)</option>
                        <option value="qusers" ${u.role === 'qusers' ? 'selected' : ''}>Kalite (QA)</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Yönetici (Admin)</option>
                        <option value="locadmin" ${u.role === 'locadmin' ? 'selected' : ''}>Tam Yetkili (LocAdmin)</option>
                    </select>
                    <input id="u-group" class="swal2-input" placeholder="Grup (Örn: Telesatış)" value="${u.group || ''}">
                `,
                showCancelButton: true,
                confirmButtonText: 'Kaydet',
                preConfirm: () => {
                    return {
                        id,
                        username: u.username,
                        fullName: u.name,
                        role: document.getElementById('u-role').value,
                        group: document.getElementById('u-group').value
                    };
                }
            });

            if (formValues) {
                Swal.fire({ title: 'Kaydediliyor...', didOpen: () => Swal.showLoading() });
                const res = await apiCall("saveUser", formValues);
                if (res.result === "success") {
                    Swal.fire("Başarılı", "Kullanıcı kaydedildi.", "success").then(() => openUserManagementPanel());
                } else {
                    Swal.fire("Hata", res.message || "Kaydedilemedi", "error");
                }
            }
        };

        window.deleteUser = async function (id, name) {
            const confirmed = await Swal.fire({
                title: 'Emin misiniz?',
                text: `${name} kullanıcısını silmek istediğinize emin misiniz?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Evet, Sil',
                confirmButtonColor: '#d32f2f'
            });
            if (confirmed.isConfirmed) {
                const res = await apiCall("deleteUser", { id });
                if (res.result === "success") {
                    Swal.fire("Silindi", "Kullanıcı silindi.", "success").then(() => openUserManagementPanel());
                } else {
                    Swal.fire("Hata", res.message || "Silinemedi", "error");
                }
            }
        };
    } catch (e) {
        Swal.fire("Hata", e.message, "error");
    }
}

async function openLogsPanel() {
    try {
        Swal.fire({ title: 'Günlükler yükleniyor...', didOpen: () => { Swal.showLoading() } });
        const res = await apiCall("getLogs", {});
        if (!res || res.result !== "success") throw new Error("Loglar alınamadı.");

        const logs = res.logs || [];
        const rowsHtml = logs.map((l, idx) => `
            <tr style="border-bottom:1px solid #eee; font-size:0.8rem;">
                <td style="padding:8px; color:#888;">${new Date(l.Date).toLocaleString('tr-TR')}</td>
                <td style="padding:8px;"><strong>${escapeHtml(l.Username)}</strong></td>
                <td style="padding:8px;"><span class="badge" style="background:#e3f2fd; color:#1976d2; padding:2px 6px; border-radius:4px;">${escapeHtml(l.Action)}</span></td>
                <td style="padding:8px; color:#555;">${escapeHtml(l.Details)}</td>
                <td style="padding:8px; color:#999; font-family:monospace;">${escapeHtml(l["İP ADRESİ"] || '-')}</td>
            </tr>
        `).join('');

        const tableHtml = `
            <div style="max-height:500px; overflow:auto; border:1px solid #eee; border-radius:10px;">
                <table style="width:100%; border-collapse:collapse; text-align:left;">
                    <thead style="background:#f4f7f9; position:sticky; top:0;">
                        <tr>
                            <th style="padding:10px;">Tarih</th>
                            <th style="padding:10px;">Kullanıcı</th>
                            <th style="padding:10px;">Eylem</th>
                            <th style="padding:10px;">Detay</th>
                            <th style="padding:10px;">IP</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;

        Swal.fire({
            title: "📜 Sistem Logları",
            html: tableHtml,
            width: 1000,
            showConfirmButton: true,
            confirmButtonText: "Kapat"
        });
    } catch (e) {
        Swal.fire('Hata', 'Loglar yüklenirken bir sorun oluştu.', 'error');
    }
}

async function openMenuPermissions() {
    try {
        Swal.fire({ title: 'Yetkiler Yükleniyor...', didOpen: () => { Swal.showLoading() } });

        const res = await apiCall("getRolePermissions", {});
        if (!res || res.result !== "success") {
            Swal.fire("Hata", "Yetki listesi alınamadı.", "error");
            return;
        }

        allRolePermissions = res.permissions || [];
        // 🕵️ LocAdmin filtreli roller (Sadece grup isimleri, bireysel yetkileri -U:- gizle)
        const roles = (res.groups || ["admin", "qusers", "users"]).filter(r =>
            r.toLowerCase() !== 'locadmin' && !r.toLowerCase().startsWith('u:')
        );

        let rbacMode = 'roles'; // 'roles' veya 'users'
        let activeTabIndex = 0;
        let selectedUser = null;
        let userSearchQuery = "";
        let adminUserList = []; // Kullanıcı listesi (lazily loaded)

        const renderRbacContent = (containerOnly = false) => {
            // ✅ Dinamik Sayfa Listesi
            const pageLabels = {
                home: "Ana Sayfa", search: "Arama Çubuğu", news: "Duyurular", tech: "Teknik Sayfası",
                persuasion: "İkna Sayfası", campaign: "Kampanya Sayfası", info: "Bilgi Sayfası",
                broadcast: "Yayın Akışı", guide: "Spor Rehberi", return: "İade Asistanı",
                telesales: "TeleSatış", game: "Oyun Merkezi", quality: "Kalite Paneli", shift: "Vardiyam"
            };
            const discoveredPages = [];
            const processedKeys = new Set();
            document.querySelectorAll('[data-menu-key]').forEach(el => {
                const key = el.getAttribute('data-menu-key');
                if (!processedKeys.has(key)) {
                    discoveredPages.push({
                        key: key,
                        label: pageLabels[key] || (el.textContent.trim().replace(/\s+/g, ' ') || key),
                        perms: ["View"]
                    });
                    processedKeys.add(key);
                }
            });
            discoveredPages.sort((a, b) => a.label.localeCompare(b.label, 'tr'));

            const resources = [
                {
                    cat: "Genel Yetkiler", items: [
                        { key: "EditMode", label: "Düzenleme Modunu Açma", perms: ["Execute"] },
                        { key: "AddContent", label: "Yeni İçerik Ekleme", perms: ["Execute"] },
                        { key: "ImageUpload", label: "Görsel Yükleme", perms: ["Execute"] },
                        { key: "Reports", label: "Rapor Çekme (Dışa Aktar)", perms: ["Execute"] },
                        { key: "RbacAdmin", label: "Yetki Yönetimi", perms: ["Execute"] },
                        { key: "ActiveUsers", label: "Aktif Kullanıcılar", perms: ["Execute"] },
                        { key: "UserAdmin", label: "Kullanıcı Yönetimi", perms: ["Execute"] },
                        { key: "SystemLogs", label: "Sistem Logları", perms: ["Execute"] },
                        { key: "AiBot", label: "AI Asistan Erişimi", perms: ["Execute"] }
                    ]
                },
                { cat: "Sayfa Erişimi", items: discoveredPages },
                {
                    cat: "Kalite Yönetimi", items: [
                        { key: "Evaluation", label: "Değerlendirme Yapma", perms: ["Execute"] },
                        { key: "Feedback", label: "Geri Bildirim Ekleme", perms: ["Execute"] },
                        { key: "Training", label: "Eğitim Atama", perms: ["Execute"] }
                    ]
                }
            ];

            const currentId = rbacMode === 'roles' ? roles[activeTabIndex] : ("u:" + (selectedUser ? selectedUser.username : ""));
            const currentPerms = allRolePermissions.filter(p => p.role === currentId);

            let html = `
                <div class="rbac-container">
                    <div class="rbac-tabs">
                        <button class="rbac-tab-btn ${rbacMode === 'roles' ? 'active' : ''}" onclick="window.switchRbacMode('roles')">
                            <i class="fas fa-users-gear"></i> Grup Yetkileri
                        </button>
                        <button class="rbac-tab-btn ${rbacMode === 'users' ? 'active' : ''}" onclick="window.switchRbacMode('users')">
                            <i class="fas fa-user-lock"></i> Kullanıcı Bazlı Yetki
                        </button>
                    </div>

                    ${rbacMode === 'roles' ? `
                        <div class="rbac-role-selector" style="margin-top:15px">
                            ${roles.map((r, i) => `
                                <button class="rbac-role-btn ${i === activeTabIndex ? 'active' : ''}" onclick="window.switchRbacRole(${i})">
                                    ${r.toUpperCase()}
                                </button>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="rbac-user-selector" style="margin-top:15px">
                            <input type="text" class="swal2-input rbac-search" placeholder="Kullanıcı ara..." 
                                value="${userSearchQuery}" onkeyup="window.searchRbacUser(this.value)" style="margin:0; width:100%; font-size:0.9rem">
                            <div class="rbac-user-list">
                                ${adminUserList.filter(u => !userSearchQuery || u.username.toLowerCase().includes(userSearchQuery.toLowerCase())).map(u => `
                                    <div class="rbac-user-item ${selectedUser && selectedUser.username === u.username ? 'active' : ''}" 
                                        onclick="window.selectRbacUser('${u.username}')">
                                        <i class="fas fa-user-circle"></i>
                                        <span>${u.username}</span>
                                        <small>${u.group || 'Grup Yok'}</small>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `}

                    <div class="rbac-table-wrapper" style="${rbacMode === 'users' && !selectedUser ? 'display:none' : ''}">
                        <div style="padding:10px; font-weight:600; color:var(--primary); font-size:0.9rem; border-bottom:1px solid #eee">
                            <i class="fas fa-shield-alt"></i> 
                            ${rbacMode === 'roles' ? `${currentId.toUpperCase()} Grubu` : `${selectedUser?.username} Özel`} Yetkileri
                        </div>
                        <table class="rbac-table">
                            <thead>
                                <tr>
                                    <th style="text-align:left">Kaynak</th>
                                    <th style="text-align:center">Durum</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${resources.map(cat => `
                                    <tr class="rbac-category-row"><td colspan="2">${cat.cat}</td></tr>
                                    ${cat.items.map(item => {
                const permRecord = currentPerms.find(p => p.resource === item.key);
                const isEnabled = permRecord ? permRecord.value : false;
                const isOverridden = rbacMode === 'users' && permRecord;
                return `
                                            <tr class="${isOverridden ? 'rbac-overridden' : ''}">
                                                <td class="rbac-resource-name">
                                                    ${item.label}
                                                    ${isOverridden ? '<span class="rbac-tag-ovr">Bireysel</span>' : ''}
                                                </td>
                                                <td style="text-align:center">
                                                    <label class="rbac-switch">
                                                        <input type="checkbox" id="perm_${item.key}" ${isEnabled ? 'checked' : ''} 
                                                            onchange="window.toggleRbacPerm('${currentId}', '${item.key}', this.checked)">
                                                        <span class="rbac-slider"></span>
                                                    </label>
                                                </td>
                                            </tr>
                                        `;
            }).join('')}
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            return html;
        };

        // Modal Global Fonksiyonları
        window.switchRbacMode = async (mode) => {
            rbacMode = mode;
            if (mode === 'users' && adminUserList.length === 0) {
                const uRes = await apiCall("getUserList", {});
                adminUserList = uRes.users || [];
            }
            Swal.update({ html: renderRbacContent() });
        };

        window.switchRbacRole = (idx) => {
            activeTabIndex = idx;
            Swal.update({ html: renderRbacContent() });
        };

        window.selectRbacUser = (username) => {
            selectedUser = adminUserList.find(u => u.username === username);
            Swal.update({ html: renderRbacContent() });
        };

        window.searchRbacUser = (q) => {
            userSearchQuery = q;
            const container = document.querySelector('.rbac-user-list');
            if (container) {
                const filtered = adminUserList.filter(u => !q || u.username.toLowerCase().includes(q.toLowerCase()));
                container.innerHTML = filtered.map(u => `
                    <div class="rbac-user-item ${selectedUser && selectedUser.username === u.username ? 'active' : ''}" 
                        onclick="window.selectRbacUser('${u.username}')">
                        <i class="fas fa-user-circle"></i>
                        <span>${u.username}</span>
                        <small>${u.group || 'Grup Yok'}</small>
                    </div>
                `).join('');
            }
        };

        window.toggleRbacPerm = (id, resource, val) => {
            const idx = allRolePermissions.findIndex(p => p.role === id && p.resource === resource);
            if (idx > -1) {
                allRolePermissions[idx].value = val;
            } else {
                allRolePermissions.push({ role: id, resource: resource, permission: "All", value: val });
            }
            if (rbacMode === 'users') {
                Swal.update({ html: renderRbacContent() });
            }
        };

        Swal.fire({
            title: "🛡️ Yetki Yönetimi",
            html: renderRbacContent(),
            width: 850,
            showCancelButton: true,
            cancelButtonText: "Vazgeç",
            confirmButtonText: "Değişiklikleri Kaydet",
            confirmButtonColor: "var(--success)",
            preConfirm: async () => {
                try {
                    Swal.showLoading();
                    const uniqueRoles = [...new Set(allRolePermissions.map(p => p.role))];
                    for (const r of uniqueRoles) {
                        const rPerms = allRolePermissions.filter(p => p.role === r).map(p => ({
                            resource: p.resource,
                            permission: p.permission || "All",
                            value: p.value
                        }));
                        await apiCall("setRolePermissions", { role: r, perms: rPerms });
                    }
                    return true;
                } catch (e) {
                    Swal.showValidationMessage(`Kayıt hatası: ${e.message}`);
                }
            }
        }).then((result) => {
            if (result.isConfirmed) {
                Swal.fire("Başarılı", "Tüm yetkiler güncellendi.", "success");
                loadPermissionsOnStartup();
            }
        });

    } catch (e) {
        Swal.fire("Hata", "Bir hata oluştu: " + e.message, "error");
    }
}

function hasPerm(resource, permission = "All") {
    const rawRole = (getMyRole() || "").trim().toLowerCase();
    const rawGroup = (localStorage.getItem("sSportGroup") || "").trim().toLowerCase();
    const rawUser = String(currentUser || localStorage.getItem("sSportUser") || "").trim().toLowerCase();

    // Güçlü Normalizasyon (Türkçe karakter ve i̇ karmaşasını bitirir)
    function clean(str) {
        return String(str || "").toLowerCase()
            .replace(/i̇/g, 'i').replace(/ı/g, 'i').replace(/ş/g, 's')
            .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').trim();
    }

    const cRole = clean(rawRole);
    const cGroup = clean(rawGroup);
    const cUser = clean(rawUser);

    // 1. KULLANICI TALEBİ: LocAdmin (Rol veya Grup) sınırsız yetkilidir.
    if (cRole === "locadmin" || cGroup === "locadmin" || cUser === "locadmin") return true;

    // 1.5. ÖNCELİK: BİREYSEL KULLANICI YETKİSİ (Individual Override)
    const userPerm = allRolePermissions.find(p =>
        clean(p.role) === "u:" + cUser &&
        (p.resource === resource || p.resource === "All") &&
        (p.permission === permission || p.permission === "All")
    );
    if (userPerm) return userPerm.value;

    // 2. ÖNCELİK: GRUP (TAKIM) YETKİSİ
    if (cGroup && cGroup !== "" && cGroup !== "all") {
        const groupPerm = allRolePermissions.find(p =>
            clean(p.role) === cGroup &&
            (p.resource === resource || p.resource === "All") &&
            (p.permission === permission || p.permission === "All")
        );
        if (groupPerm) return groupPerm.value;
    }

    // 3. FALLBACK: ROL YETKİSİ
    const rolePerm = allRolePermissions.find(p =>
        clean(p.role) === cRole &&
        (p.resource === resource || p.resource === "All") &&
        (p.permission === permission || p.permission === "All")
    );

    return rolePerm ? rolePerm.value : false;
}

// Login sonrası yetkileri arka planda yükle
async function loadPermissionsOnStartup() {
    if (!currentUser) return;
    const res = await apiCall("getRolePermissions", {});
    if (res && res.result === "success") {
        allRolePermissions = res.permissions || [];
        applyPermissionsToUI();

        // ✅ Akıllı Yönlendirme: Eğer Ana Sayfa (Home) yetkisi kapalıysa, yetkisi olan ilk sayfaya yönlendir.
        if (!hasPerm("home", "View")) {
            // Kontrol edilecek öncelikli sayfalar
            const landingPages = [
                { key: "quality", action: openQualityArea },
                { key: "tech", action: () => openTechArea('wizard') },
                { key: "shift", action: () => filterCategory(null, "shift") },
                { key: "news", action: openNews },
                { key: "broadcast", action: openBroadcastFlow },
                { key: "telesales", action: () => filterCategory(null, "Telesatış") },
                { key: "persuasion", action: () => filterCategory(null, "İkna") },
                { key: "campaign", action: () => filterCategory(null, "Kampanya") },
                { key: "info", action: () => filterCategory(null, "Bilgi") }
            ];

            for (const page of landingPages) {
                if (hasPerm(page.key, "View")) {
                    page.action();
                    console.log(`[Auth] Ana sayfa yetkisi yok, ${page.key} sayfasına yönlendirildi.`);
                    break;
                }
            }
        }
    }
}

/**
 * Kaydedilen yetkilere göre arayüzdeki butonları gizle/göster
 */
function applyPermissionsToUI() {
    const role = getMyRole();
    // Sadece LocAdmin için yetki kısıtlaması yok (tam yetki)
    // Admin kullanıcılar RBAC panelinden verilen yetkilere tabidir
    const editBtn = document.getElementById('dropdownQuickEdit');
    if (editBtn) editBtn.style.display = hasPerm("EditMode") ? 'flex' : 'none';

    const addCardBtn = document.getElementById('dropdownAddCard');
    if (addCardBtn) addCardBtn.style.display = hasPerm("AddContent") ? 'flex' : 'none';

    const imageBtn = document.getElementById('dropdownImage');
    if (imageBtn) imageBtn.style.display = hasPerm("ImageUpload") ? 'flex' : 'none';

    const reportBtns = document.querySelectorAll('.admin-btn');
    reportBtns.forEach(btn => {
        btn.style.display = hasPerm("Reports") ? '' : 'none';
    });

    const permsBtn = document.getElementById('dropdownPerms');
    if (permsBtn) permsBtn.style.display = hasPerm("RbacAdmin") ? 'flex' : 'none';

    const activeUsersBtn = document.getElementById('dropdownActiveUsers');
    if (activeUsersBtn) activeUsersBtn.style.display = hasPerm("ActiveUsers") ? 'flex' : 'none';

    const userMgmtBtn = document.getElementById('dropdownUserMgmt');
    if (userMgmtBtn) userMgmtBtn.style.display = hasPerm("UserAdmin") ? 'flex' : 'none';

    const logsBtn = document.getElementById('dropdownLogs');
    if (logsBtn) logsBtn.style.display = hasPerm("SystemLogs") ? 'flex' : 'none';

    const aiBotContainer = document.getElementById('ai-widget-container');
    if (aiBotContainer) aiBotContainer.style.display = (currentUser && hasPerm("AiBot")) ? 'block' : 'none';

    const menuMap = {
        "home": "home",
        "search": "search",
        "tech": "tech",
        "telesales": "telesales",
        "persuasion": "persuasion",
        "campaign": "campaign",
        "info": "info",
        "news": "news",
        "quality": "quality",
        "shift": "shift",
        "broadcast": "broadcast",
        "guide": "guide",
        "return": "return",
        "game": "game"
    };

    Object.keys(menuMap).forEach(key => {
        const elements = document.querySelectorAll(`[data-menu-key="${key}"]`);
        elements.forEach(el => {
            if (!hasPerm(menuMap[key], "View")) {
                el.style.display = 'none';
            } else {
                el.style.display = '';
            }
        });

        // Hızlı kısayollar (ana sayfa chips) - data-shortcut-key ile de eşleşebilirler
        const shortcuts = document.querySelectorAll(`[data-shortcut-key="${key}"]`);
        shortcuts.forEach(sc => {
            if (!hasPerm(menuMap[key], "View")) {
                sc.style.display = 'none';
            } else {
                sc.style.display = '';
            }
        });
    });

    // Hızlı İşlemler kartının genel görünürlüğünü kontrol et (Eğer hiç buton kalmadıysa kartı da gizle)
    const shortcutsCard = document.getElementById('home-shortcuts-card');
    if (shortcutsCard) {
        const visibleShortcuts = Array.from(shortcutsCard.querySelectorAll('.home-chip')).filter(btn => btn.style.display !== 'none');
        shortcutsCard.style.display = visibleShortcuts.length > 0 ? '' : 'none';
    }

    // Ana sayfa düzenleme butonlarını da yetkiye göre tazele
    try {
        if (currentCategory === 'home') renderHomePanels();
    } catch (e) { }

    // Bildirimleri kontrol et
    checkQualityNotifications();
}

// --- KALİTE GERİ BİLDİRİM & NOT SİSTEMİ POPUPLARI ---

async function openAgentNotePopup(callId, color) {
    const { value: note } = await Swal.fire({
        title: '💬 Görüş / Not Ekle',
        html: `
        <div style="margin-top:5px; text-align:left;">
            <p style="font-size:0.9rem; color:#555; margin-bottom:10px;">
                Bu değerlendirme ile ilgili eklemek istediğiniz bir not, teşekkür veya görüş varsa aşağıya yazabilirsiniz.
            </p>
            <textarea id="swal-agent-note" class="swal2-textarea" style="margin-top:0;" placeholder="Notunuzu buraya yazın..."></textarea>
        </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Gönder',
        cancelButtonText: 'Vazgeç',
        confirmButtonColor: '#f57c00',
        preConfirm: () => {
            const noteVal = document.getElementById('swal-agent-note').value;
            if (!noteVal || !noteVal.trim()) {
                Swal.showValidationMessage('Lütfen bir not yazın veya Vazgeç butonuna basın.');
                return false;
            }
            return noteVal.trim();
        }
    });

    if (note) {
        Swal.fire({ title: 'Not Kaydediliyor...', didOpen: () => Swal.showLoading(), showConfirmButton: false });
        try {
            const res = await apiCall("submitAgentNote", { callId: callId, username: currentUser, note: note, status: 'Bekliyor' });
            if (res.result === 'success') {
                Swal.fire('Başarılı', 'Görüşünüz yöneticiye iletildi.', 'success');
                fetchEvaluationsForAgent(currentUser); // Listeyi yenile
                checkQualityNotifications(); // Bildirimleri yenile
            } else {
                Swal.fire('Hata', 'İşlem sırasında bir kısıtlama oluştu. Lütfen bağlantınızı kontrol edin.', 'error');
            }
        } catch (e) {
            Swal.fire('Hata', 'Sistem hatası oluştu. Lütfen tekrar deneyin.', 'error');
        }
    }
}

// --- WIZARD EDITOR (ADMIN ONLY) ---
async function openWizardEditor(table, stepId) {
    if (!isAdminMode) return;

    let currentData = (table === 'WizardSteps') ? wizardStepsData[stepId] : techWizardData[stepId];
    if (!currentData) { Swal.fire('Hata', 'Adım verisi bulunamadı.', 'error'); return; }

    let optionsStr = (table === 'WizardSteps')
        ? currentData.options.map(o => `${o.text} | ${o.next} | ${o.style || 'primary'}`).join(', ')
        : (currentData.buttons || []).map(b => `${b.text} | ${b.next} | ${b.style || 'primary'}`).join(', ');

    const { value: v } = await Swal.fire({
        title: `🔧 Düzenle: ${stepId}`,
        html: `
            <div style="text-align:left; font-size:0.85rem;">
                <label>Başlık</label><input id="w-title" class="swal2-input" value="${currentData.title || ''}">
                <label>Metin</label><textarea id="w-text" class="swal2-textarea" style="height:80px;">${currentData.text || ''}</textarea>
                <label>Script</label><textarea id="w-script" class="swal2-textarea" style="height:60px;">${currentData.script || ''}</textarea>
                <label>Seçenekler (Format: Metin | NextID | Style , ...)</label>
                <textarea id="w-options" class="swal2-textarea" style="height:80px;">${optionsStr}</textarea>
                ${table === 'WizardSteps' ? `<label>Sonuç (red, green, yellow)</label><input id="w-result" class="swal2-input" value="${currentData.result || ''}">` : ''}
                ${table === 'TechWizardSteps' ? `<label>Alert</label><input id="w-alert" class="swal2-input" value="${currentData.alert || ''}">` : ''}
            </div>
        `,
        width: 600, showCancelButton: true, confirmButtonText: 'Kaydet',
        preConfirm: () => ({
            title: document.getElementById('w-title').value,
            text: document.getElementById('w-text').value,
            script: document.getElementById('w-script').value,
            options: document.getElementById('w-options').value,
            result: document.getElementById('w-result') ? document.getElementById('w-result').value : null,
            alert: document.getElementById('w-alert') ? document.getElementById('w-alert').value : null
        })
    });

    if (v) {
        Swal.fire({ title: 'Kaydediliyor...', didOpen: () => Swal.showLoading() });
        try {
            const payload = {
                StepID: stepId,
                Title: v.title,
                Text: v.text,
                Script: v.script
            };

            if (table === 'WizardSteps') {
                payload['Options(Text|NextID,...)'] = v.options;
                if (v.result !== null) payload.Result = v.result;
            } else {
                payload.Options = v.options;
                if (v.alert !== null) payload.Alert = v.alert;
            }

            // Doğrudan 'update' işlemi kullan (upsert constraint hatasını önlemek için)
            const matchCol = table === 'WizardSteps' ? 'StepID' : 'stepId';
            const { error } = await sb.from(table).update(payload).eq(matchCol, stepId);
            if (error) throw error;

            Swal.fire('Başarılı', 'Güncellendi. Yenileniyor...', 'success');
            if (table === 'WizardSteps') { await loadWizardData(); renderStep(stepId); }
            else { await loadTechWizardData(); twRenderStep(); }
        } catch (e) {
            Swal.fire('Hata', 'Kaydedilemedi: ' + e.message, 'error');
        }
    }
}

async function openAdminReplyPopup(id, callId, agentName, currentNote) {
    console.log("[Pusula Debug] openAdminReplyPopup triggered:", { id, callId, agentName });

    const { value: formValues } = await Swal.fire({
        title: 'Geri Bildirim Yanıtla',
        html: `
        <div style="text-align:left; background:#f5f5f5; padding:12px; border-radius:8px; margin-bottom:15px; font-size:0.9rem; border-left:4px solid var(--secondary);">
            <strong style="color:var(--primary);">Temsilci Görüşü:</strong><br>
            <div style="margin-top:5px; font-style:italic;">"${escapeHtml(currentNote)}"</div>
        </div>
        <div style="margin-bottom:10px; text-align:left; font-size:0.85rem; font-weight:600; color:#555;">Yanıtınız:</div>
        <textarea id="swal-manager-reply" class="swal2-textarea" style="margin-top:0; height:120px;" placeholder="Temsilciye iletilecek cevabı yazın..."></textarea>
        
        <div style="margin-top:15px; margin-bottom:5px; text-align:left; font-size:0.85rem; font-weight:600; color:#555;">Süreç Durumu:</div>
        <select id="swal-reply-status" class="swal2-input" style="margin-top:0;">
            <option value="Tamamlandı">✅ Yanıtla ve Süreci Tamamla</option>
            <option value="Bekliyor">⏳ İnceleme Devam Ediyor</option>
            <option value="Kapatıldı">❌ Yanıtla ve Kapat</option>
        </select>
        `,
        showCancelButton: true,
        confirmButtonText: 'Kaydet ve Gönder',
        cancelButtonText: 'İptal',
        confirmButtonColor: 'var(--primary)',
        preConfirm: () => {
            const reply = document.getElementById('swal-manager-reply').value;
            if (!reply || !reply.trim()) {
                Swal.showValidationMessage('Lütfen bir yanıt yazın.');
                return false;
            }
            return {
                reply: reply.trim(),
                status: document.getElementById('swal-reply-status').value
            };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Kaydediliyor...', didOpen: () => Swal.showLoading(), showConfirmButton: false });
        try {
            const res = await apiCall("resolveAgentFeedback", {
                id: id,
                callId: callId,
                agentName: agentName,
                reply: formValues.reply,
                status: formValues.status,
                username: currentUser
            });
            if (res.result === 'success') {
                Swal.fire('Başarılı', 'Yanıt kaydedildi.', 'success');
                // Agent listesini yenile
                fetchEvaluationsForAgent(agentName, true); // Silent refresh
                checkQualityNotifications();
            } else {
                Swal.fire('Hata', 'Kaydedilemedi: ' + (res.message || 'Bilinmeyen hata'), 'error');
            }
        } catch (e) {
            Swal.fire('Hata', 'Sunucu hatası: ' + e.message, 'error');
        }
    }
}

function checkQualityNotifications() {
    apiCall("getQualityNotifications", { username: currentUser, role: getMyRole() })
        .then(data => {
            if (data.result === 'success') {
                const notifs = data.notifications;
                let totalCount = 0;
                const qualityBtn = document.querySelector('[data-menu-key="quality"]');

                if (!qualityBtn) return;

                // Eğer varsa eski badge'i temizle
                const oldBadge = qualityBtn.querySelector('.notif-badge');
                if (oldBadge) oldBadge.remove();

                if (isAdminMode || isLocAdmin) {
                    totalCount = notifs.pendingFeedbackCount || 0;
                } else {
                    totalCount = notifs.unseenCount || 0;
                }

                if (totalCount > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'notif-badge';
                    badge.innerText = totalCount;
                    badge.style.cssText = `
                    position: absolute;
                    top: -5px;
                    right: -5px;
                    background: red;
                    color: white;
                    border-radius: 50%;
                    padding: 2px 6px;
                    font-size: 0.7rem;
                    font-weight: bold;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    animation: pulse 2s infinite;
                `;
                    qualityBtn.style.position = 'relative';
                    qualityBtn.appendChild(badge);
                }
            }
        }).catch(e => console.log('Notif check error', e));
}

// --- AI ASİSTAN MEKANİZMASI ---

function toggleAIChat() {
    const chatBox = document.getElementById("ai-chat-box");
    const isVisible = chatBox.style.display === "flex";
    chatBox.style.display = isVisible ? "none" : "flex";
    if (!isVisible) {
        setTimeout(() => document.getElementById("ai-input").focus(), 300);
    }
}

function handleAIEnter(e) {
    if (e.key === "Enter") sendAIMessage();
}

async function applyTDKCorrection() {
    const input = document.getElementById("ai-input");
    const text = input.value.trim();
    if (!text) return Swal.fire("Uyarı", "Önce düzeltilecek bir metin yazın.", "warning");

    const tdkBtn = document.querySelector('.tdk-btn');
    tdkBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    tdkBtn.disabled = true;

    try {
        const response = await fetch(GAS_MAIL_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: "askGemini",
                prompt: `Aşağıdaki metni Türk Dil Kurumu standardına uygun, kurumsal ve profesyonel bir dille yeniden yaz. Sadece düzeltilmiş metni döndür:\n\n"${text}"`,
                token: GAS_SECURITY_TOKEN
            })
        });
        const data = await response.json();
        if (data.result === "success") {
            input.value = data.reply.trim();
            Swal.fire({ icon: 'success', title: 'Düzenlendi', text: 'Metin kurumsal dile çevrildi!', timer: 1500, showConfirmButton: false, position: 'top-end', toast: true });
        }
    } catch (e) {
        console.error("TDK Error:", e);
    } finally {
        tdkBtn.innerHTML = '<i class="fas fa-magic-wand-sparkles"></i>';
        tdkBtn.disabled = false;
        input.focus();
    }
}

function sendAIMessage() {
    const input = document.getElementById("ai-input");
    const msg = input.value.trim();
    if (!msg) return;

    // --- YENİ: Pusula İçeriklerinden Alakalı Olanları Seçme (v40) ---
    let pusulaContext = "";
    try {
        const keywords = msg.toLowerCase().split(/\s+/).filter(word => word.length > 3);
        const relevantCards = database.filter(card => {
            const searchStr = (card.title + " " + card.text + " " + (card.category || "")).toLowerCase();
            return keywords.some(key => searchStr.includes(key));
        }); // Closing parenthesis for filter
        if (relevantCards.length > 0) {
            pusulaContext = "PUSULA SİSTEM KAYITLARI:\n" + relevantCards.map(c =>
                `[Başlık: ${c.title}] - [Bilgi: ${c.text}] - [Kategori: ${c.category}]`
            ).join('\n');
        }
    } catch (e) { console.warn("Pusula context hatası:", e); }

    // Kullanıcı mesajını ekle (Sağ taraf)
    addAIMessage(msg, "user");
    input.value = "";
    input.focus();

    // "Yazıyor..." göster
    addAITyping();

    fetch(GAS_MAIL_URL, {
        method: 'POST',
        body: JSON.stringify({
            action: "askGemini",
            prompt: msg,
            pusulaContext: pusulaContext, // Yeni: Pusula kart bilgilerini bota iletiyoruz
            token: GAS_SECURITY_TOKEN,
            timestamp: Date.now()
        })
    })
        .then(response => response.json())
        .then(data => {
            removeAITyping();
            if (data.result === "success") {
                addAIMessage(data.reply, "system");
            } else {
                addAIMessage("Hata: " + (data.message || "Bilinmeyen hata"), "system");
            }
        })
        .catch(error => {
            console.error('AI Error:', error);
            removeAITyping();
            addAIMessage("Üzgünüm, bağlantı hatası oluştu. Lütfen sayfayı yenileyip tekrar deneyin.", "system");
        });
}

function addAIMessage(text, sender) {
    const chatContainer = document.getElementById("ai-messages");
    if (!chatContainer) return;

    const msgDiv = document.createElement("div");
    msgDiv.className = sender === "user" ? "ai-msg-user" : "ai-msg-system";

    const safeText = escapeHtml(String(text || ''));
    let formattedText = safeText.replace(/\n/g, "<br>");
    formattedText = formattedText.replace(/(https?:\/\/[^\s&<>"]+)/g, '<a href="$1" target="_blank" rel="noreferrer" style="color:inherit; text-decoration:underline;">$1</a>');

    msgDiv.innerHTML = formattedText;
    chatContainer.appendChild(msgDiv);

    // Kopyalama butonu
    const copyBtn = document.createElement("button");
    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
    copyBtn.className = "ai-copy-btn";
    copyBtn.style.cssText = `background:none; border:none; cursor:pointer; color:rgba(255,255,255,0.3); font-size:11px; margin-bottom:12px; align-self:${sender === "user" ? "flex-end" : "flex-start"}; transition:0.2s; outline:none;`;
    
    copyBtn.onclick = () => {
        copyText(text);
        copyBtn.innerHTML = '<i class="fas fa-check" style="color:#4ade80"></i>';
        setTimeout(() => copyBtn.innerHTML = '<i class="fas fa-copy"></i>', 2000);
    };
    chatContainer.appendChild(copyBtn);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addAITyping() {
    const chatContainer = document.getElementById("ai-messages");
    // Varsa eskisini kaldır
    removeAITyping();

    const div = document.createElement("div");
    div.id = "ai-typing-indicator";
    div.innerHTML = "<i>Yazıyor...</i>";
    div.style.cssText = "background: transparent; padding: 5px 10px; font-size: 12px; align-self: flex-start; color: #666; font-style: italic;";
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function removeAITyping() {
    const el = document.getElementById("ai-typing-indicator");
    if (el) el.remove();
}


let lastShiftData = null;

async function editShiftWeekLabel(currentLabel) {
    const { value: newLabel } = await Swal.fire({
        title: 'Hafta Etiketini Düzenle',
        input: 'text',
        inputLabel: 'Örn: 8 - 14 Nisan Haftası',
        inputValue: currentLabel,
        showCancelButton: true,
        confirmButtonText: 'Kaydet',
        cancelButtonText: 'İptal',
        inputValidator: (value) => {
            if (!value) return 'Bir etiket girmelisiniz!';
        }
    });

    if (newLabel) {
        Swal.fire({ title: 'Kaydediliyor...', didOpen: () => Swal.showLoading() });
        try {
            const res = await apiCall("updateHomeBlock", {
                key: 'ShiftWeekLabel',
                title: 'Vardiya Haftalık Etiket',
                content: newLabel,
                visibleGroups: 'All'
            });
            if (res.result === "success") {
                Swal.fire('Başarılı', 'Hafta etiketi güncellendi.', 'success');
                loadShiftData(); // Tekrar yükle ve render et
            } else {
                throw new Error(res.message);
            }
        } catch (e) {
            Swal.fire('Hata', e.message || 'Kaydedilemedi.', 'error');
        }
    }
}

// --------------    VARDİYA FULLSCREEN ---------------------
async function openShiftArea(tab) {
    const wrap = document.getElementById('shift-fullscreen');
    if (!wrap) return;
    wrap.style.display = 'flex';
    document.body.classList.add('fs-open');
    document.body.style.overflow = 'hidden';

    const av = document.getElementById('shift-side-avatar');
    const nm = document.getElementById('shift-side-name');
    const rl = document.getElementById('shift-side-role');
    if (av) av.innerText = (currentUser || 'U').trim().slice(0, 1).toUpperCase();
    if (nm) nm.innerText = currentUser || 'Kullanıcı';
    if (rl) rl.innerText = (isAdminMode || isLocAdmin) ? 'Yönetici' : 'Temsilci';
    const adminFilters = document.getElementById('shift-admin-filters');
    const adminNav = document.getElementById('shift-admin-nav');

    if (isAdminMode || isLocAdmin) {
        if (adminNav) adminNav.style.display = 'flex';
        // Admin filtreleri (Vardiya Yükle vb)
        if (adminFilters) {
            adminFilters.style.display = isEditingActive ? 'flex' : 'none';
            if (isEditingActive && !document.getElementById('btn-shift-upload')) {
                const btn = document.createElement('button');
                btn.id = 'btn-shift-upload';
                btn.className = 'x-btn x-btn-admin';
                btn.style.marginLeft = '10px';
                btn.innerHTML = '<i class="fas fa-upload"></i> Vardiya Yükle';
                btn.onclick = () => openDataImporter('Vardiya');
                adminFilters.appendChild(btn);
            }
            if (isEditingActive && !document.getElementById('btn-shift-add')) {
                const btnAdd = document.createElement('button');
                btnAdd.id = 'btn-shift-add';
                btnAdd.className = 'x-btn x-btn-admin';
                btnAdd.style.marginLeft = '10px';
                btnAdd.style.background = '#2e7d32';
                btnAdd.innerHTML = '<i class="fas fa-plus"></i> Yeni Personel';
                btnAdd.onclick = () => addShiftPerson();
                adminFilters.appendChild(btnAdd);
            }
        }
    } else {
        if (adminFilters) adminFilters.style.display = 'none';
        if (adminNav) adminNav.style.display = 'none';
    }

    await loadShiftData();
    switchShiftTab(tab || 'plan');
}

function closeFullShift() {
    const wrap = document.getElementById('shift-fullscreen');
    if (wrap) wrap.style.display = 'none';
    document.body.classList.remove('fs-open');
    document.body.style.overflow = '';
}

function switchShiftTab(tab) {
    document.querySelectorAll('#shift-fullscreen .q-nav-item').forEach(i => i.classList.remove('active'));
    const nav = document.querySelector(`#shift-fullscreen .q-nav-item[data-shift-tab="${tab}"]`);
    if (nav) nav.classList.add('active');

    document.querySelectorAll('#shift-fullscreen .q-view-section').forEach(s => s.classList.remove('active'));
    const view = document.getElementById(`shift-view-${tab}`);
    if (view) view.classList.add('active');

    if (tab === 'request') {
        toggleShiftReqFields();
    }

    // Admin sekmesi tıklanınca admin verilerini yükle
    if (tab === 'admin') {
        loadShiftAdminData();
    }
}

function toggleShiftReqFields() {
    const type = document.getElementById('shift-req-type').value;
    const colleagueArea = document.getElementById('shift-req-colleague-area');
    const label = document.getElementById('shift-req-label');
    const shiftSelect = document.getElementById('shift-request-shift');
    
    if (type === 'Değişim') {
        colleagueArea.style.display = 'block';
        if (label) label.innerText = 'Kendi Vardiyam Yerine Geçecek Vardiya';
        if (shiftSelect) {
            shiftSelect.disabled = true;
            shiftSelect.style.background = '#f4f6f8';
            shiftSelect.style.cursor = 'not-allowed';
        }
    } else {
        colleagueArea.style.display = 'none';
        if (label) label.innerText = 'İstenen Vardiya / Durum';
        if (shiftSelect) {
            shiftSelect.disabled = false;
            shiftSelect.style.background = '#ffffff';
            shiftSelect.style.cursor = 'default';
        }
    }
}

async function addShiftPerson() {
    const dayHeaders = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
    const { value: formValues } = await Swal.fire({
        title: 'Yeni Personel Ekle',
        html: `
            <input id="swal-name" class="swal2-input" placeholder="Temsilci Adı">
            <div style="max-height:300px;overflow-y:auto;padding:0 10px;">
                ${dayHeaders.map(day => `
                    <div style="margin-top:10px;text-align:left;font-size:0.8rem;color:#666;">${day}</div>
                    <input id="swal-${day}" class="swal2-input" style="margin-top:2px;margin-bottom:5px;width:90%;" placeholder="örn: 09:00 - 18:30">
                `).join('')}
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Ekle',
        preConfirm: () => {
            const name = document.getElementById('swal-name').value.trim();
            if (!name) { Swal.showValidationMessage('Lütfen isim giriniz'); return false; }
            const obj = { Temsilci: name, 'İd': Date.now() };
            dayHeaders.forEach(day => { obj[day] = document.getElementById(`swal-${day}`).value.trim(); });
            return obj;
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Ekleniyor...', didOpen: () => Swal.showLoading() });
        const { error } = await sb.from('Vardiya').insert([formValues]);
        if (error) Swal.fire('Hata', error.message, 'error');
        else {
            Swal.fire('Başarılı', 'Personel eklendi.', 'success');
            loadShiftData();
        }
    }
}

async function editShiftPerson(id) {
    const { data: person, error: fErr } = await sb.from('Vardiya').select('*').eq('İd', id).single();
    if (fErr || !person) return;

    const dayHeaders = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
    const { value: formValues } = await Swal.fire({
        title: 'Vardiya Düzenle',
        html: `
            <input id="swal-name" class="swal2-input" value="${escapeHtml(person.Temsilci || '')}" placeholder="Temsilci Adı">
            <div style="max-height:300px;overflow-y:auto;padding:0 10px;">
                ${dayHeaders.map(day => `
                    <div style="margin-top:10px;text-align:left;font-size:0.8rem;color:#666;">${day}</div>
                    <input id="swal-${day}" class="swal2-input" style="margin-top:2px;margin-bottom:5px;width:90%;" value="${escapeHtml(person[day] || '')}" placeholder="Vardiya">
                `).join('')}
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Güncelle',
        preConfirm: () => {
            const name = document.getElementById('swal-name').value.trim();
            if (!name) { Swal.showValidationMessage('Lütfen isim giriniz'); return false; }
            const obj = { Temsilci: name };
            dayHeaders.forEach(day => { obj[day] = document.getElementById(`swal-${day}`).value.trim(); });
            return obj;
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Güncelleniyor...', didOpen: () => Swal.showLoading() });
        const { error } = await sb.from('Vardiya').update(formValues).eq('İd', id);
        if (error) Swal.fire('Hata', error.message, 'error');
        else {
            Swal.fire('Başarılı', 'Vardiya güncellendi.', 'success');
            loadShiftData();
        }
    }
}

async function deleteShiftPerson(id, name) {
    const confirm = await Swal.fire({
        title: 'Emin misiniz?',
        text: `${name} isimli personelin vardiya kaydı silinecek.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Evet, Sil',
        cancelButtonText: 'Vazgeç',
        confirmButtonColor: '#cf0a2c'
    });

    if (confirm.isConfirmed) {
        const { error } = await sb.from('Vardiya').delete().eq('İd', id);
        if (error) Swal.fire('Hata', error.message, 'error');
        else {
            Swal.fire('Başarılı', 'Kayıt silindi.', 'success');
            loadShiftData();
        }
    }
}

function getShiftClass(v) {
  if (!v) return 'shift-v-cell shift-v-other';
  const val = v.toUpperCase().trim();
  if (val === 'OFF') return 'shift-v-cell shift-v-off';
  if (val.includes('İZİN')) return 'shift-v-cell shift-v-leave';
  
  const hour = parseInt(val.split(':')[0]);
  if (!isNaN(hour)) {
    if (hour >= 0 && hour <= 7) return 'shift-v-cell shift-v-night';
    if (hour >= 8 && hour <= 11) return 'shift-v-cell shift-v-morning';
    if (hour >= 12 && hour <= 14) return 'shift-v-cell shift-v-afternoon';
    if (hour >= 15 && hour <= 18) return 'shift-v-cell shift-v-evening';
    if (hour >= 19) return 'shift-v-cell shift-v-night';
  }
  return 'shift-v-cell shift-v-other';
}

async function loadShiftData() {
    try {
        const data = await apiCall("getShiftData");
        lastShiftData = data.shifts || {};
        renderShiftData(lastShiftData);
        
        // Temsilci listesini doldur (Değişim için)
        const opponentSelect = document.getElementById('shift-request-opponent');
        if (opponentSelect && data.shifts && data.shifts.rows) {
            //currentUser karşılaştırmasını normalize edelim
            const curLower = String(currentUser || '').trim().toLowerCase();
            const others = data.shifts.rows.filter(r => String(r.name).trim().toLowerCase() !== curLower);
            
            opponentSelect.innerHTML = '<option value="">Seçiniz...</option>' + 
                others.map(r => `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`).join('');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Hata', e.message || 'Vardiya verileri alınırken bir hata oluştu.', 'error');
    }
}

function renderShiftData(shifts) {
    const weekLabelEl = document.getElementById('shift-week-label');
    if (weekLabelEl) {
        const rawLabel = shifts.weekLabel || 'Haftalık Vardiya Planı';
        weekLabelEl.innerText = formatWeekLabel(rawLabel);
        
        // Düzenleme modu aktifse kalem ikonu ekle
        if (typeof isEditingActive !== 'undefined' && isEditingActive && (isAdminMode || isLocAdmin)) {
            const editBtn = document.createElement('button');
            editBtn.className = 'x-btn x-btn-admin';
            editBtn.style.marginLeft = '10px';
            editBtn.style.padding = '4px 8px';
            editBtn.style.fontSize = '0.8rem';
            editBtn.innerHTML = '<i class="fas fa-pen"></i>';
            editBtn.onclick = () => editShiftWeekLabel(rawLabel);
            weekLabelEl.appendChild(editBtn);
        }
    }

    const myPlanEl = document.getElementById('shift-plan-my');
    if (myPlanEl) {
        const myRow = shifts.myRow;
        const headers = shifts.headers || [];
        if (myRow && headers.length) {
            const cellsHtml = headers.map((h, idx) => {
                const v = (myRow.cells || [])[idx] || '';
                return `<div class="shift-day"><div class="shift-day-date">${formatShiftDate(h)}</div><div class="shift-day-slot"><span class="${getShiftClass(v)}">${escapeHtml(v)}</span></div></div>`;
            }).join('');
            myPlanEl.innerHTML = `
                <div class="shift-card-header">Benim Vardiyam</div>
                <div class="shift-card-body">${cellsHtml}</div>
            `;
        } else {
            myPlanEl.innerHTML = '<p style="color:#666;">Vardiya tablosunda adınız bulunamadı.</p>';
        }
    }

    const tableWrap = document.getElementById('shift-plan-table');
    if (tableWrap) {
        const headers = shifts.headers || [];
        const rows = shifts.rows || [];
        if (!headers.length || !rows.length) {
            tableWrap.innerHTML = '<p style="color:#666;">Vardiya tablosu henüz hazırlanmadı.</p>';
        } else {
            let html = '<table class="shift-table"><thead><tr><th>Temsilci</th>';
            headers.forEach(h => { html += `<th>${formatShiftDate(h)}</th>`; });
            if (isAdminMode && isEditingActive) html += '<th>İşlem</th>';
            html += '</tr></thead><tbody>';
            rows.forEach(r => {
                html += '<tr>';
                html += `<td style="font-weight:600;">${escapeHtml(r.name)}</td>`;
                headers.forEach((h, idx) => {
                    const v = (r.cells || [])[idx] || '';
                    html += `<td><span class="${getShiftClass(v)}">${escapeHtml(v)}</span></td>`;
                });
                if (isAdminMode && isEditingActive) {
                    html += `<td>
                        <div style="display:flex;gap:5px;">
                            <button class="x-btn x-btn-admin" style="padding:2px 8px; font-size:0.7rem;" onclick="editShiftPerson('${r.id}')"><i class="fas fa-edit"></i></button>
                            <button class="x-btn x-btn-admin" style="padding:2px 8px; font-size:0.7rem; background:#cf0a2c;" onclick="deleteShiftPerson('${r.id}', '${escapeHtml(r.name)}')"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>`;
                }
                html += '</tr>';
            });
            html += '</tbody></table>';
            tableWrap.innerHTML = html;
        }
    }

    // Onay bekleyen değişimler (Opponent alanı ben olanlar ve durumu 'Rakip_Onayı_Bekleniyor' olanlar)
    const opponentConfirmArea = document.getElementById('shift-opponent-confirm-area');
    const opponentListEl = document.getElementById('shift-opponent-list');
    if (opponentConfirmArea && opponentListEl) {
        const pendingForMe = (shifts.allRequests || []).filter(r => 
            r.opponent === currentUser && r.status === 'Rakip_Onayı_Bekleniyor'
        );
        
        if (pendingForMe.length > 0) {
            opponentConfirmArea.style.display = 'block';
            opponentListEl.innerHTML = pendingForMe.map(r => `
                <div class="shift-request-item pending-border">
                    <div class="shift-request-top">
                        <span class="shift-request-date"><b>${escapeHtml(r.username)}</b> sizden değişim istiyor</span>
                        <span class="shift-request-status" style="background:#fef3c7; color:#92400e">Onay Bekliyor</span>
                    </div>
                    <div class="shift-request-body">
                        <div><strong>Tarih:</strong> ${escapeHtml(r.date)}</div>
                        <div><strong>Vardiya:</strong> ${escapeHtml(r.shift)}</div>
                        ${r.note ? `<div><strong>Not:</strong> ${escapeHtml(r.note)}</div>` : ''}
                    </div>
                    <div style="margin-top:10px; display:flex; gap:10px;">
                        <button class="x-btn x-btn-primary" style="flex:1" onclick="respondToShiftSwap('${r.id}', 'confirmed')">Onayla</button>
                        <button class="x-btn" style="flex:1; background:#ef4444; color:white" onclick="respondToShiftSwap('${r.id}', 'rejected')">Reddet</button>
                    </div>
                </div>
            `).join('');
        } else {
            opponentConfirmArea.style.display = 'none';
        }
    }

    const listEl = document.getElementById('shift-requests-list');
    if (listEl) {
        const reqs = (shifts.allRequests || []).filter(r => r.username === currentUser);
        if (!reqs.length) {
            listEl.innerHTML = '<p style="color:#666;">Henüz oluşturulmuş vardiya talebin yok.</p>';
        } else {
            listEl.innerHTML = reqs.map(r => {
                let statusColor = '#64748b';
                let statusText = r.status || 'Beklemede';
                if (statusText === 'Onaylandı') statusColor = '#10b981';
                if (statusText === 'Reddedildi') statusColor = '#ef4444';
                if (statusText === 'Rakip_Onayı_Bekleniyor') {
                    statusText = 'Arkadaş Onayı Bekleniyor';
                    statusColor = '#f59e0b';
                }

                return `
                    <div class="shift-request-item">
                        <div class="shift-request-top">
                            <span class="shift-request-date">${escapeHtml(r.date || '')}</span>
                            <span class="shift-request-status" style="background:${statusColor}22; color:${statusColor}">${escapeHtml(statusText)}</span>
                        </div>
                        <div class="shift-request-body">
                            <div><strong>Tür:</strong> ${escapeHtml(r.type || 'Talep')}</div>
                            <div><strong>Talep:</strong> ${escapeHtml(r.shift || '')}</div>
                            ${r.opponent ? `<div><strong>Arkadaş:</strong> ${escapeHtml(r.opponent || '')}</div>` : ''}
                            ${r.note ? `<div><strong>Not:</strong> ${escapeHtml(r.note || '')}</div>` : ''}
                            ${r.admin_note ? `<div style="color:#b91c1c"><strong>Admin Notu:</strong> ${escapeHtml(r.admin_note)}</div>` : ''}
                        </div>
                        <div class="shift-request-footer">${new Date(r.timestamp).toLocaleString('tr-TR')}</div>
                    </div>
                `;
            }).join('');
        }
    }
}

async function submitShiftRequest() {
    const type = document.getElementById('shift-req-type').value;
    const date = document.getElementById('shift-request-date').value;
    const shift = document.getElementById('shift-request-shift').value;
    const opponent = document.getElementById('shift-request-opponent').value;
    const note = document.getElementById('shift-request-note').value;

    if (!date || !shift) {
        Swal.fire('Uyarı', 'Tarih ve vardiya alanları zorunludur.', 'warning');
        return;
    }
    
    if (type === 'Değişim' && !opponent) {
        Swal.fire('Uyarı', 'Lütfen değişim yapacağınız kişiyi seçiniz.', 'warning');
        return;
    }

    Swal.fire({ title: 'Gönderiliyor...', didOpen: () => Swal.showLoading() });

    try {
        const res = await apiCall("submitShiftRequestExtended", {
            type: type,
            date: date,
            shift: shift,
            opponent: opponent,
            note: note,
            status: type === 'Değişim' ? 'Rakip_Onayı_Bekleniyor' : 'Beklemede'
        });
        
        if (res.result === 'success') {
            Swal.fire({ icon: 'success', title: 'Başarılı', text: 'Talebiniz iletildi.', timer: 1500, showConfirmButton: false });
            // Formu temizle
            document.getElementById('shift-request-date').value = '';
            document.getElementById('shift-request-note').value = '';
            await loadShiftData();
        } else {
            Swal.fire('Hata', res.message || 'Bir hata oluştu.', 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Hata', 'İşlem başarısız.', 'error');
    }
}

function handleShiftAutoFill() {
    const type = document.getElementById('shift-req-type').value;
    if (type !== 'Değişim') return;

    const dayNameSelected = document.getElementById('shift-request-date').value; // Artık gün seçiliyor (örn: Pazartesi)
    const opponentName = document.getElementById('shift-request-opponent').value;

    if (!dayNameSelected || !opponentName || !lastShiftData || !lastShiftData.rows) return;

    // Gün başlıklarındaki index'i bulalım
    const dayHeaders = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
    const trDayIndex = dayHeaders.indexOf(dayNameSelected);

    if (trDayIndex === -1) return;

    // Seçilen kişiyi bul
    const person = lastShiftData.rows.find(r => r.name === opponentName);
    if (person && person.cells) {
        const foundShift = person.cells[trDayIndex];
        if (foundShift) {
            const shiftSelect = document.getElementById('shift-request-shift');
            
            // Eğer vardiye listede yoksa ekle (Diğer vardiyalar için)
            let exists = false;
            for(let i=0; i<shiftSelect.options.length; i++) {
                if(shiftSelect.options[i].value === foundShift) {
                    exists = true;
                    break;
                }
            }

            if (!exists) {
                const newOpt = document.createElement('option');
                newOpt.value = foundShift;
                newOpt.text = foundShift;
                shiftSelect.add(newOpt);
            }

            shiftSelect.value = foundShift;
        }
    }
}

async function respondToShiftSwap(id, status) {
    const actionText = status === 'confirmed' ? 'onaylıyor' : 'reddediyor';
    const confirm = await Swal.fire({
        title: 'Emin misiniz?',
        text: `Bu değişim talebini ${actionText} musunuz?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Evet',
        cancelButtonText: 'İptal'
    });

    if (!confirm.isConfirmed) return;

    Swal.fire({ title: 'İşleniyor...', didOpen: () => Swal.showLoading() });
    try {
        const nextStatus = status === 'confirmed' ? 'Beklemede' : 'Reddedildi';
        const res = await apiCall("updateShiftRequestStatus", { 
            id: id, 
            status: nextStatus,
            responder: currentUser 
        });
        
        if (res.result === 'success') {
            Swal.fire({ icon: 'success', title: 'Başarılı', timer: 1200, showConfirmButton: false });
            await loadShiftData();
        } else {
            Swal.fire('Hata', res.message, 'error');
        }
    } catch (e) {
        Swal.fire('Hata', 'İşlem başarısız.', 'error');
    }
}

async function loadShiftAdminData() {
    const listEl = document.getElementById('shift-admin-approval-list');
    const historyEl = document.getElementById('shift-admin-history-list');
    if (!listEl || !historyEl) return;

    try {
        const res = await apiCall("getAllShiftRequests");
        const allData = res.data || [];
        
        // 1. BEKLEYEN TALEPLER (Kartlar)
        const pending = allData.filter(r => r.status === 'Beklemede' || r.status === 'Rakip_Onayı_Bekleniyor');
        if (!pending.length) {
            listEl.innerHTML = '<p style="color:#666; padding:20px;">Onay bekleyen yeni talep bulunmuyor.</p>';
        } else {
            listEl.innerHTML = pending.map(r => {
                const isWaitingOpponent = r.status === 'Rakip_Onayı_Bekleniyor';
                return `
                    <div class="shift-admin-card ${isWaitingOpponent ? 'waiting-opponent-border' : ''}">
                        <div class="sac-head">
                            <span class="sac-user">${escapeHtml(r.username)}</span>
                            <div style="display:flex; gap:5px; align-items:center;">
                                ${isWaitingOpponent ? '<span style="font-size:0.65rem; color:#f59e0b; font-weight:700;"><i class="fas fa-clock"></i> Arkadaş Onayı Bekliyor</span>' : ''}
                                <span class="sac-type ${r.type === 'Değişim' ? 'type-swap' : 'type-req'}">${escapeHtml(r.type)}</span>
                            </div>
                        </div>
                        <div class="sac-body">
                            <div><b>Tarih:</b> ${escapeHtml(r.date)}</div>
                            <div><b>Talep:</b> ${escapeHtml(r.shift)}</div>
                            ${r.opponent ? `<div><b>Rakip:</b> ${escapeHtml(r.opponent)}</div>` : ''}
                            ${r.note ? `<div><b>Not:</b> <span style="font-style:italic">"${escapeHtml(r.note)}"</span></div>` : ''}
                        </div>
                        <div class="sac-actions">
                            <button class="x-btn x-btn-primary" onclick="adminProcessShift('${r.id}', 'Onaylandı')">Onayla</button>
                            <button class="x-btn" style="background:#ef4444; color:white" onclick="adminProcessShift('${r.id}', 'Reddedildi')">Reddet</button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 2. GEÇMİŞ İŞLEMLER (Tablo - Son 50)
        const history = allData.filter(r => r.status === 'Onaylandı' || r.status === 'Reddedildi').slice(0, 50);
        if (!history.length) {
            historyEl.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#999; padding:20px;">Henüz işlem geçmişi bulunmuyor.</td></tr>';
        } else {
            historyEl.innerHTML = history.map(r => {
                const statusColor = r.status === 'Onaylandı' ? '#22c55e' : '#ef4444';
                return `
                    <tr>
                        <td style="font-weight:600">${escapeHtml(r.username)}</td>
                        <td><span class="sac-type ${r.type === 'Değişim' ? 'type-swap' : 'type-req'}" style="font-size:0.6rem;">${escapeHtml(r.type)}</span></td>
                        <td>${formatShiftDate(r.date)}</td>
                        <td>${escapeHtml(r.shift)}</td>
                        <td>${r.opponent ? escapeHtml(r.opponent) : '-'}</td>
                        <td style="color:${statusColor}; font-weight:700;">${escapeHtml(r.status)}</td>
                        <td style="font-size:0.8rem; color:#666">${escapeHtml(r.approved_by || '-')}</td>
                        <td style="font-size:0.8rem; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(r.admin_note || '')}">
                            ${r.admin_note ? `<span style="color:#0e1b42">[A]: ${escapeHtml(r.admin_note)}</span>` : ''}
                            ${r.note ? `<br/><span style="color:#666; font-style:italic">[T]: ${escapeHtml(r.note)}</span>` : ''}
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<p style="color:#ef4444">Veriler çekilemedi.</p>';
    }
}

async function adminProcessShift(id, status) {
    const { value: note } = await Swal.fire({
        title: 'Admin Notu (Opsiyonel)',
        input: 'text',
        placeholder: 'Red gerekçesi veya onay notu...',
        showCancelButton: true,
        confirmButtonText: 'Kaydet'
    });

    if (note === undefined) return; // İptal

    Swal.fire({ title: 'İşleniyor...', didOpen: () => Swal.showLoading() });
    try {
        const res = await apiCall("adminFinalizeShift", { id, status, adminNote: note });
        if (res.result === 'success') {
            Swal.fire({ icon: 'success', title: 'İşlem Başarılı', timer: 1200, showConfirmButton: false });
            loadShiftAdminData();
        } else {
            Swal.fire('Hata', res.message, 'error');
        }
    } catch (e) {
        Swal.fire('Hata', 'Sistem hatası.', 'error');
    }
}

const TECH_DOC_CONTENT = { "broadcast": [{ "title": "Smart TV – Canlı Yayında Donma Problemi Yaşıyorum", "body": "Müşterinin sorun yaşadığı yayın ya da yayınlarda genel bir sorun var mı kontrol edilir? Genel bir sorun var ise teknik ekibin incelediği yönünde bilgi verilir.\nMüşterinin kullandığı cihaz TVmanager ‘da loglardan kontrol edilir. Arçelik/Beko/Grundig/Altus marka Android TV olmayan Smart TV’lerden ise genel sorun hakkında bilgi verilir.\nYukarıdaki durumlar dışında yaşanan bir sorun ise TV ve modemin elektrik bağlantısını kesilip tekrar verilmesi istenir. « Yaşadığınız sorunu kontrol ederken TV ve modeminizin elektrik bağlantısını kesip 10 sn sonra yeniden açabilir misiniz? Ardından yeniden yayını açıp kontrol edebilir misiniz? (Ayrıca öneri olarak modemi kapatıp tekrar açtıktan sonra, sadece izleme yaptığı cihaz modeme bağlı olursa daha iyi bir bağlantı olacağı bilgisi verilebilir)\nSorun devam eder ise Smart TV tarayıcısından https://www.hiztesti.com.tr/ bir hız testi yapması sonucu bizimle paylaşması istenir.\nHız testi sonucu 8 Mbps altında ise internet bağlantı hızının düşük olduğunu internet servis sağlayıcısı iletişime geçmesi istenir.\n8 Mbps üzerinde ise müşteriden sorunu gösteren kısa bir video talep edilir.\nVideo kaydı ve hız testinin sonuçları gösteren bilgiler alındıktan sonra müşteriye incelenmesi için teknik ekibimize iletildiği inceleme tamamlandığında eposta ile bilgi verileceği yönünde bilgi verilir.\nSorun aynı gün içinde benzer cihazlarda farklı müşterilerde yaşıyor ise tüm bilgilerle Erlab’a arıza kaydı açılır. Sorun birkaç müşteri ile sınırlı ise 17:00 – 01:00 vardiyasındaki ekip arkadaşında sistemsel bir sorun olmadığına dair eposta gönderilmesi için bilgileri paylaşılır." }, { "title": "Mobil Uygulama – Canlı Yayında Donma Sorunu Yaşıyorum", "body": "Müşterinin sorun yaşadığı yayın ya da yayınlarda genel bir sorun var mı kontrol edilir? Genel bir sorun var ise teknik ekibin incelediği yönünde bilgi verilir.(Müşteri İOS veya Android işletim sistemli hangi cihazdan izliyorsa, mümkünse aynı işletim sistemli mobil cihazdan kontrol edilebilir, gerekirse ekip arkadaşlarından kontrol etmeleri istenebilir)\nGenel bir sorun yok ise, www.hiztesti.com.tr link üzerinden hız testi yapması sonucu bizimle paylaşması istenir.\nHız testi sonucu 8 mbps altında ise internet bağlantı hızının düşük olduğu internet servisi sağlayıcısı ile iletişime geçmesi istenir. (Öneri olarak modemi kapatıp tekrar açtıktan sonra sadece izleme yaptığı cihaz modeme bağlı olursa daha iyi bir bağlantı olacağı bilgisi verilebilir)\n8 mbps üzerinde ise, uygulama verilerin temizlenmesi veya uygulamanın silip tekrar yüklenmesi istenilir, sorun devam etmesi durumunda sorunu gösteren video kaydı istenir.\n 4. Hız testi, cihaz marka model ve sürüm bilgileri alındıktan sonra, incelenmesi için teknik ekibe iletildiği, inceleme tamamlandığında e-posta  ile bilgi verileceği yönünde bilgi verilir.\n 5. Sorun aynı gün içerinde benzer cihazlarda farklı müşterilerde yaşıyor ise tüm bilgilerle Erlab’a arıza kaydı açılır. Sorun birkaç müşteri ile sınırlı  ise 17:00 – 01:00 vardiyasındaki ekip arkadaşında sistemsel bir sorun olmadığına dair eposta gönderilmesi için bilgileri paylaşılır." }, { "title": "Bilgisayar – Canlı Yayında Donma Sorunu Yaşıyorum", "body": "Müşterinin sorun yaşadığı yayın ya da yayınlarda genel bir sorun var mı kontrol edilir? Genel bir sorun var ise teknik ekibin incelediği yönünde bilgi verilir.\nGenel bir sorun değilse, öncelikle https://www.hiztesti.com.tr/ bir hız testi yapması sonucu bizimle paylaşması istenir.\nHız testi sonucu 8 mbps altında ise internet bağlantı hızının düşük olduğunu internet servis sağlayıcısı iletişime geçmesi istenir.\n8 mbps üzerinde ise müşteriden aşağıdaki adımları uygulaması istenir.\n3. Bilgisayarın işletim sitemi öğrenilip, görüşme üzerinden ‘’pingWindows7’’ veya ‘’pingwindows10’’ kısayollarından müşteri sunucuları kontrol edilir.\n(Windows 10 üzeri işletim sistemi cihazlara pingwindows10 kısayolu gönderilebilir.)\n4. Sunucu kontrol ekranında kontrol edilmesi gereken, ok ile gösterilen yerden, sunucu ile kayıp olup olmadığı ve kırmızı alan içerisinde sunucu ile web sitemize kaç saniyede işlem sağladığı kontrol edilir.\n5. 1 – 35 arası normal sayılabilir, bu saniye aralığında sorun yaşanıyorsa, web sitemize daha hızlı tepsi süresi veren ve genellikle sorunsuz bir şekilde izleme sağlanabilen 193.192.103.249, 185.11.14.27 veya 195.175.178.8 sunucuları kontrol edilmelidir.\n6. Uygun sunucuyu tespit ettikten sonra canlı destek ekranında ‘’Host’’ ‘’host2’’ kısa yolları kullanarak, kısa yoldaki adımlar ile müşterinin sadece bizim sitemize bağlandığı sunucusunu, en uygun sunucu ile değiştirip tarayıcı açıp kapattırdıktan sonra tekrar yayını kontrol etmesini iletebiliriz. (Ayrıca müşteri yayınları auto değil, manuel olarak 720 veya 1080p seçip kontrol edilmesi önerilir)\n7. Sorun aynı gün içerinde benzer işletim sistemi veya sunucuda farklı müşterilerde yaşıyor ise tüm bilgilerle Erlab’a arıza kaydı açılır. Sorun birkaç müşteri ile sınırlı ise 17:00 – 01:00 vardiyasındaki ekip arkadaşında sistemsel bir sorun olmadığına dair eposta gönderilmesi için bilgileri paylaşılır" }, { "title": "YAYIN SORUNLARI", "body": "35 sn arası normal sayılabilir, bu saniye aralığında sorun yaşanıyorsa, web sitemize daha hızlı tepsi süresi veren ve genellikle sorunsuz bir şekilde izleme sağlanabilen 193.192.103.249, 185.11.14.27 veya 195.175.178.8 sunucuları kontrol edilmelidir." }, { "title": "MacOS – Canlı Yayında Donma Sorunu Yaşıyorum", "body": "Müşterinin sorun yaşadığı yayın ya da yayınlarda genel bir sorun var mı kontrol edilir? Genel bir sorun var ise teknik ekibin incelediği yönünde bilgi verilir.\nGenel bir sorun değilse, öncelikle https://www.hiztesti.com.tr/ bir hız testi yapması sonucu bizimle paylaşması istenir.\nHız testi sonucu 8 mbps altında ise internet bağlantı hızının düşük olduğunu internet servis sağlayıcısı iletişime geçmesi istenir.\n8 mbps üzerinde ise müşteriden aşağıdaki adımları uygulaması istenir.\nMindbehind üzerinden ‘’pingmacOS’’ kısayolundan müşteri sunucuları kontrol edilir.\nSunucu kontrol ekranında kontrol edilmesi gereken, ‘’packet loss’’ kısmında kayıp olup olmadığı,  alan içerisinde sunucu ile web sitemize kaç saniyede işlem sağladığı kontrol edilir.\n1 – 35 arası normal sayılabilir, bu saniye aralığında sorun yaşanıyorsa, web sitemize daha hızlı tepsi süresi veren ve genellikle sorunsuz bir şekilde izleme sağlanabilen 193.192.103.249, 185.11.14.27 veya 195.175.178.8 sunucuları kontrol edilmelidir.\nUygun sunucuyu tespit ettikten sonra canlı destek ekranında ‘’macOShost’’ kısa yolunu kullanarak, kısa yoldaki adımlar ile müşterinin sadece bizim sitemize bağlandığı sunucuyu, en uygun sunucu ile değiştirip tarayıcı açıp kapattırdıktan sonra tekrar yayını kontrol etmesini iletebiliriz. (Ayrıca müşteri yayınları auto değil, manuel olarak 720 veya 1080p seçip kontrol edilmesi önerilir)\nSorun aynı gün içerinde benzer işletim sistemi veya sunucuda farklı müşterilerde yaşıyor ise tüm bilgilerle Erlab’a arıza kaydı açılır. Sorun birkaç müşteri ile sınırlı ise 17:00 – 01:00 vardiyasındaki ekip arkadaşında sistemsel bir sorun olmadığına dair eposta gönderilmesi için bilgileri paylaşılır." }, { "title": "‘’Yayında beklenmedik bir kesinti oluştu’’ Uyarısı", "body": "Bu uyarı genel bir yayın sorunu olduğunda ya da kullanıcı Türkiye sınırları dışında bir yerden erişim sağladığında karşımıza çıkmaktadır.\nKullanıcının sorun yaşadığı yayın kontrol edilir ve genel bir yayın sorunu olup olmadığı teyit edilir.\nTvmanager’da SubscriberLog ekranından ip adresi alınır ve yurtdışı bir konum olup olmadığı teyit edilir.\nKullanıcı yurtdışında ise erişim sağlayamayacağı bilgisi verilir, VPN kullanıyor ise kapatması istenir.\nTVmanager Devices kısmında oturumlar sonlandırılır ve kullanıcıdan tekrar giriş yaparak kontrol etmesi rica edilir.\nMobil veri veya farklı bir ağda bu hata mesajının alınıp alınmadığı teyit edilir.\nCihaz ve modem kapama ve açma işlemi uygulanır.\nSorun devam eder ise inceleme için cihaz ve diğer bilgilerle teknik ekibimize bilgi verileceği iletilir. Excel de kullanıcıdan alınan bilgiler not edilir." }], "access": [{ "title": "ERİŞİM SORUNLARI", "body": "‘’Lisans hakları sebebiyle Türkiye sınırları dışında hizmet verilememektedir.’’ Uyarısı\nAlınan hata müşterinin yurt dışında olması ve yurt içinde ise VPN ya da benzeri bir uygulamanın cihazında aktif olmasından kaynaklanmaktadır.\n\nMüşteriye yurt dışında olup olmadığı sorulur, yurt dışında ise ‘’lisans hakları sebebiyle yayınların yurt dışından izlenemediği’’ yönünde bilgi verilir.\nYurt içinde ise VPN ya da benzeri bir uygulamanın cihazında aktif olup ya da olmadığı sorulur. Aktif ise devre dışı bırakılıp tekrar denemesi önerilir.\nVPN ya da benzeri bir uygulama kullanmıyor ise müşterinin ip adresi öğrenilir ve https://tr.wizcase.com/tools/whats-my-ip/ ip adresi kontrol edilir.  Aynı zamanda adresin vpn üzerinden alınıp alınmadığının kontrolü için https://vpnapi.io adresine girilip kontrol edilir.\nIp adresi yurt dışı ya da ISP bilgisi bilinen bir servis sağlayıcısı değilse müşteriye bulunduğu lokasyonun otel, yurt vb. bir yer olup olmadığı ya da cihazının şirket cihazı olup olmadığı sorulur." }, { "title": "‘’IP Karantina’’ Uyarısı", "body": "İp Karantina sorunu genel bir sorun yok ise, eposta veya şifre bir çok defa hatalı girilmesinden dolayı alınır.\nKullanıcının ip adresi karantina da olup ya da olmadığı, TVmanager – CMS – Admission Gate menüsü üzerinden kontrol edilerek çıkarılabilir. İkinci bir seçenek olarak modem kapama ve açma işlemi yaptırılabilir." }], "app": [{ "title": "Teknik Sorun Analizi Nasıl Yapılır?", "body": "App Kaynaklı Nedenler\nCihaz Kaynaklı Nedenler\nApp hataları başlığında uygulamanın açılmaması ya da kendi kendine kapanması şeklinde teknik sorunlar ile karşılaşabiliriz. Bu tip sorunlar, kullanıcı deneyimini doğrudan etkileyerek uygulamaya erişilememesine neden olur.\nUygulamanın eski sürümü\nÖnbellek sorunları\nUyumsuz cihazlar\nDolu RAM/Arka planda çalışan fazla uygulama\nCihazın güncel olmaması (Eski sistemi sürümleri)\nKullanıcıya Sorulabilecek Sorular:\nUygulama açılıyor mu, yoksa açılmadan kapanıyor mu?\nUygulama sürümü, cihaz işletim sistemi sürümü nedir? (TVmanager kontrolü)\nCihazda yeterli depolama alanı var mı?" }], "activation": [{ "title": "‘’Promosyon Kodu Bulunamadı’’ Uyarısı", "body": "Görselde ki örnekte doğrusu ‘’YILLIKLOCA’’ olan kampanya kodu, küçük harf ile yazıldığında ‘’Promosyon Kodu Bulunamadı’’ hatası alınmıştır. Bu hata ile karşılaşıldığında kampanya kodunun yanlış, eksik, küçük harf ya da boşluk bırakılarak yazıldığını tespitle, kullanıcıyı bu doğrultuda doğru yazım için yönlendirmemiz gerekir." }, { "title": "‘’Kampanya Kodu Aktif Edilemedi’’ Uyarısı", "body": "Görseldeki örnekteki gibi eski bir promosyon kodu yazıldığında ‘’Kampanya Kodu Aktif Edilemedi’’ uyarısı alınır." }, { "title": "‘’Geçersiz Kampanya Kodu’’ Uyarısı", "body": "Görseldeki örnekteki gibi daha önce kullanılmış bir promosyon kodu yazıldığında ‘’Geçersiz Kampanya Kodu’’ hatası alınır.\nPromosyon kodunun hangi hesapta kullanıldığını aşağıdaki görseldeki gibi Campaign alanında arama yaparak görüntüleyebiliriz." }, { "title": "Playstore Uygulama Aktivasyon Sorunu", "body": "Bazı durumlarda, kullanıcılar Google Play Store üzerinden S Sport Plus uygulamasında abonelik satın aldıklarında veya yenileme gerçekleştiğinde, üyelikleri otomatik olarak aktifleşmeyebiliyor.  Bu durumda, kullanıcının uygulama üzerinden manuel olarak paket aktivasyonu yapması gerekmektedir.\n\nAktivasyon işleminin başarılı olabilmesi için:\n Google Play Store üzerinden satın alma işlemi yapılırken kullanılan Gmail hesabı, aktivasyon anında cihazda açık olmalıdır.\n Aktivasyon işlemi uygulama içerisinden yapılmalıdır.\nDestek ekibi tarafından Mindbehind üzerinden “paketgoogle” kısayolu kullanılarak yönlendirme sağlanabilir.  Kullanıcı başarılı bir şekilde paket aktivasyonu yaptıktan sonra, paket ataması sistemde gerçekleşir ve log kayıtlarında ilgili işlem aşağıdaki gibi görünür (ekli görsellerdeki gibi).  Bu işlem, paketin doğru şekilde tanımlanması için önemlidir." }, { "title": "App Store Uygulama Aktivasyon Sorunu", "body": "Müşteriler App Store üzerinden uygulamamızdan abonelik satın aldığı veya yenileme olduğu zaman bazen üyelik aktif olmuyor.\nÜyelikleri aktif olabilmeleri için, uygulama üzerinden paket aktivasyon yapmaları gerekiyor. Paket aktivasyon yaparken, satın alma yaparken hangi Apple kimliği hesabı açık ise, o hesap açıkken aktivasyon denemesi gerekiyor.\nMindbehind üzerinden ‘’paketapple’’ kısayolu kullanılır.\nMüşteri paket aktivasyonu yaptıktan sonra üyelik ataması ve loglarda nasıl gözüktüğü görsellerdeki gibidir.\nPaket aktivasyon butonu örnek görüntüsü yandaki gibidir." }, { "title": "AKTİVASYON SORUNLARI", "body": "İOS Uygulama Paket Aktivasyon ‘’Abonelik Başkasına Aittir’’ Sorunu\n\nİos uygulamamızda müşteri paket aktivasyon işlemi yaptığında ‘’Abonelik Başkasına Aittir’’ hatası geliyor ise, cihazda açık olan Apple kimliği ile satın alınmış, ancak aktivasyon yaptığı eposta adresi farklı bir eposta adresidir.\n\nFarklı eposta adresi ile paket aktivasyon yaptığında ‘’Subscriberlog’’ kısmında örnek ekran görüntüsünde kırmızı alana alınan ‘’packageValidation’’  kısmı çıkar, ok ile gösterilen ID kısmından doğru üyeliği ID araması ile bulabiliriz." }, { "title": "AKTİVASYON SORUNLARI", "body": "Android ‘’Paket Başka Bir Kullanıcıya Ait Olduğu İçin Paket Atama İşlemi Başarısız Oldu’’ Sorunu\n\nAndroid uygulamamızda müşteri paket aktivasyon işlemi yaptığında ‘’Paket Başka Bir Kullanıcıya Ait Olduğu İçin Paket Atama İşlemi Başarısız Oldu’’ hatası geliyor ise, cihazda açık olan Play Store gmail hesabı ile satın alınmış, ancak aktivasyon yaptığı eposta adresi farklı bir eposta adresidir.\n\nFarklı eposta adresi ile paket aktivasyon yaptığında ‘’Subscriberlog’’ kısmında örnek ekran görüntüsünde kırmızı alana alınan ‘’Validate Google Package’’  kısmı çıkar, ok ile gösterilen ID kısmından doğru üyeliği ID araması ile bulabiliriz." }, { "title": "AKTİVASYON SORUNLARI", "body": "Android Uygulama Paket Aktivasyon İşlem Tamamlanamadı veya Üyelik Bulunamama Sorunu\nAndroid uygulamamızda müşteri ödeme yapmış olmasına rağmen paket aktivasyonu yaptığında ‘’İşlem tamamlandı, İşlem Tamamlanamadı veya Abone bulunamadı’’ hatası geliyor ve üyelik aktif olmuyor ise, müşteriden GPA kodunu paylaşılması istenir.\nGPA kodu, Google tarafından ödeme yapıldığına dair müşteriye gönderilen ödeme faturası (makbuz) içerisinde yer almaktadır.\nBu GPA kodu ile üyeliği Tvmanager üzerinden aşağıdaki görseldeki gibi Reporting > General > Payments kısmında tarihi aralığı ayarlanıp ‘’Transaction Identifer’’ kısmından arama yapılıp, üyelik ID’sine ‘’Subscriber ID’’ üzerinden ulaşılabilir." }, { "title": "AKTİVASYON SORUNLARI", "body": "Türksat Abone Bulunamadı veya Abone Active Değil Sorunu\nBu hata, Hizmet ID veya Geçici Kod hatalı yazılmasından dolayı alınır.  Müşteriler genellikle bazı büyük küçük harfleri karıştırabiliyor veya sistemden dolayı bazen bu sorun alınabiliyor.\nÇözüm olarak harf hatası olmaması için Tvmanager>Reporting>General>Thirtdparty Provisions kısmından tarih aralığı belirleyip, Hizmet ID numarasını ‘’Extrenal ID’’ kısmından aratıp, kullanıcı Türksat bilgilerini bulup ‘’UniqueID’’ kısmından geçici kodu bulup, kullanıcıya paylaştığımızda, ID ve Geçici kodu kopyala yapıştırır şeklinde ilerlemesini iletebiliriz.\nAynı sorun devam eder ise, kullanıcıdan onay alıp, ID ve geçici kod ile kullanıcının üyeliğini kendimiz yapabiliriz. Müşterinin üyeliğini biz tarafından yapıldı ise, müşteriye şifresini nasıl güncelleyebileceği ile ilgili bilgi verilir." }] };

function renderTechSections() {
    // Kaynak: Sheet'ten gelen teknik kartlar + admin override (localStorage)
    const baseCards = (database || []).filter(c => String(c.category || '').toLowerCase() === 'teknik');
    let override = [];
    try { override = JSON.parse(localStorage.getItem('techCardsOverride') || '[]'); } catch (e) { override = []; }
    const techCards = (Array.isArray(override) && override.length) ? override : baseCards;

    // Heuristik sınıflandırma
    const buckets = { broadcast: [], access: [], app: [], activation: [], cards: [] };
    techCards.forEach(c => {
        const hay = `${c.title || ''} ${c.text || ''} ${c.script || ''}`.toLowerCase();
        if (hay.includes('yayın') || hay.includes('don') || hay.includes('buffer') || hay.includes('akış') || hay.includes('tv')) {
            buckets.broadcast.push(c);
        } else if (hay.includes('erişim') || hay.includes('vpn') || hay.includes('proxy') || hay.includes('login') || hay.includes('giriş') || hay.includes('yurtdışı')) {
            buckets.access.push(c);
        } else if (hay.includes('app') || hay.includes('uygulama') || hay.includes('hata') || hay.includes('crash') || hay.includes('versiyon')) {
            buckets.app.push(c);
        } else if (hay.includes('aktivasyon') || hay.includes('satın') || hay.includes('satınalma') || hay.includes('store') || hay.includes('ödeme') || hay.includes('google') || hay.includes('apple')) {
            buckets.activation.push(c);
        } else {
            buckets.broadcast.push(c);
        }
        buckets.cards.push(c);
    });

    window.__techBuckets = buckets;

    // Search input bağlama
    const bindSearch = (inputId, key, listId) => {
        const inp = document.getElementById(inputId);
        if (!inp) return;
        inp.oninput = () => renderTechList(key, inp.value || '', listId);
    };

    bindSearch('x-broadcast-search', 'broadcast', 'x-broadcast-list');
    bindSearch('x-access-search', 'access', 'x-access-list');
    bindSearch('x-app-search', 'app', 'x-app-list');
    bindSearch('x-activation-search', 'activation', 'x-activation-list');
    bindSearch('x-cards-search', 'cards', 'x-cards');

    // İlk çizim
    renderTechList('broadcast', '', 'x-broadcast-list');
    renderTechList('access', '', 'x-access-list');
    renderTechList('app', '', 'x-app-list');
    renderTechList('activation', '', 'x-activation-list');
    renderTechList('cards', '', 'x-cards');
}

let techEditMode = false;

function renderTechList(bucketKey, q, listId) {
    const listEl = document.getElementById(listId);
    if (!listEl) return;

    const all = (window.__techBuckets && window.__techBuckets[bucketKey]) ? window.__techBuckets[bucketKey] : [];
    const query = String(q || '').trim().toLowerCase();

    const filtered = !query ? all : all.filter(c => {
        const hay = `${c.title || ''} ${c.text || ''} ${c.script || ''} ${c.link || ''}`.toLowerCase();
        return hay.includes(query);
    });

    const bar = (isAdminMode ? `
        <div style="display:flex;gap:10px;align-items:center;margin:10px 0 14px;">
          <button class="x-btn x-btn-admin" onclick="toggleTechEdit()"><i class="fas fa-pen"></i> ${techEditMode ? 'Düzenlemeyi Kapat' : 'Düzenlemeyi Aç'}</button>
          ${techEditMode ? `<button class="x-btn x-btn-admin" onclick="addTechCard('${bucketKey}')"><i class="fas fa-plus"></i> Kart Ekle</button>` : ``}
          <span style="color:#888;font-weight:800;font-size:.9rem">Bu düzenlemeler tarayıcıda saklanır (local).</span>
        </div>
    ` : '');

    if (!filtered.length) {
        listEl.innerHTML = bar + '<div class="home-mini-item">Kayıt bulunamadı.</div>';
        return;
    }

    listEl.innerHTML = bar + `
      <div class="x-card-grid">
        ${filtered.map((c, idx) => techCardHtml(c, idx)).join('')}
      </div>
    `;
}

function techCardKey(c, idx) {
    return (c && (c.id || c.code)) ? String(c.id || c.code) : `${(c.title || '').slice(0, 40)}__${idx}`;
}

function techCardHtml(c, idx) {
    const title = escapeHtml(c.title || '');
    const badge = escapeHtml(c.code || c.category || 'TEKNİK');
    const rawText = (c.text || '').toString();
    const text = escapeHtml(rawText);
    const link = (c.link || '').trim();
    const script = (c.script || '').trim();
    const key = techCardKey(c, idx);

    // Detay butonunu gösterme kriteri (uzun metin / script / link)
    const hasDetail = (rawText && rawText.length > 180) || (script && script.length > 120) || !!link;

    return `
      <div class="x-card" data-key="${escapeHtml(key)}">
        <div class="x-card-head">
          <div class="x-card-title">${title}</div>
          <div class="x-card-badge">${badge}</div>
        </div>
        <div class="x-card-body">
          ${text ? `<div class="x-card-text x-card-text-truncate">${text}</div>` : ``}
          ${hasDetail ? `<button class="x-readmore" onclick='openTechCardDetail(${JSON.stringify(key)})'>Devam oku</button>` : ``}
        </div>
        <div class="x-card-actions">
          ${script ? `<button class="x-btn x-btn-copy" onclick='copyText(${JSON.stringify(script)})'><i class="fas fa-copy"></i> Kopyala</button>` : ``}
          ${isAdminMode && techEditMode ? `
            <button class="x-btn x-btn-admin" onclick="editTechCard(${JSON.stringify(key)})"><i class="fas fa-pen"></i> Düzenle</button>
            <button class="x-btn x-btn-admin" onclick="deleteTechCard(${JSON.stringify(key)})"><i class="fas fa-trash"></i> Sil</button>
          ` : ``}
        </div>
      </div>
    `;
}

// Teknik kart detayını popup'ta aç (ana ekran kartları gibi)
function openTechCardDetail(key) {
    try {
        const all = __getTechCardsForUi();
        // key: "<id>" veya "idx:<n>" olabilir
        let found = null;
        if (String(key || '').startsWith('idx:')) {
            const n = parseInt(String(key).split(':')[1], 10);
            if (!Number.isNaN(n)) found = all[n];
        } else {
            found = all.find((c, idx) => techCardKey(c, idx) === key) || null;
        }
        if (!found) {
            Swal.fire({ icon: 'warning', title: 'Kayıt bulunamadı', timer: 1200, showConfirmButton: false });
            return;
        }

        // showCardDetail(obj) zaten script/link vs. destekliyor
        showCardDetail({
            title: found.title || 'Detay',
            text: found.text || '',
            script: found.script || '',
            alert: found.alert || '',
            link: found.link || ''
        });
    } catch (e) {
        Swal.fire('Hata', 'Detay açılamadı.', 'error');
    }
}

function toggleTechEdit() {
    techEditMode = !techEditMode;
    // fullscreen teknik kartlar sekmesini tazele
    try { filterTechCards(); } catch (e) { }
}

function getTechOverride() {
    try {
        const arr = JSON.parse(localStorage.getItem('techCardsOverride') || '[]');
        if (Array.isArray(arr)) return arr;
    } catch (e) { }
    return [];
}

function saveTechOverride(arr) {
    // localStorage limit / quota hatalarında uygulama çökmesin
    storage.set('techCardsOverride', (arr || []));
}

function addTechCard(bucketKey) {
    Swal.fire({
        title: "Teknik Kart Ekle",
        html: `
          <input id="tc-title" class="swal2-input" placeholder="Başlık">
          <input id="tc-badge" class="swal2-input" placeholder="Etiket (ör: TEKNİK)">
          <input id="tc-link" class="swal2-input" placeholder="Link (opsiyonel)">
          <textarea id="tc-text" class="swal2-textarea" placeholder="Açıklama"></textarea>
          <textarea id="tc-script" class="swal2-textarea" placeholder="Script (opsiyonel)"></textarea>
        `,
        showCancelButton: true,
        confirmButtonText: "Ekle",
        cancelButtonText: "Vazgeç",
        preConfirm: () => {
            const title = (document.getElementById('tc-title').value || '').trim();
            if (!title) return Swal.showValidationMessage("Başlık zorunlu");
            return {
                id: 'local_' + Date.now(),
                title,
                code: (document.getElementById('tc-badge').value || 'TEKNİK').trim(),
                link: (document.getElementById('tc-link').value || '').trim(),
                text: (document.getElementById('tc-text').value || '').trim(),
                script: (document.getElementById('tc-script').value || '').trim(),
                category: 'teknik'
            };
        }
    }).then(res => {
        if (!res.isConfirmed) return;
        const cur = getTechOverride();
        const base = (database || []).filter(c => String(c.category || '').toLowerCase() === 'teknik');
        const arr = (cur.length ? cur : base);
        arr.unshift(res.value);
        saveTechOverride(arr);
        try { filterTechCards(); } catch (e) { }
    });
}

function editTechCard(key) {
    const cur = getTechOverride();
    const base = (database || []).filter(c => String(c.category || '').toLowerCase() === 'teknik');
    const arr = (cur.length ? cur : base);
    const idx = arr.findIndex((c, i) => techCardKey(c, i) === key);
    if (idx < 0) return;

    const c = arr[idx] || {};
    Swal.fire({
        title: "Kartı Düzenle",
        html: `
          <input id="tc-title" class="swal2-input" placeholder="Başlık" value="${escapeHtml(c.title || '')}">
          <input id="tc-badge" class="swal2-input" placeholder="Etiket" value="${escapeHtml(c.code || c.category || 'TEKNİK')}">
          <input id="tc-link" class="swal2-input" placeholder="Link" value="${escapeHtml(c.link || '')}">
          <textarea id="tc-text" class="swal2-textarea" placeholder="Açıklama">${escapeHtml(c.text || '')}</textarea>
          <textarea id="tc-script" class="swal2-textarea" placeholder="Script">${escapeHtml(c.script || '')}</textarea>
        `,
        showCancelButton: true,
        confirmButtonText: "Kaydet",
        cancelButtonText: "Vazgeç",
        preConfirm: () => {
            const title = (document.getElementById('tc-title').value || '').trim();
            if (!title) return Swal.showValidationMessage("Başlık zorunlu");
            return {
                ...c,
                title,
                code: (document.getElementById('tc-badge').value || 'TEKNİK').trim(),
                link: (document.getElementById('tc-link').value || '').trim(),
                text: (document.getElementById('tc-text').value || '').trim(),
                script: (document.getElementById('tc-script').value || '').trim(),
                category: 'teknik'
            };
        }
    }).then(res => {
        if (!res.isConfirmed) return;
        arr[idx] = res.value;
        saveTechOverride(arr);
        try { filterTechCards(); } catch (e) { }
    });
}

function deleteTechCard(key) {
    Swal.fire({
        title: "Silinsin mi?",
        text: "Bu kart local veriden silinecek.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sil",
        cancelButtonText: "Vazgeç"
    }).then(res => {
        if (!res.isConfirmed) return;
        const cur = getTechOverride();
        const base = (database || []).filter(c => String(c.category || '').toLowerCase() === 'teknik');
        const arr = (cur.length ? cur : base);
        const next = arr.filter((c, i) => techCardKey(c, i) !== key);
        saveTechOverride(next);
        try { filterTechCards(); } catch (e) { }
    });
}

function renderTechList(targetId, list, showCategory = false) {
    const el = document.getElementById(targetId);
    if (!el) return;
    if (!list || list.length === 0) {
        el.innerHTML = '<div style="padding:16px;opacity:.7">Bu başlık altında içerik yok.</div>';
        return;
    }
    el.innerHTML = list.map((c) => `
      <div class="news-item" style="cursor:pointer" onclick="showCardDetail(${JSON.stringify(c).replace(/</g, '\u003c')})">
        <span class="news-title">${escapeHtml(c.title || '')}</span>
        ${showCategory ? `<span class="news-tag" style="background:#eef2ff;color:#2b3a8a;border:1px solid #dde3ff">${escapeHtml(c.category || '')}</span>` : ''}
        <div class="news-desc" style="white-space:pre-line">${escapeHtml(c.text || '')}</div>
        ${c.script ? `<div class="script-box" style="margin-top:10px"><b>Script:</b><div style="margin-top:6px;white-space:pre-line">${escapeHtml(c.script || '')}</div><div style="text-align:right;margin-top:10px"><button class="btn btn-copy" onclick="event.stopPropagation(); copyText('${escapeForJsString(c.script || '')}')">Kopyala</button></div></div>` : ''}
      </div>
    `).join('');
}

function renderTechDocs() {
    const map = {
        broadcast: 'x-broadcast-docs',
        access: 'x-access-docs',
        app: 'x-app-docs',
        activation: 'x-activation-docs'
    };

    Object.keys(map).forEach(key => {
        const el = document.getElementById(map[key]);
        if (!el) return;

        try {
            const items = (TECH_DOC_CONTENT && TECH_DOC_CONTENT[key]) ? TECH_DOC_CONTENT[key] : [];
            if (!Array.isArray(items) || items.length === 0) {
                el.innerHTML = '<div style="padding:12px 2px;opacity:.7">Bu başlık altında teknik döküman bulunamadı.</div>';
                return;
            }

            el.innerHTML = items.map((it, idx) => `
                <div class="doc-card">
                  <button type="button" class="doc-head" onclick="toggleDocAccordion(this)">
                    <span class="doc-title">${escapeHtml(it.title || ('İçerik ' + (idx + 1)))}</span>
                    <i class="fas fa-chevron-down"></i>
                  </button>
                  <div class="doc-body" style="display:none; white-space:pre-line">${escapeHtml(it.body || '')}</div>
                </div>
            `).join('');
        } catch (err) {
            console.error('renderTechDocs error', err);
            el.innerHTML = '<div style="padding:12px 2px;opacity:.7">Dökümanlar yüklenemedi. (Konsolu kontrol edin)</div>';
        }
    });
}

function toggleDocAccordion(btn) {
    try {
        const card = btn.closest('.doc-card');
        if (!card) return;
        const body = card.querySelector('.doc-body');
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        card.classList.toggle('open', !isOpen);
    } catch (e) { }
}


function renderTechWizardInto(targetId) {
    const box = document.getElementById(targetId);
    if (!box) return;

    // Ayrı state: fullscreen içindeki gömülü sihirbaz
    window.embeddedTwState = window.embeddedTwState || { currentStep: 'start', history: [] };

    // Veri yoksa yükle
    if (!techWizardData || Object.keys(techWizardData).length === 0) {
        box.innerHTML = '<div style="padding:16px;opacity:.7">Sihirbaz yükleniyor...</div>';
        loadTechWizardData().then(() => renderTechWizardInto(targetId));
        return;
    }

    embeddedTwRender(targetId);
}

function embeddedTwRender(targetId) {
    const box = document.getElementById(targetId);
    if (!box) return;

    const st = window.embeddedTwState || { currentStep: 'start', history: [] };
    const stepData = techWizardData[st.currentStep];

    if (!stepData) {
        box.innerHTML = `<div class="tech-alert">Hata: Adım bulunamadı (${escapeHtml(String(st.currentStep))}).</div>`;
        return;
    }

    const backVisible = st.history && st.history.length > 0;

    let html = `
      <div style="display:flex; gap:8px; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap">
        <div style="display:flex; gap:8px; align-items:center">
          ${backVisible ? `<button type="button" class="tech-btn tech-btn-option" onclick="embeddedTwBack('${targetId}')">⬅ Geri</button>` : ''}
          <button type="button" class="tech-btn tech-btn-option" onclick="embeddedTwReset('${targetId}')">↻ Sıfırla</button>
        </div>
        <div style="opacity:.7; font-size:.9rem">Adım: ${escapeHtml(stepData.title || '')}</div>
      </div>

      <div class="tech-step-title">${escapeHtml(stepData.title || '')}</div>
    `;

    if (stepData.text) {
        html += `<div style="font-size:1rem; margin:10px 0; white-space:pre-line">${escapeHtml(stepData.text)}</div>`;
    }
    if (stepData.script) {
        html += `<div class="tech-script-box"><span class="tech-script-label">Müşteriye iletilecek:</span>${escapeHtml(stepData.script)}</div>`;
    }
    if (stepData.alert) {
        html += `<div class="tech-alert">${escapeHtml(stepData.alert)}</div>`;
    }

    if (Array.isArray(stepData.buttons) && stepData.buttons.length) {
        html += `<div class="tech-buttons-area">`;
        stepData.buttons.forEach(btn => {
            const cls = btn.style === 'option' ? 'tech-btn-option' : 'tech-btn-primary';
            html += `<button type="button" class="tech-btn ${cls}" onclick="embeddedTwChangeStep('${targetId}','${escapeForJsString(btn.next || 'start')}')">${escapeHtml(btn.text || '')}</button>`;
        });
        html += `</div>`;
    }

    box.innerHTML = html;
}

function embeddedTwChangeStep(targetId, newStep) {
    window.embeddedTwState = window.embeddedTwState || { currentStep: 'start', history: [] };
    window.embeddedTwState.history.push(window.embeddedTwState.currentStep);
    window.embeddedTwState.currentStep = newStep;
    embeddedTwRender(targetId);
}
function embeddedTwBack(targetId) {
    window.embeddedTwState = window.embeddedTwState || { currentStep: 'start', history: [] };
    if (window.embeddedTwState.history.length) {
        window.embeddedTwState.currentStep = window.embeddedTwState.history.pop();
        embeddedTwRender(targetId);
    }
}
function embeddedTwReset(targetId) {
    window.embeddedTwState = { currentStep: 'start', history: [] };
    embeddedTwRender(targetId);
}

/* -------------------------
   TEKNİK KARTLAR (FULLSCREEN)
   - Eski kart görünümü (liste)
   - Düzenleme, E-Tablo (Data) üzerinden (updateContent/addCard)
--------------------------*/

function formatShiftDate(dateStr) {
    if (!dateStr) return '';
    const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
    if (days.includes(dateStr)) return dateStr;
    
    try {
        const d = new Date(dateStr);
        if (isNaN(d)) return dateStr;
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) + ' ' +
            d.toLocaleDateString('tr-TR', { weekday: 'short' });
    } catch (e) {
        return dateStr;
    }
}

function __getTechCardsForUi() {
    return (database || [])
        .map((c, i) => ({ ...c, __dbIndex: i }))
        .filter(c => String(c.category || '').toLowerCase() === 'teknik' && String(c.status || '').toLowerCase() !== 'pasif');
}

async function addTechCardSheet() {
    if (!isAdminMode) return;
    const { value: v } = await Swal.fire({
        title: 'Teknik Kart Ekle',
        html: `
        <input id="tc-title" class="swal2-input" placeholder="Başlık">
        <textarea id="tc-text" class="swal2-textarea" placeholder="Açıklama"></textarea>
        <textarea id="tc-script" class="swal2-textarea" placeholder="Script (opsiyonel)"></textarea>
        <input id="tc-link" class="swal2-input" placeholder="Link (opsiyonel)">
      `,
        showCancelButton: true,
        confirmButtonText: 'Ekle',
        cancelButtonText: 'Vazgeç',
        preConfirm: () => {
            const title = (document.getElementById('tc-title').value || '').trim();
            if (!title) return Swal.showValidationMessage('Başlık zorunlu');
            const today = new Date();
            const dateStr = today.getDate() + "." + (today.getMonth() + 1) + "." + today.getFullYear();
            return {
                cardType: 'card',
                category: 'Teknik',
                title,
                text: (document.getElementById('tc-text').value || '').trim(),
                script: (document.getElementById('tc-script').value || '').trim(),
                code: '',
                link: (document.getElementById('tc-link').value || '').trim(),
                status: 'Aktif',
                date: dateStr
            };
        }
    });
    if (!v) return;

    if (!v) return;

    Swal.fire({ title: 'Ekleniyor...', didOpen: () => Swal.showLoading(), showConfirmButton: false });
    try {
        const d = await apiCall("addCard", { ...v });
        if (d.result === 'success') {
            Swal.fire({ icon: 'success', title: 'Eklendi', timer: 1200, showConfirmButton: false });
            await loadContentData();
            filterTechCards();
        } else {
            Swal.fire('Hata', d.message || 'Eklenemedi', 'error');
        }
    } catch (e) {
        Swal.fire('Hata', 'Sunucu hatası.', 'error');
    }
}

async function editTechCardSheet(dbIndex) {
    if (!isAdminMode) return;
    const it = (database || [])[dbIndex];
    if (!it) return;
    const { value: v } = await Swal.fire({
        title: 'Teknik Kartı Düzenle',
        html: `
        <input id="tc-title" class="swal2-input" placeholder="Başlık" value="${escapeHtml(it.title || '')}">
        <textarea id="tc-text" class="swal2-textarea" placeholder="Açıklama">${escapeHtml(it.text || '')}</textarea>
        <textarea id="tc-script" class="swal2-textarea" placeholder="Script">${escapeHtml(it.script || '')}</textarea>
        <input id="tc-link" class="swal2-input" placeholder="Link" value="${escapeHtml(it.link || '')}">
      `,
        showCancelButton: true,
        confirmButtonText: 'Kaydet',
        cancelButtonText: 'Vazgeç',
        preConfirm: () => {
            const title = (document.getElementById('tc-title').value || '').trim();
            if (!title) return Swal.showValidationMessage('Başlık zorunlu');
            return {
                title,
                text: (document.getElementById('tc-text').value || '').trim(),
                script: (document.getElementById('tc-script').value || '').trim(),
                link: (document.getElementById('tc-link').value || '').trim(),
            };
        }
    });
    if (!v) return;
    const originalTitle = it.title;
    // sendUpdate sırayla update eder
    if (v.text !== (it.text || '')) sendUpdate(originalTitle, 'Text', v.text, 'card');
    setTimeout(() => { if (v.script !== (it.script || '')) sendUpdate(originalTitle, 'Script', v.script, 'card'); }, 350);
    setTimeout(() => { if (v.link !== (it.link || '')) sendUpdate(originalTitle, 'Link', v.link, 'card'); }, 700);
    setTimeout(() => { if (v.title !== originalTitle) sendUpdate(originalTitle, 'Title', v.title, 'card'); }, 1100);
}

function deleteTechCardSheet(dbIndex) {
    if (!isAdminMode) return;
    const it = (database || [])[dbIndex];
    if (!it) return;
    Swal.fire({
        title: 'Silinsin mi?',
        text: 'Kart pasife alınacak.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sil',
        cancelButtonText: 'Vazgeç'
    }).then(res => {
        if (!res.isConfirmed) return;
        sendUpdate(it.title, 'Status', 'Pasif', 'card');
    });
}

function renderTechCardsTab(q = '') {
    const box = document.getElementById('x-cards');
    if (!box) return;

    const query = String(q || '').trim().toLowerCase();
    const all = __getTechCardsForUi();
    const filtered = !query ? all : all.filter(c => {
        const hay = `${c.title || ''} ${c.text || ''} ${c.script || ''} ${c.link || ''}`.toLowerCase();
        return hay.includes(query);
    });

    const bar = (isAdminMode && isEditingActive)
        ? `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
           <button class="x-btn x-btn-admin" onclick="addTechCardSheet()"><i class="fas fa-plus"></i> Kart Ekle</button>
         </div>`
        : ``;

    if (!filtered.length) {
        box.innerHTML = bar + '<div style="opacity:.7;padding:16px">Kayıt bulunamadı.</div>';
        return;
    }

    box.innerHTML = bar + `
      <div class="x-card-grid">
        ${filtered.map(c => {
        const hasDetail = ((c.text || '').length > 180) || ((c.script || '').length > 120) || !!(c.link || '');
        const detailObj = { title: c.title, text: c.text || '', script: c.script || '', link: c.link || '' };
        const edit = (isAdminMode && isEditingActive)
            ? `
              <button class="x-btn x-btn-admin" onclick="event.stopPropagation();editTechCardSheet(${c.__dbIndex})"><i class="fas fa-pen"></i> Düzenle</button>
              <button class="x-btn x-btn-admin" onclick="event.stopPropagation();deleteTechCardSheet(${c.__dbIndex})"><i class="fas fa-trash"></i> Sil</button>
            `
            : ``;
        return `
            <div class="x-card" style="cursor:pointer" onclick='showCardDetail(${JSON.stringify(detailObj).replace(/</g, '\\u003c')})'>
              <div class="x-card-head">
                <div class="x-card-title">${escapeHtml(c.title || '')}</div>
                <div class="x-card-badge">TEKNİK</div>
              </div>
              <div class="x-card-body">
                ${(c.text || '') ? `<div class="x-card-text x-card-text-truncate">${escapeHtml(c.text || '')}</div>` : `<div style="opacity:.7">İçerik yok</div>`}
                ${hasDetail ? `<button class="x-readmore" onclick='event.stopPropagation();showCardDetail(${JSON.stringify(detailObj).replace(/</g, '\\u003c')})'>Devam oku</button>` : ``}
              </div>
              <div class="x-card-actions" onclick="event.stopPropagation();">
                ${(c.script || '') ? `<button class="x-btn x-btn-copy" onclick='copyText(${JSON.stringify(c.script || '')})'><i class="fas fa-copy"></i> Kopyala</button>` : ``}
                ${edit}
              </div>
            </div>
          `;
    }).join('')}
      </div>
    `;
}

function filterTechCards() {
    const inp = document.getElementById('x-cards-search');
    renderTechCardsTab(inp ? inp.value : '');
}


function applySportsRights() {
    if (!Array.isArray(sportsData) || sportsData.length === 0) return;
    const rights = (window.sportRightsFromSheet && window.sportRightsFromSheet.length) ? window.sportRightsFromSheet : SPORTS_RIGHTS_FALLBACK;
    sportsData.forEach(s => {
        const hay = `${s.title || ''} ${s.desc || ''} ${s.detail || ''}`.toLowerCase();
        const hit = rights.find(r => hay.includes(String(r.name || '').toLowerCase().replaceAll('*', '').trim().split(' ')[0]));
        if (hit) {
            const extra = `Yayın hakkı bitiş: ${hit.end || hit.duration}`;
            if (s.tip && !s.tip.includes('Yayın hakkı')) s.tip = `${s.tip} • ${extra}`;
            else if (!s.tip) s.tip = extra;
            if (s.detail && !s.detail.includes('Yayın hakkı')) s.detail = `${s.detail}\n\n${extra}`;
            else if (!s.detail) s.detail = extra;
        }
    });
}

// Var olan veri yüklemesi bittikten sonra hak bilgisi ekle
const _orig_afterDataLoaded = window.afterDataLoaded;
window.afterDataLoaded = function () {
    try { if (typeof _orig_afterDataLoaded === 'function') _orig_afterDataLoaded(); } catch (e) { }
    try { applySportsRights(); } catch (e) { }
};


// ======================
// TECH DOCS - SHEET BIND
// ======================
let __techDocsCache = null;
let __techDocsLoadedAt = 0;
let __techCatsCache = null;
let __techCatsLoadedAt = 0;

const TECH_TAB_LABELS = {
    broadcast: 'Yayın Sorunları',
    access: 'Erişim Sorunları',
    app: 'App Hataları',
    activation: 'Aktivasyon Sorunları',
    info: 'Sık Sorulan Sorular',
    payment: 'Ödeme Sorunları'
};

function __normalizeTechTab(tab) {
    // tab ids: broadcast, access, app, activation
    return tab;
}
function __normalizeTechCategory(cat) {
    const c = (cat || "").toString().trim().toLowerCase();
    if (c.startsWith("yay")) return "broadcast";
    if (c.startsWith("eri")) return "access";
    if (c.startsWith("app")) return "app";
    if (c.startsWith("akt")) return "activation";
    if (c.startsWith("bil")) return "info";
    if (c.startsWith("öde") || c.startsWith("ode") || c.includes("ödeme") || c.includes("odeme")) return "payment";
    return "";
}



async function __fetchTechDocs() {
    const data = await apiCall("getTechDocs");
    const rows = Array.isArray(data.data) ? data.data : [];
    return rows
        .filter(r => (r.Durum || "").toString().trim().toLowerCase() !== "pasif")
        .map(r => ({
            categoryKey: __normalizeTechCategory(r.Kategori),
            kategori: (r.Kategori || "").trim(),
            baslik: (r.Başlık || r.Baslik || r.Title || r["Başlık"] || "").toString().trim(),
            icerik: (r.İçerik || r.Icerik || r.Content || r["İçerik"] || "").toString(),
            adim: (r.Adım || r.Adim || r.Step || r["Adım"] || "").toString(),
            not: (r.Not || "").toString(),
            link: (r.Link || "").toString(),
            image: (r.Resim || r.Image || r.Görsel || r.Gorsel || "").toString(),
            id: r.id,
            durum: (r.Durum || "").toString()
        }))
        .filter(x => x.categoryKey && x.baslik);
}

async function __fetchTechDocCategories() {
    // K sütunundan okunan kategori listesi (boşsa A sütunundan türetilir)
    try {
        const d = await apiCall("getTechDocCategories");
        if (d && d.result === 'success' && Array.isArray(d.categories)) return d.categories;
        return [];
    } catch (e) {
        return [];
    }
}

async function getTechDocCategoryOptions(force = false) {
    const now = Date.now();
    if (!force && __techCatsCache && (now - __techCatsLoadedAt) < 300000) return __techCatsCache; // 5dk
    const cats = await __fetchTechDocCategories();
    __techCatsCache = cats;
    __techCatsLoadedAt = now;
    return cats;
}



function __renderTechList(tabKey, items) {
    const listEl = document.getElementById(
        tabKey === "broadcast" ? "x-broadcast-list" :
            tabKey === "access" ? "x-access-list" :
                tabKey === "app" ? "x-app-list" :
                    tabKey === "activation" ? "x-activation-list" :
                        tabKey === "info" ? "x-info-list" :
                            tabKey === "payment" ? "x-payment-list" : ""
    );
    if (!listEl) return;

    if (!items || items.length === 0) {
        listEl.innerHTML = `<div style="padding:16px;opacity:.75">Bu başlık altında henüz içerik yok. (Sheet: Teknik_Dokumanlar)</div>`;
        return;
    }

    // Admin bar (düzenleme global menüden açılır)
    const adminBar = (isAdminMode && isEditingActive)
        ? `<div style="display:flex;gap:10px;align-items:center;margin:0 0 12px;">
         <button class="x-btn x-btn-admin" onclick="addTechDoc('${tabKey}')"><i class=\"fas fa-plus\"></i> Yeni Konu Ekle</button>
       </div>`
        : ``;

    function render(filtered) {
        listEl.innerHTML = adminBar + filtered.map((it, idx) => {
            const body = [
                it.icerik ? `<div class="q-doc-body" style="white-space: pre-line">${it.icerik}</div>` : "",
                it.image ? `<div style="margin:10px 0;"><img src="${processImageUrl(it.image)}" loading="lazy" onerror="this.style.display='none'" style="max-width:100%; border-radius:8px; max-height:300px; object-fit:cover;"></div>` : "",
                it.adim ? `<div class="q-doc-meta" style="white-space: pre-line"><b>Adım:</b> ${escapeHtml(it.adim)}</div>` : "",
                it.not ? `<div class="q-doc-meta" style="white-space: pre-line"><b>Not:</b> ${escapeHtml(it.not)}</div>` : "",
                it.link ? `<div class="q-doc-meta"><b>Link:</b> <a href="${escapeHtml(it.link)}" target="_blank">${escapeHtml(it.link)}</a></div>` : ""
            ].join("");
            const adminBtns = (isAdminMode && isEditingActive)
                ? `<span style="float:right;display:inline-flex;gap:8px" onclick="event.stopPropagation();event.preventDefault();">
             <button class="x-btn x-btn-admin" style="padding:6px 10px" onclick="editTechDoc('${tabKey}','${escapeForJsString(it.baslik)}')"><i class=\"fas fa-pen\"></i></button>
             <button class="x-btn x-btn-admin" style="padding:6px 10px" onclick="deleteTechDoc('${tabKey}','${escapeForJsString(it.baslik)}')"><i class=\"fas fa-trash\"></i></button>
           </span>`
                : ``;
            return `
        <details class="q-accordion" style="margin-bottom:10px;background:#fff;border-radius:12px;border:1px solid rgba(0,0,0,.08);padding:10px 12px">
          <summary style="cursor:pointer;font-weight:800">${escapeHtml(it.baslik)}${adminBtns}</summary>
          <div style="padding:10px 2px 2px 2px">${body}</div>
        </details>
      `;
        }).join("");
    }

    render(items);
}

async function loadTechDocsIfNeeded(force = false) {
    const now = Date.now();
    if (!force && __techDocsCache && (now - __techDocsLoadedAt) < 120000) return __techDocsCache; // 2dk cache
    try {
        const rows = await __fetchTechDocs();
        __techDocsCache = rows;
        __techDocsLoadedAt = now;
        return rows;
    } catch (e) {
        console.error("[TECH DOCS]", e);
        return [];
    }
}

// Teknik fullscreen üst arama kutuları (index.html) için
async function filterTechDocList(tabKey) {
    try {
        const input = document.getElementById(`x-${tabKey}-search`);
        const q = (input ? input.value : '').toLowerCase().trim();
        const all = await loadTechDocsIfNeeded(false);
        const scoped = all.filter(x => x.categoryKey === tabKey);
        const filtered = !q ? scoped : scoped.filter(x =>
            (x.baslik || '').toLowerCase().includes(q) ||
            (x.icerik || '').toLowerCase().includes(q) ||
            (x.adim || '').toLowerCase().includes(q) ||
            (x.not || '').toLowerCase().includes(q)
        );
        __renderTechList(tabKey, filtered);
    } catch (e) {
        console.error(e);
    }
}

// Teknik_Dokumanlar kategori listesi (Sheet K sütunu)
let __techCategoryOptions = null;
async function loadTechCategoryOptions() {
    if (__techCategoryOptions) return __techCategoryOptions;
    try {
        const d = await apiCall("getTechDocCategories");
        if (d && d.result === 'success' && Array.isArray(d.categories)) {
            __techCategoryOptions = d.categories.filter(Boolean);
            return __techCategoryOptions;
        }
    } catch (e) { console.error('[TECH CATS]', e); }
    __techCategoryOptions = [];
    return __techCategoryOptions;
}

function techTabLabel(tabKey) {
    const m = { broadcast: 'Yayın Sorunları', access: 'Erişim Sorunları', app: 'App Hataları', activation: 'Aktivasyon Sorunları', info: 'Sık Sorulan Sorular', payment: 'Ödeme Sorunları' };
    return m[tabKey] || 'Yayın Sorunları';
}

// ---------------------------
// TECH DOCS (Sheet) - Admin CRUD
// ---------------------------
async function addTechDoc(tabKey) {
    if (!isAdminMode) return;
    const cats = await getTechDocCategoryOptions(false);
    const defaultLabel = TECH_TAB_LABELS[tabKey] || '';
    const opts = (cats && cats.length ? cats : Object.values(TECH_TAB_LABELS))
        .map(c => String(c || '').trim()).filter(Boolean);
    const uniq = Array.from(new Set(opts.map(x => x.toLowerCase()))).map(k => opts.find(x => x.toLowerCase() === k));
    const optionsHtml = uniq.map(c => `<option value="${escapeHtml(c)}" ${c === defaultLabel ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
    const { value: v } = await Swal.fire({
        title: 'Teknik Konu Ekle',
        html: `
      <select id="td-cat" class="swal2-select" style="width:100%;max-width:420px">
        ${optionsHtml}
      </select>
      <input id="td-title" class="swal2-input" placeholder="Başlık">
      <textarea id="td-content" class="swal2-textarea" placeholder="İçerik"></textarea>
      <input id="td-step" class="swal2-input" placeholder="Adım (opsiyonel)">
      <input id="td-note" class="swal2-input" placeholder="Not (opsiyonel)">
      <input id="td-link" class="swal2-input" placeholder="Link (opsiyonel)">
      <input id="td-image" class="swal2-input" placeholder="Görsel Linki (opsiyonel)">
    `,
        showCancelButton: true,
        confirmButtonText: 'Ekle',
        cancelButtonText: 'Vazgeç',
        preConfirm: () => {
            const cat = (document.getElementById('td-cat')?.value || defaultLabel || '').trim();
            if (!cat) return Swal.showValidationMessage('Kategori zorunlu');
            const title = (document.getElementById('td-title').value || '').trim();
            if (!title) return Swal.showValidationMessage('Başlık zorunlu');
            return {
                kategori: cat,
                baslik: title,
                icerik: (document.getElementById('td-content').value || '').trim(),
                adim: (document.getElementById('td-step').value || '').trim(),
                not: (document.getElementById('td-note').value || '').trim(),
                link: (document.getElementById('td-link').value || '').trim(),
                image: (document.getElementById('td-image').value || '').trim(),
                durum: 'Aktif'
            };
        }
    });
    if (!v) return;

    Swal.fire({ title: 'Ekleniyor...', didOpen: () => Swal.showLoading(), showConfirmButton: false });
    try {
        const d = await apiCall("upsertTechDoc", { keyKategori: '', keyBaslik: '', ...v });
        if (d.result === 'success') {
            Swal.fire({ icon: 'success', title: 'Eklendi', timer: 1200, showConfirmButton: false });
            await loadTechDocsIfNeeded(true);
            filterTechDocList(tabKey);
        } else {
            Swal.fire('Hata', d.message || 'Eklenemedi', 'error');
        }
    } catch (e) {
        Swal.fire('Hata', 'Sunucu hatası.', 'error');
    }
}

async function editTechDoc(tabKey, baslik) {
    if (!isAdminMode) return;
    const all = await loadTechDocsIfNeeded(false);
    const it = all.find(x => x.categoryKey === tabKey && (x.baslik || '') === baslik);
    if (!it) return;
    const cats = await getTechDocCategoryOptions(false);
    const opts = (cats && cats.length ? cats : Object.values(TECH_TAB_LABELS))
        .map(c => String(c || '').trim()).filter(Boolean);
    const uniq = Array.from(new Set(opts.map(x => x.toLowerCase()))).map(k => opts.find(x => x.toLowerCase() === k));
    const optionsHtml = uniq.map(c => `<option value="${escapeHtml(c)}" ${(c === it.kategori) ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
    const { value: v } = await Swal.fire({
        title: 'Teknik Konuyu Düzenle',
        html: `
      <select id="td-cat" class="swal2-select" style="width:100%;max-width:420px">
        ${optionsHtml}
      </select>
      <input id="td-title" class="swal2-input" placeholder="Başlık" value="${escapeHtml(it.baslik || '')}">
      <textarea id="td-content" class="swal2-textarea" placeholder="İçerik">${escapeHtml(it.icerik || '')}</textarea>
      <input id="td-step" class="swal2-input" placeholder="Adım" value="${escapeHtml(it.adim || '')}">
      <input id="td-note" class="swal2-input" placeholder="Not" value="${escapeHtml(it.not || '')}">
      <input id="td-link" class="swal2-input" placeholder="Link" value="${escapeHtml(it.link || '')}">
      <input id="td-image" class="swal2-input" placeholder="Görsel Linki" value="${escapeHtml(it.image || '')}">
    `,
        showCancelButton: true,
        confirmButtonText: 'Kaydet',
        cancelButtonText: 'Vazgeç',
        preConfirm: () => {
            const cat = (document.getElementById('td-cat')?.value || it.kategori || '').trim();
            if (!cat) return Swal.showValidationMessage('Kategori zorunlu');
            const title = (document.getElementById('td-title').value || '').trim();
            if (!title) return Swal.showValidationMessage('Başlık zorunlu');
            return {
                kategori: cat,
                baslik: title,
                icerik: (document.getElementById('td-content').value || '').trim(),
                adim: (document.getElementById('td-step').value || '').trim(),
                not: (document.getElementById('td-note').value || '').trim(),
                link: (document.getElementById('td-link').value || '').trim(),
                image: (document.getElementById('td-image').value || '').trim(),
                durum: 'Aktif'
            };
        }
    });
    if (!v) return;

    Swal.fire({ title: 'Kaydediliyor...', didOpen: () => Swal.showLoading(), showConfirmButton: false });
    try {
        const d = await apiCall('upsertTechDoc', { id: it.id, keyKategori: it.kategori, keyBaslik: it.baslik, ...v, username: currentUser, token: getToken() });
        if (d.result === 'success') {
            Swal.fire({ icon: 'success', title: 'Kaydedildi', timer: 1200, showConfirmButton: false });
            await loadTechDocsIfNeeded(true);
            filterTechDocList(tabKey);
        } else {
            Swal.fire('Hata', d.message || 'Kaydedilemedi', 'error');
        }
    } catch (e) {
        Swal.fire('Hata', 'Sunucu hatası.', 'error');
    }
}

function deleteTechDoc(tabKey, baslik) {
    if (!isAdminMode) return;
    Swal.fire({
        title: 'Silinsin mi?',
        text: 'Konu pasife alınacak.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sil',
        cancelButtonText: 'Vazgeç'
    }).then(async res => {
        if (!res.isConfirmed) return;
        try {
            const all = await loadTechDocsIfNeeded(false);
            const it = all.find(x => x.categoryKey === tabKey && (x.baslik || '') === baslik);
            const keyKategori = it ? it.kategori : tabKey;
            const d = await apiCall('deleteTechDoc', { id: it.id, username: currentUser, token: getToken() });
            if (d.result === 'success') {
                await loadTechDocsIfNeeded(true);
                filterTechDocList(tabKey);
                Swal.fire({ icon: 'success', title: 'Silindi', timer: 1000, showConfirmButton: false });
            } else {
                Swal.fire('Hata', d.message || 'Silinemedi', 'error');
            }
        } catch (e) {
            Swal.fire('Hata', 'Sunucu hatası.', 'error');
        }
    });
}

// override / extend existing switchTechTab
window.switchTechTab = async function (tab) {
    try {
        // existing visual tab switch
        document.querySelectorAll('#tech-fullscreen .q-nav-item').forEach(li => li.classList.remove('active'));
        const tabMap = { wizard: 'x-view-wizard', access: 'x-view-access', app: 'x-view-app', activation: 'x-view-activation', payment: 'x-view-payment', cards: 'x-view-cards', info: 'x-view-info' };
        const viewId = tabMap[tab] || tabMap['wizard'];
        // activate clicked item
        const byData = document.querySelector(`#tech-fullscreen .q-nav-item[data-tech-tab="${tab}"]`);
        if (byData) byData.classList.add('active');
        document.querySelectorAll('#tech-fullscreen .q-view-section').forEach(v => v.classList.remove('active'));
        const viewEl = document.getElementById(viewId);
        if (viewEl) viewEl.classList.add('active');

        if (['access', 'app', 'activation', 'payment', 'info'].includes(tab)) {
            const all = await loadTechDocsIfNeeded(false);
            const filtered = all.filter(x => x.categoryKey === tab);
            __renderTechList(tab, filtered);
        }

        if (tab === 'wizard') {
            // Teknik sihirbazı fullscreen içine göm
            try { renderTechWizardInto('x-wizard'); } catch (e) { console.error(e); }
        }

        if (tab === 'cards') {
            try { filterTechCards(); } catch (e) { console.error(e); }
        }
    } catch (e) {
        console.error(e);
    }
};

// expose for onclick
try { window.openMenuPermissions = openMenuPermissions; } catch (e) { }




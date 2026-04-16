window.a2Copy = function(el, text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        const originalHtml = el.innerHTML;
        const width = el.offsetWidth;
        el.style.width = width + 'px'; 
        el.innerHTML = `<span style="color:#10b981; font-weight:800; display:flex; align-items:center; gap:5px; justify-content:center; width:100%;"><i class="fas fa-check"></i> Kopyalandı!</span>`;
        el.style.background = '#ecfdf5';
        el.style.borderColor = '#10b981';
        
        setTimeout(() => {
            el.innerHTML = originalHtml;
            el.style.background = '';
            el.style.borderColor = '';
            el.style.width = '';
        }, 1500);
    }).catch(err => {
        console.error('Kopyalama hatası:', err);
    });
};

    window.a2TagVal = function(note, key) {
        if (!note) return '';
        const match = String(note).match(new RegExp(`\\[${key}:([^\\]]+)\\]`, 'i'));
        return match ? match[1] : '';
    };
let competitionConfig = [];
let competitionMoves = [];
let userAvatars = {}; // Local storage fallback + sync mock

const AVATAR_MAP = {
    'm1': { icon: 'fa-user-ninja', label: 'Siber Ninja (E)', color: '#3b82f6' },
    'm2': { icon: 'fa-user-astronaut', label: 'Uzay Yolcusu (E)', color: '#06b6d4' },
    'f1': { icon: 'fa-crown', label: 'Efsane Kraliçe (K)', color: '#ec4899' },
    'f2': { icon: 'fa-magic', label: 'Sihirli Güç (K)', color: '#a855f7' }
};

let userTeams = []; // { user_a, user_b, team_name }

// 🎵 WEB AUDIO API SYNTHESIZER (NO DOWNLOADS REQUIRED) 🎵
function playArenaSound(type) {
    try {
        const actx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.connect(gain);
        gain.connect(actx.destination);
        if (type === 'up') {
            // Şıng! (Coin/Level Up sound)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(987.77, actx.currentTime); // B5
            osc.frequency.setValueAtTime(1318.51, actx.currentTime + 0.1); // E6
            gain.gain.setValueAtTime(0.1, actx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.00001, actx.currentTime + 0.4);
            osc.start(); osc.stop(actx.currentTime + 0.5);
        } else if (type === 'down') {
            // Zonk! (Fail/Penalty sound)
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, actx.currentTime);
            osc.frequency.linearRampToValueAtTime(100, actx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.1, actx.currentTime);
            gain.gain.linearRampToValueAtTime(0.00001, actx.currentTime + 0.3);
            osc.start(); osc.stop(actx.currentTime + 0.4);
        }
    } catch(e) { console.error("Audio block:", e); }
}

// 📡 SUPABASE REALTIME (CANLI YAYIN) 📡
window._isArenaRtSubscribed = false;
function initArenaRealtime() {
    if (window._isArenaRtSubscribed || !sb) return;
    window._isArenaRtSubscribed = true;
    
    sb.channel('public:competition_moves')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_moves' }, payload => {
          console.log("[ArenaRT] Veri değişimi algılandı:", payload.eventType);
          
          if (payload.eventType === 'INSERT') {
              // Delta Sync: Yeni satırı listeye ekle, tüm tabloyu çekme!
              if (!competitionMoves.some(m => m.id === payload.new.id)) {
                  competitionMoves.unshift(payload.new);
              }
          } else if (payload.eventType === 'UPDATE') {
              // Delta Sync: Mevcut satırı güncelle
              const idx = competitionMoves.findIndex(m => m.id === payload.new.id);
              if (idx !== -1) competitionMoves[idx] = payload.new;
          } else if (payload.eventType === 'DELETE') {
              competitionMoves = competitionMoves.filter(m => m.id === payload.old.id);
          }

          // Render tetikleyicileri (Debounced)
          clearTimeout(window._arenaRtTimer);
          window._arenaRtTimer = setTimeout(() => {
              if (typeof renderCompetitionBoard === 'function') renderCompetitionBoard();
              if (typeof renderCompetitionLeaderboard === 'function') renderCompetitionLeaderboard();
              if (typeof renderMyRecentTasks === 'function') renderMyRecentTasks();
              updateSurpriseBoxState(); // Kutu durumunu da tazele
          }, 300);
      }).subscribe();
}

// 🔥 SERİ ÇARPAN (STREAK HESAPLAMA) 🔥
function check3DayStreak(uname) {
    try {
        const dates = [...new Set(competitionMoves.filter(m => m.user_name === uname && m.status === 'approved' && m.steps > 0).map(m => m.created_at.split('T')[0]))].sort().reverse();
        if (dates.length >= 3) {
            const d0 = new Date(dates[0]), d1 = new Date(dates[1]), d2 = new Date(dates[2]);
            const diff1 = Math.round((d0 - d1)/(1000*60*60*24));
            const diff2 = Math.round((d1 - d2)/(1000*60*60*24));
            if (diff1 === 1 && diff2 === 1) { // 3 ardışık gün kuralı!
                const now = new Date();
                const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                const yesterday = new Date(now.getTime() - 86400000 - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                if (dates[0] === today || dates[0] === yesterday) return true; // Serisi aktif
            }
        }
    } catch(e) {}
    return false;
}

async function renderTelesalesCompetition() {
    initArenaRealtime(); // Canlı yayını başlat
    const board = document.getElementById('q-comp-board');
    if (!board) return;

    // Profil Kontrolü (Avatar seçilmiş mi?)
    const savedAvatar = localStorage.getItem(`comp_avatar_${currentUser}`);
    const profileBtn = document.getElementById('comp-profile-btn');
    if (profileBtn) {
        profileBtn.innerHTML = savedAvatar ? `<i class="fas ${AVATAR_MAP[savedAvatar].icon}"></i>` : '<i class="fas fa-user-circle"></i>';
    }

    // Admin mi?
    const isActuallyAdmin = (isAdminMode || isLocAdmin);
    const adminBtns = document.getElementById('admin-comp-btns');
    if (adminBtns) adminBtns.style.display = isActuallyAdmin ? 'flex' : 'none';

    // Verileri çek
    await syncCompetitionData();

    renderCompetitionBoard();
    renderCompetitionLeaderboard();
    renderMyRecentTasks();
}

async function openAvatarPicker() {
    const activeUser = (typeof currentUser !== 'undefined' ? currentUser : (localStorage.getItem("sSportUser") || "")).trim();
    if (!activeUser) return Swal.fire("Hata", "Kullanıcı bilgisi bulunamadı.", "error");

    let html = `
        <div class="avatar-picker-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; padding: 10px;">
            ${Object.entries(AVATAR_MAP).map(([id, data]) => `
                <div class="avatar-option ${localStorage.getItem(`comp_avatar_${activeUser}`) === id ? 'selected' : ''}" 
                     onclick="selectAvatar('${id}')"
                     style="background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 20px; cursor: pointer; transition: 0.3s; text-align: center;">
                    <div class="avatar-icon-circle" style="width: 70px; height: 70px; border-radius: 50%; background: ${data.color}; margin: 0 auto 10px; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; color: #fff; box-shadow: 0 5px 15px rgba(0,0,0,0.4);">
                        <i class="fas ${data.icon}"></i>
                    </div>
                    <div class="avatar-label" style="font-weight: 800; color: #fff; font-size: 0.9rem;">${data.label}</div>
                    <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5); margin-top: 5px;">${id.startsWith('f') ? 'Premium Kraliçe' : 'Siber Savaşçı'}</div>
                </div>
            `).join('')}
        </div>
        <style>
            .avatar-option:hover { transform: translateY(-5px); border-color: #22d3ee !important; background: rgba(34, 211, 238, 0.1) !important; }
            .avatar-option.selected { border-color: #22d3ee !important; background: rgba(34, 211, 238, 0.2) !important; box-shadow: 0 0 20px rgba(34, 211, 238, 0.3); }
        </style>
    `;

    Swal.fire({
        title: '<span style="color: #22d3ee;">Karakterini Özelleştir</span>',
        html: html,
        showConfirmButton: false,
        showCloseButton: true,
        width: 550,
        background: '#0f172a',
        color: '#fff',
        customClass: { popup: 'premium-swal-border' }
    });
}

window.selectAvatar = function(id) {
    const activeUser = (typeof currentUser !== 'undefined' ? currentUser : (localStorage.getItem("sSportUser") || "")).trim();
    if (!activeUser) return;
    
    localStorage.setItem(`comp_avatar_${activeUser}`, id);
    
    Swal.fire({
        title: 'Harika!',
        text: 'Yeni tarzın kaydedildi. Hazırsan sahaya dönelim!',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false,
        background: '#0f172a',
        color: '#fff'
    });
    
    if (typeof renderTelesalesCompetition === 'function') {
        renderTelesalesCompetition();
    }
}

// Takım Bildirimlerini Kontrol Et
async function checkTeamRequests() {
    const { data: requests } = await sb.from('competition_teams')
        .select('*')
        .eq('user_b', currentUser)
        .eq('status', 'pending');

    if (requests && requests.length > 0) {
        const req = requests[0];
        Swal.fire({
            title: 'Takım İstek!',
            text: `${req.user_a} seninle bir takım kurmak istiyor!`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Kabul Et',
            cancelButtonText: 'Reddet',
            background: '#0f172a',
            color: '#fff'
        }).then(async (result) => {
            if (result.isConfirmed) {
                // Takım ismini sor
                const { value: tname } = await Swal.fire({
                    title: 'Takım İsmi Seçin',
                    input: 'text',
                    inputPlaceholder: 'Örn: Satış Canavarları',
                    background: '#020617',
                    color: '#fff'
                });
                
                await sb.from('competition_teams').update({
                    status: 'active',
                    team_name: tname || 'Efsane Takım'
                }).eq('id', req.id);
                
                Swal.fire('Başarılı', 'Takım kuruldu! Artık ortak ilerliyorsunuz.', 'success');
                renderTelesalesCompetition();
            } else {
                await sb.from('competition_teams').delete().eq('id', req.id);
            }
        });
    }
}


async function openTeamPicker() {
    Swal.fire({ title: 'Yükleniyor...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    
    // Aktif kullanıcıyı belirle
    const activeUser = (typeof currentUser !== 'undefined' ? currentUser : (localStorage.getItem("sSportUser") || "")).trim();
    
    console.log("[Arena] Profiller çekiliyor... Aktif Kullanıcı:", activeUser);
    
    const { data: allProfiles, error: pErr } = await sb.from('profiles').select('username, group_name');
    
    if (pErr) {
        console.error("[Arena] Profil çekme hatası:", pErr);
        Swal.fire("Sistem Hatası", "Veritabanına bağlanılamadı: " + pErr.message, "error");
        return;
    }
    
    // Filtreleme
    const telesalesUsers = (allProfiles || []).filter(u => {
        const gn = (u.group_name || "").toLowerCase().trim();
        const un = (u.username || "").trim();
        
        // Sadece 'telesatis' grubundakiler ve kendisi hariç
        return gn === "telesatis" && un.toLowerCase() !== activeUser.toLowerCase() && un !== "";
    }).map(u => u.username);

    console.log("[Arena] Bulunan Buddy Sayısı:", telesalesUsers.length);
    
    if (telesalesUsers.length === 0) {
        console.warn("[Arena] Liste boş! Toplam çekilen kayıt:", allProfiles?.length);
        // Eğer liste tamamen boşsa, hata ayıklama için tüm grubu göster (opsiyonel)
    }

    Swal.close();
    
    let html = `
        <div style="padding:10px;">
            <p style="color:#94a3b8; font-size:0.9rem;">Bir "Telesatış MT" seç ve puanlarınızı birleştirin!</p>
            <select id="buddy-select" class="minimal-select" style="width:100%; margin-top:10px; background:#1e293b; color:#fff; border:1px solid #334155; padding:10px; border-radius:8px;">
                <option value="">Buddy Seçiniz...</option>
                ${telesalesUsers.sort().map(u => `<option value="${u}">${u}</option>`).join('')}
            </select>
        </div>
    `;

    Swal.fire({
        title: 'Takım İstek Gönder',
        html: html,
        showCancelButton: true,
        confirmButtonText: 'İstek Gönder',
        confirmButtonColor: '#10b981',
        cancelButtonText: 'Vazgeç',
        background: '#0f172a',
        color: '#fff',
        preConfirm: () => {
            const buddy = document.getElementById('buddy-select').value;
            if (!buddy) { Swal.showValidationMessage('Lütfen bir buddy seçin!'); return false; }
            return { buddy };
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            await sb.from('competition_teams').delete().or(`user_a.eq.${currentUser},user_b.eq.${currentUser}`);
            await sb.from('competition_teams').insert({
                user_a: currentUser,
                user_b: result.value.buddy,
                status: 'pending'
            });
            Swal.fire('İstek Gönderildi', 'Arkadaşının onaylaması bekleniyor!', 'info');
        }
    });
}

async function syncCompetitionData() {
    try {
        // Veri Diyeti: Sadece gerekli kolonları çek (Egress tasarrufu)
        const configCols = 'id,task_name,steps,order,is_active';
        const moveCols = 'id,user_name,task_id,steps,status,approved_at,admin_note,created_at';
        const teamCols = 'id,user_a,user_b,status';

        const { data: configs, error: e1 } = await sb.from('competition_config').select(configCols);
        if (!e1 && configs) competitionConfig = configs;

        const { data: moves, error: e2 } = await sb.from('competition_moves').select(moveCols).order('created_at', { ascending: false });
        if (!e2 && moves) competitionMoves = moves;

        const { data: teams, error: e3 } = await sb.from('competition_teams').select(teamCols);
        if (!e3 && teams) userTeams = teams;
    } catch (e) {
        console.error("Yarışma verisi çekilemedi:", e);
    }
    
    // Takım isteklerini sessizce kontrol et
    checkTeamRequests();
    
    // Sürpriz kutu durumunu güncelle
    updateSurpriseBoxState();
}

/**
 * Sürpriz kutu yanıp sönme durumunu kontrol et
 */
function updateSurpriseBoxState() {
    const box = document.getElementById('q-arena-surprise-box');
    if (!box) return;

    // Kullanıcının daha önce cevapladığı ID'leri bul
    const answeredIds = competitionMoves
        .filter(m => m.user_name === currentUser && m.admin_note && m.admin_note.includes('[QuizID:'))
        .map(m => {
            const match = m.admin_note.match(/\[QuizID:(\d+)\]/);
            return match ? parseInt(match[1]) : null;
        }).filter(id => id !== null);

    // Kalan soruları bul
    const remainingQuestions = arenaQuizQuestions.filter(q => !answeredIds.includes(q.id));
    
    if (remainingQuestions.length > 0) {
        box.classList.add('active');
        box.title = "Sana bir sürprizim var! Tıkla ve ödülü kap!";
        box.style.display = 'flex';
    } else {
        box.classList.remove('active');
        box.title = "Tüm ödülleri topladın şimdilik!";
        // box.style.display = 'none'; // İstersen tamamen gizleyebiliriz, şimdilik sönsün yeter
    }
}

function renderCompetitionBoard() {
    const container = document.getElementById('q-comp-board');
    if (!container) return;

    const userScores = {};
    competitionMoves.filter(m => m.status === 'approved').forEach(m => {
        userScores[m.user_name] = (userScores[m.user_name] || 0) + (m.steps || 0);
    });

    // 💥 YENİ: DAMAGE & SES HESAPLAYICISI 💥
    window._prevArenaScores = window._prevArenaScores || {};
    let soundToPlay = null;

    const totalStepsArr = 50; 
    let html = `<div class="q-comp-path-container" style="position: relative; width: 1000px; height: 600px;">`;

    // 1. Enerji Yolları (Magical Leylines)
    for (let i = 0; i < totalStepsArr; i++) {
        const r1 = Math.floor(i / 10), c1 = (r1 % 2 === 0) ? (i % 10) : (9 - (i % 10));
        const next = i + 1;
        const r2 = Math.floor(next / 10), c2 = (r2 % 2 === 0) ? (next % 10) : (9 - (next % 10));
        
        // Reverse row vertically: 5 - r
        const vr1 = 5 - r1, vr2 = 5 - r2;

        const x1 = c1 * 100 + 38, y1 = vr1 * 110 + 38;
        const x2 = c2 * 100 + 38, y2 = vr2 * 110 + 38;

        const isHorizontal = vr1 === vr2;
        const width = isHorizontal ? Math.abs(x2 - x1) : 6;
        const height = isHorizontal ? 6 : Math.abs(y2 - y1);
        const top = Math.min(y1, y2);
        const left = Math.min(x1, x2);
        
        html += `
            <div class="q-comp-path-line" style="
                top:${top}px; 
                left:${left}px; 
                width:${width}px; 
                height:${height}px;
                position: absolute;
                z-index: 2;
            "></div>
        `;
    }

    // 2. Kutuları Çiz (Mystic Gemstones)
    const gemClasses = ['gem-ruby', 'gem-sapphire', 'gem-emerald', 'gem-gold', 'gem-amethyst'];
    let grandPrizeText = "Şeref ve Şan!";
    const gpConfig = typeof competitionConfig !== 'undefined' ? competitionConfig.find(c => c.task_name && c.task_name.startsWith('[GRANDPRIZE]')) : null;
    if (gpConfig) {
        grandPrizeText = gpConfig.task_name.replace('[GRANDPRIZE]', '').trim();
    }

    for (let i = 0; i <= totalStepsArr; i++) {
        let typeClass = "";
        let content = i === 0 ? "" : i;
        let extraAttrs = "";
        let extraStyle = "";
        
        if (i === 0) { typeClass = "start"; content = '<i class="fas fa-flag-checkered"></i>'; }
        else if (i === totalStepsArr) { 
            typeClass = "finish"; 
            content = '<i class="fas fa-chess-rook"></i>'; 
            extraAttrs = `onclick="handleGrandPrizeClick()" title="Büyük Ödül!"`;
            extraStyle = "cursor:pointer;";
        }
        else { typeClass = gemClasses[i % gemClasses.length]; }

        const r = Math.floor(i / 10);
        const col = (r % 2 === 0) ? (i % 10) : (9 - (i % 10));
        const row = 5 - r; // Invert rows
        
        const top = row * 110;
        const left = col * 100;

        html += `<div class="q-step-box ${typeClass}" ${extraAttrs} style="position: absolute; top:${top}px; left:${left}px; z-index: 20; ${extraStyle}">${content}</div>`;
    }

    // 3. Kullanıcıları Yerleştir (Orbiting Avatars & Shared Team Progression)
    const processedUsers = new Set();
    
    // Önce Takımları Yerleştir
    userTeams.filter(t => t.status === 'active').forEach((t, tIdx) => {
        const u1 = t.user_a, u2 = t.user_b;
        // TEK VÜCUT MANTIĞI: En gerideki kimse takımın yeri orasıdır!
        const score1 = userScores[u1] || 0;
        const score2 = userScores[u2] || 0;
        const totalSteps = Math.min(Math.min(score1, score2), totalStepsArr);
        
        const r = Math.floor(totalSteps / 10);
        const col = (r % 2 === 0) ? (totalSteps % 10) : (9 - (totalSteps % 10));
        const row = 5 - r;

        const top = row * 110 + 8;
        const left = col * 100 + 8;

        [u1, u2].forEach((uname, sideIdx) => {
            const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || (sideIdx === 0 ? 'm1' : 'f1');
            const avatarData = AVATAR_MAP[avatarId];
            const isCurrent = (uname === currentUser);
            const sideOffset = sideIdx === 0 ? -12 : 12;
            const onFire = check3DayStreak(uname) ? "on-fire" : "";
            
            // Damage / Heal Text
            let damageHtml = "";
            const oldScore = window._prevArenaScores[uname];
            const myScore = userScores[uname] || 0;
            if (oldScore !== undefined && oldScore !== myScore) {
                const diff = myScore - oldScore;
                if (diff !== 0) {
                    if (diff > 0 && !soundToPlay) soundToPlay = 'up';
                    else if (diff < 0 && !soundToPlay) soundToPlay = 'down';
                    damageHtml = `<div class="q-damage-text q-damage-${diff > 0 ? 'up':'down'}" style="top:-30px; left:0px;">${diff > 0 ? '+' : ''}${diff}</div>`;
                }
            }
            
            html += `
                <div class="q-user-avatar-tag ${isCurrent ? 'current-user-marker' : ''} ${onFire}" 
                     title="${escapeHtml(t.team_name)}: ${uname}"
                     style="position: absolute; top:${top}px; left:${left + sideOffset}px; background-color:${avatarData.color}; border-width:3px; width:45px; height:45px; z-index:25;">
                    <i class="fas ${avatarData.icon}" style="font-size:1rem;"></i>
                    ${damageHtml}
                </div>
            `;
            processedUsers.add(uname);
        });
    });

    // Sonra Bireysel Kullanıcıları Yerleştir
    Object.keys(userScores).forEach((uname, idx) => {
        if (processedUsers.has(uname)) return;

        const score = Math.min(userScores[uname], totalStepsArr);
        const r = Math.floor(score / 10);
        const col = (r % 2 === 0) ? (score % 10) : (9 - (score % 10));
        const row = 5 - r;
        
        const top = row * 110 + 8; 
        const left = col * 100 + 8;
        
        const isCurrent = (uname === currentUser);
        const markerClass = isCurrent ? "current-user-marker" : "";
        const dispName = (uname || '??').substring(0, 2).toUpperCase();
        const onFire = check3DayStreak(uname) ? "on-fire" : "";
        
        // Damage / Heal Text
        let damageHtml = "";
        const oldScore = window._prevArenaScores[uname];
        const myScore = userScores[uname] || 0;
        if (oldScore !== undefined && oldScore !== myScore) {
            const diff = myScore - oldScore;
            if (diff !== 0) {
                if (diff > 0 && !soundToPlay) soundToPlay = 'up';
                else if (diff < 0 && !soundToPlay) soundToPlay = 'down';
                damageHtml = `<div class="q-damage-text q-damage-${diff > 0 ? 'up':'down'}" style="top:-30px; left:5px;">${diff > 0 ? '+' : ''}${diff}</div>`;
            }
        }
        
        const userAvatarId = localStorage.getItem(`comp_avatar_${uname}`) || (idx % 2 === 0 ? 'm1' : 'f1');
        const avatarData = AVATAR_MAP[userAvatarId];
        const randomColor = avatarData.color;
        const avatarStyle = isCurrent ? `background: linear-gradient(135deg, ${randomColor}, #000); border-color: #fff;` : `background-color: ${randomColor};`;

        html += `
            <div class="q-user-avatar-tag ${markerClass} ${onFire}" title="${escapeHtml(uname)} (${score}. Adım)" style="position: absolute; top:${top}px; left:${left}px; ${avatarStyle} z-index: 25;">
                <i class="fas ${avatarData.icon}" style="font-size:1.2rem; margin-bottom:2px;"></i>
                <div style="font-size:0.6rem; font-weight:900; opacity:0.8;">${dispName}</div>
                ${damageHtml}
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
    container.classList.add('loaded'); // Tetikleme animasyonu

    // Belleği yenile & Ses tetiklemesi
    window._prevArenaScores = { ...userScores };
    if (soundToPlay) {
        setTimeout(() => playArenaSound(soundToPlay), 150); // Ekrana çizilirken sesi yedir
    }

    // Liderlik ve Geçmiş
    renderCompetitionLeaderboard();
    if(typeof renderMyRecentTasks === 'function') renderMyRecentTasks();

    // 🏆 Özel Bonus Kutusu Kontrolü (Floating Widget) - En sonda çalışmalı
    if (typeof window.a2UpdateFloatingBonusUI === 'function') window.a2UpdateFloatingBonusUI();

    // Sadece "Satış Serüveni" ekranı açıkken popup/animasyon çıksın
    const telesalesScreen = document.getElementById('telesales-fullscreen');
    const compView = document.getElementById('t-view-competition');
    const isArenaActive = telesalesScreen && telesalesScreen.style.display !== 'none' && compView && compView.classList.contains('active');

    if (isArenaActive) {
        // 🏆 CEZA ANIMASYONU KONTROLÜ 🏆
        const recentPenalties = competitionMoves.filter(m => m.user_name === currentUser && m.steps < 0 && m.admin_note && m.admin_note.includes('[CEZA]'));
        if (recentPenalties.length > 0) {
            const lastPenalty = recentPenalties[recentPenalties.length - 1];
            if (localStorage.getItem('last_seen_penalty') !== String(lastPenalty.id)) {
                localStorage.setItem('last_seen_penalty', lastPenalty.id);
                Swal.fire({
                    title: '⚡ EYVAH, CEZA ALDIN! ⚡',
                    html: `Admin tarafından uyarılıp <b>GERİ KUTULARA</b> fırlatıldın!<br><br><b>Sebep:</b> <i style="color:#fabb00;">${escapeHtml(lastPenalty.admin_note.replace('[CEZA]', '').trim())}</i>`,
                    backdrop: `rgba(0,0,0,0.8) url("https://media.giphy.com/media/xT1XGzgkBTXJp0c1tO/giphy.gif") center center no-repeat`,
                    background: '#0f172a',
                    color: '#fff',
                    confirmButtonColor: '#ef4444',
                    confirmButtonText: 'Tamam, dikkat edeceğim...',
                });
            }
        }

        // 🏆 OYUN BİTİŞ KONTROLÜ (ZİRVE: 50. ADIM) 🏆
        checkArenaWinners(userScores);
    }
}

/**
 * 50. Adıma ulaşan şampiyonu ilan et
 */
function checkArenaWinners(userScores) {
    const WINNING_STEP = 50;
    const winners = [];

    // 1. Önce takımları kontrol et (Tek Vücut: İkisi de 50 olmalı)
    userTeams.filter(t => t.status === 'active').forEach(t => {
        const u1 = t.user_a, u2 = t.user_b;
        const score1 = userScores[u1] || 0;
        const score2 = userScores[u2] || 0;
        const teamScore = Math.min(score1, score2); // Tek Vücut mantığı
        
        if (teamScore >= WINNING_STEP) {
            winners.push({ type: 'team', name: t.team_name, members: [u1, u2] });
        }
    });

    // 2. Takımda olmayan bireysel kazananları bul
    const teamMembers = new Set();
    userTeams.filter(t => t.status === 'active').forEach(t => { teamMembers.add(t.user_a); teamMembers.add(t.user_b); });

    Object.entries(userScores).forEach(([uname, score]) => {
        if (!teamMembers.has(uname) && score >= WINNING_STEP) {
            winners.push({ type: 'solo', name: uname });
        }
    });

    // Kazanan varsa (ve henüz o oturumda ilan edilmediyse) duyur!
    if (winners.length > 0 && !window.arenaWinnerAnnounced) {
        window.arenaWinnerAnnounced = true; // Spam engelleme
        
        let winText = "";
        winners.forEach(w => {
            if (w.type === 'team') {
                winText += `Durdurulamaz İkili: <b style="color:#fabb00;">${escapeHtml(w.name)} (${w.members.join(' & ')})</b><br>`;
            } else {
                winText += `Yalnız Kurt: <b style="color:#00f2ff;">${escapeHtml(w.name)}</b><br>`;
            }
        });

        Swal.fire({
            title: '🎉 ZİRVEYE ULAŞILDI! 🎉',
            html: `
                <div style="font-size:1.1rem; margin-bottom:15px; text-shadow:0 0 10px rgba(250,187,0,0.5);">ARENANIN ŞAMPİYONLARI:</div>
                ${winText}
                <div style="margin-top:20px; font-size:0.9rem; color:#aaa;">Oyun şimdilik sona erdi! Admin yeni sezonu başlatana kadar kutlamaların tadını çıkarın! 🏰</div>
            `,
            iconHtml: '🏆',
            customClass: { icon: 'no-border-icon' },
            background: 'linear-gradient(135deg, #0e1b42 0%, #1e1b4b 100%)',
            color: '#fff',
            confirmButtonColor: '#fabb00',
            confirmButtonText: 'Kutlamaya Katıl',
            backdrop: `rgba(0,0,0,0.8) url("https://media.giphy.com/media/l41lOlmIQ1QvXAvrG/giphy.gif") center top no-repeat` // Konfeti efekti
        });
    }
}

// 🏆 BÜYÜK ÖDÜL TIKLAMA İŞLEMİ (ZİRVE KUTUSU) 🏆
window.handleGrandPrizeClick = async function() {
    const isActuallyAdmin = (isAdminMode || isLocAdmin);
    let currentPrize = "Şans & Gurur!";
    let gpConfig = typeof competitionConfig !== 'undefined' ? competitionConfig.find(c => c.task_name && c.task_name.startsWith('[GRANDPRIZE]')) : null;
    
    if (gpConfig) {
        currentPrize = gpConfig.task_name.replace('[GRANDPRIZE]', '').trim();
    }

    if (isActuallyAdmin) {
        // Admin: Ödül Belirle
        const { value: prizeText } = await Swal.fire({
            title: '🏆 Şampiyonun Ödülü',
            input: 'text',
            inputLabel: '50. Adıma ulaşanlara verilecek büyük ödülü yazın:',
            inputValue: currentPrize === "Şans & Gurur!" ? "" : currentPrize,
            showCancelButton: true,
            confirmButtonText: 'Ödülü Mühürle',
            cancelButtonText: 'İptal',
            background: '#0f172a',
            color: '#fff',
            confirmButtonColor: '#fabb00'
        });

        if (prizeText !== undefined) {
            Swal.showLoading();
            const finalP = prizeText.trim() === "" ? "Şeref ve Şan!" : prizeText.trim();
            const formattedName = `[GRANDPRIZE] ${finalP}`;

            if (gpConfig) {
                // Güncelle
                await sb.from('competition_config').update({ task_name: formattedName }).eq('id', gpConfig.id);
            } else {
                // Yeni Kayıt
                await sb.from('competition_config').insert({ task_name: formattedName, steps: 0 });
            }
            
            Swal.close();
            await renderTelesalesCompetition();
            Swal.fire({
                title: 'Mühür Vuruldu!',
                text: `Savaşçılar artık "${finalP}" için ter dökecek!`,
                icon: 'success',
                timer: 2000,
                showConfirmButton: false,
                background: '#0f172a', color: '#fff'
            });
        }
    } else {
        // Temsilci: Sadece Gör
        Swal.fire({
            title: '🏆 ZİRVEDEKİ ÖDÜL 🏆',
            html: `<div style="font-size:1.5rem; color:#fabb00; margin-top:15px; text-shadow:0 0 10px rgba(250,187,0,0.5);">${escapeHtml(currentPrize)}</div>
                   <div style="font-size:0.9rem; color:#aaa; margin-top:20px;">50. adıma ilk ulaşan bu efsanevi ödülün sahibi olacak!</div>`,
            iconHtml: '<i class="fas fa-chess-rook" style="font-size:3rem; color:#fff;"></i>',
            customClass: { icon: 'no-border-icon' },
            background: 'linear-gradient(135deg, #0e1b42 0%, #1e1b4b 100%)',
            color: '#fff',
            confirmButtonColor: '#00f2ff',
            confirmButtonText: 'Zirvede Görüşürüz!',
            backdrop: `rgba(0,0,0,0.8)`
        });
    }
}

/**
 * Ödül Sorusu (Hazine Kutusu) Ekleme Paneli
 * Supabase: 'Data' tablosuna 'Type: quiz' olarak yazar.
 */
async function openQuizAddModal() {
    const { value: formValues } = await Swal.fire({
        title: '🎁 Ödül Sorusu Ekle',
        html: `
            <div style="text-align:left; gap:10px; display:flex; flex-direction:column;">
                <label style="font-weight:bold; color:#fff;">Soru Metni</label>
                <textarea id="swal-quiz-q" class="swal2-textarea" style="margin:0; width:100%; height:80px; font-size:0.9rem;" placeholder="Hazineyi almak için ne sormak istersin?"></textarea>
                
                <label style="font-weight:bold; color:#fff;">Seçenekler (En az 2 şık, virgülle ayır)</label>
                <input id="swal-quiz-opts" class="swal2-input" style="margin:0; width:100%; height:40px; font-size:0.9rem;" placeholder="Örn: 200 TL, Sürpriz Hediye, Pas">
                
                <label style="font-weight:bold; color:#fff;">Doğru Cevap Sırası (0'dan başlar)</label>
                <input id="swal-quiz-ans" type="number" class="swal2-input" style="margin:0; width:100%; height:40px; font-size:0.9rem;" placeholder="0 (1. seçenek), 1 (2. seçenek)..." min="0">
                
                <p style="font-size:0.8rem; color:#94a3b8; margin-top:10px;">
                    <i class="fas fa-database"></i> Veriler Supabase içindeki <b>'Data'</b> tablosuna <b>Type: 'quiz'</b> olarak kaydedilir. Ödül miktarı Ayarlar'dan (Günün Sorusu) alınır.
                </p>
            </div>
        `,
        background: '#0f172a',
        color: '#fff',
        confirmButtonText: '<i class="fas fa-save"></i> Kaydet ve Kutuya Koy',
        showCancelButton: true,
        cancelButtonText: 'Vazgeç',
        focusConfirm: false,
        preConfirm: () => {
            const q = document.getElementById('swal-quiz-q').value.trim();
            const opts = document.getElementById('swal-quiz-opts').value.trim();
            const ans = document.getElementById('swal-quiz-ans').value.trim();

            if (!q || !opts || ans === '') {
                Swal.showValidationMessage('Lütfen tüm alanları doldur kanka!');
                return false;
            }

            return { text: q, options: opts, answer: ans };
        }
    });

    if (formValues) {
        try {
            Swal.fire({ title: 'Hazine Hazırlanıyor...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
            
            const payload = {
                Type: 'quiz',
                Text: formValues.text,
                QuizOptions: formValues.options,
                QuizAnswer: Math.max(0, parseInt(formValues.answer)),
                Category: 'Arena Ödül',
                Title: 'Hazine Kutusu Sorusu',
                Date: new Date().toISOString()
            };

            const { error } = await sb.from('Data').insert([payload]);
            if (error) throw error;

            Swal.fire({ icon: 'success', title: 'Hazine Gizlendi!', text: 'Yeni ödül sorusu haritadaki kutulara eklendi.', background: '#0f172a', color: '#fff' });
            
            // Veriyi yerelde güncelle
            setTimeout(() => { if (typeof syncCompetitionData === 'function') syncCompetitionData(); }, 1000);
            
        } catch (err) {
            console.error("Quiz Add Error:", err);
            Swal.fire({ icon: 'error', title: 'Hata!', text: 'Soru eklenirken bir sorun oluştu: ' + err.message });
        }
    }
}

/**
 * Sürpriz Kutuyu Aç ve Soruyu Sor
 */
async function openSurpriseQuiz() {
    // 1. Cevaplananları filtrele (Daha önce bildiği soruyu bir daha görmesin)
    const answeredIds = competitionMoves
        .filter(m => m.user_name === currentUser && m.admin_note && m.admin_note.includes('[QuizID:'))
        .map(m => {
            const match = m.admin_note.match(/\[QuizID:(\d+)\]/);
            return match ? parseInt(match[1]) : null;
        }).filter(id => id !== null);

    const availableQuestions = arenaQuizQuestions.filter(q => !answeredIds.includes(q.id));

    if (availableQuestions.length === 0) {
        Swal.fire({ icon: 'info', title: 'Hepsini Bildin!', text: 'Şu anki tüm sürpriz ödülleri topladın kanka. Yenileri eklenince haber veririm!', background: '#0f172a', color: '#fff' });
        return;
    }

    // Rastgele bir soru seç (kalanlardan)
    const qIndex = Math.floor(Math.random() * availableQuestions.length);
    const quiz = availableQuestions[qIndex];

    const { value: answer } = await Swal.fire({
        title: '🌟 Sürpriz Ödül Sorusu!',
        text: quiz.q,
        input: 'radio',
        inputOptions: quiz.opts.reduce((acc, curr, idx) => ({ ...acc, [idx]: curr }), {}),
        inputValidator: (value) => { if (!value) return 'Bir seçenek seçmelisin kanka!'; },
        confirmButtonText: 'Cevapla',
        background: '#0f172a',
        color: '#fff',
        showCancelButton: true,
        cancelButtonText: 'Kapat',
        customClass: { input: 'q-swal-radio-group' }
    });

    if (answer !== undefined) {
        if (parseInt(answer) === quiz.a) {
            // Ödül miktarını Ayarlar'dan (Günün Sorusu) çek
            const quizCfg = competitionConfig.find(c => c.task_name === 'Günün Sorusu');
            const stepsToWin = quizCfg ? parseInt(quizCfg.steps) : 2;
            const taskId = quizCfg ? quizCfg.id : null;

            // TAKIM DURUMUNU KONTROL ET
            const myTeam = userTeams.find(t => (t.user_a === currentUser || t.user_b === currentUser) && t.status === 'active');
            
            if (myTeam) {
                const partner = myTeam.user_a === currentUser ? myTeam.user_b : myTeam.user_a;
                
                // Ortağım bildi mi?
                const partnerMvs = competitionMoves.filter(m => m.user_name === partner && m.admin_note && m.admin_note.includes(`[QuizID:${quiz.id}]`));
                const partnerKnown = partnerMvs.length > 0;

                if (partnerKnown) {
                    // 🎉 TAKIMIN TAMAMI BİLDİ! HER İKİSİNE DE ADIM VER!
                    Swal.fire({
                        icon: 'success',
                        title: 'TAKIM RUHU! 🛡️',
                        text: `Ortağın da bilmişti! Her ikinize de ${stepsToWin} ADIM eklendi! Beraber ilerliyorsunuz!`,
                        background: '#0f172a', color: '#fff', timer: 4500
                    });

                    // 1. Kendi hareketini kaydet
                    await sb.from('competition_moves').insert([{
                        user_name: currentUser, steps: stepsToWin, task_id: taskId,
                        admin_note: `[QuizID:${quiz.id}] TAKIM TAMAMLANDI`,
                        status: 'approved', approved_at: new Date().toISOString(), created_at: new Date().toISOString()
                    }]);

                    // 2. Ortağa da farkı eklemek
                    await sb.from('competition_moves').insert([{
                        user_name: partner, steps: stepsToWin, task_id: taskId,
                        admin_note: `[QuizID:${quiz.id}] Partner Tamamladı Ödülü`,
                        status: 'approved', approved_at: new Date().toISOString(), created_at: new Date().toISOString()
                    }]);

                } else {
                    // ⏳ BEKLETME: Tek vücut için ortağın da bilmesi lazım
                    Swal.fire({
                        icon: 'info', title: 'Harikasın! 👍',
                        text: `Sen bildin ama takımın ilerlemesi için ortağın ${partner}'in de bilmesi lazım!`,
                        background: '#0f172a', color: '#fff'
                    });

                    // Soruyu bildiğini kaydet ama 0 adım ver (Partneri bekliyor)
                    await sb.from('competition_moves').insert([{
                        user_name: currentUser, steps: 0, task_id: taskId,
                        admin_note: `[QuizID:${quiz.id}] Beklemede (Bireysel Bildi)`,
                        status: 'approved', approved_at: new Date().toISOString(), created_at: new Date().toISOString()
                    }]);
                }
            } else {
                // 🐺 BİREYSEL OYUN
                Swal.fire({ icon: 'success', title: 'TEBRİKLER! 🎉', text: `Hazineyi açtın! Tam ${stepsToWin} ADIM ilerliyorsun!`, background: '#0f172a', color: '#fff', timer: 3000 });
                await sb.from('competition_moves').insert([{
                    user_name: currentUser, steps: stepsToWin, task_id: taskId,
                    admin_note: `[QuizID:${quiz.id}] Bireysel Ödül`,
                    status: 'approved', approved_at: new Date().toISOString(), created_at: new Date().toISOString()
                }]);
            }
            
            await syncCompetitionData();
            if (typeof renderCompetitionBoard === 'function') renderCompetitionBoard();

        } else {
            Swal.fire({ icon: 'error', title: 'Olamaz!', text: 'Cevap yanlış çıktı, hazineyi kaçırdın. 😢', background: '#0f172a', color: '#fff' });
        }
    }
}

function renderCompetitionLeaderboard() {
    const list = document.getElementById('q-comp-leaderboard');
    if (!list) return;

    const userScores = {};
    competitionMoves.filter(m => m.status === 'approved').forEach(m => {
        userScores[m.user_name] = (userScores[m.user_name] || 0) + (m.steps || 0);
    });

    const teamScores = {};
    const processedUsers = new Set();

    userTeams.forEach(t => {
        const scoreA = userScores[t.user_name_a] || 0; // SQL table might use user_a/user_b
        const scoreB = userScores[t.user_name_b] || 0; 
        // Sync with my previous pseudo-SQL: user_a/user_b
    });

    // Let's rewrite the leaderboard to show teams first if they exist
    const finalLeaderboard = [];
    const pairedUsers = new Set();

    userTeams.forEach(t => {
        const u1 = t.user_a, u2 = t.user_b;
        const s1 = userScores[u1] || 0;
        const s2 = userScores[u2] || 0;
        // TEK VÜCUT: En gerideki kimse puan o kadardır!
        const unifiedScore = Math.min(s1, s2);
        
        finalLeaderboard.push({ 
            name: `${t.team_name} (${u1} & ${u2})`, 
            score: unifiedScore, 
            isTeam: true 
        });
        pairedUsers.add(u1); pairedUsers.add(u2);
    });

    Object.entries(userScores).forEach(([uname, score]) => {
        if (!pairedUsers.has(uname)) {
            finalLeaderboard.push({ name: uname, score: score, isTeam: false });
        }
    });

    const sorted = finalLeaderboard
        .sort((a,b) => b.score - a.score)
        .slice(0, 8);

    if (sorted.length === 0) {
        list.innerHTML = `<div style="padding:10px; color:#94a3b8; font-size:0.8rem;">Veri yok.</div>`;
        return;
    }

    list.innerHTML = sorted.map((entry, idx) => `
        <div class="q-leader-item ${idx === 0 ? 'q-rank-1' : ''} ${entry.isTeam ? 'q-team-item' : ''}">
            <div style="font-weight:900; opacity:0.6;">#${idx+1}</div>
            <div style="flex:1;">
                <div style="font-weight:700; color:#fff; font-size:0.85rem;">${escapeHtml(entry.name)}</div>
                <div style="font-size:0.75rem; color:${entry.isTeam ? '#10b981' : '#00f2ff'};">${entry.score} Adım</div>
            </div>
            ${idx === 0 ? '<i class="fas fa-crown" style="font-size:1.1rem;"></i>' : (entry.isTeam ? '<i class="fas fa-users-crown"></i>' : '')}
        </div>
    `).join('');
}

function renderMyRecentTasks() {
    const history = document.getElementById('q-comp-my-tasks');
    if (!history) return;

    const myMoves = competitionMoves.filter(m => m.user_name === currentUser).slice(0, 8);

    if (myMoves.length === 0) {
        history.innerHTML = `<div style="padding:10px; color:#94a3b8; font-size:0.8rem;">Henüz kayıt yok.</div>`;
        return;
    }

    history.innerHTML = myMoves.map(m => {
        const config = competitionConfig.find(c => String(c.id) === String(m.task_id));
        const note = String(m.admin_note || '');
        const isArena2 = note.includes('[ARENA2]');
        const boxNo = isArena2 ? (note.match(/\[BOX:(\d+)\]/) || [])[1] : null;

        // Admin notunu çıkar
        let adminNoteText = '';
        const adminNoteMatch = note.match(/\[ADMIN_NOTE:([^\]]+)\]/);
        if (adminNoteMatch) adminNoteText = adminNoteMatch[1];
        // Alternatif: eski format (CEZA, PENALTY_NOTE)
        const penaltyMatch = note.match(/\[PENALTY_NOTE:([^\]]+)\]/);
        if (!adminNoteText && penaltyMatch) adminNoteText = penaltyMatch[1];
        if (!adminNoteText && note.startsWith('[CEZA]')) adminNoteText = note.replace('[CEZA]', '').replace(/\[[^\]]+\]/g, '').trim();

        // Görev adı
        let taskName = 'Görev';
        if (isArena2 && boxNo) {
            taskName = `${boxNo}. Kutu Görevi`;
        } else if (m.task_id) {
            const cfg = competitionConfig.find(c => String(c.id) === String(m.task_id));
            if (cfg) taskName = cfg.task_name;
        }

        const statusLabel = m.status === 'approved' ? 'ONAYLANDI' : (m.status === 'rejected' ? 'REDDEDİLDİ' : 'ONAY BEKLİYOR');
        const statusColor = m.status === 'approved' ? '#10b981' : (m.status === 'rejected' ? '#ef4444' : '#fbbf24');
        const statusIcon = m.status === 'approved' ? '✓' : (m.status === 'rejected' ? '✗' : '⏳');

        const noteHtml = adminNoteText ? `
            <div class="a2-admin-note-bubble ${m.status === 'approved' ? 'approved-note' : (m.status === 'rejected' ? 'rejected-note' : '')}">
                <i class="fas fa-comment-alt"></i>
                <span><b>Yönetici Notu:</b> ${escapeHtml(adminNoteText)}</span>
            </div>` : '';

        return `
            <div class="q-history-item" style="border-left: 3px solid ${statusColor}; padding-left:8px; margin-bottom:6px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:4px;">
                    <div style="color:#fff; font-weight:700; font-size:0.80rem; line-height:1.25; flex:1;">${escapeHtml(taskName)}</div>
                    <span style="color:${statusColor}; font-weight:900; font-size:0.68rem; white-space:nowrap;">${statusIcon} ${statusLabel}</span>
                </div>
                ${noteHtml}
                <div style="margin-top:4px; font-size:0.68rem; color:#64748b;">${new Date(m.created_at || 0).toLocaleDateString('tr-TR', {day:'2-digit',month:'2-digit'})}</div>
            </div>
        `;
    }).join('');
}

async function openNewTaskModal() {
    if (competitionConfig.length === 0) await syncCompetitionData();

    const options = {};
    competitionConfig.forEach(c => {
        if (c.task_name !== 'Günün Sorusu' && !c.task_name.startsWith('[GRANDPRIZE]')) {
            options[c.id] = c.task_name + ` (+${c.steps} Adım)`;
        }
    });

    const { value: taskId } = await Swal.fire({
        title: 'Görev Bildir',
        input: 'select',
        inputOptions: options,
        inputPlaceholder: 'Tamamladığın görevi seç...',
        showCancelButton: true,
        confirmButtonColor: '#0e1b42',
        confirmButtonText: 'Bildir',
        cancelButtonText: 'Vazgeç'
    });

        if (taskId) {
            const config = competitionConfig.find(c => String(c.id) === String(taskId));
            if (!config) return;

            try {
                const { error } = await sb.from('competition_moves').insert({
                    user_name: currentUser,
                    task_id: config.id,
                    steps: config.steps,
                    status: 'pending'
                });

                if (error) throw error;
                
                // TAKIM MANTIĞI: Badiye göre mesajı özelleştir
                const myTeam = userTeams.find(t => (t.user_a === currentUser || t.user_b === currentUser) && t.status === 'active');
                if (myTeam) {
                    const partner = myTeam.user_a === currentUser ? myTeam.user_b : myTeam.user_a;
                    Swal.fire({
                        icon: 'success',
                        title: 'Görev Bildirildi!',
                        text: `Harikasın! Senin görevin kaydedildi. "Tek Vücut" kuralı gereği, ortağın ${partner} de görevini tamamlayıp arayı kapatınca haritada beraber ilerleyeceksiniz! 🤝`,
                        background: '#0f172a',
                        color: '#fff'
                    });
                } else {
                    Swal.fire('Başarılı!', 'Göreviniz onay için gönderildi.', 'success');
                }

                await syncCompetitionData();
                renderTelesalesCompetition();
            } catch (e) {
                Swal.fire('Hata!', 'Kayıt yapılamadı: ' + e.message, 'error');
            }
        }
}

async function openAdminCompPanel() {
    // Bekleyen talepleri çek
    const { data, error } = await sb.from('competition_moves').select('*, competition_config(task_name)').eq('status', 'pending');
    if (error) return;

    let html = `
        <div style="max-height:400px; overflow-y:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                    <tr style="text-align:left; border-bottom:2px solid #eee;">
                        <th style="padding:10px;">Personel</th>
                        <th style="padding:10px;">Görev</th>
                        <th style="padding:10px;">Adım</th>
                        <th style="padding:10px;">İşlem</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(m => `
                        <tr style="border-bottom:1px solid #eee;">
                            <td style="padding:10px;">${m.user_name}</td>
                            <td style="padding:10px;">${m.competition_config?.task_name || 'Silinmiş Görev'}</td>
                            <td style="padding:10px;">${m.steps}</td>
                            <td style="padding:10px; display:flex; gap:5px;">
                                <button onclick="handleMoveAction(${m.id}, 'approved')" class="x-btn x-btn-primary" style="padding:5px 10px; font-size:0.7rem; background:#10b981;">Onayla</button>
                                <button onclick="handleMoveAction(${m.id}, 'rejected')" class="x-btn" style="padding:5px 10px; font-size:0.7rem; background:#ef4444; color:white;">Reddet</button>
                                <button onclick="handleMoveAction(${m.id}, 'penalty')" class="x-btn" title="3 Adım Geri At" style="padding:5px 10px; font-size:0.7rem; background:#7f1d1d; color:white;"><i class="fas fa-undo"></i> Ceza</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ${data.length === 0 ? '<p style="text-align:center; padding:20px;">Bekleyen talep yok.</p>' : ''}
        </div>
    `;

    Swal.fire({
        title: 'Yarışma Onay Paneli',
        html: html,
        width: 600,
        showConfirmButton: false,
        showCloseButton: true
    });
}

// Global scope
window.handleMoveAction = async function(id, status) {
    let reasonText = "";
    if (status === 'rejected' || status === 'penalty') {
        const { value: text } = await Swal.fire({
            title: status === 'penalty' ? 'Ceza Sebebi Nedir?' : 'Neden Reddediyorsun?',
            input: 'textarea',
            inputPlaceholder: 'Oyuncu bu yazdığını görecek...',
            showCancelButton: true,
            confirmButtonText: 'Gönder',
            cancelButtonText: 'Vazgeç',
            background: '#0f172a',
            color: '#fff'
        });
        if (!text) return; // İptal ettiyse veya boş bıraktıysa çık
        reasonText = text;
    }
    
    Swal.showLoading();
    
    // Eğer ceza ise
    if (status === 'penalty') {
        // Mevcut move'u reddet olarak işaretle ve admin notunu yaz
        const { error: updErr } = await sb.from('competition_moves').update({ 
            status: 'rejected', 
            admin_note: `[CEZA] ${reasonText}` 
        }).eq('id', id);
        
        if (updErr) {
            Swal.fire('Hata', 'Güncelleme engellendi (RLS Policies): ' + updErr.message, 'error');
            return;
        }
        
        // Cezalı yeni bir hareket ekle (3 adım geri)
        const moveData = (await sb.from('competition_moves').select('*').eq('id', id).single()).data;
        if (moveData) {
            const { error: insErr } = await sb.from('competition_moves').insert({
                user_name: moveData.user_name,
                task_id: moveData.task_id,
                steps: -3,
                status: 'approved',
                approved_at: new Date(),
                admin_note: `[CEZA] ${reasonText}`
            });
            if (insErr) {
                Swal.fire('Hata', 'Ceza eklenemedi: ' + insErr.message, 'error');
                return;
            }
        }
    } else {
        // Arena 2.0 koruması: Mevcut notu çek ve etiketleri koru
        const { data: existingMove } = await sb.from('competition_moves').select('admin_note').eq('id', id).single();
        let finalNote = reasonText || null;
        
        if (existingMove?.admin_note && String(existingMove.admin_note).includes('[ARENA2]')) {
            const oldNote = String(existingMove.admin_note);
            if (reasonText) {
                // Eğer admin bir sebep yazdıysa, mevcut ARENA etiketlerinin sonuna ekle veya DESC'i güncelle
                if (oldNote.includes('[DESC:')) {
                    finalNote = oldNote.replace(/\[DESC:[^\]]*\]/, `[DESC:${reasonText.slice(0, 100)}]`);
                } else {
                    finalNote = oldNote + ` [ADMIN_NOTE: ${reasonText}]`;
                }
            } else {
                finalNote = oldNote;
            }
        }

        const { error: updErr } = await sb.from('competition_moves').update({ 
            status: status,
            admin_note: finalNote,
            approved_at: new Date() 
        }).eq('id', id);

        if (updErr) {
            Swal.fire('Hata', 'İşlem engellendi (RLS Policies veya Yetki): ' + updErr.message, 'error');
            return;
        }
    }
    
    Swal.close();
    await renderTelesalesCompetition();
    if (status === 'penalty') {
        Swal.fire({
            title: 'CEZA VERİLDİ!',
            text: 'Temsilci 3 adım geri fırlatıldı! 💥',
            icon: 'error',
            timer: 2000,
            showConfirmButton: false
        });
    }
};

window.openNewTaskModal = openNewTaskModal;
window.openAdminCompPanel = openAdminCompPanel;
window.renderTelesalesCompetition = renderTelesalesCompetition;

async function openAdminConfigPanel() {
    await syncCompetitionData();

    let html = `
        <div style="max-height:450px; overflow-y:auto; padding:5px;">
            <div style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                <h4 style="margin:0;">Görev Tanımları</h4>
                <button onclick="addNewTaskType()" class="x-btn x-btn-primary" style="padding:5px 10px; font-size:0.75rem;"><i class="fas fa-plus"></i> Yeni Ekle</button>
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead style="background:#f8fafc; position:sticky; top:0; z-index:1;">
                    <tr>
                        <th style="padding:10px; text-align:left;">Görev Adı</th>
                        <th style="padding:10px; text-align:center;">Adım</th>
                        <th style="padding:10px; text-align:right;">İşlem</th>
                    </tr>
                </thead>
                <tbody>
                    ${competitionConfig.map(c => `
                        <tr style="border-bottom:1px solid #eee;">
                            <td style="padding:10px;">${escapeHtml(c.task_name)}</td>
                            <td style="padding:10px; text-align:center; font-weight:700;">${c.steps}</td>
                            <td style="padding:10px; text-align:right; display:flex; gap:5px; justify-content:flex-end;">
                                <button onclick="editTaskType(${c.id})" class="x-btn" style="padding:4px 8px; font-size:0.7rem; background:#64748b; color:white;"><i class="fas fa-edit"></i></button>
                                <button onclick="deleteTaskType(${c.id})" class="x-btn" style="padding:4px 8px; font-size:0.7rem; background:#ef4444; color:white;"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            <div style="margin-top:20px; padding-top:15px; border-top:2px dashed #eee;">
                <h4 style="margin:0 0 10px 0; color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Tehlikeli Bölge (Yönetici)</h4>
                <div style="display:flex; gap:10px;">
                    <button onclick="resetArenaGame()" class="x-btn" style="flex:1; background:#ef4444; color:white; padding:10px; font-weight:700;">
                        <i class="fas fa-undo"></i> OYUNU SIFIRLA (ADIMLAR)
                    </button>
                    <button onclick="deleteAllTeams()" class="x-btn" style="flex:1; background:#475569; color:white; padding:10px; font-weight:700;">
                        <i class="fas fa-user-slash"></i> TAKIMLARI SİL
                    </button>
                </div>
                <p style="font-size:0.7rem; color:#64748b; margin-top:8px;">* Sıfırlama işlemi tüm harita ilerlemelerini siler, geri alınamaz!</p>
            </div>
        </div>
    `;

    Swal.fire({
        title: 'Yarışma Genel Ayarları',
        html: html,
        width: 600,
        showConfirmButton: false,
        showCloseButton: true
    });
}
/**
 * OYUNU SIFIRLA: Tüm hareketleri (adımları) temizle
 */
window.resetArenaGame = async function() {
    const { isConfirmed } = await Swal.fire({
        title: 'OYUNU SIFIRLA?',
        text: "Tüm temsilcilerin adımları silinecek ve harita başına dönecekler. Bu işlem geri alınamaz!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Evet, Sıfırla!',
        cancelButtonText: 'Vazgeç',
        background: '#0f172a',
        color: '#fff'
    });

    if (isConfirmed) {
        Swal.showLoading();
        try {
            // UUID hata riski için 'id' yerine string bir alan üzerinden filtreliyoruz
            const { error } = await sb.from('competition_moves').delete().neq('user_name', '___NON_EXISTENT___'); 
            if (error) throw error;
            
            await syncCompetitionData();
            renderTelesalesCompetition();
            Swal.fire({ icon: 'success', title: 'Sıfırlandı!', text: 'Harita tertemiz, herkes başlangıçta!', timer: 2000 });
        } catch (err) {
            console.error("Reset Error:", err);
            Swal.fire('Hata', err.message, 'error');
        }
    }
};

/**
 * TAKIMLARI SİL: Tüm kurulan buddy bağlantılarını temizle
 */
window.deleteAllTeams = async function() {
    const { isConfirmed } = await Swal.fire({
        title: 'TAKIMLAR SİLİNSİN Mİ?',
        text: "Tüm buddy eşleşmeleri silinecek. Temsilciler tekrar takım kurmak zorunda kalacak!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#475569',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Evet, Takımları Dağıt!',
        cancelButtonText: 'Vazgeç',
        background: '#0f172a',
        color: '#fff'
    });

    if (isConfirmed) {
        Swal.showLoading();
        try {
            // UUID hata riski için 'id' yerine string bir alan üzerinden filtreliyoruz
            const { error } = await sb.from('competition_teams').delete().neq('user_a', '___NON_EXISTENT___');
            if (error) throw error;
            
            await syncCompetitionData();
            renderTelesalesCompetition();
            Swal.fire({ icon: 'success', title: 'Dağıtıldı!', text: 'Tüm takımlar silindi.', timer: 2000 });
        } catch (err) {
            console.error("Delete Teams Error:", err);
            Swal.fire('Hata', err.message, 'error');
        }
    }
};

window.addNewTaskType = async function() {
    const { value: formValues } = await Swal.fire({
        title: 'Yeni Görev Tipi Ekle',
        html:
            '<input id="swal-input1" class="swal2-input" placeholder="Görev Adı (örn: Yıllık Satış)">' +
            '<input id="swal-input2" type="number" class="swal2-input" placeholder="Kaç Adım? (örn: 10)">',
        focusConfirm: false,
        preConfirm: () => {
            return [
                document.getElementById('swal-input1').value,
                document.getElementById('swal-input2').value
            ]
        }
    });

    if (formValues && formValues[0] && formValues[1]) {
        Swal.showLoading();
        const { error } = await sb.from('competition_config').insert({
            task_name: formValues[0],
            steps: parseInt(formValues[1])
        });
        if (!error) {
            Swal.fire('Başarılı', 'Yeni görev eklendi.', 'success');
            openAdminConfigPanel();
        } else {
            Swal.fire('Hata', error.message, 'error');
        }
    }
}

window.editTaskType = async function(id) {
    const task = competitionConfig.find(c => String(c.id) === String(id));
    if (!task) return;

    const { value: formValues } = await Swal.fire({
        title: 'Görevi Düzenle',
        html:
            `<input id="swal-input1" class="swal2-input" value="${task.task_name}" placeholder="Görev Adı">` +
            `<input id="swal-input2" type="number" class="swal2-input" value="${task.steps}" placeholder="Adım Sayısı">`,
        focusConfirm: false,
        preConfirm: () => {
            return [
                document.getElementById('swal-input1').value,
                document.getElementById('swal-input2').value
            ]
        }
    });

    if (formValues) {
        Swal.showLoading();
        const { error } = await sb.from('competition_config').update({
            task_name: formValues[0],
            steps: parseInt(formValues[1])
        }).eq('id', id);
        
        if (!error) {
            Swal.fire('Güncellendi', '', 'success');
            openAdminConfigPanel();
        } else {
            Swal.fire('Hata', error.message, 'error');
        }
    }
}

window.deleteTaskType = async function(id) {
    const { isConfirmed } = await Swal.fire({
        title: 'Emin misiniz?',
        text: "Bu görev tipini silmek, eski kayıtları etkileyebilir.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Evet, sil!'
    });

    if (isConfirmed) {
        Swal.showLoading();
        const { error } = await sb.from('competition_config').delete().eq('id', id);
        if (!error) {
            Swal.fire('Silindi', '', 'success');
            openAdminConfigPanel();
        } else {
            Swal.fire('Hata', error.message, 'error');
        }
    }
}

window.openAdminConfigPanel = openAdminConfigPanel;


/* ===== Arena 2.0 Sequential Captain System Patch v9.1.0 ===== */
(function(){
    const A2_SEQ_PREFIX = '[ARENA2_SEQ]';
    const A2_TAG = '[ARENA2]';
    const A2_TOTAL_BOXES = 50;

    const safeEsc = (v) => (typeof escapeHtml === 'function'
        ? escapeHtml(String(v ?? ''))
        : String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])));

    window.ARENA2_VERSION = '12.1.0';

    function a2RegularTasks() {
        return (competitionConfig || []).filter(c =>
            c &&
            c.task_name &&
            !String(c.task_name).startsWith(A2_SEQ_PREFIX) &&
            !String(c.task_name).startsWith('[GRANDPRIZE]')
        );
    }

    function a2SequenceRow() {
        return (competitionConfig || []).find(c => c && c.task_name && String(c.task_name).startsWith(A2_SEQ_PREFIX));
    }

    function a2SequenceMap() {
        try {
            const row = a2SequenceRow();
            if (!row) return {};
            return JSON.parse(String(row.task_name).slice(A2_SEQ_PREFIX.length)) || {};
        } catch (e) {
            console.error('[Arena2] sequence parse error', e);
            return {};
        }
    }

    async function a2SaveSequenceMap(mapObj) {
        const payload = `${A2_SEQ_PREFIX}${JSON.stringify(mapObj)}`;
        const row = a2SequenceRow();

        if (row && row.id) {
            const { error } = await sb.from('competition_config').update({
                task_name: payload,
                steps: 0
            }).eq('id', row.id);
            if (error) throw error;
        } else {
            const { error } = await sb.from('competition_config').insert({
                task_name: payload,
                steps: 0
            });
            if (error) throw error;
        }
        await syncCompetitionData();
    }

    function a2GetTag(note, key) {
        const m = String(note || '').match(new RegExp(`\\[${key}:([^\\]]+)\\]`));
        return m ? m[1] : '';
    }

    function a2HasArenaTag(move, type) {
        const note = String(move && move.admin_note || '');
        if (!note.includes(A2_TAG)) return false;
        return type ? note.includes(`[TYPE:${type}]`) : true;
    }

    function a2GetActiveTeam(uname) {
        return (userTeams || []).find(t =>
            t &&
            t.status === 'active' &&
            (t.user_a === uname || t.user_b === uname)
        ) || null;
    }

    function a2GetCaptain(uname) {
        const team = a2GetActiveTeam(uname);
        return team ? team.user_a : uname;
    }

    function a2GetTeamKey(uname) {
        const team = a2GetActiveTeam(uname);
        return team && team.id ? `team:${team.id}` : `solo:${uname}`;
    }

    function a2GetTeamLabel(uname) {
        const team = a2GetActiveTeam(uname);
        if (!team) return uname;
        return team.team_name || `${team.user_a} & ${team.user_b}`;
    }

    function a2GetMembers(uname) {
        const team = a2GetActiveTeam(uname);
        return team ? [team.user_a, team.user_b].filter(Boolean) : [uname];
    }

    function a2GetMovesByTeam(teamKey, type) {
        return (competitionMoves || []).filter(m => {
            if (!a2HasArenaTag(m, type)) return false;
            return a2GetTag(m.admin_note, 'TEAMKEY') === teamKey;
        });
    }

    function a2ApprovedBoxCount(teamKey) {
        return a2GetMovesByTeam(teamKey, 'submission').filter(m => m.status === 'approved').length;
    }

    function a2RerollCount(teamKey) {
        return a2GetMovesByTeam(teamKey, 'override').length;
    }

    function a2PendingSubmission(teamKey, boxNo) {
        return a2GetMovesByTeam(teamKey, 'submission').find(m =>
            m.status === 'pending' && Number(a2GetTag(m.admin_note, 'BOX')) === Number(boxNo)
        ) || null;
    }

    function a2CurrentTaskIdFor(teamKey, uname) {
        const seq = a2SequenceMap();
        const currentBox = Math.min(a2ApprovedBoxCount(teamKey) + 1, A2_TOTAL_BOXES);
        const defaultTaskId = Number(seq[currentBox] || 0) || null;
        const reroll = a2GetMovesByTeam(teamKey, 'override')
            .filter(m => Number(a2GetTag(m.admin_note, 'BOX')) === Number(currentBox))
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];

        const overrideTaskId = reroll ? Number(a2GetTag(reroll.admin_note, 'TASK')) || reroll.task_id : null;
        return {
            boxNo: currentBox,
            taskId: overrideTaskId || defaultTaskId,
            defaultTaskId: defaultTaskId,
            rerolledTaskId: overrideTaskId || null
        };
    }

    function a2TaskById(taskId) {
        return a2RegularTasks().find(t => String(t.id) === String(taskId)) || null;
    }


    function a2BoxTaskName(boxNo, viewerUser) {
        const seq = a2SequenceMap();
        let taskId = seq[boxNo];
        if (viewerUser) {
            const st = a2CurrentState(viewerUser);
            if (st.currentBox === boxNo && st.currentTaskId) {
                taskId = st.currentTaskId;
            }
        }
        const task = a2TaskById(taskId);
        return task ? task.task_name : 'Görev atanmadı';
    }

    function a2EnsureActionPanel() {
        const host = document.querySelector('.q-comp-square-actions');
        if (!host) return;
        let panel = document.getElementById('arena2-captain-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'arena2-captain-panel';
            panel.style.marginTop = '10px';
            panel.style.padding = '10px';
            panel.style.borderRadius = '14px';
            panel.style.background = 'rgba(15,23,42,.82)';
            panel.style.border = '1px solid rgba(56,189,248,.35)';
            panel.style.color = '#fff';
            panel.style.minWidth = '220px';
            host.appendChild(panel);
        }

        const st = a2CurrentState(currentUser);
        const taskName = st.currentTask ? st.currentTask.task_name : 'Atanmadı';
        const isCaptain = st.isCaptain;
        const captainNote = isCaptain ? 'Kaptansın' : `Kaptan: ${safeEsc(st.captain)}`;
        const pendingHtml = st.pendingMove
            ? `<div style="margin-top:6px; color:#fbbf24; font-size:.74rem;">Bu kutu için onay bekleyen görev var.</div>`
            : '';

        panel.innerHTML = `
            <div style="font-weight:800; margin-bottom:6px;">Arena 2.0</div>
            <div style="font-size:.78rem; color:#cbd5e1;">Takım: <b>${safeEsc(a2GetTeamLabel(currentUser))}</b></div>
            <div style="font-size:.78rem; color:#cbd5e1;">Rol: <b>${captainNote}</b></div>
            <div style="font-size:.78rem; color:#cbd5e1;">Kutu: <b>${Math.min(st.currentBox, A2_TOTAL_BOXES)}/${A2_TOTAL_BOXES}</b></div>
            <div style="font-size:.78rem; color:#cbd5e1;">Görev: <b>${safeEsc(taskName)}</b></div>
            <div style="font-size:.78rem; color:#cbd5e1;">Görev değiştirme hakkı: <b>${st.rerollsLeft}/3</b></div>
            ${pendingHtml}
            <button id="arena2-reroll-btn" class="x-btn" style="margin-top:8px; width:100%; background:#7c3aed; color:#fff; ${(!isCaptain || st.rerollsLeft <= 0 || st.pendingMove || st.isFinished) ? 'opacity:.55; cursor:not-allowed;' : ''}">
                <i class="fas fa-dice"></i> Görevi Değiştir
            </button>
        `;

        const rerollBtn = document.getElementById('arena2-reroll-btn');
        if (rerollBtn) rerollBtn.onclick = () => window.openArenaReroll();
    }

    window.openArenaReroll = async function() {
        await syncCompetitionData();
        const st = a2CurrentState(currentUser);

        if (!st.isCaptain) {
            return Swal.fire('Kaptanına haber ver', 'Görevi sadece takım kaptanı değiştirebilir.', 'info');
        }
        if (st.isFinished) {
            return Swal.fire('Tamamlandı', 'Takım bitiş çizgisine ulaştı.', 'success');
        }
        if (st.pendingMove) {
            return Swal.fire('Bekleyen Onay Var', 'Bu kutu için önce mevcut görev onaylanmalı veya reddedilmeli.', 'warning');
        }
        if (st.rerollsLeft <= 0) {
            return Swal.fire('Hak Bitti', 'Bu takım tüm görev değiştirme haklarını kullandı.', 'warning');
        }

        const regular = a2RegularTasks();
        const pool = regular.filter(t => String(t.id) !== String(st.currentTaskId));
        if (!pool.length) {
            return Swal.fire('Yetersiz Görev', 'Görevi değiştirmek için en az iki görev tanımı olmalı.', 'warning');
        }

        const picked = pool[Math.floor(Math.random() * pool.length)];
        const note = `${A2_TAG}[TYPE:reroll][TEAMKEY:${st.teamKey}][BOX:${st.currentBox}][TASK:${picked.id}][CAPTAIN:${st.captain}]`;

        const { error } = await sb.from('competition_moves').insert({
            user_name: st.captain,
            task_id: picked.id,
            steps: 0,
            status: 'approved',
            approved_at: new Date().toISOString(),
            admin_note: note
        });

        if (error) {
            return Swal.fire('Hata', error.message || 'Görev değiştirilemedi.', 'error');
        }

        await syncCompetitionData();
        renderCompetitionBoard();
        renderCompetitionLeaderboard();
        renderMyRecentTasks();
        a2EnsureActionPanel();

        return Swal.fire('Görev Değişti', `Yeni görev: ${picked.task_name}`, 'success');
    };

    window.openNewTaskModal = async function() {
        await syncCompetitionData();
        const st = a2CurrentState(currentUser);

        if (!st.isCaptain) {
            return Swal.fire('Kaptanına haber ver', 'Görev bildirimini sadece takım kaptanı gönderebilir.', 'info');
        }
        if (st.isFinished) {
            return Swal.fire('Tebrikler', 'Takım tüm kutuları tamamladı.', 'success');
        }
        if (st.pendingMove) {
            return Swal.fire('Bekliyor', 'Bu kutu için zaten onay bekleyen bir bildirim var.', 'warning');
        }
        if (!st.currentTask) {
            return Swal.fire('Sıralama Eksik', 'Bu kutu için henüz görev atanmadı. Admin sıralama yapmalı.', 'warning');
        }

        const label = a2GetTeamLabel(currentUser);
        const membersTxt = st.members.join(' & ');

        const result = await Swal.fire({
            title: `Kutu ${st.currentBox} Görevi`,
            html: `
                <div style="text-align:left; font-size:.95rem;">
                    <div><b>Takım:</b> ${safeEsc(label)}</div>
                    <div><b>Oyuncular:</b> ${safeEsc(membersTxt)}</div>
                    <div style="margin-top:10px; padding:10px; border-radius:12px; background:#0f172a; color:#fff;">
                        <div style="font-size:.8rem; color:#94a3b8;">Bu kutudaki zorunlu görev</div>
                        <div style="font-size:1rem; font-weight:800; margin-top:4px;">${safeEsc(st.currentTask.task_name)}</div>
                    </div>
                    <div style="margin-top:10px; color:#cbd5e1; font-size:.82rem;">
                        Bu görev admin onayına gönderilecek. Onay gelmeden sonraki kutuya geçemezsiniz.
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Görevi Bildir',
            cancelButtonText: 'Vazgeç',
            background: '#020617',
            color: '#fff'
        });

        if (!result.isConfirmed) return;

        const note = `${A2_TAG}[TYPE:submission][TEAMKEY:${st.teamKey}][BOX:${st.currentBox}][TASK:${st.currentTask.id}][CAPTAIN:${st.captain}]`;

        const { error } = await sb.from('competition_moves').insert({
            user_name: st.captain,
            task_id: st.currentTask.id,
            steps: 0,
            status: 'pending',
            admin_note: note
        });

        if (error) {
            return Swal.fire('Hata', error.message || 'Görev bildirilemedi.', 'error');
        }

        await syncCompetitionData();
        renderMyRecentTasks();
        a2EnsureActionPanel();

        return Swal.fire('Gönderildi', 'Görev admin onayına gönderildi.', 'success');
    };

    window.openArenaSequencePanel = async function() {
        await syncCompetitionData();
        const regularTasks = a2RegularTasks();

        if (!regularTasks.length) {
            return Swal.fire('Görev Yok', 'Önce en az bir görev tanımı eklemelisin.', 'warning');
        }

        const seq = a2SequenceMap();
        const optionsHtml = regularTasks.map(t => `<option value="${t.id}">${safeEsc(t.task_name)}</option>`).join('');

        let rows = '';
        for (let i = 1; i <= A2_TOTAL_BOXES; i++) {
            rows += `
                <tr>
                    <td style="padding:6px 8px; border-bottom:1px solid #1e293b;">${i}. Kutu</td>
                    <td style="padding:6px 8px; border-bottom:1px solid #1e293b;">
                        <select id="arena2-box-task-${i}" style="width:100%; padding:8px; border-radius:8px; background:#0f172a; color:#fff; border:1px solid #334155;">
                            <option value="">Görev seç</option>
                            ${optionsHtml}
                        </select>
                    </td>
                </tr>
            `;
        }

        const res = await Swal.fire({
            title: 'Tüm Kutuların Görevlerini Ayarla',
            html: `
                <div style="max-height:60vh; overflow:auto;">
                    <table style="width:100%; border-collapse:collapse; font-size:.85rem;">
                        <thead style="position:sticky; top:0; background:#020617; z-index:2;">
                            <tr>
                                <th style="padding:8px; text-align:left;">Kutu</th>
                                <th style="padding:8px; text-align:left;">Görev</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `,
            width: 760,
            background: '#020617',
            color: '#fff',
            showCancelButton: true,
            confirmButtonText: 'Kaydet',
            cancelButtonText: 'İptal',
            didOpen: () => {
                for (let i = 1; i <= A2_TOTAL_BOXES; i++) {
                    const el = document.getElementById(`arena2-box-task-${i}`);
                    if (el && seq[i]) el.value = String(seq[i]);
                }
            },
            preConfirm: () => {
                const map = {};
                for (let i = 1; i <= A2_TOTAL_BOXES; i++) {
                    const el = document.getElementById(`arena2-box-task-${i}`);
                    map[i] = el && el.value ? Number(el.value) : null;
                }
                return map;
            }
        });

        if (!res.isConfirmed) return;

        try {
            await a2SaveSequenceMap(res.value || {});
            await syncCompetitionData();
            renderCompetitionBoard();
            a2EnsureActionPanel();
            return Swal.fire('Kaydedildi', 'Kutu görev sıralaması güncellendi.', 'success');
        } catch (e) {
            return Swal.fire('Hata', e.message || 'Sıralama kaydedilemedi.', 'error');
        }
    };

    window.openAdminConfigPanel = async function() {
        await syncCompetitionData();

        let html = `
            <div style="max-height:450px; overflow-y:auto; padding:5px;">
                <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
                    <button onclick="openArenaSequencePanel()" class="x-btn x-btn-primary" style="padding:8px 12px; background:#7c3aed; color:#fff;">
                        <i class="fas fa-list-ol"></i> TÜM KUTULARIN GÖREVLERİNİ AYARLA
                    </button>
                    <button onclick="addNewTaskType()" class="x-btn x-btn-primary" style="padding:8px 12px;">
                        <i class="fas fa-plus"></i> Yeni Görev Tanımı
                    </button>
                </div>
                <div style="font-size:.78rem; color:#64748b; margin-bottom:10px;">
                    Arena 2.0 aktif. Her kutunun görevi ayrı ayrı belirlenir. Kaptan onay almadan sonraki kutuya geçemez.
                </div>
                <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                    <thead style="background:#f8fafc; position:sticky; top:0; z-index:1;">
                        <tr>
                            <th style="padding:10px; text-align:left;">Görev Adı</th>
                            <th style="padding:10px; text-align:center;">Eski Adım Değeri</th>
                            <th style="padding:10px; text-align:right;">İşlem</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${a2RegularTasks().map(c => `
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="padding:10px;">${safeEsc(c.task_name)}</td>
                                <td style="padding:10px; text-align:center; font-weight:700;">${c.steps}</td>
                                <td style="padding:10px; text-align:right; display:flex; gap:5px; justify-content:flex-end;">
                                    <button onclick="editTaskType(${c.id})" class="x-btn" style="padding:4px 8px; font-size:0.7rem; background:#64748b; color:white;"><i class="fas fa-edit"></i></button>
                                    <button onclick="deleteTaskType(${c.id})" class="x-btn" style="padding:4px 8px; font-size:0.7rem; background:#ef4444; color:white;"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div style="margin-top:20px; padding-top:15px; border-top:2px dashed #eee;">
                    <h4 style="margin:0 0 10px 0; color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Tehlikeli Bölge (Yönetici)</h4>
                    <div style="display:flex; gap:10px;">
                        <button onclick="resetArenaGame()" class="x-btn" style="flex:1; background:#ef4444; color:white; padding:10px; font-weight:700;">
                            <i class="fas fa-undo"></i> OYUNU SIFIRLA
                        </button>
                        <button onclick="deleteAllTeams()" class="x-btn" style="flex:1; background:#475569; color:white; padding:10px; font-weight:700;">
                            <i class="fas fa-user-slash"></i> TAKIMLARI SİL
                        </button>
                    </div>
                </div>
            </div>
        `;

        return Swal.fire({
            title: 'Yarışma Genel Ayarları',
            html: html,
            width: 700,
            showConfirmButton: false,
            showCloseButton: true
        });
    };

    window.openAdminCompPanel = async function() {
        await syncCompetitionData();
        const pendingRows = (competitionMoves || []).filter(m => m.status === 'pending');

        let html = `
            <div style="max-height:420px; overflow-y:auto;">
                <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                    <thead>
                        <tr style="text-align:left; border-bottom:2px solid #eee;">
                            <th style="padding:10px;">Takım / Kaptan</th>
                            <th style="padding:10px;">Kutu</th>
                            <th style="padding:10px;">Görev</th>
                            <th style="padding:10px;">İşlem</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pendingRows.map(m => {
                            const isArena2 = a2HasArenaTag(m, 'submission');
                            const task = a2TaskById(m.task_id);
                            const teamKey = a2GetTag(m.admin_note, 'TEAMKEY');
                            const boxNo = a2GetTag(m.admin_note, 'BOX');
                            const captain = a2GetTag(m.admin_note, 'CAPTAIN') || m.user_name;
                            const label = teamKey ? a2GetTeamLabel(captain) : m.user_name;
                            return `
                                <tr style="border-bottom:1px solid #eee;">
                                    <td style="padding:10px;">${safeEsc(label)}<div style="font-size:.72rem; color:#64748b;">${safeEsc(captain)}</div></td>
                                    <td style="padding:10px;">${isArena2 ? safeEsc(boxNo || '-') : '-'}</td>
                                    <td style="padding:10px;">
                                        <div style="font-weight:bold;">${safeEsc(task ? task.task_name : 'Silinmiş Görev')}</div>
                                        ${isArena2 && a2GetTag(m.admin_note, 'DESC') ? `
                                            <div onclick="window.a2Copy(this, '${safeEsc(a2GetTag(m.admin_note, 'DESC'))}')" 
                                                 title="Kopyalamak için tıkla"
                                                 style="font-size:0.75rem; color:#475569; margin-top:3px; background:#f1f5f9; padding:4px 8px; border-radius:4px; border-left:3px solid #3b82f6; cursor:pointer; display:flex; align-items:center; justify-content:space-between; transition:all 0.2s; position:relative;">
                                                <span class="a2-copy-text"><b>Not:</b> ${safeEsc(a2GetTag(m.admin_note, 'DESC'))}</span>
                                                <i class="far fa-copy" style="margin-left:8px; opacity:0.6;"></i>
                                            </div>` : ''}
                                    </td>
                                    <td style="padding:10px; display:flex; gap:5px;">
                                        <button onclick="handleMoveAction(${m.id}, 'approved')" class="x-btn x-btn-primary" style="padding:5px 10px; font-size:0.7rem; background:#10b981;">Onayla</button>
                                        <button onclick="handleMoveAction(${m.id}, 'rejected')" class="x-btn" style="padding:5px 10px; font-size:0.7rem; background:#ef4444; color:white;">Reddet</button>
                                        <button onclick="handleMoveAction(${m.id}, 'penalty')" class="x-btn" style="padding:5px 10px; font-size:0.7rem; background:#7f1d1d; color:white;"><i class="fas fa-undo"></i> Ceza</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                ${pendingRows.length === 0 ? '<p style="text-align:center; padding:20px;">Bekleyen talep yok.</p>' : ''}
            </div>
        `;

        return Swal.fire({
            title: 'Yarışma Onay Paneli',
            html: html,
            width: 760,
            showConfirmButton: false,
            showCloseButton: true
        });
    };

    window.handleMoveAction = async function(id, status) {
        const moveResp = await sb.from('competition_moves').select('*').eq('id', id).single();
        const moveData = moveResp.data;
        if (!moveData) return Swal.fire('Hata', 'Kayıt bulunamadı.', 'error');

        let reasonText = '';

        if (status === 'approved') {
            // Onayda isteğe bağlı not
            const prompt = await Swal.fire({
                title: '✅ Onaylıyorsun — Not eklemek ister misin?',
                input: 'textarea',
                inputPlaceholder: 'İsteğe bağlı (boş bırakabilirsin)',
                showCancelButton: true,
                confirmButtonText: 'Onayla',
                cancelButtonText: 'Vazgeç',
                confirmButtonColor: '#10b981',
                background: '#0f172a',
                color: '#fff'
            });
            if (!prompt.isConfirmed) return;
            reasonText = (prompt.value || '').trim();
        } else if (status === 'rejected' || status === 'penalty') {
            const prompt = await Swal.fire({
                title: status === 'penalty' ? '⚡ Ceza Sebebi Nedir?' : '❌ Neden reddediyorsun?',
                input: 'textarea',
                inputPlaceholder: 'Oyuncu bu notu görecek...',
                showCancelButton: true,
                confirmButtonText: 'Devam',
                cancelButtonText: 'Vazgeç',
                background: '#0f172a',
                color: '#fff'
            });
            if (!prompt.isConfirmed) return;
            reasonText = prompt.value || '';
        }

        const isArena2Submission = a2HasArenaTag(moveData, 'submission');


        if (status === 'penalty' && isArena2Submission) {
            const upd = await sb.from('competition_moves').update({
                status: 'rejected',
                admin_note: `${moveData.admin_note || ''} [PENALTY_NOTE:${reasonText || 'Ceza uygulandı'}]`,
                approved_at: new Date().toISOString()
            }).eq('id', id);
            if (upd.error) return Swal.fire('Hata', upd.error.message, 'error');
            await window.a2SmartRefresh();
            return Swal.fire('Ceza Uygulandı', 'Arena 2.0 modunda ceza, bu denemeyi başarısız sayar. Takım aynı kutuyu tekrar denemelidir.', 'info');
        }

        if (isArena2Submission) {
            const payload = {
                status: status,
                approved_at: new Date().toISOString(),
                admin_note: `${moveData.admin_note || ''}${reasonText ? ` [ADMIN_NOTE:${reasonText}]` : ''}`
            };
            const upd = await sb.from('competition_moves').update(payload).eq('id', id);
            if (upd.error) return Swal.fire('Hata', upd.error.message, 'error');
        } else if (status === 'penalty') {
            const updErr = await sb.from('competition_moves').update({
                status: 'rejected',
                admin_note: `[CEZA] ${reasonText}`
            }).eq('id', id);
            if (updErr.error) return Swal.fire('Hata', updErr.error.message, 'error');

            const insErr = await sb.from('competition_moves').insert({
                user_name: moveData.user_name,
                task_id: moveData.task_id,
                steps: -3,
                status: 'approved',
                approved_at: new Date().toISOString(),
                admin_note: `[CEZA] ${reasonText}`
            });
            if (insErr.error) return Swal.fire('Hata', insErr.error.message, 'error');
        }

        await window.a2SmartRefresh();

        return Swal.fire(
            status === 'approved' ? 'Onaylandı' : (status === 'rejected' ? 'Reddedildi' : 'İşlem Tamam'),
            status === 'approved'
                ? 'Takım bir sonraki kutunun görevine hak kazandı.'
                : 'Kayıt güncellendi.',
            status === 'approved' ? 'success' : 'info'
        );
    };

    window.renderCompetitionBoard = function() {
        const container = document.getElementById('q-comp-board');
        if (!container) return;

        const totalBoxes = A2_TOTAL_BOXES;
        let html = `<div class="q-comp-path-container" style="position: relative; width: 1000px; height: 600px;">`;

        for (let i = 0; i < totalBoxes; i++) {
            const r1 = Math.floor(i / 10), c1 = (r1 % 2 === 0) ? (i % 10) : (9 - (i % 10));
            const next = i + 1;
            const r2 = Math.floor(next / 10), c2 = (r2 % 2 === 0) ? (next % 10) : (9 - (next % 10));
            const vr1 = 5 - r1, vr2 = 5 - r2;
            const x1 = c1 * 100 + 38, y1 = vr1 * 110 + 38;
            const x2 = c2 * 100 + 38, y2 = vr2 * 110 + 38;
            const isHorizontal = vr1 === vr2;
            const width = isHorizontal ? Math.abs(x2 - x1) : 6;
            const height = isHorizontal ? 6 : Math.abs(y2 - y1);
            const top = Math.min(y1, y2);
            const left = Math.min(x1, x2);

            const pathDone = (i + 1) <= st.approvedBoxes;
            const pathActive = !pathDone && st.currentBox === (i + 1);
            html += `<div class="q-comp-path-line ${pathDone ? 'is-done' : ''} ${pathActive ? 'is-active' : ''}" style="top:${top}px;left:${left}px;width:${width}px;height:${height}px;position:absolute;z-index:2;"></div>`;
        }

        const gemClasses = ['gem-ruby', 'gem-sapphire', 'gem-emerald', 'gem-gold', 'gem-amethyst'];

        for (let i = 0; i <= totalBoxes; i++) {
            let typeClass = "";
            let content = i === 0 ? "" : i;
            let extraStyle = "";
            let extraAttrs = "";

            if (i === 0) {
                typeClass = "start";
                content = '<i class="fas fa-flag-checkered"></i>';
            } else if (i === totalBoxes) {
                typeClass = "finish";
                content = '<i class="fas fa-chess-rook"></i>';
                extraStyle = "cursor:pointer;";
                extraAttrs = `title="Final" onclick="handleGrandPrizeClick()"`;
            } else {
                typeClass = gemClasses[i % gemClasses.length];
                const taskName = a2BoxTaskName(i, currentUser);
                extraAttrs = `title="${safeEsc(taskName)}" onclick="window.showArenaBoxInfo(${i})"`;
                extraStyle = "cursor:pointer;";
            }

            const r = Math.floor(i / 10);
            const col = (r % 2 === 0) ? (i % 10) : (9 - (i % 10));
            const row = 5 - r;
            const top = row * 110;
            const left = col * 100;

            html += `<div class="q-step-box ${typeClass}" ${extraAttrs} style="position:absolute; top:${top}px; left:${left}px; z-index:20; ${extraStyle}">${content}</div>`;
        }

        const renderedSolo = new Set();
        const teams = (userTeams || []).filter(t => t && t.status === 'active');

        teams.forEach((team) => {
            const teamKey = team.id ? `team:${team.id}` : `team:${team.user_a}:${team.user_b}`;
            const approved = Math.min(a2ApprovedBoxCount(teamKey), totalBoxes);
            const r = Math.floor(approved / 10);
            const col = (r % 2 === 0) ? (approved % 10) : (9 - (approved % 10));
            const row = 5 - r;
            const top = row * 110 + 8;
            const left = col * 100 + 8;

            [team.user_a, team.user_b].forEach((uname, idx) => {
                if (!uname) return;
                renderedSolo.add(uname);
                const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || (idx === 0 ? 'm1' : 'f1');
                const avatarData = AVATAR_MAP[avatarId] || AVATAR_MAP['m1'];
                const isCaptain = uname === team.user_a;
                const isCurrent = uname === currentUser;
                const sideOffset = idx === 0 ? -12 : 12;

                html += `
                    <div class="q-user-avatar ${isCurrent ? 'current-user' : ''}" title="${safeEsc(uname)}${isCaptain ? ' (Kaptan)' : ''}" style="position:absolute; top:${top}px; left:${left + sideOffset}px; z-index:40; background:${avatarData.color};">
                        <i class="fas ${avatarData.icon}"></i>
                        ${isCaptain ? '<span style="position:absolute; top:-8px; right:-4px; font-size:.65rem; color:#fbbf24;"><i class="fas fa-crown"></i></span>' : ''}
                    </div>
                `;
            });
        });

        const knownUsers = new Set([currentUser]);
        (competitionMoves || []).forEach(m => { if (m && m.user_name) knownUsers.add(m.user_name); });

        [...knownUsers].forEach((uname) => {
            if (!uname || renderedSolo.has(uname)) return;
            const approved = Math.min(a2ApprovedBoxCount(`solo:${uname}`), totalBoxes);
            const r = Math.floor(approved / 10);
            const col = (r % 2 === 0) ? (approved % 10) : (9 - (approved % 10));
            const row = 5 - r;
            const top = row * 110 + 8;
            const left = col * 100 + 8;
            const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || 'm1';
            const avatarData = AVATAR_MAP[avatarId] || AVATAR_MAP['m1'];

            html += `
                <div class="q-user-avatar ${uname === currentUser ? 'current-user' : ''}" title="${safeEsc(uname)}" style="position:absolute; top:${top}px; left:${left}px; z-index:35; background:${avatarData.color};">
                    <i class="fas ${avatarData.icon}"></i>
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;
        a2EnsureActionPanel();
    };

    window.showArenaBoxInfo = function(boxNo) {
        const taskName = a2BoxTaskName(boxNo, currentUser);
        const st = a2CurrentState(currentUser);
        return Swal.fire({
            title: `${boxNo}. Kutu`,
            html: `
                <div style="text-align:left">
                    <div><b>Atanmış görev:</b> ${safeEsc((taskName && taskName !== 'Görev atanmadı') ? taskName : 'Henüz görev atanmadı')}</div>
                    ${st.currentBox === boxNo ? `<div style="margin-top:10px; color:#8b5cf6;"><b>Şu an bulunduğun aktif kutu.</b></div>` : ''}
                </div>
            `,
            background: '#020617',
            color: '#fff',
            confirmButtonText: 'Tamam'
        });
    };

    window.renderCompetitionLeaderboard = function() {
        const list = document.getElementById('q-comp-leaderboard');
        if (!list) return;

        const entries = [];
        const taken = new Set();

        (userTeams || []).filter(t => t && t.status === 'active').forEach(t => {
            const teamKey = t.id ? `team:${t.id}` : `team:${t.user_a}:${t.user_b}`;
            entries.push({
                name: t.team_name || `${t.user_a} & ${t.user_b}`,
                score: a2ApprovedBoxCount(teamKey),
                isTeam: true
            });
            if (t.user_a) taken.add(t.user_a);
            if (t.user_b) taken.add(t.user_b);
        });

        const users = new Set([currentUser]);
        (competitionMoves || []).forEach(m => { if (m && m.user_name) users.add(m.user_name); });

        [...users].forEach(uname => {
            if (!uname || taken.has(uname)) return;
            entries.push({
                name: uname,
                score: a2ApprovedBoxCount(`solo:${uname}`),
                isTeam: false
            });
        });

        const sorted = entries.sort((a, b) => b.score - a.score).slice(0, 8);
        if (!sorted.length) {
            list.innerHTML = `<div style="padding:10px; color:#94a3b8; font-size:0.8rem;">Veri yok.</div>`;
            return;
        }

        list.innerHTML = sorted.map((entry, idx) => `
            <div class="q-leader-item ${idx === 0 ? 'q-rank-1' : ''} ${entry.isTeam ? 'q-team-item' : ''}">
                <div style="font-weight:900; opacity:0.6;">#${idx + 1}</div>
                <div style="flex:1;">
                    <div style="font-weight:700; color:#fff; font-size:0.85rem;">${safeEsc(entry.name)}</div>
                    <div style="font-size:0.75rem; color:${entry.isTeam ? '#10b981' : '#00f2ff'};">${entry.score}/${A2_TOTAL_BOXES} Kutu</div>
                </div>
                ${idx === 0 ? '<i class="fas fa-crown" style="font-size:1.1rem;"></i>' : (entry.isTeam ? '<i class="fas fa-users"></i>' : '')}
            </div>
        `).join('');
    };

    window.renderTelesalesCompetition = async function() {
        initArenaRealtime();
        const board = document.getElementById('q-comp-board');
        if (!board) return;

        const savedAvatar = localStorage.getItem(`comp_avatar_${currentUser}`);
        const profileBtn = document.getElementById('comp-profile-btn');
        if (profileBtn && savedAvatar && AVATAR_MAP[savedAvatar]) {
            profileBtn.innerHTML = `<i class="fas ${AVATAR_MAP[savedAvatar].icon}"></i>`;
        }

        const isActuallyAdmin = (typeof isAdminMode !== 'undefined' && isAdminMode) || (typeof isLocAdmin !== 'undefined' && isLocAdmin);
        const adminBtns = document.getElementById('admin-comp-btns');
        if (adminBtns) adminBtns.style.display = isActuallyAdmin ? 'flex' : 'none';

        await syncCompetitionData();
        renderCompetitionBoard();
        renderCompetitionLeaderboard();
        if (typeof renderMyRecentTasks === 'function') renderMyRecentTasks();
        a2EnsureActionPanel();
    };

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            try { a2EnsureActionPanel(); } catch (e) { console.error(e); }
        }, 500);
    });

// ===== Arena 2.0 UX polish override (v9.2.0) =====
function a2ShortTaskLabel(name) {
    const raw = String(name || '').replace(/\s+/g, ' ').trim();
    if (!raw) return 'Görev yok';
    return raw.length > 28 ? raw.slice(0, 28).trim() + '…' : raw;
}

function a2PanelMarkup(st) {
    const taskName = st.currentTask ? st.currentTask.task_name : 'Atanmadı';
    const isCaptain = st.isCaptain;
    const roleHtml = isCaptain
        ? '<span style="color:#fbbf24;"><i class="fas fa-crown"></i> Kaptansın</span>'
        : `Kaptan: <b>${safeEsc(st.captain)}</b>`;

    const actionState = st.isFinished
        ? '<div class="arena2-chip arena2-chip-success">🏆 Takım bitişe ulaştı!</div>'
        : st.pendingMove
            ? '<div class="arena2-chip arena2-chip-warn">⏳ Admin onayı bekleniyor...</div>'
            : '<div class="arena2-chip arena2-chip-info">✅ Admin onayladığında ilerleyeceksin</div>';

    const taskTypeBadge = st.currentTask
        ? (() => {
            const type = String(st.currentTask.type || st.currentSegment?.task_type || 'normal').toLowerCase();
            const map = { bonus: '⚡ Bonus Adım', normal: 'Normal Görev', reward: '🎁 Hediye', penalty: '⚠️ Ceza' };
            return `<span style="font-size:.68rem; color:#94a3b8;">${map[type] || 'Normal Görev'}</span>`;
        })() : '';

    return `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px;">
            <div style="font-weight:900; font-size:1.28rem;">Arena 2.0</div>
            <div style="font-size:.72rem; color:#93c5fd; padding:5px 10px; border-radius:999px; background:rgba(37,99,235,.14); border:1px solid rgba(96,165,250,.18);">
                v${safeEsc(window.ARENA2_VERSION || '12.2.0')}
            </div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px; margin-bottom:10px;">
            <div style="padding:10px; border-radius:14px; background:rgba(255,255,255,.04);">
                <div style="font-size:.68rem; color:#94a3b8;">Takım</div>
                <div style="margin-top:2px; font-weight:800;">${safeEsc(a2GetTeamLabel(currentUser))}</div>
            </div>
            <div style="padding:10px; border-radius:14px; background:rgba(255,255,255,.04);">
                <div style="font-size:.68rem; color:#94a3b8;">Pozisyon</div>
                <div style="margin-top:2px; font-weight:800;">Kutu ${Math.min(st.currentBox, A2_TOTAL_BOXES)}/${A2_TOTAL_BOXES}</div>
            </div>
            <div style="padding:10px; border-radius:14px; background:rgba(255,255,255,.04);">
                <div style="font-size:.68rem; color:#94a3b8;">Rol</div>
                <div style="margin-top:2px; font-weight:800;">${roleHtml}</div>
            </div>
            <div style="padding:10px; border-radius:14px; background:rgba(255,255,255,.04);">
                <div style="font-size:.68rem; color:#94a3b8;">Reroll</div>
                <div style="margin-top:2px; font-weight:800;">${st.rerollsLeft}/3 kaldı</div>
            </div>
        </div>

        <div style="padding:12px; border-radius:16px; background:linear-gradient(180deg, rgba(124,58,237,.18), rgba(15,23,42,.24)); border:1px solid rgba(168,85,247,.24);">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <div style="font-size:.74rem; color:#cbd5e1;">Aktif görev</div>
                <div style="font-size:.72rem; color:${st.pendingMove ? '#fbbf24' : '#67e8f9'};">${st.pendingMove ? 'Onay bekliyor' : 'Aktif'}</div>
            </div>
            <div style="margin-top:4px;">${taskTypeBadge}</div>
            <div style="margin-top:6px; font-size:.95rem; font-weight:800; line-height:1.35;">
                ${safeEsc(taskName)}
            </div>
            ${st.currentSegment ? `<div style="margin-top:4px; font-size:.68rem; color:#64748b;">Kutu ${st.currentSegment.start_box}-${st.currentSegment.end_box} • ${st.currentSegment.steps} adım</div>` : ''}
        </div>

        <div style="margin-top:10px;">${actionState}</div>

        <button id="arena2-reroll-btn" class="x-btn" style="margin-top:10px; width:100%; background:#7c3aed; color:#fff; font-weight:800; ${(!isCaptain || st.rerollsLeft <= 0 || st.pendingMove || st.isFinished) ? 'opacity:.55; cursor:not-allowed;' : ''}">
            <i class="fas fa-dice"></i> Görevi Değiştir
        </button>
    `;
}


function a2EnsureActionPanel() {
    const host = document.querySelector('.q-comp-square-actions');
    if (!host) return;

    let panel = document.getElementById('arena2-captain-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'arena2-captain-panel';
        host.appendChild(panel);
    }

    const st = a2CurrentState(currentUser);
    panel.innerHTML = a2PanelMarkup(st);

    const rerollBtn = document.getElementById('arena2-reroll-btn');
    if (rerollBtn) rerollBtn.onclick = () => window.openArenaReroll();
}

window.renderCompetitionBoard = function() {
    const container = document.getElementById('q-comp-board');
    if (!container) return;

    const totalBoxes = A2_TOTAL_BOXES;
    const cols = 10;
    const boxSize = 84;
    const stepX = 96;
    const stepY = 106;
    const offsetX = 24;
    const offsetY = 24;
    const lineOffset = 42;
    const boardWidth = offsetX * 2 + stepX * 9 + boxSize;
    const boardHeight = offsetY * 2 + stepY * 5 + boxSize;

    const st = a2CurrentState(currentUser);

    let html = `<div class="q-comp-path-container" style="position: relative; width:${boardWidth}px; height:${boardHeight}px;">`;

    for (let i = 0; i < totalBoxes; i++) {
        const r1 = Math.floor(i / cols), c1 = (r1 % 2 === 0) ? (i % cols) : (9 - (i % cols));
        const next = i + 1;
        const r2 = Math.floor(next / cols), c2 = (r2 % 2 === 0) ? (next % cols) : (9 - (next % cols));
        const vr1 = 5 - r1, vr2 = 5 - r2;
        const x1 = offsetX + c1 * stepX + lineOffset, y1 = offsetY + vr1 * stepY + lineOffset;
        const x2 = offsetX + c2 * stepX + lineOffset, y2 = offsetY + vr2 * stepY + lineOffset;
        const isHorizontal = vr1 === vr2;
        const width = isHorizontal ? Math.abs(x2 - x1) : 8;
        const height = isHorizontal ? 8 : Math.abs(y2 - y1);
        const top = Math.min(y1, y2);
        const left = Math.min(x1, x2);

        html += `<div class="q-comp-path-line" style="top:${top}px;left:${left}px;width:${width}px;height:${height}px;position:absolute;z-index:2;"></div>`;
    }

    const gemClasses = ['gem-ruby', 'gem-sapphire', 'gem-emerald', 'gem-gold', 'gem-amethyst'];

    // Milestone ikonları
    const MILESTONES = {
        10: { icon: 'fa-tower-observation', label: 'Gözetleme Kulesi', cls: 'milestone-watchtower' },
        20: { icon: 'fa-shield-halved',      label: 'Demir Kale',       cls: 'milestone-shield'     },
        30: { icon: 'fa-map-signs',          label: 'Yol Ayrımı',       cls: 'milestone-sign'       },
        40: { icon: 'fa-coins',              label: 'Hazine Odası',     cls: 'milestone-chest'      },
        50: { icon: 'fa-chess-rook',         label: 'Kale Zirvesi',    cls: 'milestone-castle'     }
    };

    for (let i = 0; i <= totalBoxes; i++) {
        let typeClass = "";
        let extraStyle = "";
        let extraAttrs = "";
        let numberHtml = "";
        let taskHtml = "";
        let stateClass = "";
        let milestoneHtml = "";

        if (i === 0) {
            typeClass = "start";
            numberHtml = '<div class="q-step-box-number"><i class="fas fa-flag-checkered"></i></div>';
            taskHtml = '<div class="q-step-box-task">Başlangıç</div>';
        } else if (i === totalBoxes) {
            typeClass = "finish milestone-castle has-milestone";
            numberHtml = '<div class="q-step-box-number"><i class="fas fa-chess-rook"></i></div>';
            taskHtml = '<div class="q-step-box-task">Büyük Ödül</div>';
            extraStyle = "cursor:pointer;";
            extraAttrs = `title="Final — Büyük Ödül!" onclick="handleGrandPrizeClick()"`;
            milestoneHtml = '<div class="a2-milestone-badge milestone-castle">🏆</div>';
            if (st.approvedBoxes >= totalBoxes) stateClass = 'is-complete';
        } else {
            const taskName = a2BoxTaskName(i, currentUser);
            const shortTask = a2ShortTaskLabel(taskName);
            const hasTask = (taskName && taskName !== 'Görev atanmadı');
            typeClass = gemClasses[i % gemClasses.length];

            // Milestone kutusu (10, 20, 30, 40)
            if (MILESTONES[i] && i < totalBoxes) {
                const ms = MILESTONES[i];
                typeClass += ' has-milestone ' + ms.cls;
                const MILESTONE_EMOJIS = {10:'🗼', 20:'🛡️', 30:'🪧', 40:'💰'};
                milestoneHtml = `<div class="a2-milestone-badge ${ms.cls}">${MILESTONE_EMOJIS[i] || '⭐'}</div>`;
            }

            numberHtml = `<div class="q-step-box-number">${i}</div>`;

            // Aktif kutu için görev adı + ayrı hint
            const isMyActive = (i === st.currentBox && !st.isFinished);
            if (isMyActive) {
                taskHtml = `<div class="q-step-box-task next-task-label fixed-label">${safeEsc(hasTask ? shortTask : '⚠ Bekle')}</div>`;
                extraAttrs = `onclick="window.showArenaBoxInfo(${i})"`;
                extraStyle = "cursor:pointer;";
            } else {
                taskHtml = `<div class="q-step-box-task fixed-label">${safeEsc(hasTask ? shortTask : '')}</div>` +
                           `<div class="a2-box-hover-hint">Detay için tıkla</div>`;
                extraAttrs = `onclick="window.showArenaBoxInfo(${i})"`;
                extraStyle = "cursor:pointer;";
            }

            if (i <= st.approvedBoxes) stateClass += ' is-complete';
            if (i === st.currentBox && !st.isFinished) stateClass += ' current-box';
            if (st.pendingMove && i === st.currentBox) stateClass += ' pending-box';
            if (!hasTask && i > st.approvedBoxes) stateClass += ' is-unassigned';
        }

        const r = Math.floor(i / cols);
        const col = (r % 2 === 0) ? (i % cols) : (9 - (i % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY;
        const left = offsetX + col * stepX;

        html += `
            <div class="q-step-box ${typeClass} ${stateClass.trim()}" ${extraAttrs}
                 style="position:absolute; top:${top}px; left:${left}px; z-index:20; ${extraStyle}">
                ${milestoneHtml}
                <div class="q-step-box-inner">
                    ${numberHtml}
                    ${taskHtml}
                </div>
            </div>
        `;
    }

    // Avatar konumlarını sıraya koy (çakışma önlemi: aynı kutu → yatay kaydır)
    const avatarSlots = {}; // boxNo -> [{uname, avatarData, isCaptain, isCurrent}]
    const renderedSolo = new Set();
    const teams = (userTeams || []).filter(t => t && t.status === 'active');

    teams.forEach((team) => {
        const teamKey = team.id ? `team:${team.id}` : `team:${team.user_a}:${team.user_b}`;
        const approved = Math.min(a2ApprovedBoxCount(teamKey), totalBoxes);
        [team.user_a, team.user_b].forEach((uname, idx) => {
            if (!uname) return;
            renderedSolo.add(uname);
            const slot = avatarSlots[approved] || (avatarSlots[approved] = []);
            const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || (idx === 0 ? 'm1' : 'f1');
            slot.push({
                uname,
                avatarData: AVATAR_MAP[avatarId] || AVATAR_MAP['m1'],
                isCaptain: (uname === team.user_a),
                isCurrent: (uname === currentUser)
            });
        });
    });

    const knownUsers = new Set([currentUser]);
    (competitionMoves || []).forEach(m => { if (m && m.user_name) knownUsers.add(m.user_name); });

    [...knownUsers].forEach((uname) => {
        if (!uname || renderedSolo.has(uname)) return;
        const approved = Math.min(a2ApprovedBoxCount(`solo:${uname}`), totalBoxes);
        const slot = avatarSlots[approved] || (avatarSlots[approved] = []);
        const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || 'm1';
        slot.push({
            uname,
            avatarData: AVATAR_MAP[avatarId] || AVATAR_MAP['m1'],
            isCaptain: false,
            isCurrent: (uname === currentUser)
        });
    });

    // Avatar HTML üret — Her kutu için avatarları yatayda böl
    Object.entries(avatarSlots).forEach(([boxNoStr, avatars]) => {
        const boxNo = parseInt(boxNoStr);
        const r = Math.floor(boxNo / cols);
        const col = (r % 2 === 0) ? (boxNo % cols) : (9 - (boxNo % cols));
        const row = 5 - r;
        // Avatar merkezi = kutunun ortası
        const boxCenterTop  = offsetY + row * stepY + boxSize / 2;
        const boxCenterLeft = offsetX + col * stepX + boxSize / 2;

        const count = avatars.length;
        avatars.forEach((av, idx) => {
            // Avatarları yatayda boşluk bırakarak diz (merkezden sola-sağa)
            const spacing = 22;
            const offsetHoriz = (idx - (count - 1) / 2) * spacing;
            const avatarLeft = boxCenterLeft + offsetHoriz - 24; // -24 = yarı avatar genişliği
            const avatarTop  = boxCenterTop  - 56; // avatar kutu üstüne taşsın

            const captainBadge = av.isCaptain
                ? '<span class="a2-captain-badge"><i class="fas fa-crown"></i></span>' : '';
            const nameLbl = `<span class="a2-avatar-name">${safeEsc((av.uname || '').substring(0, 10))}</span>`;
            const clsStr = (av.isCurrent ? 'current-user' : '') + (count > 1 ? (idx === 0 ? ' team-left' : ' team-right') : ' solo-token');

            html += `
                <div class="q-user-avatar ${clsStr}"
                     title="${safeEsc(av.uname)}${av.isCaptain ? ' 👑 Kaptan' : ''}"
                     style="top:${avatarTop}px; left:${avatarLeft}px; background:${av.avatarData.color};">
                    <i class="fas ${av.avatarData.icon}"></i>
                    ${captainBadge}
                    ${nameLbl}
                </div>
            `;
        });
    });

    html += `</div>`;
    container.innerHTML = html;
    a2EnsureActionPanel();
};

window.showArenaBoxInfo = function(boxNo) {
    const taskName = a2BoxTaskName(boxNo, currentUser);
    const st = a2CurrentState(currentUser);
    const isCurrentBox = (boxNo === st.currentBox && !st.isFinished);
    const isCompleted  = (boxNo <= st.approvedBoxes);
    const isLocked     = (!isCompleted && !isCurrentBox);

    const stateLabel = isCompleted
        ? '<span style="color:#10b981;"><i class="fas fa-check-circle"></i> Tamamlandı</span>'
        : isCurrentBox
            ? (st.pendingMove
                ? '<span style="color:#fbbf24;"><i class="fas fa-hourglass-half"></i> Admin onayı bekleniyor</span>'
                : '<span style="color:#67e8f9;"><i class="fas fa-star"></i> Aktif kutu - göreve hazır!</span>')
            : '<span style="color:#94a3b8;"><i class="fas fa-lock"></i> Henüz açılmadı</span>';

    // Sadece aktif kutuda ve kaptan ise bildir butonu
    const canSubmit = isCurrentBox && st.isCaptain && !st.pendingMove && st.currentTask;
    const submitBtnHtml = canSubmit ? `
        <button class="a2-box-submit-btn" onclick="Swal.close(); setTimeout(() => window.openNewTaskModal(), 150);">
            <i class="fas fa-paper-plane"></i>&nbsp; Bu Görevi Bildir — Kutu ${boxNo}
        </button>` : '';

    const pendingWarning = (isCurrentBox && st.pendingMove) ? `
        <div style="margin-top:10px; padding:8px; border-radius:10px; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.25); color:#fde68a; font-size:0.80rem;">
            <i class="fas fa-clock"></i> Bu kutu için admin onayı bekleniyor. Onay gelene kadar yeni bildiri yapamazsın.
        </div>` : '';

    const captainNote = (isCurrentBox && !st.isCaptain) ? `
        <div style="margin-top:8px; padding:8px; border-radius:10px; background:rgba(139,92,246,0.12); border:1px solid rgba(139,92,246,0.22); color:#c4b5fd; font-size:0.80rem;">
            <i class="fas fa-crown"></i> Görev bildirimi sadece takım kaptanı <b>${safeEsc(st.captain)}</b> tarafından yapılabilir.
        </div>` : '';

    return Swal.fire({
        title: `${boxNo}. Kutu`,
        html: `
            <div style="text-align:left">
                <div style="margin-bottom:8px;"><b>Durum:</b> ${stateLabel}</div>
                <div style="padding:10px; border-radius:12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); margin-top:8px;">
                    <div style="font-size:0.72rem; color:#94a3b8; margin-bottom:4px;">Bu kutunun görevi</div>
                    <div style="font-weight:800; color:#fff;">${safeEsc((taskName && taskName !== 'Görev atanmadı') ? taskName : '⚠ Henüz görev atanmadı')}</div>
                </div>
                <div style="margin-top:8px; font-size:.82rem; color:#64748b;">
                    ${isCurrentBox ? '👉 Bu kutudaki görevin onaylanması gerekmektedir.' : (isCompleted ? '✅ Bu kutu daha önce tamamlandı.' : '🔒 Bu kutuya ulaşman için önceki görevleri tamamlaman gerekiyor.')}
                </div>
                ${pendingWarning}
                ${captainNote}
                ${submitBtnHtml}
            </div>
        `,
        background: '#0f172a',
        color: '#fff',
        confirmButtonText: 'Tamam'
    });
};

const a2Style = document.createElement('style');
a2Style.textContent = `
    .arena2-chip{padding:9px 12px;border-radius:14px;font-size:.78rem;font-weight:700;border:1px solid transparent}
    .arena2-chip-info{background:rgba(34,211,238,.10);border-color:rgba(34,211,238,.18);color:#a5f3fc}
    .arena2-chip-warn{background:rgba(251,191,36,.10);border-color:rgba(251,191,36,.18);color:#fde68a}
    .arena2-chip-success{background:rgba(16,185,129,.10);border-color:rgba(16,185,129,.18);color:#86efac}
`;
document.head.appendChild(a2Style);
// ===== End Arena 2.0 UX polish override =====


// ===== Arena 2.0 final polish + competition_settings sync override v9.6.0 =====
window.ARENA2_VERSION = '12.1.0';

const _a2OldSequenceMap = typeof a2SequenceMap === 'function' ? a2SequenceMap : null;
const _a2OldSaveSequenceMap = typeof a2SaveSequenceMap === 'function' ? a2SaveSequenceMap : null;

window._arena2SequenceCache = window._arena2SequenceCache || {};
window._arena2SeqLoaded = false;
window._arena2SeqLoading = false;

window.a2RefreshSequenceCache = async function(force = false) {
    if (window._arena2SeqLoading) return window._arena2SequenceCache || {};
    if (window._arena2SeqLoaded && !force) return window._arena2SequenceCache || {};

    window._arena2SeqLoading = true;
    try {
        let mapObj = null;

        if (typeof sb !== 'undefined' && sb?.from) {
            try {
                const { data, error } = await sb.from('competition_settings')
                    .select('key,value')
                    .eq('key', 'arena_sequence')
                    .limit(1);

                if (!error && data && data.length) {
                    const row = data[0];
                    const raw = row?.value;
                    if (typeof raw === 'string') {
                        try { mapObj = JSON.parse(raw); } catch (_) { mapObj = {}; }
                    } else if (raw && typeof raw === 'object') {
                        mapObj = raw;
                    }
                }
            } catch (e) {
                console.warn('[Arena2] competition_settings read fallback', e);
            }
        }

        if (!mapObj && _a2OldSequenceMap) {
            mapObj = _a2OldSequenceMap() || {};
        }

        window._arena2SequenceCache = (mapObj && typeof mapObj === 'object') ? mapObj : {};
        window._arena2SeqLoaded = true;
        return window._arena2SequenceCache;
    } finally {
        window._arena2SeqLoading = false;
    }
};

a2SequenceMap = function() {
    if (window._arena2SeqLoaded) return window._arena2SequenceCache || {};
    try {
        if (window._arena2SequenceCache && Object.keys(window._arena2SequenceCache).length) {
            return window._arena2SequenceCache;
        }
        return _a2OldSequenceMap ? (_a2OldSequenceMap() || {}) : {};
    } catch (e) {
        console.error('[Arena2] sequence cache error', e);
        return {};
    }
};

a2SaveSequenceMap = async function(mapObj) {
    const cleanMap = {};
    for (let i = 1; i <= A2_TOTAL_BOXES; i++) {
        cleanMap[i] = mapObj && mapObj[i] ? Number(mapObj[i]) : null;
    }

    let lastError = null;

    if (typeof sb !== 'undefined' && sb?.from) {
        try {
            const payload = { key: 'arena_sequence', value: cleanMap };
            let resp = await sb.from('competition_settings').upsert(payload, { onConflict: 'key' });
            lastError = resp?.error || null;

            if (lastError) {
                const existing = await sb.from('competition_settings').select('key').eq('key', 'arena_sequence').limit(1);
                if (!existing.error && existing.data && existing.data.length) {
                    const upd = await sb.from('competition_settings').update({ value: cleanMap }).eq('key', 'arena_sequence');
                    lastError = upd?.error || null;
                } else {
                    const ins = await sb.from('competition_settings').insert(payload);
                    lastError = ins?.error || null;
                }
            }
        } catch (e) {
            lastError = e;
        }
    }

    if (lastError) {
        console.warn('[Arena2] competition_settings save fallback', lastError);
        if (_a2OldSaveSequenceMap) {
            await _a2OldSaveSequenceMap(cleanMap);
        }
    }

    window._arena2SequenceCache = cleanMap;
    window._arena2SeqLoaded = true;
    await syncCompetitionData();
    return cleanMap;
};

const _oldOpenArenaSequencePanel = window.openArenaSequencePanel;
window.openArenaSequencePanel = async function() {
    await syncCompetitionData();
    await window.a2RefreshSequenceCache(true);

    const regularTasks = a2RegularTasks();
    if (!regularTasks.length) {
        return Swal.fire('Görev Yok', 'Önce görev tanımı eklemelisin.', 'warning');
    }

    const seq = a2SequenceMap();
    const optionRows = regularTasks.map(t => `<option value="${t.id}">${safeEsc(t.task_name)}</option>`).join('');

    let rows = '';
    for (let i = 1; i <= A2_TOTAL_BOXES; i++) {
        rows += `
            <tr>
                <td style="padding:8px; border-bottom:1px solid rgba(148,163,184,.14); font-weight:800;">${i}</td>
                <td style="padding:8px; border-bottom:1px solid rgba(148,163,184,.14);">
                    <select id="arena2-box-task-${i}" style="width:100%; padding:10px; border-radius:10px; background:#0f172a; color:#fff; border:1px solid #334155;">
                        <option value="">Görev seçilmedi</option>
                        ${optionRows}
                    </select>
                </td>
            </tr>
        `;
    }

    const result = await Swal.fire({
        title: 'Kutu Görev Atama Merkezi',
        html: `
            <div style="text-align:left; margin-bottom:10px; color:#cbd5e1; font-size:.86rem;">
                Bu ayar <b>competition_settings</b> tablosundaki <b>arena_sequence</b> kaydına yazılır.
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
                <button type="button" id="arena2-fill-first-task" class="swal2-confirm swal2-styled" style="background:#2563eb;">Boşları ilk görevle doldur</button>
                <button type="button" id="arena2-clear-all" class="swal2-deny swal2-styled" style="background:#475569;">Tümünü temizle</button>
            </div>
            <div style="max-height:58vh; overflow:auto; border:1px solid rgba(148,163,184,.14); border-radius:14px;">
                <table style="width:100%; border-collapse:collapse; font-size:.86rem;">
                    <thead style="position:sticky; top:0; background:#020617; z-index:2;">
                        <tr>
                            <th style="padding:10px; text-align:left;">Kutu</th>
                            <th style="padding:10px; text-align:left;">Görev</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `,
        width: 840,
        background: '#020617',
        color: '#fff',
        showCancelButton: true,
        confirmButtonText: 'Kaydet',
        cancelButtonText: 'İptal',
        didOpen: () => {
            for (let i = 1; i <= A2_TOTAL_BOXES; i++) {
                const el = document.getElementById(`arena2-box-task-${i}`);
                if (el && seq[i]) el.value = String(seq[i]);
            }

            const fillBtn = document.getElementById('arena2-fill-first-task');
            const clearBtn = document.getElementById('arena2-clear-all');

            if (fillBtn) {
                fillBtn.onclick = () => {
                    const firstId = regularTasks[0]?.id;
                    if (!firstId) return;
                    for (let i = 1; i <= A2_TOTAL_BOXES; i++) {
                        const el = document.getElementById(`arena2-box-task-${i}`);
                        if (el && !el.value) el.value = String(firstId);
                    }
                };
            }

            if (clearBtn) {
                clearBtn.onclick = () => {
                    for (let i = 1; i <= A2_TOTAL_BOXES; i++) {
                        const el = document.getElementById(`arena2-box-task-${i}`);
                        if (el) el.value = '';
                    }
                };
            }
        },
        preConfirm: () => {
            const map = {};
            for (let i = 1; i <= A2_TOTAL_BOXES; i++) {
                const el = document.getElementById(`arena2-box-task-${i}`);
                map[i] = (el && el.value) ? Number(el.value) : null;
            }
            return map;
        }
    });

    if (!result.isConfirmed) return;

    try {
        await a2SaveSequenceMap(result.value || {});
        await window.a2RefreshSequenceCache(true);
        renderCompetitionBoard();
        a2EnsureActionPanel();
        return Swal.fire('Kaydedildi', 'Kutu görevleri competition_settings tablosuna yazıldı.', 'success');
    } catch (e) {
        console.error(e);
        return Swal.fire('Hata', e?.message || 'Görev atama kaydedilemedi.', 'error');
    }
};

const _oldOpenAdminConfigPanel = window.openAdminConfigPanel;
window.openAdminConfigPanel = async function() {
    await syncCompetitionData();
    const regular = a2RegularTasks();
    const html = `
        <div style="text-align:left;">
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
                <button onclick="openArenaSequencePanel()" class="x-btn x-btn-primary" style="padding:10px 14px; background:#7c3aed; color:#fff;">
                    <i class="fas fa-grid-2"></i> KUTU GÖREV AYARLARI
                </button>
                <button onclick="addNewTaskType()" class="x-btn x-btn-primary" style="padding:10px 14px;">
                    <i class="fas fa-plus"></i> Yeni Görev Tanımı
                </button>
            </div>
            <div style="padding:12px; border-radius:14px; background:rgba(15,23,42,.72); border:1px solid rgba(148,163,184,.14); margin-bottom:14px; color:#cbd5e1; font-size:.84rem;">
                Görev sıralaması artık <b>competition_settings</b> tablosundaki <b>arena_sequence</b> kaydından okunur.
            </div>
            <div style="max-height:48vh; overflow:auto; border:1px solid rgba(148,163,184,.12); border-radius:14px;">
                <table style="width:100%; border-collapse:collapse; font-size:.85rem;">
                    <thead style="position:sticky; top:0; background:#020617;">
                        <tr>
                            <th style="padding:10px; text-align:left;">Görev</th>
                            <th style="padding:10px; text-align:center;">Adım</th>
                            <th style="padding:10px; text-align:right;">İşlem</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${regular.map(c => `
                            <tr style="border-bottom:1px solid rgba(148,163,184,.14);">
                                <td style="padding:10px;">${safeEsc(c.task_name)}</td>
                                <td style="padding:10px; text-align:center; font-weight:800;">${c.steps}</td>
                                <td style="padding:10px; text-align:right; display:flex; gap:6px; justify-content:flex-end;">
                                    <button onclick="editTaskType(${c.id})" class="x-btn" style="padding:4px 8px; font-size:.72rem; background:#475569; color:white;"><i class="fas fa-edit"></i></button>
                                    <button onclick="deleteTaskType(${c.id})" class="x-btn" style="padding:4px 8px; font-size:.72rem; background:#ef4444; color:white;"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    return Swal.fire({
        title: 'Arena Yönetim Merkezi',
        html,
        width: 920,
        background: '#020617',
        color: '#fff',
        confirmButtonText: 'Kapat'
    });
};

window.renderCompetitionBoard = function() {
    const container = document.getElementById('q-comp-board');
    if (!container) return;

    if (!window._arena2SeqLoaded) {
        window.a2RefreshSequenceCache(true).then(() => {
            try { window.renderCompetitionBoard(); } catch(_) {}
        });
    }

    const totalBoxes = A2_TOTAL_BOXES;
    const cols = 10;
    const stage = container.closest('.arena2-board-wrapper') || container.parentElement || document.body;
    const stageWidth = Math.max(stage ? stage.clientWidth : 1280, 980);

    let boxSize = 74, stepX = 84, stepY = 96, offsetX = 16, offsetY = 16;
    if (stageWidth >= 1750) {
        boxSize = 90; stepX = 100; stepY = 108; offsetX = 20; offsetY = 18;
    } else if (stageWidth >= 1520) {
        boxSize = 84; stepX = 94; stepY = 102; offsetX = 18; offsetY = 18;
    } else if (stageWidth >= 1320) {
        boxSize = 78; stepX = 88; stepY = 98; offsetX = 16; offsetY = 16;
    }

    const lineThickness = Math.max(8, Math.round(boxSize * 0.11));
    const lineOffset = Math.round(boxSize / 2);
    const boardWidth = offsetX * 2 + stepX * 9 + boxSize;
    const boardHeight = offsetY * 2 + stepY * 5 + boxSize;
    const st = a2CurrentState(currentUser);

    let html = `<div class="q-comp-path-container arena96-board" style="position:relative;width:${boardWidth}px;height:${boardHeight}px;">`;

    for (let i = 0; i < totalBoxes; i++) {
        const r1 = Math.floor(i / cols), c1 = (r1 % 2 === 0) ? (i % cols) : (9 - (i % cols));
        const next = i + 1;
        const r2 = Math.floor(next / cols), c2 = (r2 % 2 === 0) ? (next % cols) : (9 - (next % cols));
        const vr1 = 5 - r1, vr2 = 5 - r2;
        const x1 = offsetX + c1 * stepX + lineOffset, y1 = offsetY + vr1 * stepY + lineOffset;
        const x2 = offsetX + c2 * stepX + lineOffset, y2 = offsetY + vr2 * stepY + lineOffset;
        const isHorizontal = vr1 === vr2;
        const width = isHorizontal ? Math.abs(x2 - x1) : lineThickness;
        const height = isHorizontal ? lineThickness : Math.abs(y2 - y1);
        const top = Math.min(y1, y2);
        const left = Math.min(x1, x2);
        const pathDone = (i + 1) <= st.approvedBoxes;
        const pathActive = !pathDone && st.currentBox === (i + 1);
        html += `<div class="q-comp-path-line ${pathDone ? 'is-done' : ''} ${pathActive ? 'is-active' : ''}" style="top:${top}px;left:${left}px;width:${width}px;height:${height}px;position:absolute;z-index:2;"></div>`;
    }

    const gemClasses = ['gem-ruby', 'gem-sapphire', 'gem-emerald', 'gem-gold', 'gem-amethyst'];

    // Milestone ikon seti — takım/solo aktif kutularında dinamik gösterilecek
    const MILESTONE_ICONS = ['🗼','🛡️','🪧','💰','⚔️','🏹','🧿','🔮','🌟','🗺️'];
    // Her teamKey → kutunun milestone simgesi (stabil görünüm için seed kullan)
    function milestoneForBox(teamKey, boxNo) {
        // Basit seed: teamKey uzunluğu + boxNo modulo icon sayısı
        const seed = (String(teamKey).length * 7 + Number(boxNo) * 13) % MILESTONE_ICONS.length;
        return MILESTONE_ICONS[seed];
    }

    // Aktif kutular haritasını önceden hazırla: boxNo → [teamKey]
    const activeMilestoneMap = {}; // boxNo → emoji string

    const teamsForMilestone = (userTeams || []).filter(t => t && t.status === 'active');
    teamsForMilestone.forEach(team => {
        const teamKey = team.id ? `team:${team.id}` : `team:${team.user_a}:${team.user_b}`;
        const approved = Math.min(a2ApprovedBoxCount(teamKey), totalBoxes);
        const activeBox = approved + 1 <= totalBoxes ? approved + 1 : null;
        if (activeBox) {
            activeMilestoneMap[activeBox] = activeMilestoneMap[activeBox] || milestoneForBox(teamKey, activeBox);
        }
    });
    // Solo kullanıcılar
    const knownUsersForMilestone = new Set([currentUser]);
    (competitionMoves || []).forEach(m => { if (m && m.user_name) knownUsersForMilestone.add(m.user_name); });
    [...knownUsersForMilestone].forEach(uname => {
        if (!uname) return;
        if (teamsForMilestone.some(t => t.user_a === uname || t.user_b === uname)) return;
        const approved = Math.min(a2ApprovedBoxCount(`solo:${uname}`), totalBoxes);
        const activeBox = approved + 1 <= totalBoxes ? approved + 1 : null;
        if (activeBox) {
            activeMilestoneMap[activeBox] = activeMilestoneMap[activeBox] || milestoneForBox(`solo:${uname}`, activeBox);
        }
    });

    for (let i = 0; i <= totalBoxes; i++) {
        let typeClass = '', extraStyle = '', extraAttrs = '', numberHtml = '', taskHtml = '', stateClass = '';
        let dynamicMilestoneHtml = '';

        if (i === 0) {
            typeClass = 'start';
            numberHtml = '<div class="q-step-box-number"><i class="fas fa-flag-checkered"></i></div>';
            taskHtml = '<div class="q-step-box-task fixed-label">Başlangıç</div>';
        } else if (i === totalBoxes) {
            typeClass = 'finish has-milestone milestone-castle';
            numberHtml = '<div class="q-step-box-number"><i class="fas fa-chess-rook"></i></div>';
            taskHtml = '<div class="q-step-box-task fixed-label">Büyük Ödül</div>';
            extraStyle = 'cursor:pointer;';
            extraAttrs = `title="Final" onclick="handleGrandPrizeClick()"`;
            dynamicMilestoneHtml = '<div class="a2-milestone-badge milestone-castle" style="position:absolute;top:-14px;right:-10px;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:1.1rem;background:linear-gradient(180deg,#fde68a,#f59e0b);box-shadow:0 8px 18px rgba(0,0,0,.25);border:2px solid rgba(255,255,255,.75);z-index:4;">🏆</div>';
            if (st.approvedBoxes >= totalBoxes) stateClass = 'is-complete';
        } else {
            const taskName = a2BoxTaskName(i, currentUser);
            const hasTask = !!taskName && taskName !== 'Görev atanmadı';
            const isCurrent = i === st.currentBox && !st.isFinished;
            const isDone = i <= st.approvedBoxes;
            const label = isCurrent ? 'Sıradaki Görev' : '';
            typeClass = gemClasses[i % gemClasses.length];
            numberHtml = `<div class="q-step-box-number">${i}</div>`;
            taskHtml = `
                ${label ? `<div class="q-step-box-task next-task-label">${safeEsc(label)}</div>` : ''}
                <div class="a2-box-hover-hint">${isCurrent ? 'Aktif görev kutusu' : (hasTask ? 'Detay için tıkla' : 'Henüz görev seçilmedi')}</div>
            `;
            extraAttrs = `title="${safeEsc(hasTask ? taskName : ('Kutu ' + i))}" onclick="window.showArenaBoxInfo(${i})"`;
            extraStyle = 'cursor:pointer;';
            if (isDone) stateClass += ' is-complete';
            if (isCurrent) stateClass += ' current-box';
            if (st.pendingMove && isCurrent) stateClass += ' pending-box';
            if (!hasTask) stateClass += ' is-unassigned';

            // Dinamik milestone: bu kutuda aktif bir takım var mı?
            if (activeMilestoneMap[i]) {
                const emoji = activeMilestoneMap[i];
                dynamicMilestoneHtml = `<div class="a2-milestone-badge" style="position:absolute;top:-14px;right:-10px;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-size:1rem;background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(255,240,182,.88));box-shadow:0 8px 18px rgba(0,0,0,.22),0 0 18px rgba(250,204,21,.26);border:2px solid rgba(255,255,255,.75);z-index:4;animation:milestonePop 0.4s cubic-bezier(.34,1.56,.64,1) both;">${emoji}</div>`;
            }
        }

        const r = Math.floor(i / cols);
        const col = (r % 2 === 0) ? (i % cols) : (9 - (i % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY;
        const left = offsetX + col * stepX;

        html += `
            <div class="q-step-box ${typeClass} ${stateClass.trim()}" ${extraAttrs}
                 style="position:absolute;top:${top}px;left:${left}px;width:${boxSize}px;height:${boxSize}px;z-index:20;${extraStyle}">
                ${dynamicMilestoneHtml}
                <div class="q-step-box-inner">
                    ${numberHtml}
                    ${taskHtml}
                </div>
            </div>
        `;
    }

    const renderedSolo = new Set();
    const teams = (userTeams || []).filter(t => t && t.status === 'active');

    teams.forEach((team) => {
        const teamKey = team.id ? `team:${team.id}` : `team:${team.user_a}:${team.user_b}`;
        const approved = Math.min(a2ApprovedBoxCount(teamKey), totalBoxes);
        const r = Math.floor(approved / cols);
        const col = (r % 2 === 0) ? (approved % cols) : (9 - (approved % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY + 3;
        const left = offsetX + col * stepX + 6;

        [team.user_a, team.user_b].forEach((uname, idx) => {
            if (!uname) return;
            renderedSolo.add(uname);
            const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || (idx === 0 ? 'm1' : 'f1');
            const avatarData = AVATAR_MAP[avatarId] || AVATAR_MAP['m1'];
            const isCaptain = uname === team.user_a;
            const isCurrent = uname === currentUser;
            const cls = idx === 0 ? 'team-left' : 'team-right';

            html += `
                <div class="q-user-avatar ${isCurrent ? 'current-user' : ''} ${cls}"
                     title="${safeEsc(uname)}${isCaptain ? ' (Kaptan)' : ''}"
                     style="top:${top}px;left:${left}px;z-index:40;background:${avatarData.color};">
                    <i class="fas ${avatarData.icon}"></i>
                    ${isCaptain ? '<span class="a2-captain-badge"><i class="fas fa-crown"></i></span>' : ''}
                </div>
            `;
        });
    });

    const knownUsers = new Set([currentUser]);
    (competitionMoves || []).forEach(m => { if (m && m.user_name) knownUsers.add(m.user_name); });

    [...knownUsers].forEach((uname) => {
        if (!uname || renderedSolo.has(uname)) return;
        const approved = Math.min(a2ApprovedBoxCount(`solo:${uname}`), totalBoxes);
        const r = Math.floor(approved / cols);
        const col = (r % 2 === 0) ? (approved % cols) : (9 - (approved % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY + 5;
        const left = offsetX + col * stepX + 10;
        const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || 'm1';
        const avatarData = AVATAR_MAP[avatarId] || AVATAR_MAP['m1'];

        html += `
            <div class="q-user-avatar ${uname === currentUser ? 'current-user' : ''} solo-token"
                 title="${safeEsc(uname)}"
                 style="top:${top}px;left:${left}px;z-index:35;background:${avatarData.color};">
                <i class="fas ${avatarData.icon}"></i>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
    a2EnsureActionPanel();
};

window.showArenaBoxInfo = function(boxNo) {
    const taskName = a2BoxTaskName(boxNo, currentUser);
    const hasTask = !!taskName && taskName !== 'Görev atanmadı';
    const st = a2CurrentState(currentUser);
    const isCurrentBox = (boxNo === st.currentBox && !st.isFinished);
    const isCompleted  = (boxNo <= st.approvedBoxes);

    // Durum etiketi
    const stateLabel = isCompleted
        ? '<span style="color:#10b981;"><i class="fas fa-check-circle"></i> Tamamlandı</span>'
        : isCurrentBox
            ? (st.pendingMove
                ? '<span style="color:#fbbf24;"><i class="fas fa-hourglass-half"></i> Admin onayı bekleniyor</span>'
                : '<span style="color:#67e8f9;"><i class="fas fa-star"></i> Sıradaki Görev — Hazır!</span>')
            : '<span style="color:#94a3b8;"><i class="fas fa-lock"></i> Henüz açılmadı</span>';

    // Segment bilgisi (tipi, hangi kutular arası)
    const seg = typeof a2FindSegmentByBox === 'function' ? a2FindSegmentByBox(boxNo) : null;
    const segInfo = seg ? `
        <div style="margin-top:6px; font-size:.78rem; color:#94a3b8;">
            <span style="color:#cbd5e1;"><b>Tip:</b></span> ${seg.task_name === taskName ? 'Normal Görev' : 'Özel Görev'}
            &nbsp;·&nbsp;
            <span style="color:#cbd5e1;"><b>Segment:</b></span> Kutu ${seg.start_box}–${seg.end_box}
            &nbsp;·&nbsp;
            <span style="color:#cbd5e1;"><b>Adım:</b></span> ${boxNo - seg.start_box + 1}/${seg.steps}
        </div>` : '';

    // Bildir butonu — sadece aktif kutuda, kaptan ise ve görev varsa
    const canSubmit = isCurrentBox && st.isCaptain && !st.pendingMove && st.currentTask;
    const submitBtnHtml = canSubmit ? `
        <button class="a2-box-submit-btn" onclick="Swal.close(); setTimeout(() => window.openNewTaskModal(), 120);">
            <i class="fas fa-paper-plane"></i>&nbsp; Bu Görevi Bildir — Kutu ${boxNo}
        </button>` : '';

    const pendingWarning = (isCurrentBox && st.pendingMove) ? `
        <div style="margin-top:10px; padding:8px 10px; border-radius:10px; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.25); color:#fde68a; font-size:0.80rem;">
            <i class="fas fa-clock"></i> Bu kutu için admin onayı bekleniyor.
        </div>` : '';

    const captainNote = (isCurrentBox && !st.isCaptain) ? `
        <div style="margin-top:8px; padding:8px 10px; border-radius:10px; background:rgba(139,92,246,0.12); border:1px solid rgba(139,92,246,0.22); color:#c4b5fd; font-size:0.80rem;">
            <i class="fas fa-crown"></i> Görevi sadece kaptan <b>${safeEsc(st.captain)}</b> bildirebilir.
        </div>` : '';

    return Swal.fire({
        title: `${boxNo}. Kutu`,
        html: `
            <div style="text-align:left">
                <div style="margin-bottom:8px;"><b>Durum:</b> ${stateLabel}</div>
                <div style="padding:10px; border-radius:12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); margin-top:8px;">
                    <div style="font-size:0.72rem; color:#94a3b8; margin-bottom:4px;">Atanmış görev</div>
                    <div style="font-weight:800; color:#fff; font-size:0.95rem;">${safeEsc(hasTask ? taskName : '⚠ Henüz görev atanmadı')}</div>
                    ${segInfo}
                </div>
                <div style="margin-top:8px; font-size:.80rem; color:#64748b;">
                    ${isCurrentBox ? '👉 Bu kutudaki görevi tamamladıktan sonra admin onayına gönder.' : (isCompleted ? '✅ Bu kutu tamamlandı.' : '🔒 Bu kutuya ulaşmak için önceki kutuları tamamla.')}
                </div>
                ${pendingWarning}
                ${captainNote}
                ${submitBtnHtml}
            </div>
        `,
        background: '#0f172a',
        color: '#fff',
        confirmButtonText: 'Tamam'
    });
};

setTimeout(() => {
    try {
        window.a2RefreshSequenceCache(true).then(() => {
            if (typeof renderCompetitionBoard === 'function') renderCompetitionBoard();
        });
    } catch (e) {
        console.warn('[Arena2] sequence warmup error', e);
    }
}, 350);
// ===== End Arena 2.0 final polish + competition_settings sync override =====


// ===== Arena 2.0 flow-based progression override v9.7.0 =====
window.ARENA2_VERSION = '12.1.0';

window._arena2FlowCache = window._arena2FlowCache || [];
window._arena2FlowLoaded = false;
window._arena2FlowLoading = false;

window.a2RegularTasks = function() {
    return (competitionConfig || []).filter(c => c && c.type !== 'quiz' && c.is_active !== false);
};

window.a2ReadFlowFromSettings = async function(force = false) {
    if (window._arena2FlowLoading) return window._arena2FlowCache || [];
    if (window._arena2FlowLoaded && !force) return window._arena2FlowCache || [];

    window._arena2FlowLoading = true;
    try {
        let flow = [];

        if (typeof sb !== 'undefined' && sb?.from) {
            try {
                const { data, error } = await sb
                    .from('competition_settings')
                    .select('key,value')
                    .eq('key', 'arena_flow')
                    .limit(1);

                if (!error && data && data.length) {
                    const row = data[0];
                    const raw = row?.value;
                    if (Array.isArray(raw)) {
                        flow = raw;
                    } else if (typeof raw === 'string') {
                        try { flow = JSON.parse(raw); } catch (_) { flow = []; }
                    }
                }
            } catch (e) {
                console.warn('[Arena2] arena_flow read failed', e);
            }
        }

        if (!Array.isArray(flow)) flow = [];

        flow = flow
            .map((x, idx) => ({
                order: Number(x?.order || idx + 1),
                task_id: Number(x?.task_id || 0),
                steps: Math.max(1, Number(x?.steps || 1))
            }))
            .filter(x => x.task_id > 0);

        flow.sort((a, b) => a.order - b.order);

        window._arena2FlowCache = flow;
        window._arena2FlowLoaded = true;
        return flow;
    } finally {
        window._arena2FlowLoading = false;
    }
};

window.a2SaveFlowToSettings = async function(flowList) {
    const flow = (Array.isArray(flowList) ? flowList : [])
        .map((x, idx) => ({
            order: Number(x?.order || idx + 1),
            task_id: Number(x?.task_id || 0),
            steps: Math.max(1, Number(x?.steps || 1))
        }))
        .filter(x => x.task_id > 0);

    let lastError = null;

    if (typeof sb !== 'undefined' && sb?.from) {
        try {
            const payload = { key: 'arena_flow', value: flow };
            let res = await sb.from('competition_settings').upsert(payload, { onConflict: 'key' });
            lastError = res?.error || null;

            if (lastError) {
                const existing = await sb.from('competition_settings').select('key').eq('key', 'arena_flow').limit(1);
                if (!existing.error && existing.data && existing.data.length) {
                    const upd = await sb.from('competition_settings').update({ value: flow }).eq('key', 'arena_flow');
                    lastError = upd?.error || null;
                } else {
                    const ins = await sb.from('competition_settings').insert(payload);
                    lastError = ins?.error || null;
                }
            }
        } catch (e) {
            lastError = e;
        }
    }

    if (lastError) throw lastError;

    window._arena2FlowCache = flow;
    window._arena2FlowLoaded = true;
    return flow;
};

window.a2BuildSegments = function() {
    const flow = Array.isArray(window._arena2FlowCache) ? window._arena2FlowCache : [];
    const regularTasks = a2RegularTasks();
    const taskMap = new Map(regularTasks.map(t => [Number(t.id), t]));

    let startBox = 1;
    const segments = [];

    for (const item of flow) {
        const task = taskMap.get(Number(item.task_id));
        if (!task) continue;
        const steps = Math.max(1, Number(item.steps || task.steps || 1));
        const endBox = Math.min(A2_TOTAL_BOXES, startBox + steps - 1);
        segments.push({
            order: Number(item.order),
            task_id: Number(item.task_id),
            task_name: task.task_name,
            steps,
            start_box: startBox,
            end_box: endBox
        });
        startBox = endBox + 1;
        if (startBox > A2_TOTAL_BOXES) break;
    }

    return segments;
};

window.a2FindSegmentByBox = function(boxNo) {
    const segments = a2BuildSegments();
    return segments.find(seg => boxNo >= seg.start_box && boxNo <= seg.end_box) || null;
};

window.a2BoxTaskName = function(boxNo, userName) {
    const seg = a2FindSegmentByBox(boxNo);
    return seg ? seg.task_name : 'Görev atanmadı';
};

window.a2CurrentState = function(userName) {
    const teamKey = a2GetTeamKey(userName);
    const approvedBoxes = Math.min(a2ApprovedBoxCount(teamKey), A2_TOTAL_BOXES);
    const currentBox = Math.min(approvedBoxes + 1, A2_TOTAL_BOXES);
    const isFinished = approvedBoxes >= A2_TOTAL_BOXES;
    const currentSegment = isFinished ? null : a2FindSegmentByBox(currentBox);
    const captain = a2CaptainName(userName);
    const rerollsLeft = a2GetRerollsLeft(teamKey);
    const pendingMove = a2HasPendingMove(teamKey, currentBox);
    return {
        approvedBoxes,
        currentBox,
        currentTask: currentSegment ? { id: currentSegment.task_id, task_name: currentSegment.task_name, steps: currentSegment.steps } : null,
        currentSegment,
        isFinished,
        isCaptain: currentUser === captain,
        captain,
        pendingMove,
        rerollsLeft
    };
};

const _oldA2EnsureActionPanel = typeof a2EnsureActionPanel === 'function' ? a2EnsureActionPanel : null;

window.openArenaSequencePanel = async function() {
    await syncCompetitionData();
    await a2ReadFlowFromSettings(true);

    const regularTasks = a2RegularTasks();
    if (!regularTasks.length) {
        return Swal.fire('Görev Yok', 'Önce görev tanımı eklemelisin.', 'warning');
    }

    const flow = Array.isArray(window._arena2FlowCache) && window._arena2FlowCache.length
        ? window._arena2FlowCache
        : regularTasks.slice(0, 10).map((t, idx) => ({ order: idx + 1, task_id: Number(t.id), steps: Math.max(1, Number(t.steps || 1)) }));

    const taskOptions = regularTasks.map(t => `<option value="${t.id}">${safeEsc(t.task_name)}</option>`).join('');

    const rowsHtml = () => {
        return Array.from({ length: 20 }, (_, idx) => {
            const item = flow[idx] || { order: idx + 1, task_id: '', steps: 1 };
            return `
                <tr>
                    <td style="padding:8px; border-bottom:1px solid rgba(148,163,184,.14); font-weight:800;">${idx + 1}</td>
                    <td style="padding:8px; border-bottom:1px solid rgba(148,163,184,.14);">
                        <select id="arena2-flow-task-${idx+1}" style="width:100%; padding:10px; border-radius:10px; background:#0f172a; color:#fff; border:1px solid #334155;">
                            <option value="">Görev seç</option>
                            ${taskOptions}
                        </select>
                    </td>
                    <td style="padding:8px; border-bottom:1px solid rgba(148,163,184,.14); width:120px;">
                        <input id="arena2-flow-steps-${idx+1}" type="number" min="1" max="20" value="${Number(item.steps || 1)}"
                            style="width:100%; padding:10px; border-radius:10px; background:#0f172a; color:#fff; border:1px solid #334155;" />
                    </td>
                </tr>
            `;
        }).join('');
    };

    const result = await Swal.fire({
        title: 'Görev Akışı ve Adım Yönetimi',
        html: `
            <div style="text-align:left; margin-bottom:10px; color:#cbd5e1; font-size:.86rem;">
                Mantık: <b>1. sıradaki görev</b> başta görünür. Görev tamamlanınca sistem o görevin <b>adım</b> sayısı kadar alanı bitmiş sayar ve otomatik olarak <b>bir sonraki sıradaki görevi</b> açar.
            </div>
            <div style="padding:12px; border-radius:14px; background:rgba(15,23,42,.72); border:1px solid rgba(148,163,184,.14); margin-bottom:12px; color:#cbd5e1; font-size:.84rem;">
                Bu ayar <b>competition_settings</b> tablosunda <b>arena_flow</b> anahtarına yazılır.
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
                <button type="button" id="arena2-auto-fill-flow" class="swal2-confirm swal2-styled" style="background:#2563eb;">Görevlerin steps değeriyle otomatik doldur</button>
                <button type="button" id="arena2-clear-flow" class="swal2-deny swal2-styled" style="background:#475569;">Temizle</button>
                <button type="button" id="arena2-preview-flow" class="swal2-confirm swal2-styled" style="background:#7c3aed;">Kutu Önizleme</button>
            </div>
            <div style="max-height:58vh; overflow:auto; border:1px solid rgba(148,163,184,.14); border-radius:14px;">
                <table style="width:100%; border-collapse:collapse; font-size:.86rem;">
                    <thead style="position:sticky; top:0; background:#020617; z-index:2;">
                        <tr>
                            <th style="padding:10px; text-align:left; width:70px;">Sıra</th>
                            <th style="padding:10px; text-align:left;">Görev</th>
                            <th style="padding:10px; text-align:left; width:120px;">Adım</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml()}</tbody>
                </table>
            </div>
        `,
        width: 980,
        background: '#020617',
        color: '#fff',
        showCancelButton: true,
        confirmButtonText: 'Kaydet',
        cancelButtonText: 'İptal',
        didOpen: () => {
            for (let i = 1; i <= 20; i++) {
                const item = flow[i - 1];
                const taskEl = document.getElementById(`arena2-flow-task-${i}`);
                const stepsEl = document.getElementById(`arena2-flow-steps-${i}`);
                if (taskEl && item?.task_id) taskEl.value = String(item.task_id);
                if (stepsEl && item?.steps) stepsEl.value = String(item.steps);
            }

            const autoBtn = document.getElementById('arena2-auto-fill-flow');
            const clearBtn = document.getElementById('arena2-clear-flow');
            const previewBtn = document.getElementById('arena2-preview-flow');

            if (autoBtn) {
                autoBtn.onclick = () => {
                    regularTasks.slice(0, 20).forEach((t, idx) => {
                        const taskEl = document.getElementById(`arena2-flow-task-${idx + 1}`);
                        const stepsEl = document.getElementById(`arena2-flow-steps-${idx + 1}`);
                        if (taskEl) taskEl.value = String(t.id);
                        if (stepsEl) stepsEl.value = String(Math.max(1, Number(t.steps || 1)));
                    });
                };
            }

            if (clearBtn) {
                clearBtn.onclick = () => {
                    for (let i = 1; i <= 20; i++) {
                        const taskEl = document.getElementById(`arena2-flow-task-${i}`);
                        const stepsEl = document.getElementById(`arena2-flow-steps-${i}`);
                        if (taskEl) taskEl.value = '';
                        if (stepsEl) stepsEl.value = '1';
                    }
                };
            }

            if (previewBtn) {
                previewBtn.onclick = async () => {
                    const previewFlow = [];
                    for (let i = 1; i <= 20; i++) {
                        const taskEl = document.getElementById(`arena2-flow-task-${i}`);
                        const stepsEl = document.getElementById(`arena2-flow-steps-${i}`);
                        if (taskEl && taskEl.value) {
                            previewFlow.push({
                                order: i,
                                task_id: Number(taskEl.value),
                                steps: Math.max(1, Number(stepsEl?.value || 1))
                            });
                        }
                    }
                    const taskMap = new Map(regularTasks.map(t => [Number(t.id), t]));
                    let start = 1;
                    const lines = [];
                    for (const item of previewFlow) {
                        const task = taskMap.get(item.task_id);
                        if (!task) continue;
                        const end = Math.min(A2_TOTAL_BOXES, start + item.steps - 1);
                        lines.push(`${start}-${end}: ${task.task_name} (${item.steps} adım)`);
                        start = end + 1;
                        if (start > A2_TOTAL_BOXES) break;
                    }
                    Swal.fire({
                        title: 'Kutu Önizleme',
                        html: `<div style="text-align:left; max-height:50vh; overflow:auto;">${lines.length ? lines.map(x => `<div style="margin:6px 0;">• ${safeEsc(x)}</div>`).join('') : 'Önizleme için görev seç.'}</div>`,
                        background: '#020617',
                        color: '#fff',
                        confirmButtonText: 'Tamam'
                    });
                };
            }
        },
        preConfirm: () => {
            const out = [];
            for (let i = 1; i <= 20; i++) {
                const taskEl = document.getElementById(`arena2-flow-task-${i}`);
                const stepsEl = document.getElementById(`arena2-flow-steps-${i}`);
                if (taskEl && taskEl.value) {
                    out.push({
                        order: i,
                        task_id: Number(taskEl.value),
                        steps: Math.max(1, Number(stepsEl?.value || 1))
                    });
                }
            }
            return out;
        }
    });

    if (!result.isConfirmed) return;

    try {
        await a2SaveFlowToSettings(result.value || []);
        await a2ReadFlowFromSettings(true);
        renderCompetitionBoard();
        if (_oldA2EnsureActionPanel) _oldA2EnsureActionPanel();
        return Swal.fire('Kaydedildi', 'Görev akışı kaydedildi. Artık görevler sırayla ve adım sayısına göre ilerleyecek.', 'success');
    } catch (e) {
        console.error(e);
        return Swal.fire('Hata', e?.message || 'Görev akışı kaydedilemedi.', 'error');
    }
};

window.openAdminConfigPanel = async function() {
    await syncCompetitionData();
    await a2ReadFlowFromSettings(true);
    const regular = a2RegularTasks();
    const segments = a2BuildSegments();

    const previewHtml = segments.length
        ? segments.map(seg => `
            <div style="padding:10px 12px; border-radius:12px; background:rgba(15,23,42,.74); border:1px solid rgba(148,163,184,.10); margin-bottom:8px;">
                <div style="font-weight:800;">${seg.order}. sıra — ${safeEsc(seg.task_name)}</div>
                <div style="margin-top:4px; color:#93c5fd; font-size:.83rem;">Kutu ${seg.start_box}-${seg.end_box} • ${seg.steps} adım</div>
            </div>
        `).join('')
        : '<div style="color:#94a3b8;">Henüz görev akışı oluşturulmadı.</div>';

    const html = `
        <div style="text-align:left;">
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
                <button onclick="openArenaSequencePanel()" class="x-btn x-btn-primary" style="padding:10px 14px; background:#7c3aed; color:#fff;">
                    <i class="fas fa-stream"></i> GÖREV AKIŞI AYARLARI
                </button>
                <button onclick="addNewTaskType()" class="x-btn x-btn-primary" style="padding:10px 14px;">
                    <i class="fas fa-plus"></i> Yeni Görev Tanımı
                </button>
            </div>
            <div style="padding:12px; border-radius:14px; background:rgba(15,23,42,.72); border:1px solid rgba(148,163,184,.14); margin-bottom:14px; color:#cbd5e1; font-size:.84rem;">
                Mantık: Sıraladığın görev bittiğinde, o görevin <b>adım</b> değeri kadar alan bitmiş kabul edilir ve sıradaki görev otomatik açılır.
            </div>
            <div style="margin-bottom:14px;">
                <div style="font-weight:800; margin-bottom:8px;">Akış Önizleme</div>
                <div style="max-height:220px; overflow:auto;">${previewHtml}</div>
            </div>
            <div style="max-height:36vh; overflow:auto; border:1px solid rgba(148,163,184,.12); border-radius:14px;">
                <table style="width:100%; border-collapse:collapse; font-size:.85rem;">
                    <thead style="position:sticky; top:0; background:#020617;">
                        <tr>
                            <th style="padding:10px; text-align:left;">Görev</th>
                            <th style="padding:10px; text-align:center;">Varsayılan Adım</th>
                            <th style="padding:10px; text-align:right;">İşlem</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${regular.map(c => `
                            <tr style="border-bottom:1px solid rgba(148,163,184,.14);">
                                <td style="padding:10px;">${safeEsc(c.task_name)}</td>
                                <td style="padding:10px; text-align:center; font-weight:800;">${c.steps}</td>
                                <td style="padding:10px; text-align:right; display:flex; gap:6px; justify-content:flex-end;">
                                    <button onclick="editTaskType(${c.id})" class="x-btn" style="padding:4px 8px; font-size:.72rem; background:#475569; color:white;"><i class="fas fa-edit"></i></button>
                                    <button onclick="deleteTaskType(${c.id})" class="x-btn" style="padding:4px 8px; font-size:.72rem; background:#ef4444; color:white;"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    return Swal.fire({
        title: 'Arena Yönetim Merkezi',
        html,
        width: 980,
        background: '#020617',
        color: '#fff',
        confirmButtonText: 'Kapat'
    });
};

window.openArenaReroll = async function() {
    const st = a2CurrentState(currentUser);
    if (!st.isCaptain) return Swal.fire('Yetki Yok', 'Sadece kaptan görevi değiştirebilir.', 'warning');
    if (st.rerollsLeft <= 0) return Swal.fire('Hak Bitti', 'Görev değiştirme hakkın kalmadı.', 'info');
    if (st.pendingMove) return Swal.fire('Bekle', 'Bu kutu için admin onayı bekleniyor.', 'warning');
    if (!st.currentSegment) return Swal.fire('Bilgi', 'Değiştirilecek aktif görev yok.', 'info');

    const regularTasks = a2RegularTasks().filter(t => Number(t.id) !== Number(st.currentSegment.task_id));
    if (!regularTasks.length) return Swal.fire('Görev Yok', 'Alternatif görev bulunamadı.', 'info');

    const picked = regularTasks[Math.floor(Math.random() * regularTasks.length)];
    const flow = (window._arena2FlowCache || []).map(x => ({...x}));
    const idx = flow.findIndex(x => Number(x.order) === Number(st.currentSegment.order));
    if (idx < 0) return Swal.fire('Hata', 'Aktif akış segmenti bulunamadı.', 'error');

    flow[idx].task_id = Number(picked.id);

    try {
        await a2SaveFlowToSettings(flow);
        const teamKey = a2GetTeamKey(currentUser);
        await a2ConsumeReroll(teamKey, st.currentBox, picked.id);
        await a2ReadFlowFromSettings(true);
        await syncCompetitionData();
        renderCompetitionBoard();
        if (_oldA2EnsureActionPanel) _oldA2EnsureActionPanel();
        return Swal.fire('Görev Değişti', `Yeni görev: ${picked.task_name}`, 'success');
    } catch (e) {
        console.error(e);
        return Swal.fire('Hata', e?.message || 'Görev değiştirilemedi.', 'error');
    }
};

window.renderCompetitionBoard = function() {
    const container = document.getElementById('q-comp-board');
    if (!container) return;

    if (!window._arena2FlowLoaded) {
        window.a2ReadFlowFromSettings(true).then(() => {
            try { window.renderCompetitionBoard(); } catch(_) {}
        });
    }

    const totalBoxes = A2_TOTAL_BOXES;
    const cols = 10;
    const stage = container.closest('.arena2-board-wrapper') || container.parentElement || document.body;
    const stageWidth = Math.max(stage ? stage.clientWidth : 1280, 980);

    let boxSize = 72, stepX = 82, stepY = 94, offsetX = 16, offsetY = 16;
    if (stageWidth >= 1750) {
        boxSize = 88; stepX = 98; stepY = 108; offsetX = 20; offsetY = 18;
    } else if (stageWidth >= 1520) {
        boxSize = 82; stepX = 92; stepY = 102; offsetX = 18; offsetY = 18;
    } else if (stageWidth >= 1320) {
        boxSize = 76; stepX = 86; stepY = 98; offsetX = 16; offsetY = 16;
    }

    const lineThickness = Math.max(8, Math.round(boxSize * 0.11));
    const lineOffset = Math.round(boxSize / 2);
    const boardWidth = offsetX * 2 + stepX * 9 + boxSize;
    const boardHeight = offsetY * 2 + stepY * 5 + boxSize;
    const st = a2CurrentState(currentUser);

    let html = `<div class="q-comp-path-container arena97-board" style="position:relative;width:${boardWidth}px;height:${boardHeight}px;">`;

    for (let i = 0; i < totalBoxes; i++) {
        const r1 = Math.floor(i / cols), c1 = (r1 % 2 === 0) ? (i % cols) : (9 - (i % cols));
        const next = i + 1;
        const r2 = Math.floor(next / cols), c2 = (r2 % 2 === 0) ? (next % cols) : (9 - (next % cols));
        const vr1 = 5 - r1, vr2 = 5 - r2;
        const x1 = offsetX + c1 * stepX + lineOffset, y1 = offsetY + vr1 * stepY + lineOffset;
        const x2 = offsetX + c2 * stepX + lineOffset, y2 = offsetY + vr2 * stepY + lineOffset;
        const isHorizontal = vr1 === vr2;
        const width = isHorizontal ? Math.abs(x2 - x1) : lineThickness;
        const height = isHorizontal ? lineThickness : Math.abs(y2 - y1);
        const top = Math.min(y1, y2);
        const left = Math.min(x1, x2);
        const pathDone = (i + 1) <= st.approvedBoxes;
        const pathActive = !pathDone && st.currentBox === (i + 1);
        html += `<div class="q-comp-path-line ${pathDone ? 'is-done' : ''} ${pathActive ? 'is-active' : ''}" style="top:${top}px;left:${left}px;width:${width}px;height:${height}px;position:absolute;z-index:2;"></div>`;
    }

    const gemClasses = ['gem-ruby', 'gem-sapphire', 'gem-emerald', 'gem-gold', 'gem-amethyst'];

    for (let i = 0; i <= totalBoxes; i++) {
        let typeClass = '', extraStyle = '', extraAttrs = '', numberHtml = '', taskHtml = '', stateClass = '';

        if (i === 0) {
            typeClass = 'start';
            numberHtml = '<div class="q-step-box-number"><i class="fas fa-flag-checkered"></i></div>';
            taskHtml = '<div class="q-step-box-task fixed-label">Başlangıç</div>';
        } else if (i === totalBoxes) {
            typeClass = 'finish';
            numberHtml = '<div class="q-step-box-number"><i class="fas fa-chess-rook"></i></div>';
            taskHtml = '<div class="q-step-box-task fixed-label">Büyük Ödül</div>';
            extraStyle = 'cursor:pointer;';
            extraAttrs = `title="Final" onclick="handleGrandPrizeClick()"`;
            if (st.approvedBoxes >= totalBoxes) stateClass = 'is-complete';
        } else {
            const seg = a2FindSegmentByBox(i);
            const taskName = seg ? seg.task_name : 'Görev atanmadı';
            const hasTask = !!seg;
            const isCurrent = i === st.currentBox && !st.isFinished;
            const isDone = i <= st.approvedBoxes;
            const isSegmentStart = !!seg && i === seg.start_box;
            const label = isCurrent ? 'Sıradaki Görev' : '';
            typeClass = gemClasses[i % gemClasses.length];
            numberHtml = `<div class="q-step-box-number">${i}</div>`;
            taskHtml = `
                ${label ? `<div class="q-step-box-task next-task-label">${safeEsc(label)}</div>` : ''}
                ${isSegmentStart && seg ? `<div class="q-step-box-sub">${seg.steps} adım</div>` : ''}
                <div class="a2-box-hover-hint">${isCurrent ? 'Aktif görev kutusu' : (hasTask ? `${seg.start_box}-${seg.end_box} segmenti` : 'Henüz görev seçilmedi')}</div>
            `;
            extraAttrs = `title="${safeEsc(hasTask ? (taskName + ' (' + seg.steps + ' adım)') : ('Kutu ' + i))}" onclick="window.showArenaBoxInfo(${i})"`;
            extraStyle = 'cursor:pointer;';
            if (isDone) stateClass += ' is-complete';
            if (isCurrent) stateClass += ' current-box';
            if (st.pendingMove && isCurrent) stateClass += ' pending-box';
            if (!hasTask) stateClass += ' is-unassigned';
            if (isSegmentStart) stateClass += ' is-segment-start';
        }

        const r = Math.floor(i / cols);
        const col = (r % 2 === 0) ? (i % cols) : (9 - (i % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY;
        const left = offsetX + col * stepX;

        html += `
            <div class="q-step-box ${typeClass} ${stateClass.trim()}" ${extraAttrs}
                 style="position:absolute;top:${top}px;left:${left}px;width:${boxSize}px;height:${boxSize}px;z-index:20;${extraStyle}">
                <div class="q-step-box-inner">
                    ${numberHtml}
                    ${taskHtml}
                </div>
            </div>
        `;
    }

    const renderedSolo = new Set();
    const teams = (userTeams || []).filter(t => t && t.status === 'active');

    teams.forEach((team) => {
        const teamKey = team.id ? `team:${team.id}` : `team:${team.user_a}:${team.user_b}`;
        const approved = Math.min(a2ApprovedBoxCount(teamKey), totalBoxes);
        const r = Math.floor(approved / cols);
        const col = (r % 2 === 0) ? (approved % cols) : (9 - (approved % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY + 3;
        const left = offsetX + col * stepX + 6;

        [team.user_a, team.user_b].forEach((uname, idx) => {
            if (!uname) return;
            renderedSolo.add(uname);
            const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || (idx === 0 ? 'm1' : 'f1');
            const avatarData = AVATAR_MAP[avatarId] || AVATAR_MAP['m1'];
            const isCaptain = uname === team.user_a;
            const isCurrent = uname === currentUser;
            const cls = idx === 0 ? 'team-left' : 'team-right';

            html += `
                <div class="q-user-avatar ${isCurrent ? 'current-user' : ''} ${cls}"
                     title="${safeEsc(uname)}${isCaptain ? ' (Kaptan)' : ''}"
                     style="top:${top}px;left:${left}px;z-index:40;background:${avatarData.color};">
                    <i class="fas ${avatarData.icon}"></i>
                    ${isCaptain ? '<span class="a2-captain-badge"><i class="fas fa-crown"></i></span>' : ''}
                </div>
            `;
        });
    });

    const knownUsers = new Set([currentUser]);
    (competitionMoves || []).forEach(m => { if (m && m.user_name) knownUsers.add(m.user_name); });

    [...knownUsers].forEach((uname) => {
        if (!uname || renderedSolo.has(uname)) return;
        const approved = Math.min(a2ApprovedBoxCount(`solo:${uname}`), totalBoxes);
        const r = Math.floor(approved / cols);
        const col = (r % 2 === 0) ? (approved % cols) : (9 - (approved % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY + 5;
        const left = offsetX + col * stepX + 10;
        const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || 'm1';
        const avatarData = AVATAR_MAP[avatarId] || AVATAR_MAP['m1'];

        html += `
            <div class="q-user-avatar ${uname === currentUser ? 'current-user' : ''} solo-token"
                 title="${safeEsc(uname)}"
                 style="top:${top}px;left:${left}px;z-index:35;background:${avatarData.color};">
                <i class="fas ${avatarData.icon}"></i>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
    if (_oldA2EnsureActionPanel) _oldA2EnsureActionPanel();
};

window.showArenaBoxInfo = function(boxNo) {
    const seg = a2FindSegmentByBox(boxNo);
    const st = a2CurrentState(currentUser);

    const stateLabel = boxNo <= st.approvedBoxes
        ? '<span style="color:#10b981;">Tamamlandı</span>'
        : boxNo === st.currentBox
            ? (st.pendingMove ? '<span style="color:#fbbf24;">Admin onayı bekleniyor</span>' : '<span style="color:#67e8f9;">Sıradaki Görev</span>')
            : '<span style="color:#94a3b8;">Henüz açılmadı</span>';

    return Swal.fire({
        title: `${boxNo}. Kutu`,
        html: `
            <div style="text-align:left">
                <div style="margin-bottom:8px;"><b>Durum:</b> ${stateLabel}</div>
                <div><b>Atanmış görev:</b> ${safeEsc(seg ? seg.task_name : 'Henüz görev atanmadı')}</div>
                <div style="margin-top:6px;"><b>Görev kapsama alanı:</b> ${seg ? (`Kutu ${seg.start_box}-${seg.end_box}`) : '-'}</div>
                <div style="margin-top:6px;"><b>Adım:</b> ${seg ? seg.steps : '-'}</div>
                <div style="margin-top:10px; font-size:.84rem; color:#94a3b8;">
                    ${boxNo === st.currentBox
                        ? 'Bu görev onaylanınca takım bir sonraki segmentin başlangıç kutusuna geçer.'
                        : (boxNo < st.currentBox ? 'Bu alan tamamlandı.' : 'Bu kutu, sıraladığın görev akışı içindeki segmentlerden biridir.')}
                </div>
            </div>
        `,
        background: '#0f172a',
        color: '#fff',
        confirmButtonText: 'Tamam'
    });
};

setTimeout(() => {
    try {
        window.a2ReadFlowFromSettings(true).then(() => {
            if (typeof renderCompetitionBoard === 'function') renderCompetitionBoard();
        });
    } catch (e) {
        console.warn('[Arena2] flow warmup error', e);
    }
}, 250);
// ===== End Arena 2.0 flow-based progression override =====


// ===== Arena 2.0 premium fullscreen layout override v9.8.0 =====
window.ARENA2_VERSION = '12.1.0';

window.ensureArenaRightRail = function() {
    const shell = document.querySelector('.q-comp-main-shell');
    if (!shell) return null;

    let rail = document.getElementById('arena-premium-right-rail');
    if (!rail) {
        rail = document.createElement('aside');
        rail.id = 'arena-premium-right-rail';
        rail.className = 'arena-premium-right-rail';
        shell.appendChild(rail);
    }

    const teamEntries = [];
    const teams = (userTeams || []).filter(t => t && t.status === 'active');

    teams.forEach((team) => {
        const teamKey = team.id ? `team:${team.id}` : `team:${team.user_a}:${team.user_b}`;
        const progress = Math.min(a2ApprovedBoxCount(teamKey), A2_TOTAL_BOXES);
        const label = team.team_name || [team.user_a, team.user_b].filter(Boolean).join(' / ') || team.user_a || 'Takım';
        teamEntries.push({ label, progress, isTeam: true });
    });

    const knownUsers = new Set([currentUser]);
    (competitionMoves || []).forEach(m => { if (m && m.user_name) knownUsers.add(m.user_name); });
    [...knownUsers].forEach((uname) => {
        if (!uname) return;
        const inTeam = teams.some(t => t.user_a === uname || t.user_b === uname);
        if (inTeam) return;
        const progress = Math.min(a2ApprovedBoxCount(`solo:${uname}`), A2_TOTAL_BOXES);
        teamEntries.push({ label: uname, progress, isTeam: false });
    });

    teamEntries.sort((a, b) => b.progress - a.progress || a.label.localeCompare(b.label, 'tr'));

    const leaders = teamEntries.slice(0, 8).map((item, idx) => `
        <div class="arena-rail-leader-row ${idx === 0 ? 'top-leader' : ''}">
            <div class="arena-rail-rank">#${idx + 1}</div>
            <div class="arena-rail-main">
                <div class="arena-rail-name">${safeEsc(item.label)}</div>
                <div class="arena-rail-sub">${item.progress}/${A2_TOTAL_BOXES} kutu</div>
                <div class="arena-rail-bar"><span style="width:${Math.max(4, (item.progress / A2_TOTAL_BOXES) * 100)}%"></span></div>
            </div>
        </div>
    `).join('') || '<div class="arena-empty-note">Henüz ilerleme verisi yok.</div>';

    const events = (competitionMoves || []).slice().sort((a, b) => {
        const da = new Date(a?.created_at || 0).getTime();
        const db = new Date(b?.created_at || 0).getTime();
        return db - da;
    }).slice(0, 8);

    const eventHtml = events.map((m) => {
        const status = String(m?.status || '').toLowerCase();
        const badgeClass = status === 'approved' ? 'ok' : (status === 'rejected' ? 'bad' : 'wait');
        const badgeText = status === 'approved' ? 'Onay' : (status === 'rejected' ? 'Ceza/Red' : 'Bekliyor');
        const note = (m?.admin_note || '').trim();
        return `
            <div class="arena-rail-event">
                <div class="arena-rail-event-top">
                    <span class="arena-rail-event-user">${safeEsc(m?.user_name || 'Bilinmiyor')}</span>
                    <span class="arena-rail-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="arena-rail-event-body">${safeEsc(note || 'Yönetim kaydı')}</div>
            </div>
        `;
    }).join('') || '<div class="arena-empty-note">Henüz yönetim kaydı yok.</div>';

    rail.innerHTML = `
        <div class="arena-rail-card">
            <div class="arena-rail-title"><i class="fas fa-ranking-star"></i> Lider Tablosu</div>
            <div class="arena-rail-list">${leaders}</div>
        </div>
        <div class="arena-rail-card">
            <div class="arena-rail-title"><i class="fas fa-shield-check"></i> Yönetim Akışı</div>
            <div class="arena-rail-feed">${eventHtml}</div>
        </div>
    `;
    return rail;
};

window.renderCompetitionBoard = function() {
    const container = document.getElementById('q-comp-board');
    if (!container) return;

    if (!window._arena2FlowLoaded) {
        window.a2ReadFlowFromSettings(true).then(() => {
            try { window.renderCompetitionBoard(); } catch(_) {}
        });
    }

    ensureArenaRightRail();

    const totalBoxes = A2_TOTAL_BOXES;
    const cols = 10;
    const stage = container.closest('.arena2-board-wrapper') || container.parentElement || document.body;
    const stageWidth = Math.max(stage ? stage.clientWidth : 1280, 1100);
    const stageHeight = Math.max(stage ? stage.clientHeight : 760, 700);

    // 1920x1080 @125% ve laptop ekranlarında daha dengeli görünmesi için
    // boyut hem genişliğe hem yüksekliğe göre ayarlanır.
    let boxSize = 76, stepX = 96, stepY = 102, offsetX = 18, offsetY = 16;

        if (stageWidth >= 1680 && stageHeight >= 860) {
        boxSize = 84; stepX = 102; stepY = 108; offsetX = 20; offsetY = 18;
    }
    if (stageWidth >= 1800 && stageHeight >= 900) {
        boxSize = 88; stepX = 106; stepY = 112; offsetX = 22; offsetY = 18;
    }
    if (stageHeight <= 820) {
        boxSize = 72; stepX = 90; stepY = 96; offsetX = 16; offsetY = 14;
    }
    if (stageHeight <= 760 || stageWidth <= 1380) {
        boxSize = 68; stepX = 86; stepY = 92; offsetX = 14; offsetY = 12;
    }

    const lineThickness = Math.max(8, Math.round(boxSize * 0.12));
    const lineOffset = Math.round(boxSize / 2);
    const boardWidth = offsetX * 2 + stepX * 9 + boxSize;
    const boardHeight = offsetY * 2 + stepY * 5 + boxSize;
    const st = a2CurrentState(currentUser);

    let html = `<div class="q-comp-path-container arena98-board" style="position:relative;width:${boardWidth}px;height:${boardHeight}px;">`;

    for (let i = 0; i < totalBoxes; i++) {
        const r1 = Math.floor(i / cols), c1 = (r1 % 2 === 0) ? (i % cols) : (9 - (i % cols));
        const next = i + 1;
        const r2 = Math.floor(next / cols), c2 = (r2 % 2 === 0) ? (next % cols) : (9 - (next % cols));
        const vr1 = 5 - r1, vr2 = 5 - r2;
        const x1 = offsetX + c1 * stepX + lineOffset, y1 = offsetY + vr1 * stepY + lineOffset;
        const x2 = offsetX + c2 * stepX + lineOffset, y2 = offsetY + vr2 * stepY + lineOffset;
        const isHorizontal = vr1 === vr2;
        const width = isHorizontal ? Math.abs(x2 - x1) : lineThickness;
        const height = isHorizontal ? lineThickness : Math.abs(y2 - y1);
        const top = Math.min(y1, y2);
        const left = Math.min(x1, x2);
        const pathDone = (i + 1) <= st.approvedBoxes;
        const pathActive = !pathDone && st.currentBox === (i + 1);
        html += `<div class="q-comp-path-line ${pathDone ? 'is-done' : ''} ${pathActive ? 'is-active' : ''}" style="top:${top}px;left:${left}px;width:${width}px;height:${height}px;position:absolute;z-index:2;"></div>`;
    }

    const gemClasses = ['gem-ruby', 'gem-sapphire', 'gem-emerald', 'gem-gold', 'gem-amethyst'];

    for (let i = 0; i <= totalBoxes; i++) {
        let typeClass = '', extraStyle = '', extraAttrs = '', numberHtml = '', taskHtml = '', stateClass = '';

        if (i === 0) {
            typeClass = 'start';
            numberHtml = '<div class="q-step-box-number"><i class="fas fa-flag-checkered"></i></div>';
            taskHtml = '<div class="q-step-box-task fixed-label">Başlangıç</div>';
        } else if (i === totalBoxes) {
            typeClass = 'finish';
            numberHtml = '<div class="q-step-box-number"><i class="fas fa-chess-rook"></i></div>';
            taskHtml = '<div class="q-step-box-task fixed-label">Büyük Ödül</div>';
            extraStyle = 'cursor:pointer;';
            extraAttrs = `title="Final" onclick="handleGrandPrizeClick()"`;
            if (st.approvedBoxes >= totalBoxes) stateClass = 'is-complete';
        } else {
            const seg = a2FindSegmentByBox(i);
            const hasTask = !!seg;
            const isCurrent = i === st.currentBox && !st.isFinished;
            const isDone = i <= st.approvedBoxes;
            const isSegmentStart = !!seg && i === seg.start_box;
            const label = isCurrent ? 'Sıradaki Görev' : '';
            typeClass = gemClasses[i % gemClasses.length];
            numberHtml = `<div class="q-step-box-number">${i}</div>`;
            taskHtml = `
                ${label ? `<div class="q-step-box-task next-task-label">${safeEsc(label)}</div>` : ''}
                ${isSegmentStart && seg ? `<div class="q-step-box-sub">${seg.steps} adım</div>` : ''}
                <div class="a2-box-hover-hint">${isCurrent ? 'Aktif görev kutusu' : (hasTask ? `${seg.start_box}-${seg.end_box} segmenti` : 'Henüz görev seçilmedi')}</div>
            `;
            extraAttrs = `title="${safeEsc(hasTask ? (seg.task_name + ' (' + seg.steps + ' adım)') : ('Kutu ' + i))}" onclick="window.showArenaBoxInfo(${i})"`;
            extraStyle = 'cursor:pointer;';
            if (isDone) stateClass += ' is-complete';
            if (isCurrent) stateClass += ' current-box';
            if (st.pendingMove && isCurrent) stateClass += ' pending-box';
            if (!hasTask) stateClass += ' is-unassigned';
            if (isSegmentStart) stateClass += ' is-segment-start';
        }

        const r = Math.floor(i / cols);
        const col = (r % 2 === 0) ? (i % cols) : (9 - (i % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY;
        const left = offsetX + col * stepX;

        html += `
            <div class="q-step-box ${typeClass} ${stateClass.trim()}" ${extraAttrs}
                 style="position:absolute;top:${top}px;left:${left}px;width:${boxSize}px;height:${boxSize}px;z-index:20;${extraStyle}">
                <div class="q-step-box-inner">
                    ${numberHtml}
                    ${taskHtml}
                </div>
            </div>
        `;
    }

    const renderedSolo = new Set();
    const teams = (userTeams || []).filter(t => t && t.status === 'active');

    teams.forEach((team) => {
        const teamKey = team.id ? `team:${team.id}` : `team:${team.user_a}:${team.user_b}`;
        const approved = Math.min(a2ApprovedBoxCount(teamKey), totalBoxes);
        const r = Math.floor(approved / cols);
        const col = (r % 2 === 0) ? (approved % cols) : (9 - (approved % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY + 8;
        const left = offsetX + col * stepX + 10;

        [team.user_a, team.user_b].forEach((uname, idx) => {
            if (!uname) return;
            renderedSolo.add(uname);
            const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || (idx === 0 ? 'm1' : 'f1');
            const avatarData = AVATAR_MAP[avatarId] || AVATAR_MAP['m1'];
            const isCaptain = uname === team.user_a;
            const isCurrent = uname === currentUser;
            const cls = idx === 0 ? 'team-left' : 'team-right';

            html += `
                <div class="q-user-avatar ${isCurrent ? 'current-user' : ''} ${cls}"
                     title="${safeEsc(uname)}${isCaptain ? ' (Kaptan)' : ''}"
                     style="top:${top}px;left:${left}px;z-index:40;background:${avatarData.color};">
                    <i class="fas ${avatarData.icon}"></i>
                    ${isCaptain ? '<span class="a2-captain-badge"><i class="fas fa-crown"></i></span>' : ''}
                </div>
            `;
        });
    });

    const knownUsers = new Set([currentUser]);
    (competitionMoves || []).forEach(m => { if (m && m.user_name) knownUsers.add(m.user_name); });

    [...knownUsers].forEach((uname) => {
        if (!uname || renderedSolo.has(uname)) return;
        const approved = Math.min(a2ApprovedBoxCount(`solo:${uname}`), totalBoxes);
        const r = Math.floor(approved / cols);
        const col = (r % 2 === 0) ? (approved % cols) : (9 - (approved % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY + 10;
        const left = offsetX + col * stepX + 14;
        const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || 'm1';
        const avatarData = AVATAR_MAP[avatarId] || AVATAR_MAP['m1'];

        html += `
            <div class="q-user-avatar ${uname === currentUser ? 'current-user' : ''} solo-token"
                 title="${safeEsc(uname)}"
                 style="top:${top}px;left:${left}px;z-index:35;background:${avatarData.color};">
                <i class="fas ${avatarData.icon}"></i>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
    if (typeof a2EnsureActionPanel === 'function') a2EnsureActionPanel();
    ensureArenaRightRail();
};
// ===== End Arena 2.0 premium fullscreen layout override =====


// ===== Arena 2.0 adaptive auto-fit override v9.9.0 =====
window.ARENA2_VERSION = '12.1.0';

window.ensureArenaRightRail = function() {
    const shell = document.querySelector('.q-comp-main-shell');
    if (!shell) return null;

    let rail = document.getElementById('arena-premium-right-rail');
    if (!rail) {
        rail = document.createElement('aside');
        rail.id = 'arena-premium-right-rail';
        rail.className = 'arena-premium-right-rail';
        shell.appendChild(rail);
    }

    const teamEntries = [];
    const teams = (userTeams || []).filter(t => t && t.status === 'active');

    teams.forEach((team) => {
        const teamKey = team.id ? `team:${team.id}` : `team:${team.user_a}:${team.user_b}`;
        const progress = Math.min(a2ApprovedBoxCount(teamKey), A2_TOTAL_BOXES);
        const label = team.team_name || [team.user_a, team.user_b].filter(Boolean).join(' / ') || team.user_a || 'Takım';
        teamEntries.push({ label, progress });
    });

    const knownUsers = new Set([currentUser]);
    (competitionMoves || []).forEach(m => { if (m && m.user_name) knownUsers.add(m.user_name); });
    [...knownUsers].forEach((uname) => {
        if (!uname) return;
        const inTeam = teams.some(t => t.user_a === uname || t.user_b === uname);
        if (inTeam) return;
        const progress = Math.min(a2ApprovedBoxCount(`solo:${uname}`), A2_TOTAL_BOXES);
        teamEntries.push({ label: uname, progress });
    });

    teamEntries.sort((a, b) => b.progress - a.progress || a.label.localeCompare(b.label, 'tr'));

    const leaders = teamEntries.slice(0, 8).map((item, idx) => `
        <div class="arena-rail-leader-row ${idx === 0 ? 'top-leader' : ''}">
            <div class="arena-rail-rank">#${idx + 1}</div>
            <div class="arena-rail-main">
                <div class="arena-rail-name">${safeEsc(item.label)}</div>
                <div class="arena-rail-sub">${item.progress}/${A2_TOTAL_BOXES} kutu</div>
                <div class="arena-rail-bar"><span style="width:${Math.max(4, (item.progress / A2_TOTAL_BOXES) * 100)}%"></span></div>
            </div>
        </div>
    `).join('') || '<div class="arena-empty-note">Henüz ilerleme verisi yok.</div>';

    const events = (competitionMoves || []).slice().sort((a, b) => {
        const da = new Date(a?.created_at || 0).getTime();
        const db = new Date(b?.created_at || 0).getTime();
        return db - da;
    }).slice(0, 10);

    const eventHtml = events.map((m) => {
        const status = String(m?.status || '').toLowerCase();
        const badgeClass = status === 'approved' ? 'ok' : (status === 'rejected' ? 'bad' : 'wait');
        const badgeText = status === 'approved' ? 'Onay' : (status === 'rejected' ? 'Ceza/Red' : 'Bekliyor');
        const note = (m?.admin_note || '').trim();
        return `
            <div class="arena-rail-event">
                <div class="arena-rail-event-top">
                    <span class="arena-rail-event-user">${safeEsc(m?.user_name || 'Bilinmiyor')}</span>
                    <span class="arena-rail-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="arena-rail-event-body">${safeEsc(note || 'Yönetim kaydı')}</div>
            </div>
        `;
    }).join('') || '<div class="arena-empty-note">Henüz yönetim kaydı yok.</div>';

    rail.innerHTML = `
        <div class="arena-rail-card arena-rail-card-leaders">
            <div class="arena-rail-title"><i class="fas fa-ranking-star"></i> Lider Tablosu</div>
            <div class="arena-rail-list">${leaders}</div>
        </div>
        <div class="arena-rail-card arena-rail-card-feed">
            <div class="arena-rail-title"><i class="fas fa-shield-check"></i> Yönetim Akışı</div>
            <div class="arena-rail-feed">${eventHtml}</div>
        </div>
    `;
    return rail;
};

window.renderCompetitionBoard = function() {
    const container = document.getElementById('q-comp-board');
    if (!container) return;

    if (!window._arena2FlowLoaded) {
        window.a2ReadFlowFromSettings(true).then(() => {
            try { window.renderCompetitionBoard(); } catch(_) {}
        });
    }

    ensureArenaRightRail();

    const totalBoxes = A2_TOTAL_BOXES;
    const cols = 10;
    const stage = container.closest('.arena2-board-wrapper') || container.parentElement || document.body;
    const stageWidth = Math.max(stage ? stage.clientWidth : 1280, 980);
    const stageHeight = Math.max(stage ? stage.clientHeight : 700, 640);

    // Asıl tahta boyutu
    let boxSize = 84, stepX = 108, stepY = 118, offsetX = 22, offsetY = 18;
    if (stageWidth >= 1700 && stageHeight >= 860) {
        boxSize = 92; stepX = 116; stepY = 124; offsetX = 24; offsetY = 18;
    } else if (stageWidth <= 1380 || stageHeight <= 760) {
        boxSize = 74; stepX = 94; stepY = 102; offsetX = 16; offsetY = 14;
    }

    const lineThickness = Math.max(8, Math.round(boxSize * 0.12));
    const lineOffset = Math.round(boxSize / 2);
    const boardWidth = offsetX * 2 + stepX * 9 + boxSize;
    const boardHeight = offsetY * 2 + stepY * 5 + boxSize;

    // Tarayıcı zoom'a ihtiyaç kalmasın diye otomatik sığdırma
    const fitW = Math.max((stage.clientWidth || boardWidth) - 20, 780);
    const fitH = Math.max((stage.clientHeight || boardHeight) - 20, 520);
    const boardScale = Math.min(fitW / boardWidth, fitH / boardHeight, 1.12);
    const safeScale = Math.max(0.78, boardScale);
    const scaledWidth = Math.round(boardWidth * safeScale);
    const scaledHeight = Math.round(boardHeight * safeScale);

    const st = a2CurrentState(currentUser);
    let inner = `<div class="q-comp-path-container arena99-board" style="position:relative;width:${boardWidth}px;height:${boardHeight}px;transform:scale(${safeScale});transform-origin:top left;">`;

    for (let i = 0; i < totalBoxes; i++) {
        const r1 = Math.floor(i / cols), c1 = (r1 % 2 === 0) ? (i % cols) : (9 - (i % cols));
        const next = i + 1;
        const r2 = Math.floor(next / cols), c2 = (r2 % 2 === 0) ? (next % cols) : (9 - (next % cols));
        const vr1 = 5 - r1, vr2 = 5 - r2;
        const x1 = offsetX + c1 * stepX + lineOffset, y1 = offsetY + vr1 * stepY + lineOffset;
        const x2 = offsetX + c2 * stepX + lineOffset, y2 = offsetY + vr2 * stepY + lineOffset;
        const isHorizontal = vr1 === vr2;
        const width = isHorizontal ? Math.abs(x2 - x1) : lineThickness;
        const height = isHorizontal ? lineThickness : Math.abs(y2 - y1);
        const top = Math.min(y1, y2);
        const left = Math.min(x1, x2);
        const pathDone = (i + 1) <= st.approvedBoxes;
        const pathActive = !pathDone && st.currentBox === (i + 1);
        inner += `<div class="q-comp-path-line ${pathDone ? 'is-done' : ''} ${pathActive ? 'is-active' : ''}" style="top:${top}px;left:${left}px;width:${width}px;height:${height}px;position:absolute;z-index:2;"></div>`;
    }

    const gemClasses = ['gem-ruby', 'gem-sapphire', 'gem-emerald', 'gem-gold', 'gem-amethyst'];

    for (let i = 0; i <= totalBoxes; i++) {
        let typeClass = '', extraStyle = '', extraAttrs = '', numberHtml = '', taskHtml = '', stateClass = '';

        if (i === 0) {
            typeClass = 'start';
            numberHtml = '<div class="q-step-box-number"><i class="fas fa-flag-checkered"></i></div>';
            taskHtml = '<div class="q-step-box-task fixed-label">Başlangıç</div>';
        } else if (i === totalBoxes) {
            typeClass = 'finish';
            numberHtml = '<div class="q-step-box-number"><i class="fas fa-chess-rook"></i></div>';
            taskHtml = '<div class="q-step-box-task fixed-label">Büyük Ödül</div>';
            extraStyle = 'cursor:pointer;';
            extraAttrs = `title="Final" onclick="handleGrandPrizeClick()"`;
            if (st.approvedBoxes >= totalBoxes) stateClass = 'is-complete';
        } else {
            const seg = a2FindSegmentByBox(i);
            const hasTask = !!seg;
            const isCurrent = i === st.currentBox && !st.isFinished;
            const isDone = i <= st.approvedBoxes;
            const isSegmentStart = !!seg && i === seg.start_box;
            const label = isCurrent ? 'Sıradaki Görev' : '';
            typeClass = gemClasses[i % gemClasses.length];
            numberHtml = `<div class="q-step-box-number">${i}</div>`;
            taskHtml = `
                ${label ? `<div class="q-step-box-task next-task-label">${safeEsc(label)}</div>` : ''}
                ${isSegmentStart && seg ? `<div class="q-step-box-sub">${seg.steps} adım</div>` : ''}
                <div class="a2-box-hover-hint">${isCurrent ? 'Aktif görev kutusu' : (hasTask ? `${seg.start_box}-${seg.end_box} segmenti` : 'Henüz görev seçilmedi')}</div>
            `;
            extraAttrs = `title="${safeEsc(hasTask ? (seg.task_name + ' (' + seg.steps + ' adım)') : ('Kutu ' + i))}" onclick="window.showArenaBoxInfo(${i})"`;
            extraStyle = 'cursor:pointer;';
            if (isDone) stateClass += ' is-complete';
            if (isCurrent) stateClass += ' current-box';
            if (st.pendingMove && isCurrent) stateClass += ' pending-box';
            if (!hasTask) stateClass += ' is-unassigned';
            if (isSegmentStart) stateClass += ' is-segment-start';
        }

        const r = Math.floor(i / cols);
        const col = (r % 2 === 0) ? (i % cols) : (9 - (i % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY;
        const left = offsetX + col * stepX;

        inner += `
            <div class="q-step-box ${typeClass} ${stateClass.trim()}" ${extraAttrs}
                 style="position:absolute;top:${top}px;left:${left}px;width:${boxSize}px;height:${boxSize}px;z-index:20;${extraStyle}">
                <div class="q-step-box-inner">
                    ${numberHtml}
                    ${taskHtml}
                </div>
            </div>
        `;
    }

    const renderedSolo = new Set();
    const teams = (userTeams || []).filter(t => t && t.status === 'active');

    teams.forEach((team) => {
        const teamKey = team.id ? `team:${team.id}` : `team:${team.user_a}:${team.user_b}`;
        const approved = Math.min(a2ApprovedBoxCount(teamKey), totalBoxes);
        const r = Math.floor(approved / cols);
        const col = (r % 2 === 0) ? (approved % cols) : (9 - (approved % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY + 8;
        const left = offsetX + col * stepX + 10;

        [team.user_a, team.user_b].forEach((uname, idx) => {
            if (!uname) return;
            renderedSolo.add(uname);
            const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || (idx === 0 ? 'm1' : 'f1');
            const avatarData = AVATAR_MAP[avatarId] || AVATAR_MAP['m1'];
            const isCaptain = uname === team.user_a;
            const isCurrent = uname === currentUser;
            const cls = idx === 0 ? 'team-left' : 'team-right';

            inner += `
                <div class="q-user-avatar ${isCurrent ? 'current-user' : ''} ${cls}"
                     title="${safeEsc(uname)}${isCaptain ? ' (Kaptan)' : ''}"
                     style="top:${top}px;left:${left}px;z-index:40;background:${avatarData.color};">
                    <i class="fas ${avatarData.icon}"></i>
                    ${isCaptain ? '<span class="a2-captain-badge"><i class="fas fa-crown"></i></span>' : ''}
                </div>
            `;
        });
    });

    const knownUsers = new Set([currentUser]);
    (competitionMoves || []).forEach(m => { if (m && m.user_name) knownUsers.add(m.user_name); });

    [...knownUsers].forEach((uname) => {
        if (!uname || renderedSolo.has(uname)) return;
        const approved = Math.min(a2ApprovedBoxCount(`solo:${uname}`), totalBoxes);
        const r = Math.floor(approved / cols);
        const col = (r % 2 === 0) ? (approved % cols) : (9 - (approved % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY + 10;
        const left = offsetX + col * stepX + 14;
        const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || 'm1';
        const avatarData = AVATAR_MAP[avatarId] || AVATAR_MAP['m1'];

        inner += `
            <div class="q-user-avatar ${uname === currentUser ? 'current-user' : ''} solo-token"
                 title="${safeEsc(uname)}"
                 style="top:${top}px;left:${left}px;z-index:35;background:${avatarData.color};">
                <i class="fas ${avatarData.icon}"></i>
            </div>
        `;
    });

    inner += `</div>`;
    container.innerHTML = `<div class="arena-fit-stage" style="position:relative;width:${scaledWidth}px;height:${scaledHeight}px;">${inner}</div>`;
    if (typeof a2EnsureActionPanel === 'function') a2EnsureActionPanel();
    ensureArenaRightRail();
};

window.addEventListener('resize', () => {
    try {
        clearTimeout(window.__arena99ResizeTimer);
        window.__arena99ResizeTimer = setTimeout(() => {
            if (typeof renderCompetitionBoard === 'function') renderCompetitionBoard();
        }, 120);
    } catch (_) {}
});
// ===== End Arena 2.0 adaptive auto-fit override =====


// ===== Arena 2.0 fantasy milestone + leylines override v10.0.0 =====
window.ARENA2_VERSION = '12.1.0';

window.a2MilestoneMeta = function(boxNo, teamKey = null) {
    // Sabit olanlar kalsın ama dinamik olanlar burada teamKey'e göre eşleşir
    const milestones = ['🗼','🛡️','🪧','💰','⚔️','🏹','🧿','🔮','🌟','🗺️'];
    // Basit bir seed ile her kutuda/takımda farklı ama stabil emoji
    if (boxNo === A2_TOTAL_BOXES) return { icon: '🏰', label: 'Büyük Ödül', className: 'milestone-castle' };
    
    // Sadece aktif kutular için ikon döner (render içinde kontrol edilecek)
    const seed = (String(teamKey).length * 3 + Number(boxNo) * 7) % milestones.length;
    return { icon: milestones[seed], label: 'Kilometre Taşı', className: 'milestone-random' };
};

window.renderCompetitionBoard = function() {
    const container = document.getElementById('q-comp-board');
    if (!container) return;

    if (!window._arena2FlowLoaded) {
        window.a2ReadFlowFromSettings(true).then(() => {
            try { window.renderCompetitionBoard(); } catch(_) {}
        });
    }

    ensureArenaRightRail();

    const totalBoxes = A2_TOTAL_BOXES;
    const cols = 10;
    const stage = container.closest('.arena2-board-wrapper') || container.parentElement || document.body;
    const stageWidth = Math.max(stage ? stage.clientWidth : 1280, 980);
    const stageHeight = Math.max(stage ? stage.clientHeight : 700, 640);

    let boxSize = 84, stepX = 108, stepY = 118, offsetX = 22, offsetY = 18;
    if (stageWidth >= 1700 && stageHeight >= 860) {
        boxSize = 92; stepX = 116; stepY = 124; offsetX = 24; offsetY = 18;
    } else if (stageWidth <= 1380 || stageHeight <= 760) {
        boxSize = 74; stepX = 94; stepY = 102; offsetX = 16; offsetY = 14;
    }

    const lineThickness = Math.max(8, Math.round(boxSize * 0.12));
    const lineOffset = Math.round(boxSize / 2);
    const boardWidth = offsetX * 2 + stepX * 9 + boxSize;
    const boardHeight = offsetY * 2 + stepY * 5 + boxSize;

    const fitW = Math.max((stage.clientWidth || boardWidth) - 20, 780);
    const fitH = Math.max((stage.clientHeight || boardHeight) - 20, 520);
    const boardScale = Math.min(fitW / boardWidth, fitH / boardHeight, 1.12);
    const safeScale = Math.max(0.78, boardScale);
    const scaledWidth = Math.round(boardWidth * safeScale);
    const scaledHeight = Math.round(boardHeight * safeScale);

    const st = a2CurrentState(currentUser);
    let inner = `<div class="q-comp-path-container arena100-board" style="position:relative;width:${boardWidth}px;height:${boardHeight}px;transform:scale(${safeScale});transform-origin:top left;">`;

    // Leylines
    for (let i = 0; i < totalBoxes; i++) {
        const r1 = Math.floor(i / cols), c1 = (r1 % 2 === 0) ? (i % cols) : (9 - (i % cols));
        const next = i + 1;
        const r2 = Math.floor(next / cols), c2 = (r2 % 2 === 0) ? (next % cols) : (9 - (next % cols));
        const vr1 = 5 - r1, vr2 = 5 - r2;
        const x1 = offsetX + c1 * stepX + lineOffset, y1 = offsetY + vr1 * stepY + lineOffset;
        const x2 = offsetX + c2 * stepX + lineOffset, y2 = offsetY + vr2 * stepY + lineOffset;
        const isHorizontal = vr1 === vr2;
        const width = isHorizontal ? Math.abs(x2 - x1) : lineThickness;
        const height = isHorizontal ? lineThickness : Math.abs(y2 - y1);
        const top = Math.min(y1, y2);
        const left = Math.min(x1, x2);
        const pathDone = (i + 1) <= st.approvedBoxes;
        const pathActive = !pathDone && st.currentBox === (i + 1);
        inner += `<div class="q-comp-path-line ${pathDone ? 'is-done' : ''} ${pathActive ? 'is-active' : ''}" style="top:${top}px;left:${left}px;width:${width}px;height:${height}px;position:absolute;z-index:2;"></div>`;
    }

    const gemClasses = ['gem-ruby', 'gem-sapphire', 'gem-emerald', 'gem-gold', 'gem-amethyst'];

    for (let i = 0; i <= totalBoxes; i++) {
        let typeClass = '', extraStyle = '', extraAttrs = '', numberHtml = '', taskHtml = '', stateClass = '', milestoneHtml = '';

        if (i === 0) {
            typeClass = 'start';
            numberHtml = '<div class="q-step-box-number"><i class="fas fa-flag-checkered"></i></div>';
            taskHtml = '<div class="q-step-box-task fixed-label">Başlangıç</div>';
        } else if (i === totalBoxes) {
            const milestone = a2MilestoneMeta(i);
            typeClass = 'finish';
            numberHtml = `<div class="q-step-box-number">${milestone ? milestone.icon : '<i class="fas fa-chess-rook"></i>'}</div>`;
            taskHtml = `<div class="q-step-box-task fixed-label">${milestone ? milestone.label : 'Büyük Ödül'}</div>`;
            if (milestone) milestoneHtml = `<div class="a2-milestone-badge ${milestone.className}">${milestone.icon}</div>`;
            extraStyle = 'cursor:pointer;';
            extraAttrs = `title="Final" onclick="handleGrandPrizeClick()"`;
            if (st.approvedBoxes >= totalBoxes) stateClass = 'is-complete';
            stateClass += ' has-milestone';
            if (milestone) stateClass += ` ${milestone.className}`;
        } else {
            const seg = a2FindSegmentByBox(i);
            const hasTask = !!seg;
            const isCurrent = i === st.currentBox && !st.isFinished;
            const isDone = i <= st.approvedBoxes;
            const isSegmentStart = !!seg && i === seg.start_box;
            const label = isCurrent ? 'Sıradaki Görev' : '';
            
            // Pinned Bonus Check
            const pinnedBonus = (competitionConfig || []).find(c => Number(window.a2TagVal(c.task_name, 'TARGET_BOX')) === i);
            let milestone = a2MilestoneMeta(i);
            
            if (pinnedBonus) {
                milestone = { icon: '<i class="fas fa-bolt"></i>', label: 'Bonus Adım', className: 'is-bonus' };
            }

            typeClass = gemClasses[i % gemClasses.length];
            numberHtml = `<div class="q-step-box-number">${i}</div>`;
            taskHtml = `
                ${label ? `<div class="q-step-box-task next-task-label">${safeEsc(label)}</div>` : ''}
                ${isSegmentStart && seg ? `<div class="q-step-box-sub">${seg.steps} adım</div>` : ''}
                <div class="a2-box-hover-hint">${isCurrent ? 'Aktif görev kutusu' : (hasTask ? `${seg.start_box}-${seg.end_box} segmenti` : 'Henüz görev seçilmedi')}</div>
            `;
            if (milestone) {
                milestoneHtml = `<div class="a2-milestone-badge ${milestone.className}" title="${milestone.label}">${milestone.icon}</div>`;
                stateClass += ' has-milestone ';
                stateClass += milestone.className;
            }
            extraAttrs = `title="${safeEsc(hasTask ? (seg.task_name + ' (' + seg.steps + ' adım)') : ('Kutu ' + i))}" onclick="window.showArenaBoxInfo(${i})"`;
            extraStyle = 'cursor:pointer;';
            if (isDone) stateClass += ' is-complete';
            if (isCurrent) stateClass += ' current-box';
            if (st.pendingMove && isCurrent) stateClass += ' pending-box';
            if (!hasTask) stateClass += ' is-unassigned';
            if (isSegmentStart) stateClass += ' is-segment-start';
        }

        const r = Math.floor(i / cols);
        const col = (r % 2 === 0) ? (i % cols) : (9 - (i % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY;
        const left = offsetX + col * stepX;

        inner += `
            <div class="q-step-box ${typeClass} ${stateClass.trim()}" ${extraAttrs}
                 style="position:absolute;top:${top}px;left:${left}px;width:${boxSize}px;height:${boxSize}px;z-index:20;${extraStyle}">
                ${milestoneHtml}
                <div class="q-step-box-inner">
                    ${numberHtml}
                    ${taskHtml}
                </div>
            </div>
        `;
    }

    const renderedSolo = new Set();
    const teams = (userTeams || []).filter(t => t && t.status === 'active');

    teams.forEach((team) => {
        const teamKey = team.id ? `team:${team.id}` : `team:${team.user_a}:${team.user_b}`;
        const approved = Math.min(a2ApprovedBoxCount(teamKey), totalBoxes);
        const r = Math.floor(approved / cols);
        const col = (r % 2 === 0) ? (approved % cols) : (9 - (approved % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY + 8;
        const left = offsetX + col * stepX + 10;

        [team.user_a, team.user_b].forEach((uname, idx) => {
            if (!uname) return;
            renderedSolo.add(uname);
            const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || (idx === 0 ? 'm1' : 'f1');
            const avatarData = AVATAR_MAP[avatarId] || AVATAR_MAP['m1'];
            const isCaptain = uname === team.user_a;
            const isCurrent = uname === currentUser;
            const cls = idx === 0 ? 'team-left' : 'team-right';

            inner += `
                <div class="q-user-avatar ${isCurrent ? 'current-user' : ''} ${cls}"
                     title="${safeEsc(uname)}${isCaptain ? ' (Kaptan)' : ''}"
                     style="top:${top}px;left:${left}px;z-index:40;background:${avatarData.color};">
                    <i class="fas ${avatarData.icon}"></i>
                    ${isCaptain ? '<span class="a2-captain-badge"><i class="fas fa-crown"></i></span>' : ''}
                </div>
            `;
        });
    });

    const knownUsers = new Set([currentUser]);
    (competitionMoves || []).forEach(m => { if (m && m.user_name) knownUsers.add(m.user_name); });

    [...knownUsers].forEach((uname) => {
        if (!uname || renderedSolo.has(uname)) return;
        const approved = Math.min(a2ApprovedBoxCount(`solo:${uname}`), totalBoxes);
        const r = Math.floor(approved / cols);
        const col = (r % 2 === 0) ? (approved % cols) : (9 - (approved % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY + 10;
        const left = offsetX + col * stepX + 14;
        const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || 'm1';
        const avatarData = AVATAR_MAP[avatarId] || AVATAR_MAP['m1'];

        inner += `
            <div class="q-user-avatar ${uname === currentUser ? 'current-user' : ''} solo-token"
                 title="${safeEsc(uname)}"
                 style="top:${top}px;left:${left}px;z-index:35;background:${avatarData.color};">
                <i class="fas ${avatarData.icon}"></i>
            </div>
        `;
    });

    inner += `</div>`;
    container.innerHTML = `<div class="arena-fit-stage" style="position:relative;width:${scaledWidth}px;height:${scaledHeight}px;">${inner}</div>`;
    if (typeof a2EnsureActionPanel === 'function') a2EnsureActionPanel();
    ensureArenaRightRail();
};

window.showArenaBoxInfo = function(boxNo) {
    const seg = a2FindSegmentByBox(boxNo);
    const milestone = a2MilestoneMeta(boxNo);
    const st = a2CurrentState(currentUser);

    const stateLabel = boxNo <= st.approvedBoxes
        ? '<span style="color:#10b981;">Tamamlandı</span>'
        : boxNo === st.currentBox
            ? (st.pendingMove ? '<span style="color:#fbbf24;">Admin onayı bekleniyor</span>' : '<span style="color:#67e8f9;">Sıradaki Görev</span>')
            : '<span style="color:#94a3b8;">Henüz açılmadı</span>';

    return Swal.fire({
        title: `${boxNo}. Kutu`,
        html: `
            <div style="text-align:left">
                <div style="margin-bottom:8px;"><b>Durum:</b> ${stateLabel}</div>
                ${milestone ? `<div style="margin-bottom:8px;"><b>Kilometre Taşı:</b> ${milestone.icon} ${safeEsc(milestone.label)}</div>` : ''}
                <div><b>Atanmış görev:</b> ${safeEsc(seg ? seg.task_name : 'Henüz görev atanmadı')}</div>
                <div style="margin-top:6px;"><b>Görev kapsama alanı:</b> ${seg ? (`Kutu ${seg.start_box}-${seg.end_box}`) : '-'}</div>
                <div style="margin-top:6px;"><b>Adım:</b> ${seg ? seg.steps : '-'}</div>
                <div style="margin-top:10px; font-size:.84rem; color:#94a3b8;">
                    ${boxNo === st.currentBox
                        ? 'Bu görev onaylanınca takım bir sonraki segmentin başlangıç kutusuna geçer.'
                        : (boxNo < st.currentBox ? 'Bu alan tamamlandı.' : 'Bu kutu, sıraladığın görev akışı içindeki segmentlerden biridir.')}
                </div>
            </div>
        `,
        background: '#0f172a',
        color: '#fff',
        confirmButtonText: 'Tamam'
    });
};
// ===== End Arena 2.0 fantasy milestone + leylines override =====


// ===== Arena 2.0 delivery completion override v11.0.0 =====
window.ARENA2_VERSION = '12.1.0';

window.a2TaskTypeLabel = window.a2TaskTypeLabel || function(task) {
    const type = String((task && task.type) || 'normal').toLowerCase();
    const map = {
        normal: 'Normal Görev',
        reward: 'Hediye',
        surprise: 'Sürpriz Soru',
        penalty: 'Ceza',
        bonus: 'Bonus Adım',
        bonus_step: 'Bonus Adım'
    };
    return map[type] || 'Görev';
};

window.a2TaskBadge = window.a2TaskBadge || function(task) {
    const type = String((task && task.type) || 'normal').toLowerCase();
    if (type === 'reward') return '🎁';
    if (type === 'surprise') return '❓';
    if (type === 'penalty') return '⚠️';
    if (type === 'bonus' || type === 'bonus_step') return '⚡';
    return '';
};

window.a2AllTasks = window.a2AllTasks || function() {
    return (competitionConfig || []).filter(t => t && t.is_active !== false);
};

window.a2ResetCompetition = async function(mode) {
    mode = mode || 'all';
    if (typeof sb === 'undefined' || !sb || !sb.from) {
        throw new Error('Supabase bağlantısı yok');
    }

    if (mode === 'team') {
        const st = a2CurrentState(currentUser);
        const teamKey = st.teamKey;
        const teamRows = (competitionMoves || []).filter(m =>
            String(m && m.admin_note || '').includes('[ARENA2]') &&
            String(m && m.admin_note || '').includes('[TEAMKEY:' + teamKey + ']')
        );
        const ids = teamRows.map(x => x.id).filter(Boolean);
        if (ids.length) {
            const resp = await sb.from('competition_moves').delete().in('id', ids);
            if (resp && resp.error) throw resp.error;
        }
    } else {
        const resp = await sb.from('competition_moves').delete().like('admin_note', '%[ARENA2]%');
        if (resp && resp.error) throw resp.error;
    }

    try {
        Object.keys(localStorage)
            .filter(k => k.startsWith('comp_avatar_'))
            .forEach(k => localStorage.removeItem(k));
    } catch (_) {}

    await syncCompetitionData();
    if (typeof renderCompetitionBoard === 'function') renderCompetitionBoard();
    if (typeof renderCompetitionLeaderboard === 'function') renderCompetitionLeaderboard();
    if (typeof renderMyRecentTasks === 'function') renderMyRecentTasks();
};

window.openArenaResetPanel = async function() {
    const result = await Swal.fire({
        title: 'Oyunu Sıfırla',
        html: `
            <div style="text-align:left">
                <div style="margin-bottom:12px; color:#cbd5e1;">
                    Admin olarak yarışmayı sıfırlayabilirsin.
                </div>
                <button id="arena11-reset-team" class="swal2-confirm swal2-styled" style="background:#475569; margin-right:8px;">
                    Sadece Benim Takımımı Sıfırla
                </button>
                <button id="arena11-reset-all" class="swal2-confirm swal2-styled" style="background:#dc2626;">
                    Tüm Oyunu Sıfırla
                </button>
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        background: '#020617',
        color: '#fff',
        didOpen: () => {
            const teamBtn = document.getElementById('arena11-reset-team');
            const allBtn = document.getElementById('arena11-reset-all');

            if (teamBtn) {
                teamBtn.onclick = async () => {
                    try {
                        await window.a2ResetCompetition('team');
                        Swal.close();
                        Swal.fire('Sıfırlandı', 'Takım ilerlemesi sıfırlandı.', 'success');
                    } catch (e) {
                        Swal.fire('Hata', e && e.message ? e.message : 'Takım sıfırlanamadı.', 'error');
                    }
                };
            }

            if (allBtn) {
                allBtn.onclick = async () => {
                    const confirmReset = await Swal.fire({
                        title: 'Emin misin?',
                        text: 'Tüm arena kayıtları sıfırlanacak.',
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Evet, sıfırla',
                        cancelButtonText: 'Vazgeç',
                        background: '#020617',
                        color: '#fff'
                    });
                    if (!confirmReset.isConfirmed) return;
                    try {
                        await window.a2ResetCompetition('all');
                        Swal.close();
                        Swal.fire('Sıfırlandı', 'Tüm yarışma sıfırlandı.', 'success');
                    } catch (e) {
                        Swal.fire('Hata', e && e.message ? e.message : 'Yarışma sıfırlanamadı.', 'error');
                    }
                };
            }
        }
    });
    return result;
};


window.openAdminConfigPanel = async function() {
    await syncCompetitionData();
    if (typeof a2ReadFlowFromSettings === 'function') {
        await a2ReadFlowFromSettings(true);
    }

    const tasks = window.a2AllTasks();
    const seqRows = (typeof a2BuildSequence === 'function' ? a2BuildSequence() : [])
        .filter(x => x && x.task_id)
        .filter((x, i, arr) => i === arr.findIndex(y => y.order === x.order));

    const previewHtml = seqRows.length ? seqRows.map(row => `
        <div class="arena11-admin-seg">
            <div class="arena11-admin-seg-name">${safeEsc((window.a2TaskBadge({type: row.task_type}) ? window.a2TaskBadge({type: row.task_type}) + ' ' : '') + row.task_name)}</div>
            <div class="arena11-admin-seg-sub">Kutu ${row.segment_start}-${row.segment_end} • ${row.step_total} adım • ${safeEsc(window.a2TaskTypeLabel({type: row.task_type}))}</div>
        </div>
    `).join('') : '<div class="arena-empty-note">Henüz görev sırası oluşturulmadı.</div>';

    const taskRows = tasks.map(t => `
        <tr style="border-bottom:1px solid rgba(148,163,184,.14);">
            <td style="padding:10px;">${safeEsc((window.a2TaskBadge(t) ? window.a2TaskBadge(t) + ' ' : '') + t.task_name)}</td>
            <td style="padding:10px; text-align:center; font-weight:800;">${t.steps}</td>
            <td style="padding:10px; text-align:center;">${safeEsc(window.a2TaskTypeLabel(t))}</td>
            <td style="padding:10px; text-align:right; display:flex; gap:6px; justify-content:flex-end;">
                <button onclick="editTaskType(${t.id})" class="x-btn" style="padding:4px 8px; font-size:.72rem; background:#475569; color:white;"><i class="fas fa-edit"></i></button>
                <button onclick="deleteTaskType(${t.id})" class="x-btn" style="padding:4px 8px; font-size:.72rem; background:#ef4444; color:white;"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');

    return Swal.fire({
        title: 'Arena Yönetim Merkezi',
        html: `
            <div style="text-align:left">
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
                    <button onclick="openArenaSequencePanel()" class="x-btn x-btn-primary arena11-btn"><i class="fas fa-stream"></i> Görev Sıralaması</button>
                    <button onclick="addNewTaskType()" class="x-btn x-btn-primary arena11-btn"><i class="fas fa-plus"></i> Yeni Görev</button>
                    <button onclick="addSpecialTaskType()" class="x-btn x-btn-primary arena11-btn" style="background:#7c3aed;"><i class="fas fa-gift"></i> Özel Kutu</button>
                    <button onclick="openArenaResetPanel()" class="x-btn x-btn-primary arena11-btn" style="background:#dc2626;"><i class="fas fa-rotate-left"></i> Oyunu Sıfırla</button>
                </div>

                <div class="arena11-admin-card">
                    <div class="arena11-admin-card-title">Akış Önizleme</div>
                    <div class="arena11-admin-preview">${previewHtml}</div>
                </div>

                <div class="arena11-admin-card" style="margin-top:12px;">
                    <div class="arena11-admin-card-title">Görev Tanımları</div>
                    <div style="max-height:38vh; overflow:auto; border:1px solid rgba(148,163,184,.12); border-radius:14px;">
                        <table style="width:100%; border-collapse:collapse; font-size:.85rem;">
                            <thead style="position:sticky; top:0; background:#020617;">
                                <tr>
                                    <th style="padding:10px; text-align:left;">Görev</th>
                                    <th style="padding:10px; text-align:center;">Adım</th>
                                    <th style="padding:10px; text-align:center;">Tip</th>
                                    <th style="padding:10px; text-align:right;">İşlem</th>
                                </tr>
                            </thead>
                            <tbody>${taskRows}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        `,
        width: 1080,
        background: '#020617',
        color: '#fff',
        confirmButtonText: 'Kapat'
    });
};

try {
    const __origShowArenaBoxInfo = window.showArenaBoxInfo;
    window.showArenaBoxInfo = function(boxNo) {
        const seq = typeof a2FindSequenceBox === 'function' ? a2FindSequenceBox(boxNo) : null;
        const milestone = typeof a2MilestoneMeta === 'function' ? a2MilestoneMeta(boxNo) : null;
        const st = a2CurrentState(currentUser);

        const stateLabel = boxNo <= st.approvedBoxes
            ? '<span style="color:#10b981;">Tamamlandı</span>'
            : boxNo === st.currentBox
                ? (st.pendingMove ? '<span style="color:#fbbf24;">Admin onayı bekleniyor</span>' : '<span style="color:#67e8f9;">Sıradaki Görev</span>')
                : '<span style="color:#94a3b8;">Henüz açılmadı</span>';

        return Swal.fire({
            title: `${boxNo}. Kutu`,
            html: `
                <div style="text-align:left">
                    <div style="margin-bottom:8px;"><b>Durum:</b> ${stateLabel}</div>
                    ${milestone ? `<div style="margin-bottom:8px;"><b>Kilometre Taşı:</b> ${milestone.icon} ${safeEsc(milestone.label)}</div>` : ''}
                    <div><b>Görev:</b> ${safeEsc(seq ? ((seq.task_badge ? seq.task_badge + ' ' : '') + seq.task_name) : 'Henüz görev atanmadı')}</div>
                    <div style="margin-top:6px;"><b>Tip:</b> ${safeEsc(window.a2TaskTypeLabel({type: seq ? seq.task_type : 'normal'}))}</div>
                    <div style="margin-top:6px;"><b>Segment:</b> ${seq ? (`Kutu ${seq.segment_start}-${seq.segment_end}`) : '-'}</div>
                    <div style="margin-top:6px;"><b>Adım:</b> ${seq ? `${seq.step_index}/${seq.step_total}` : '-'}</div>
                </div>
            `,
            background: '#0f172a',
            color: '#fff',
            confirmButtonText: 'Tamam'
        });
    };
} catch (_) {}
// ===== End Arena 2.0 delivery completion override =====


// ===== Arena 2.0 v12.0.0 clean progression + team override engine =====
window.ARENA2_VERSION = '12.1.0';

window.a2TagVal = function(note, key) {
    const m = String(note || '').match(new RegExp(`\\[${key}:([^\\]]+)\\]`));
    return m ? m[1] : '';
};

window.a2HumanizeNote = function(note) {
    const s = String(note || '');
    if (!s.includes('[ARENA2]')) return s; // Teknik etiket yoksa olduğu gibi dön

    const type = window.a2TagVal(s, 'TYPE');
    const box = window.a2TagVal(s, 'BOX');
    const taskId = window.a2TagVal(s, 'TASK');
    
    // Görev ismini bulalım
    let taskName = 'Bilinmeyen Görev';
    if (taskId && typeof a2TaskById === 'function') {
        const t = a2TaskById(taskId);
        if (t) taskName = t.task_name;
    }

    let humanText = '';
    if (type === 'submission') {
        humanText = `${box}. Kutu görev bildirimi yapıldı: ${taskName}`;
    } else if (type === 'bonus') {
        humanText = `⚡ Bonus etkinlik bildirimi yapıldı: ${taskName}`;
    } else if (type === 'override') {
        humanText = `${box}. Kutu görevi değiştirildi -> Yeni Görev: ${taskName}`;
    } else {
        humanText = s.replace(/\[ARENA2\]/g, '').replace(/\[[^\]]+:[^\]]+\]/g, '').trim() || s;
    }

    // Temsilci notu (DESC) ve Admin notunu (ADMIN_NOTE) ekleyelim
    const desc = window.a2TagVal(s, 'DESC');
    const adminMsg = window.a2TagVal(s, 'ADMIN_NOTE');

    if (desc) {
        humanText += `
            <div class="a2-feed-desc">
                <i class="fas fa-quote-left"></i> ${safeEsc(desc)}
            </div>
        `;
    }
    if (adminMsg) {
        humanText += `
            <div class="a2-feed-admin">
                <span class="a2-admin-label">Admin:</span> ${safeEsc(adminMsg)}
            </div>
        `;
    }

    return humanText;
};

window.a2ArenaRows = function() {
    // Tüm Arena 2.0 görevlerini config'den alalım ki ID bazlı eşleme yapabilelim
    const arenaTaskIds = new Set(window.a2AllTasks().map(t => Number(t.id)));
    
    return (window.competitionMoves || []).filter(m => {
        if (!m) return false;
        const note = String(m.admin_note || '');
        // Ya etiket vardır, ya da görev ID'si Arena görevlerinden biridir
        return note.includes('[ARENA2]') || arenaTaskIds.has(Number(m.task_id));
    });
};

window.a2GetTeamKeyForUser = function(uname) {
    if (!uname) return null;
    const team = (window.userTeams || []).find(t => t.user_a === uname || t.user_b === uname);
    if (team) return team.id ? `team:${team.id}` : `team:${team.user_a}:${team.user_b}`;
    return `solo:${uname}`;
};

window.a2RowsByType = function(teamKey, type) {
    return window.a2ArenaRows().filter(m => {
        const note = String(m?.admin_note || '');
        const mId = Number(m?.task_id || 0);
        const task = window.a2TaskById(mId);
        
        // 1. Etiketten oku (Öncelikli)
        let mTeamKey = window.a2TagVal(note, 'TEAMKEY');
        let mType = window.a2TagVal(note, 'TYPE');
        
        // 2. Eğer etiket yoksa Database sütunlarından çıkarım yap (Zırhlı Koruma)
        if (!mTeamKey) mTeamKey = window.a2GetTeamKeyForUser(m.user_name);
        if (!mType && task) {
            const tType = window.a2TaskType(task);
            mType = (tType === 'bonus' || tType === 'special') ? 'bonus' : 'submission';
        }
        
        return mType === type && mTeamKey === teamKey;
    });
};

window.a2AllTasks = function() {
    return (competitionConfig || []).filter(t => t && t.is_active !== false);
};

window.a2TaskById = function(taskId) {
    return window.a2AllTasks().find(t => String(t.id) === String(taskId)) || null;
};

window.a2TaskType = function(task) {
    return String((task && task.type) || 'normal').toLowerCase();
};

window.a2TaskTypeLabel = function(task) {
    const type = window.a2TaskType(task);
    const labels = {
        normal: 'Normal Görev',
        reward: 'Hediye',
        surprise: 'Sürpriz Soru',
        penalty: 'Ceza',
        bonus: 'Bonus Adım',
        bonus_step: 'Bonus Adım',
        empty: 'Boş'
    };
    return labels[type] || 'Görev';
};

window.a2TaskBadge = function(task) {
    const type = window.a2TaskType(task);
    if (type === 'reward') return '🎁';
    if (type === 'surprise') return '❓';
    if (type === 'penalty') return '⚠️';
    if (type === 'bonus' || type === 'bonus_step') return '⚡';
    return '';
};

window.a2BuildSegmentsForFlow = function(flow, bonusSteps = 0) {
    const tasks = new Map(window.a2AllTasks().map(t => [Number(t.id), t]));
    const segments = [];
    // Bonus adımları kadar başlangıç noktasını ileri kaydırıyoruz (Zırhlı Öteleme)
    let startBox = 1 + Number(bonusSteps);

    (Array.isArray(flow) ? flow : []).forEach((item, idx) => {
        const task = tasks.get(Number(item?.task_id || 0));
        if (!task || startBox > A2_TOTAL_BOXES) return;
        const steps = Math.max(1, Number(item?.steps || task.steps || 1));
        const endBox = Math.min(A2_TOTAL_BOXES, startBox + steps - 1);
        segments.push({
            order: Number(item?.order || idx + 1),
            task_id: Number(task.id),
            task_name: task.task_name,
            task_type: window.a2TaskType(task),
            task_badge: window.a2TaskBadge(task),
            start_box: startBox,
            end_box: endBox,
            steps: steps
        });
        startBox = endBox + 1;
    });

    return segments;
};

window.a2EffectiveFlow = function(teamKey) {
    const base = (window._arena2FlowCache || []).map(x => ({
        order: Number(x.order),
        task_id: Number(x.task_id),
        steps: Math.max(1, Number(x.steps || 1))
    }));

    const overrides = window.a2RowsByType(teamKey, 'override')
        .slice()
        .sort((a, b) => new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime());

    overrides.forEach(row => {
        const note = String(row?.admin_note || '');
        const order = Number(window.a2TagVal(note, 'ORDER') || 0);
        const taskId = Number(window.a2TagVal(note, 'TASK') || 0);
        const steps = Math.max(1, Number(window.a2TagVal(note, 'STEPS') || 1));
        const idx = base.findIndex(x => Number(x.order) === order);
        if (idx >= 0 && taskId > 0) {
            base[idx].task_id = taskId;
            base[idx].steps = steps;
        }
    });

    return base;
};

window.a2BuildSequence = function(teamKey) {
    const seq = [];
    // Toplam bonus adımlarını alalım
    let bSteps = 0;
    const approvedBonuses = window.a2RowsByType(teamKey, 'bonus').filter(m => m.status === 'approved');
    approvedBonuses.forEach(m => bSteps += Number(m.steps || 0));

    const segments = window.a2BuildSegmentsForFlow(window.a2EffectiveFlow(teamKey), bSteps);

    // İlk kutudan kaydırılan noktaya kadar olan kısmı 'Skipped' olarak işaretle
    for (let box = 1; box < (1 + bSteps); box++) {
        if (box > A2_TOTAL_BOXES) break;
        seq.push({
            box_no: box,
            order: 0,
            task_id: null,
            task_name: 'Bonusla Geçildi ⚡',
            task_type: 'empty',
            task_badge: '⚡',
            segment_start: 1,
            segment_end: bSteps,
            step_index: box,
            step_total: bSteps
        });
    }

    segments.forEach(seg => {
        for (let box = seg.start_box; box <= seg.end_box; box++) {
            seq.push({
                box_no: box,
                order: seg.order,
                task_id: seg.task_id,
                task_name: seg.task_name,
                task_type: seg.task_type,
                task_badge: seg.task_badge,
                segment_start: seg.start_box,
                segment_end: seg.end_box,
                step_index: box - seg.start_box + 1,
                step_total: seg.steps
            });
        }
    });
    while (seq.length < A2_TOTAL_BOXES) {
        const box = seq.length + 1;
        seq.push({
            box_no: box,
            order: 999,
            task_id: null,
            task_name: 'Boş Alan',
            task_type: 'empty',
            task_badge: '',
            segment_start: box,
            segment_end: box,
            step_index: 1,
            step_total: 1
        });
    }
    return seq;
};

window.a2SequenceBox = function(teamKey, boxNo) {
    return window.a2BuildSequence(teamKey).find(x => Number(x.box_no) === Number(boxNo)) || null;
};

window.a2SegmentByBox = function(teamKey, boxNo) {
    const b = window.a2SequenceBox(teamKey, boxNo);
    if (!b || !b.task_id) return null;
    return {
        order: b.order,
        task_id: b.task_id,
        task_name: b.task_name,
        task_type: b.task_type,
        task_badge: b.task_badge,
        start_box: b.segment_start,
        end_box: b.segment_end,
        steps: b.step_total
    };
};

window.a2ApprovedBoxCount = function(teamKey) {
    // Toplam bonus adımları
    let bonusTotalSteps = 0;
    const approvedBonuses = window.a2RowsByType(teamKey, 'bonus')
        .filter(m => String(m?.status || '').toLowerCase() === 'approved');
    approvedBonuses.forEach(m => bonusTotalSteps += Number(m.steps || 0));

    // Normal harita ilerlemesi (Sadece onaylı submission sayısına bakıyoruz)
    const approvedSubmissions = window.a2RowsByType(teamKey, 'submission')
        .filter(m => String(m?.status || '').toLowerCase() === 'approved');
    
    let questStepsDone = 0;
    approvedSubmissions.forEach(m => {
        const note = String(m?.admin_note || '');
        const steps = Number(window.a2TagVal(note, 'STEPS') || m.steps || 1);
        questStepsDone += steps;
    });

    return Math.min(bonusTotalSteps + questStepsDone, A2_TOTAL_BOXES);
};

window.a2PendingSubmission = function(teamKey, boxNo) {
    return window.a2RowsByType(teamKey, 'submission').find(m =>
        String(m?.status || '').toLowerCase() === 'pending' &&
        Number(window.a2TagVal(m?.admin_note, 'BOX') || 0) === Number(boxNo)
    ) || null;
};

window.a2CurrentState = function(uname) {
    const teamKey = a2GetTeamKey(uname);
    const captain = a2GetCaptain(uname);
    const approvedBoxes = window.a2ApprovedBoxCount(teamKey);
    const currentBox = Math.min(approvedBoxes + 1, A2_TOTAL_BOXES);
    
    // V12 Robust: Önce bu kutu için yapılmış bir 'override' (reroll) var mı diye doğrudan Moves listesine bakalım.
    // Bu, BuildSequence'daki olası sıralama (order) hatalarını bypass eder.
    const directOverride = window.a2RowsByType(teamKey, 'override')
        .filter(m => Number(window.a2TagVal(m?.admin_note, 'BOX')) === currentBox)
        .sort((a,b) => new Date(b?.created_at||0) - new Date(a?.created_at||0))[0];

    const currentSegment = approvedBoxes >= A2_TOTAL_BOXES ? null : window.a2SegmentByBox(teamKey, currentBox);

    let finalTaskId = currentSegment ? currentSegment.task_id : null;
    let finalSteps = currentSegment ? currentSegment.steps : 1;

    if (directOverride) {
        const oId = Number(window.a2TagVal(directOverride.admin_note, 'TASK') || directOverride.task_id || 0);
        if (oId > 0) {
            finalTaskId = oId;
            finalSteps = Number(window.a2TagVal(directOverride.admin_note, 'STEPS') || directOverride.steps || finalSteps);
        }
    }

    const taskObj = finalTaskId ? a2TaskById(finalTaskId) : null;

    const rerollsUsed = window.a2RowsByType(teamKey, 'override').length;
    return {
        teamKey,
        captain,
        approvedBoxes,
        currentBox,
        currentTask: taskObj ? {
            id: taskObj.id,
            task_name: taskObj.task_name,
            type: window.a2TaskType(taskObj),
            steps: finalSteps
        } : null,
        currentSegment,
        pendingMove: window.a2PendingSubmission(teamKey, currentBox),
        rerollsLeft: Math.max(0, 3 - rerollsUsed),
        isCaptain: captain === uname,
        isFinished: approvedBoxes >= A2_TOTAL_BOXES
    };
};

window.a2MilestoneMeta = function(boxNo, teamKey) {
    if (boxNo === 50) return { icon: '🏰', label: 'Büyük Ödül Kalesi' };
    const seq = window.a2SequenceBox(teamKey, boxNo);
    if (!seq) return { icon: '🎯', label: 'Hedef' };
    
    const type = seq.task_type || 'normal';
    switch (type) {
        case 'reward':   return { icon: '🎁', label: 'Hediye' };
        case 'surprise': return { icon: '❓', label: 'Sürpriz' };
        case 'bonus':    return { icon: '⚡', label: 'Bonus' };
        case 'penalty':  return { icon: '⚠️', label: 'Ceza' };
        case 'castle':   return { icon: '🏰', label: 'Final' };
        default:         return { icon: '🏹', label: 'Mücadele' };
    }
};

window.a2BoxTaskName = function(boxNo, uname) {
    const teamKey = a2GetTeamKey(uname || currentUser);
    const seq = window.a2SequenceBox(teamKey, boxNo);
    return seq ? seq.task_name : 'Görev atanmadı';
};

/* Redundant openNewTaskModal removed - using a2OpenReportModal redirected at end of file */

window.openArenaReroll = async function() {
    await syncCompetitionData();
    await window.a2ReadFlowFromSettings(true);
    const st = window.a2CurrentState(currentUser);

    if (!st.isCaptain) return Swal.fire('Yetki Yok', 'Görevi sadece kaptan değiştirebilir.', 'warning');
    if (st.rerollsLeft <= 0) return Swal.fire('Hak Bitti', 'Görev değiştirme hakkın kalmadı.', 'info');
    if (st.pendingMove) return Swal.fire('Bekle', 'Önce bu segmentteki görev sonuçlanmalı.', 'warning');
    if (!st.currentSegment) return Swal.fire('Bilgi', 'Aktif segment bulunamadı.', 'info');

    const pool = window.a2AllTasks().filter(t =>
        String(t.id) !== String(st.currentSegment.task_id) && window.a2TaskType(t) !== 'empty'
    );

    if (!pool.length) return Swal.fire('Görev Yok', 'Alternatif görev bulunamadı.', 'info');
    const picked = pool[Math.floor(Math.random() * pool.length)];
    const steps = Math.max(1, Number(picked.steps || st.currentSegment.steps || 1));

    const note = `[ARENA2][TYPE:override][TEAMKEY:${st.teamKey}][BOX:${st.currentBox}][ORDER:${st.currentSegment.order}][TASK:${picked.id}][STEPS:${steps}][CAPTAIN:${st.captain}]`;
    const ins = await sb.from('competition_moves').insert({
        user_name: st.captain,
        task_id: Number(picked.id),
        steps: steps,
        status: 'approved',
        approved_at: new Date().toISOString(),
        admin_note: note
    });

    if (ins?.error) return Swal.fire('Hata', ins.error.message || 'Görev değiştirilemedi.', 'error');

    window.a2PlaySound('reroll');
    await syncCompetitionData();
    window.renderCompetitionBoard();
    return Swal.fire('Görev Değişti', `Yeni görev: ${picked.task_name}`, 'success');
};

window.a2EnsureActionPanel = function() {
    const host = document.querySelector('.q-comp-square-actions');
    if (!host) return;

    let panel = document.getElementById('arena2-captain-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'arena2-captain-panel';
        host.appendChild(panel);
    }

    const st = window.a2CurrentState(currentUser);
    const t = st.currentTask || {};
    
    // Bonus Timer Logic
    let timerHtml = '';
    const bonusDur = Number(window.a2TagVal(t.task_name, 'BONUS_DURATION') || 0);
    if (bonusDur > 0 && !st.pendingMove && !st.isFinished) {
        const teamKey = st.teamKey;
        // Bu segmentin başlangıç zamanını bulalım (son onaylanan move'un tarihi)
        const lastApp = (competitionMoves || []).filter(m => m.status === 'approved' && window.a2TagVal(m.admin_note, 'TEAMKEY') === teamKey)
                        .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];
        const startTime = lastApp ? new Date(lastApp.created_at).getTime() : 0;
        const endTime = startTime + (bonusDur * 60000);
        const rem = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        
        if (rem > 0) {
            const m = Math.floor(rem / 60);
            const s = (rem % 60).toString().padStart(2, '0');
            timerHtml = `<div class="arena12-timer-badge">⚡ BONUS SÜRE: ${m}:${s}</div>`;
            if (!window.__a2TimerTick) window.__a2TimerTick = setInterval(() => window.a2EnsureActionPanel(), 1000);
        } else {
            timerHtml = `<div class="arena12-timer-badge expired">⌛ Süre Doldu (Bonus Kaybedildi)</div>`;
            if (window.__a2TimerTick) { clearInterval(window.__a2TimerTick); window.__a2TimerTick = null; }
        }
    } else {
        if (window.__a2TimerTick) { clearInterval(window.__a2TimerTick); window.__a2TimerTick = null; }
    }

    panel.innerHTML = `
        <div class="arena12-head">
            <div class="arena12-title">Arena 2.0</div>
            <div class="arena12-head-actions">
                <div class="arena12-ver">v${safeEsc(window.ARENA2_VERSION)}</div>
                <button class="arena12-info-btn" onclick="window.a2OpenInfoModal()" title="Oyun Rehberi"><i class="fas fa-info-circle"></i></button>
            </div>
        </div>
        <div class="arena12-grid">
            <div class="arena12-card"><span>Takım</span><b>${safeEsc(a2GetTeamLabel(currentUser))}</b></div>
            <div class="arena12-card"><span>Pozisyon</span><b>Kutu ${Math.min(st.currentBox, A2_TOTAL_BOXES)}/${A2_TOTAL_BOXES}</b></div>
            <div class="arena12-card"><span>Rol</span><b>${st.isCaptain ? '👑 Kaptansın' : `Kaptan: ${safeEsc(st.captain)}`}</b></div>
            <div class="arena12-card"><span>Reroll</span><b>${st.rerollsLeft}/3</b></div>
        </div>
        <div class="arena12-current">
            <div class="arena12-current-top"><span>Aktif görev</span><span>${safeEsc(window.a2TaskTypeLabel({type: t.type}))}</span></div>
            <div class="arena12-current-name">${safeEsc(t.task_name ? t.task_name.replace(/\[[^\]]+\]/g, '').trim() : 'Atanmadı')}</div>
            ${st.currentSegment ? `<div class="arena12-current-sub">Kutu ${st.currentSegment.start_box}-${st.currentSegment.end_box} • ${st.currentSegment.steps} adım</div>` : ''}
            ${timerHtml}
            ${st.pendingMove ? `<div class="arena12-wait">Bu görev admin onayında.</div>` : ''}
        </div>
        <button id="arena12-reroll-btn" class="x-btn arena12-reroll" style="margin-bottom:8px;">🎲 Görevi Değiştir</button>
        <button id="arena12-submit-btn" class="x-btn" style="width:100%; background:#2563eb; color:#fff; font-weight:800; padding:10px; border-radius:12px; display:${st.isCaptain && !st.pendingMove && !st.isFinished ? 'block' : 'none'};">GÖREVİ BİLDİR</button>
    `;

    const rBtn = document.getElementById('arena12-reroll-btn');
    if (rBtn) {
        rBtn.disabled = (!st.isCaptain || st.rerollsLeft <= 0 || !!st.pendingMove || st.isFinished);
        rBtn.onclick = () => window.openArenaReroll();
    }
    const sBtn = document.getElementById('arena12-submit-btn');
    if (sBtn) sBtn.onclick = () => window.openNewTaskModal();
};

window.ensureArenaRightRail = function() {
    const shell = document.querySelector('.q-comp-main-shell');
    if (!shell) return null;

    let rail = document.getElementById('arena-premium-right-rail');
    if (!rail) {
        rail = document.createElement('aside');
        rail.id = 'arena-premium-right-rail';
        rail.className = 'arena-premium-right-rail';
        shell.appendChild(rail);
    }

    const entries = [];
    const teams = (userTeams || []).filter(t => t && t.status === 'active');
    teams.forEach(team => {
        const key = team.id ? `team:${team.id}` : `solo:${team.user_a}`;
        entries.push({
            label: team.team_name || [team.user_a, team.user_b].filter(Boolean).join(' / '),
            progress: window.a2ApprovedBoxCount(key)
        });
    });

    const known = new Set([currentUser]);
    (competitionMoves || []).forEach(m => { if (m?.user_name) known.add(m.user_name); });
    [...known].forEach(uname => {
        const inTeam = teams.some(t => t.user_a === uname || t.user_b === uname);
        if (inTeam) return;
        entries.push({ label: uname, progress: window.a2ApprovedBoxCount(`solo:${uname}`) });
    });

    entries.sort((a, b) => b.progress - a.progress || a.label.localeCompare(b.label, 'tr'));

    const leaders = entries.slice(0, 8).map((x, i) => {
        const isTeam = (userTeams || []).some(t => t.team_name === x.label);
        const crown = isTeam ? '<i class="fas fa-crown arena12-crown" title="Takım Kaptanı"></i>' : '';
        return `
            <div class="arena12-leader ${i===0?'top':''}">
                <div class="arena12-rank">#${i+1}</div>
                <div class="arena12-lmain">
                    <div class="arena12-lname">${safeEsc(x.label)}${crown}</div>
                    <div class="arena12-lsub">${x.progress}/${A2_TOTAL_BOXES} kutu</div>
                    <div class="arena12-bar"><span style="width:${Math.max(4, (x.progress / A2_TOTAL_BOXES) * 100)}%"></span></div>
                </div>
            </div>
        `;
    }).join('') || '<div class="arena-empty-note">Henüz veri yok.</div>';

    const feed = window.a2ArenaRows().slice().sort((a,b)=>new Date(b?.created_at||0)-new Date(a?.created_at||0)).slice(0,10).map(m => {
        const s = String(m?.status||'').toLowerCase();
        const cls = s==='approved' ? 'ok' : (s==='rejected' ? 'bad' : 'wait');
        const label = s==='approved' ? 'Onay' : (s==='rejected' ? 'Red/Ceza' : 'Bekliyor');
        const humanNote = window.a2HumanizeNote ? window.a2HumanizeNote(m?.admin_note) : String(m?.admin_note || '').slice(0, 120);
        const isPending = s === 'pending';

        return `
            <div class="arena12-feed-item ${isPending ? 'pending' : ''}">
                <div class="arena12-feed-top">
                    <span class="arena12-feed-user">${safeEsc(m?.user_name || 'Bilinmiyor')}</span>
                    <span class="arena12-badge ${cls}">${label}</span>
                </div>
                <div class="arena12-feed-body">${humanNote}</div>
            </div>
        `;
    }).join('') || '<div class="arena-empty-note">Henüz yönetim kaydı yok.</div>';

    const isMuted = localStorage.getItem('arena2_muted') === 'true';
    const volIcon = isMuted ? 'fa-volume-mute' : 'fa-volume-up';
    const volCls = isMuted ? 'muted' : '';

    rail.innerHTML = `
        <div class="arena12-rail-card" style="margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; padding:10px;">
            <div style="font-size:0.85rem; font-weight:700;"><i class="fas fa-headphones"></i> Ses Kontrolü</div>
            <button onclick="window.a2ToggleAudio()" class="arena12-audio-toggle ${volCls}" title="Sesi Aç/Kapat">
                <i class="fas ${volIcon}"></i>
            </button>
        </div>
        <div class="arena12-rail-card">
            <div class="arena12-rail-title">🏆 Lider Tablosu</div>
            <div class="arena12-scroll">${leaders}</div>
        </div>
        <div class="arena12-rail-card feed">
            <div class="arena12-rail-title">🧾 Yönetim Akışı</div>
            <div class="arena12-scroll">${feed}</div>
        </div>
    `;
    return rail;
};

window.renderCompetitionBoard = function() {
    const container = document.getElementById('q-comp-board');
    if (!container) return;

    ensureArenaRightRail();

    const st = window.a2CurrentState(currentUser);
    const teamKey = st.teamKey;
    const stage = container.closest('.arena2-board-wrapper') || container.parentElement || document.body;
    const stageWidth = Math.max(stage?.clientWidth || 1200, 900);
    const stageHeight = Math.max(stage?.clientHeight || 650, 560);

    const cols = 10;
    let boxSize = 82, stepX = 102, stepY = 110, offsetX = 16, offsetY = 14;
        if (stageWidth <= 1200 || stageHeight <= 720) {
        boxSize = 70; stepX = 88; stepY = 95;
    } else if (stageWidth >= 1650 && stageHeight >= 820) {
        boxSize = 88; stepX = 108; stepY = 116;
    }

    const lineThickness = Math.max(8, Math.round(boxSize * 0.12));
    const lineOffset = Math.round(boxSize / 2);
    const boardWidth = offsetX * 2 + stepX * 9 + boxSize;
    const boardHeight = offsetY * 2 + stepY * 5 + boxSize;
    const fitW = Math.max((stage.clientWidth || boardWidth) - 14, 740);
    const fitH = Math.max((stage.clientHeight || boardHeight) - 14, 500);
    const scale = Math.max(0.72, Math.min(fitW / boardWidth, fitH / boardHeight, 1.0));
    const scaledWidth = Math.round(boardWidth * scale);
    const scaledHeight = Math.round(boardHeight * scale);

    let html = `<div class="arena12-fit" style="position:relative;width:${scaledWidth}px;height:${scaledHeight}px;"><div class="q-comp-path-container arena12-board" style="position:relative;width:${boardWidth}px;height:${boardHeight}px;transform:scale(${scale});transform-origin:top left;">`;

    for (let i = 0; i < A2_TOTAL_BOXES; i++) {
        const r1 = Math.floor(i / cols), c1 = (r1 % 2 === 0) ? (i % cols) : (9 - (i % cols));
        const next = i + 1;
        const r2 = Math.floor(next / cols), c2 = (r2 % 2 === 0) ? (next % cols) : (9 - (next % cols));
        const vr1 = 5 - r1, vr2 = 5 - r2;
        const x1 = offsetX + c1 * stepX + lineOffset, y1 = offsetY + vr1 * stepY + lineOffset;
        const x2 = offsetX + c2 * stepX + lineOffset, y2 = offsetY + vr2 * stepY + lineOffset;
        const horizontal = vr1 === vr2;
        const width = horizontal ? Math.abs(x2 - x1) : lineThickness;
        const height = horizontal ? lineThickness : Math.abs(y2 - y1);
        const top = Math.min(y1, y2), left = Math.min(x1, x2);
        const done = (i + 1) <= st.approvedBoxes;
        const active = !done && st.currentBox === (i + 1);
        html += `<div class="q-comp-path-line ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}" style="top:${top}px;left:${left}px;width:${width}px;height:${height}px;position:absolute;z-index:2;"></div>`;
    }

    const gemClasses = ['gem-ruby', 'gem-sapphire', 'gem-emerald', 'gem-gold', 'gem-amethyst'];

    for (let i = 0; i <= A2_TOTAL_BOXES; i++) {
        let typeClass = '', stateClass = '', extraAttrs = '', extraStyle = '', numberHtml = '', taskHtml = '', milestoneHtml = '';

        if (i === 0) {
            typeClass = 'start';
            numberHtml = '<div class="q-step-box-number"><i class="fas fa-flag-checkered"></i></div>';
            taskHtml = '<div class="q-step-box-task fixed-label">Başlangıç</div>';
        } else if (i === A2_TOTAL_BOXES) {
            const meta = (typeof a2MilestoneMeta === 'function' ? a2MilestoneMeta(i) : null);
            typeClass = 'finish';
            numberHtml = `<div class="q-step-box-number">${meta ? meta.icon : '🏰'}</div>`;
            taskHtml = `<div class="q-step-box-task fixed-label">${meta ? meta.label : 'Büyük Ödül'}</div>`;
            milestoneHtml = `<div class="a2-milestone-badge milestone-castle" style="position:absolute;top:-12px;right:-10px;width:32px;height:32px;background:linear-gradient(180deg,#fbbf24,#f59e0b);border-radius:50%;display:grid;place-items:center;font-size:1.1rem;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:5;border:2px solid #fff;">🏆</div>`;
            extraStyle = 'cursor:pointer;';
            extraAttrs = 'title="Final" onclick="handleGrandPrizeClick()"';
            if (st.approvedBoxes >= A2_TOTAL_BOXES) stateClass += ' is-complete';
        } else {
            const seq = window.a2SequenceBox(teamKey, i);
            const isCurrent = (i === st.currentBox && !st.isFinished);
            const isDone = i <= st.approvedBoxes;
            const isFuture = i > st.currentBox; // Fog of War: Gelecekteki kutuları gizleme mantığı
            const isSegmentStart = seq && i === seq.segment_start;
            
            typeClass = gemClasses[i % gemClasses.length];
            
            if (isCurrent) {
                const meta = window.a2MilestoneMeta(i, teamKey);
                milestoneHtml = `<div class="a2-milestone-badge" style="position:absolute;top:-12px;right:-10px;width:30px;height:30px;background:rgba(255,255,255,0.95);border-radius:50%;display:grid;place-items:center;font-size:1rem;box-shadow:0 6px 15px rgba(0,0,0,0.25);z-index:5;border:2px solid #fff;animation:milestonePop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;">${meta.icon}</div>`;
                stateClass += ' has-milestone ';
            }

            numberHtml = `<div class="q-step-box-number">${i}</div>`;
            
            // Gelecek görevse içeriği maskele
            if (isFuture) {
                taskHtml = `<div class="q-step-box-task" style="opacity:0.6;font-style:italic;">???</div>`;
                extraAttrs = `title="Gizemli Görev" onclick="window.showArenaBoxInfo(${i})"`;
            } else {
                taskHtml = `
                    ${isCurrent ? `<div class="q-step-box-task next-task-label">Sıradaki Görev</div>` : ''}
                    ${(isSegmentStart && seq && seq.task_id) ? `<div class="q-step-box-sub">${seq.step_total} adım</div>` : ''}
                    <div class="a2-box-hover-hint">${seq && seq.task_id ? `${seq.segment_start}-${seq.segment_end} segmenti` : 'Henüz görev seçilmedi'}</div>
                `;
                extraAttrs = `title="${safeEsc(seq ? ((seq.task_badge ? seq.task_badge + ' ' : '') + seq.task_name) : ('Kutu ' + i))}" onclick="window.showArenaBoxInfo(${i})"`;
            }
            
            extraStyle = 'cursor:pointer;';
            
            if (isDone) stateClass += ' is-complete';
            if (isCurrent) stateClass += ' current-box';
            if (st.pendingMove && isCurrent) stateClass += ' pending-box';
            if (!seq || !seq.task_id) stateClass += ' is-unassigned';
            if (isSegmentStart) stateClass += ' is-segment-start';
        }

        const r = Math.floor(i / cols);
        const col = (r % 2 === 0) ? (i % cols) : (9 - (i % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY;
        const left = offsetX + col * stepX;

        html += `
            <div class="q-step-box ${typeClass} ${stateClass.trim()}" ${extraAttrs}
                 style="position:absolute;top:${top}px;left:${left}px;width:${boxSize}px;height:${boxSize}px;z-index:20;${extraStyle}">
                ${milestoneHtml}
                <div class="q-step-box-inner">
                    ${numberHtml}
                    ${taskHtml}
                </div>
            </div>
        `;
    }

    const rendered = new Set();
    const teams = (userTeams || []).filter(t => t && t.status === 'active');
    teams.forEach(team => {
        const key = team.id ? `team:${team.id}` : `solo:${team.user_a}`;
        const approved = window.a2ApprovedBoxCount(key);
        const r = Math.floor(approved / cols);
        const col = (r % 2 === 0) ? (approved % cols) : (9 - (approved % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY + 8;
        const left = offsetX + col * stepX + 10;

        [team.user_a, team.user_b].forEach((uname, idx) => {
            if (!uname) return;
            rendered.add(uname);
            const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || (idx === 0 ? 'm1' : 'f1');
            const avatar = AVATAR_MAP[avatarId] || AVATAR_MAP['m1'];
            const cls = idx === 0 ? 'team-left' : 'team-right';
            const isMe = (uname === currentUser);
            
            // Premium 3D Avatar Render
            html += `
                <div class="q-user-avatar ${isMe ? 'current-user' : ''} ${cls}"
                     title="${safeEsc(uname)}"
                     style="top:${top}px;left:${left}px;z-index:40;background:${avatar.color};
                            width:52px;height:52px;display:grid;place-items:center;border-radius:12px;
                            box-shadow: 0 8px 20px rgba(0,0,0,0.35), inset 0 0 10px rgba(255,255,255,0.3);
                            border: 2px solid #fff; transition: all 0.3s ease;">
                    <i class="fas ${avatar.icon}" style="font-size:1.4rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));"></i>
                    ${uname === team.user_a ? '<span style="position:absolute;top:-8px;left:-8px;background:#fbbf24;color:#000;width:20px;height:20px;border-radius:5px;display:grid;place-items:center;font-size:0.7rem;box-shadow:0 2px 5px rgba(0,0,0,0.3);"><i class="fas fa-crown"></i></span>' : ''}
                    <div class="avatar-label" style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.6);color:#fff;padding:1px 5px;border-radius:4px;font-size:0.65rem;white-space:nowrap;pointer-events:none;">${safeEsc(uname)}</div>
                </div>
            `;
        });
    });

    const knownUsers = new Set([currentUser]);
    (competitionMoves || []).forEach(m => { if (m?.user_name) knownUsers.add(m.user_name); });
    [...knownUsers].forEach(uname => {
        if (!uname || rendered.has(uname)) return;
        const approved = window.a2ApprovedBoxCount(`solo:${uname}`);
        const r = Math.floor(approved / cols);
        const col = (r % 2 === 0) ? (approved % cols) : (9 - (approved % cols));
        const row = 5 - r;
        const top = offsetY + row * stepY + 10;
        const left = offsetX + col * stepX + 14;
        const avatarId = localStorage.getItem(`comp_avatar_${uname}`) || 'm1';
        const avatar = AVATAR_MAP[avatarId] || AVATAR_MAP['m1'];
        html += `
            <div class="q-user-avatar ${uname === currentUser ? 'current-user' : ''} solo-token"
                 title="${safeEsc(uname)}"
                 style="top:${top}px;left:${left}px;z-index:35;background:${avatar.color};">
                <i class="fas ${avatar.icon}"></i>
            </div>
        `;
    });

    html += '</div></div>';
    container.innerHTML = html;
    window.a2EnsureActionPanel();
    ensureArenaRightRail();
    
    // 🏆 Özel Bonus Kutusu Kontrolü (Floating Widget)
    if (typeof window.a2UpdateFloatingBonusUI === 'function') window.a2UpdateFloatingBonusUI();
};

window.showArenaBoxInfo = function(boxNo) {
    const st = window.a2CurrentState(currentUser);
    const seq = window.a2SequenceBox(st.teamKey, boxNo);
    const meta = (typeof a2MilestoneMeta === 'function' ? a2MilestoneMeta(boxNo, st.teamKey) : null);
    
    const isCurrentBox = (boxNo === st.currentBox && !st.isFinished);
    const isCompleted = (boxNo <= st.approvedBoxes);
    const isFuture = boxNo > st.currentBox;

    const stateLabel = isCompleted
        ? '<span style="color:#10b981;"><i class="fas fa-check-circle"></i> Tamamlandı</span>'
        : isCurrentBox
            ? (st.pendingMove ? '<span style="color:#fbbf24;"><i class="fas fa-clock"></i> Admin onayı bekleniyor</span>' : '<span style="color:#67e8f9;"><i class="fas fa-star"></i> Sıradaki Görev</span>')
            : '<span style="color:#94a3b8;"><i class="fas fa-lock"></i> Henüz açılmadı</span>';

    // Bildir butonu - Sadece aktif kutuda, kaptan ise ve bekleyen onay yoksa
    const canSubmit = isCurrentBox && st.isCaptain && !st.pendingMove && seq && seq.task_id;
    const submitBtnHtml = canSubmit ? `
        <button class="a2-box-submit-btn" style="width:100%; margin-top:15px; padding:12px; border-radius:12px; border:none; background:linear-gradient(135deg,#3b82f6,#2563eb); color:white; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 10px 20px rgba(37,99,235,0.3); transition:all 0.2s;" 
                onclick="Swal.close(); setTimeout(() => window.openNewTaskModal(), 150);">
            <i class="fas fa-paper-plane"></i> Bu Görevi Bildir — Kutu ${boxNo}
        </button>` : '';

    // Fog of War Masking
    // Fog of War Masking + Robust Override Check
    let actualTaskName = (seq ? seq.task_name : 'Henüz görev atanmadı');
    let taskBadge = (seq ? seq.task_badge : '');

    if (isCurrentBox && st.currentTask) {
        actualTaskName = st.currentTask.task_name;
        // Badge'i taskObj'den alalım eğer varsa
        const tObj = a2TaskById(st.currentTask.id);
        if (tObj) taskBadge = window.a2TaskBadge(tObj);
    }

    const displayName = isFuture ? 'Gizemli Görev' : ((taskBadge ? taskBadge + ' ' : '') + actualTaskName);
    const displayType = isFuture ? '???' : safeEsc(window.a2TaskTypeLabel({type: seq ? seq.task_type : 'empty'}));
    const displaySegment = isFuture ? '???' : (seq ? `Kutu ${seq.segment_start}-${seq.segment_end}` : '-');
    const displaySteps = isFuture ? '???' : (seq ? `${seq.step_index}/${seq.step_total}` : '-');

    return Swal.fire({
        title: `${boxNo}. Kutu`,
        html: `
            <div style="text-align:left">
                <div style="margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                    <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:10px; font-size:1.2rem;">${(meta && !isFuture) ? meta.icon : '📦'}</div>
                    <div>
                        <div style="font-size:0.75rem; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px;">Durum</div>
                        <div style="font-weight:700;">${stateLabel}</div>
                    </div>
                </div>
                
                <div style="padding:12px; border-radius:12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); margin-bottom:10px;">
                    <div style="font-size:0.72rem; color:#94a3b8; margin-bottom:4px;">Atanmış Görev</div>
                    <div style="font-weight:800; color:#fff; font-size:1rem;">${safeEsc(displayName)}</div>
                </div>
 
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                    <div style="padding:10px; border-radius:10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:0.65rem; color:#64748b;">Segment</div>
                        <div style="font-size:0.85rem; font-weight:600; color:#cbd5e1;">${displaySegment}</div>
                    </div>
                    <div style="padding:10px; border-radius:10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:0.65rem; color:#64748b;">Adım İlerlemesi</div>
                        <div style="font-size:0.85rem; font-weight:600; color:#cbd5e1;">${displaySteps}</div>
                    </div>
                </div>

                <div style="margin-top:12px; font-size:.82rem; color:#64748b; line-height:1.4;">
                    ${isCurrentBox ? '👉 Bu senin şu anki hedefin. Tamamladığında aşağıdan bildir.' : (isCompleted ? '✅ Bu meydan okumayı başarıyla geçtin.' : '🔒 Buraya ulaşmak için önce önceki görevleri bitirmelisin. Görev henüz keşfedilmedi.')}
                </div>
                
                ${submitBtnHtml}
            </div>
        `,
        background: '#0f172a',
        color: '#fff',
        showConfirmButton: !canSubmit,
        confirmButtonText: 'Anladım'
    });
};

window.addSpecialTaskType = async function() {
    const res = await Swal.fire({
        title: '⚡ Bonus Adım Ekle',
        html: `
            <div style="text-align:left">
                <label style="display:block; margin-bottom:6px; color:#94a3b8; font-size:0.85rem;">Tip</label>
                <select id="arena12-special-type" style="width:100%; padding:10px; border-radius:10px; background:#0f172a; color:#fff; border:1px solid #334155; margin-bottom:10px;">
                    <option value="bonus">⚡ Bonus Adım</option>
                </select>

                <label style="display:block; margin-bottom:6px; color:#94a3b8; font-size:0.85rem;">Görev Adı</label>
                <input id="arena12-special-name" value="Özel Bonus" style="width:100%; padding:10px; border-radius:10px; background:#0f172a; color:#fff; border:1px solid #334155; margin-bottom:10px;" />
                
                <div id="arena12-duration-area" style="margin-bottom:10px;">
                    <label style="display:block; margin-bottom:6px; color:#94a3b8; font-size:0.85rem;">Bonus Süresi (Dakika)</label>
                    <input id="arena12-special-dur" type="number" min="1" value="15" style="width:100%; padding:10px; border-radius:10px; background:#0f172a; color:#fff; border:1px solid #334155;" />
                    <div style="font-size:0.7rem; color:#64748b; margin-top:4px;">0 girilirse süre sınırı olmaz.</div>
                </div>

                <label style="display:block; margin-bottom:6px; color:#94a3b8; font-size:0.85rem;">İlerleme Adımı</label>
                <input id="arena12-special-steps" type="number" min="1" max="10" value="2" style="width:100%; padding:10px; border-radius:10px; background:#0f172a; color:#fff; border:1px solid #334155;" />
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Kaydet',
        cancelButtonText: 'İptal',
        background: '#020617',
        color: '#fff',
        preConfirm: () => ({
            type: 'bonus',
            name: (document.getElementById('arena12-special-name')?.value || 'Özel Bonus').trim(),
            dur: Number(document.getElementById('arena12-special-dur')?.value || 0),
            steps: Math.max(1, Number(document.getElementById('arena12-special-steps')?.value || 1))
        })
    });
    if (!res.isConfirmed) return;
    const v = res.value;
    
    // Etiketleri isim içine yerleştir
    let finalName = v.name;
    if (v.dur > 0) finalName += ` [BONUS_DURATION:${v.dur}]`;
    
    const { error } = await sb.from('competition_config').insert({ 
        task_name: finalName, 
        steps: v.steps, 
        type: 'bonus',
        is_active: true
    });
    
    if (error) return Swal.fire('Hata', error.message || 'Özel kutu eklenemedi.', 'error');
    
    await syncCompetitionData();
    if (typeof renderCompetitionBoard === 'function') renderCompetitionBoard();
    return Swal.fire('Başarılı', `Özel bonus adımı başarıyla eklendi!`, 'success');
};

window.a2ResetCompetition = async function(mode) {
    mode = mode || 'all';
    if (!sb?.from) throw new Error('Supabase bağlantısı yok');

    if (mode === 'team') {
        const st = window.a2CurrentState(currentUser);
        const ids = window.a2ArenaRows().filter(m => window.a2TagVal(m?.admin_note, 'TEAMKEY') === st.teamKey).map(m => m.id).filter(Boolean);
        if (ids.length) {
            const del = await sb.from('competition_moves').delete().in('id', ids);
            if (del?.error) throw del.error;
        }
    } else {
        const del = await sb.from('competition_moves').delete().like('admin_note', '%[ARENA2]%');
        if (del?.error) throw del.error;
    }
    await syncCompetitionData();
    window.renderCompetitionBoard();
};

window.openArenaResetPanel = async function() {
    return Swal.fire({
        title: 'Oyunu Sıfırla',
        html: `
            <div style="text-align:left">
                <button id="arena12-reset-team" class="swal2-confirm swal2-styled" style="background:#475569; margin-right:8px;">Sadece Takımımı Sıfırla</button>
                <button id="arena12-reset-all" class="swal2-confirm swal2-styled" style="background:#dc2626;">Tüm Oyunu Sıfırla</button>
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        background: '#020617',
        color: '#fff',
        didOpen: () => {
            const teamBtn = document.getElementById('arena12-reset-team');
            const allBtn = document.getElementById('arena12-reset-all');
            if (teamBtn) teamBtn.onclick = async () => {
                try { await window.a2ResetCompetition('team'); Swal.close(); Swal.fire('Tamam', 'Takım sıfırlandı.', 'success'); }
                catch (e) { Swal.fire('Hata', e?.message || 'Sıfırlanamadı.', 'error'); }
            };
            if (allBtn) allBtn.onclick = async () => {
                const ok = await Swal.fire({ title: 'Emin misin?', text: 'Tüm arena kayıtları silinecek.', showCancelButton: true, confirmButtonText: 'Evet', cancelButtonText: 'Vazgeç', background: '#020617', color: '#fff' });
                if (!ok.isConfirmed) return;
                try { await window.a2ResetCompetition('all'); Swal.close(); Swal.fire('Tamam', 'Tüm yarışma sıfırlandı.', 'success'); }
                catch (e) { Swal.fire('Hata', e?.message || 'Sıfırlanamadı.', 'error'); }
            };
        }
    });
};

window.openAdminConfigPanel = async function() {
    await syncCompetitionData();
    await window.a2ReadFlowFromSettings(true);
    const tasks = window.a2AllTasks();
    const preview = window.a2BuildSegmentsForFlow(window._arena2FlowCache || []);
    const previewHtml = preview.length ? preview.map(seg => `
        <div class="arena12-admin-row">
            <div class="arena12-admin-name">${safeEsc((seg.task_badge ? seg.task_badge + ' ' : '') + seg.task_name)}</div>
            <div class="arena12-admin-sub">Kutu ${seg.start_box}-${seg.end_box} • ${seg.steps} adım • ${safeEsc(window.a2TaskTypeLabel({type: seg.task_type}))}</div>
        </div>
    `).join('') : '<div class="arena-empty-note">Henüz görev sırası oluşturulmadı.</div>';

    const rows = tasks.map(t => `
        <tr style="border-bottom:1px solid rgba(148,163,184,.14);">
            <td style="padding:10px;">${safeEsc((window.a2TaskBadge(t) ? window.a2TaskBadge(t) + ' ' : '') + t.task_name)}</td>
            <td style="padding:10px; text-align:center; font-weight:800;">${t.steps}</td>
            <td style="padding:10px; text-align:center;">${safeEsc(window.a2TaskTypeLabel(t))}</td>
            <td style="padding:10px; text-align:right; display:flex; gap:6px; justify-content:flex-end;">
                <button onclick="editTaskType(${t.id})" class="x-btn" style="padding:4px 8px; font-size:.72rem; background:#475569; color:white;"><i class="fas fa-edit"></i></button>
                <button onclick="deleteTaskType(${t.id})" class="x-btn" style="padding:4px 8px; font-size:.72rem; background:#ef4444; color:white;"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');

    const gpRow = (competitionConfig || []).find(c => String(c.task_name).startsWith('[GRANDPRIZE]'));
    const gpText = gpRow ? String(gpRow.task_name).slice(12) : 'Büyük ödül kalesine ulaştınız! Tebrikler!';

    return Swal.fire({
        title: 'Arena Yönetim Merkezi',
        html: `
            <div style="text-align:left">
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
                    <button onclick="openArenaSequencePanel()" class="x-btn x-btn-primary arena12-admin-btn"><i class="fas fa-stream"></i> Görev Sıralaması</button>
                    <button onclick="addNewTaskType()" class="x-btn x-btn-primary arena12-admin-btn"><i class="fas fa-plus"></i> Yeni Görev</button>
                    <button onclick="addSpecialTaskType()" class="x-btn x-btn-primary arena12-admin-btn" style="background:#7c3aed;"><i class="fas fa-gift"></i> Özel Kutu</button>
                    <button onclick="openArenaResetPanel()" class="x-btn x-btn-primary arena12-admin-btn" style="background:#dc2626;"><i class="fas fa-rotate-left"></i> Oyunu Sıfırla</button>
                </div>

                <div class="arena12-admin-card" style="margin-bottom:12px; border-color:#d97706;">
                    <div class="arena12-admin-title" style="color:#fbbf24;"><i class="fas fa-trophy"></i> Büyük Ödül İçeriği (Kale)</div>
                    <div style="display:flex; gap:8px;">
                        <input id="arena12-gp-text" value="${safeEsc(gpText)}" placeholder="Örn: 500TL Hediye Çeki!" style="flex:1; padding:10px; border-radius:10px; background:#0f172a; color:#fff; border:1px solid #d97706;" />
                        <button id="arena12-save-gp" class="x-btn" style="background:#d97706; color:#fff; padding:0 15px;">Kaydet</button>
                    </div>
                    <div style="font-size:0.7rem; color:#94a3b8; margin-top:5px;">* Kale açıldığında oyuncuların göreceği tebrik mesajı.</div>
                </div>

                <div class="arena12-admin-card">
                    <div class="arena12-admin-title">Akış Önizleme</div>
                    <div class="arena12-admin-preview">${previewHtml}</div>
                </div>
                <div class="arena12-admin-card" style="margin-top:12px;">
                    <div class="arena12-admin-title">Görev Tanımları</div>
                    <div style="max-height:38vh; overflow:auto; border:1px solid rgba(148,163,184,.12); border-radius:14px;">
                        <table style="width:100%; border-collapse:collapse; font-size:.85rem;">
                            <thead style="position:sticky; top:0; background:#020617;">
                                <tr>
                                    <th style="padding:10px; text-align:left;">Görev</th>
                                    <th style="padding:10px; text-align:center;">Adım</th>
                                    <th style="padding:10px; text-align:center;">Tip</th>
                                    <th style="padding:10px; text-align:right;">İşlem</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        `,
        width: 1080,
        background: '#020617',
        color: '#fff',
        confirmButtonText: 'Kapat'
    });
};

window.openArenaSequencePanel = async function() {
    await syncCompetitionData();
    await window.a2ReadFlowFromSettings(true);
    const tasks = window.a2AllTasks();
    if (!tasks.length) return Swal.fire('Görev Yok', 'Önce görev tanımı eklemelisin.', 'warning');

    const flow = Array.isArray(window._arena2FlowCache) && window._arena2FlowCache.length
        ? window._arena2FlowCache
        : tasks.slice(0, 50).map((t, idx) => ({ order: idx + 1, task_id: Number(t.id), steps: Math.max(1, Number(t.steps || 1)) }));

    const options = tasks.map(t => `<option value="${t.id}">${window.a2TaskBadge(t) ? window.a2TaskBadge(t) + ' ' : ''}${safeEsc(t.task_name)} • ${safeEsc(window.a2TaskTypeLabel(t))}</option>`).join('');

    const rows = Array.from({ length: 50 }, (_, idx) => {
        const item = flow[idx] || { order: idx + 1, task_id: '', steps: 1 };
        return `
            <tr>
                <td style="padding:8px; border-bottom:1px solid rgba(148,163,184,.14); font-weight:800;">${idx + 1}</td>
                <td style="padding:8px; border-bottom:1px solid rgba(148,163,184,.14);">
                    <select id="arena12-flow-task-${idx+1}" style="width:100%; padding:10px; border-radius:10px; background:#0f172a; color:#fff; border:1px solid #334155;">
                        <option value="">Görev seç</option>
                        ${options}
                    </select>
                </td>
                <td style="padding:8px; border-bottom:1px solid rgba(148,163,184,.14); width:110px;">
                    <input id="arena12-flow-steps-${idx+1}" type="number" min="1" max="20" value="${Number(item.steps || 1)}" style="width:100%; padding:10px; border-radius:10px; background:#0f172a; color:#fff; border:1px solid #334155;" />
                </td>
            </tr>
        `;
    }).join('');

    const res = await Swal.fire({
        title: 'Görev Akışı ve Adım Yönetimi',
        html: `
            <div style="text-align:left; margin-bottom:10px; color:#cbd5e1; font-size:.86rem;">
                1. sıradaki görev ilk segment olur. Görev tamamlanınca takım o segmentin sonuna ilerler ve sıradaki segment açılır.
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
                <button type="button" id="arena12-fill-defaults" class="swal2-confirm swal2-styled" style="background:#2563eb;">Varsayılan adımlarla doldur</button>
                <button type="button" id="arena12-clear-flow" class="swal2-deny swal2-styled" style="background:#475569;">Temizle</button>
                <button type="button" id="arena12-preview-flow" class="swal2-confirm swal2-styled" style="background:#7c3aed;">Kutu Önizleme</button>
            </div>
            <div style="max-height:60vh; overflow:auto; border:1px solid rgba(148,163,184,.14); border-radius:14px;">
                <table style="width:100%; border-collapse:collapse; font-size:.86rem;">
                    <thead style="position:sticky; top:0; background:#020617; z-index:2;">
                        <tr><th style="padding:10px; text-align:left; width:70px;">Sıra</th><th style="padding:10px; text-align:left;">Görev / Özel Kutu</th><th style="padding:10px; text-align:left; width:110px;">Adım</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `,
        width: 1020,
        background: '#020617',
        color: '#fff',
        showCancelButton: true,
        confirmButtonText: 'Kaydet',
        cancelButtonText: 'İptal',
        didOpen: () => {
            for (let i = 1; i <= 50; i++) {
                const item = flow[i - 1];
                const taskEl = document.getElementById(`arena12-flow-task-${i}`);
                const stepsEl = document.getElementById(`arena12-flow-steps-${i}`);
                if (taskEl && item?.task_id) taskEl.value = String(item.task_id);
                if (stepsEl && item?.steps) stepsEl.value = String(item.steps);
            }

            const fillBtn = document.getElementById('arena12-fill-defaults');
            const clearBtn = document.getElementById('arena12-clear-flow');
            const previewBtn = document.getElementById('arena12-preview-flow');

            if (fillBtn) fillBtn.onclick = () => {
                tasks.slice(0, 50).forEach((t, idx) => {
                    const taskEl = document.getElementById(`arena12-flow-task-${idx + 1}`);
                    const stepsEl = document.getElementById(`arena12-flow-steps-${idx + 1}`);
                    if (taskEl) taskEl.value = String(t.id);
                    if (stepsEl) stepsEl.value = String(Math.max(1, Number(t.steps || 1)));
                });
            };
            if (clearBtn) clearBtn.onclick = () => {
                for (let i = 1; i <= 50; i++) {
                    const taskEl = document.getElementById(`arena12-flow-task-${i}`);
                    const stepsEl = document.getElementById(`arena12-flow-steps-${i}`);
                    if (taskEl) taskEl.value = '';
                    if (stepsEl) stepsEl.value = '1';
                }
            };
            if (previewBtn) previewBtn.onclick = () => {
                const lines = [];
                let start = 1;
                for (let i = 1; i <= 50; i++) {
                    const taskEl = document.getElementById(`arena12-flow-task-${i}`);
                    const stepsEl = document.getElementById(`arena12-flow-steps-${i}`);
                    if (!taskEl || !taskEl.value) continue;
                    const t = window.a2TaskById(Number(taskEl.value));
                    if (!t) continue;
                    const steps = Math.max(1, Number(stepsEl?.value || 1));
                    const end = Math.min(A2_TOTAL_BOXES, start + steps - 1);
                    lines.push(`${start}-${end}: ${(window.a2TaskBadge(t) ? window.a2TaskBadge(t) + ' ' : '')}${t.task_name} (${steps} adım)`);
                    start = end + 1;
                }
                Swal.fire({
                    title: 'Akış Önizleme',
                    html: `<div style="text-align:left; max-height:48vh; overflow:auto;">${lines.length ? lines.map(x => `<div style="margin:6px 0;">• ${safeEsc(x)}</div>`).join('') : 'Önizleme için görev seç.'}</div>`,
                    background: '#020617',
                    color: '#fff',
                    confirmButtonText: 'Tamam'
                });
            };
        },
        preConfirm: () => {
            const out = [];
            for (let i = 1; i <= 50; i++) {
                const taskEl = document.getElementById(`arena12-flow-task-${i}`);
                const stepsEl = document.getElementById(`arena12-flow-steps-${i}`);
                if (taskEl && taskEl.value) {
                    out.push({
                        order: i,
                        task_id: Number(taskEl.value),
                        steps: Math.max(1, Number(stepsEl?.value || 1))
                    });
                }
            }
            return out;
        }
    });

    if (!res.isConfirmed) return;
    try {
        await window.a2SaveFlowToSettings(res.value || []);
        await window.a2ReadFlowFromSettings(true);
        window.renderCompetitionBoard();
        return Swal.fire('Kaydedildi', 'Görev sıralaması kaydedildi.', 'success');
    } catch (e) {
        return Swal.fire('Hata', e?.message || 'Kaydedilemedi.', 'error');
    }
};

window.addEventListener('resize', () => {
    clearTimeout(window.__arena12Resize);
    window.__arena12Resize = setTimeout(() => {
        try { if (typeof renderCompetitionBoard === 'function') renderCompetitionBoard(); } catch (_) {}
    }, 120);
});
// ===== End Arena 2.0 v12.0.0 clean progression + team override engine =====


// ===== Arena 2.0 v12.1.0 no-repeat task + performance patch =====
window.ARENA2_VERSION = '12.1.0';

window.__arena12RenderScheduled = false;
window.__arena12RenderingNow = false;
window.__arena12SubmitLock = false;
window.__arena12RailCacheKey = '';

window.a2CompletedTaskIds = function(teamKey) {
    const done = new Set();
    // Bireysel ve takım bazlı tamamlanan tüm görevleri (onaylı veya bekleyen) topla
    const allArenaRows = window.a2ArenaRows();
    
    allArenaRows.forEach(row => {
        const status = String(row?.status || '').toLowerCase();
        if (status !== 'approved' && status !== 'pending') return;

        // TeamKey kontrolü (Etiket yoksa user_name üzerinden bul)
        const note = String(row?.admin_note || '');
        let mTeamKey = window.a2TagVal(note, 'TEAMKEY') || window.a2GetTeamKeyForUser(row.user_name);
        
        if (mTeamKey === teamKey) {
            const taskId = Number(window.a2TagVal(note, 'TASK') || row.task_id || 0);
            if (taskId > 0) done.add(taskId);
        }
    });
    return done;
};

window.a2CandidateTaskPool = function() {
    return (window.a2AllTasks ? window.a2AllTasks() : []).filter(t => {
        const type = window.a2TaskType ? window.a2TaskType(t) : String(t?.type || 'normal');
        return type !== 'empty';
    });
};

window.a2FindReplacementTask = function(teamKey, excludeIds) {
    const completed = window.a2CompletedTaskIds(teamKey);
    const excludes = new Set(Array.from(excludeIds || []));
    const pool = window.a2CandidateTaskPool();

    let choice = pool.find(t => !completed.has(Number(t.id)) && !excludes.has(Number(t.id)));
    if (choice) return choice;

    choice = pool.find(t => !excludes.has(Number(t.id)));
    return choice || null;
};

if (window.a2EffectiveFlow) {
    const __a2EffectiveFlowBase = window.a2EffectiveFlow;
    window.a2EffectiveFlow = function(teamKey) {
        const flow = (__a2EffectiveFlowBase(teamKey) || []).map(x => ({...x}));
        const completed = window.a2CompletedTaskIds(teamKey);
        const used = new Set();

        for (let i = 0; i < flow.length; i++) {
            const item = flow[i];
            const taskId = Number(item?.task_id || 0);
            if (!taskId) continue;

            const shouldReplace = completed.has(taskId) || used.has(taskId);
            if (shouldReplace) {
                const replacement = window.a2FindReplacementTask(teamKey, new Set([...completed, ...used, taskId]));
                if (replacement) {
                    flow[i].task_id = Number(replacement.id);
                    flow[i].steps = Math.max(1, Number(flow[i].steps || replacement.steps || 1));
                }
            }
            used.add(Number(flow[i].task_id || 0));
        }
        return flow;
    };
}

window.a2SmartRefresh = async function() {
    await syncCompetitionData();
    
    // Zafer Kontrolü (Box 50'ye ulaşıldıysa otomatik kutlama)
    const st = window.a2CurrentState(currentUser);
    if (st && st.isFinished) {
        if (typeof window.a2TriggerVictoryAnimation === 'function') {
            window.a2TriggerVictoryAnimation();
        }
    } else {
        // Oyun bitmediyse, bayrağı sıfırla ki bir sonraki sefer patlayabilsin
        window.__a2VictoryTriggered = false;
    }

    if (typeof window.renderCompetitionBoard === 'function') {
        window.renderCompetitionBoard();
    }
    if (typeof window.renderCompetitionLeaderboard === 'function') {
        try { window.renderCompetitionLeaderboard(); } catch (_) {}
    }
};

if (window.openNewTaskModal) {
    const __openNewTaskModalBase = window.openNewTaskModal;
    window.openNewTaskModal = async function() {
        if (window.__arena12SubmitLock) return;
        window.__arena12SubmitLock = true;
        try {
            const st = window.a2CurrentState ? window.a2CurrentState(currentUser) : null;
            if (st?.pendingMove) {
                window.__arena12SubmitLock = false
            }
            const result = await __openNewTaskModalBase();
            return result;
        } finally {
            setTimeout(() => { window.__arena12SubmitLock = false; }, 400);
        }
    };
}

if (window.ensureArenaRightRail) {
    const __ensureArenaRightRailBase = window.ensureArenaRightRail;
    window.ensureArenaRightRail = function() {
        const movesSnapshot = (competitionMoves || []).slice(-15).map(m => `${m.id}:${m.status}`).join('|');
        const key = JSON.stringify({
            moves: movesSnapshot,
            teams: (userTeams || []).length,
            user: currentUser || ''
        });

        const rail = document.getElementById('arena-premium-right-rail');
        if (rail && window.__arena12RailCacheKey === key) return rail;

        const out = __ensureArenaRightRailBase();
        window.__arena12RailCacheKey = key;
        return out;
    };
}

if (window.renderCompetitionBoard) {
    const __renderCompetitionBoardBase = window.renderCompetitionBoard;
    window.renderCompetitionBoard = function() {
        if (window.__arena12RenderingNow) return;
        if (window.__arena12RenderScheduled) return;

        window.__arena12RenderScheduled = true;
        requestAnimationFrame(() => {
            window.__arena12RenderScheduled = false;
            if (window.__arena12RenderingNow) return;
            window.__arena12RenderingNow = true;
            try {
                __renderCompetitionBoardBase();
            } finally {
                window.__arena12RenderingNow = false;
            }
        });
    };
}

if (window.openArenaReroll) {
    const __openArenaRerollBase = window.openArenaReroll;
    window.openArenaReroll = async function() {
        if (window.__arena12SubmitLock) return;
        window.__arena12SubmitLock = true;
        try {
            const st = window.a2CurrentState(currentUser);
            const completed = window.a2CompletedTaskIds(st.teamKey);
            const activeTaskId = Number(st?.currentSegment?.task_id || 0);
            const pool = window.a2CandidateTaskPool().filter(t => {
                const id = Number(t.id);
                const type = window.a2TaskType(t);
                return id !== activeTaskId && !completed.has(id) && type !== 'bonus' && type !== 'special';
            });

            if (!pool.length) {
                return Swal.fire('Görev Yok', 'Tamamlanan görevler dışındaki uygun görev kalmadı.', 'info');
            }

            const picked = pool[Math.floor(Math.random() * pool.length)];
            const steps = Math.max(1, Number(picked.steps || st.currentSegment.steps || 1));
            const note = `[ARENA2][TYPE:override][TEAMKEY:${st.teamKey}][BOX:${st.currentBox}][ORDER:${st.currentSegment.order}][TASK:${picked.id}][STEPS:${steps}][CAPTAIN:${st.captain}]`;
            const ins = await sb.from('competition_moves').insert({
                user_name: st.captain,
                task_id: Number(picked.id),
                steps: steps,
                status: 'approved',
                approved_at: new Date().toISOString(),
                admin_note: note
            });

            if (ins?.error) {
                return Swal.fire('Hata', ins.error.message || 'Görev değiştirilemedi.', 'error');
            }

            await window.a2SmartRefresh();
            return Swal.fire('Görev Değişti', `Yeni görev: ${picked.task_name}`, 'success');
        } catch (e) {
            console.error(e);
            return Swal.fire('Hata', e?.message || 'Görev değiştirilemedi.', 'error');
        } finally {
            setTimeout(() => { window.__arena12SubmitLock = false; }, 400);
        }
    };
}

window.addEventListener('resize', () => {
    clearTimeout(window.__arena121Resize);
    window.__arena121Resize = setTimeout(() => {
        try {
            if (typeof window.renderCompetitionBoard === 'function') window.renderCompetitionBoard();
        } catch (_) {}
    }, 160);
});
// ===== End Arena 2.0 v12.1.0 no-repeat task + performance patch =====


/* Arena 2.0 Info Modal Logic */
window.a2OpenInfoModal = function() {
    Swal.fire({
        title: 'Arena 2.0: Oyun Rehberi',
        icon: 'info',
        width: '560px',
        background: '#0f172a',
        color: '#f8fafc',
        confirmButtonText: 'Anladım, Macera Başlasın!',
        confirmButtonColor: '#2563eb',
        html: `
            <div class="arena-info-modal-content">
                <p style="text-align:left; color:#94a3b8; font-size:0.9rem; margin-bottom:15px;">
                    Arena 2.0, temsilcilik hedeflerinizi eğlenceli bir maceraya dönüştürür. İşte bilmeniz gereken temel özellikler:
                </p>
                <ul class="arena-info-modal-list">
                    <li>
                        <i class="fas fa-map-marked-alt"></i>
                        <div>
                            <b>Macera Haritası</b>
                            <span>Toplam 50 kutudan oluşan bir yolculuk. Her kutu yeni bir başarıyı temsil eder.</span>
                        </div>
                    </li>
                    <li>
                        <i class="fas fa-ghost"></i>
                        <div>
                            <b>Savaş Sisi (Fog of War)</b>
                            <span>Gelecekteki görevler gizlidir. Sadece o kutuya ulaştığınızda detayları keşfedersiniz.</span>
                        </div>
                    </li>
                    <li>
                        <i class="fas fa-dice"></i>
                        <div>
                            <b>Görevi Değiştir (Reroll)</b>
                            <span>Bölümün görevini beğenmediniz mi? Takım Kaptanı 3 defa görevi değiştirme hakkına sahiptir.</span>
                        </div>
                    </li>
                    <li>
                        <i class="fas fa-check-double"></i>
                        <div>
                            <b>Görev Bildirimi</b>
                            <span>Görevi tamamladığınızda "Görevi Bildir" butonuyla admin onayına gönderirsiniz.</span>
                        </div>
                    </li>
                    <li>
                        <i class="fas fa-chart-line"></i>
                        <div>
                            <b>Liderlik Tablosu</b>
                            <span>Sağ panelden diğer takımların kaçıncı kutuda olduğunu canlı olarak takip edebilirsiniz.</span>
                        </div>
                    </li>
                    <li>
                        <i class="fas fa-trophy"></i>
                        <div>
                            <b>Büyük Ödül</b>
                            <span>50. kutuya ilk ulaşan takım büyük ödülün ve efsanevi şanın sahibi olur!</span>
                        </div>
                    </li>
                </ul>
                <div style="background:rgba(37,99,235,0.1); padding:10px; border-radius:10px; border:1px solid rgba(37,99,235,0.2); font-size:0.85rem; color:#93c5fd; text-align:left;">
                    <i class="fas fa-info-circle"></i> <b>Not:</b> Kutu içindeki simgeler (Kule, Kalkan vb.) o kutunun zorluk seviyesini ve ödül ağırlığını temsil eder.
                </div>
            </div>
        `,
        showClass: { popup: 'animate__animated animate__fadeInDown' },
        hideClass: { popup: 'animate__animated animate__fadeOutUp' }
    });
};

/* Arena 2.0 Modern Report Modal (Armored Version) */
window.a2OpenReportModal = async function(boxNo, forceTask) {
    if (window.__arena12SubmitLock) return;
    const st = window.a2CurrentState(currentUser);
    if (!st || st.pendingMove) return Swal.fire('Beklemede', 'Halihazırda onay bekleyen bir bildiriminiz var.', 'info');
    
    const targetBox = boxNo || st.currentBox;
    const task = forceTask || st.currentTask;
    if (!task) return Swal.fire('Hata', 'Aktif kutu için görev bulunamadı.', 'error');

    const inputLabel = forceTask ? `⚡ BONUS: ${task.task_name}` : `${targetBox}. Kutu: ${task.task_name}`;

    const { value: text } = await Swal.fire({
        title: 'Görev Bildirimi',
        input: 'textarea',
        inputLabel: inputLabel,
        inputPlaceholder: 'Görevi nasıl tamamladığınızı kısaca anlatın...',
        inputAttributes: { 'aria-label': 'Görev notu' },
        showCancelButton: true,
        confirmButtonText: 'Bildirimi Gönder',
        cancelButtonText: 'Vazgeç',
        background: '#0f172a',
        color: '#fff',
        confirmButtonColor: '#2563eb'
    });

    if (text === undefined) return; // Cancelled

    window.__arena12SubmitLock = true;
    try {
        const note = `[ARENA2][TYPE:${forceTask ? 'bonus' : 'submission'}][TEAMKEY:${st.teamKey}][BOX:${targetBox}][TASK:${task.id}][STEPS:${task.steps}][DESC:${text.slice(0, 100).replace(/\[|\]/g, '')}]`;
        const ins = await sb.from('competition_moves').insert({
            user_name: currentUser,
            task_id: Number(task.id),
            steps: Number(task.steps || 1),
            admin_note: note,
            status: 'pending'
        });

        if (ins.error) throw ins.error;

        await window.a2SmartRefresh();
        window.a2PlaySound('report');
        Swal.fire('Başarılı', 'Göreviniz admin onayına gönderildi. Onaylandığında ilerlemeniz kaydedilecek.', 'success');
    } catch (e) {
        Swal.fire('Hata', e.message || 'Bildirim gönderilemedi.', 'error');
    } finally {
        setTimeout(() => { window.__arena12SubmitLock = false; }, 500);
    }
};

/* Arena 2.0 Finish Logic (Grand Prize Handle) */
window.handleGrandPrizeClick = function() {
    const st = window.a2CurrentState ? window.a2CurrentState(currentUser) : null;
    if (st && st.isFinished) {
        window.a2TriggerVictoryAnimation();
        Swal.fire({
            title: '🏰 TEBRİKLER! 🏰',
            html: `
                <div style="font-size: 1.2rem; color: #fbbf24; font-weight: bold; margin-bottom: 15px;">
                    KRALLIĞIN YENİ FATİHİ SENSİN!
                </div>
                <div style="color: #fff; font-size: 1rem;">
                    Tüm zorlukları aştın, 50 kutuyu birer birer fethettin ve Büyük Ödül Şatosuna ulaştın! <br><br>
                    🏆 <b>Büyük Ödül Seninle!</b> 🏆
                </div>
            `,
            icon: 'success',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
            color: '#fff',
            confirmButtonText: 'Şatoya Gir 🏰',
            confirmButtonColor: '#fbbf24'
        });
    } else {
        Swal.fire({
            title: '🏰 Büyük Ödül Kalesi',
            text: 'Buraya ulaşmak için tüm kutuları tamamlamalısın! Şan ve şöhret seni bekliyor...',
            icon: 'lock',
            background: '#020617',
            color: '#fff',
            confirmButtonText: 'Devam Et'
        });
    }
};

/* Victory Animation (Internal) */
window.a2TriggerVictoryAnimation = function() {
    if (window.__a2VictoryTriggered) return;
    window.__a2VictoryTriggered = true;

    // Victory Sound
    if (typeof window.a2PlaySound === 'function') window.a2PlaySound('victory');

    Swal.fire({
        title: '🏰 TEBRİKLER! 🏰',
        html: `
            <div style="font-size: 1.2rem; color: #fbbf24; font-weight: bold; margin-bottom: 15px;">
                KRALLIĞIN YENİ FATİHİ SENSİN!
            </div>
            <div style="color: #fff; font-size: 1rem;">
                Tüm zorlukları aştın, 50 kutuyu birer birer fethettin ve Büyük Ödül Şatosuna ulaştın! <br><br>
                🏆 <b>Büyük Ödül Seninle!</b> 🏆
            </div>
        `,
        icon: 'success',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
        color: '#fff',
        confirmButtonText: 'Şatoya Gir 🏰',
        confirmButtonColor: '#fbbf24',
        allowOutsideClick: false
    });

    // Premium Confetti
    const colors = ['#fbbf24', '#f59e0b', '#67e8f9', '#38bdf8', '#f472b6'];
    for (let i = 0; i < 150; i++) {
        const confetti = document.createElement('div');
        const color = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.cssText = `
            position: fixed;
            top: -10px;
            left: ${Math.random() * 100}vw;
            width: ${5 + Math.random() * 8}px;
            height: ${10 + Math.random() * 15}px;
            background: ${color};
            box-shadow: 0 0 10px ${color};
            z-index: 10000;
            pointer-events: none;
            border-radius: 2px;
            animation: confettiFall ${3 + Math.random() * 4}s cubic-bezier(.17,.67,.83,.67) forwards;
            opacity: ${0.7 + Math.random() * 0.3};
        `;
        document.body.appendChild(confetti);
        setTimeout(() => confetti.remove(), 7000);
    }
};

// Add confetti animation style
if (!document.getElementById('a2-confetti-styles')) {
    const s = document.createElement('style');
    s.id = 'a2-confetti-styles';
    s.textContent = `
        @keyframes confettiFall {
            to { transform: translateY(110vh) rotate(360deg); opacity: 0; }
        }
    `;
    document.head.appendChild(s);
}

// Global window mappings for backward compatibility where needed
window.openNewTaskModal = function() { window.a2OpenReportModal(); };

/* Auto-sync Mechanism */
window.__a2AutoSyncTimer = null;
window.a2StartAutoRefresh = function(seconds = 12) {
    if (window.__a2AutoSyncTimer) clearInterval(window.__a2AutoSyncTimer);
    
    let lastKnownProgress = null;

    window.__a2AutoSyncTimer = setInterval(async () => {
        try {
            const stBefore = window.a2CurrentState(currentUser);
            if (!lastKnownProgress) lastKnownProgress = stBefore.currentBox;

            await window.a2SmartRefresh();

            const stAfter = window.a2CurrentState(currentUser);
            if (stAfter.currentBox > lastKnownProgress) {
                window.a2PlaySound('success');
                lastKnownProgress = stAfter.currentBox;
            }
        } catch (e) {}
    }, seconds * 1000);
};
// Start auto-sync on init
setTimeout(() => window.a2StartAutoRefresh(45), 5000);

/* Audio Engine */
window.a2Sounds = {
    report: new Audio('https://www.soundjay.com/buttons/sounds/button-20.mp3'),
    success: new Audio('https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3'),
    reroll: new Audio('https://www.soundjay.com/buttons/sounds/button-29.mp3'),
    victory: new Audio('https://www.soundjay.com/human/sounds/applause-01.mp3')
};

window.a2PlaySound = function(type) {
    if (localStorage.getItem('arena2_muted') === 'true') return;
    const s = window.a2Sounds[type];
    if (s) {
        s.currentTime = 0;
        s.play().catch(() => console.log('Ses çalmak için kullanıcı etkileşimi gerekiyor.'));
    }
};

window.a2ToggleAudio = function() {
    const isMuted = localStorage.getItem('arena2_muted') === 'true';
    localStorage.setItem('arena2_muted', !isMuted);
    window.renderCompetitionBoard();
};

// Global Listener for Grand Prize Save (Admin Panel)
document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'arena12-save-gp') {
        const input = document.getElementById('arena12-gp-text');
        if (!input) return;
        const val = input.value;
        const newName = `[GRANDPRIZE]${val}`;
        try {
            const currentGpRow = (window.competitionConfig || []).find(c => String(c.task_name).startsWith('[GRANDPRIZE]'));
            if (currentGpRow?.id) {
                await sb.from('competition_config').update({ task_name: newName }).eq('id', currentGpRow.id);
            } else {
                await sb.from('competition_config').insert({ task_name: newName, steps: 1, type: 'castle' });
            }
            await syncCompetitionData();
            Swal.fire('Başarılı', 'Büyük ödül metni güncellendi.', 'success');
        } catch (err) {
            Swal.fire('Hata', err.message, 'error');
        }
    }
});

// ===== Arena 2.0 v12.2.0 — Bonus Timer + Takım Yönetimi =====

/* ──────────────────────────────────────────────────────────
   ⚡ BONUS TIMER SİSTEMİ
   ─────────────────────────────────────────────────────────*/
window._arena2ActiveBonusTimers = window._arena2ActiveBonusTimers || {};

window.a2StartBonusTimer = function(bonusId, durationMinutes, bonusName, bonusSteps) {
    const endTime = Date.now() + durationMinutes * 60 * 1000;
    // LocalStorage'a kaydet (sayfa yenilemesine dayanıklı)
    const timerData = { bonusId, endTime, bonusName, bonusSteps };
    localStorage.setItem(`arena2_bonus_${bonusId}`, JSON.stringify(timerData));
    window._arena2ActiveBonusTimers[bonusId] = timerData;
    window.a2RenderBonusTimerBanner(bonusId, timerData);
};

window.a2RenderBonusTimerBanner = function(bonusId, timerData) {
    const bannerId = `arena2-bonus-banner-${bonusId}`;
    let banner = document.getElementById(bannerId);
    const container = document.querySelector('.q-competition-container') || document.body;

    if (!banner) {
        banner = document.createElement('div');
        banner.id = bannerId;
        banner.style.cssText = `
            position:fixed; bottom:22px; left:50%; transform:translateX(-50%);
            z-index:9999; background:linear-gradient(135deg,#7c3aed,#4338ca);
            border:2px solid rgba(255,255,255,.22); border-radius:20px;
            padding:14px 26px; color:#fff; font-family:'Outfit',sans-serif;
            box-shadow:0 20px 50px rgba(0,0,0,.5), 0 0 40px rgba(124,58,237,.4);
            display:flex; align-items:center; gap:18px; min-width:320px;
            animation:bonusBannerIn .35s cubic-bezier(.34,1.56,.64,1) both;
        `;
        container.appendChild(banner);

        // Animasyon CSS
        if (!document.getElementById('a2-bonus-banner-styles')) {
            const s = document.createElement('style');
            s.id = 'a2-bonus-banner-styles';
            s.textContent = `
                @keyframes bonusBannerIn {
                    from { transform:translateX(-50%) translateY(80px); opacity:0; }
                    to   { transform:translateX(-50%) translateY(0);    opacity:1; }
                }
                @keyframes bonusBannerOut {
                    from { transform:translateX(-50%) translateY(0);    opacity:1; }
                    to   { transform:translateX(-50%) translateY(80px); opacity:0; }
                }
                .arena2-bonus-countdown { font-size:1.6rem; font-weight:900; letter-spacing:-.02em; }
                .arena2-bonus-label { font-size:.82rem; opacity:.85; }
            `;
            document.head.appendChild(s);
        }
    }

    const remaining = timerData.endTime - Date.now();
    if (remaining <= 0) {
        window.a2EndBonusTimer(bonusId);
        return;
    }

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const timeStr = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

    banner.innerHTML = `
        <div style="font-size:2rem;">⚡</div>
        <div style="flex:1;">
            <div style="font-weight:900; font-size:1rem;">${safeEsc(timerData.bonusName)}</div>
            <div class="arena2-bonus-label">Tamamlayanlar <b>${timerData.bonusSteps} adım</b> ilerler!</div>
        </div>
        <div>
            <div class="arena2-bonus-countdown">${timeStr}</div>
            <div class="arena2-bonus-label" style="text-align:center;">kaldı</div>
        </div>
        <button onclick="window.a2EndBonusTimer(${bonusId})" style="background:rgba(255,255,255,.12);border:none;color:#fff;cursor:pointer;border-radius:10px;width:28px;height:28px;font-size:1rem;display:grid;place-items:center;" title="Bonusu Sonlandır">✕</button>
    `;

    // 1 saniyede bir güncelle
    clearTimeout(window[`_a2BonusTick_${bonusId}`]);
    window[`_a2BonusTick_${bonusId}`] = setTimeout(() => {
        window.a2RenderBonusTimerBanner(bonusId, timerData);
    }, 1000);
};

window.a2EndBonusTimer = function(bonusId) {
    clearTimeout(window[`_a2BonusTick_${bonusId}`]);
    localStorage.removeItem(`arena2_bonus_${bonusId}`);
    delete window._arena2ActiveBonusTimers[bonusId];
    const banner = document.getElementById(`arena2-bonus-banner-${bonusId}`);
    if (banner) {
        banner.style.animation = 'bonusBannerOut .35s ease forwards';
        setTimeout(() => banner.remove(), 400);
    }
};

// Sayfa yüklendiğinde aktif bonusları geri yükle
(function a2RestoreActiveTimers() {
    try {
        Object.keys(localStorage)
            .filter(k => k.startsWith('arena2_bonus_'))
            .forEach(k => {
                const data = JSON.parse(localStorage.getItem(k));
                if (!data || Date.now() >= data.endTime) {
                    localStorage.removeItem(k);
                    return;
                }
                window._arena2ActiveBonusTimers[data.bonusId] = data;
                setTimeout(() => window.a2RenderBonusTimerBanner(data.bonusId, data), 800);
            });
    } catch (_) {}
})();

/* ──────────────────────────────────────────────────────────
   👥 TAKIM YÖNETİM SİSTEMİ (Admin + Sol Panel)
   ─────────────────────────────────────────────────────────*/

// Sol panelde Takım Listesi + Admin Takım Yönetimi
window.a2RenderTeamPanel = function() {
    const host = document.querySelector('.q-comp-square-actions');
    if (!host) return;

    let teamPanel = document.getElementById('arena2-team-panel');
    if (!teamPanel) {
        teamPanel = document.createElement('div');
        teamPanel.id = 'arena2-team-panel';
        teamPanel.style.cssText = 'margin-top:12px; padding:12px; border-radius:16px; background:rgba(15,23,42,.82); border:1px solid rgba(56,189,248,.2); color:#fff;';
        host.appendChild(teamPanel);
    }

    const isActuallyAdmin = (typeof isAdminMode !== 'undefined' && isAdminMode) || (typeof isLocAdmin !== 'undefined' && isLocAdmin);
    const activeTeams = (userTeams || []).filter(t => t && t.status === 'active');
    const teamCountText = `${activeTeams.length} takım`;

    let teamsHtml = '';
    if (activeTeams.length === 0) {
        teamsHtml = '<div style="font-size:.78rem; color:#64748b; text-align:center; padding:8px 0;">Henüz takım kurulmadı</div>';
    } else {
        teamsHtml = activeTeams.map((team, idx) => {
            const teamKey = team.id ? `team:${team.id}` : `team:${team.user_a}:${team.user_b}`;
            const progress = Math.min(a2ApprovedBoxCount(teamKey), A2_TOTAL_BOXES);
            const label = team.team_name || `${team.user_a} & ${team.user_b}`;
            const isMyTeam = (team.user_a === currentUser || team.user_b === currentUser);
            const adminBtns = isActuallyAdmin ? `
                <div style="display:flex; gap:4px; margin-top:5px;">
                    <button onclick="window.a2AdminChangeCaptain('${team.id}')" style="flex:1; padding:3px 0; font-size:.60rem; background:#475569; color:#fff; border:none; border-radius:8px; cursor:pointer;" title="Kaptan Değiştir"><i class="fas fa-crown"></i> Kaptan</button>
                    <button onclick="window.a2AdminDeleteTeam('${team.id}')" style="flex:1; padding:3px 0; font-size:.60rem; background:#7f1d1d; color:#fff; border:none; border-radius:8px; cursor:pointer;" title="Takımı Dağıt"><i class="fas fa-times"></i> Dağıt</button>
                </div>` : '';
            return `
                <div style="padding:8px; border-radius:12px; background:${isMyTeam ? 'rgba(56,189,248,.10)' : 'rgba(255,255,255,.04)'}; border:1px solid ${isMyTeam ? 'rgba(56,189,248,.28)' : 'rgba(255,255,255,.06)'}; margin-bottom:6px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                        <div style="font-weight:800; font-size:.78rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${safeEsc(label)}">${safeEsc(label)} ${isMyTeam ? '<span style="color:#22d3ee; font-size:.65rem;">●</span>' : ''}</div>
                        <div style="font-size:.68rem; color:#93c5fd; white-space:nowrap;">${progress}/${A2_TOTAL_BOXES}</div>
                    </div>
                    <div style="font-size:.65rem; color:#64748b; margin-top:2px;">👑 ${safeEsc(team.user_a)} &nbsp;·&nbsp; 🤝 ${safeEsc(team.user_b || '—')}</div>
                    ${adminBtns}
                </div>
            `;
        }).join('');
    }

    const adminCreateBtn = isActuallyAdmin ? `
        <button onclick="window.a2AdminCreateTeam()" style="width:100%; padding:8px; margin-top:6px; background:linear-gradient(135deg,#0ea5e9,#2563eb); color:#fff; border:none; border-radius:12px; font-weight:800; font-size:.78rem; cursor:pointer;">
            <i class="fas fa-user-plus"></i> Takım Kur (Admin)
        </button>` : '';

    teamPanel.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div style="font-weight:800; font-size:.85rem;"><i class="fas fa-users"></i> Takımlar</div>
            <div style="font-size:.65rem; color:#64748b; background:rgba(255,255,255,.06); padding:2px 8px; border-radius:999px;">${teamCountText}</div>
        </div>
        <div style="max-height:200px; overflow-y:auto;">${teamsHtml}</div>
        ${adminCreateBtn}
    `;
};

// Admin: Takım Kur
window.a2AdminCreateTeam = async function() {
    // Sadece telesatış temsilcilerini getir
    const { data: profiles, error: pErr } = await sb.from('profiles')
        .select('username')
        .or('group_name.ilike.telesatis,group_name.ilike.telesatış');
    
    if (pErr) console.warn('Profiller çekilemedi:', pErr);
    
    const userList = (profiles || []).map(p => p.username).sort();
    if (userList.length === 0) {
        // Fallback: Eski mantık (eğer profil tablosuna ulaşılamazsa)
        const users = new Set([currentUser]);
        (competitionMoves || []).forEach(m => { if (m && m.user_name) users.add(m.user_name); });
        (userTeams || []).forEach(t => { if (t) { if (t.user_a) users.add(t.user_a); if (t.user_b) users.add(t.user_b); } });
        userList.push(...[...users].sort());
    }

    const opts = userList.map(u => `<option value="${safeEsc(u)}">${safeEsc(u)}</option>`).join('');

    const result = await Swal.fire({
        title: '👥 Takım Kur',
        html: `
            <div style="text-align:left;">
                <div style="margin-bottom:10px;">
                    <label style="display:block; margin-bottom:6px; font-size:.85rem; color:#cbd5e1;">Takım Adı</label>
                    <input id="a2ct-name" placeholder="Örn: Şimşekler" style="width:100%; padding:10px; border-radius:10px; background:#0f172a; color:#fff; border:1px solid #334155;" />
                </div>
                <div style="margin-bottom:10px;">
                    <label style="display:block; margin-bottom:6px; font-size:.85rem; color:#cbd5e1;">👑 Kaptan (user_a)</label>
                    <select id="a2ct-usera" style="width:100%; padding:10px; border-radius:10px; background:#0f172a; color:#fff; border:1px solid #334155;"><option value="">Seçin</option>${opts}</select>
                </div>
                <div>
                    <label style="display:block; margin-bottom:6px; font-size:.85rem; color:#cbd5e1;">🤝 İkinci Oyuncu (user_b)</label>
                    <select id="a2ct-userb" style="width:100%; padding:10px; border-radius:10px; background:#0f172a; color:#fff; border:1px solid #334155;"><option value="">Seçin (opsiyonel)</option>${opts}</select>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Takımı Kur',
        cancelButtonText: 'İptal',
        confirmButtonColor: '#2563eb',
        background: '#020617',
        color: '#fff',
        preConfirm: () => ({
            name: document.getElementById('a2ct-name')?.value?.trim() || '',
            user_a: document.getElementById('a2ct-usera')?.value || '',
            user_b: document.getElementById('a2ct-userb')?.value || ''
        }),
        inputValidator: () => {
            const ua = document.getElementById('a2ct-usera')?.value;
            const ub = document.getElementById('a2ct-userb')?.value;
            if (!ua) return 'Kaptan seçin!';
            if (ua === ub) return 'Kaptan ve ikinci oyuncu aynı olamaz!';
        }
    });

    if (!result.isConfirmed) return;
    const v = result.value;
    if (!v.user_a) return Swal.fire('Hata', 'Kaptan seçin!', 'error');

    const ins = await sb.from('competition_teams').insert({
        team_name: v.name || `${v.user_a} & ${v.user_b}`,
        user_a: v.user_a,
        user_b: v.user_b || null,
        status: 'active'
    });

    if (ins && ins.error) return Swal.fire('Hata', ins.error.message, 'error');

    await syncCompetitionData();
    window.a2RenderTeamPanel();
    if (typeof renderCompetitionBoard === 'function') renderCompetitionBoard();
    return Swal.fire('✅ Takım Kuruldu!', `${v.name || `${v.user_a} & ${v.user_b}`} takımı oluşturuldu.`, 'success');
};

// Admin: Kaptan Değiştir
window.a2AdminChangeCaptain = async function(teamId) {
    if (!sb) return;
    await syncCompetitionData();
    const team = (userTeams || []).find(t => String(t.id) === String(teamId));
    if (!team) return Swal.fire('Hata', 'Takım bulunamadı.', 'error');

    const result = await Swal.fire({
        title: '👑 Kaptan Değiştir',
        html: `
            <div style="text-align:left; color:#cbd5e1; font-size:.9rem;">
                <div style="margin-bottom:10px;">Takım: <b>${safeEsc(team.team_name || `${team.user_a} & ${team.user_b}`)}</b></div>
                <div style="margin-bottom:6px;">Şu anki Kaptan: <b style="color:#fbbf24;">${safeEsc(team.user_a)}</b></div>
                <div>Yeni Kaptan: <b style="color:#67e8f9;">${safeEsc(team.user_b || 'Tek üye')}</b></div>
                <div style="margin-top:10px; font-size:.8rem; color:#94a3b8;">Kaptan ve üye rolleri yer değiştirecek.</div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '👑 Kaptanı Değiştir',
        cancelButtonText: 'İptal',
        confirmButtonColor: '#d97706',
        background: '#020617',
        color: '#fff'
    });

    if (!result.isConfirmed) return;
    if (!team.user_b) return Swal.fire('Bilgi', 'Tek üyeli takımda kaptan değiştirilemez.', 'info');

    const { error } = await sb.from('competition_teams').update({
        user_a: team.user_b,
        user_b: team.user_a
    }).eq('id', teamId);

    if (error) return Swal.fire('Hata', error.message, 'error');

    await syncCompetitionData();
    if (typeof window.a2RenderTeamPanel === 'function') window.a2RenderTeamPanel();
    if (typeof renderCompetitionBoard === 'function') renderCompetitionBoard();
    return Swal.fire('✅ Kaptan Değişti!', `Yeni kaptan: ${team.user_b}`, 'success');
};

// Admin: Takımı Dağıt
window.a2AdminDeleteTeam = async function(teamId) {
    const team = (userTeams || []).find(t => String(t.id) === String(teamId));
    if (!team) return;

    const { isConfirmed } = await Swal.fire({
        title: 'Takımı Dağıt?',
        text: `"${team.team_name || `${team.user_a} & ${team.user_b}`}" takımı silinecek.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Evet, Dağıt',
        cancelButtonText: 'Vazgeç',
        confirmButtonColor: '#ef4444',
        background: '#020617',
        color: '#fff'
    });

    if (!isConfirmed) return;

    const del = await sb.from('competition_teams').delete().eq('id', teamId);
    if (del && del.error) return Swal.fire('Hata', del.error.message, 'error');

    await syncCompetitionData();
    window.a2RenderTeamPanel();
    if (typeof renderCompetitionBoard === 'function') renderCompetitionBoard();
    return Swal.fire('Dağıtıldı', 'Takım silindi.', 'success');
};

// renderCompetitionBoard ve EnsureActionPanel'e team panel hook'u ekle
if (window.a2EnsureActionPanel) {
    const __origA2EnsureActionPanel = window.a2EnsureActionPanel;
    window.a2EnsureActionPanel = function() {
        __origA2EnsureActionPanel();
        try { window.a2RenderTeamPanel(); } catch (_) {}
    };
} else {
    // Fallback: doğrudan override
    const __origEnsure = typeof a2EnsureActionPanel === 'function' ? a2EnsureActionPanel : null;
    window.a2EnsureActionPanel = function() {
        if (__origEnsure) __origEnsure();
        try { window.a2RenderTeamPanel(); } catch (_) {}
    };
}

// CSS: Takım Paneli Kaydırma
if (!document.getElementById('a2-team-panel-styles')) {
    const s = document.createElement('style');
    s.id = 'a2-team-panel-styles';
    s.textContent = `
        #arena2-team-panel::-webkit-scrollbar { width: 4px; }
        #arena2-team-panel::-webkit-scrollbar-track { background: rgba(255,255,255,.04); }
        #arena2-team-panel::-webkit-scrollbar-thumb { background: rgba(56,189,248,.3); border-radius: 999px; }
        #arena2-team-panel > div > div::-webkit-scrollbar { width: 4px; }
        #arena2-team-panel > div > div::-webkit-scrollbar-track { background: rgba(255,255,255,.04); }
        #arena2-team-panel > div > div::-webkit-scrollbar-thumb { background: rgba(56,189,248,.3); border-radius: 999px; }
    `;
    document.head.appendChild(s);
}

// renderTelesalesCompetition override — takım panelini de başlat
const __origRenderTelesales122 = window.renderTelesalesCompetition;
window.renderTelesalesCompetition = async function() {
    if (__origRenderTelesales122) await __origRenderTelesales122();
    try { window.a2RenderTeamPanel(); } catch (_) {}
};

// ===== End Arena 2.0 v12.2.0 =====

})();

/* ===== ChatGPT Arena hotfix patch ===== */
(function(){
    function safeText(v){ return String(v == null ? '' : v); }
    function inferTaskType(task){
        const explicit = safeText(task && (task._compatType || task.type)).trim().toLowerCase();
        if (explicit) return explicit;
        const name = safeText(task && task.task_name).toLowerCase();
        const tagMatch = name.match(/\[(?:type|special):([^\]]+)\]/i);
        if (tagMatch && tagMatch[1]) return safeText(tagMatch[1]).trim().toLowerCase();
        if (name.includes('[grandprize]')) return 'castle';
        if (name.includes('bonus adım') || name.includes('bonus adim')) return 'bonus';
        if (name.includes('sürpriz') || name.includes('surpriz')) return 'surprise';
        if (name.includes('hediye')) return 'reward';
        if (name.includes('ceza')) return 'penalty';
        if (name.includes('quiz')) return 'quiz';
        return 'normal';
    }
    function cleanTaskName(taskName){
        return safeText(taskName)
            .replace(/\[(?:type|special|bonus_duration):[^\]]+\]/ig, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }
    function makeTaskName(name, type, duration){
        const tags = [`[SPECIAL:${type}]`];
        if (Number(duration) > 0) tags.push(`[BONUS_DURATION:${Number(duration)}]`);
        return `${tags.join(' ')} ${safeText(name).trim()}`.trim();
    }
    function normalizeTask(row){
        const copy = Object.assign({}, row || {});
        copy._compatType = inferTaskType(copy);
        copy._displayName = cleanTaskName(copy.task_name);
        return copy;
    }

    const oldSyncCompetitionData = window.syncCompetitionData || syncCompetitionData;
    const normalizeCompetitionConfig = () => {
        if (Array.isArray(window.competitionConfig)) {
            window.competitionConfig = window.competitionConfig.map(normalizeTask);
            if (typeof competitionConfig !== 'undefined') competitionConfig = window.competitionConfig;
        } else if (Array.isArray(competitionConfig)) {
            competitionConfig = competitionConfig.map(normalizeTask);
            window.competitionConfig = competitionConfig;
        }
    };

    window.syncCompetitionData = async function(){
        let result;
        if (typeof oldSyncCompetitionData === 'function') {
            result = await oldSyncCompetitionData.apply(this, arguments);
        }
        if (Array.isArray(competitionConfig)) window.competitionConfig = competitionConfig;
        if (Array.isArray(userTeams)) window.userTeams = userTeams;
        if (Array.isArray(competitionMoves)) window.competitionMoves = competitionMoves;
        normalizeCompetitionConfig();
        return result;
    };
    try { syncCompetitionData = window.syncCompetitionData; } catch(_) {}

    window.a2TaskType = function(task){ return inferTaskType(task); };
    window.a2TaskTypeLabel = function(task){
        const type = inferTaskType(task);
        return ({ normal:'Normal Görev', reward:'Hediye', surprise:'Sürpriz Soru', penalty:'Ceza', bonus:'Bonus Adım', bonus_step:'Bonus Adım', empty:'Boş', castle:'Büyük Ödül', quiz:'Soru' })[type] || 'Görev';
    };
    window.a2TaskBadge = function(task){
        const type = inferTaskType(task);
        if (type === 'reward') return '🎁';
        if (type === 'surprise') return '❓';
        if (type === 'penalty') return '⚠️';
        if (type === 'bonus' || type === 'bonus_step') return '⚡';
        if (type === 'castle') return '🏰';
        return '';
    };
    window.a2AllTasks = function(){
        return (Array.isArray(competitionConfig) ? competitionConfig : []).filter(t => t && t.is_active !== false).map(normalizeTask);
    };
    window.a2TaskById = function(taskId){
        return window.a2AllTasks().find(t => String(t.id) === String(taskId)) || null;
    };
    window.a2RegularTasks = function(){
        return window.a2AllTasks().filter(t => !['quiz','castle','empty'].includes(inferTaskType(t)));
    };


    window.a2PlaySound = function(type) {
        if (localStorage.getItem('arena2_muted') === 'true') return;
        try {
            if (!window.__arenaAudioCtx) {
                window.__arenaAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = window.__arenaAudioCtx;
            if (ctx.state === 'suspended') ctx.resume().catch(()=>{});
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            const now = ctx.currentTime;
            const presets = {
                report:  [740, 920, .16],
                success: [880, 1320, .24],
                reroll:  [420, 680, .18],
                victory: [660, 990, .32],
                up:      [900, 1300, .20],
                down:    [220, 140, .22]
            };
            const p = presets[type] || presets.success;
            osc.type = type === 'down' ? 'sawtooth' : 'sine';
            osc.frequency.setValueAtTime(p[0], now);
            osc.frequency.linearRampToValueAtTime(p[1], now + p[2]);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + p[2]);
            osc.start(now); osc.stop(now + p[2] + 0.02);
        } catch (e) {
            console.warn('[Arena] Ses çalınamadı', e);
        }
    };
    window.a2ToggleAudio = function() {
        const isMuted = localStorage.getItem('arena2_muted') === 'true';
        localStorage.setItem('arena2_muted', isMuted ? 'false' : 'true');
        if (!isMuted) {
            Swal.fire({toast:true, position:'top-end', timer:1200, showConfirmButton:false, icon:'info', title:'Arena sesi kapatıldı'});
        } else {
            window.a2PlaySound('success');
            Swal.fire({toast:true, position:'top-end', timer:1200, showConfirmButton:false, icon:'success', title:'Arena sesi açıldı'});
        }
        if (typeof renderCompetitionBoard === 'function') renderCompetitionBoard();
    };
    ['click','touchstart','keydown'].forEach(evt => {
        document.addEventListener(evt, function unlockArenaAudioOnce(){
            if (window.__arenaAudioUnlocked) return;
            window.__arenaAudioUnlocked = true;
            try {
                if (!window.__arenaAudioCtx) {
                    window.__arenaAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                window.__arenaAudioCtx.resume().catch(()=>{});
            } catch(_) {}
        }, { passive:true, once:true });
    });

    window.initArenaRealtime = function() {
        if (!sb || window.__arenaRealtimeChannel) return;
        const refresh = async () => {
            clearTimeout(window.__arenaRealtimeDebounce);
            window.__arenaRealtimeDebounce = setTimeout(async () => {
                await window.syncCompetitionData();
                if (typeof renderCompetitionBoard === 'function') renderCompetitionBoard();
                if (typeof renderCompetitionLeaderboard === 'function') renderCompetitionLeaderboard();
                if (typeof window.a2RenderTeamPanel === 'function') window.a2RenderTeamPanel();
                if (typeof window.a2EnsureActionPanel === 'function') window.a2EnsureActionPanel();
            }, 250);
        };
        window.__arenaRealtimeChannel = sb.channel('arena-live-sync')
            .on('postgres_changes', { event:'*', schema:'public', table:'competition_moves' }, refresh)
            .on('postgres_changes', { event:'*', schema:'public', table:'competition_teams' }, refresh)
            .on('postgres_changes', { event:'*', schema:'public', table:'competition_config' }, refresh)
            .on('postgres_changes', { event:'*', schema:'public', table:'competition_settings' }, refresh)
            .subscribe();
    };
    try { initArenaRealtime = window.initArenaRealtime; } catch(_) {}

    window.openTeamPicker = async function() {
        const activeUser = safeText(typeof currentUser !== 'undefined' ? currentUser : (localStorage.getItem('sSportUser') || '')).trim();
        if (!activeUser) return Swal.fire('Hata', 'Aktif kullanıcı bulunamadı.', 'error');

        await window.syncCompetitionData();
        const existingTeam = (Array.isArray(userTeams) ? userTeams : []).find(t => t && t.status === 'active' && (t.user_a === activeUser || t.user_b === activeUser));
        if (existingTeam) {
            return Swal.fire('Bilgi', 'Bu kullanıcı zaten aktif bir takımda. Önce takımı dağıtın veya kaptanı değiştirin.', 'info');
        }

        Swal.fire({ title: 'Yükleniyor...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
        const { data: allProfiles, error: pErr } = await sb.from('profiles').select('username, group_name');
        if (pErr) {
            Swal.fire('Sistem Hatası', 'Profiller çekilemedi: ' + pErr.message, 'error');
            return;
        }
        const busyUsers = new Set((Array.isArray(userTeams) ? userTeams : []).filter(t => t && t.status === 'active').flatMap(t => [t.user_a, t.user_b]).filter(Boolean));
        const telesalesUsers = (allProfiles || []).filter(u => {
            const gn = safeText(u && u.group_name).toLowerCase().trim();
            const un = safeText(u && u.username).trim();
            return gn === 'telesatis' && un && un.toLowerCase() !== activeUser.toLowerCase() && !busyUsers.has(un);
        }).map(u => u.username).sort();
        Swal.close();
        if (!telesalesUsers.length) return Swal.fire('Bilgi', 'Uygun takım arkadaşı bulunamadı.', 'info');

        const result = await Swal.fire({
            title: 'Takım İstek Gönder',
            html: `
                <div style="padding:10px; text-align:left;">
                    <p style="color:#94a3b8; font-size:0.9rem;">Bir Telesatış MT seç ve puanlarınızı birleştirin.</p>
                    <select id="buddy-select" class="minimal-select" style="width:100%; margin-top:10px; background:#1e293b; color:#fff; border:1px solid #334155; padding:10px; border-radius:8px;">
                        <option value="">Buddy Seçiniz...</option>
                        ${telesalesUsers.map(u => `<option value="${safeText(u).replace(/"/g,'&quot;')}">${safeText(u)}</option>`).join('')}
                    </select>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'İstek Gönder',
            confirmButtonColor: '#10b981',
            cancelButtonText: 'Vazgeç',
            background: '#0f172a',
            color: '#fff',
            preConfirm: () => {
                const buddy = document.getElementById('buddy-select')?.value;
                if (!buddy) { Swal.showValidationMessage('Lütfen bir buddy seçin!'); return false; }
                return { buddy };
            }
        });
        if (!result.isConfirmed) return;

        await sb.from('competition_teams').delete().eq('user_a', activeUser);
        await sb.from('competition_teams').delete().eq('user_b', activeUser);
        const ins = await sb.from('competition_teams').insert({ user_a: activeUser, user_b: result.value.buddy, status:'pending' });
        if (ins?.error) return Swal.fire('Hata', ins.error.message || 'Takım isteği gönderilemedi.', 'error');
        return Swal.fire('İstek Gönderildi', 'Arkadaşının onaylaması bekleniyor!', 'success');
    };

    // ----- ⚡ FLOATING BONUS WIDGET LOGIC ⚡ -----
    window.a2UpdateFloatingBonusUI = function() {
        const stage = document.querySelector('.q-comp-board-wrapper');
        if (!stage) return;

        let widget = document.getElementById('a2-floating-bonus');
        const tasks = (window.competitionConfig || []);
        // En yeni eklenen bonusun (En büyük ID) her zaman öncelikli olması için ters sırala
        const bonusTask = [...tasks]
            .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
            .find(t => {
                const type = window.a2TaskType(t);
                return (type === 'bonus' || type === 'special') && t.is_active;
            });

        if (!bonusTask) {
            if (widget) widget.remove();
            return;
        }

        const st = window.a2CurrentState(currentUser);
        const completedIds = window.a2CompletedTaskIds(st?.teamKey);
        const isAlreadyDone = completedIds.has(Number(bonusTask.id));

        if (!widget) {
            widget = document.createElement('div');
            widget.id = 'a2-floating-bonus';
            widget.className = 'a2-floating-bonus';
            stage.appendChild(widget);
        }

        // Zaman Hesaplama (Created At + Duration)
        const bonusDur = Number(window.a2TagVal(bonusTask.task_name, 'BONUS_DURATION') || 0);
        const createdAt = new Date(bonusTask.created_at || Date.now()).getTime();
        const endTime = createdAt + (bonusDur * 60000);
        const rem = Math.max(0, Math.floor((endTime - Date.now()) / 1000));

        const isExpired = bonusDur > 0 && rem <= 0;
        
        // CSS State
        let stateClass = '';
        if (isAlreadyDone) stateClass = 'is-submitted';
        else if (isExpired) stateClass = 'is-expired';
        
        widget.className = `a2-floating-bonus ${stateClass}`;
        
        const m = Math.floor(rem / 60);
        const s = (rem % 60).toString().padStart(2, '0');
        
        let timerText = "";
        if (isAlreadyDone) timerText = '✅ TAMAMLANDI';
        else if (bonusDur > 0) timerText = (rem > 0 ? `⚡ KALAN SÜRE: ${m}:${s}` : '⌛ SÜRE DOLDU');
        else timerText = '✨ AKTİF BONUS';

        // İçerik: İsim + Zaman + Toplam Süre
        const cleanName = (bonusTask._displayName || bonusTask.task_name || 'Bonus').split('[')[0].trim();
        const durationInfo = bonusDur > 0 ? `<div style="font-size:0.6rem; opacity:0.8; margin-top:-2px;">Toplam Süre: ${bonusDur} dk</div>` : '';

        widget.innerHTML = `
            <div class="bonus-header">🎁 ÖZEL BONUS ETKİNLİĞİ</div>
            <div class="bonus-body">${cleanName}</div>
            ${durationInfo}
            <div class="bonus-timer">${timerText}</div>
        `;

        widget.onclick = () => {
            if (isAlreadyDone) return Swal.fire('Tebrikler', 'Bu bonusu zaten tamamlayıp bildirdiniz!', 'success');
            if (isExpired) return Swal.fire('Süre Doldu', 'Bu bonus adımın süresi maalesef bitti.', 'warning');
            window.a2HandleBonusSubmission(bonusTask);
        };

        // Otomatik Saniyeli Güncelleme (Eğer kurulmadıysa)
        if (!window.__a2BonusTick && !isExpired && bonusDur > 0) {
            window.__a2BonusTick = setInterval(() => window.a2UpdateFloatingBonusUI(), 1000);
        } else if (isExpired && window.__a2BonusTick) {
            clearInterval(window.__a2BonusTick);
            window.__a2BonusTick = null;
        }
    };

    window.a2HandleBonusSubmission = function(task) {
        if (typeof currentUser === 'undefined') return;
        const st = window.a2CurrentState(currentUser);
        if (!st.teamKey) return Swal.fire('Hata', 'Önce bir takım kurmalı veya bir takıma katılmalısın.', 'error');
        
        // Doğrudan rapor modalını bonus göreviyle aç
        window.a2OpenReportModal(null, task);
    };

    setTimeout(() => {
        if (typeof window.initArenaRealtime === 'function') window.initArenaRealtime();
        if (typeof window.syncCompetitionData === 'function') window.syncCompetitionData();
    }, 1200);
})();

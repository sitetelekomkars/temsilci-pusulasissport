// --- COMPETITION (YARIŞMA) LOGIC ---
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
          // Sadece ekranı açıksa güncellesin
          const tScreen = document.getElementById('telesales-fullscreen');
          const isArena = tScreen && tScreen.style.display !== 'none';
          if (isArena) {
              clearTimeout(window._arenaRtTimer);
              window._arenaRtTimer = setTimeout(async () => {
                  await syncCompetitionData();
                  if (typeof renderCompetitionBoard === 'function') renderCompetitionBoard();
                  if (typeof renderCompetitionLeaderboard === 'function') renderCompetitionLeaderboard();
                  if (typeof renderMyRecentTasks === 'function') renderMyRecentTasks();
              }, 500); 
          }
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
                const today = new Date().toISOString().split('T')[0];
                const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
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
        const { data: configs, error: e1 } = await sb.from('competition_config').select('*');
        if (!e1 && configs) competitionConfig = configs;

        const { data: moves, error: e2 } = await sb.from('competition_moves').select('*').order('created_at', { ascending: false });
        if (!e2 && moves) competitionMoves = moves;

        const { data: teams, error: e3 } = await sb.from('competition_teams').select('*');
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

    const myMoves = competitionMoves.filter(m => m.user_name === currentUser).slice(0, 6);

    if (myMoves.length === 0) {
        history.innerHTML = `<div style="padding:10px; color:#94a3b8; font-size:0.8rem;">Kayıt yok.</div>`;
        return;
    }

    history.innerHTML = myMoves.map(m => {
        const config = competitionConfig.find(c => String(c.id) === String(m.task_id));
        const taskName = config ? config.task_name : 'Görev';
        return `
            <div class="q-history-item">
                <div style="color:#fff; font-weight:700; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(taskName)}</div>
                ${m.admin_note && !m.admin_note.includes('[QuizID') ? `<div style="font-size:0.7rem; color:#fabb00; margin-top:2px; line-height:1.2;"><i>"${escapeHtml(m.admin_note.replace('[CEZA]', '').trim())}"</i></div>` : ''}
                <div style="display:flex; justify-content:space-between; margin-top:4px; font-size:0.7rem;">
                    <span style="color:#00f2ff; font-weight:bold;">${m.steps > 0 ? '+' : ''}${m.steps} Adım</span>
                    <span class="status-${m.status}" style="font-weight:bold; letter-spacing:0.5px;">${m.status === 'approved' ? 'ONAY' : (m.status === 'rejected' ? 'RED' : 'BEK')}</span>
                </div>
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
        const { error: updErr } = await sb.from('competition_moves').update({ 
            status: status,
            admin_note: reasonText ? reasonText : null,
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

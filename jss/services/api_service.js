
/**
 * Pusula - Merkezi Veri Katmanı (v12.2.1-Armored)
 * Tüm Supabase (DB) çağrılarını ve Egress optimizasyonunu yönetir.
 */

// --- SUPABASE INITIALIZATION (Global Lock) ---
const SUPABASE_URL = "https://psauvjohywldldgppmxz.supabase.co";
const SUPABASE_KEY = "sb_publishable_ITFx76ndmOc3UJkNbHOSlQ_kD91kq45";
window.sb = (window.supabase && typeof window.supabase.createClient === 'function')
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

if (!window.sb) {
    console.error("[PusulaDB] Supabase Client could not be initialized. Script ordering issue?");
}

window.PusulaDB = {
    // --- CONTENT (Main App) ---
    content: {
        async loadMainData() {
            // Optimized Projection to save Egress (Extended for all modules)
            const cols = 'id,Type,Category,Title,Text,Script,Code,Link,Image,Date,Status,IsMandatory,TargetGroups,PopupTimer,Icon,Tip,Detail,Pronunciation,QuizOptions,QuizAnswer';
            return await window.sb.from('Data').select(cols);
        },
        async loadWizard() {
            return await window.sb.from('WizardSteps').select('*');
        },
        async loadTechWizard() {
            return await window.sb.from('TechWizardSteps').select('*');
        },
        async upsertContent(obj) {
            // obj should have { id, Type, Title, Text, ... }
            return await window.sb.from('Data').upsert(obj);
        },
        async deleteContent(id) {
            return await window.sb.from('Data').delete().eq('id', id);
        }
    },

    // --- ARENA SUPPORT CALLS ---
    arena: {
        async fetchInitial() {
            // Veri Diyeti: Sadece gerekli kolonlar (Projection)
            const moveCols = 'id,user_name,task_id,steps,status,approved_at,admin_note,created_at';
            const teamCols = '*';
            const configCols = '*';

            const [config, moves, teams, settings] = await Promise.all([
                window.sb.from('competition_config').select(configCols),
                window.sb.from('competition_moves').select(moveCols).order('created_at', { ascending: false }),
                window.sb.from('competition_teams').select(teamCols),
                window.sb.from('competition_settings').select('key,value')
            ]);
            return { config, moves, teams, settings };
        }
    },

    // --- QUALITY MANAGEMENT ---
    quality: {
        async logEvaluation(body) {
            return await window.sb.from('Evaluations').insert(body);
        },
        async deleteEvaluation(id) {
            return await window.sb.from('Evaluations').delete().eq('id', id);
        },
        async fetchSingleEvaluation(id) {
            // Lazy Loading: Detayları ve Feedback'i sadece tekil sorguda getir
            return await window.sb.from('Evaluations').select('*').eq('id', id).single();
        },
        async fetchEvaluations(params = {}) {
            // Veri Diyeti: Sütun setlerini ayrıştır
            const LIST_COLS = 'id,AgentName,Evaluator,CallDate,CallID,Score,Group,Date,Okundu,Durum,FeedbackType';
            const DASH_COLS = 'Score,CallDate,Date,AgentName,Group,Details';
            const FEEDBACK_COLS = 'id,AgentName,Evaluator,CallDate,CallID,Score,Group,Date,Okundu,Durum,FeedbackType,Feedback,Details';
            
            // Seçeneklere göre kolon setini belirle
            let cols = params.mini ? DASH_COLS : (params.feedbackSection ? FEEDBACK_COLS : LIST_COLS);
            let query = window.sb.from('Evaluations').select(cols);

            // Limit & Offset (Sayfalama)
            if (params.limit) {
                const start = params.offset || 0;
                const end = start + params.limit - 1;
                query = query.range(start, end);
            }

            // Ajan Filtresi
            if (params.targetAgent && params.targetAgent !== 'all') {
                query = query.eq('AgentName', params.targetAgent);
            }
            // Grup Filtresi
            if (params.targetGroup && params.targetGroup !== 'all') {
                query = query.ilike('Group', params.targetGroup);
            }
            // Dönem (Ay/Yıl) Filtresi - format: "MM.YYYY"
            if (params.period) {
                const parts = params.period.split('.');
                if (parts.length === 2) {
                    const month = parseInt(parts[0]);
                    const year = parseInt(parts[1]);
                    
                    // Ayın başı ve bir sonraki ayın başı (GTE/LT için)
                    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
                    let endYear = year;
                    let endMonth = month + 1;
                    if (endMonth > 12) {
                        endMonth = 1;
                        endYear++;
                    }
                    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

                    // Gelişmiş OR-AND Filtresi: (CallDate >= start AND CallDate < end) OR (Date >= start AND Date < end)
                    query = query.or(`and(CallDate.gte.${startDate},CallDate.lt.${endDate}),and(Date.gte.${startDate},Date.lt.${endDate})`);
                }
            }

            return await query.order('id', { ascending: false });
        }
    },

    // --- LOGGING ---
    async saveLog(action, details) {
        try {
            const user = (typeof currentUser !== 'undefined') ? currentUser : localStorage.getItem('sSportUser');
            await window.sb.from('logs').insert({
                Username: user,
                Action: action,
                Details: details,
                Date: new Date().toISOString()
            });
        } catch (e) { }
    }
};

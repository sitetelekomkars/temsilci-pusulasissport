
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
            const teamCols = 'id,user_a,user_b,status';
            const configCols = 'id,task_name,steps,order,is_active';

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

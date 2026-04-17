// ============================================================================
// 🛡️ EnQaZ Core Engine - Absolute Single Active Session Control
// ============================================================================
import { supabase, DB_TABLES } from '../config/supabase.js';

window.isSessionValid = false;

export const EngineSecurity = {
    sessionId: null, 
    heartbeatLoop: null,
    dbSessionChannel: null,

    els: {
        overlay: null,
        statusText: null,
        btnTakeover: null,
        btnExit: null
    },

    async init() {
        this.cacheDOM();

        // MULTI-TAB PREVENTION: Removed auto-kill to allow smooth conflict resolution.
        // Session lock is strictly managed defensively via the RPC responses.

        try {
            this.updateStatus("Authenticating Authority...");
            await this.verifyAuthentication();

            this.updateStatus("Verifying Single Session Matrix...");
            await this.handleSessionLock();

        } catch (error) {
            this.lockdown(error.message);
        }
    },

    cacheDOM() {
        this.els.overlay = document.getElementById('engine-ui-security-layer');
        this.els.statusText = document.getElementById('sec-layer-text');
        this.els.btnTakeover = document.getElementById('sec-btn-takeover');
        this.els.btnExit = document.getElementById('sec-btn-exit');

        if (this.els.btnTakeover) {
            this.els.btnTakeover.addEventListener('click', () => this.executeTakeover());
        }
        if (this.els.btnExit) {
            this.els.btnExit.addEventListener('click', () => {
                sessionStorage.removeItem("ENGINE_SESSION");
                window.location.reload();
            });
        }
    },

    updateStatus(msg) {
        if (this.els.statusText) this.els.statusText.innerText = msg;
        console.log(`[SECURITY] ${msg}`);
    },

    async verifyAuthentication() {
        const sessionKey = sessionStorage.getItem("ENGINE_SESSION");
        if (!sessionKey || sessionKey.trim() === '') {
            throw new Error('Valid Engine Key Missing. Please log in.');
        }

        this.sessionId = sessionKey;
    },

    async handleSessionLock() {
        // 🔒 ATOMIC SESSION CREATION VIA SUPABASE RPC
        // Bypasses all client-side race conditions using pg_advisory_xact_lock on the server
        const { data, error } = await supabase.rpc('rpc_acquire_engine_lock', {
            p_session_id: this.sessionId
        });

        if (error) {
            console.error("[session_error] Lock acquisition failed:", error);
            throw new Error("Database RPC failure. Unable to acquire authoritative lock.");
        }

        if (data && data.status === 'granted') {
            console.log("[session_created] Global Network Lock Acquired deterministically.");
            this.grantAccess();
        } else if (data && data.status === 'blocked') {
            console.log(`[session_blocked] Execution halted. Another origin running. Active session: ${data.active_session}`);
            this.showConflictResolution();
        } else {
            console.warn("[session_anomaly] Unexpected RPC response:", data);
            setTimeout(() => this.handleSessionLock(), 1000);
        }
    },



    showConflictResolution() {
        this.updateStatus("هناك session نشطة بالفعل");
        
        if (this.els.btnTakeover) {
            this.els.btnTakeover.innerHTML = '<i class="fa-solid fa-bolt"></i> Take Over';
            this.els.btnTakeover.classList.remove('hidden');
        }
        if (this.els.btnExit) {
            this.els.btnExit.innerHTML = '<i class="fa-solid fa-person-walking-arrow-right"></i> Exit';
            this.els.btnExit.classList.remove('hidden');
        }
    },

    async executeTakeover() {
        this.updateStatus("Executing System Hijack...");
        if (this.els.btnTakeover) this.els.btnTakeover.classList.add('hidden');
        if (this.els.btnExit) this.els.btnExit.classList.add('hidden');

        // STEP 1: Generate brand new local session footprint to break cache bounds
        this.sessionId = crypto.randomUUID();
        sessionStorage.setItem("ENGINE_SESSION", this.sessionId);

        // STEP 2: Deactivate globally and force acquire lock via strictly atomic RPC
        const { data, error } = await supabase.rpc('rpc_takeover_engine_session', {
            p_session_id: this.sessionId
        });

        if (error || (data && data.status !== 'success')) {
            console.error("Takeover failed:", error || data);
            this.lockdown("Takeover sequence failed on DB layer.");
            return;
        }

        console.log("[session_taken_over] Network overridden.");

        setTimeout(async () => {
             await this.handleSessionLock();
        }, 500);
    },

    grantAccess() {
        this.updateStatus("Authorization complete. Engine running.");
        window.isSessionValid = true;

        if (this.els.overlay) {
            this.els.overlay.classList.add('opacity-0');
            setTimeout(() => this.els.overlay.style.display = 'none', 500);
        }

        this.startHeartbeat();
        this.subscribeToEviction();
        this.setupUnloadTrap();

        window.dispatchEvent(new Event('engine:security_cleared'));
    },

    lockdown(reason) {
        window.isSessionValid = false;
        this.updateStatus(`CRITICAL STOP: ${reason}`);
        if (this.els.overlay) {
            this.els.overlay.style.display = 'flex';
            this.els.overlay.classList.add('bg-term-alert/20');
        }
        if (this.els.btnExit) this.els.btnExit.classList.remove('hidden');
        if (this.els.btnTakeover) this.els.btnTakeover.classList.add('hidden');
    },

    blockMultiTab() {
        window.isSessionValid = false;
        clearInterval(this.heartbeatLoop);
        window.dispatchEvent(new Event('engine:kill_switch'));

        // Rip entire page body output into a blocked slate per requested instruction fail-safe
        document.body.innerHTML = `
            <div class="fixed inset-0 z-[999999] bg-black flex flex-col justify-center items-center">
                <i class="fa-solid fa-triangle-exclamation text-8xl text-red-600 mb-6 animate-pulse"></i>
                <h1 class="text-4xl font-bold text-red-600 tracking-widest uppercase mb-4 text-center">Engine Terminated</h1>
                <p class="text-gray-400 text-lg uppercase tracking-wide">Multi-Tab replication is strictly prohibited.</p>
            </div>
        `;
    },

    startHeartbeat() {
        // Ping every 5 seconds natively enforced via RPC
        this.heartbeatLoop = setInterval(async () => {
            if (!window.isSessionValid) return;
            
            const { data, error } = await supabase.rpc('rpc_heartbeat_engine', {
                p_session_id: this.sessionId
            });

            if (error) {
                console.error("Heartbeat sync failed. RPC error:", error);
                return;
            }

            if (data && data.status === 'revoked') {
                 console.warn("Heartbeat rejected! Session was revoked externally.");
                 this.enforceKillSwitch("SESSION REVOKED INTERNALLY");
            }
        }, 5000);
    },

    subscribeToEviction() {
        // REAL-TIME SESSION KILL
        this.dbSessionChannel = supabase.channel('engine-security-kill')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: DB_TABLES.ENGINE_SESSIONS }, (payload) => {
                if (payload.new.session_id === this.sessionId && payload.new.is_active === false) {
                    console.log("[session_killed] Realtime deactivation caught.");
                    this.enforceKillSwitch("SESSION REVOKED INTERNALLY");
                }
            }).subscribe();
    },

    enforceKillSwitch(reason) {
        window.isSessionValid = false;
        clearInterval(this.heartbeatLoop);
        window.dispatchEvent(new Event('engine:kill_switch')); // Halts simulator loops

        if (this.els.overlay) {
            this.els.overlay.style.display = 'flex';
            this.els.overlay.className = "fixed inset-0 z-[9999] bg-black bg-opacity-95 backdrop-blur-md flex flex-col justify-center items-center text-term-alert border-[12px] border-term-alert/50";
            if (this.els.btnTakeover) this.els.btnTakeover.classList.add('hidden');
            if (this.els.btnExit) this.els.btnExit.classList.remove('hidden');
            this.updateStatus(`[FATAL] ${reason}. Simulator execution Halted.`);
        }
    },

    setupUnloadTrap() {
        window.addEventListener('beforeunload', () => {
            if (window.isSessionValid) {
                supabase.rpc('rpc_deactivate_engine_session', { p_session_id: this.sessionId }).then();
            }
        });
    }
};

// Wait for frontend engine.html to explicitly invoke EngineSecurity.init() after successful login.
// Removed auto initialization.

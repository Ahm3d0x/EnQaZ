// ============================================================================
// 🖥️ EnQaZ Core Engine - UI & Telemetry Controller
// ============================================================================

export const EngineUI = {
    startTime: Date.now(),
    uptimeInterval: null,

    // عناصر الـ DOM الرئيسية
    els: {
        uptime: document.getElementById('sys-uptime'),
        terminal: document.getElementById('terminal-output'),
        brdRate: document.getElementById('brd-rate'),
        statIncidents: document.getElementById('stat-incidents'),
        statAmbulances: document.getElementById('stat-ambulances'),
        watchdogQueue: document.getElementById('watchdog-queue'),
        routingQueue: document.getElementById('routing-queue'),
        radarStatus: document.getElementById('radar-status')
    },

    init() {
        this.startUptime();
        this.setupEventListeners();
        this.log('SYS', 'EngineUI Controller Initialized successfully.', 'success');
    },

    // ⏱️ حساب وقت التشغيل (Uptime)
    startUptime() {
        this.uptimeInterval = setInterval(() => {
            const diff = Math.floor((Date.now() - this.startTime) / 1000);
            const h = String(Math.floor(diff / 3600)).padStart(2, '0');
            const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
            const s = String(diff % 60).padStart(2, '0');
            if (this.els.uptime) this.els.uptime.innerText = `UP: ${h}:${m}:${s}`;
        }, 1000);
    },

    // 💻 طباعة السجلات في شاشة الهاكر (The Matrix Terminal)
    log(module, message, level = 'info') {
        if (!this.els.terminal) return;

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        
        let colorClass = 'text-term-dim'; // Default (Gray/Dim Green)
        if (level === 'info') colorClass = 'text-term-text'; // Bright Green
        if (level === 'warn') colorClass = 'text-term-warn'; // Yellow
        if (level === 'error' || level === 'alert') colorClass = 'text-term-alert'; // Red
        if (level === 'success') colorClass = 'text-blue-500'; // Blue
        if (level === 'system') colorClass = 'text-purple-500'; // Purple

        const entry = document.createElement('div');
        entry.className = `log-entry ${colorClass} text-[11px] leading-tight`;
        entry.innerHTML = `<span class="opacity-50">[${timeStr}]</span> <span class="font-bold">[${module}]</span> ${message}`;

        this.els.terminal.appendChild(entry);

        // الحفاظ على السجلات بحد أقصى 100 سطر لمنع امتلاء الذاكرة
        if (this.els.terminal.childElementCount > 100) {
            this.els.terminal.removeChild(this.els.terminal.firstChild);
        }

        // التمرير التلقائي للأسفل
        this.els.terminal.scrollTop = this.els.terminal.scrollHeight;
    },

    // 📊 تحديث الإحصائيات الحية
    updateStat(type, value) {
        if (type === 'incidents' && this.els.statIncidents) this.els.statIncidents.innerText = value;
        if (type === 'ambulances' && this.els.statAmbulances) this.els.statAmbulances.innerText = value;
        if (type === 'broadcastRate' && this.els.brdRate) this.els.brdRate.innerText = value;
    },

    // ⏳ رسم طابور الـ 10 ثوانٍ (Watchdog Queue)
    // يستقبل مصفوفة من الحوادث قيد الانتظار: [{ uid: 'DEV-123', timeLeft: 8, lat: 30.1, lng: 31.2 }]
    renderWatchdogQueue(items) {
        if (!this.els.watchdogQueue) return;

        if (!items || items.length === 0) {
            this.els.watchdogQueue.innerHTML = '<div class="text-center text-term-dim/50 text-[10px] mt-4">Queue is empty</div>';
            return;
        }

        this.els.watchdogQueue.innerHTML = items.map(item => {
            const progressWidth = (item.timeLeft / 10) * 100;
            const colorClass = item.timeLeft <= 3 ? 'bg-term-alert' : 'bg-term-warn';
            
            return `
            <div class="bg-term-bg/50 border border-term-dim/20 rounded p-2 text-[10px]">
                <div class="flex justify-between mb-1">
                    <span class="font-bold text-term-text">${item.uid}</span>
                    <span class="text-term-dim">${item.timeLeft}s</span>
                </div>
                <div class="w-full bg-black h-1 rounded overflow-hidden">
                    <div class="h-full ${colorClass} transition-all duration-1000 ease-linear" style="width: ${progressWidth}%"></div>
                </div>
            </div>`;
        }).join('');
    },

    // 🗺️ رسم طابور طلبات الخرائط (OSRM Queue)
    // يستقبل مصفوفة: [{ ambCode: 'UNIT-01', status: 'Fetching...' }]
    renderRoutingQueue(items) {
        if (!this.els.routingQueue) return;

        if (!items || items.length === 0) {
            this.els.routingQueue.innerHTML = '<div class="text-center text-term-dim/50 text-[10px] mt-4">Queue is empty</div>';
            return;
        }

        this.els.routingQueue.innerHTML = items.map(item => `
            <div class="bg-term-bg/50 border border-blue-500/20 rounded p-2 text-[10px] flex justify-between items-center">
                <span class="font-bold text-blue-500"><i class="fa-solid fa-truck-medical mr-1"></i> ${item.ambCode}</span>
                <span class="text-term-dim animate-pulse">${item.status}</span>
            </div>
        `).join('');
    },

    // 🖱️ إعداد أزرار الواجهة
    setupEventListeners() {
        const clearBtn = document.getElementById('clear-logs-btn');
        const syncBtn = document.getElementById('btn-sync-db');
        const killBtn = document.getElementById('btn-kill-switch');

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (this.els.terminal) this.els.terminal.innerHTML = '';
                this.log('SYS', 'Terminal cleared by admin.', 'dim');
            });
        }

        if (syncBtn) {
            syncBtn.addEventListener('click', () => {
                this.log('DB', 'Manual Force Sync initiated. Saving all coordinates...', 'warn');
                // نطلق حدثاً مخصصاً ليسمعه ملف enginesimulator.js
                window.dispatchEvent(new Event('engine:force_sync'));
            });
        }

        if (killBtn) {
            killBtn.addEventListener('click', () => {
                this.log('ALERT', 'MASTER KILL SWITCH ACTIVATED! Stopping all loops.', 'alert');
                document.body.classList.add('bg-term-alert/10');
                // نطلق حدثاً مخصصاً ليسمعه المحرك ويوقف كل شيء
                window.dispatchEvent(new Event('engine:kill_switch'));
            });
        }
    }
};
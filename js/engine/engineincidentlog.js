// ============================================================================
// 📡 EnQaZ Core Engine - Hardware Incident Log & Watchdog
// ============================================================================

import { supabase, DB_TABLES } from '../config/supabase.js';
import { EngineUI } from './engineui.js';

export const IncidentLog = {
    watchdogQueue: [],
    watchdogTimer: null,

    init() {
        EngineUI.log('LOG', 'IncidentLog Module initialized. Listening for HW signals...', 'info');
        this.subscribeToHardwareRequests();
        this.startWatchdogLoop();
        this.listenForKillSwitch();
    },

    // 🎧 الاستماع لطلبات الهاردوير الحية
    subscribeToHardwareRequests() {
        supabase.channel('hw-requests-monitor')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: DB_TABLES.HARDWARE_REQUESTS }, (payload) => {
                this.handleIncomingSignal(payload.new);
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    EngineUI.log('NET', 'Connected to Hardware Requests channel.', 'success');
                }
            });
    },

    // 🚦 معالجة الإشارة الواردة
    handleIncomingSignal(req) {
        if (req.request_type === 'alert') {
            // التحقق من عدم وجود الجهاز مسبقاً في الطابور لمنع التكرار
            const exists = this.watchdogQueue.find(item => item.deviceId === req.device_id);
            if (exists) return;

            // إضافة البلاغ للطابور
            this.watchdogQueue.push({
                reqId: req.id,
                uid: `DEV-${req.device_id}`, // للعرض في الواجهة
                deviceId: req.device_id,
                lat: req.lat,
                lng: req.lng,
                payload: req.raw_payload,
                timeLeft: 10 // ⏱️ قاعدة الـ 10 ثوانٍ
            });

            EngineUI.log('HW', `CRASH SIGNAL: Device ${req.device_id}. 10s countdown started.`, 'alert');
            EngineUI.renderWatchdogQueue(this.watchdogQueue);
        } 
        else if (req.request_type === 'cancel') {
            // إذا وصل طلب الإلغاء، نبحث عن الجهاز في الطابور
            const index = this.watchdogQueue.findIndex(item => item.deviceId === req.device_id);
            if (index !== -1) {
                this.watchdogQueue.splice(index, 1);
                EngineUI.log('HW', `SIGNAL CANCELLED by user (Device ${req.device_id}). Aborting.`, 'warn');
                EngineUI.renderWatchdogQueue(this.watchdogQueue);
            }
        }
    },

    // 🔄 حلقة العد التنازلي (The Watchdog Loop)
    startWatchdogLoop() {
        this.watchdogTimer = setInterval(() => {
            if (this.watchdogQueue.length === 0) return;

            let queueChanged = false;

            // نمر على المصفوفة بالعكس لكي لا تحدث مشاكل عند الحذف (Splice)
            for (let i = this.watchdogQueue.length - 1; i >= 0; i--) {
                const item = this.watchdogQueue[i];
                item.timeLeft -= 1;
                queueChanged = true;

                if (item.timeLeft <= 0) {
                    this.confirmIncident(item); // تأكيد الحادث
                    this.watchdogQueue.splice(i, 1); // إزالته من طابور الانتظار
                }
            }

            if (queueChanged) {
                EngineUI.renderWatchdogQueue(this.watchdogQueue);
            }
        }, 1000); // يعمل كل ثانية
    },

    // ✅ تأكيد الحادث وإرساله لقاعدة البيانات
    async confirmIncident(item) {
        EngineUI.log('SYS', `Timeout reached. Confirming Incident for Device ${item.deviceId}...`, 'system');

        try {
            // 1. جلب بيانات المستخدم المرتبط بالجهاز
            const { data: devData } = await supabase.from(DB_TABLES.DEVICES).select('user_id').eq('id', item.deviceId).single();

            // 2. محاولة استخراج السرعة وقوة الاصطدام من الـ JSON
            let speed = 0, gforce = 0;
            try {
                const parsed = JSON.parse(item.payload);
                speed = parsed.speed || 0;
                gforce = parsed.g_force || 0;
            } catch(e) {}

            // 3. إنشاء سجل الحادث الجديد في قاعدة البيانات
            const { data: newInc, error } = await supabase.from(DB_TABLES.INCIDENTS).insert([{
                device_id: item.deviceId,
                user_id: devData ? devData.user_id : null,
                hardware_request_id: item.reqId,
                status: 'pending', // نتركه pending ليقوم ملف Dispatch بالتقاطه
                mode: 'auto',
                latitude: item.lat,
                longitude: item.lng,
                g_force: gforce,
                speed: speed
            }]).select().single();

            if (error) throw error;

            // 4. ربط طلب الهاردوير بالحادث الجديد (لتنظيم البيانات كما في المخطط)
            await supabase.from(DB_TABLES.HARDWARE_REQUESTS).update({ incident_id: newInc.id }).eq('id', item.reqId);
            
            // 5. إضافة سجل (Log) لحفظ التاريخ
            await supabase.from(DB_TABLES.INCIDENT_LOGS).insert([{
                incident_id: newInc.id,
                action: 'created',
                performed_by: 'system',
                note: 'Incident automatically confirmed after 10s watchdog timeout.'
            }]);

            EngineUI.log('DB', `Incident #${newInc.id} confirmed. Triggering Dispatcher...`, 'success');

            // 📢 الإبداع المعماري: بدلاً من استدعاء ملف Dispatch مباشرة، نطلق حدثاً عاماً
            // هذا يجعل الكود غير متشابك (Decoupled)، ملف Dispatch سيستمع لهذا الحدث
            window.dispatchEvent(new CustomEvent('engine:incident_ready', { detail: newInc }));

        } catch (err) {
            EngineUI.log('ERR', `Failed to create incident: ${err.message}`, 'alert');
        }
    },

    // 🛑 إيقاف الطوارئ
    listenForKillSwitch() {
        window.addEventListener('engine:kill_switch', () => {
            if (this.watchdogTimer) clearInterval(this.watchdogTimer);
            this.watchdogQueue = [];
            EngineUI.renderWatchdogQueue([]);
            EngineUI.log('SYS', 'Watchdog Timer HALTED.', 'dim');
        });
    }
};

// تشغيل الموديول بمجرد استدعائه في engine.html
document.addEventListener('DOMContentLoaded', () => {
    // تم تأخير التشغيل قليلاً لضمان أن EngineUI جاهزة تماماً
    setTimeout(() => IncidentLog.init(), 500);
});
// ============================================================================
// 🧠 EnQaZ Core Engine - AI Dispatcher & Resource Allocation
// ============================================================================

import { supabase, DB_TABLES } from '../config/supabase.js';
import { EngineUI } from './engineui.js';

export const EngineDispatch = {
    init() {
        EngineUI.log('SYS', 'EngineDispatch Module initialized. Awaiting incidents...', 'info');
        this.listenForNewIncidents();
    },

    // 🎧 الاستماع للحوادث المؤكدة
    listenForNewIncidents() {
        window.addEventListener('engine:incident_ready', async (e) => {
            const incident = e.detail;
            EngineUI.log('DISPATCH', `Received Incident #${incident.id}. Initiating geospatial scan...`, 'system');
            await this.processDispatch(incident);
        });
    },

    // 🚀 عملية التوجيه والمفاضلة
    async processDispatch(incident) {
        try {
            // 1. جلب الإسعافات المتاحة
            const { data: ambulances, error: ambErr } = await supabase
                .from(DB_TABLES.AMBULANCES)
                .select('id, code, lat, lng')
                .eq('status', 'available');
            
            if (ambErr) throw ambErr;

            if (!ambulances || ambulances.length === 0) {
                EngineUI.log('DISPATCH', `CRITICAL: No available ambulances for Incident #${incident.id}!`, 'alert');
                return; // سنتوقف هنا، الحادث سيبقى pending في الداتابيز
            }

            // 2. جلب المستشفيات
            const { data: hospitals, error: hospErr } = await supabase
                .from(DB_TABLES.HOSPITALS)
                .select('id, name, lat, lng');
            
            if (hospErr) throw hospErr;

            // 3. حساب المسافات لاختيار الأقرب
            EngineUI.log('DISPATCH', 'Calculating distance vectors...', 'dim');
            const nearestAmb = this.findNearest(incident.latitude, incident.longitude, ambulances);
            const nearestHosp = this.findNearest(incident.latitude, incident.longitude, hospitals);

            if (!nearestHosp) {
                EngineUI.log('DISPATCH', `CRITICAL: No hospitals found in database!`, 'alert');
                return;
            }

            EngineUI.log('DISPATCH', `Optimal Match Found: Unit [${nearestAmb.code}] -> Hospital [${nearestHosp.name}].`, 'success');

            // 4. تحديث قاعدة البيانات (عملية حجز الموارد - Locking)
            // حجز الإسعاف
            await supabase.from(DB_TABLES.AMBULANCES)
                .update({ status: 'assigned' })
                .eq('id', nearestAmb.id);

            // تحديث الحادث
            const now = new Date().toISOString();
            await supabase.from(DB_TABLES.INCIDENTS)
                .update({
                    status: 'assigned',
                    assigned_ambulance_id: nearestAmb.id,
                    assigned_hospital_id: nearestHosp.id,
                    assigned_at: now,
                    updated_at: now
                })
                .eq('id', incident.id);

            // 5. كتابة السجل (Audit Log)
            await supabase.from(DB_TABLES.INCIDENT_LOGS).insert([{
                incident_id: incident.id,
                action: 'assigned',
                performed_by: 'EnQaZ AI Engine',
                note: `Automatically assigned to Ambulance ${nearestAmb.code} and directed to ${nearestHosp.name}.`
            }]);

            // 6. تحديث أرقام لوحة التحكم
            EngineUI.log('DB', `Incident #${incident.id} locked and resources allocated.`, 'dim');
            this.updateStatsCounters();

            // 7. 📢 إطلاق حدث للـ Simulator للبدء في طلب مسار OSRM والحركة
            const dispatchData = {
                incident: incident,
                ambulance: nearestAmb,
                hospital: nearestHosp
            };
            window.dispatchEvent(new CustomEvent('engine:dispatch_complete', { detail: dispatchData }));

        } catch (error) {
            EngineUI.log('DISPATCH', `Error during allocation: ${error.message}`, 'error');
        }
    },

    // 📐 خوارزمية حساب أقرب نقطة (Haversine Formula - للمسافات الحقيقية على كوكب الأرض)
    findNearest(targetLat, targetLng, entities) {
        if (!entities || entities.length === 0) return null;

        let nearest = null;
        let minDistance = Infinity;

        entities.forEach(entity => {
            const eLat = parseFloat(entity.lat);
            const eLng = parseFloat(entity.lng);
            
            if (isNaN(eLat) || isNaN(eLng)) return;

            // حساب المسافة الدقيقة
            const dist = this.calculateDistance(targetLat, targetLng, eLat, eLng);

            if (dist < minDistance) {
                minDistance = dist;
                nearest = entity;
            }
        });

        return nearest;
    },

    // 🧮 دالة مساعدة لحساب المسافة الجغرافية بالكيلومتر
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // نصف قطر الأرض بالكيلومترات
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1); 
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
        return R * c; 
    },

    deg2rad(deg) {
        return deg * (Math.PI/180);
    },

    // 📊 تحديث الأرقام الحية أعلى الشاشة
    async updateStatsCounters() {
        try {
            // عدد الحوادث النشطة
            const { count: incCount } = await supabase.from(DB_TABLES.INCIDENTS)
                .select('*', { count: 'exact', head: true })
                .in('status', ['pending', 'assigned', 'in_progress']);
            
            // عدد الإسعافات المتاحة
            const { count: ambCount } = await supabase.from(DB_TABLES.AMBULANCES)
                .select('*', { count: 'exact', head: true })
                .eq('status', 'available');

            EngineUI.updateStat('incidents', incCount || 0);
            EngineUI.updateStat('ambulances', ambCount || 0);
        } catch (e) {
            // تجاهل أخطاء العد الصامتة
        }
    }
};

// تشغيل الموديول بمجرد استدعائه
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        EngineDispatch.init();
        EngineDispatch.updateStatsCounters(); // جلب الأرقام المبدئية
    }, 600);
});
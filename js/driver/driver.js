// ============================================================================
// 🚑 EnQaZ Driver Dashboard (Luxury Telemetry Receiver & UI Controller)
// ============================================================================

import { supabase, DB_TABLES } from '../config/supabase.js';

// متغيرات الحالة العامة (State)
let currentUser = null;
let myAmbulance = null;
let activeIncident = null;

// متغيرات الخريطة (Map)
let map;
let markers = { me: null, incident: null, hospital: null };
let currentRoute = null;
let isTrackingMode = true; // جعل الكاميرا تتبع الإسعاف دائماً

// 📡 قناة البث اللحظي من المايكرو-سيرفر
const trackingChannel = supabase.channel('live-tracking');

// ============================================================================
// 🚀 1. التهيئة والتحقق من الصلاحيات (Init & Auth)
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // 1. التحقق من تسجيل الدخول وصلاحية السائق
    const sessionString = localStorage.getItem('resq_custom_session');
    if (!sessionString) return window.location.replace('../pages/login.html');
    
    currentUser = JSON.parse(sessionString);
    if (currentUser.role !== 'driver') {
        alert("عفواً، هذه الصفحة مخصصة لسائقي الإسعاف فقط.");
        return window.location.replace('../pages/login.html');
    }

    // إضافة سحر النعومة (CSS Transition) للماركرز برمجياً
    const style = document.createElement('style');
    style.innerHTML = `.smooth-marker { transition: transform 1s linear !important; }`;
    document.head.appendChild(style);

    initMap();
    setupUIControls();
    await loadMyAmbulance();
});

// ============================================================================
// 🗺️ 2. تهيئة الخريطة (Map Setup)
// ============================================================================
function initMap() {
    map = L.map('map-container', { zoomControl: false, attributionControl: false }).setView([30.0444, 31.2357], 15);
    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    // استخدام خريطة داكنة لتناسب شاشات التابلت في السيارات وتريح عين السائق
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
}

// إنشاء أيقونة الإسعاف المخصصة
function getMyIcon(status) {
    let color = status === 'available' ? 'bg-blue-500' : (status === 'returning' ? 'bg-gray-500' : 'bg-success');
    let pulse = status !== 'available' && status !== 'returning' ? `<div class="absolute -inset-2 rounded-full border-2 border-success animate-ping opacity-50"></div>` : '';
    return L.divIcon({
        className: 'smooth-marker', // سحر النعومة
        html: `<div class="relative w-12 h-12 ${color} rounded-xl shadow-[0_0_15px_rgba(0,0,0,0.5)] border-2 border-white flex items-center justify-center transform transition-transform z-50">
                 ${pulse}<i class="fa-solid fa-truck-medical text-white text-xl"></i>
               </div>`,
        iconSize: [48, 48], iconAnchor: [24, 24]
    });
}

function getIcon(type) {
    const icons = {
        incident: `<div class="w-10 h-10 bg-red-600 rounded-full border-2 border-white flex items-center justify-center shadow-lg"><i class="fa-solid fa-car-burst text-white"></i></div>`,
        hospital: `<div class="w-12 h-12 bg-white rounded-full border-2 border-green-500 flex items-center justify-center shadow-lg"><i class="fa-solid fa-hospital text-green-500 text-xl"></i></div>`
    };
    return L.divIcon({ className: '', html: icons[type], iconSize: [40, 40], iconAnchor: [20, 20] });
}

// ============================================================================
// 📥 3. جلب البيانات الأساسية (Data Fetching)
// ============================================================================
async function loadMyAmbulance() {
    try {
        const { data, error } = await supabase.from(DB_TABLES.AMBULANCES).select('*').eq('driver_id', currentUser.id).single();
        if (error || !data) throw new Error("لم يتم العثور على سيارة إسعاف مخصصة لك.");
        
        myAmbulance = data;
        document.getElementById('unit-code').innerText = myAmbulance.code;

        // وضع السيارة على الخريطة
        if (myAmbulance.lat && myAmbulance.lng) {
            markers.me = L.marker([myAmbulance.lat, myAmbulance.lng], { icon: getMyIcon(myAmbulance.status) }).addTo(map);
            map.setView([myAmbulance.lat, myAmbulance.lng], 16);
        }

        await checkActiveMission();
        setupDatabaseRealtime(); // الاستماع لتغيرات الحالات (Assign/Complete)
        setupLiveTelemetry();    // الاستماع للحركة اللحظية 60FPS

    } catch (err) {
        alert(err.message);
    }
}

async function checkActiveMission() {
    if (myAmbulance.status === 'assigned' || myAmbulance.status === 'in_progress') {
        const { data } = await supabase.from(DB_TABLES.INCIDENTS)
            .select('*, devices(car_model, car_plate, users(name, phone, medical_conditions, blood_type)), hospitals(name, lat, lng)')
            .eq('assigned_ambulance_id', myAmbulance.id)
            .in('status', ['assigned', 'in_progress'])
            .single();
        
        activeIncident = data || null;
    } else {
        activeIncident = null;
    }
    updateUIState();
}

// ============================================================================
// 📡 4. الاستماع اللحظي (Realtime & Telemetry)
// ============================================================================

// أ. الاستماع لتغيرات الحالات في الداتابيز (لفتح/إغلاق المهمة)
function setupDatabaseRealtime() {
    supabase.channel('driver-db-sync')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: DB_TABLES.AMBULANCES, filter: `id=eq.${myAmbulance.id}` }, payload => {
            const newStatus = payload.new.status;
            if (myAmbulance.status !== newStatus) {
                myAmbulance.status = newStatus;
                checkActiveMission(); // إعادة جلب البيانات لتحديث الواجهة
            }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: DB_TABLES.INCIDENTS, filter: `assigned_ambulance_id=eq.${myAmbulance.id}` }, payload => {
            if (payload.new.status === 'canceled') {
                showToast("تم إلغاء البلاغ من قبل غرفة العمليات.", "error");
                checkActiveMission();
            }
        })
        .subscribe();
}

// ب. 🏎️ الاستماع اللحظي للحركة (السحر النقي القادم من المايكرو-سيرفر)
function setupLiveTelemetry() {
    trackingChannel.on('broadcast', { event: 'fleet_update' }, (payload) => {
        const fleetData = payload.payload;
        // البحث عن سيارتي في حزمة البث
        const myData = fleetData.find(unit => String(unit.id) === String(myAmbulance.id));

        if (myData && markers.me) {
            // 1. تحريك السيارة بنعومة
            markers.me.setLatLng([myData.lat, myData.lng]);
            if (typeof markers.me.setRotationAngle === 'function') markers.me.setRotationAngle(myData.heading);

            // 2. تحديث الكاميرا لتتبع السيارة
            if (isTrackingMode) {
                map.panTo([myData.lat, myData.lng], { animate: true, duration: 1.0 });
            }

            // 3. رسم المسار إذا أرسله السيرفر ولم يتم رسمه بعد
            if (myData.route && !currentRoute) {
                drawRoute(myData.route);
            }
        }
    }).subscribe();
}

// ============================================================================
// 🎨 5. تحديث واجهة المستخدم (UI Controllers)
// ============================================================================
function updateUIState() {
    const idleOverlay = document.getElementById('idle-overlay');
    const sidebar = document.getElementById('info-sidebar');
    const actionContainer = document.getElementById('action-btn-container');
    const actionBtn = document.getElementById('action-btn');
    const actionText = document.getElementById('action-text');
    const actionIcon = document.getElementById('action-icon');

    // تحديث أيقونة السيارة
    if (markers.me) markers.me.setIcon(getMyIcon(myAmbulance.status));

    if (myAmbulance.status === 'available' || myAmbulance.status === 'returning') {
        // حالة الخمول أو العودة
        idleOverlay.classList.remove('hidden');
        sidebar.classList.replace('panel-slide-in', 'panel-slide-out');
        actionContainer.classList.add('hidden');
        clearMissionMap();
    } 
    else if (activeIncident) {
        // حالة وجود مهمة (متجه للحادث أو متجه للمستشفى)
        idleOverlay.classList.add('hidden');
        sidebar.classList.replace('panel-slide-out', 'panel-slide-in');
        actionContainer.classList.remove('hidden');

        // تعبئة بيانات السايدبار
        const dev = activeIncident.devices;
        const usr = dev?.users;
        document.getElementById('patient-name').innerText = usr?.name || 'غير معروف';
        document.getElementById('patient-blood').innerText = usr?.blood_type || 'N/A';
        document.getElementById('patient-notes').innerText = usr?.medical_conditions || 'لا يوجد';
        document.getElementById('patient-phone').innerText = usr?.phone || 'غير مسجل';
        document.getElementById('patient-phone').href = `tel:${usr?.phone}`;
        
        document.getElementById('impact-force').innerText = `${activeIncident.g_force || 0} G`;
        document.getElementById('impact-speed').innerText = `${activeIncident.speed || 0} km/h`;
        document.getElementById('car-model').innerText = dev?.car_model || 'سيارة غير معروفة';
        document.getElementById('car-plate').innerText = dev?.car_plate || '---';
        document.getElementById('hospital-name').innerText = activeIncident.hospitals?.name || 'جاري التحديد...';

        // وضع الماركرز للحادث والمستشفى
        setupMissionMarkers();

        // تحديث زر الأكشن (Action Button) بناءً على المرحلة
        if (myAmbulance.status === 'assigned') {
            actionBtn.className = "w-full bg-orange-600 hover:bg-orange-700 text-white font-black py-6 rounded-3xl shadow-[0_20px_40px_-10px_rgba(234,88,12,0.5)] transition-transform active:scale-95 flex items-center justify-center gap-3 text-2xl uppercase tracking-wider";
            actionText.innerText = "تأكيد استلام المريض";
            actionIcon.className = "fa-solid fa-user-check text-3xl";
            actionBtn.onclick = () => updateMissionStatus('in_progress');
        } 
        else if (myAmbulance.status === 'in_progress') {
            actionBtn.className = "w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-6 rounded-3xl shadow-[0_20px_40px_-10px_rgba(37,99,235,0.5)] transition-transform active:scale-95 flex items-center justify-center gap-3 text-2xl uppercase tracking-wider";
            actionText.innerText = "تأكيد الوصول للمستشفى";
            actionIcon.className = "fa-solid fa-hospital-user text-3xl";
            actionBtn.onclick = () => updateMissionStatus('completed');
        }
    }
}

function setupMissionMarkers() {
    // ماركر الحادث
    if (activeIncident.latitude && activeIncident.longitude) {
        if (!markers.incident) markers.incident = L.marker([activeIncident.latitude, activeIncident.longitude], { icon: getIcon('incident') }).addTo(map);
        else markers.incident.setLatLng([activeIncident.latitude, activeIncident.longitude]);
    }
    // ماركر المستشفى
    if (activeIncident.hospitals && activeIncident.hospitals.lat && activeIncident.hospitals.lng) {
        if (!markers.hospital) markers.hospital = L.marker([activeIncident.hospitals.lat, activeIncident.hospitals.lng], { icon: getIcon('hospital') }).addTo(map);
        else markers.hospital.setLatLng([activeIncident.hospitals.lat, activeIncident.hospitals.lng]);
    }
}

function drawRoute(coords) {
    if (currentRoute) map.removeLayer(currentRoute);
    currentRoute = L.polyline(coords, {
        color: '#3b82f6', weight: 8, opacity: 0.8, dashArray: '15, 15', lineCap: 'round'
    }).addTo(map);
    
    // عمل زووم ليحتوي المسار (مرة واحدة)
    map.fitBounds(currentRoute.getBounds(), { padding: [50, 50] });
    setTimeout(() => { isTrackingMode = true; }, 2000); // العودة لتتبع الإسعاف بعد ثانيتين
}

function clearMissionMap() {
    if (markers.incident) { map.removeLayer(markers.incident); markers.incident = null; }
    if (markers.hospital) { map.removeLayer(markers.hospital); markers.hospital = null; }
    if (currentRoute) { map.removeLayer(currentRoute); currentRoute = null; }
}

// ============================================================================
// 🛠️ 6. الأفعال والأزرار (Interactions)
// ============================================================================
function setupUIControls() {
    document.getElementById('logoutBtn').onclick = () => {
        if (confirm("هل أنت متأكد من تسجيل الخروج؟ سيتم تحويلك لحالة Offline.")) {
            supabase.from(DB_TABLES.AMBULANCES).update({ status: 'offline' }).eq('id', myAmbulance.id).then();
            localStorage.removeItem('resq_custom_session');
            window.location.replace('../pages/login.html');
        }
    };

    document.getElementById('close-sidebar-btn').onclick = () => {
        document.getElementById('info-sidebar').classList.replace('panel-slide-in', 'panel-slide-out');
        document.getElementById('toggle-sidebar-btn').classList.remove('hidden');
    };

    document.getElementById('toggle-sidebar-btn').onclick = (e) => {
        document.getElementById('info-sidebar').classList.replace('panel-slide-out', 'panel-slide-in');
        e.currentTarget.classList.add('hidden');
    };

    document.getElementById('track-btn').onclick = () => {
        isTrackingMode = true;
        if (markers.me) map.flyTo(markers.me.getLatLng(), 17, { animate: true, duration: 1 });
        showToast("تم تفعيل التتبع اللحظي للكاميرا", "success");
    };

    // اكتشاف تحريك الخريطة يدوياً لإيقاف التتبع التلقائي
    map.on('dragstart', () => { isTrackingMode = false; });
}

// تحديث حالة المهمة يدوياً (للوضع الحقيقي - Live Action)
async function updateMissionStatus(newStatus) {
    try {
        document.getElementById('action-btn').disabled = true;
        document.getElementById('action-text').innerText = "جاري التحديث...";

        const now = new Date().toISOString();
        const incUpdate = { status: newStatus, updated_at: now };
        
        if (newStatus === 'completed') {
            incUpdate.resolved_at = now;
            incUpdate.hospital_arrival_at = now;
        }

        await supabase.from(DB_TABLES.INCIDENTS).update(incUpdate).eq('id', activeIncident.id);
        
        // تحديث الإسعاف
        const nextAmbStatus = newStatus === 'completed' ? 'returning' : 'in_progress';
        await supabase.from(DB_TABLES.AMBULANCES).update({ status: nextAmbStatus }).eq('id', myAmbulance.id);

        // مسح المسار الحالي ليقوم السيرفر بإرسال مسار جديد (في حالة in_progress للمستشفى)
        if (currentRoute) { map.removeLayer(currentRoute); currentRoute = null; }

        showToast("تم تحديث حالة المهمة بنجاح!", "success");

    } catch (err) {
        alert("حدث خطأ أثناء التحديث.");
        document.getElementById('action-btn').disabled = false;
    }
}

// دالة بسيطة للإشعارات
function showToast(msg, type) {
    const color = type === 'success' ? '#10b981' : '#dc2626';
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed; top:20px; left:50%; transform:translateX(-50%); background:${color}; color:white; padding:10px 20px; border-radius:10px; z-index:9999; font-weight:bold; box-shadow:0 10px 20px rgba(0,0,0,0.2);`;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
// ============================================================================
// القاموس الشامل (يحتوي على نصوص النظام بالكامل)
// ============================================================================
export const translations = {
    en: {
        // --- Shared & General ---
        langBtn: "العربية",
        logo: "ResQ",
        loading: "Loading...",
        processing: "Processing...",
        save: "Save",
        cancel: "Cancel",
        close: "Close",
        delete: "Delete",
        edit: "Edit",
        view: "View",
        status: "Status",
        actions: "Actions",

        // --- Admin Global UI ---
        desktopOnly: "Desktop & Tablet Only",
        desktopOnlyDesc: "Command Center requires a larger screen for real-time map telemetry.",
        returnHome: "Return to Home",
        adminTitle: "ResQ Admin",
        aiDispatch: "AI Dispatch Live",
        maximizeMap: "Maximize Map",
        showPanels: "Show Panels",
        
        // --- Sidebar ---
        navDash: "Dashboard",
        navUsers: "Users",
        navHospitals: "Hospitals",
        navAmbulances: "Ambulances",

        // --- Dashboard Module ---
        dashIncidents: "Incidents",
        dashFleet: "Fleet",
        dashDevices: "Active Devices",
        searchDevicePlaceholder: "Search ID or Owner...",
        panelDetailsTitle: "Details",

        // --- Users Module ---
        usersTitle: "Users Management",
        usersDesc: "Manage drivers, hospitals, admins, and app users.",
        addNewUser: "Add New User",
        searchUsers: "Search Name, Email, ID...",
        allRoles: "All Roles",
        allStatus: "All Status",
        active: "Active",
        suspended: "Suspended",
        id: "ID",
        name: "Name",
        email: "Email",
        phone: "Phone",
        role: "Role",

        // --- Hospitals Module ---
        hospTitle: "Hospitals Network",
        hospDesc: "Manage facilities, locations, and real-time bed capacities.",
        addHosp: "Add Hospital",
        searchHosp: "Search Name, City, ID...",
        allCapacities: "All Capacities",
        bedsAvailable: "Beds Available",
        fullBeds: "Full (0 Beds)",
        hospName: "Hospital Name",
        location: "Location",
        availBeds: "Available Beds",
        adminAcc: "Admin Account",

        // --- Ambulances Module ---
        ambTitle: "Fleet Management",
        ambDesc: "Manage ambulance units, drivers, and dispatch base zones.",
        addAmb: "Add Unit",
        searchAmb: "Search Code, Driver...",
        mapFilter: "Map Filter",
        unitCode: "Unit Code",
        assignedDriver: "Assigned Driver",
        baseZone: "Base Zone"
    },
    ar: {
        // --- Shared & General ---
        langBtn: "English",
        logo: "ريسكيو",
        loading: "جاري التحميل...",
        processing: "جاري المعالجة...",
        save: "حفظ",
        cancel: "إلغاء",
        close: "إغلاق",
        delete: "حذف",
        edit: "تعديل",
        view: "عرض",
        status: "الحالة",
        actions: "الإجراءات",

        // --- Admin Global UI ---
        desktopOnly: "للكمبيوتر والتابلت فقط",
        desktopOnlyDesc: "غرفة التحكم تتطلب شاشة أكبر لعرض الخريطة والتتبع اللحظي.",
        returnHome: "العودة للرئيسية",
        adminTitle: "إدارة ريسكيو",
        aiDispatch: "توجيه ذكي نشط",
        maximizeMap: "تكبير الخريطة",
        showPanels: "إظهار القوائم",
        
        // --- Sidebar ---
        navDash: "لوحة القيادة",
        navUsers: "المستخدمين",
        navHospitals: "المستشفيات",
        navAmbulances: "الإسعافات",

        // --- Dashboard Module ---
        dashIncidents: "الحوادث",
        dashFleet: "الأسطول",
        dashDevices: "الأجهزة النشطة",
        searchDevicePlaceholder: "بحث بالمعرف أو المالك...",
        panelDetailsTitle: "التفاصيل",

        // --- Users Module ---
        usersTitle: "إدارة المستخدمين",
        usersDesc: "إدارة السائقين، المستشفيات، المديرين، ومستخدمي التطبيق.",
        addNewUser: "إضافة مستخدم",
        searchUsers: "بحث بالاسم، الإيميل، ID...",
        allRoles: "جميع الصلاحيات",
        allStatus: "جميع الحالات",
        active: "نشط",
        suspended: "موقوف",
        id: "الرقم",
        name: "الاسم",
        email: "البريد الإلكتروني",
        phone: "الهاتف",
        role: "الصلاحية",

        // --- Hospitals Module ---
        hospTitle: "شبكة المستشفيات",
        hospDesc: "إدارة المنشآت، المواقع، والسعة اللحظية للأسرة.",
        addHosp: "إضافة مستشفى",
        searchHosp: "بحث بالاسم، المدينة، ID...",
        allCapacities: "جميع السعات",
        bedsAvailable: "يوجد أسرة",
        fullBeds: "ممتلئ (0 أسرة)",
        hospName: "اسم المستشفى",
        location: "الموقع",
        availBeds: "الأسرة المتاحة",
        adminAcc: "حساب الإدارة",

        // --- Ambulances Module ---
        ambTitle: "إدارة الأسطول",
        ambDesc: "إدارة سيارات الإسعاف، السائقين، ونقاط التمركز.",
        addAmb: "إضافة سيارة",
        searchAmb: "بحث بالكود، السائق...",
        mapFilter: "فلتر الخريطة",
        unitCode: "كود السيارة",
        assignedDriver: "السائق المعين",
        baseZone: "نقطة التمركز"
    }
};

export let currentLang = localStorage.getItem('resq_lang') || 'en';

// دالة تصدير لترجمة الكلمات داخل ملفات الـ JS
export function t(key) {
    return translations[currentLang][key] || key;
}

export function applyLanguage(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    
    // ترجمة عناصر الـ HTML الثابتة
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) {
            el.innerHTML = translations[lang][key];
        }
    });

    // ترجمة الـ Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[lang][key]) {
            el.placeholder = translations[lang][key];
        }
    });

    const langToggleBtn = document.getElementById('langToggleBtn');
    if(langToggleBtn) {
        langToggleBtn.innerHTML = translations[lang].langBtn;
    }

    // عكس اتجاه النصوص في الحقول (اختياري)
    document.querySelectorAll('input:not([type="hidden"])').forEach(input => {
        input.style.textAlign = lang === 'ar' ? 'right' : 'left';
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const langToggleBtn = document.getElementById('langToggleBtn');
    
    langToggleBtn?.addEventListener('click', () => {
        currentLang = currentLang === 'en' ? 'ar' : 'en';
        localStorage.setItem('resq_lang', currentLang);
        applyLanguage(currentLang);
        
        // إرسال حدث (Event) لباقي الملفات لتحديث الجداول والنصوص الديناميكية
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: currentLang } }));
    });

    applyLanguage(currentLang);
});
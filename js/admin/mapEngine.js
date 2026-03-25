// ============================================================================
// 🗺️ ResQ Map & Simulation Engine (Standalone Module)
// ============================================================================

// ⚙️ متغيرات التحكم في المحاكاة (يمكنك تعديلها بحرية)
export const SIM_CONFIG = {
    // سرعة سيارة الإسعاف في المحاكاة (كم/ساعة) - محسوبة لتبدو سريعة في الشاشة
    AMBULANCE_SPEED_KPH: 600, 
    // سرعة السيارات العادية (أبطأ من الإسعاف)
    CAR_SPEED_KPH: 200,
    // نصف قطر دورية الإسعاف حول نقطة التمركز (تقريباً 3 كيلو)
    PATROL_RADIUS: 0.03,
    // نصف قطر الوجهات العشوائية للسيارات العادية
    ROAMING_RADIUS: 0.06,
    // رابط الـ OSRM للتوجيه الذكي
    OSRM_URL: 'https://router.project-osrm.org/route/v1/driving/'
};

export const MapEngine = {
    map: null,
    markers: { hospitals: {}, ambulances: {}, incidents: {}, devices: {} },
    routes: {},
    activeTasks: {}, // لتخزين وإلغاء حركات الأنيميشن المستقلة

    // ==========================================
    // 1. التهيئة (Initialization)
    // ==========================================
    init(containerId, centerLat = 30.0444, centerLng = 31.2357, onMarkerClick) {
        this.map = L.map(containerId, { zoomControl: false }).setView([centerLat, centerLng], 12);
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(this.map);
        this.onMarkerClick = onMarkerClick; // Callback لفتح الـ Panels
    },

    // ==========================================
    // 2. إدارة الأيقونات (Icons)
    // ==========================================
    getAmbIcon(color, status) {
        let baseColor = status === 'available' ? '#10b981' : status === 'offline' ? '#6b7280' : '#dc2626';
        return L.divIcon({
            html: `<div style="background-color: ${baseColor}" class="relative w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-white shadow-[0_0_10px_rgba(0,0,0,0.5)] transition-colors duration-300">
                      <i class="fa-solid fa-truck-medical text-xs"></i>
                      <span class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-gray-900" style="background-color: ${color}"></span>
                   </div>`,
            className: ''
        });
    },
    hospIcon: L.divIcon({ html: '<div class="w-8 h-8 bg-gray-800 rounded-full border-2 border-blue-500 flex items-center justify-center text-blue-400 shadow-lg"><i class="fa-solid fa-hospital text-xs"></i></div>', className: ''}),
    incIcon: L.divIcon({ html: '<div class="leaflet-incident-marker w-8 h-8"></div><div class="absolute inset-0 flex items-center justify-center text-lg">💥</div>', className: ''}),
    carIcon: L.divIcon({ html: '<div class="w-8 h-8 bg-white dark:bg-gray-800 rounded-full border-2 border-gray-400 dark:border-gray-600 flex items-center justify-center shadow-lg"><i class="fa-solid fa-car-side text-gray-700 dark:text-gray-300 text-[12px]"></i></div>', className: ''}),

    // ==========================================
    // 3. إضافة وتحديث العناصر على الخريطة
    // ==========================================
    updateHospital(id, lat, lng, data) {
        if (!this.markers.hospitals[id]) {
            this.markers.hospitals[id] = L.marker([lat, lng], {icon: this.hospIcon}).addTo(this.map);
            this.markers.hospitals[id].on('click', () => this.onMarkerClick('Hospital', data));
        }
    },

    updateIncident(id, lat, lng, status, data) {
        if (status !== 'pending' && status !== 'confirmed') {
            if (this.markers.incidents[id]) {
                this.map.removeLayer(this.markers.incidents[id]);
                delete this.markers.incidents[id];
            }
            return;
        }
        if (!this.markers.incidents[id]) {
            this.markers.incidents[id] = L.marker([lat, lng], {icon: this.incIcon}).addTo(this.map);
            this.markers.incidents[id].on('click', () => this.onMarkerClick('Incident', data));
        }
    },

    updateAmbulance(id, lat, lng, status, color, data, baseLat, baseLng) {
        if (!this.markers.ambulances[id]) {
            this.markers.ambulances[id] = L.marker([lat || baseLat, lng || baseLng], {icon: this.getAmbIcon(color, status)}).addTo(this.map);
            this.markers.ambulances[id].on('click', () => this.onMarkerClick('Ambulance', data));
            // بدء الدورية بشكل مستقل
            if (status === 'available') this.startAmbulancePatrol(id, baseLat, baseLng);
        } else {
            this.markers.ambulances[id].setIcon(this.getAmbIcon(color, status));
        }
    },

    updateCar(id, lat, lng, data) {
        if (!this.markers.devices[id]) {
            this.markers.devices[id] = L.marker([lat, lng], {icon: this.carIcon}).addTo(this.map);
            this.markers.devices[id].on('click', () => this.onMarkerClick('Device', data));
            // بدء الحركة بشكل مستقل
            this.startCarRoaming(id, lat, lng);
        }
    },

    // ==========================================
    // 4. محرك الحركة الناعمة (Smooth Animation Engine)
    // ==========================================
    async animateAlongPath(markerId, type, pathCoords, speedKph) {
        const speedMps = speedKph * (1000 / 3600); // تحويل السرعة لمتر/ثانية
        const taskKey = `${type}_${markerId}`;
        this.activeTasks[taskKey] = true;

        const marker = type === 'amb' ? this.markers.ambulances[markerId] : this.markers.devices[markerId];
        if (!marker) return;

        for (let i = 0; i < pathCoords.length - 1; i++) {
            if (!this.activeTasks[taskKey]) break; // تم إلغاء المهمة (مثلاً تم توجيهه لحادث)

            let start = pathCoords[i];
            let end = pathCoords[i + 1];
            let dist = this.map.distance(start, end); // المسافة بالمتر
            if (dist < 1) continue;

            let durationMs = (dist / speedMps) * 1000;
            await this._smoothStep(marker, start, end, durationMs, taskKey);
        }
    },

    _smoothStep(marker, start, end, duration, taskKey) {
        return new Promise(resolve => {
            let startTime = performance.now();
            const step = (currentTime) => {
                if (!this.activeTasks[taskKey]) return resolve(); // Cancelled
                
                let progress = (currentTime - startTime) / duration;
                if (progress >= 1) {
                    marker.setLatLng(end);
                    return resolve();
                }
                
                // الاستيفاء الخطي (Linear Interpolation) لحركة في منتهى النعومة
                let currentLat = start[0] + (end[0] - start[0]) * progress;
                let currentLng = start[1] + (end[1] - start[1]) * progress;
                marker.setLatLng([currentLat, currentLng]);
                
                requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
    },

    cancelAnimation(id, type) {
        this.activeTasks[`${type}_${id}`] = false;
    },

    // ==========================================
    // 5. ذكاء الحركة: الدوريات والسيارات
    // ==========================================
    async startAmbulancePatrol(id, baseLat, baseLng) {
        // تأخير عشوائي عشان مايبدأوش كلهم مع بعض (Desynchronization)
        await new Promise(r => setTimeout(r, Math.random() * 5000));
        
        while(this.activeTasks[`amb_${id}`] !== false) {
            let targetLat = baseLat + (Math.random() - 0.5) * SIM_CONFIG.PATROL_RADIUS;
            let targetLng = baseLng + (Math.random() - 0.5) * SIM_CONFIG.PATROL_RADIUS;
            let currentPos = this.markers.ambulances[id].getLatLng();

            try {
                const res = await fetch(`${SIM_CONFIG.OSRM_URL}${currentPos.lng},${currentPos.lat};${targetLng},${targetLat}?geometries=geojson`);
                const data = await res.json();
                if(data.code === 'Ok') {
                    let coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                    await this.animateAlongPath(id, 'amb', coords, SIM_CONFIG.AMBULANCE_SPEED_KPH);
                }
            } catch(e) {}
            // راحة صغيرة قبل النقطة اللي بعدها
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
        }
    },

    async startCarRoaming(id, startLat, startLng) {
        await new Promise(r => setTimeout(r, Math.random() * 8000));
        
        while(this.activeTasks[`car_${id}`] !== false) {
            let currentPos = this.markers.devices[id].getLatLng();
            let targetLat = currentPos.lat + (Math.random() - 0.5) * SIM_CONFIG.ROAMING_RADIUS;
            let targetLng = currentPos.lng + (Math.random() - 0.5) * SIM_CONFIG.ROAMING_RADIUS;
            
            // خوارزمية مسار شبكي (Grid Path) للسيارات لتبدو كأنها في شوارع تقاطع دون استهلاك الـ API
            let midPoint = [currentPos.lat, targetLng]; // تحرك أفقي ثم رأسي
            let path = [[currentPos.lat, currentPos.lng], midPoint, [targetLat, targetLng]];
            
            await this.animateAlongPath(id, 'car', path, SIM_CONFIG.CAR_SPEED_KPH);
            await new Promise(r => setTimeout(r, 4000 + Math.random() * 5000));
        }
    },

    // ==========================================
    // 6. التوجيه الذكي للمهمات (Dispatch Engine)
    // ==========================================
    async executeDispatch(amb, inc, hosp, onStageComplete) {
        this.cancelAnimation(amb.id, 'amb'); // إيقاف الدورية فوراً
        
        try {
            const currentPos = this.markers.ambulances[amb.id].getLatLng();
            const res = await fetch(`${SIM_CONFIG.OSRM_URL}${currentPos.lng},${currentPos.lat};${inc.longitude},${inc.latitude};${hosp.lng},${hosp.lat}?geometries=geojson`);
            const data = await res.json();
            
            let routeCoords = data.code === 'Ok' ? data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]) : [[currentPos.lat, currentPos.lng], [inc.latitude, inc.longitude], [hosp.lat, hosp.lng]];

            // رسم المسار
            if(this.routes[inc.id]) this.map.removeLayer(this.routes[inc.id]);
            this.routes[inc.id] = L.polyline(routeCoords, { color: amb.routeColor, weight: 5, dashArray: '10, 10' }).addTo(this.map);

            let midPointIndex = Math.floor(routeCoords.length / 2); // نقطة الوصول للحادث تقريبياً
            let pathToInc = routeCoords.slice(0, midPointIndex);
            let pathToHosp = routeCoords.slice(midPointIndex);

            // 1. التوجه للحادث
            await this.animateAlongPath(amb.id, 'amb', pathToInc, SIM_CONFIG.AMBULANCE_SPEED_KPH);
            
            // إبلاغ اللوحة بحالة الوصول (لإخفاء الحادث من الخريطة وتحديث الـ DB)
            onStageComplete('reached_incident');

            // 2. التوجه للمستشفى
            await this.animateAlongPath(amb.id, 'amb', pathToHosp, SIM_CONFIG.AMBULANCE_SPEED_KPH);

            // إبلاغ اللوحة بانتهاء المهمة
            if(this.routes[inc.id]) this.map.removeLayer(this.routes[inc.id]);
            onStageComplete('completed');
            
            // استئناف الدورية
            this.startAmbulancePatrol(amb.id, amb.baseLat, amb.baseLng);

        } catch (e) {
            console.error("Dispatch routing failed", e);
            onStageComplete('completed');
        }
    }
};
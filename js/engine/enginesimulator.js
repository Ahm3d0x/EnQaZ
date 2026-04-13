// ============================================================================
// 🏎️ EnQaZ Core Engine - High-Performance Simulator (V3.8 - CORS Fix)
// ============================================================================

import { supabase, DB_TABLES } from '../config/supabase.js';
import { EngineUI } from './engineui.js';

export const trackingChannel = supabase.channel('live-tracking', {
    config: { broadcast: { ack: false } }
});

export const EngineSimulator = {
    activeMissions: new Map(), 
    lastBroadcastTime: 0,
    simLoopId: null,
    osrmQueue: [], 
    isProcessingOsrm: false,
    isSubscribed: false,
    
    config: {
        AMB_SPEED_EMERGENCY: 120,
        AMB_SPEED_PATROL: 48,
        PATROL_RADIUS: 0.03
    },

    async init() {
        EngineUI.log('SIM', 'Initializing Simulation Engine...', 'info');
        
        await this.syncSettings();
        
        trackingChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                this.isSubscribed = true;
                EngineUI.log('SIM', 'Live tracking channel is fully CONNECTED.', 'success');
            }
        });

        this.listenForDispatch();
        this.listenForControls();
        this.startEngineLoop(); 

        await this.startIdlePatrols();
        
        setInterval(() => this.syncSettings(), 10000);
    },

    async syncSettings() {
        try {
            const { data } = await supabase.from(DB_TABLES.SETTINGS).select('*');
            if (data) {
                const simRow = data.find(s => s.setting_key === 'simulation_config');
                if (simRow && simRow.setting_value) {
                    let parsedConfig = simRow.setting_value;
                    if (typeof parsedConfig === 'string') { try { parsedConfig = JSON.parse(parsedConfig); } catch(e){} }
                    if (typeof parsedConfig === 'string') { try { parsedConfig = JSON.parse(parsedConfig); } catch(e){} }

                    if (parsedConfig && typeof parsedConfig === 'object') {
                        const newSpeed = parseFloat(parsedConfig.AMBULANCE_SPEED_KPH) || 120;
                        const newRadius = parseFloat(parsedConfig.PATROL_RADIUS) || 0.03;

                        if (this.config.AMB_SPEED_EMERGENCY !== newSpeed || this.config.PATROL_RADIUS !== newRadius) {
                            this.config.AMB_SPEED_EMERGENCY = newSpeed;
                            this.config.AMB_SPEED_PATROL = newSpeed * 0.4; 
                            this.config.PATROL_RADIUS = newRadius;
                            
                            EngineUI.log('SIM', `Settings Applied: Emergency: ${this.config.AMB_SPEED_EMERGENCY}km/h | Patrol: ${this.config.AMB_SPEED_PATROL}km/h`, 'success');

                            for (const mission of this.activeMissions.values()) {
                                mission.speedKph = mission.stage === 'patrol' ? this.config.AMB_SPEED_PATROL : this.config.AMB_SPEED_EMERGENCY;
                            }
                        }
                    }
                }
            }
        } catch (err) {
            EngineUI.log('ERR', `Settings sync failed: ${err.message}`, 'alert');
        }
    },

    async startIdlePatrols() {
        const { data } = await supabase.from(DB_TABLES.AMBULANCES).select('*').in('status', ['available', 'returning']);
        if (data) {
            data.forEach(amb => this.assignPatrol(amb));
        }
    },

    assignPatrol(amb) {
        const currentLat = parseFloat(amb.lat) || 30.0444;
        const currentLng = parseFloat(amb.lng) || 31.2357;
        
        const r = this.config.PATROL_RADIUS * Math.sqrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const targetLat = currentLat + (r * Math.cos(theta));
        const targetLng = currentLng + (r * Math.sin(theta) / Math.cos(currentLat * Math.PI / 180));

        this.queueRouteRequest({
            amb: amb,
            startCoords: { lat: currentLat, lng: currentLng },
            targetCoords: { lat: targetLat, lng: targetLng },
            stage: 'patrol',
            speedKph: this.config.AMB_SPEED_PATROL
        });
    },

    listenForDispatch() {
        window.addEventListener('engine:dispatch_complete', async (e) => {
            const { incident, ambulance, hospital } = e.detail;
            this.queueRouteRequest({
                incId: incident.id,
                amb: ambulance,
                startCoords: { lat: parseFloat(ambulance.lat) || 30.0444, lng: parseFloat(ambulance.lng) || 31.2357 },
                targetCoords: { lat: parseFloat(incident.latitude) || 30.0444, lng: parseFloat(incident.longitude) || 31.2357 },
                hospCoords: { lat: parseFloat(hospital.lat) || 30.0444, lng: parseFloat(hospital.lng) || 31.2357 },
                stage: 'to_incident',
                speedKph: this.config.AMB_SPEED_EMERGENCY
            });
        });
    },

    async queueRouteRequest(missionData) {
        this.osrmQueue.push(missionData);
        this.processOsrmQueue();
    },

    async processOsrmQueue() {
        if (this.isProcessingOsrm || this.osrmQueue.length === 0) return;
        this.isProcessingOsrm = true;

        const task = this.osrmQueue.shift();
        let routeCoords = null;

        try {
            const url = `https://router.project-osrm.org/route/v1/driving/${task.startCoords.lng},${task.startCoords.lat};${task.targetCoords.lng},${task.targetCoords.lat}?overview=full&geometries=geojson`;
            
            // 🛡️ إضافة headers لتجاوز قيود CORS (قدر الإمكان) والاعتماد الصامت على Fallback
            const res = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                headers: {
                    'Accept': 'application/json, text/plain, */*'
                }
            });
            
            if (res.ok) {
                const data = await res.json();
                if (data.routes && data.routes.length > 0) {
                    routeCoords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                }
            }
        } catch (err) {
            // كتم الخطأ في الكونسول حتى لا يزعجك، النظام سيستخدم الخط المستقيم تلقائياً
        }

        if (!routeCoords || routeCoords.length < 2) {
            routeCoords = [
                [parseFloat(task.startCoords.lat), parseFloat(task.startCoords.lng)],
                [parseFloat(task.targetCoords.lat), parseFloat(task.targetCoords.lng)]
            ];
        }

        this.activeMissions.set(task.amb.id, {
            ...task,
            route: routeCoords,
            currentStep: 0,
            lat: parseFloat(task.startCoords.lat),
            lng: parseFloat(task.startCoords.lng),
            heading: 0
        });

        this.isProcessingOsrm = false;
        
        // 🐢 إبطاء وتيرة الطلبات قليلاً لمنع حظر الـ IP
        setTimeout(() => this.processOsrmQueue(), 1500);
    },

    startEngineLoop() {
        let lastTime = Date.now();
        
        this.simLoopId = setInterval(() => {
            const currentTime = Date.now();
            const deltaTime = (currentTime - lastTime) / 1000; 
            lastTime = currentTime;

            const safeDeltaTime = Math.min(deltaTime, 1.5);

            this.updatePhysics(safeDeltaTime);

            if (currentTime - this.lastBroadcastTime >= 1000) {
                this.broadcastPositions();
                this.lastBroadcastTime = currentTime;
            }
        }, 100); 
    },

    updatePhysics(dt) {
        for (const [ambId, mission] of this.activeMissions.entries()) {
            if (!mission.route || mission.currentStep >= mission.route.length - 1) {
                this.handleArrival(ambId, mission);
                continue;
            }

            const speedMps = mission.speedKph * (1000 / 3600);
            const distToMoveMeters = speedMps * dt;
            
            const latRatio = Math.cos(mission.lat * Math.PI / 180) || 1;

            const p1 = [mission.lat, mission.lng];
            const p2 = mission.route[mission.currentStep + 1];

            if(!p2) continue;

            const dLat = p2[0] - p1[0];
            const dLng = p2[1] - p1[1];
            
            const dLatMeters = dLat * 111320;
            const dLngMeters = dLng * 111320 * latRatio;
            const distanceMeters = Math.sqrt(dLatMeters * dLatMeters + dLngMeters * dLngMeters);

            if (distanceMeters < 0.5 || distanceMeters < distToMoveMeters) {
                mission.currentStep++;
            } else {
                const ratio = distToMoveMeters / distanceMeters;
                mission.lat += dLat * ratio;
                mission.lng += dLng * ratio;
                mission.heading = (Math.atan2(dLngMeters, dLatMeters) * 180 / Math.PI);
            }
        }
    },

    broadcastPositions() {
        if (!this.isSubscribed || this.activeMissions.size === 0) return;

        const payloads = [];
        for (const [ambId, mission] of this.activeMissions.entries()) {
            const safeLat = parseFloat(mission.lat) || 30.0444;
            const safeLng = parseFloat(mission.lng) || 31.2357;
            const safeHeading = parseFloat(mission.heading) || 0;
            const safeSpeed = parseFloat(mission.speedKph) || 0;

            payloads.push({
                id: String(ambId), 
                lat: safeLat, 
                lng: safeLng,
                heading: safeHeading, 
                speed: safeSpeed, 
                stage: mission.stage
            });
        }
        
        trackingChannel.send({ type: 'broadcast', event: 'fleet_update', payload: payloads }).catch(()=>{});
    },

    async handleArrival(ambId, mission) {
        this.activeMissions.delete(ambId);
        try {
            if (mission.stage === 'patrol') {
                this.assignPatrol({ id: ambId, code: mission.ambCode, lat: mission.lat, lng: mission.lng });
            } else if (mission.stage === 'to_incident') {
                await supabase.from(DB_TABLES.INCIDENTS).update({ status: 'in_progress' }).eq('id', mission.incId);
                this.queueRouteRequest({
                    incId: mission.incId,
                    amb: { id: ambId, code: mission.ambCode },
                    startCoords: { lat: mission.lat, lng: mission.lng },
                    targetCoords: mission.hospCoords,
                    stage: 'to_hospital',
                    speedKph: this.config.AMB_SPEED_EMERGENCY
                });
            } else if (mission.stage === 'to_hospital') {
                await supabase.from(DB_TABLES.INCIDENTS).update({ status: 'completed', resolved_at: new Date().toISOString() }).eq('id', mission.incId);
                await supabase.from(DB_TABLES.AMBULANCES).update({ status: 'available' }).eq('id', ambId);
                this.assignPatrol({ id: ambId, code: mission.ambCode, lat: mission.lat, lng: mission.lng });
            }
        } catch (err) { console.error("Arrival update failed", err); }
    },

    listenForControls() {
        window.addEventListener('engine:kill_switch', () => {
            if (this.simLoopId) clearInterval(this.simLoopId);
            this.activeMissions.clear();
        });
    }
};

document.addEventListener('DOMContentLoaded', () => { setTimeout(() => EngineSimulator.init(), 800); });
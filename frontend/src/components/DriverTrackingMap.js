import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { 
  Navigation, 
  Locate, 
  Layers, 
  ZoomIn, 
  ZoomOut,
  RefreshCw,
  Phone,
  MapPin,
  Clock,
  Package,
  Truck,
  User,
  Route,
  Target,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { useTranslation } from '../hooks/useTranslation';

import { API_URL } from '../utils/api';
const API = API_URL;

// خريطة تتبع السائقين المتقدمة
export default function DriverTrackingMap({ 
  drivers = [], 
  orders = [], 
  onDriverSelect,
  onOrderSelect,
  height = '600px',
  showControls = true,
  showDriverList = true,
  autoRefresh = true,
  refreshInterval = 15000
}) {
  const { t, isRTL } = useTranslation();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const routeLinesRef = useRef({});
  const destinationMarkersRef = useRef({});
  
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [mapStyle, setMapStyle] = useState('streets'); // streets, satellite, dark
  const [showRoutes, setShowRoutes] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [driverHistory, setDriverHistory] = useState({});
  const [showSidebar, setShowSidebar] = useState(true);

  // Map tile layers
  const tileLayers = {
    streets: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap'
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '© Esri'
    },
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '© CartoDB'
    }
  };

  // Initialize map
  useEffect(() => {
    const loadLeaflet = async () => {
      if (window.L) {
        initMap();
        return;
      }

      // Load CSS
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Load JS
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => initMap();
      document.head.appendChild(script);
    };

    const initMap = () => {
      if (!mapContainerRef.current || mapRef.current) return;

      const L = window.L;
      
      // Create map with custom options
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([33.3152, 44.3661], 13);
      
      // Add tile layer
      L.tileLayer(tileLayers[mapStyle].url, {
        attribution: tileLayers[mapStyle].attribution,
        maxZoom: 19
      }).addTo(map);

      // Add attribution in corner
      L.control.attribution({
        position: 'bottomleft',
        prefix: false
      }).addTo(map);

      mapRef.current = map;
      updateMarkers();
    };

    loadLeaflet();
    addCustomStyles();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update map style
  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    
    const L = window.L;
    
    // Remove old tile layer
    mapRef.current.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        mapRef.current.removeLayer(layer);
      }
    });
    
    // Add new tile layer
    L.tileLayer(tileLayers[mapStyle].url, {
      attribution: tileLayers[mapStyle].attribution,
      maxZoom: 19
    }).addTo(mapRef.current);
  }, [mapStyle]);

  // Update markers when drivers change
  useEffect(() => {
    updateMarkers();
  }, [drivers, orders, showRoutes]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      updateMarkers();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  // Add custom CSS styles
  const addCustomStyles = () => {
    if (document.getElementById('advanced-map-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'advanced-map-styles';
    style.textContent = `
      @keyframes pulse-ring {
        0% { transform: scale(1); opacity: 1; }
        100% { transform: scale(2); opacity: 0; }
      }
      
      @keyframes driver-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      
      .driver-marker-container {
        position: relative;
        width: 56px;
        height: 70px;
      }
      
      .driver-marker-pin {
        width: 48px;
        height: 48px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        border: 3px solid white;
        position: relative;
        z-index: 2;
      }
      
      .driver-marker-pin.available {
        background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      }
      
      .driver-marker-pin.busy {
        background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
        animation: driver-pulse 1.5s ease-in-out infinite;
      }
      
      .driver-marker-pin.offline {
        background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
      }
      
      .driver-marker-icon {
        transform: rotate(45deg);
      }
      
      .pulse-ring {
        position: absolute;
        top: 0;
        left: 0;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: 2px solid;
        animation: pulse-ring 2s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite;
        z-index: 1;
      }
      
      .pulse-ring.available { border-color: #22c55e; }
      .pulse-ring.busy { border-color: #f97316; }
      
      .driver-name-tag {
        position: absolute;
        bottom: -24px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
        z-index: 3;
      }
      
      .destination-marker {
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
        border: 2px solid white;
        animation: blink 1s ease-in-out infinite;
      }
      
      .route-line {
        stroke-dasharray: 10, 10;
        animation: dash 1s linear infinite;
      }
      
      @keyframes dash {
        to { stroke-dashoffset: -20; }
      }
      
      .leaflet-popup-content-wrapper {
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        padding: 0;
        overflow: hidden;
      }
      
      .leaflet-popup-content {
        margin: 0;
        width: 280px !important;
      }
      
      .leaflet-popup-tip {
        box-shadow: 0 3px 14px rgba(0,0,0,0.2);
      }
      
      .custom-popup-header {
        padding: 16px;
        background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
        color: white;
      }
      
      .custom-popup-body {
        padding: 16px;
        background: white;
      }
      
      .custom-popup-footer {
        padding: 12px 16px;
        background: #f9fafb;
        border-top: 1px solid #e5e7eb;
      }
    `;
    document.head.appendChild(style);
  };

  // Create driver marker
  const createDriverMarker = (driver) => {
    const L = window.L;
    const status = driver.current_order ? 'busy' : (driver.is_active ? 'available' : 'offline');
    
    const icon = L.divIcon({
      html: `
        <div class="driver-marker-container">
          <div class="pulse-ring ${status}"></div>
          <div class="driver-marker-pin ${status}">
            <svg class="driver-marker-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
              <circle cx="5" cy="17" r="2"/>
              <circle cx="19" cy="17" r="2"/>
              <path d="M12 17h7l-1.5-4.5"/>
              <path d="M5 17l1-4h6l2 4"/>
              <path d="M14 9l-2-4h-2"/>
              <circle cx="10" cy="5" r="1"/>
            </svg>
          </div>
          <div class="driver-name-tag">${driver.name}</div>
        </div>
      `,
      className: 'driver-marker-wrapper',
      iconSize: [56, 94],
      iconAnchor: [28, 70],
      popupAnchor: [0, -70]
    });

    return icon;
  };

  // Create destination marker
  const createDestinationMarker = () => {
    const L = window.L;
    
    return L.divIcon({
      html: `
        <div class="destination-marker">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
      `,
      className: 'destination-marker-wrapper',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });
  };

  // Create popup content
  const createPopupContent = (driver) => {
    const statusColors = {
      available: '#22c55e',
      busy: '#f97316',
      offline: '#6b7280'
    };
    
    const status = driver.current_order ? 'busy' : (driver.is_active ? 'available' : 'offline');
    const statusText = driver.current_order ? t('في مهمة توصيل') : (driver.is_active ? t('متاح') : t('غير متصل'));
    const orderText = t('طلب');
    const addressNotSet = t('عنوان التوصيل غير محدد');
    const todayOrdersText = t('طلبات اليوم');
    const lastUpdateText = t('آخر تحديث');
    const callText = t('اتصال');
    const trackText = t('تتبع');
    
    return `
      <div style="direction: rtl; font-family: 'Cairo', sans-serif;">
        <div class="custom-popup-header">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 48px; height: 48px; background: rgba(255,255,255,0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div style="flex: 1;">
              <h3 style="margin: 0; font-size: 18px; font-weight: 700;">${driver.name}</h3>
              <p style="margin: 4px 0 0; opacity: 0.8; font-size: 14px;">${driver.phone}</p>
            </div>
          </div>
          <div style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
            <span style="width: 10px; height: 10px; border-radius: 50%; background: ${statusColors[status]};"></span>
            <span style="font-size: 13px;">${statusText}</span>
          </div>
        </div>
        
        <div class="custom-popup-body">
          ${driver.current_order ? `
            <div style="background: #fef3c7; border-radius: 12px; padding: 12px; margin-bottom: 12px;">
              <div style="display: flex; align-items: center; gap: 8px; color: #92400e; font-weight: 600; margin-bottom: 8px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="1" y="3" width="15" height="13"/>
                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
                  <circle cx="5.5" cy="18.5" r="2.5"/>
                  <circle cx="18.5" cy="18.5" r="2.5"/>
                </svg>
                طلب #${driver.current_order.order_number}
              </div>
              <p style="margin: 0; font-size: 13px; color: #78350f;">
                ${driver.current_order.delivery_address || 'عنوان التوصيل غير محدد'}
              </p>
            </div>
          ` : ''}
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div style="background: #f3f4f6; border-radius: 8px; padding: 10px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #6b7280;">طلبات اليوم</p>
              <p style="margin: 4px 0 0; font-size: 20px; font-weight: 700; color: #111827;">${driver.today_orders || 0}</p>
            </div>
            <div style="background: #f3f4f6; border-radius: 8px; padding: 10px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #6b7280;">آخر تحديث</p>
              <p style="margin: 4px 0 0; font-size: 12px; font-weight: 600; color: #111827;">
                ${driver.location_updated_at 
                  ? new Date(driver.location_updated_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })
                  : '--:--'}
              </p>
            </div>
          </div>
        </div>
        
        <div class="custom-popup-footer" style="display: flex; gap: 8px;">
          <button 
            onclick="window.callDriver && window.callDriver('${driver.phone}')"
            style="flex: 1; padding: 10px; background: #22c55e; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72"/>
            </svg>
            اتصال
          </button>
          <button 
            onclick="window.focusDriver && window.focusDriver('${driver.id}')"
            style="flex: 1; padding: 10px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            تتبع
          </button>
        </div>
      </div>
    `;
  };

  // Update all markers
  const updateMarkers = useCallback(() => {
    if (!mapRef.current || !window.L) return;

    const L = window.L;
    const driversWithLocation = drivers.filter(d => d.location_lat && d.location_lng);

    // Clear old markers
    Object.values(markersRef.current).forEach(marker => {
      mapRef.current.removeLayer(marker);
    });
    Object.values(routeLinesRef.current).forEach(line => {
      mapRef.current.removeLayer(line);
    });
    Object.values(destinationMarkersRef.current).forEach(marker => {
      mapRef.current.removeLayer(marker);
    });
    
    markersRef.current = {};
    routeLinesRef.current = {};
    destinationMarkersRef.current = {};

    // Add driver markers
    driversWithLocation.forEach(driver => {
      const icon = createDriverMarker(driver);
      
      const marker = L.marker([driver.location_lat, driver.location_lng], { icon })
        .addTo(mapRef.current)
        .bindPopup(createPopupContent(driver), {
          maxWidth: 320,
          className: 'custom-driver-popup'
        });

      markersRef.current[driver.id] = marker;

      // Add route line if driver has current order with destination
      if (showRoutes && driver.current_order && driver.current_order.delivery_lat && driver.current_order.delivery_lng) {
        // Add destination marker
        const destIcon = createDestinationMarker();
        const destMarker = L.marker(
          [driver.current_order.delivery_lat, driver.current_order.delivery_lng], 
          { icon: destIcon }
        ).addTo(mapRef.current);
        
        destMarker.bindPopup(`
          <div style="direction: rtl; padding: 12px; font-family: 'Cairo', sans-serif;">
            <h4 style="margin: 0 0 8px; font-weight: 700;">وجهة التوصيل</h4>
            <p style="margin: 0; color: #666; font-size: 13px;">${driver.current_order.delivery_address || 'غير محدد'}</p>
            <p style="margin: 8px 0 0; color: #f97316; font-weight: 600;">طلب #${driver.current_order.order_number}</p>
          </div>
        `);
        
        destinationMarkersRef.current[driver.id] = destMarker;

        // Add route line
        const routeLine = L.polyline([
          [driver.location_lat, driver.location_lng],
          [driver.current_order.delivery_lat, driver.current_order.delivery_lng]
        ], {
          color: '#f97316',
          weight: 4,
          opacity: 0.8,
          dashArray: '10, 10',
          className: 'route-line'
        }).addTo(mapRef.current);

        routeLinesRef.current[driver.id] = routeLine;
      }
    });

    // Fit bounds if we have drivers
    if (driversWithLocation.length > 0) {
      const bounds = L.latLngBounds(
        driversWithLocation.map(d => [d.location_lat, d.location_lng])
      );
      mapRef.current.fitBounds(bounds, { padding: [80, 80], maxZoom: 15 });
    }
  }, [drivers, showRoutes]);

  // Map controls
  const zoomIn = () => mapRef.current?.zoomIn();
  const zoomOut = () => mapRef.current?.zoomOut();
  
  const centerOnDrivers = () => {
    if (!mapRef.current || !window.L) return;
    
    const driversWithLocation = drivers.filter(d => d.location_lat && d.location_lng);
    if (driversWithLocation.length === 0) return;
    
    const L = window.L;
    const bounds = L.latLngBounds(
      driversWithLocation.map(d => [d.location_lat, d.location_lng])
    );
    mapRef.current.fitBounds(bounds, { padding: [80, 80], maxZoom: 15 });
  };

  const focusOnDriver = (driverId) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver || !driver.location_lat || !driver.location_lng) return;
    
    mapRef.current?.setView([driver.location_lat, driver.location_lng], 16);
    setSelectedDriver(driver);
    
    // Open popup
    const marker = markersRef.current[driverId];
    if (marker) marker.openPopup();
  };

  // Global functions for popup buttons
  useEffect(() => {
    window.callDriver = (phone) => {
      window.location.href = `tel:${phone}`;
    };
    window.focusDriver = (driverId) => {
      focusOnDriver(driverId);
    };
    
    return () => {
      delete window.callDriver;
      delete window.focusDriver;
    };
  }, [drivers]);

  const driversWithLocation = drivers.filter(d => d.location_lat && d.location_lng);
  const busyDrivers = drivers.filter(d => d.current_order);
  const availableDrivers = drivers.filter(d => !d.current_order && d.is_active);

  return (
    <div className="relative flex" style={{ height }} dir="rtl">
      {/* Sidebar */}
      {showDriverList && (
        <div 
          className={`absolute right-0 top-0 bottom-0 z-20 bg-gray-900/95 backdrop-blur-lg transition-all duration-300 ${
            showSidebar ? 'w-80' : 'w-0'
          } overflow-hidden border-l border-gray-700`}
        >
          <div className="p-4 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">السائقين</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSidebar(false)}
                className="text-gray-400 hover:text-white"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-white">{drivers.length}</p>
                <p className="text-xs text-gray-400">الكل</p>
              </div>
              <div className="bg-green-500/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-400">{availableDrivers.length}</p>
                <p className="text-xs text-gray-400">متاح</p>
              </div>
              <div className="bg-orange-500/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-orange-400">{busyDrivers.length}</p>
                <p className="text-xs text-gray-400">مشغول</p>
              </div>
            </div>
            
            {/* Driver List */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {drivers.map(driver => {
                const hasLocation = driver.location_lat && driver.location_lng;
                const isBusy = !!driver.current_order;
                
                return (
                  <div
                    key={driver.id}
                    onClick={() => hasLocation && focusOnDriver(driver.id)}
                    className={`p-3 rounded-xl cursor-pointer transition-all ${
                      selectedDriver?.id === driver.id
                        ? 'bg-blue-500/30 border border-blue-500'
                        : 'bg-gray-800 hover:bg-gray-700 border border-transparent'
                    } ${!hasLocation ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        isBusy ? 'bg-orange-500/20' : 'bg-green-500/20'
                      }`}>
                        <Truck className={`h-5 w-5 ${isBusy ? 'text-orange-400' : 'text-green-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">{driver.name}</p>
                        <p className="text-xs text-gray-400">{driver.phone}</p>
                      </div>
                      {hasLocation ? (
                        <Badge className={isBusy ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}>
                          {isBusy ? 'مشغول' : 'متاح'}
                        </Badge>
                      ) : (
                        <Badge className="bg-gray-500/20 text-gray-400">بدون موقع</Badge>
                      )}
                    </div>
                    
                    {isBusy && driver.current_order && (
                      <div className="mt-2 p-2 bg-gray-900/50 rounded-lg">
                        <p className="text-xs text-gray-400">
                          <span className="text-orange-400 font-medium">طلب #{driver.current_order.order_number}</span>
                        </p>
                        <p className="text-xs text-gray-500 truncate mt-1">
                          {driver.current_order.delivery_address || 'بدون عنوان'}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {drivers.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <Truck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>لا يوجد سائقين</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Sidebar Toggle */}
      {showDriverList && !showSidebar && (
        <Button
          onClick={() => setShowSidebar(true)}
          className="absolute right-4 top-4 z-20 bg-gray-900/90 hover:bg-gray-800"
        >
          <ChevronLeft className="h-5 w-5 ml-2" />
          السائقين ({driversWithLocation.length})
        </Button>
      )}
      
      {/* Map Container */}
      <div 
        ref={mapContainerRef} 
        className="flex-1 bg-gray-800"
        style={{ marginRight: showSidebar && showDriverList ? '320px' : 0 }}
      />
      
      {/* Map Controls */}
      {showControls && (
        <div className="absolute left-4 top-4 z-10 space-y-2">
          {/* Zoom Controls */}
          <div className="bg-gray-900/90 backdrop-blur rounded-xl overflow-hidden shadow-lg">
            <Button
              variant="ghost"
              size="icon"
              onClick={zoomIn}
              className="w-10 h-10 text-white hover:bg-gray-700 rounded-none"
            >
              <ZoomIn className="h-5 w-5" />
            </Button>
            <div className="h-px bg-gray-700" />
            <Button
              variant="ghost"
              size="icon"
              onClick={zoomOut}
              className="w-10 h-10 text-white hover:bg-gray-700 rounded-none"
            >
              <ZoomOut className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Center Button */}
          <Button
            onClick={centerOnDrivers}
            className="w-10 h-10 bg-gray-900/90 backdrop-blur hover:bg-gray-800 shadow-lg"
            size="icon"
          >
            <Locate className="h-5 w-5" />
          </Button>
          
          {/* Map Style Selector */}
          <div className="bg-gray-900/90 backdrop-blur rounded-xl overflow-hidden shadow-lg">
            {['streets', 'satellite', 'dark'].map((style) => (
              <Button
                key={style}
                variant="ghost"
                size="icon"
                onClick={() => setMapStyle(style)}
                className={`w-10 h-10 rounded-none ${
                  mapStyle === style ? 'bg-blue-500/30 text-blue-400' : 'text-white hover:bg-gray-700'
                }`}
              >
                {style === 'streets' && <MapPin className="h-5 w-5" />}
                {style === 'satellite' && <Layers className="h-5 w-5" />}
                {style === 'dark' && <Target className="h-5 w-5" />}
              </Button>
            ))}
          </div>
          
          {/* Route Toggle */}
          <Button
            onClick={() => setShowRoutes(!showRoutes)}
            className={`w-10 h-10 backdrop-blur shadow-lg ${
              showRoutes ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-900/90 hover:bg-gray-800'
            }`}
            size="icon"
          >
            <Route className="h-5 w-5" />
          </Button>
        </div>
      )}
      
      {/* Legend */}
      <div className="absolute left-4 bottom-4 z-10 bg-gray-900/90 backdrop-blur rounded-xl p-3 shadow-lg">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-white">متاح ({availableDrivers.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-white">مشغول ({busyDrivers.length})</span>
          </div>
          {showRoutes && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-white">وجهة التوصيل</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center z-30">
          <RefreshCw className="h-8 w-8 text-white animate-spin" />
        </div>
      )}
    </div>
  );
}

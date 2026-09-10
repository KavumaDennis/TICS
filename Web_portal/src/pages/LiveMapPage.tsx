import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  MapPin,
  Navigation,
  Phone,
  MessageCircle,
  Car,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs } from 'firebase/firestore';
import { getFirebaseFirestore } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import L from 'leaflet';

// Fix Leaflet default icon issue with bundlers
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

interface LiveTraveler {
  travelerId: string;
  travelerName?: string;
  tripId: string;
  currentLat?: number;
  currentLng?: number;
  heading?: number;
  speed?: number;
  lastUpdate?: string;
  online: boolean;
  driverName?: string;
  destination?: string;
  rideStatus?: string;
  phone?: string;
}

export default function LiveMapPage() {
  const { operator } = useAuthStore();
  const [travelers, setTravelers] = useState<LiveTraveler[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTraveler, setSelectedTraveler] = useState<LiveTraveler | null>(null);
  const [stats, setStats] = useState({ active: 0, online: 0, inRide: 0 });
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Initialize Leaflet map
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [0.3136, 32.5811], // Default: Kampala, Uganda
        zoom: 8,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);
  
  // Store polylines for tracking routes
  const polylinesRef = useRef<Map<string, L.Polyline>>(new Map());

  // Fetch traveler data
  useEffect(() => {
    if (!operator?.uid) return;
    const db = getFirebaseFirestore();

    // Get all travelerOperators for this operator
    const q = query(
      collection(db, 'travelerOperators'),
      where('operatorId', '==', operator.uid),
      where('active', '==', true)
    );

    const unsub = onSnapshot(q, async (snap) => {
      const items: LiveTraveler[] = [];
      let activeCount = 0;
      let onlineCount = 0;
      let inRideCount = 0;

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const travelerId = data.travelerId || '';
        const tripId = data.tripId || '';

        const traveler: LiveTraveler = {
          travelerId,
          tripId,
          travelerName: data.travelerName || travelerId.slice(0, 8) || 'Unknown',
          online: false,
          rideStatus: 'none',
        };

        // Get traveler location from travelerLocations (last known GPS)
        try {
          const locDoc = await getDoc(doc(db, 'travelerLocations', travelerId));
          if (locDoc.exists()) {
            const loc = locDoc.data();
            traveler.currentLat = loc.lat;
            traveler.currentLng = loc.lng;
            traveler.heading = loc.heading;
            traveler.speed = loc.speed;
            const ts = loc.timestamp?.toMillis?.() || 0;
            traveler.online = (Date.now() - ts) < 300000; // 5 min threshold
            traveler.lastUpdate = ts ? new Date(ts).toLocaleTimeString() : 'N/A';
          }
        } catch {}

        // If no live GPS location, try to get trip destination as fallback location
        if (!traveler.currentLat && tripId) {
          try {
            const tripSnap = await getDoc(doc(db, 'trips', tripId));
            if (tripSnap.exists()) {
              const trip = tripSnap.data();
              // Try destination airport coordinates
              if (trip.destinationAirport?.lat && trip.destinationAirport?.lng) {
                traveler.currentLat = trip.destinationAirport.lat;
                traveler.currentLng = trip.destinationAirport.lng;
              }
            }
          } catch {}
        }

        // Get latest assignment for this traveler + trip
        try {
          const assignQ = query(
            collection(db, 'assignments'),
            where('travelerId', '==', travelerId),
            where('tripId', '==', tripId)
          );
          const assignSnap = await getDocs(assignQ);
          if (!assignSnap.empty) {
            const assign = assignSnap.docs[0].data();
            traveler.driverName = assign.driverName;
            traveler.destination = assign.destination || assign.pickupLocation;
            traveler.rideStatus = assign.status;
            traveler.phone = assign.driverPhone || assign.phone;
          }
        } catch {}

        activeCount++;
        if (traveler.online) onlineCount++;
        if (traveler.rideStatus && traveler.rideStatus !== 'none' && traveler.rideStatus !== 'completed') inRideCount++;

        items.push(traveler);
      }

      setTravelers(items);
      setStats({ active: activeCount, online: onlineCount, inRide: inRideCount });
      setLoading(false);

      // Update map markers
      updateMapMarkers(items);
    });

    return () => unsub();
  }, [operator?.uid]);

  function updateMapMarkers(travelersList: LiveTraveler[]) {
    const map = mapRef.current;
    if (!map) return;

    // Remove markers that are no longer present
    const currentIds = new Set(travelersList.map(t => t.travelerId));
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        map.removeLayer(marker);
        markersRef.current.delete(id);
      }
    });

    // Remove polylines that are no longer present
    polylinesRef.current.forEach((polyline, id) => {
      if (!currentIds.has(id)) {
        map.removeLayer(polyline);
        polylinesRef.current.delete(id);
      }
    });

    // Add/update markers and draw tracking lines
    const travelersWithLoc = travelersList.filter(t => t.currentLat && t.currentLng);
    travelersWithLoc.forEach((traveler) => {
      const id = traveler.travelerId;
      const lat = traveler.currentLat!;
      const lng = traveler.currentLng!;

      const statusColor = traveler.rideStatus === 'ride_started' || traveler.rideStatus === 'en_route'
        ? '#22C55E'
        : traveler.rideStatus === 'near_destination'
          ? '#F59E0B'
          : traveler.rideStatus === 'arrived'
            ? '#3B82F6'
            : '#8B5CF6';

      const markerHtml = `<div style="
        width: 24px; height: 24px;
        background: ${statusColor};
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        cursor: pointer;
      "></div>`;

      const icon = L.divIcon({
        html: markerHtml,
        className: 'custom-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      if (markersRef.current.has(id)) {
        const existing = markersRef.current.get(id)!;
        existing.setLatLng([lat, lng]);
        existing.setIcon(icon);
        existing.setPopupContent(`
          <div style="font-family: sans-serif; min-width: 180px;">
            <strong>${traveler.travelerName || 'Traveler'}</strong><br/>
            ${traveler.driverName ? `Driver: ${traveler.driverName}<br/>` : ''}
            ${traveler.destination ? `Destination: ${traveler.destination}<br/>` : ''}
            ${traveler.speed != null ? `Speed: ${(traveler.speed * 3.6).toFixed(0)} km/h<br/>` : ''}
            <span style="color:${traveler.online ? '#22C55E' : '#94A3B8'}">${traveler.online ? '● Live' : '○ Offline'}</span>
          </div>
        `);
      } else {
        const marker = L.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: sans-serif; min-width: 180px;">
              <strong>${traveler.travelerName || 'Traveler'}</strong><br/>
              ${traveler.driverName ? `Driver: ${traveler.driverName}<br/>` : ''}
              ${traveler.destination ? `Destination: ${traveler.destination}<br/>` : ''}
              ${traveler.speed != null ? `Speed: ${(traveler.speed * 3.6).toFixed(0)} km/h<br/>` : ''}
              <span style="color:${traveler.online ? '#22C55E' : '#94A3B8'}">${traveler.online ? '● Live' : '○ Offline'}</span>
            </div>
          `);
        markersRef.current.set(id, marker);
      }
      
      // Draw tracking polyline from traveler to destination if both exist
      if (traveler.currentLat && traveler.currentLng) {
        const polylineCoords: [number, number][] = [[traveler.currentLat, traveler.currentLng]];
        
        if (polylinesRef.current.has(id)) {
          // Update existing polyline
          const existingPoly = polylinesRef.current.get(id)!;
          existingPoly.setLatLngs(polylineCoords);
        }
      }
      
      // Draw destination marker if we have stored it
      if (traveler.destination && markersRef.current.get(id)?.getPopup()) {
        // Destination info is shown in popup - no separate dest marker needed here
      }
    });

    // Fit map bounds to show all markers
    if (travelersWithLoc.length > 0) {
      const group = L.featureGroup(Array.from(markersRef.current.values()));
      map.fitBounds(group.getBounds().pad(0.2));
    }
  }

  return (
    <div className="space-y-6 -mx-4 lg:-mx-6">
      {/* Header + Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Live Travelers Map</h1>
          <p className="text-gray-400 mt-1">Real-time location monitoring</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-400">{stats.online}</p>
            <p className="text-xs text-gray-500">Online</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-400">{stats.inRide}</p>
            <p className="text-xs text-gray-500">In Ride</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{stats.active}</p>
            <p className="text-xs text-gray-500">Active</p>
          </div>
        </div>
      </div>

      {/* Leaflet Map - Full span with more height */}
      <div className="w-full overflow-hidden" style={{ height: 'calc(100vh - 180px)', minHeight: '500px' }}>
        <div
          ref={mapContainerRef}
          className="w-full h-full"
        />
      </div>

      {/* Travelers list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-3 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : travelers.length === 0 ? (
        <div className="card text-center py-8">
          <Users className="w-10 h-10 mx-auto text-gray-600 mb-2" />
          <p className="text-gray-400">No travelers assigned</p>
        </div>
      ) : (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">
            All Travelers
            <span className="text-sm text-gray-500 font-normal ml-2">({travelers.length})</span>
          </h2>
          <div className="space-y-3">
            {travelers.map((traveler) => (
              <div
                key={traveler.travelerId}
                className="flex items-center justify-between p-3 rounded-xl bg-navy-700/30 hover:bg-navy-700/50 transition-colors cursor-pointer"
                onClick={() => setSelectedTraveler(
                  selectedTraveler?.travelerId === traveler.travelerId ? null : traveler
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-navy-700 flex items-center justify-center">
                      <Users className="w-5 h-5 text-gray-400" />
                    </div>
                    {traveler.online && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-navy-800" />
                    )}
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{traveler.travelerName}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                      {traveler.currentLat ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {traveler.currentLat.toFixed(3)}, {traveler.currentLng?.toFixed(3)}
                        </span>
                      ) : (
                        <span className="text-gray-600">No location</span>
                      )}
                      {traveler.speed != null && traveler.speed > 0 && (
                        <span>{(traveler.speed * 3.6).toFixed(0)} km/h</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {traveler.rideStatus && traveler.rideStatus !== 'none' && (
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      ['ride_started', 'en_route'].includes(traveler.rideStatus) ? 'bg-green-500/10 text-green-400' :
                      traveler.rideStatus === 'near_destination' ? 'bg-yellow-500/10 text-yellow-400' :
                      'bg-blue-500/10 text-blue-400'
                    }`}>
                      {traveler.rideStatus.replace('_', ' ')}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    traveler.online ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'
                  }`}>
                    {traveler.online ? '● Live' : '○ Off'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected traveler detail */}
      {selectedTraveler && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold">{selectedTraveler.travelerName}</h3>
            <button
              onClick={() => setSelectedTraveler(null)}
              className="text-gray-500 hover:text-white text-sm"
            >
              Close
            </button>
          </div>
          <div className="space-y-2 text-sm text-gray-400">
            {selectedTraveler.driverName && (
              <p className="flex items-center gap-2">
                <Car className="w-4 h-4 text-teal-400" />
                Driver: {selectedTraveler.driverName}
              </p>
            )}
            {selectedTraveler.destination && (
              <p className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-purple-400" />
                Destination: {selectedTraveler.destination}
              </p>
            )}
            {selectedTraveler.rideStatus && (
              <p className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-blue-400" />
                Status: <span className="capitalize">{selectedTraveler.rideStatus.replace('_', ' ')}</span>
              </p>
            )}
            {selectedTraveler.currentLat && (
              <p className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-500" />
                Location: {selectedTraveler.currentLat.toFixed(4)}, {selectedTraveler.currentLng?.toFixed(4)}
              </p>
            )}
            {selectedTraveler.speed != null && (
              <p className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-gray-500" />
                Speed: {(selectedTraveler.speed * 3.6).toFixed(1)} km/h
              </p>
            )}
            {selectedTraveler.lastUpdate && (
              <p className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500" />
                Last update: {selectedTraveler.lastUpdate}
              </p>
            )}
          </div>
          <div className="flex gap-2 mt-4 pt-3 border-t border-navy-700/50">
            <Link
              to={`/travelers/${selectedTraveler.tripId}`}
              className="flex-1 text-center py-2 px-3 rounded-lg bg-teal-600/10 text-teal-400 text-sm hover:bg-teal-600/20 transition-colors"
            >
              View Profile
            </Link>
            {selectedTraveler.phone && (
              <a
                href={`tel:${selectedTraveler.phone}`}
                className="flex items-center justify-center gap-1 flex-1 py-2 px-3 rounded-lg bg-blue-600/10 text-blue-400 text-sm hover:bg-blue-600/20 transition-colors"
              >
                <Phone className="w-4 h-4" /> Call
              </a>
            )}
            {selectedTraveler.phone && (
              <a
                href={`https://wa.me/${selectedTraveler.phone.replace(/[^\d]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 flex-1 py-2 px-3 rounded-lg bg-green-600/10 text-green-400 text-sm hover:bg-green-600/20 transition-colors"
              >
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
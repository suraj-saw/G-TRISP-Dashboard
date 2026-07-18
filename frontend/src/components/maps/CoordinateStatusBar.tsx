/**
 * @file CoordinateStatusBar.tsx
 * @description An overlay UI component that displays the current latitude, longitude, and (optionally) zoom level of the map pointer.
 * @responsibility Attaches listeners to Maplibre's `mousemove`, `zoomend`, and `mouseleave` events to update the status bar in real time.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useMap } from "react-map-gl/maplibre";

/**
 * CoordinateStatusBar Component
 * @state_management Maintains `coordinates` (current lat/lng/zoom) and a `lastValidCoords` ref to restore position when the mouse leaves the map bounds.
 * @hooks_usage Uses `useMap` to access the global Maplibre instance, `useCallback` for initialization, and `useEffect` to manage event listeners.
 */
export default function CoordinateStatusBar() {
  const { current: mapRef } = useMap();
  const [coordinates, setCoordinates] = useState({
    lat: 0,
    lng: 0,
    zoom: 0,
  });
  const lastValidCoords = useRef(coordinates);

  const initializeCoordinates = useCallback((map: any) => {
    const initialCenter = map.getCenter();
    const initialZoom = map.getZoom();
    const initialCoords = {
      lat: initialCenter.lat,
      lng: initialCenter.lng,
      zoom: initialZoom,
    };
    setCoordinates(initialCoords);
    lastValidCoords.current = initialCoords;
  }, []);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const handleMouseMove = (e: any) => {
      const newCoords = {
        lat: e.lngLat.lat,
        lng: e.lngLat.lng,
        zoom: map.getZoom(),
      };
      setCoordinates(newCoords);
      lastValidCoords.current = newCoords;
    };

    const handleZoomEnd = () => {
      setCoordinates((prev) => ({
        ...prev,
        zoom: map.getZoom(),
      }));
      lastValidCoords.current = {
        ...lastValidCoords.current,
        zoom: map.getZoom(),
      };
    };

    const handleMouseLeave = () => {
      setCoordinates(lastValidCoords.current);
    };

    map.on("mousemove", handleMouseMove);
    map.on("zoomend", handleZoomEnd);
    map.on("mouseleave", handleMouseLeave);

    initializeCoordinates(map);

    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("zoomend", handleZoomEnd);
      map.off("mouseleave", handleMouseLeave);
    };
  }, [mapRef, initializeCoordinates]);

  return (
    <div className="absolute bottom-1 left-2 z-10 pointer-events-none">
      <div className="bg-white/90 backdrop-blur-sm border border-slate-200 shadow-md rounded-lg px-3 py-1.5 flex items-center gap-3 text-[11px] font-medium text-slate-600">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-slate-700">Lat:</span>
          <span>{coordinates.lat.toFixed(6)}</span>
        </div>
        <div className="w-px h-4 bg-slate-200" />
        <div className="flex items-center gap-1">
          <span className="font-semibold text-slate-700">Lng:</span>
          <span>{coordinates.lng.toFixed(6)}</span>
        </div>
        {/* <div className="w-px h-4 bg-slate-200" /> */}
        {/* <div className="flex items-center gap-1">
          <span className="font-semibold text-slate-700">Zoom:</span>
          <span>{coordinates.zoom.toFixed(2)}</span>
        </div> */}
      </div>
    </div>
  );
}
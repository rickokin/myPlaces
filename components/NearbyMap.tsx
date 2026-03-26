"use client";

import { useState, useCallback } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  Pin,
  useMap,
} from "@vis.gl/react-google-maps";
import { PlaceResult } from "@/app/api/restaurants/route";

interface Props {
  restaurants: PlaceResult[];
  userCoords: { lat: number; lng: number };
}

interface SelectedPlace {
  restaurant: PlaceResult;
  rank: number;
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export default function NearbyMap({ restaurants, userCoords }: Props) {
  const [selected, setSelected] = useState<SelectedPlace | null>(null);

  return (
    <APIProvider apiKey={API_KEY}>
      <div
        className="rounded-xl overflow-hidden border border-gray-200 shadow-sm"
        style={{ height: "calc(100vh - 260px)", minHeight: 400 }}
      >
        <Map
          defaultCenter={userCoords}
          defaultZoom={16}
          mapId="nearby-eats-map"
          gestureHandling="greedy"
          disableDefaultUI={false}
          clickableIcons={false}
        >
          <MapContent
            restaurants={restaurants}
            userCoords={userCoords}
            selected={selected}
            onSelect={setSelected}
          />
        </Map>
      </div>
    </APIProvider>
  );
}

interface MapContentProps extends Props {
  selected: SelectedPlace | null;
  onSelect: (place: SelectedPlace | null) => void;
}

function MapContent({ restaurants, userCoords, selected, onSelect }: MapContentProps) {
  const map = useMap();

  const handleMarkerClick = useCallback(
    (restaurant: PlaceResult, rank: number) => {
      const isAlreadySelected = selected?.restaurant.place_id === restaurant.place_id;
      if (isAlreadySelected) {
        onSelect(null);
        return;
      }
      onSelect({ restaurant, rank });
      if (map) {
        map.panTo({
          lat: restaurant.geometry.location.lat,
          lng: restaurant.geometry.location.lng,
        });
      }
    },
    [map, selected, onSelect]
  );

  const handleClose = useCallback(() => onSelect(null), [onSelect]);

  const directionsUrl = selected
    ? `https://www.google.com/maps/dir/?api=1&destination=${selected.restaurant.geometry.location.lat},${selected.restaurant.geometry.location.lng}&destination_place_id=${selected.restaurant.place_id}`
    : "";

  return (
    <>
      {/* User location marker */}
      <AdvancedMarker position={userCoords} title="You are here" zIndex={10}>
        <div className="relative flex items-center justify-center">
          <div className="w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-md" />
          <div className="absolute w-10 h-10 rounded-full bg-blue-400 opacity-25 animate-ping" />
        </div>
      </AdvancedMarker>

      {/* Restaurant markers */}
      {restaurants.map((r, i) => {
        const isSelected = selected?.restaurant.place_id === r.place_id;
        return (
          <AdvancedMarker
            key={r.place_id}
            position={{ lat: r.geometry.location.lat, lng: r.geometry.location.lng }}
            title={r.name}
            onClick={() => handleMarkerClick(r, i + 1)}
            zIndex={isSelected ? 5 : 1}
          >
            <Pin
              background={isSelected ? "#1d4ed8" : "#dc2626"}
              glyphColor="#ffffff"
              borderColor={isSelected ? "#1e3a8a" : "#991b1b"}
              glyph={String(i + 1)}
              scale={isSelected ? 1.3 : 1}
            />
          </AdvancedMarker>
        );
      })}

      {/* Info window for the selected restaurant */}
      {selected && (
        <InfoWindow
          position={{
            lat: selected.restaurant.geometry.location.lat,
            lng: selected.restaurant.geometry.location.lng,
          }}
          onClose={handleClose}
          pixelOffset={[0, -50]}
          shouldFocus={false}
        >
          <div className="p-1 max-w-[220px]">
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center">
                {selected.rank}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 text-sm leading-tight">
                  {selected.restaurant.name}
                </p>
                {selected.restaurant.rating && (
                  <p className="text-xs text-amber-600 font-medium mt-0.5">
                    ★ {selected.restaurant.rating.toFixed(1)}
                    {selected.restaurant.user_ratings_total && (
                      <span className="text-gray-400 font-normal">
                        {" "}({selected.restaurant.user_ratings_total.toLocaleString()})
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {selected.restaurant.vicinity && (
              <p className="text-xs text-gray-600 mb-2 leading-snug">
                {selected.restaurant.vicinity}
              </p>
            )}

            {selected.restaurant.opening_hours !== undefined && (
              <p
                className={`text-xs font-medium mb-2 ${
                  selected.restaurant.opening_hours.open_now
                    ? "text-green-600"
                    : "text-red-500"
                }`}
              >
                {selected.restaurant.opening_hours.open_now ? "Open now" : "Closed"}
              </p>
            )}

            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 w-full text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md px-3 py-1.5 transition-colors no-underline"
            >
              <DirectionsIcon />
              Get Directions
            </a>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function DirectionsIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
      />
    </svg>
  );
}

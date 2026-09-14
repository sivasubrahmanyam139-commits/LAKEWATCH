import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { divIcon } from "leaflet";
import hyderabadRoadsUrl from "./data/hyderabad-roads.geojson?url";


import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  useMap,
  GeoJSON,
  Polyline,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import "./App.css";


const HYDERABAD_CENTER = [17.385, 78.4867];
const HYDERABAD_BOUNDS = [
  [17.2, 78.2],
  [17.6, 78.7],
];
const SATELLITE_DATE = new Date(
  Date.now() - 2 * 24 * 60 * 60 * 1000
).toISOString().slice(0, 10);
const NASA_GIBS_TILE_URL =
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${SATELLITE_DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;

const INITIAL_DEMO_REPORTS = [
  {
    id: "demo-1",
    type: "Waterlogged Road",
    issue_type: "Waterlogged Road",
    location: "Gachibowli Flyover",
    latitude: 17.4436,
    longitude: 78.3520,
    severity: "HIGH",
    description: "Deep waterlogging on main road near flyover pillar 12. Water depth approx 1.5 ft.",
    status: "Reported",
    position: [17.4436, 78.3520],
    isDemo: true,
  },
  {
    id: "demo-2",
    type: "Blocked Drain",
    issue_type: "Blocked Drain",
    location: "Gachibowli Main Road",
    latitude: 17.4442,
    longitude: 78.3525,
    severity: "MEDIUM",
    description: "Stormwater drain clogged with debris causing road overflow.",
    status: "Reported",
    position: [17.4442, 78.3525],
    isDemo: true,
  },
  {
    id: "demo-3",
    type: "Waterlogged Road",
    issue_type: "Waterlogged Road",
    location: "Madhapur Main Road",
    latitude: 17.4486,
    longitude: 78.3908,
    severity: "MEDIUM",
    description: "Waterlogging near Metro station entrance.",
    status: "Reported",
    position: [17.4486, 78.3908],
    isDemo: true,
  },
  {
    id: "demo-4",
    type: "Waterlogged Road",
    issue_type: "Waterlogged Road",
    location: "Begumpet Underpass",
    latitude: 17.4375,
    longitude: 78.4683,
    severity: "HIGH",
    description: "Severe flooding under railway bridge, traffic halted.",
    status: "Reported",
    position: [17.4375, 78.4683],
    isDemo: true,
  },
  {
    id: "demo-5",
    type: "Open Drain Cover",
    issue_type: "Open Drain Cover",
    location: "Kukatpally Housing Board",
    latitude: 17.4849,
    longitude: 78.3888,
    severity: "LOW",
    description: "Manhole cover displaced on side lane.",
    status: "Reported",
    position: [17.4849, 78.3888],
    isDemo: true,
  },
];

function isWithinHyderabad(latitude, longitude) {
  return (
    latitude >= HYDERABAD_BOUNDS[0][0] &&
    latitude <= HYDERABAD_BOUNDS[1][0] &&
    longitude >= HYDERABAD_BOUNDS[0][1] &&
    longitude <= HYDERABAD_BOUNDS[1][1]
  );
}


function MapViewController({
  mapView,
  keepHyderabadBounds,
  routeCoordinates,
}) {
  const map = useMap();

  useEffect(() => {
    map.setMaxBounds(
      keepHyderabadBounds ? HYDERABAD_BOUNDS : null
    );
    if (routeCoordinates?.length > 1) {
      map.fitBounds(
        routeCoordinates.map(([longitude, latitude]) => [
          latitude,
          longitude,
        ]),
        { padding: [40, 40] }
      );
    } else {
      map.setView(mapView.center, mapView.zoom);
    }
  }, [keepHyderabadBounds, map, mapView, routeCoordinates]);

  return null;
}


function getReportRoadStatus(severity) {
  if (severity === "HIGH") {
    return "BLOCKED (reported / prototype)";
  }

  if (severity === "MEDIUM") {
    return "CAUTION / PASSABLE WITH CAUTION";
  }

  return "PASSABLE";
}


function createReportIcon(severity) {
  const sevClass = String(severity || "MEDIUM").toLowerCase();
  const label = `⚠️ ${severity} Warning`;
  return divIcon({
    className: "report-marker-icon",
    html: `<div class="report-marker-badge single ${sevClass}">${label}</div>`,
    iconSize: [120, 30],
    iconAnchor: [60, 15],
    popupAnchor: [0, -15],
  });
}


function groupReportsIntoClusters(reportsList, threshold = 0.004) {
  const clusters = [];
  const visited = new Set();

  reportsList.forEach((report, i) => {
    if (visited.has(report.id)) return;

    const clusterReports = [report];
    visited.add(report.id);

    reportsList.forEach((otherReport, j) => {
      if (i === j || visited.has(otherReport.id)) return;

      const distSq =
        (report.latitude - otherReport.latitude) ** 2 +
        (report.longitude - otherReport.longitude) ** 2;

      if (distSq <= threshold ** 2) {
        clusterReports.push(otherReport);
        visited.add(otherReport.id);
      }
    });

    const avgLat =
      clusterReports.reduce((sum, r) => sum + r.latitude, 0) /
      clusterReports.length;
    const avgLng =
      clusterReports.reduce((sum, r) => sum + r.longitude, 0) /
      clusterReports.length;

    const severityCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    clusterReports.forEach((r) => {
      const sev = String(r.severity).toUpperCase();
      if (sev === "HIGH") severityCounts.HIGH += 1;
      else if (sev === "MEDIUM") severityCounts.MEDIUM += 1;
      else severityCounts.LOW += 1;
    });

    let highestSeverity = "LOW";
    if (severityCounts.HIGH > 0) highestSeverity = "HIGH";
    else if (severityCounts.MEDIUM > 0) highestSeverity = "MEDIUM";

    const issueTypes = [
      ...new Set(
        clusterReports.map((r) => r.issue_type || r.type || "Waterlogged Road")
      ),
    ];

    clusters.push({
      id: `cluster-${report.id}-${clusterReports.length}`,
      center: [avgLat, avgLng],
      reports: clusterReports,
      count: clusterReports.length,
      highestSeverity,
      severityCounts,
      issueTypes,
      locationName: report.location || "Reported Location",
    });
  });

  return clusters;
}


function createReportClusterIcon(cluster) {
  const sevClass = cluster.highestSeverity.toLowerCase();
  const label =
    cluster.count > 1
      ? `👥 ${cluster.count} people reported this`
      : `👤 1 Community Report`;

  const extraClass = cluster.count > 1 ? "cluster" : "single";

  return divIcon({
    className: "report-marker-icon",
    html: `<div class="report-marker-badge ${extraClass} ${sevClass}">${label}</div>`,
    iconSize: [cluster.count > 1 ? 165 : 135, 32],
    iconAnchor: [cluster.count > 1 ? 82 : 67, 16],
    popupAnchor: [0, -16],
  });
}


function renderClusterPopup(cluster) {
  const title =
    cluster.count > 1
      ? `👥 ${cluster.count} People Reported a Problem Here`
      : `👤 Community Member Report`;

  const roadStatusText = getReportRoadStatus(cluster.highestSeverity);

  const sevBreakdown = [];
  if (cluster.severityCounts.HIGH > 0) {
    sevBreakdown.push(
      `<span style="color:#dc2626; font-weight:bold;">${cluster.severityCounts.HIGH} HIGH</span>`
    );
  }
  if (cluster.severityCounts.MEDIUM > 0) {
    sevBreakdown.push(
      `<span style="color:#d97706; font-weight:bold;">${cluster.severityCounts.MEDIUM} MEDIUM</span>`
    );
  }
  if (cluster.severityCounts.LOW > 0) {
    sevBreakdown.push(
      `<span style="color:#16a34a; font-weight:bold;">${cluster.severityCounts.LOW} LOW</span>`
    );
  }

  const reportsListHtml = cluster.reports
    .map((r) => {
      const desc = r.description
        ? `<br/><span style="color:#475467; font-style:italic;">"${r.description}"</span>`
        : "";
      return `<div style="margin-top:6px; padding:6px 8px; background:#f8fafc; border-radius:6px; border-left:3px solid ${
        r.severity === "HIGH"
          ? "#dc2626"
          : r.severity === "MEDIUM"
          ? "#f59e0b"
          : "#16a34a"
      }; font-size:12px;">
        <strong>${r.type || r.issue_type}</strong> (${r.severity}) • <em>${
        r.location
      }</em>
        ${desc}
      </div>`;
    })
    .join("");

  return `
    <div style="min-width:240px; max-width:320px; font-family: system-ui, -apple-system, sans-serif;">
      <div style="font-size:14px; font-weight:700; color:#0f172a; border-bottom:1px solid #e2e8f0; padding-bottom:6px; margin-bottom:6px;">
        ${title}
      </div>
      <div style="font-size:12px; margin-bottom:4px;">
        📍 <strong>Location:</strong> ${cluster.locationName}
      </div>
      <div style="font-size:12px; margin-bottom:4px;">
        🚦 <strong>Road status:</strong> ${roadStatusText}
      </div>
      <div style="font-size:12px; margin-bottom:4px;">
        ⚠️ <strong>Issue types:</strong> ${cluster.issueTypes.join(", ")}
      </div>
      <div style="font-size:12px; margin-bottom:8px;">
        📊 <strong>Severity breakdown:</strong> ${sevBreakdown.join(", ")}
      </div>
      <div style="font-size:12px; font-weight:600; color:#334155; margin-bottom:4px;">
        Detailed Community Reports (${cluster.count}):
      </div>
      <div style="max-height:160px; overflow-y:auto; padding-right:2px;">
        ${reportsListHtml}
      </div>
    </div>
  `;
}




// ------------------------------------
// MAP LOCATION PICKER
// ------------------------------------

function LocationPicker({ onSelect }) {
  useMapEvents({
    click(e) {
      onSelect([e.latlng.lat, e.latlng.lng]);
    },
  });

  return null;
}


// ------------------------------------
// MAIN APP
// ------------------------------------

function App() {

  const hyderabad = HYDERABAD_CENTER;
  const rawApiUrl = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").trim();
  const apiBaseUrl = rawApiUrl.endsWith("/") ? rawApiUrl.slice(0, -1) : rawApiUrl;


  // ------------------------------------
  // WEATHER
  // ------------------------------------

  const [rainfall, setRainfall] = useState(0);
  const [rainProbability, setRainProbability] = useState(0);

  useEffect(() => {

    fetch(`${apiBaseUrl}/weather`)

      .then((response) => response.json())

      .then((data) => {

        setRainfall(data.next_6_hours_rain);
        setRainProbability(data.rain_probability);

        console.log(
          "Next 6 hours rain:",
          data.next_6_hours_rain
        );

      })

      .catch((error) => {

        console.error(
          "Weather connection failed:",
          error
        );

      });

  }, [apiBaseUrl]);


  // ------------------------------------
  // DESTINATION WEATHER
  // ------------------------------------

  const [destinationQuery, setDestinationQuery] = useState("");
  const [destinationResults, setDestinationResults] = useState([]);
  const [destinationWeather, setDestinationWeather] = useState(null);
  const [destinationName, setDestinationName] = useState("");
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [destinationStatus, setDestinationStatus] = useState("");
  const [isSearchingDestination, setIsSearchingDestination] =
    useState(false);
  const [isLoadingDestinationWeather, setIsLoadingDestinationWeather] =
    useState(false);
  const [mapView, setMapView] = useState({
    center: hyderabad,
    zoom: 12,
  });
  const [mapMode, setMapMode] = useState("street");
  const [satelliteStatus, setSatelliteStatus] = useState("");
  const weatherCache = useRef(new Map());

  // ------------------------------------
  // ROUTE PLANNING
  // ------------------------------------

  const [routeStartQuery, setRouteStartQuery] = useState("");
  const [routeEndQuery, setRouteEndQuery] = useState("");
  const [routeStartResults, setRouteStartResults] = useState([]);
  const [routeEndResults, setRouteEndResults] = useState([]);
  const [routeStart, setRouteStart] = useState(null);
  const [routeEnd, setRouteEnd] = useState(null);
  const [routeRoutes, setRouteRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [recommendedRouteId, setRecommendedRouteId] = useState(null);
  const [routeStatus, setRouteStatus] = useState("");
  const [isSearchingRoute, setIsSearchingRoute] = useState(false);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  function getPlaceLabel(place) {
    return [place.name, place.state, place.country]
      .filter(Boolean)
      .join(", ");
  }

  async function getCachedWeather(latitude, longitude) {
    const key = `${Number(latitude).toFixed(4)},${Number(longitude).toFixed(4)}`;
    const cachedWeather = weatherCache.current.get(key);

    if (cachedWeather) {
      return cachedWeather;
    }

    const response = await fetch(
      `${apiBaseUrl}/weather?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`
    );

    if (!response.ok) {
      throw new Error("Weather request failed");
    }

    const weather = await response.json();
    weatherCache.current.set(key, weather);
    return weather;
  }

  async function loadDestinationWeather(
    latitude,
    longitude,
    name,
    isCurrentLocation = false
  ) {
    if (!Number.isFinite(Number(latitude)) ||
      !Number.isFinite(Number(longitude))) {
      setDestinationStatus("This location has invalid coordinates.");
      return;
    }

    const destination = {
      name,
      latitude: Number(latitude),
      longitude: Number(longitude),
      weather: null,
      isCurrentLocation,
    };

    setIsLoadingDestinationWeather(true);
    setDestinationStatus("");
    setDestinationName(name);
    setSelectedDestination(destination);
    setMapView({
      center: [destination.latitude, destination.longitude],
      zoom: isWithinHyderabad(destination.latitude, destination.longitude)
        ? 13
        : 11,
    });

    try {
      const data = await getCachedWeather(latitude, longitude);

      setDestinationWeather(data);
      setSelectedDestination({
        ...destination,
        weather: data,
      });
    } catch (error) {
      console.error("Destination weather request failed:", error);
      setDestinationWeather(null);
      setDestinationStatus(
        "We could not load weather for this location. Please try again."
      );
    } finally {
      setIsLoadingDestinationWeather(false);
    }
  }

  async function searchDestination(event) {
    event.preventDefault();

    const place = destinationQuery.trim();

    if (!place) {
      setDestinationResults([]);
      setDestinationWeather(null);
      setDestinationStatus("Enter a destination to search.");
      return;
    }

    setIsSearchingDestination(true);
    setDestinationResults([]);
    setDestinationWeather(null);
    setDestinationStatus("");

    try {
      const response = await fetch(
        `${apiBaseUrl}/geocode?place=${encodeURIComponent(place)}`
      );

      if (!response.ok) {
        throw new Error("Destination search failed");
      }

      const data = await response.json();
      const results = data.results || [];

      setDestinationResults(results);

      if (results.length === 0) {
        setDestinationStatus("No matching destinations were found.");
      }
    } catch (error) {
      console.error("Destination search failed:", error);
      setDestinationStatus(
        "We could not search destinations right now. Please try again."
      );
    } finally {
      setIsSearchingDestination(false);
    }
  }

  function selectDestination(place) {
    setDestinationResults([]);
    loadDestinationWeather(
      place.latitude,
      place.longitude,
      getPlaceLabel(place),
      false
    );
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setDestinationStatus(
        "Location services are not available in this browser."
      );
      return;
    }

    setDestinationResults([]);
    setDestinationWeather(null);
    setDestinationStatus("Requesting your location permission…");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        loadDestinationWeather(
          position.coords.latitude,
          position.coords.longitude,
          "Your current location",
          true
        );
      },
      (error) => {
        console.error("Location request failed:", error);
        setDestinationStatus(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. You can search for a destination instead."
            : "We could not get your location. Please try again or search for a destination."
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  }

  async function searchRouteLocation(field) {
    const query = field === "start"
      ? routeStartQuery.trim()
      : routeEndQuery.trim();

    if (!query) {
      setRouteStatus(`Enter a ${field === "start" ? "starting location" : "destination"} to search.`);
      return;
    }

    setIsSearchingRoute(true);
    setRouteStatus("");

    try {
      const response = await fetch(
        `${apiBaseUrl}/geocode?place=${encodeURIComponent(query)}`
      );

      if (!response.ok) {
        throw new Error("Route location search failed");
      }

      const data = await response.json();
      const results = data.results || [];

      if (field === "start") {
        setRouteStartResults(results);
      } else {
        setRouteEndResults(results);
      }

      if (results.length === 0) {
        setRouteStatus("No matching locations were found.");
      }
    } catch (error) {
      console.error("Route location search failed:", error);
      setRouteStatus("We could not search locations right now. Please try again.");
    } finally {
      setIsSearchingRoute(false);
    }
  }

  async function selectRouteLocation(place, field) {
    const location = {
      name: getPlaceLabel(place),
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      weather: null,
      isCurrentLocation: false,
    };

    if (field === "start") {
      setRouteStartResults([]);
      setRouteStart(location);
    } else {
      setRouteEndResults([]);
      setRouteEnd(location);
      setDestinationName(location.name);
      setDestinationWeather(null);
      setSelectedDestination(location);
      setMapView({
        center: [location.latitude, location.longitude],
        zoom: isWithinHyderabad(location.latitude, location.longitude)
          ? 13
          : 11,
      });
    }

    try {
      const weather = await getCachedWeather(
        location.latitude,
        location.longitude
      );
      const locationWithWeather = { ...location, weather };

      if (field === "start") {
        setRouteStart(locationWithWeather);
      } else {
        setRouteEnd(locationWithWeather);
        setDestinationWeather(weather);
        setSelectedDestination(locationWithWeather);
      }
    } catch (error) {
      console.error("Route weather request failed:", error);
      setRouteStatus("Location selected, but its weather could not be loaded.");
    }
  }

  function useMyLocationForRoute() {
    if (!navigator.geolocation) {
      setRouteStatus("Location services are not available in this browser.");
      return;
    }

    setRouteStatus("Requesting your location permission...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const location = {
          name: "Your current location",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          weather: null,
          isCurrentLocation: true,
        };

        setRouteStart(location);
        setRouteStatus("");

        try {
          const weather = await getCachedWeather(
            location.latitude,
            location.longitude
          );
          setRouteStart({ ...location, weather });
        } catch (error) {
          console.error("Route start weather request failed:", error);
          setRouteStatus("Your location was selected, but its weather could not be loaded.");
        }
      },
      (error) => {
        setRouteStatus(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Search for a starting location instead."
            : "We could not get your location. Please search for a starting location instead."
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  function distanceInKilometres(latitudeA, longitudeA, latitudeB, longitudeB) {
    const toRadians = (value) => value * Math.PI / 180;
    const earthRadiusKm = 6371;
    const latitudeDelta = toRadians(latitudeB - latitudeA);
    const longitudeDelta = toRadians(longitudeB - longitudeA);
    const calculation =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;

    return earthRadiusKm * 2 * Math.atan2(
      Math.sqrt(calculation),
      Math.sqrt(1 - calculation)
    );
  }

  function analyseRouteReports(route) {
    const nearbyReports = reports.filter((report) =>
      route.geometry.coordinates.some(([longitude, latitude]) =>
        distanceInKilometres(
          report.position[0],
          report.position[1],
          latitude,
          longitude
        ) <= 0.3
      )
    );

    const severityCounts = nearbyReports.reduce(
      (counts, report) => ({
        ...counts,
        [report.severity]: counts[report.severity] + 1,
      }),
      { HIGH: 0, MEDIUM: 0, LOW: 0 }
    );

    const blockedReports = nearbyReports.filter(
      (report) => report.severity === "HIGH"
    );

    return {
      reports: nearbyReports,
      blockedReports,
      blockedPrototype: blockedReports.length > 0,
      severityCounts,
      evidenceScore:
        severityCounts.HIGH * 100 +
        severityCounts.MEDIUM * 15 +
        severityCounts.LOW * 3,
    };
  }

  function formatDistance(distanceMetres) {
    return distanceMetres >= 1000
      ? `${(distanceMetres / 1000).toFixed(1)} km`
      : `${Math.round(distanceMetres)} m`;
  }

  function formatDuration(durationSeconds) {
    const minutes = Math.round(durationSeconds / 60);
    return minutes >= 60
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes} min`;
  }

  async function findSafeRoute() {
    if (!routeStart || !routeEnd) {
      setRouteStatus("Select both a starting location and destination first.");
      return;
    }

    setIsLoadingRoute(true);
    setRouteStatus("");
    setRouteRoutes([]);
    setSelectedRouteId(null);
    setRecommendedRouteId(null);

    const routeIsInHyderabad =
      isWithinHyderabad(routeStart.latitude, routeStart.longitude) &&
      isWithinHyderabad(routeEnd.latitude, routeEnd.longitude);

    try {
      const response = await fetch(
        `${apiBaseUrl}/route?start_lat=${encodeURIComponent(routeStart.latitude)}&start_lon=${encodeURIComponent(routeStart.longitude)}&end_lat=${encodeURIComponent(routeEnd.latitude)}&end_lon=${encodeURIComponent(routeEnd.longitude)}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Route request failed");
      }

      const analysedRoutes = data.routes.map((route) => ({
        ...route,
        analysis: routeIsInHyderabad
          ? analyseRouteReports(route)
          : null,
      }));

      const primaryRoute = analysedRoutes[0];
      const saferAlternative = routeIsInHyderabad && primaryRoute?.analysis
        ? analysedRoutes.slice(1).filter((route) =>
            route.analysis && !route.analysis.blockedPrototype &&
            route.analysis.evidenceScore < primaryRoute.analysis.evidenceScore
          ).sort((first, second) =>
            first.analysis.evidenceScore - second.analysis.evidenceScore ||
            first.duration_s - second.duration_s
          )[0]
        : null;

      const recommendedRoute =
        routeIsInHyderabad && primaryRoute?.analysis?.blockedPrototype && saferAlternative
          ? saferAlternative
          : primaryRoute;

      const primaryDistanceDelta = recommendedRoute && primaryRoute
        ? recommendedRoute.distance_m - primaryRoute.distance_m
        : 0;
      const primaryTimeDelta = recommendedRoute && primaryRoute
        ? recommendedRoute.duration_s - primaryRoute.duration_s
        : 0;

      setRouteRoutes(analysedRoutes);
      setSelectedRouteId(recommendedRoute.id);
      setRecommendedRouteId(recommendedRoute.id);

      if (routeIsInHyderabad && primaryRoute?.analysis?.blockedPrototype && saferAlternative) {
        setRouteStatus(
          `Recommended diversion: ${Math.abs(primaryDistanceDelta) >= 1000 ? `${(Math.abs(primaryDistanceDelta) / 1000).toFixed(1)} km` : `${Math.round(Math.abs(primaryDistanceDelta))} m`} ${primaryDistanceDelta >= 0 ? "longer" : "shorter"} and ${Math.abs(primaryTimeDelta) >= 60 ? `${Math.round(Math.abs(primaryTimeDelta) / 60)} min` : `${Math.round(Math.abs(primaryTimeDelta))} sec`} ${primaryTimeDelta >= 0 ? "longer" : "shorter"}. Avoiding reported blocked road.`
        );
        return;
      }

      setRouteStatus(
        routeIsInHyderabad
          ? "Route found. Waterlogging warnings are based on nearby citizen reports, not confirmed road closures."
          : "Route available. Waterlogging analysis is currently available for Hyderabad only."
      );
    } catch (error) {
      console.error("Route request failed:", error);
      setRouteStatus(
        error.message || "We could not find a route right now. Please try again."
      );
    } finally {
      setIsLoadingRoute(false);
    }
  }

  function clearRoute() {
    setRouteRoutes([]);
    setSelectedRouteId(null);
    setRecommendedRouteId(null);
    setRouteStatus("Route cleared.");
  }

  function resetToHyderabad() {
    setSelectedDestination(null);
    setDestinationWeather(null);
    setDestinationName("");
    setDestinationResults([]);
    setDestinationStatus("Showing the default Hyderabad map and weather.");
    setMapView({ center: hyderabad, zoom: 12 });
  }

  function getWeatherStatus(weather) {
    if (weather.next_6_hours_rain >= 5 || weather.rain_probability >= 60) {
      return "Rain may increase waterlogging risk. Road risk remains an estimate.";
    }

    return "No substantial rainfall is forecast in the next 6 hours.";
  }


  // ------------------------------------
  // REAL HYDERABAD ROAD DATA
  // ------------------------------------

const [roadData, setRoadData] = useState(null);

useEffect(() => {
  fetch(hyderabadRoadsUrl)
    .then((response) => {
      if (!response.ok) {
        return fetch("/hyderabad-roads.geojson");
      }
      return response;
    })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Could not load Hyderabad roads");
      }
      return response.json();
    })
    .then((data) => {
      setRoadData(data);
      console.log("Hyderabad roads loaded:", data?.features?.length || 0);
    })
    .catch((error) => {
      console.error("Road data error:", error);
    });
}, []);


  // ------------------------------------
  // REPORTS
  // ------------------------------------

  const [reports, setReports] = useState(INITIAL_DEMO_REPORTS);

  const loadReports = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/reports`);
      if (!response.ok) {
        throw new Error("Could not load reports");
      }

      const data = await response.json();
      const reportList = Array.isArray(data?.reports)
        ? data.reports
        : Array.isArray(data)
        ? data
        : [];

      const formattedBackend = reportList.map((report) => ({
        ...report,
        id: `backend-${report.id}`,
        type: report.issue_type || report.type || "Waterlogged Road",
        issue_type: report.issue_type || report.type || "Waterlogged Road",
        location: report.location || "Reported location",
        latitude: Number(report.latitude),
        longitude: Number(report.longitude),
        severity: String(report.severity || "MEDIUM").toUpperCase(),
        status: report.status || "Reported",
        position: [
          Number(report.latitude),
          Number(report.longitude),
        ],
        isDemo: false,
      }));

      setReports([...formattedBackend, ...INITIAL_DEMO_REPORTS]);
    } catch (error) {
      console.error("Report loading failed, retaining demo reports:", error);
      setReports(INITIAL_DEMO_REPORTS);
    }
  }, [apiBaseUrl, setReports]);

  useEffect(() => {
    let ignore = false;
    async function fetchInitialReports() {
      try {
        const response = await fetch(`${apiBaseUrl}/reports`);
        if (!response.ok) return;
        const data = await response.json();
        const reportList = Array.isArray(data?.reports)
          ? data.reports
          : Array.isArray(data)
          ? data
          : [];
        if (!ignore) {
          const formattedBackend = reportList.map((report) => ({
            ...report,
            id: `backend-${report.id}`,
            type: report.issue_type || report.type || "Waterlogged Road",
            issue_type: report.issue_type || report.type || "Waterlogged Road",
            location: report.location || "Reported location",
            latitude: Number(report.latitude),
            longitude: Number(report.longitude),
            severity: String(report.severity || "MEDIUM").toUpperCase(),
            status: report.status || "Reported",
            position: [
              Number(report.latitude),
              Number(report.longitude),
            ],
            isDemo: false,
          }));

          setReports([...formattedBackend, ...INITIAL_DEMO_REPORTS]);
        }
      } catch (error) {
        console.error("Report loading failed:", error);
      }
    }
    void fetchInitialReports();
    return () => {
      ignore = true;
    };
  }, [apiBaseUrl]);

  const reportClusters = useMemo(() => {
    return groupReportsIntoClusters(reports);
  }, [reports]);





  // ------------------------------------
  // REPORT FORM
  // ------------------------------------

  const [showForm, setShowForm] = useState(false);

  const [selectedLocation, setSelectedLocation] =
    useState(null);

  const [type, setType] =
    useState("Waterlogged Road");

  const [severity, setSeverity] =
    useState("MEDIUM");

  const [location, setLocation] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [photo, setPhoto] =
    useState(null);

  const [reportFeedback, setReportFeedback] =
    useState("");


  // ------------------------------------
  // SUBMIT REPORT
  // ------------------------------------

  async function submitReport(event) {
    event.preventDefault();

    if (!location.trim()) {
      setReportFeedback("Please enter the location name.");
      return;
    }

    if (!selectedLocation) {
      setReportFeedback("Please select the exact location on the map.");
      return;
    }

    const latitude = Number(selectedLocation[0]);
    const longitude = Number(selectedLocation[1]);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setReportFeedback("Please provide valid latitude and longitude coordinates.");
      return;
    }

    try {
      setReportFeedback("Submitting report...");

      const response = await fetch(
        `${apiBaseUrl}/reports`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type,
            issue_type: type,
            location,
            latitude,
            longitude,
            severity,
            description,
            status: "Reported",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to submit report");
      }

      await loadReports();

      setLocation("");
      setDescription("");
      setPhoto(null);
      setType("Waterlogged Road");
      setSeverity("MEDIUM");
      setSelectedLocation(null);
      setShowForm(false);
      setReportFeedback("Report submitted successfully.");
    } catch (error) {
      console.error(error);
      setReportFeedback(error.message || "Could not submit the report.");
    }
  }


  // ------------------------------------
  // RAIN IMPACT
  // ------------------------------------

  const getRainFactor = useCallback(() => {
    const riskRainfall =
      selectedDestination &&
      selectedDestination.weather &&
      isWithinHyderabad(
        selectedDestination.latitude,
        selectedDestination.longitude
      )
        ? selectedDestination.weather.next_6_hours_rain
        : rainfall;

    if (riskRainfall >= 30) {
      return 20;
    }

    if (riskRainfall >= 15) {
      return 12;
    }

    if (riskRainfall >= 5) {
      return 6;
    }

    return 0;
  }, [selectedDestination, rainfall]);


  // ------------------------------------
  // ROAD REPORT STATS & DYNAMIC STYLING
  // ------------------------------------

  const getRoadReportStats = useCallback(
    (feature) => {
      const roadType = feature?.properties?.highway || "tertiary";
      let baseRisk = 35;

      if (roadType === "trunk") {
        baseRisk = 48;
      } else if (roadType === "primary") {
        baseRisk = 44;
      } else if (roadType === "secondary") {
        baseRisk = 40;
      } else if (roadType === "tertiary") {
        baseRisk = 35;
      }

      baseRisk += getRainFactor();

      const coordinates = feature?.geometry?.coordinates || [];
      const nearbyReports = [];
      let highCount = 0;
      let mediumCount = 0;
      let lowCount = 0;
      let reportRiskBonus = 0;

      reports.forEach((report) => {
        const reportLat = report.position[0];
        const reportLng = report.position[1];

        const nearby = coordinates.some((point) => {
          const roadLng = point[0];
          const roadLat = point[1];
          const distanceSq =
            (reportLat - roadLat) ** 2 + (reportLng - roadLng) ** 2;

          // Proximity threshold ~0.005 degrees (~500m)
          return distanceSq < 0.000025;
        });

        if (nearby) {
          nearbyReports.push(report);
          const sev = String(report.severity).toUpperCase();
          if (sev === "HIGH") {
            highCount += 1;
            reportRiskBonus += 25;
          } else if (sev === "MEDIUM") {
            mediumCount += 1;
            reportRiskBonus += 15;
          } else {
            lowCount += 1;
            reportRiskBonus += 5;
          }
        }
      });

      const reportCount = nearbyReports.length;
      const totalRisk = Math.min(100, Math.round(baseRisk + reportRiskBonus));

      let color = "#16a34a"; // Green for safe / low risk
      let severityLabel = "LOW";
      let lineWeight = 2.5;
      let lineOpacity = 0.7;

      if (highCount > 0 || totalRisk >= 70) {
        color = "#dc2626"; // Red for high severity reports or high risk
        severityLabel = "HIGH";
        lineWeight = 6;
        lineOpacity = 0.95;
      } else if (mediumCount > 0 || totalRisk >= 45) {
        color = "#f59e0b"; // Orange for medium severity reports or moderate risk
        severityLabel = "MEDIUM";
        lineWeight = 4.5;
        lineOpacity = 0.9;
      } else if (reportCount > 0) {
        color = "#22c55e"; // Bright Green for low severity reported roads
        severityLabel = "LOW";
        lineWeight = 3.5;
        lineOpacity = 0.85;
      }

      return {
        totalRisk,
        reportCount,
        highCount,
        mediumCount,
        lowCount,
        nearbyReports,
        color,
        severityLabel,
        lineWeight,
        lineOpacity,
      };
    },
    [reports, getRainFactor]
  );



  // ------------------------------------
  // VEHICLE STATUS
  // ------------------------------------

  function getVehicleStatus(risk) {
    if (risk >= 80) {
      return "Avoid if possible";
    }

    if (risk >= 60) {
      return "Difficult for vehicles";
    }

    if (risk >= 40) {
      return "Passable with caution";
    }

    return "PASSABLE";
  }

  // ------------------------------------
  // WATER ESTIMATE
  // ------------------------------------

  function getWaterPercentage(risk) {
    return Math.min(
      95,
      Math.max(
        5,
        Math.round(risk * 0.85)
      )
    );
  }

  // ------------------------------------
  // DYNAMIC ROAD STYLE
  // ------------------------------------

  const roadStyle = useCallback(
    (feature) => {
      const stats = getRoadReportStats(feature);
      return {
        color: stats.color,
        weight: stats.lineWeight,
        opacity: stats.lineOpacity,
      };
    },
    [getRoadReportStats]
  );

  // ------------------------------------
  // ROAD POPUP WITH REPORT COUNTS
  // ------------------------------------

  const onEachRoad = useCallback(
    (feature, layer) => {
      const stats = getRoadReportStats(feature);
      const roadName = feature?.properties?.name || "Unnamed road";
      const waterPercentage = getWaterPercentage(stats.totalRisk);
      const vehicleStatus = getVehicleStatus(stats.totalRisk);

      const rainForecast =
        selectedDestination &&
        selectedDestination.weather &&
        isWithinHyderabad(
          selectedDestination.latitude,
          selectedDestination.longitude
        )
          ? selectedDestination.weather.next_6_hours_rain
          : rainfall;

      const reportBadge =
        stats.reportCount > 0
          ? `<div style="margin-top:6px; padding:6px 10px; background:${stats.color}22; border-left:4px solid ${stats.color}; border-radius:4px;">
               <strong style="color:${stats.color}; font-size:13px;">🚨 ${stats.reportCount} Community Report${stats.reportCount > 1 ? "s" : ""}</strong>
               <div style="font-size:11px; margin-top:2px;">
                 ${stats.highCount > 0 ? `<span style="color:#dc2626; font-weight:bold;">${stats.highCount} HIGH</span> ` : ""}
                 ${stats.mediumCount > 0 ? `<span style="color:#d97706; font-weight:bold;">${stats.mediumCount} MEDIUM</span> ` : ""}
                 ${stats.lowCount > 0 ? `<span style="color:#16a34a; font-weight:bold;">${stats.lowCount} LOW</span>` : ""}
               </div>
             </div>`
          : `<div style="margin-top:6px;"><span style="color:#16a34a; font-weight:600;">✓ 0 Community Reports (Passable)</span></div>`;

      const reportDetails =
        stats.nearbyReports.length > 0
          ? `<div style="margin-top:8px; max-height:100px; overflow-y:auto; font-size:11px; border-top:1px solid #e2e8f0; padding-top:4px;">
               <strong>Recent community reports:</strong>
               ${stats.nearbyReports
                 .map(
                   (r) =>
                     `<div style="margin-top:3px;">
                        • <strong>${r.type}</strong> (${r.severity}): ${r.location} ${r.description ? `- <em>"${r.description}"</em>` : ""}
                      </div>`
                 )
                 .join("")}
             </div>`
          : "";

      layer.bindPopup(`
        <div style="min-width:220px; font-family: system-ui, -apple-system, sans-serif;">
          <strong style="font-size:15px; color:#0f172a;">${roadName}</strong>
          ${reportBadge}
          <div style="margin-top:8px; font-size:12px; line-height:1.5;">
            <span>Water accumulation: <strong>${waterPercentage}%</strong></span><br />
            <span>Risk severity: <strong style="color:${stats.color}">${stats.severityLabel}</strong> (${stats.totalRisk}/100)</span><br />
            <span>Vehicle access: <strong>${vehicleStatus}</strong></span><br />
            <span>Rain forecast: ${rainForecast} mm</span>
          </div>
          ${reportDetails}
          <div style="margin-top:8px; font-size:10px; color:#64748b; border-top:1px solid #f1f5f9; padding-top:4px;">
            Dynamic road status based on live community reports & forecast rainfall.
          </div>
        </div>
      `);
    },
    [getRoadReportStats, selectedDestination, rainfall]
  );

  // ------------------------------------
  // COUNT HIGH RISK ROADS & AFFECTED ROADS
  // ------------------------------------

  const highRiskRoadCount = useMemo(() => {
    if (!roadData) return 0;
    return roadData.features.filter(
      (feature) => getRoadReportStats(feature).severityLabel === "HIGH"
    ).length;
  }, [roadData, getRoadReportStats]);

  const affectedRoadsCount = useMemo(() => {
    if (!roadData) return 0;
    return roadData.features.filter(
      (feature) => getRoadReportStats(feature).reportCount > 0
    ).length;
  }, [roadData, getRoadReportStats]);


  const prototypeRoadSegments = useMemo(() => {
    if (!roadData) {
      return [];
    }

    const sampleConditions = [
      {
        reportId: 1,
        status: "BLOCKED",
        color: "#dc2626",
        recommendation: "Avoid if possible",
      },
      {
        reportId: 2,
        status: "PASSABLE WITH CAUTION",
        color: "#f59e0b",
        recommendation: "Proceed carefully",
      },
      {
        reportId: 4,
        status: "PASSABLE",
        color: "#16a34a",
        recommendation: "Recommended among the sample conditions",
      },
    ];

    return sampleConditions.map((condition) => {
      const report = reports.find(
        (item) => item.id === condition.reportId
      );

      if (!report) {
        return null;
      }

      const nearestFeature = roadData.features.reduce(
        (closest, feature) => {
          const featureDistance = Math.min(
            ...feature.geometry.coordinates.map(([longitude, latitude]) =>
              (latitude - report.position[0]) ** 2 +
              (longitude - report.position[1]) ** 2
            )
          );

          return !closest || featureDistance < closest.distance
            ? { feature, distance: featureDistance }
            : closest;
        },
        null
      );

      return nearestFeature
        ? { ...condition, report, feature: nearestFeature.feature }
        : null;
    }).filter(Boolean);
  }, [reports, roadData]);

  const selectedRoute = routeRoutes.find(
    (route) => route.id === selectedRouteId
  );

  const showingHyderabadRoads =
    !selectedDestination ||
    isWithinHyderabad(
      selectedDestination.latitude,
      selectedDestination.longitude
    );

  const mapTitle = showingHyderabadRoads
    ? "Hyderabad Risk Map"
    : "Destination Weather Map";


  // ------------------------------------
  // UI
  // ------------------------------------

  return (

    <div className="app">


      {/* HEADER */}

      <header className="topbar">

        <div>

          <h1>
            LAKEWATCH AI
          </h1>

          <p>
            Hyderabad Waterlogging &
            Drainage Monitor
          </p>

        </div>


        <button
          className="admin-btn"
          onClick={() =>
            alert(
              "GHMC Dashboard coming next"
            )
          }
        >
          GHMC Dashboard
        </button>

      </header>


      <main>


        {/* HERO */}

        <section className="hero">

          <div>

            <h2>
              Monitor. Detect. Act.
            </h2>


            <p>
              Helping Hyderabad identify
              drainage and waterlogging risks
              before they become bigger problems.
            </p>


            <div className="hero-actions">

              <button
                className="primary-btn"
                onClick={() =>
                  setShowForm(true)
                }
              >
                Report a Problem
              </button>


              <button
                className="secondary-btn"
                onClick={() =>
                  document
                    .getElementById("risk-map")
                    ?.scrollIntoView({
                      behavior: "smooth",
                    })
                }
              >
                View Risk Map
              </button>

            </div>

          </div>


          <div className="risk-card">

            <span>
              Hyderabad Risk
            </span>


            <strong>

              {rainfall >= 30
                ? "HIGH"
                : rainfall >= 10
                ? "MEDIUM"
                : "LOW"}

            </strong>


            <small>

              Based on rainfall
              and reported hazards

            </small>

          </div>

        </section>


        {/* DESTINATION WEATHER */}

        <section className="destination-weather-section">

          <div className="section-heading">

            <div>

              <h2>
                Destination Weather
              </h2>

              <p>
                Search a destination or choose your current location.
              </p>

            </div>

          </div>


          <form
            className="destination-search"
            onSubmit={searchDestination}
          >

            <label htmlFor="destination-input">
              Destination
            </label>

            <input
              id="destination-input"
              type="text"
              placeholder="Example: Gachibowli, Bengaluru, Chennai"
              value={destinationQuery}
              onChange={(event) =>
                setDestinationQuery(event.target.value)
              }
            />

            <button
              type="submit"
              className="primary-btn"
              disabled={isSearchingDestination}
            >
              {isSearchingDestination
                ? "Searching…"
                : "Search Destination"}
            </button>

            <button
              type="button"
              className="secondary-btn"
              onClick={useMyLocation}
              disabled={isLoadingDestinationWeather}
            >
              Use My Location
            </button>

          </form>


          {destinationStatus && (

            <p className="destination-status" role="status">
              {destinationStatus}
            </p>

          )}


          {destinationResults.length > 0 && (

            <div className="destination-results">

              <strong>
                Select a matching location
              </strong>

              {destinationResults.map((place) => (

                <button
                  type="button"
                  className="destination-result"
                  key={`${place.latitude}-${place.longitude}`}
                  onClick={() => selectDestination(place)}
                >
                  {getPlaceLabel(place)}
                </button>

              ))}

            </div>

          )}


          {isLoadingDestinationWeather && (

            <p className="destination-status" role="status">
              Loading destination weather…
            </p>

          )}


          {destinationWeather && (

            <div className="destination-weather-card">

              <div>

                <span>
                  Weather for
                </span>

                <h3>
                  {destinationName}
                </h3>

              </div>

              <div className="destination-weather-details">

                <div>
                  <span>Temperature</span>
                  <strong>{destinationWeather.temperature}°C</strong>
                </div>

                <div>
                  <span>Next 6h rain</span>
                  <strong>
                    {destinationWeather.next_6_hours_rain} mm
                  </strong>
                </div>

                <div>
                  <span>Rain probability</span>
                  <strong>{destinationWeather.rain_probability}%</strong>
                </div>

                <div>
                  <span>Timezone</span>
                  <strong>{destinationWeather.timezone}</strong>
                </div>

              </div>

              <p className="weather-implication">
                <strong>Risk implication:</strong>
                {" "}
                {getWeatherStatus(destinationWeather)}
              </p>

            </div>

          )}

        </section>


        {/* ROUTE PLANNING */}

        <section className="route-planning-section">

          <div className="section-heading">

            <div>

              <h2>
                Waterlogging-Aware Route Planning
              </h2>

              <p>
                Route recommendations use driving directions and nearby citizen reports where Hyderabad data is available.
              </p>

            </div>

          </div>


          <div className="route-search-grid">

            <div className="route-location-field">

              <label htmlFor="route-start-input">
                From
              </label>

              <div className="route-input-actions">

                <input
                  id="route-start-input"
                  type="text"
                  placeholder="Search starting location"
                  value={routeStartQuery}
                  onChange={(event) =>
                    setRouteStartQuery(event.target.value)
                  }
                />

                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => searchRouteLocation("start")}
                  disabled={isSearchingRoute}
                >
                  Search
                </button>

              </div>

              <button
                type="button"
                className="route-location-button"
                onClick={useMyLocationForRoute}
              >
                Use My Location
              </button>

              {routeStart && (

                <p className="route-selection">
                  Start: {routeStart.name}
                </p>

              )}

              {routeStartResults.map((place) => (

                <button
                  type="button"
                  className="destination-result"
                  key={`route-start-${place.latitude}-${place.longitude}`}
                  onClick={() => selectRouteLocation(place, "start")}
                >
                  {getPlaceLabel(place)}
                </button>

              ))}

            </div>


            <div className="route-location-field">

              <label htmlFor="route-end-input">
                To
              </label>

              <div className="route-input-actions">

                <input
                  id="route-end-input"
                  type="text"
                  placeholder="Search destination"
                  value={routeEndQuery}
                  onChange={(event) =>
                    setRouteEndQuery(event.target.value)
                  }
                />

                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => searchRouteLocation("end")}
                  disabled={isSearchingRoute}
                >
                  Search
                </button>

              </div>

              {routeEnd && (

                <p className="route-selection">
                  Destination: {routeEnd.name}
                </p>

              )}

              {routeEndResults.map((place) => (

                <button
                  type="button"
                  className="destination-result"
                  key={`route-end-${place.latitude}-${place.longitude}`}
                  onClick={() => selectRouteLocation(place, "end")}
                >
                  {getPlaceLabel(place)}
                </button>

              ))}

            </div>

          </div>


          <div className="route-actions">

            <button
              type="button"
              className="primary-btn"
              onClick={findSafeRoute}
              disabled={isLoadingRoute}
            >
              {isLoadingRoute ? "Finding route..." : "Find Safe Route"}
            </button>

            {routeRoutes.length > 0 && (

              <button
                type="button"
                className="secondary-btn"
                onClick={clearRoute}
              >
                Clear Route
              </button>

            )}

          </div>


          {routeStatus && (

            <p className="route-status" role="status">
              {routeStatus}
            </p>

          )}


          {routeStart?.weather && routeEnd?.weather && (

            <div className="route-weather-summary">

              <span>
                Start weather: {routeStart.weather.temperature}°C, {routeStart.weather.rain_probability}% rain probability
              </span>

              <span>
                Destination weather: {routeEnd.weather.temperature}°C, {routeEnd.weather.rain_probability}% rain probability
              </span>

            </div>

          )}


          {routeRoutes.length > 0 && (

            <div className="route-results">

              {routeRoutes.map((route, index) => {
                const isSelected = route.id === selectedRouteId;
                const isRecommended =
                  route.id === recommendedRouteId && index > 0;

                return (

                  <button
                    type="button"
                    className={isSelected ? "route-option selected" : "route-option"}
                    key={route.id}
                    onClick={() => setSelectedRouteId(route.id)}
                  >
                    <strong>
                      {index === 0 ? "Primary Route" : `Alternative Route ${index}`}
                      {isRecommended ? " - Recommended diversion" : ""}
                    </strong>

                    <span>
                      {formatDistance(route.distance_m)} - {formatDuration(route.duration_s)}
                    </span>

                    {route.analysis && route.analysis.reports.length > 0 && (

                      <small>
                        Reported waterlogging near route: {route.analysis.severityCounts.HIGH} high, {route.analysis.severityCounts.MEDIUM} medium, {route.analysis.severityCounts.LOW} low.
                      </small>

                    )}

                  </button>

                );
              })}


              {selectedRoute?.analysis?.severityCounts.HIGH > 0 && (

                <p className="route-warning">
                  Reported high-risk waterlogging is near this route. This is citizen-report evidence, not confirmation that a road is blocked.
                </p>

              )}

            </div>

          )}

        </section>


        {/* REPORT FORM */}

        {showForm && (

          <section
            className="report-form-section"
          >

            <div className="section-heading">

              <div>

                <h2>
                  Report a Problem
                </h2>

                <p>
                  Report a waterlogging or
                  drainage issue in Hyderabad.
                </p>

              </div>


              <button
                className="secondary-btn"
                onClick={() =>
                  setShowForm(false)
                }
              >
                Close
              </button>

            </div>


            <form
              className="report-form"
              onSubmit={submitReport}
            >


              <label>

                Problem Type

                <select
                  value={type}
                  onChange={(e) =>
                    setType(e.target.value)
                  }
                >

                  <option>
                    Waterlogged Road
                  </option>

                  <option>
                    Blocked Drain
                  </option>

                  <option>
                    Open Drain Cover
                  </option>

                  <option>
                    Garbage Dumping
                  </option>

                </select>

              </label>

              <label>
                Severity
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </label>


              <label>

                Location

                <input
                  type="text"
                  placeholder="Example: Gachibowli"
                  value={location}
                  onChange={(e) =>
                    setLocation(
                      e.target.value
                    )
                  }
                />


                {selectedLocation && (

                  <p className="selected-location">

                    📍 Selected:

                    {" "}

                    {selectedLocation[0]
                      .toFixed(5)}

                    {", "}

                    {selectedLocation[1]
                      .toFixed(5)}

                  </p>

                )}

              </label>

              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  if (!navigator.geolocation) {
                    setReportFeedback("Location services are not available in this browser.");
                    return;
                  }

                  setReportFeedback("Requesting your location permission...");

                  navigator.geolocation.getCurrentPosition(
                    (position) => {
                      const nextLocation = [
                        position.coords.latitude,
                        position.coords.longitude,
                      ];

                      setSelectedLocation(nextLocation);
                      setLocation("My current location");
                      setReportFeedback("Current location selected. Confirm and submit the report.");
                    },
                    (error) => {
                      setReportFeedback(
                        error.code === error.PERMISSION_DENIED
                          ? "Location permission was denied. Select a point on the map instead."
                          : "We could not access your location. Please pick a location on the map."
                      );
                    },
                    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
                  );
                }}
              >
                Use My Location
              </button>


              <label>

                Upload Photo

                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setPhoto(
                      e.target.files[0]
                    )
                  }
                />


                {photo && (

                  <p className="selected-location">

                    📷 {photo.name}

                  </p>

                )}


                {photo && (

                  <img
                    src={URL.createObjectURL(photo)}
                    alt="Selected report"
                    className="report-preview"
                  />

                )}

              </label>


              <label>

                Description

                <textarea
                  placeholder="Briefly describe the problem..."
                  value={description}
                  onChange={(e) =>
                    setDescription(
                      e.target.value
                    )
                  }
                />

              </label>


              {reportFeedback && (
                <p className="destination-status" role="status">
                  {reportFeedback}
                </p>
              )}

              <button
                type="submit"
                className="primary-btn"
              >
                Submit Report
              </button>

            </form>

          </section>

        )}


        {/* STATS */}

        <section className="stats">

          <div className="stat-card">

            <span>
              Reported Issues
            </span>

            <strong>
              {reports.length}
            </strong>

          </div>


          <div className="stat-card">

            <span>
              High Risk Roads
            </span>

            <strong>
              {highRiskRoadCount}
            </strong>

            <small>
              {affectedRoadsCount} road{affectedRoadsCount === 1 ? "" : "s"} with reports
            </small>

          </div>



          <div className="stat-card">

            <span>
              Next 6h Rain
            </span>

            <strong>
              {rainfall} mm
            </strong>

            <small>
              {rainProbability}%
              {" "}rain probability
            </small>

          </div>


          <div className="stat-card">

            <span>
              Resolved
            </span>

            <strong>

              {
                reports.filter(
                  (report) =>
                    report.status ===
                    "Resolved"
                ).length
              }

            </strong>

          </div>

        </section>


        {/* REAL HYDERABAD MAP */}

        <section
          className="map-section"
          id="risk-map"
        >

          <div className="section-heading">

            <div>

              <h2>
                {mapTitle}
              </h2>

              <p>
                {showingHyderabadRoads
                  ? "Road colours show estimated waterlogging risk in Hyderabad"
                  : "Destination weather marker; Hyderabad road risk is unavailable here"}
              </p>

            </div>

            <div className="map-controls">

              <span>Map:</span>

              <button
                type="button"
                className={mapMode === "street" ? "map-mode active" : "map-mode"}
                onClick={() => {
                  setMapMode("street");
                  setSatelliteStatus("");
                }}
              >
                Street
              </button>

              <button
                type="button"
                className={mapMode === "satellite" ? "map-mode active" : "map-mode"}
                onClick={() => {
                  setMapMode("satellite");
                  setSatelliteStatus("");
                }}
              >
                Satellite
              </button>

              {selectedDestination && (
                <button
                  type="button"
                  className="secondary-btn reset-map-btn"
                  onClick={resetToHyderabad}
                >
                  Reset to Hyderabad
                </button>
              )}

            </div>

          </div>


          <div className="map-container">

            <MapContainer

              center={hyderabad}

              zoom={12}

              minZoom={11}

              maxZoom={18}

              scrollWheelZoom={true}

              className="leaflet-map"

              maxBoundsViscosity={1.0}

            >

              <MapViewController
                mapView={mapView}
                keepHyderabadBounds={showingHyderabadRoads}
                routeCoordinates={selectedRoute?.geometry?.coordinates}
              />

              {mapMode === "street" ? (

                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

              ) : (

                <TileLayer
                  key="satellite-base"
                  attribution="NASA GIBS - VIIRS NOAA-20 Corrected Reflectance (True Color)"
                  url={NASA_GIBS_TILE_URL}
                  maxNativeZoom={9}
                  maxZoom={18}
                  noWrap={false}
                  crossOrigin={true}
                  eventHandlers={{
                    tileerror: (event) => {
                      console.error("NASA GIBS tile failed to load", event);
                      setSatelliteStatus(
                        "Satellite imagery is temporarily unavailable. Street mode remains available."
                      );
                    },
                    tileload: () => setSatelliteStatus("")
                  }}
                />

              )}


              <LocationPicker
                onSelect={
                  setSelectedLocation
                }
              />


              {/* REAL ROAD NETWORK */}

              {showingHyderabadRoads && roadData && (

                <GeoJSON

                  key={`roads-${rainfall}-${reports.length}-${reports.map((r) => `${r.id}_${r.severity}`).join("-")}`}

                  data={roadData}

                  style={roadStyle}

                  onEachFeature={onEachRoad}

                />

              )}


              {/* Prototype status overlays on selected real Hyderabad roads */}

              {showingHyderabadRoads && prototypeRoadSegments.map((segment) => (

                <GeoJSON
                  key={`prototype-road-${segment.reportId}`}
                  data={segment.feature}
                  style={{
                    color: segment.color,
                    weight: 8,
                    opacity: 0.95,
                  }}
                  onEachFeature={(feature, layer) => {
                    layer.bindPopup(`
                      <div style="min-width:210px">
                        <strong>${feature.properties?.name || "Sample road segment"}</strong>
                        <br />
                        <span>Road status: <strong>${segment.status}</strong></span>
                        <br />
                        <span>Evidence: ${segment.report.severity} citizen report near ${segment.report.location}</span>
                        <br />
                        <span>${segment.recommendation}</span>
                        <br /><br />
                        <small>Reported blocked / prototype road status. This is not a confirmed closure.</small>
                      </div>
                    `);
                  }}
                />

              ))}


              {/* SELECTED LOCATION */}

              {selectedLocation && (

                <Marker
                  position={
                    selectedLocation
                  }
                >

                  <Popup>
                    📍 Selected report location
                  </Popup>

                </Marker>

              )}


              {/* REPORT MARKERS & CLUSTERS */}

              {showingHyderabadRoads &&
                reportClusters.map((cluster) => (
                  <Marker
                    key={cluster.id}
                    position={cluster.center}
                    icon={createReportClusterIcon(cluster)}
                  >
                    <Popup>
                      <div
                        dangerouslySetInnerHTML={{
                          __html: renderClusterPopup(cluster),
                        }}
                      />
                    </Popup>
                  </Marker>
                ))}



              {selectedDestination && (

                <Marker
                  position={[
                    selectedDestination.latitude,
                    selectedDestination.longitude,
                  ]}
                >

                  <Popup>

                    <strong>
                      {selectedDestination.isCurrentLocation
                        ? "Current location"
                        : selectedDestination.name}
                    </strong>

                    <br />

                    Temperature: {selectedDestination.weather
                      ? `${selectedDestination.weather.temperature}°C`
                      : "Unavailable"}

                    <br />

                    Rain probability: {selectedDestination.weather
                      ? `${selectedDestination.weather.rain_probability}%`
                      : "Unavailable"}

                    <br />

                    Next 6h rain: {selectedDestination.weather
                      ? `${selectedDestination.weather.next_6_hours_rain} mm`
                      : "Unavailable"}

                  </Popup>

                </Marker>

              )}


              {routeStart && (

                <Marker position={[routeStart.latitude, routeStart.longitude]}>

                  <Popup>
                    <strong>Route start</strong>
                    <br />
                    {routeStart.name}
                  </Popup>

                </Marker>

              )}


              {routeEnd && (

                <Marker position={[routeEnd.latitude, routeEnd.longitude]}>

                  <Popup>
                    <strong>Route destination</strong>
                    <br />
                    {routeEnd.name}
                  </Popup>

                </Marker>

              )}


              {routeRoutes.map((route, index) => (

                <Polyline
                  key={route.id}
                  positions={route.geometry.coordinates.map(
                    ([longitude, latitude]) => [latitude, longitude]
                  )}
                  pathOptions={{
                    color: route.id === selectedRouteId
                      ? "#2563eb"
                      : index === 0
                      ? "#f59e0b"
                      : "#64748b",
                    weight: route.id === selectedRouteId ? 6 : 4,
                    opacity: route.id === selectedRouteId ? 0.95 : 0.7,
                    dashArray: route.id === selectedRouteId
                      ? undefined
                      : "8 8",
                  }}
                  eventHandlers={{
                    click: () => setSelectedRouteId(route.id),
                  }}
                />

              ))}


              {selectedRoute?.analysis?.reports.map((report) => (

                <Marker
                  key={`route-warning-${report.id}`}
                  position={report.position}
                  icon={createReportIcon(report.severity)}
                >

                  <Popup>
                    <strong>Reported waterlogging near route</strong>
                    <br />
                    {report.location} - {report.severity}
                    <br />
                    Citizen report; not a confirmed road closure.
                  </Popup>

                </Marker>

              ))}

            </MapContainer>


            {/* LEGEND */}

            {showingHyderabadRoads && (

            <div className="map-legend">

              <strong>
                Waterlogging Risk
              </strong>


              <div className="legend-item">

                <span
                  className="legend-color low"
                />

                Low — Passable

              </div>


              <div className="legend-item">

                <span
                  className="legend-color medium"
                />

                Moderate — Caution

              </div>


              <div className="legend-item">

                <span
                  className="legend-color high"
                />

                High — Difficult

              </div>

            </div>

            )}

          </div>

          {satelliteStatus && (

            <p className="satellite-status" role="status">
              {satelliteStatus}
            </p>

          )}

          {mapMode === "satellite" && (

            <p className="satellite-note">
              NASA true-color imagery is a visual reference only. It does not
              calculate waterlogging or NDWI.
            </p>

          )}

        </section>


        {/* RECENT REPORTS */}

        <section className="reports-section">

          <div className="section-heading">

            <div>

              <h2>
                Recent Reports
              </h2>

              <p>
                Latest citizen-reported
                problems
              </p>

            </div>

          </div>


          <div className="report-list">

            {reports
              .slice(0, 5)
              .map((report) => (

                <div
                  className="report"
                  key={report.id}
                >

                  <div>

                    <h3>
                      {report.type}
                    </h3>

                    <p>
                      {report.location}
                      {" • "}
                      Recently reported
                    </p>

                  </div>


                  <span
                    className={`badge ${
                      report.severity ===
                      "HIGH"
                        ? "high-badge"
                        : report.severity ===
                          "MEDIUM"
                        ? "medium-badge"
                        : "low-badge"
                    }`}
                  >
                    {report.severity}
                  </span>

                </div>

              ))}

          </div>

        </section>

      </main>

    </div>

  );
}


export default App;

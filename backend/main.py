import os
from datetime import datetime, timezone

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Float, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    pass


class ReportORM(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    severity = Column(String, nullable=False, default="MEDIUM")
    issue_type = Column(String, nullable=False, default="Waterlogged Road")
    description = Column(String, default="")
    location = Column(String, nullable=False, default="")
    status = Column(String, nullable=False, default="Reported")
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


def _get_allowed_origins():
    default_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]
    custom_origins = os.getenv("FRONTEND_ORIGIN", "")
    if custom_origins:
        default_origins.extend(
            origin.strip()
            for origin in custom_origins.split(",")
            if origin.strip()
        )
    return sorted(set(default_origins))


DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL, pool_pre_ping=True) if DATABASE_URL else None
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False) if engine else None


app = FastAPI(title="LAKEWATCH AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_db():
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is not set. Configure a PostgreSQL connection string before starting the backend. "
            "Example: postgresql://user:password@host:5432/lakewatch"
        )
    if engine is None or SessionLocal is None:
        raise RuntimeError("Database engine is not configured.")
    Base.metadata.create_all(bind=engine)


@app.get("/")
def home():
    return {"message": "LAKEWATCH AI backend is running"}


class ReportCreate(BaseModel):
    type: str | None = None
    issue_type: str | None = None
    location: str
    latitude: float
    longitude: float
    severity: str = "MEDIUM"
    description: str = ""
    status: str = "Reported"


class ReportResponse(BaseModel):
    id: int
    type: str
    issue_type: str
    location: str
    latitude: float
    longitude: float
    severity: str
    description: str = ""
    status: str
    created_at: str


def serialize_report(report: ReportORM):
    issue_type = report.issue_type or report.location or "Waterlogged Road"
    return {
        "id": report.id,
        "type": issue_type,
        "issue_type": issue_type,
        "location": report.location,
        "latitude": report.latitude,
        "longitude": report.longitude,
        "severity": report.severity,
        "description": report.description,
        "status": report.status,
        "created_at": report.created_at.isoformat() if report.created_at else None,
    }


@app.get("/reports")
def get_reports():
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not set. Configure a PostgreSQL connection string before using reports.")

    with SessionLocal() as session:
        reports = session.query(ReportORM).order_by(ReportORM.created_at.desc()).all()
        return {"reports": [serialize_report(report) for report in reports]}


@app.post("/reports")
def create_report(report: ReportCreate):
    if not report.location or not report.location.strip():
        raise HTTPException(status_code=400, detail="Location is required.")
    if not (-90 <= report.latitude <= 90):
        raise HTTPException(status_code=400, detail="Latitude must be between -90 and 90.")
    if not (-180 <= report.longitude <= 180):
        raise HTTPException(status_code=400, detail="Longitude must be between -180 and 180.")

    issue_type = (report.issue_type or report.type or "Waterlogged Road").strip() or "Waterlogged Road"
    severity = (report.severity or "MEDIUM").strip().upper() or "MEDIUM"

    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not set. Configure a PostgreSQL connection string before using reports.")

    with SessionLocal() as session:
        new_report = ReportORM(
            latitude=report.latitude,
            longitude=report.longitude,
            severity=severity,
            issue_type=issue_type,
            description=report.description or "",
            location=report.location.strip(),
            status=report.status or "Reported",
            created_at=datetime.now(timezone.utc),
        )
        session.add(new_report)
        session.commit()
        session.refresh(new_report)

    return {"success": True, "report": serialize_report(new_report)}


@app.get("/weather")
def get_weather(latitude: float = 17.385, longitude: float = 78.4867):
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={latitude}"
        f"&longitude={longitude}"
        "&hourly=temperature_2m,precipitation,precipitation_probability"
        "&forecast_hours=6"
        "&timezone=auto"
    )

    response = requests.get(url, timeout=10)
    response.raise_for_status()

    data = response.json()

    precipitation = data["hourly"]["precipitation"]
    probability = data["hourly"]["precipitation_probability"]
    temperature = data["hourly"]["temperature_2m"]

    total_rain = round(sum(precipitation), 1)
    max_probability = max(probability)
    current_temperature = temperature[0]

    return {
        "latitude": latitude,
        "longitude": longitude,
        "temperature": current_temperature,
        "next_6_hours_rain": total_rain,
        "rain_probability": max_probability,
        "timezone": data.get("timezone"),
    }


@app.get("/geocode")
def geocode(place: str):
    url = "https://geocoding-api.open-meteo.com/v1/search"

    params = {
        "name": place,
        "count": 5,
        "language": "en",
        "format": "json",
    }

    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()

    data = response.json()

    results = []

    for location in data.get("results", []):
        results.append({
            "name": location.get("name"),
            "latitude": location.get("latitude"),
            "longitude": location.get("longitude"),
            "country": location.get("country"),
            "state": location.get("admin1"),
            "timezone": location.get("timezone"),
        })

    if not results:
        try:
            fallback_response = requests.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": place,
                    "format": "jsonv2",
                    "limit": 5,
                    "addressdetails": 1,
                },
                headers={"User-Agent": "LAKEWATCH/1.0"},
                timeout=10,
            )
            fallback_response.raise_for_status()

            for location in fallback_response.json():
                address = location.get("address", {})
                results.append({
                    "name": location.get("name") or location.get("display_name"),
                    "latitude": float(location["lat"]),
                    "longitude": float(location["lon"]),
                    "country": address.get("country"),
                    "state": address.get("state") or address.get("state_district"),
                    "timezone": None,
                })
        except requests.RequestException:
            pass

    return {"results": results}


@app.get("/route")
def get_route(
    start_lat: float = Query(ge=-90, le=90),
    start_lon: float = Query(ge=-180, le=180),
    end_lat: float = Query(ge=-90, le=90),
    end_lon: float = Query(ge=-180, le=180),
):
    """Proxy OSRM driving routes so routing details stay behind the backend."""
    url = (
        "https://router.project-osrm.org/route/v1/driving/"
        f"{start_lon},{start_lat};{end_lon},{end_lat}"
    )

    try:
        response = requests.get(
            url,
            params={
                "alternatives": "true",
                "geometries": "geojson",
                "overview": "full",
                "steps": "true",
            },
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as error:
        raise HTTPException(
            status_code=502,
            detail="Routing service is currently unavailable.",
        ) from error

    if data.get("code") != "Ok" or not data.get("routes"):
        raise HTTPException(
            status_code=404,
            detail="No driving route was found for these locations.",
        )

    routes = []

    for index, route in enumerate(data["routes"]):
        routes.append({
            "id": f"route-{index}",
            "distance_m": route["distance"],
            "duration_s": route["duration"],
            "geometry": route["geometry"],
            "steps": [
                {
                    "name": step.get("name") or "Continue",
                    "distance_m": step.get("distance", 0),
                    "duration_s": step.get("duration", 0),
                    "maneuver": step.get("maneuver", {}),
                }
                for leg in route.get("legs", [])
                for step in leg.get("steps", [])
            ],
        })

    return {"routes": routes}

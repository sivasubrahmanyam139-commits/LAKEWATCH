"""Extension point for real Sentinel-2 water detection.

This module deliberately does not calculate NDWI from the NASA GIBS true-color
tiles used by the frontend. A real provider must supply calibrated Sentinel-2
B3 (green) and B8 (near-infrared) raster bands for the same area and time.
"""

from dataclasses import dataclass
from typing import Protocol


class SatelliteProvider(Protocol):
    """Contract a configured Sentinel-2 provider must implement."""

    def fetch_bands(self, request: "Sentinel2Request") -> tuple[object, object]:
        """Return aligned B3 and B8 rasters for the requested area and date."""


@dataclass(frozen=True)
class Sentinel2Request:
    min_latitude: float
    min_longitude: float
    max_latitude: float
    max_longitude: float
    acquisition_date: str


class SatelliteWaterDetectionService:
    """Reserved for a future configured Sentinel-2 processing provider."""

    def __init__(self, provider: SatelliteProvider | None = None):
        self.provider = provider

    def calculate_ndwi(self, request: Sentinel2Request) -> object:
        if self.provider is None:
            raise RuntimeError(
                "Sentinel-2 processing is not configured. Configure a provider "
                "that supplies aligned B3 and B8 rasters before calculating NDWI."
            )

        green_band, near_infrared_band = self.provider.fetch_bands(request)
        # Raster arithmetic and thresholding belong here after a provider is set.
        # NDWI = (B3 - B8) / (B3 + B8)
        raise NotImplementedError(
            "NDWI raster processing has not been implemented for this provider."
        )

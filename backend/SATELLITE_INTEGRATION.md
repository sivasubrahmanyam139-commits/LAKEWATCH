# Sentinel-2 water-detection integration

The current map can display NASA GIBS true-color imagery as a visual basemap.
Those RGB tiles are not input to water detection and must not be used to
calculate NDWI.

The next production integration needs a configured Sentinel-2 provider (for
example, an approved provider account/API with access to source rasters), an
area-of-interest/date query, and aligned B3 and B8 data. `satellite.py`
contains the provider contract and request object for that hand-off.

Once calibrated raster arrays are supplied, calculate:

`NDWI = (B3 - B8) / (B3 + B8)`

Then validate cloud masking, thresholding, temporal alignment, and road
intersection against ground truth before exposing possible-water areas or
changing road risk. No credentials, fake NDWI values, or flood polygons are
included in this project.

"""Study-area and processing settings. Edit here to change the location or season."""

# Chitwan, Nepal (Bharatpur and the northern part of Chitwan National Park)
# west, south, east, north in EPSG:4326
BBOX = (84.20, 27.40, 84.70, 27.80)
AREA_NAME = "Chitwan, Nepal"
MAP_CENTER = (27.62, 84.45)  # lat, lon

# Pre-monsoon (hot, relatively clear) season
MONTHS = (3, 4, 5)

# Landsat 8 starts in 2013, Landsat 9 in 2021
FIRST_YEAR = 2015

PROCESSING_CRS = "EPSG:32645"  # UTM zone 45N
RESOLUTION = 30  # metres

STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
COLLECTION = "landsat-c2-l2"
MAX_SCENE_CLOUD = 70  # percent; pixels are masked individually afterwards

# Fixed colour ranges so that years are comparable on the map
LST_RANGE = (25.0, 50.0)  # degrees Celsius
NDVI_RANGE = (-0.1, 0.9)
LST_CMAP = "inferno"
NDVI_CMAP = "YlGn"

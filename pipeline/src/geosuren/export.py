"""Turn composites into web-ready PNG overlays and a small JSON of statistics."""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib
import numpy as np
import rioxarray  # noqa: F401  (registers the .rio accessor)
import xarray as xr
from matplotlib import colormaps
from matplotlib.colors import to_hex
from PIL import Image

from . import config

matplotlib.use("Agg")


def to_wgs84(da: xr.DataArray) -> xr.DataArray:
    """Reproject to EPSG:4326 (what Leaflet's image overlay expects)."""
    if da.rio.crs is None:
        da = da.rio.write_crs(config.PROCESSING_CRS)
    return da.rio.reproject("EPSG:4326", nodata=np.nan)


def colorize(arr: np.ndarray, vmin: float, vmax: float, cmap: str, alpha: int = 215) -> Image.Image:
    """Colour a 2-D float array; NaN pixels become fully transparent."""
    norm = np.clip((arr - vmin) / (vmax - vmin), 0, 1)
    rgba = (colormaps[cmap](norm) * 255).astype("uint8")
    rgba[..., 3] = np.where(np.isfinite(arr), alpha, 0)
    return Image.fromarray(rgba, mode="RGBA")


def legend_stops(cmap: str, n: int = 6) -> list[str]:
    return [to_hex(colormaps[cmap](v)) for v in np.linspace(0, 1, n)]


def year_stats(comp: xr.Dataset) -> dict:
    lst = comp["lst"].values
    nd = comp["ndvi"].values
    lst = lst[np.isfinite(lst)]
    nd = nd[np.isfinite(nd)]
    if lst.size == 0:
        raise ValueError("composite has no valid LST pixels")
    return {
        "lst_mean": round(float(lst.mean()), 2),
        "lst_p95": round(float(np.percentile(lst, 95)), 2),
        "ndvi_mean": round(float(nd.mean()), 3) if nd.size else None,
        "valid_fraction": round(float(lst.size / comp["lst"].size), 3),
        "n_scenes": int(comp.attrs.get("n_scenes", 0)),
    }


def export_year(comp: xr.Dataset, year: int, out_dir: Path) -> dict:
    """Write lst_<year>.png and ndvi_<year>.png; return stats and the WGS84 bounds."""
    out_dir.mkdir(parents=True, exist_ok=True)
    stats = year_stats(comp)
    lst_ll = to_wgs84(comp["lst"])
    ndvi_ll = to_wgs84(comp["ndvi"])
    colorize(lst_ll.values, *config.LST_RANGE, config.LST_CMAP).save(out_dir / f"lst_{year}.png", optimize=True)
    colorize(ndvi_ll.values, *config.NDVI_RANGE, config.NDVI_CMAP).save(out_dir / f"ndvi_{year}.png", optimize=True)
    west, south, east, north = lst_ll.rio.bounds()
    return {"stats": stats, "bounds": [[south, west], [north, east]]}


def write_meta(out_dir: Path, per_year: dict[int, dict]) -> Path:
    """per_year: {year: {"stats": {...}, "bounds": [[s, w], [n, e]]}} -> meta.json"""
    years = sorted(per_year)
    meta = {
        "area": config.AREA_NAME,
        "center": list(config.MAP_CENTER),
        "season_months": list(config.MONTHS),
        "years": years,
        "bounds": per_year[years[-1]]["bounds"] if years else None,
        "stats": {str(y): per_year[y]["stats"] for y in years},
        "layers": {
            "lst": {"label": "Land surface temperature (°C)", "min": config.LST_RANGE[0],
                    "max": config.LST_RANGE[1], "colors": legend_stops(config.LST_CMAP)},
            "ndvi": {"label": "NDVI (vegetation)", "min": config.NDVI_RANGE[0],
                     "max": config.NDVI_RANGE[1], "colors": legend_stops(config.NDVI_CMAP)},
        },
        "source": "Landsat 8/9 Collection 2 Level-2 via Microsoft Planetary Computer; median of cloud-masked scenes.",
    }
    path = out_dir / "meta.json"
    path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return path


def load_per_year(out_dir: Path) -> dict[int, dict]:
    """Re-read what is already on disk so incremental runs keep earlier years."""
    path = out_dir / "years.json"
    if not path.exists():
        return {}
    return {int(k): v for k, v in json.loads(path.read_text(encoding="utf-8")).items()}


def save_per_year(out_dir: Path, per_year: dict[int, dict]) -> None:
    (out_dir / "years.json").write_text(
        json.dumps({str(k): v for k, v in sorted(per_year.items())}, indent=2), encoding="utf-8"
    )

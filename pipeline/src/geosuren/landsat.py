"""Search Landsat Collection 2 Level-2 on the Planetary Computer and build a seasonal composite.

Heavy STAC/dask imports are done lazily so the export and test code run without them.
"""

from __future__ import annotations

import calendar

import numpy as np
import xarray as xr

from . import config

# Collection 2 Level-2 scale factors (USGS)
ST_SCALE, ST_OFFSET = 0.00341802, 149.0  # surface temperature, Kelvin
SR_SCALE, SR_OFFSET = 0.0000275, -0.2  # surface reflectance


def clear_mask(qa: xr.DataArray) -> xr.DataArray:
    """True where QA_PIXEL has no fill, dilated cloud, cirrus, cloud or cloud shadow (bits 0-4)."""
    return (qa.astype("uint16") & 0b11111) == 0


def scale_lst_celsius(dn: xr.DataArray) -> xr.DataArray:
    kelvin = dn.astype("float32") * ST_SCALE + ST_OFFSET
    return (kelvin - 273.15).where(dn > 0)


def scale_reflectance(dn: xr.DataArray) -> xr.DataArray:
    return (dn.astype("float32") * SR_SCALE + SR_OFFSET).where(dn > 0)


def ndvi(red: xr.DataArray, nir: xr.DataArray) -> xr.DataArray:
    return (nir - red) / (nir + red)


def composite_from_scenes(ds: xr.Dataset) -> xr.Dataset:
    """Cloud-mask every scene and return per-pixel median LST and NDVI plus the observation count."""
    clear = clear_mask(ds["qa_pixel"])
    lst = scale_lst_celsius(ds["lwir11"]).where(clear)
    lst = lst.where((lst > -10) & (lst < 80))
    nd = ndvi(scale_reflectance(ds["red"]), scale_reflectance(ds["nir08"])).where(clear)
    nd = nd.where((nd >= -1) & (nd <= 1))
    out = xr.Dataset(
        {
            "lst": lst.median("time", skipna=True),
            "ndvi": nd.median("time", skipna=True),
            "n_obs": lst.notnull().sum("time"),
        }
    )
    return out


def search_items(year: int, bbox=config.BBOX, months=config.MONTHS):
    import planetary_computer as pc
    import pystac_client

    catalog = pystac_client.Client.open(config.STAC_URL, modifier=pc.sign_inplace)
    last_day = calendar.monthrange(year, months[-1])[1]
    period = f"{year}-{months[0]:02d}-01/{year}-{months[-1]:02d}-{last_day:02d}"
    search = catalog.search(
        collections=[config.COLLECTION],
        bbox=bbox,
        datetime=period,
        query={
            "platform": {"in": ["landsat-8", "landsat-9"]},
            "eo:cloud_cover": {"lt": config.MAX_SCENE_CLOUD},
        },
    )
    return list(search.items())


def build_year(year: int) -> xr.Dataset | None:
    """Download (lazily) and composite one season. Returns None when no scenes were found."""
    from odc.stac import load

    items = search_items(year)
    if not items:
        return None
    ds = load(
        items,
        bands=["lwir11", "red", "nir08", "qa_pixel"],
        bbox=config.BBOX,
        crs=config.PROCESSING_CRS,
        resolution=config.RESOLUTION,
        groupby="solar_day",
        chunks={"x": 1024, "y": 1024},
    )
    comp = composite_from_scenes(ds).compute()
    comp.attrs["n_scenes"] = int(ds.sizes["time"])
    return comp

import json

import numpy as np
import pytest
import rioxarray  # noqa: F401
import xarray as xr

from geosuren import config
from geosuren.export import export_year, write_meta
from geosuren.landsat import clear_mask, composite_from_scenes, ndvi, scale_lst_celsius


def synthetic_scenes(n_time=3, size=40):
    """Fake Landsat scenes in UTM 45N around Bharatpur."""
    x0, y0 = 240000.0, 3070000.0
    x = x0 + np.arange(size) * 30.0
    y = y0 - np.arange(size) * 30.0
    shape = (n_time, size, size)
    # 40 degC -> DN so that scale_lst_celsius gives ~40
    dn_40c = int((40 + 273.15 - 149.0) / 0.00341802)
    lst = np.full(shape, dn_40c, dtype="uint16")
    red = np.full(shape, int((0.10 + 0.2) / 0.0000275), dtype="uint16")
    nir = np.full(shape, int((0.40 + 0.2) / 0.0000275), dtype="uint16")
    qa = np.zeros(shape, dtype="uint16")
    qa[0, :10, :] = 0b1000  # cloud in scene 0, top rows
    qa[1, 0, 0] = 0b1  # fill pixel
    dims = ("time", "y", "x")
    ds = xr.Dataset(
        {"lwir11": (dims, lst), "red": (dims, red), "nir08": (dims, nir), "qa_pixel": (dims, qa)},
        coords={"time": np.arange(n_time), "y": y, "x": x},
    )
    ds = ds.rio.write_crs(config.PROCESSING_CRS)
    return ds


def test_clear_mask_bits():
    qa = xr.DataArray(np.array([0, 0b1, 0b10, 0b100, 0b1000, 0b10000, 0b100000], dtype="uint16"))
    assert clear_mask(qa).values.tolist() == [True, False, False, False, False, False, True]


def test_lst_scaling():
    dn = xr.DataArray(np.array([0, int((40 + 273.15 - 149.0) / 0.00341802)], dtype="uint16"))
    out = scale_lst_celsius(dn).values
    assert np.isnan(out[0])
    assert out[1] == pytest.approx(40.0, abs=0.05)


def test_ndvi():
    assert float(ndvi(xr.DataArray(0.1), xr.DataArray(0.4))) == pytest.approx(0.6)


def test_composite_masks_clouds_and_counts():
    comp = composite_from_scenes(synthetic_scenes())
    assert float(comp["lst"].mean()) == pytest.approx(40.0, abs=0.1)
    assert float(comp["ndvi"].mean()) == pytest.approx(0.6, abs=0.01)
    assert int(comp["n_obs"].isel(y=0, x=5)) == 2  # cloud in one of three scenes
    assert int(comp["n_obs"].isel(y=20, x=20)) == 3
    assert int(comp["n_obs"].isel(y=0, x=0)) == 1  # cloud + fill


def test_export_and_meta(tmp_path):
    comp = composite_from_scenes(synthetic_scenes()).compute()
    comp.attrs["n_scenes"] = 3
    info = export_year(comp, 2024, tmp_path)
    assert (tmp_path / "lst_2024.png").exists()
    assert (tmp_path / "ndvi_2024.png").exists()
    assert info["stats"]["lst_mean"] == pytest.approx(40.0, abs=0.1)
    (south, west), (north, east) = info["bounds"]
    assert west < east and south < north
    assert 84 < west < 86 and 27 < south < 28  # lands in Chitwan, not elsewhere
    meta_path = write_meta(tmp_path, {2024: info})
    meta = json.loads(meta_path.read_text())
    assert meta["years"] == [2024]
    assert meta["layers"]["lst"]["colors"][0].startswith("#")

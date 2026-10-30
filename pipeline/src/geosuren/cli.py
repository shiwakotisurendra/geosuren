"""Command line: `geosuren build --out data/chitwan`."""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

from . import config
from .export import export_year, load_per_year, save_per_year, write_meta


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="geosuren")
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="build LST/NDVI overlays for each year")
    b.add_argument("--start", type=int, default=config.FIRST_YEAR)
    b.add_argument("--end", type=int, default=dt.date.today().year)
    b.add_argument("--out", type=Path, default=Path("data/chitwan"))
    b.add_argument("--force", action="store_true", help="recompute years that already exist")
    args = p.parse_args(argv)

    from .landsat import build_year  # needs the [stac] extra

    per_year = load_per_year(args.out)
    failed = []
    for year in range(args.start, args.end + 1):
        if year in per_year and not args.force:
            print(f"{year}: already built, skipping")
            continue
        print(f"{year}: searching and compositing ...", flush=True)
        try:
            comp = build_year(year)
            if comp is None:
                print(f"{year}: no scenes found")
                continue
            per_year[year] = export_year(comp, year, args.out)
            print(f"{year}: {per_year[year]['stats']}")
        except Exception as exc:  # keep going; one bad year should not lose the rest
            print(f"{year}: FAILED ({exc})", file=sys.stderr)
            failed.append(year)

    if not per_year:
        print("no data produced", file=sys.stderr)
        return 1
    save_per_year(args.out, per_year)
    write_meta(args.out, per_year)
    print(f"wrote {args.out / 'meta.json'} for years {sorted(per_year)}")
    return 1 if failed and len(failed) == (args.end - args.start + 1) else 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
Mette le prime due pagine di un PDF in una sola pagina.

Uso:
    python pdf_fronte_retro.py input.pdf output.pdf

Per default crea una pagina A4 verticale, con la prima pagina nella meta'
superiore e la seconda nella meta' inferiore, centrate orizzontalmente e
verticalmente dentro le due aree.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from pypdf import PdfReader, PdfWriter, Transformation, PageObject
except ImportError:  # pragma: no cover - messaggio operativo da CLI
    print(
        "Errore: manca la libreria 'pypdf'. Installala con:\n"
        "    python -m pip install pypdf",
        file=sys.stderr,
    )
    raise SystemExit(1)


# Dimensioni PDF in punti (1 punto = 1/72 di pollice)
PAGE_SIZES = {
    "a4": (595.2756, 841.8898),
    "letter": (612.0, 792.0),
}


def page_size(page) -> tuple[float, float]:
    box = page.mediabox
    return float(box.width), float(box.height)


def place_page(
    target,
    source,
    area_left: float,
    area_bottom: float,
    area_width: float,
    area_height: float,
    margin: float,
) -> None:
    source_width, source_height = page_size(source)
    usable_width = max(area_width - (margin * 2), 1)
    usable_height = max(area_height - (margin * 2), 1)
    scale = min(usable_width / source_width, usable_height / source_height)

    placed_width = source_width * scale
    placed_height = source_height * scale
    x = area_left + (area_width - placed_width) / 2
    y = area_bottom + (area_height - placed_height) / 2

    transform = Transformation().scale(scale).translate(tx=x, ty=y)
    target.merge_transformed_page(source, transform)


def make_front_back_page(
    input_pdf: Path,
    output_pdf: Path,
    page_format: str,
    margin: float,
) -> None:
    reader = PdfReader(str(input_pdf))
    if len(reader.pages) < 2:
        raise ValueError("Il PDF deve contenere almeno due pagine.")

    page_width, page_height = PAGE_SIZES[page_format]
    target = PageObject.create_blank_page(width=page_width, height=page_height)

    half_height = page_height / 2
    place_page(target, reader.pages[0], 0, half_height, page_width, half_height, margin)
    place_page(target, reader.pages[1], 0, 0, page_width, half_height, margin)

    writer = PdfWriter()
    writer.add_page(target)
    with output_pdf.open("wb") as handle:
        writer.write(handle)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Unisce le prime due pagine di un PDF in una sola pagina fronte-retro."
    )
    parser.add_argument("input_pdf", type=Path, help="PDF di input con almeno due pagine")
    parser.add_argument("output_pdf", type=Path, help="PDF di output a pagina singola")
    parser.add_argument(
        "--formato",
        choices=sorted(PAGE_SIZES),
        default="a4",
        help="Formato della pagina di output (default: a4)",
    )
    parser.add_argument(
        "--margine",
        type=float,
        default=24.0,
        help="Margine interno in punti per ciascuna meta' pagina (default: 24)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        make_front_back_page(args.input_pdf, args.output_pdf, args.formato, args.margine)
    except Exception as exc:
        print(f"Errore: {exc}", file=sys.stderr)
        return 1

    print(f"Creato: {args.output_pdf}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

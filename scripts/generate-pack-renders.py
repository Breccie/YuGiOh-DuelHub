from __future__ import annotations

from io import BytesIO
from pathlib import Path
from urllib.request import urlopen

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "public" / "pack-renders"

PACK_SOURCES = {
    "LOB": "https://www.yugioh-card.com/en/wp-content/uploads/2022/12/LOB_25th_550.png",
    "MRD": "https://www.yugioh-card.com/en/wp-content/uploads/2022/12/MRD_25th_550.png",
    "SRL": "https://www.yugioh-card.com/en/wp-content/uploads/2022/12/SRL__25th_550.png",
    "PSV": "https://www.yugioh-card.com/en/wp-content/uploads/2022/12/PSV_25th_550.png",
    "IOC": "https://www.yugioh-card.com/en/wp-content/uploads/2022/12/IOC_25th_550.png",
}


def alpha_from_white(r: int, g: int, b: int) -> int:
    minimum = min(r, g, b)
    maximum = max(r, g, b)
    brightness = (r + g + b) / 3

    if minimum >= 249:
        return 0

    if minimum >= 238 and maximum >= 245:
        return max(0, min(255, int((255 - brightness) * 14)))

    return 255


def process_image(image: Image.Image) -> Image.Image:
    source = image.convert("RGBA")
    pixels = source.load()
    width, height = source.size

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            pixels[x, y] = (r, g, b, min(a, alpha_from_white(r, g, b)))

    bounds = source.getbbox()
    if bounds is None:
        return source

    left, top, right, bottom = bounds
    cropped = source.crop(
        (
            max(0, left - 24),
            max(0, top - 24),
            min(width, right + 24),
            min(height, bottom + 24),
        )
    )

    return cropped


def download_image(url: str) -> Image.Image:
    with urlopen(url) as response:
        return Image.open(BytesIO(response.read()))


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for code, url in PACK_SOURCES.items():
        processed = process_image(download_image(url))
        processed.save(OUTPUT_DIR / f"{code}.png")
        print(f"saved {code}.png")


if __name__ == "__main__":
    main()

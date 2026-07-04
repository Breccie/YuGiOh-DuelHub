from __future__ import annotations

from pathlib import Path

from PIL import Image


ICON_SHEETS = [
    {
        "path": Path("assets/icon-sources/icon-sheet-a.png"),
        "cols": 5,
        "rows": 4,
        "names": [
            "brand-eye",
            "profile-signet",
            "nav-start",
            "nav-packs",
            "nav-collection",
            "nav-decks",
            "nav-rules",
            "nav-trade",
            "book",
            "scale",
            "hourglass",
            "package",
            "cart",
            "clock",
            "search",
            "filter",
            "grid",
            "list",
            "edit",
            "dots",
        ],
    },
    {
        "path": Path("assets/icon-sources/icon-sheet-b.png"),
        "cols": 5,
        "rows": 4,
        "names": [
            "settings",
            "logout",
            "mail",
            "users",
            "shield",
            "sword",
            "alert",
            "bell",
            "play",
            "plus",
            "rotate",
            "copy",
            "eye",
            "chevron-left",
            "chevron-right",
            "chevron-down",
            "window-min",
            "window-max",
            "window-close",
            "divider-mark",
        ],
    },
]

OUTPUT_DIR = Path("public/app-assets/icons")


def trim_transparent_bounds(image: Image.Image, padding: int) -> Image.Image:
    alpha = image.getchannel("A")
    bounds = alpha.getbbox()

    if bounds is None:
        return image

    cropped = image.crop(bounds)
    canvas = Image.new(
        "RGBA",
        (cropped.width + padding * 2, cropped.height + padding * 2),
        (0, 0, 0, 0),
    )
    canvas.paste(cropped, (padding, padding))
    return canvas


def split_sheet(sheet_path: Path, cols: int, rows: int, names: list[str]) -> None:
    image = Image.open(sheet_path).convert("RGBA")

    for index, name in enumerate(names):
        row = index // cols
        col = index % cols

        left = round(col * image.width / cols)
        top = round(row * image.height / rows)
        right = round((col + 1) * image.width / cols)
        bottom = round((row + 1) * image.height / rows)
        inset_x = max(6, (right - left) // 18)
        inset_y = max(6, (bottom - top) // 18)
        crop_box = (
            left + inset_x,
            top + inset_y,
            right - inset_x,
            bottom - inset_y,
        )

        cell = image.crop(crop_box)
        padding = max(12, min(cell.width, cell.height) // 10)
        icon = trim_transparent_bounds(cell, padding)
        icon.save(OUTPUT_DIR / f"{name}.png")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for sheet in ICON_SHEETS:
        split_sheet(
            sheet_path=sheet["path"],
            cols=sheet["cols"],
            rows=sheet["rows"],
            names=sheet["names"],
        )


if __name__ == "__main__":
    main()

"""Generates placeholder flyer images for the sample dataset (Pillow).

Real Owl Life flyers would be downloaded through an authorized feed instead; the PRD
notes we must not assume automated access to flyer images.
"""
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .config import FLYER_DIR

W, H = 900, 1200

PALETTES = {  # background, accent, ink
    "tech": ("#111111", "#FFC629", "#FFFFFF"),
    "academic": ("#1F3A5F", "#F4D35E", "#FFFFFF"),
    "career": ("#0B6E4F", "#FFC629", "#FFFFFF"),
    "arts": ("#7B2CBF", "#FFD6FF", "#FFFFFF"),
    "social": ("#FF7A00", "#111111", "#111111"),
    "sports": ("#0077B6", "#FFC629", "#FFFFFF"),
    "faith": ("#5C4033", "#F2E8CF", "#FFFFFF"),
    "service": ("#2D6A4F", "#D8F3DC", "#FFFFFF"),
    "culture": ("#C1121F", "#FFC629", "#FFFFFF"),
    "wellness": ("#B8E0D2", "#1B4332", "#1B4332"),
    "gaming": ("#240046", "#00F5D4", "#FFFFFF"),
    "leadership": ("#FFC629", "#111111", "#111111"),
}

_FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def _font(size: int):
    for path in _FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def render_flyer(slug: str, title: str, host: str, when: str, where: str, theme: str, fmt: str = "png"):
    """Write a flyer; returns (flyer_path, preview_path) relative to /static. pdf gets a png preview."""
    bg, accent, ink = PALETTES.get(theme, PALETTES["tech"])
    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)

    # decorative shapes
    d.ellipse((W - 420, -180, W + 160, 400), fill=accent)
    d.rectangle((0, H - 260, W, H), fill=accent)
    d.ellipse((-140, H - 520, 220, H - 160), outline=accent, width=18)

    d.text((60, 70), host.upper(), font=_font(34), fill=ink)
    y = 300
    for line in textwrap.wrap(title.upper(), width=13)[:5]:
        d.text((60, y), line, font=_font(88), fill=ink)
        y += 118
    d.rectangle((60, y + 20, 260, y + 34), fill=accent)
    d.text((60, y + 70), when, font=_font(44), fill=ink)
    d.text((60, y + 130), where, font=_font(36), fill=ink)

    footer_ink = bg if theme not in ("social", "leadership", "wellness") else "#FFFFFF"
    if theme in ("social", "leadership"):
        footer_ink = "#FFFFFF" if theme == "social" else "#FFC629"
        d.rectangle((0, H - 260, W, H), fill="#111111")
    d.text((60, H - 190), "KSU OWL LIFE", font=_font(56), fill=footer_ink)
    d.text((60, H - 110), "All students welcome", font=_font(36), fill=footer_ink)

    ext = {"png": "png", "jpeg": "jpg", "pdf": "pdf"}[fmt]
    out = FLYER_DIR / f"{slug}.{ext}"
    if fmt == "png":
        img.save(out, "PNG", optimize=True)
        return f"/static/flyers/{out.name}", None
    if fmt == "jpeg":
        img.save(out, "JPEG", quality=86)
        return f"/static/flyers/{out.name}", None
    img.save(out, "PDF", resolution=150)
    preview = FLYER_DIR / f"{slug}-preview.png"
    img.save(preview, "PNG", optimize=True)
    return f"/static/flyers/{out.name}", f"/static/flyers/{preview.name}"

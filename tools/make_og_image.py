#!/usr/bin/env python3
"""Regenerate frontend/public/og-image.png.

The Open Graph and Twitter card tags referenced this file but it was never
committed, so every share preview 404'd. Keeping the generator in the repo means
the asset can be rebuilt when the branding changes.

Usage:  python3 tools/make_og_image.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1200, 630
INK = "#09090b"
ACCENT = "#2563eb"
MUTED = "#64748b"
BADGE_BG = "#ecfdf5"
BADGE_INK = "#065f46"

OUTPUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "og-image.png"

FONT_CANDIDATES = {
    "latin_bold": [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ],
    "korean": [
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
    ],
}


def load_font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES[kind]:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default(size)


def main() -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), "#ffffff")
    draw = ImageDraw.Draw(image)

    # Faint grid, echoing the app background.
    for x in range(0, WIDTH, 40):
        draw.line([(x, 0), (x, HEIGHT)], fill="#eef2f7", width=1)
    for y in range(0, HEIGHT, 40):
        draw.line([(0, y), (WIDTH, y)], fill="#eef2f7", width=1)

    draw.rectangle([0, 0, WIDTH - 1, HEIGHT - 1], outline=INK, width=10)

    title = load_font("latin_bold", 96)
    subtitle = load_font("korean", 42)
    small = load_font("korean", 30)
    badge_font = load_font("korean", 28)

    draw.text((90, 150), "NewFileDate", font=title, fill=INK)
    draw.line([(92, 262), (700, 262)], fill=ACCENT, width=8)

    draw.text((90, 300), "파일 날짜 변경 · 사진 EXIF 촬영일 수정", font=subtitle, fill=INK)
    draw.text((90, 364), "HWP · PPTX · DOCX 문서 작성일 일괄 변경", font=small, fill=MUTED)

    badge_text = "브라우저 로컬 처리 · 무설치 · 무료"
    box = draw.textbbox((0, 0), badge_text, font=badge_font)
    pad_x, pad_y = 26, 16
    bx0, by0 = 90, 460
    bx1 = bx0 + (box[2] - box[0]) + pad_x * 2
    by1 = by0 + (box[3] - box[1]) + pad_y * 2

    draw.rectangle([bx0, by0, bx1, by1], fill=BADGE_BG, outline=INK, width=4)
    draw.text((bx0 + pad_x, by0 + pad_y - box[1]), badge_text, font=badge_font, fill=BADGE_INK)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT, "PNG", optimize=True)
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()

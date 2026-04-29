from __future__ import annotations

from pathlib import Path


def main() -> int:
    try:
        from PIL import Image
    except ModuleNotFoundError as error:
        raise SystemExit(
            "Pillow is required to rebuild the Windows icon. "
            "Install it in a virtual environment and rerun this script."
        ) from error

    project_root = Path(__file__).resolve().parents[1]
    input_path = project_root / "src" / "renderer" / "images" / "icon.png"
    output_paths = [
        project_root / "assets" / "icon.ico",
        project_root / "src" / "renderer" / "images" / "icon.ico",
    ]

    if not input_path.exists():
        raise SystemExit(f"Source icon not found: {input_path}")

    sizes = [
        (16, 16),
        (20, 20),
        (24, 24),
        (32, 32),
        (40, 40),
        (48, 48),
        (64, 64),
        (96, 96),
        (128, 128),
        (256, 256),
    ]

    with Image.open(input_path) as image:
        rgba_image = image.convert("RGBA")
        canvas_size = max(rgba_image.width, rgba_image.height, 256)
        square_canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        offset = (
            (canvas_size - rgba_image.width) // 2,
            (canvas_size - rgba_image.height) // 2,
        )
        square_canvas.paste(rgba_image, offset, rgba_image)

        for output_path in output_paths:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            square_canvas.save(output_path, format="ICO", sizes=sizes)

    print("Rebuilt icons:")
    for output_path in output_paths:
        print(f" - {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

from pathlib import Path
from pypdf import PdfReader

source = Path(r"E:\Internet service Project\All plans.pdf")
output = Path("work/pdfs")
output.mkdir(parents=True, exist_ok=True)

for index, page in enumerate(PdfReader(source).pages, start=1):
    for image_index, image in enumerate(page.images, start=1):
        suffix = Path(image.name).suffix or ".bin"
        target = output / f"page-{index}-{image_index}{suffix}"
        target.write_bytes(image.data)
        print(target)

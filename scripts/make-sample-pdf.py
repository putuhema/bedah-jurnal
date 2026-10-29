"""Writes e2e/sample.pdf: a small 3-page "journal" with real, selectable text (no dependencies)."""

import pathlib
import textwrap

PAGES = [
    ("Why Do We Get Goosebumps From Music?", [
        "Roughly two-thirds of people report experiencing chills while listening to music,",
        "a phenomenon known as frisson. Participants were split into two groups based on",
        "whether they reliably experienced it.",
        "",
        "Those who experience frisson have more fibers connecting the auditory cortex to",
        "emotional areas, suggesting the two regions talk to each other more efficiently.",
    ]),
    ("Triggers", [
        "Chills were most often triggered by unexpected harmonies, sudden changes in",
        "volume, or a soloist emerging from an accompaniment. These moments violate the",
        "listener's expectations in a pleasant way.",
    ]),
    ("Personality", [
        "The frisson group also scored higher on openness to experience, though the",
        "direction of this link remains unclear.",
    ]),
]


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def page_stream(title: str, lines: list[str]) -> bytes:
    out = ["BT", "/F2 20 Tf", "72 760 Td", f"({esc(title)}) Tj", "/F1 12 Tf", "0 -36 Td", "16 TL"]
    for line in lines:
        out.append(f"({esc(line)}) '")
    out.append("ET")
    return "\n".join(out).encode("latin-1")


def build() -> bytes:
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    font1 = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>")
    font2 = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>")
    pages_id = len(objects) + 1 + 2 * len(PAGES)  # reserved below
    page_ids = []
    for title, lines in PAGES:
        stream = page_stream(title, lines)
        content = add(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        page_ids.append(
            add(
                b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 612 792] /Contents %d 0 R "
                b"/Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> >>" % (pages_id, content, font1, font2)
            )
        )
    kids = b" ".join(b"%d 0 R" % p for p in page_ids)
    assert add(b"<< /Type /Pages /Kids [%s] /Count %d >>" % (kids, len(page_ids))) == pages_id
    catalog = add(b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id)

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(pdf)
    pdf += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for off in offsets:
        pdf += b"%010d 00000 n \n" % off
    pdf += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, catalog, xref)
    return bytes(pdf)


if __name__ == "__main__":
    out = pathlib.Path(__file__).resolve().parent.parent / "e2e" / "sample.pdf"
    out.parent.mkdir(exist_ok=True)
    out.write_bytes(build())
    print(textwrap.shorten(f"wrote {out} ({out.stat().st_size} bytes)", 200))

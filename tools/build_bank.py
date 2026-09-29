"""Build a reviewable static question bank from the supplied KOROAD PDF.

The PDF remains outside the output tree. Every question records its source page.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

import fitz


HEAD = re.compile(r"^\s*(\d{1,4})\.\s*")
ANSWER = re.compile(r"■\s*정답\s*[：:]\s*([1-5](?:\s*[,，]\s*[1-5])*)")
EXPLANATION = re.compile(r"■\s*해설\s*[：:]\s*")
CHOICE = re.compile(r"[①②③④⑤]")


def clean(value: str) -> str:
    value = value.replace("\u00a0", " ").replace("\u200b", "")
    return "\n".join(line.rstrip() for line in value.strip().splitlines()).strip()


def headings(doc: fitz.Document) -> list[tuple[int, int, float]]:
    found = []
    for page_index, page in enumerate(doc):
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                value = "".join(span["text"] for span in line["spans"])
                match = HEAD.match(value)
                if match and line["bbox"][0] < 80:
                    found.append((int(match.group(1)), page_index, line["bbox"][1]))
    found.sort(key=lambda item: (item[1], item[2]))
    selected = []
    expected_number = 1
    for item in found:
        if item[0] == expected_number:
            selected.append(item)
            expected_number += 1
    actual = [item[0] for item in selected]
    expected = list(range(1, 1001))
    if actual != expected:
        bad = [(idx + 1, actual[idx] if idx < len(actual) else None) for idx in range(max(len(actual), 1000)) if idx >= len(actual) or idx >= 1000 or actual[idx] != expected[idx]]
        raise ValueError(f"Heading sequence mismatch: {bad[:20]}; total={len(actual)}")
    return selected


def slices(doc: fitz.Document, starts: list[tuple[int, int, float]], idx: int):
    number, start_page, start_y = starts[idx]
    next_page, next_y = (starts[idx + 1][1], starts[idx + 1][2]) if idx + 1 < len(starts) else (len(doc) - 1, doc[-1].rect.height)
    parts = []
    for page_index in range(start_page, next_page + 1):
        page = doc[page_index]
        top = max(0, start_y - 2) if page_index == start_page else 0
        bottom = next_y - 2 if page_index == next_page and idx + 1 < len(starts) else page.rect.height
        rect = fitz.Rect(0, top, page.rect.width, bottom)
        parts.append((page_index, rect, page.get_text(clip=rect)))
    return number, parts


def parse_question(number: int, parts) -> dict:
    raw = clean("\n".join(part[2] for part in parts))
    raw = raw.translate(str.maketrans("ⓛ➀➁➂➃➄", "①①②③④⑤"))
    raw = re.sub(rf"^\s*{number}\.\s*", "", raw, count=1)
    answers = list(ANSWER.finditer(raw))
    if len(answers) != 1:
        raise ValueError(f"Question {number}: expected one answer, found {len(answers)}")
    answer = answers[0]
    pre = clean(raw[: answer.start()])
    after = raw[answer.end() :]
    explanation_match = EXPLANATION.search(after)
    explanation = clean(after[explanation_match.end() :]) if explanation_match else clean(after)
    option_marks = list(CHOICE.finditer(pre))
    if len(option_marks) not in (4, 5):
        raise ValueError(f"Question {number}: option markers={len(option_marks)}")
    stem = clean(pre[: option_marks[0].start()])
    options = [clean(pre[m.end() : option_marks[i + 1].start() if i + 1 < len(option_marks) else len(pre)]) for i, m in enumerate(option_marks)]
    context = ""
    if "\n■" in options[-1]:
        options[-1], context = [clean(piece) for piece in options[-1].split("\n■", 1)]
        context = "■ " + context
    correct = [int(x) for x in re.findall(r"[1-5]", answer.group(1))]
    if not correct or max(correct) > len(options) or any(not option for option in options):
        raise ValueError(f"Question {number}: malformed options/answer")
    return {
        "number": number,
        "stem": stem,
        "options": options,
        "context": context,
        "answer": correct,
        "explanation": explanation,
        "pages": [parts[0][0] + 1, parts[-1][0] + 1],
        "images": [],
        "videoReference": "홈페이지 참조" in stem,
    }


def image_crops(doc: fitz.Document, number: int, parts, destination: Path) -> list[str]:
    saved = []
    for page_index, region, _ in parts:
        page = doc[page_index]
        answer_boxes = [box for box in page.search_for("■ 정답") if box.intersects(region)]
        if answer_boxes:
            region = fitz.Rect(region.x0, region.y0, region.x1, min(box.y0 for box in answer_boxes))
        regions = []
        for image in page.get_images(full=True):
            for box in page.get_image_rects(image[0]):
                if box.intersects(region) and box.get_area() > 150:
                    regions.append(box & region)
        # Overlapping PDF image objects can render as one composition.
        seen = set()
        for box in regions:
            key = tuple(round(x, 1) for x in box)
            if key in seen:
                continue
            seen.add(key)
            clip = fitz.Rect(max(0, box.x0 - 3), max(region.y0, box.y0 - 3), min(page.rect.width, box.x1 + 3), min(region.y1, box.y1 + 3))
            pix = page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6), clip=clip, alpha=False)
            filename = f"q{number:04d}-{len(saved)+1}.png"
            pix.save(destination / filename)
            saved.append(f"images/{filename}")
    return saved


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("site", type=Path)
    args = parser.parse_args()
    doc = fitz.open(args.pdf)
    starts = headings(doc)
    image_dir = args.site / "images"
    image_dir.mkdir(parents=True, exist_ok=True)
    for stale in image_dir.glob("q*.png"):
        stale.unlink()
    rows = []
    for index in range(len(starts)):
        number, parts = slices(doc, starts, index)
        row = parse_question(number, parts)
        row["images"] = image_crops(doc, number, parts, image_dir)
        rows.append(row)
    (args.site / "questions.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    report = {
        "source": args.pdf.name,
        "sha256": hashlib.sha256(args.pdf.read_bytes()).hexdigest(),
        "pages": len(doc),
        "questions": len(rows),
        "multiAnswer": sum(len(x["answer"]) > 1 for x in rows),
        "withImages": sum(bool(x["images"]) for x in rows),
        "imageFiles": sum(len(x["images"]) for x in rows),
        "videoReferences": sum(x["videoReference"] for x in rows),
        "emptyExplanations": [x["number"] for x in rows if not x["explanation"]],
    }
    (args.site / "build-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

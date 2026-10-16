#!/usr/bin/env python3
"""Import supplied NESA Mathematics Standard HSC papers into Quiz Tool."""
from __future__ import annotations

import json
import re
from pathlib import Path
import pdfplumber
from PIL import ImageChops, Image

ROOT = Path(__file__).resolve().parents[1]
STORAGE = ROOT / "quiz-tool" / "storage"
SOURCE = Path(r"C:\Users\Ethan\Desktop\school\HSC\math")
PACK = "https://www.nsw.gov.au/education-and-training/nesa/curriculum/hsc-exam-papers/mathematics-standard/{year}"
MG24_1 = "https://www.nsw.gov.au/sites/default/files/noindex/2025-05/2024-hsc-maths-std-1-mg.pdf"
MG24_2 = "https://www.nsw.gov.au/sites/default/files/noindex/2025-05/2024-hsc-maths-std-2-mg.pdf"
MG25_2 = "https://www.nsw.gov.au/sites/default/files/noindex/2025-11/2025-hsc-maths-standard-2-mg.pdf"

PAPERS = [
    {"year": 2024, "level": 1, "paper": "2024-hsc-maths-std-1.pdf", "mg": "2024-hsc-maths-std-1-mg-extracted.txt", "mcq": 10, "start": 11, "end": 32, "total": 70, "key": "CBADCBADDA", "paperUrl": "https://www.nsw.gov.au/sites/default/files/noindex/2025-05/2024-hsc-maths-std-1.pdf", "mgUrl": MG24_1},
    {"year": 2024, "level": 2, "paper": "2024-hsc-maths-std-2.pdf", "mg": "2024-hsc-maths-std-2-mg-extracted.txt", "mcq": 15, "start": 16, "end": 41, "total": 85, "key": "DCABAADCBDBCADB", "paperUrl": "https://www.nsw.gov.au/sites/default/files/noindex/2025-05/2024-hsc-maths-std-2.pdf", "mgUrl": MG24_2},
    {"year": 2025, "level": 2, "paper": "2025-hsc-maths-standard-2.pdf", "mg": "2025-hsc-maths-standard-2-mg.pdf", "mcq": 15, "start": 16, "end": 40, "total": 85, "key": "BACDDBCA B A C D A C D".replace(" ", ""), "paperUrl": "https://www.nsw.gov.au/sites/default/files/noindex/2025-10/2025-hsc-maths-standard-2.pdf", "mgUrl": "https://www.nsw.gov.au/sites/default/files/noindex/2025-11/2025-hsc-maths-standard-2-mg.pdf"},
]

def normalize(text: str) -> str:
    text = text.replace("\u0000", " ").replace("\ufffd", " ")
    text = re.sub(r"Office Use Only.*?(?:below this line\.)", " ", text, flags=re.I | re.S)
    text = re.sub(r"Do\s+NOT\s+write\s+in\s+this\s+area\.?", " ", text, flags=re.I)
    text = re.sub(r"\bQuestion\s+\d+\s*(?:\(\d+\s+marks?\)|\(continued\)|continues?\s+on\s+page\s+\d+)\s*", " ", text, flags=re.I)
    text = re.sub(r"(?<=[.!?])\s+[1-4](?=\s|$)", " ", text)
    text = re.sub(r"\.{5,}", " ", text)
    text = re.sub(r"(?m)^\s*[–-]\s*\d+\s*[–-]\s*$", " ", text)
    text = re.sub(r"(?m)^\s*\d{8,}\s*$", " ", text)
    text = re.sub(r"(?m)^\s*(?:Please turn over|BLANK PAGE|©.*|Page \d+ of \d+)\s*$", " ", text, flags=re.I)
    # Axis ticks and rotated axis labels are also present in the diagram crop.
    text = re.sub(r"\b(?:\d{1,4}\s+){3,}\d{1,4}\b", " ", text)
    text = re.sub(r"\b(?:etar traeH|noitalupoP)\b", " ", text)
    text = re.sub(r"\betar traeH\b(?:\s+(?:\d+|KEY|After|Before))+", " ", text)
    text = re.sub(r"\bKEY(?:\s+(?:After|Before|\d+))*\b", " ", text)
    text = re.sub(r"(?<!\w)(?:11\s+000\s+)?(?:10\s+000\s+)?(?:9000\s+)?(?:8000\s+)?(?:7000\s+)?(?:6000\s+)?(?:5000\s+)?(?:4000\s+)?(?:3000\s+)?(?:2000\s+)?(?:1000\s+)?Number of people\s+\)\$\(", " ", text)
    text = text.replace("norm distributed", "normally distributed").replace("watc Anime", "watching Anime")
    text = text.replace("acti etar traeH 160 140 KEY 120 After 100 Before", "activity")
    text = re.sub(r"(?<=activity\.)\s+Jo\s+Kim\s+Lee\s+Mal\b", " ", text)
    text = re.sub(r"\b\d+\s+\)\$\(\s+tessa fo eulaV\b.*?\bNumber of years\b", " ", text, flags=re.I)
    text = re.sub(r"\bPopulatiox\b", " ", text)
    text = re.sub(r"\s+", " ", text)
    return re.sub(r"\s+", " ", text).strip()

def answer_guide(text: str) -> dict[str, str]:
    """Index NESA's written criteria and sample answers by question/subpart."""
    text = text.lstrip("\ufeff")
    if text.startswith('"'):
        try:
            text = json.loads(text)
        except json.JSONDecodeError:
            pass
    result = {}
    matches = list(re.finditer(r"(?m)^(?:L\d+@P\d+(?:-\d+)?:\s*)?(?:Page\s+\d+\s+of\s+\d+\s+)?Question\s+(\d+)\s*(?:\((a|b|c|d)\))?\s*(?:\((i{1,3}|iv)\))?\s*$", text))
    for i, m in enumerate(matches):
        key = m[1] + (m[2] or "") + (m[3] or "")
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chunk = text[m.end():end]
        lines = []
        for line in chunk.splitlines():
            line = re.sub(r"^L\d+@P\d+(?:-\d+)?:\s*", "", line)
            if re.search(r"NESA .*Marking Guidelines|Page \d+ of \d+", line):
                continue
            lines.append(line)
        chunk = "\n".join(lines).strip()
        if "Criteria Marks" in chunk:
            result[key] = chunk
    return result

def marks_from_guide(guidance: str, fallback: int) -> int:
    vals = [int(n) for n in re.findall(r"(?m)^\s*(?:[•·�]|-).+?\s([1-9])\s*$", guidance)]
    return max(vals) if vals else fallback

def marking_levels(guidance: str, marks: int) -> dict[str, str]:
    criteria = []
    for line in guidance.splitlines():
        match = re.match(r"\s*[•·�-]\s*(.+?)\s+([1-9])\s*$", line)
        if match:
            criteria.append((int(match[2]), match[1].strip()))
    levels = {"0": "No relevant correct response or working."}
    for score in range(1, marks + 1):
        relevant = [text for value, text in criteria if value <= score]
        if score == marks:
            text = "; ".join(text for value, text in criteria if value == marks)
            levels[str(score)] = (f"Meets the full-mark criteria: {text}." if text else "Complete correct response meeting the NESA criteria.")
        elif relevant:
            levels[str(score)] = f"Award {score} mark(s) for demonstrated progress, including: {'; '.join(relevant)}."
        else:
            levels[str(score)] = f"Award {score} mark(s) only for relevant working that demonstrates progress toward the NESA criteria."
    return levels

def reviewed_prompt(prompt: str, conf: dict, suffix: str, section: str) -> str:
    """Restore notation lost by PDF layout, checked against the supplied pages."""
    fixes = {
        (2024, 2, "S1", "1"): [("x 2 rounded", "x² rounded")],
        (2025, 2, "S1", "4"): [("annual leave 1 loading is 17 % of four weeks pay", "annual leave loading is 17½% of four weeks’ pay")],
        (2025, 2, "S1", "6"): [("n = m − p . q", "n = (m − p) / q")],
        (2025, 2, "S1", "7"): [("chosen survey", "chosen for a survey")],
        (2025, 2, "S1", "8"): [("frequency histogram shows results", "frequency histogram shows the results")],
        (2025, 2, "S1", "9"): [("ratio of the dimensions of a model car to the dimensions of an actual car is 1", "ratio of the dimensions of a model car to the dimensions of an actual car is 1:64.")],
        (2025, 2, "S1", "10"): [("electricity used, U, pays customers", "electricity used, U, and pays customers")],
        (2025, 2, "S1", "11"): [("surface area the balloon", "surface area of the balloon")],
        (2024, 2, "S2", "22"): [("y = A # ^1.055hx", "y = A × 1.055^x"), ("y = B # ^0.97hx", "y = B × 0.97^x")],
        (2024, 2, "S2", "24a"): [("can be estimated by where N", "can be estimated by BAC_female = (10N − 7.5H) / (5.5M), where N")],
        (2025, 2, "S2", "22"): [("y = A # ^1.055hx", "y = A × 1.055^x"), ("y = B # ^0.97hx", "y = B × 0.97^x")],
    }
    for before, after in fixes.get((conf["year"], conf["level"], section, suffix), []):
        prompt = prompt.replace(before, after)
    prompt = prompt.replace("minimum spanning for this network", "minimum spanning tree for this network")
    prompt = prompt.replace("is greater the probability of", "is greater than the probability of")
    prompt = prompt.replace("The travel graph shows the distance of a runner from a town. Time Between", "The travel graph shows the distance of a runner from a town. Between")
    prompt = prompt.replace("frequency histogram shows the results. Red White Green Yellow Colours", "frequency histogram shows the results.")
    prompt = prompt.replace("Number of years since 1985 Complete the table", "Complete the table")
    prompt = prompt.replace("norm distributed", "normally distributed").replace("50 p", "50")
    prompt = prompt.replace(" as time varies? Time Time", " as time varies?")
    prompt = re.sub(r"\bNOT TO SCALE\b|\bTO SCALE\b", "", prompt)
    prompt = re.sub(r"\s+Questions?\s+\d+[–-]\d+\s+are worth \d+ marks? in total\.?", "", prompt, flags=re.I)
    prompt = re.sub(r"(?i)depreciation\.\s*(?:After\s+)?the end of the 4th year", "depreciation. After the end of the 4th year", prompt)
    prompt = prompt.replace("asset. Number of years For the first", "asset. For the first")
    if conf["year"] == 2024 and conf["level"] == 1 and section == "S1" and suffix == "10":
        prompt = "A cyclist rides a bicycle at a constant speed around a circular track. Which of the graphs best illustrates the distance of the cyclist from the centre of the track as time varies?"
    if conf["year"] == 2024 and conf["level"] == 2 and section == "S1" and suffix == "13":
        prompt = prompt.replace("monthly repayments of over 4 years", "monthly repayments of $300 over 4 years")
    return normalize(prompt)

def graphics_crop(page, path: Path, y0: float = 95, y1: float = 560) -> bool:
    # PDF vector objects hold diagrams/tables separately from the prose. Cropping
    # their bounds avoids a full-page screenshot and preserves labels in drawings.
    table_boxes = [bbox for bbox, _rows in native_tables(page, y0, y1)]
    objects = [o for k in ("image", "rect", "line", "curve") for o in page.objects.get(k, [])
               if o.get("x0", 0) > 55 and o.get("x1", 0) < page.width - 25
               and o.get("top", 0) >= y0 and o.get("bottom", 0) <= y1
               and not any(o["x0"] < x1 and o["x1"] > x0 and o["top"] < bottom and o["bottom"] > top
                           for x0, top, x1, bottom in table_boxes)
               and not (o.get("object_type") == "line" and o.get("width", 0) > 320 and o.get("height", 0) < 1.5)]
    if len(objects) < 4:
        return False
    # Keep the largest contiguous figure cluster. This separates a question's
    # diagram from vector fraction bars, answer lines and other page furniture.
    objects.sort(key=lambda o: (o["top"], o["x0"]))
    bands = []
    for obj in objects:
        band = next((b for b in bands if obj["top"] <= b[1] + 12 and obj["bottom"] >= b[0] - 12), None)
        if band is None:
            bands.append([obj["top"], obj["bottom"], obj["x0"], obj["x1"], 1])
        else:
            band[0] = min(band[0], obj["top"])
            band[1] = max(band[1], obj["bottom"])
            band[2] = min(band[2], obj["x0"])
            band[3] = max(band[3], obj["x1"])
            band[4] += 1
    bands = [b for b in bands if b[3] - b[2] > 35 and b[1] - b[0] > 12 and (b[3] - b[2]) * (b[1] - b[0]) > 2500]
    if not bands:
        return False
    top0, bottom0, left0, right0, _count = max(bands, key=lambda b: ((b[3] - b[2]) * (b[1] - b[0]), b[4]))
    x0 = max(55, left0 - 55)
    top = max(90, top0 - 14)
    x1 = min(page.width - 25, right0 + 55)
    bottom = min(570, bottom0 + 18)
    if x1 - x0 < 30 or bottom - top < 20:
        return False
    im = page.crop((x0, top, x1, bottom)).to_image(resolution=160).original.convert("RGB")
    bounds = ImageChops.difference(im, Image.new("RGB", im.size, "white")).getbbox()
    if not bounds:
        return False
    im.crop(bounds).save(path, optimize=True)
    return True

def native_tables(page, y0: float, y1: float):
    """Return populated source tables and their bounding boxes, excluding answer grids."""
    found = []
    for table in page.find_tables():
        x0, top, x1, bottom = table.bbox
        if bottom <= y0 or top >= y1:
            continue
        rows = table.extract()
        if not rows:
            continue
        cleaned = [[(cell or "").strip() for cell in row] for row in rows]
        nonempty = sum(bool(cell) for row in cleaned for cell in row)
        columns = max((len(row) for row in cleaned), default=0)
        # Ignore the PDF's empty writing/answer grids. They are not source tables.
        if nonempty < 5 or columns < 2:
            continue
        found.append((table.bbox, cleaned))
    return found

def table_block(rows, label=""):
    """Convert an extracted, visually reviewed text table to the Quiz Tool schema."""
    if len(rows) < 2:
        return None
    width = max(len(row) for row in rows)
    rows = [row + [""] * (width - len(row)) for row in rows]
    headers = rows[0]
    if len(headers) >= 2 and headers[0] and all(headers[1:]):
        return {
            "type": "table", "caption": label,
            "columns": headers,
            "rows": [[{"text": cell, "header": col == 0} for col, cell in enumerate(row)] for row in rows[1:]]
        }
    return {
        "type": "table", "caption": label, "columns": [],
        "rows": [[{"text": cell, "header": col == 0} for col, cell in enumerate(row)] for row in rows]
    }

def order_stimuli(prompt, stimulus_blocks):
    """Place figures/tables after the prose that introduces them, without duplicating text."""
    if not stimulus_blocks:
        return [{"type": "text", "text": prompt}] if prompt else []
    cue = re.search(r"[^.!?]*\b(?:table|diagram|graph|map|network|plot|shown)\b[^.!?]*[.!?]", prompt, re.I)
    if cue and cue.end() < len(prompt):
        before, after = prompt[:cue.end()].strip(), prompt[cue.end():].strip()
        blocks = ([{"type": "text", "text": before}] if before else []) + stimulus_blocks
        if after:
            blocks.append({"type": "text", "text": after})
        return blocks
    return [{"type": "text", "text": prompt}, *stimulus_blocks]

def crop_graph_choice_panel(page, path: Path, box) -> bool:
    """Reviewed crop for a panel of graphical A–D answer choices."""
    image = page.crop(box).to_image(resolution=160).original.convert("RGB")
    bounds = ImageChops.difference(image, Image.new("RGB", image.size, "white")).getbbox()
    if not bounds:
        return False
    image.crop(bounds).save(path, optimize=True)
    return True

def prose_without_figures(page, y0: float, y1: float) -> str:
    """Extract prompt lines while excluding words inside source tables and figures."""
    tables = native_tables(page, y0, y1)
    regions = [bbox for bbox, _rows in tables]
    # Group vector objects into tight vertical bands. Their printed labels belong
    # to the diagram crop, not to the searchable prose prompt.
    objects = [o for k in ("image", "rect", "line", "curve") for o in page.objects.get(k, [])
               if o.get("x0", 0) > 55 and o.get("x1", 0) < page.width - 25
               and o.get("top", 0) >= y0 and o.get("bottom", 0) <= y1
               and not (o.get("object_type") == "line" and o.get("width", 0) > 320 and o.get("height", 0) < 1.5)]
    if objects:
        objects.sort(key=lambda o: (o["top"], o["x0"]))
        bands = []
        for obj in objects:
            band = next((b for b in bands if obj["top"] <= b[1] + 20 and obj["bottom"] >= b[0] - 20), None)
            if band is None:
                bands.append([obj["top"], obj["bottom"], obj["x0"], obj["x1"]])
            else:
                band[0] = min(band[0], obj["top"])
                band[1] = max(band[1], obj["bottom"])
                band[2] = min(band[2], obj["x0"])
                band[3] = max(band[3], obj["x1"])
        regions.extend((max(55, x0 - 50), max(y0, top - 8), min(page.width - 25, x1 + 50), min(y1, bottom + 8))
                       for top, bottom, x0, x1 in bands if x1 - x0 > 35 and bottom - top > 12)
    words = page.crop((55, y0, page.width - 25, y1)).extract_words()
    lines = []
    for word in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if word["x0"] > page.width - 95:  # exam mark in the outer page margin
            continue
        cx, cy = (word["x0"] + word["x1"]) / 2, (word["top"] + word["bottom"]) / 2
        if any(x0 <= cx <= x1 and top <= cy <= bottom for x0, top, x1, bottom in regions):
            continue
        line = next((row for row in lines if abs(row[0] - word["top"]) <= 3), None)
        if line is None:
            lines.append([word["top"], [word]])
        else:
            line[1].append(word)
    return "\n".join(" ".join(word["text"] for word in sorted(row[1], key=lambda w: w["x0"]))
                     for row in sorted(lines, key=lambda row: row[0]))

def pages_for_questions(pdf, first: int, last: int):
    found = {}
    for pi, page in enumerate(pdf.pages):
        text = page.extract_text() or ""
        matches = list(re.finditer(r"(?m)^Question\s+(\d+)\s*(?:\((?:\d+ marks?|continued)\)|continues?)", text))
        positioned = []
        for line in page.extract_text_lines():
            hm = re.match(r"^Question\s+(\d+)\s*(?:\((?:\d+ marks?|continued)\)|continues?)", line["text"])
            if hm:
                positioned.append((int(hm[1]), line["top"]))
        positioned.sort(key=lambda x: x[1])
        for i, m in enumerate(matches):
            number = int(m[1])
            if first <= number <= last:
                end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
                hpos = next((j for j, (qn, _top) in enumerate(positioned) if qn == number), None)
                top = positioned[hpos][1] if hpos is not None else 95
                bottom = positioned[hpos + 1][1] - 3 if hpos is not None and hpos + 1 < len(positioned) else 740
                body = prose_without_figures(page, top, bottom)
                body = re.sub(r"^Question\s+\d+\s*(?:\((?:\d+ marks?|continued)\)|continues?)\s*", "", body)
                found.setdefault(number, []).append((pi, page, body, top, bottom))
    # A continuation notice may be printed on the same page as the question and
    # be detected as a second heading. Keep one full-page segment per source page.
    for number, parts in found.items():
        by_page = {}
        for part in parts:
            pi, page, body, top, bottom = part
            if pi not in by_page:
                by_page[pi] = [pi, page, body, top, bottom]
            else:
                by_page[pi][3] = min(by_page[pi][3], top)
                by_page[pi][4] = max(by_page[pi][4], bottom)
                by_page[pi][2] = prose_without_figures(page, by_page[pi][3], by_page[pi][4])
        found[number] = list(by_page.values())
    return found

def section_one(pdf, conf, metadata):
    key = conf["key"]
    questions = []
    expected = 1
    # Questions begin on the first paper page after the cover. Each is bounded
    # by the next question number in the extracted reading order.
    pages = pdf.pages[1:9]
    for page_no, page in enumerate(pages, start=2):
        text = page.extract_text() or ""
        starts = []
        for line in page.extract_text_lines():
            sm = re.match(r"^(\d{1,2})\s+\S", line["text"])
            if sm and line["x0"] < 90 and 50 < line["top"] < 740:
                starts.append((int(sm[1]), line["top"]))
        starts.sort(key=lambda x: x[1])
        for i, m in enumerate(starts):
            n, y0 = m
            if n != expected:
                continue
            next_start = next((x for x in starts[i + 1:] if x[0] == n + 1), None)
            y1 = next_start[1] - 3 if next_start else 760
            # Build searchable prompt text without diagram labels or table cells.
            lines = [prose_without_figures(page, y0, y1)]
            if lines:
                lines[0] = re.sub(r"^\s*\d{1,2}\s+", "", lines[0])
            raw = "\n".join(lines)
            option_marks = list(re.finditer(r"(?<![A-Za-z0-9])([A-D])\.\s+", raw))
            options = {x: [] for x in "ABCD"}
            if len(option_marks) >= 4:
                stem = normalize(raw[:option_marks[0].start()])
                for oi, mark in enumerate(option_marks):
                    stop = option_marks[oi + 1].start() if oi + 1 < len(option_marks) else len(raw)
                    options[mark[1]].append(raw[mark.end():stop].strip())
            else:
                stem = normalize(raw)
            answers = []
            for idx, letter in enumerate("ABCD"):
                choice = normalize(" ".join(options[letter]))
                answers.append({"text": choice or letter, "correct": key[n - 1] == letter})
            # These right-triangle options use stacked fraction numerators in
            # the source PDF; reading order interleaves those glyphs by column.
            if re.search(r"correct expression for the length of x", stem, re.I):
                answers = [
                    {"text": "20 cos 40°", "correct": key[n - 1] == "A"},
                    {"text": "20 sin 40°", "correct": key[n - 1] == "B"},
                    {"text": "20 / cos 40°", "correct": key[n - 1] == "C"},
                    {"text": "20 / sin 40°", "correct": key[n - 1] == "D"},
                ]
            stem = reviewed_prompt(stem, conf, str(n), "S1")
            if conf["year"] == 2024 and conf["level"] == 2 and n == 10:
                stem = "Consider the formula s = wt + p/2. Which of the following correctly shows p as the subject of the formula?"
            if conf["year"] == 2025 and conf["level"] == 2 and n == 13:
                answers = [
                    {"text": "1/17", "correct": key[n - 1] == "A"},
                    {"text": "1/11", "correct": key[n - 1] == "B"},
                    {"text": "1/10", "correct": key[n - 1] == "C"},
                    {"text": "1/9", "correct": key[n - 1] == "D"},
                ]
            if conf["year"] == 2024 and conf["level"] == 2 and n == 9:
                answers = [{"text": a["text"].replace("50 p", "50"), "correct": a["correct"]} for a in answers]
            question = {"id": f"math{conf['year']}-s{conf['level']}-q{n}", "name": f"Question {n}", "question": stem, **metadata,
                        "isMultipleChoice": True, "isCheckbox": False, "answers": answers}
            table_stimuli = []
            for table_index, (_bbox, rows) in enumerate(native_tables(page, y0, y1), start=1):
                block = table_block(rows, f"Question {n} table")
                if block:
                    table_stimuli.append(block)
            # Graphs and geometry in Section I are vector objects. Use a
            # question-page crop when graphics occur, never a full-page image.
            safe = f"diagram-s{conf['level']}-q{n}-1.png"
            out = STORAGE / "maths" / str(conf["year"])
            out.mkdir(parents=True, exist_ok=True)
            stimulus = list(table_stimuli)
            has_graphic_prompt = re.search(r"\b(?:graphs?|diagrams?|maps?|network|plots?|histograms?|spinners?|wheel|shape|triangle|function|scatter\s*plot|box\s*plot)\b", stem, re.I)
            manual = []
            # Reviewed crops: the printed graph options for Q2 (2025 Standard 2)
            # and the separate diagram/graph panels for Q9–10 (2024 Standard 1).
            if conf["year"] == 2025 and conf["level"] == 2 and n == 2:
                if crop_graph_choice_panel(page, out / safe, (95, 500, 495, 765)):
                    manual.append({"type": "image", "path": f"maths/{conf['year']}/{safe}", "page": page_no, "alt": "Graphs A–D for Question 2"})
            elif conf["year"] == 2024 and conf["level"] == 2 and n == 2:
                if crop_graph_choice_panel(page, out / safe, (180, 345, 430, 510)):
                    manual.append({"type": "image", "path": f"maths/{conf['year']}/{safe}", "page": page_no, "alt": "Linear function graph for Question 2"})
            elif conf["year"] == 2025 and conf["level"] == 2 and n == 8:
                if crop_graph_choice_panel(page, out / safe, (160, 110, 410, 270)):
                    manual.append({"type": "image", "path": f"maths/{conf['year']}/{safe}", "page": page_no, "alt": "Frequency histogram for the spinner results"})
                second = safe.replace("-1.png", "-2.png")
                if crop_graph_choice_panel(page, out / second, (95, 300, 500, 640)):
                    manual.append({"type": "image", "path": f"maths/{conf['year']}/{second}", "page": page_no, "alt": "Spinner choices A–D"})
            elif conf["year"] == 2024 and conf["level"] == 1 and n == 9:
                if crop_graph_choice_panel(page, out / safe, (150, 110, 500, 210)):
                    manual.append({"type": "image", "path": f"maths/{conf['year']}/{safe}", "page": page_no, "alt": "Equilateral and isosceles triangles for Question 9"})
            elif conf["year"] == 2024 and conf["level"] == 1 and n == 10:
                stem = "A cyclist rides a bicycle at a constant speed around a circular track. Which of the graphs best illustrates the distance of the cyclist from the centre of the track as time varies?"
                if crop_graph_choice_panel(page, out / safe, (130, 360, 470, 490)):
                    manual.append({"type": "image", "path": f"maths/{conf['year']}/{safe}", "page": page_no, "alt": "Cyclist travelling around a circular track"})
                second = safe.replace("-1.png", "-2.png")
                if crop_graph_choice_panel(page, out / second, (90, 530, 470, 780)):
                    manual.append({"type": "image", "path": f"maths/{conf['year']}/{second}", "page": page_no, "alt": "Distance–time graph choices A–D"})
            if manual:
                stimulus.extend(manual)
            elif has_graphic_prompt and graphics_crop(page, out / safe, y0 + 12, y1):
                stimulus.append({"type": "image", "path": f"maths/{conf['year']}/{safe}", "page": page_no, "alt": f"Question {n} exam diagram"})
            if stimulus:
                if conf["year"] == 2024 and conf["level"] == 1 and n == 10 and len(manual) == 2:
                    question["questionContent"] = [
                        {"type": "text", "text": "A cyclist rides a bicycle at a constant speed around a circular track."},
                        manual[0],
                        {"type": "text", "text": "Which of the graphs best illustrates the distance of the cyclist from the centre of the track as time varies?"},
                        manual[1],
                    ]
                elif conf["year"] == 2025 and conf["level"] == 2 and n == 8 and len(manual) == 2:
                    question["questionContent"] = [
                        {"type": "text", "text": "A spinner made up of 4 colours is spun 100 times. The frequency histogram shows the results."},
                        manual[0],
                        {"type": "text", "text": "Which of these spinners is most likely to give the results shown?"},
                        manual[1],
                    ]
                else:
                    question["questionContent"] = order_stimuli(stem, stimulus)
            questions.append(question)
            expected += 1
            if expected > conf["mcq"]:
                break
    questions.sort(key=lambda q: int(re.search(r"q(\d+)$", q["id"])[1]))
    if len(questions) != conf["mcq"]:
        raise ValueError(f"{conf['year']} Standard {conf['level']}: found {len(questions)} MCQ, expected {conf['mcq']}")
    return questions

def written_questions(pdf, guide, conf, metadata):
    found = pages_for_questions(pdf, conf["start"], conf["end"])
    guide_map = answer_guide(guide)
    output = []
    for n in range(conf["start"], conf["end"] + 1):
        parts = found.get(n, [])
        if not parts:
            raise ValueError(f"Missing question {n} in {conf['year']} Standard {conf['level']}")
        # NESA guide headings determine independently marked subparts.
        part_keys = [k for k in guide_map if (m := re.fullmatch(str(n) + r"([a-d])(i{1,3}|iv)?", k))]
        chunks = []
        for pi, page, body, top, bottom in parts:
            body = normalize(body)
            # Remove common page header/footer text retained by extraction.
            body = re.sub(r"\b(?:Office Use Only|Do NOT write anything|make any marks below this line)\b", "", body, flags=re.I)
            chunks.append((pi, page, body, top, bottom))
        if part_keys:
            all_text = " ".join(x[2] for x in chunks)
            matches = list(re.finditer(r"\(([a-d])\)(?:\s*\((i{1,3}|iv)\))?\s+", all_text))
            context = all_text[:matches[0].start()].strip() if matches else ""
            for part_id in part_keys:
                parsed = re.fullmatch(str(n) + r"([a-d])(i{1,3}|iv)?", part_id)
                label, roman = parsed[1], parsed[2] or ""
                marker = next((m for m in matches if m[1] == label and (m[2] or "") == roman), None)
                if marker:
                    stop = next((m.start() for m in matches if m.start() > marker.start()), len(all_text))
                    prompt = " ".join(x for x in [context, all_text[marker.end():stop].strip()] if x)
                else:
                    prompt = all_text
                guidance = guide_map.get(part_id, "")
                max_marks = marks_from_guide(guidance, 1)
                output.append(make_written(prompt, guidance, max_marks, conf, metadata, part_id, chunks))
        else:
            prompt = " ".join(x[2] for x in chunks)
            guidance = guide_map.get(str(n), "")
            max_marks = marks_from_guide(guidance, 1)
            output.append(make_written(prompt, guidance, max_marks, conf, metadata, str(n), chunks))
    return output

def make_written(prompt, guidance, marks, conf, metadata, suffix, chunks):
    prompt = reviewed_prompt(prompt, conf, suffix, "S2")
    out = STORAGE / "maths" / str(conf["year"])
    out.mkdir(parents=True, exist_ok=True)
    asset = f"diagram-s{conf['level']}-q{suffix}-1.png"
    stimulus = []
    for i, chunk in enumerate(chunks, start=1):
        pi, page, _body, top, bottom = chunk
        for _bbox, rows in native_tables(page, top, bottom):
            block = table_block(rows, f"Question {suffix} table")
            if block and re.search(r"\b(?:complete|fill in)\b.*\btable\b", prompt, re.I):
                for row in block["rows"]:
                    for cell in row:
                        if isinstance(cell, dict) and cell.get("text", "") == "":
                            cell.update({"input": True, "label": f"{block['caption']} response"})
            if block and not any(existing.get("caption") == block.get("caption") for existing in stimulus):
                stimulus.append(block)
        current_asset = asset if i == 1 else asset.replace("-1.png", f"-{i}.png")
        has_graphic_prompt = re.search(r"\b(?:graphs?|diagrams?|maps?|network|plots?|figure|histograms?|spinners?|wheel|shape|triangle|scatter\s*plot|box\s*plot)\b", prompt, re.I)
        if has_graphic_prompt and graphics_crop(page, out / current_asset, top + 5, bottom):
            stimulus.append({"type": "image", "path": f"maths/{conf['year']}/{current_asset}", "page": pi + 1, "alt": f"Question {suffix} exam diagram"})
    blocks = order_stimuli(prompt, stimulus)
    part_match = re.fullmatch(r"(\d+)([a-d])(i{1,3}|iv)?", suffix)
    if not part_match:
        name = f"Question {suffix}"
    else:
        name = f"Question {part_match[1]} ({part_match[2]})" + (f" ({part_match[3]})" if part_match[3] else "")
    q = {"id": f"math{conf['year']}-s{conf['level']}-q{suffix}", "name": name, "question": prompt,
         **metadata, "questionContent": blocks, "marks": marks, "isAICheck": True,
         "answer": "Use the NESA marking criteria and sample answer below. Accept equivalent correct reasoning and working, valid follow-through and appropriate rounding. Only credit evidence present in the response.\n" + guidance,
         "markingLevels": marking_levels(guidance, marks)}
    all_tables = [b for b in blocks if b.get("type") == "table"]
    response_tables = [b for b in all_tables if any(isinstance(c, dict) and c.get("input") for row in b.get("rows", []) for c in row)]
    if response_tables:
        if re.search(r"\b(?:complete|fill in)\b.*\btable\b", prompt, re.I) and len(response_tables) == 1:
            q["showWrittenAnswer"] = False
    if all_tables:
        fixed = []
        for block in all_tables:
            fixed.append(f"{block.get('caption','Table')}: columns {', '.join(block.get('columns', []))}; " + "; ".join(
                " | ".join((c.get("text", "") if isinstance(c, dict) else str(c)) for c in row) for row in block.get("rows", [])))
        q["answer"] += "\n\nQuestion table context: " + " ".join(fixed)
    if re.search(r"\b(draw|sketch|plot)\b", prompt, re.I):
        q["responseFormat"] = "drawing-description"
    return q

def main():
    manifest_path = STORAGE / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    additions = []
    for conf in PAPERS:
        source = SOURCE / conf["paper"]
        marking_file = (SOURCE / conf["mg"]) if conf["year"] == 2025 else (ROOT / "scripts" / "data" / conf["mg"])
        if conf["year"] == 2025:
            mark_pdf = pdfplumber.open(marking_file)
            guide = "\n".join(p.extract_text() or "" for p in mark_pdf.pages)
            mark_pdf.close()
        else:
            guide = marking_file.read_text(encoding="utf-8")
        pdf = pdfplumber.open(source)
        title = f"{conf['year']} HSC Mathematics Standard {conf['level']}"
        metadata = {
            "sourcePaper": conf["paperUrl"], "sourceMarking": conf["mgUrl"],
            "sourcePack": PACK.format(year=conf["year"]), "sourceYear": conf["year"]
        }
        mcq = section_one(pdf, conf, metadata)
        written = written_questions(pdf, guide, conf, metadata)
        assert len(mcq) == conf["mcq"]
        assert sum(q["marks"] for q in written) == conf["total"], (title, sum(q["marks"] for q in written))
        for section, data in [("S1", mcq), ("S2", written)]:
            filename = f"Maths-{conf['year']}-S{section[1]}.json"
            # Standard 1/2 need distinct filenames when both are supplied.
            filename = f"Maths-Standard-{conf['level']}-{conf['year']}-{section}.json"
            payload = {
                "studyMode": "exam-questions",
                "source": {"publisher": "NSW Education Standards Authority", "year": conf["year"], "origin": "Supplied exam-pack paper and matching NESA marking guidelines", **metadata},
                "description": f"{title}, {section.replace('S', 'Section ')}. Question wording and diagrams are taken from the supplied NESA exam-pack PDFs.",
                "questions": data
            }
            (STORAGE / filename).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            additions.append({"file": filename, "name": title, "subject": "Maths", "section": "Section I" if section == "S1" else "Section II"})
        pdf.close()
    existing = {x["file"] for x in manifest}
    manifest.extend(x for x in additions if x["file"] not in existing)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Imported", len(additions), "sections")

if __name__ == "__main__":
    main()

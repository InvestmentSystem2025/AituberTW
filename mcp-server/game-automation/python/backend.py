from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Dict, List, Tuple

import cv2
import mss
import numpy as np
import pyautogui
from flask import Flask, jsonify, request, send_file, send_from_directory
import io

APP_DIR = Path(__file__).resolve().parent
BASE_DIR = APP_DIR.parent
CONFIG_PATH = BASE_DIR / "config.json"
TEMPLATE_DIR = APP_DIR / "templates"

pyautogui.FAILSAFE = True

app = Flask(__name__)


def _load_config() -> Dict[str, float | int]:
    if CONFIG_PATH.exists():
        with CONFIG_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
            return {
                "top": data.get("top", 200),
                "left": data.get("left", 200),
                "width": data.get("width", 400),
                "height": data.get("height", 400),
                "rows": data.get("rows", 16),
                "cols": data.get("cols", 30),
                "threshold": data.get("threshold", 0.68),
            }
    return {
        "top": 200,
        "left": 200,
        "width": 400,
        "height": 400,
        "rows": 16,
        "cols": 30,
        "threshold": 0.68,
    }


CONFIG = _load_config()


REQUIRED_TEMPLATES = {
    "covered": "covered.png",
    "flag": "flag.png",
    "0": "n0.png",
    "1": "n1.png",
    "2": "n2.png",
    "3": "n3.png",
    "4": "n4.png",
    "5": "n5.png",
    "6": "n6.png",
    "7": "n7.png",
    "8": "n8.png",
}


class TemplateStore:
    def __init__(self) -> None:
        self._templates: Dict[str, np.ndarray] = {}
        TEMPLATE_DIR.mkdir(exist_ok=True, parents=True)
        self.reload()

    def reload(self) -> None:
        self._templates.clear()
        for label, filename in REQUIRED_TEMPLATES.items():
            path = TEMPLATE_DIR / filename
            if path.exists():
                self._templates[label] = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)

    def get(self, label: str) -> np.ndarray | None:
        return self._templates.get(label)

    @property
    def labels(self) -> List[str]:
        return list(self._templates.keys())


TEMPLATES = TemplateStore()


def _save_config() -> None:
    with CONFIG_PATH.open("w", encoding="utf-8") as f:
        json.dump(CONFIG, f, ensure_ascii=False, indent=2)


def _grab_board_bgr() -> np.ndarray:
    monitor = {k: int(CONFIG[k]) for k in ("top", "left", "width", "height")}
    with mss.mss() as sct_local:
        raw = np.array(sct_local.grab(monitor))
    return raw[:, :, :3]


def _rc_to_xy(r: int, c: int) -> Tuple[int, int]:
    cell_height = CONFIG["height"] / CONFIG["rows"]
    cell_width = CONFIG["width"] / CONFIG["cols"]
    x = CONFIG["left"] + c * cell_width + cell_width / 2
    y = CONFIG["top"] + r * cell_height + cell_height / 2
    return int(round(x)), int(round(y))


def _grid_boundaries() -> Tuple[List[int], List[int]]:
    rows = max(1, int(CONFIG["rows"]))
    cols = max(1, int(CONFIG["cols"]))
    width = float(CONFIG["width"])
    height = float(CONFIG["height"])
    left = float(CONFIG["left"])
    top = float(CONFIG["top"])

    xs = [int(round(left + (width * c) / cols)) for c in range(cols + 1)]
    ys = [int(round(top + (height * r) / rows)) for r in range(rows + 1)]

    # 確保最後一個值嚴格等於 left+width / top+height，避免 round 誤差
    xs[-1] = int(round(left + width))
    ys[-1] = int(round(top + height))
    return xs, ys


def _split_cells(gray: np.ndarray) -> List[List[np.ndarray]]:
    rows, cols = CONFIG["rows"], CONFIG["cols"]
    xs_abs, ys_abs = _grid_boundaries()
    rel_xs = [int(x - CONFIG["left"]) for x in xs_abs]
    rel_ys = [int(y - CONFIG["top"]) for y in ys_abs]

    cells: List[List[np.ndarray]] = []
    for r in range(rows):
        row_cells: List[np.ndarray] = []
        for c in range(cols):
            x0, x1 = rel_xs[c], rel_xs[c + 1]
            y0, y1 = rel_ys[r], rel_ys[r + 1]
            row_cells.append(gray[y0:y1, x0:x1])
        cells.append(row_cells)
    return cells


def _classify_cell(cell_gray: np.ndarray) -> str:
    best_label = "unknown"
    best_score = -1.0
    for label in TEMPLATES.labels:
        template = TEMPLATES.get(label)
        if template is None:
            continue
        result = cv2.matchTemplate(cell_gray, template, cv2.TM_CCOEFF_NORMED)
        score = float(result.max())
        if score > best_score:
            best_score = score
            best_label = label

    threshold = float(CONFIG.get("threshold", 0.68))
    if best_label in ("covered", "flag"):
        return best_label if best_score >= threshold else "unknown"
    if best_label.isdigit():
        return best_label if best_score >= threshold else "unknown"
    return best_label if best_score >= threshold else "unknown"


def _detect_grid() -> List[List[str]]:
    bgr = _grab_board_bgr()
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    cells = _split_cells(gray)
    return [[_classify_cell(cell) for cell in row] for row in cells]


@app.get("/health")
def health():
    return {"ok": True, "templates": TEMPLATES.labels}


@app.get("/config")
def get_config():
    return jsonify(CONFIG)


@app.post("/set_config")
def set_config():
    payload = request.get_json(force=True)
    for key in ("top", "left", "width", "height"):
        if key in payload:
            CONFIG[key] = int(payload[key])
    for key in ("rows", "cols"):
        if key in payload:
            CONFIG[key] = max(1, int(payload[key]))
    if "threshold" in payload:
        CONFIG["threshold"] = float(payload["threshold"])
    _save_config()
    return {"ok": True, "config": CONFIG}


CALIBRATION: Dict[str, Tuple[int, int] | None] = {"tl": None, "br": None}


@app.get("/calibrate")
def calibrate_page():
    html = f"""
    <html>
      <body style="font-family: sans-serif">
        <h2>Calibrate Minesweeper Board</h2>
        <ol>
          <li>將滑鼠移動到棋盤<b>左上角</b>，按下下方按鈕記錄座標。</li>
          <li>將滑鼠移動到棋盤<b>右下角</b>，重複前一步。</li>
          <li>更新盤面行列數並儲存設定。</li>
        </ol>
        <button onclick="fetch('/calibrate/capture?corner=tl',{{method:'POST'}}).then(r=>r.json()).then(alert)">記錄左上角</button>
        <button onclick="fetch('/calibrate/capture?corner=br',{{method:'POST'}}).then(r=>r.json()).then(alert)">記錄右下角</button>
        <p>
          Rows: <input id="rows" type="number" value="{CONFIG.get('rows', 16)}" />
          Cols: <input id="cols" type="number" value="{CONFIG.get('cols', 30)}" />
          <button onclick="setGrid()">套用行列</button>
        </p>
        <p>
          Threshold: <input id="threshold" type="number" step="0.01" value="{CONFIG.get('threshold', 0.68)}" />
          <button onclick="setThreshold()">更新閾值</button>
        </p>
        <button onclick="fetch('/calibrate/save',{{method:'POST'}}).then(r=>r.json()).then(alert)">儲存設定</button>
        <pre>{json.dumps(CONFIG, ensure_ascii=False, indent=2)}</pre>
        <script>
          async function setGrid() {{
            const rows = parseInt(document.getElementById('rows').value || '16');
            const cols = parseInt(document.getElementById('cols').value || '30');
            const res = await fetch('/calibrate/set_grid', {{
              method: 'POST',
              headers: {{'Content-Type': 'application/json'}},
              body: JSON.stringify({{rows, cols}})
            }});
            alert(JSON.stringify(await res.json(), null, 2));
          }}
          async function setThreshold() {{
            const threshold = parseFloat(document.getElementById('threshold').value || '0.68');
            const res = await fetch('/set_config', {{
              method: 'POST',
              headers: {{'Content-Type': 'application/json'}},
              body: JSON.stringify({{threshold}})
            }});
            alert(JSON.stringify(await res.json(), null, 2));
          }}
        </script>
      </body>
    </html>
    """
    return html


@app.post("/calibrate/capture")
def calibrate_capture():
    corner = request.args.get("corner")
    pos = pyautogui.position()
    if corner not in ("tl", "br"):
        return {"ok": False, "message": "corner must be tl 或 br"}, 400
    CALIBRATION[corner] = (pos.x, pos.y)
    return {"ok": True, "corner": corner, "position": {"x": pos.x, "y": pos.y}}


@app.post("/calibrate/set_grid")
def calibrate_set_grid():
    payload = request.get_json(force=True)
    CONFIG["rows"] = max(1, int(payload.get("rows", CONFIG["rows"])))
    CONFIG["cols"] = max(1, int(payload.get("cols", CONFIG["cols"])))
    _save_config()
    return {"ok": True, "rows": CONFIG["rows"], "cols": CONFIG["cols"]}


@app.post("/calibrate/save")
def calibrate_save():
    tl = CALIBRATION.get("tl")
    br = CALIBRATION.get("br")
    if not tl or not br:
        return {"ok": False, "message": "請先記錄左上角與右下角座標"}, 400

    (x1, y1), (x2, y2) = tl, br
    CONFIG["left"] = int(min(x1, x2))
    CONFIG["top"] = int(min(y1, y2))
    CONFIG["width"] = int(abs(x2 - x1))
    CONFIG["height"] = int(abs(y2 - y1))
    _save_config()
    return {"ok": True, "config": CONFIG}


@app.post("/detect_grid")
def detect_grid():
    grid = _detect_grid()
    return jsonify({"grid": grid})


def _guard_coordinates(x: int, y: int) -> bool:
    return (
        CONFIG["left"]
        <= x
        <= CONFIG["left"] + CONFIG["width"]
        and CONFIG["top"]
        <= y
        <= CONFIG["top"] + CONFIG["height"]
    )


@app.post("/click_cell")
def click_cell():
    payload = request.get_json(force=True)
    row = int(payload["r"])
    col = int(payload["c"])
    x, y = _rc_to_xy(row, col)
    if not _guard_coordinates(x, y):
        return {"ok": False, "message": "座標超出棋盤範圍"}, 400
    pyautogui.click(x, y)
    time.sleep(0.03)
    return {"ok": True, "x": x, "y": y}


@app.post("/flag_cell")
def flag_cell():
    payload = request.get_json(force=True)
    row = int(payload["r"])
    col = int(payload["c"])
    x, y = _rc_to_xy(row, col)
    if not _guard_coordinates(x, y):
        return {"ok": False, "message": "座標超出棋盤範圍"}, 400
    pyautogui.click(x, y, button="right")
    time.sleep(0.03)
    return {"ok": True, "x": x, "y": y}


@app.post("/snapshot_cell")
def snapshot_cell():
    payload = request.get_json(force=True)
    row = int(payload["r"])
    col = int(payload["c"])
    label = str(payload["label"])

    bgr = _grab_board_bgr()
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    cell_height = gray.shape[0] // CONFIG["rows"]
    cell_width = gray.shape[1] // CONFIG["cols"]
    y0 = row * cell_height
    x0 = col * cell_width
    cell_img = gray[y0 : y0 + cell_height, x0 : x0 + cell_width]

    filename = f"n{label}.png" if label.isdigit() else f"{label}.png"
    save_path = TEMPLATE_DIR / filename
    cv2.imwrite(str(save_path), cell_img)
    TEMPLATES.reload()
    return {"ok": True, "saved": filename}


NEIGHBORS = [
    (-1, -1),
    (-1, 0),
    (-1, 1),
    (0, -1),
    (0, 1),
    (1, -1),
    (1, 0),
    (1, 1),
]


def _iter_neighbors(r: int, c: int, rows: int, cols: int):
    for dr, dc in NEIGHBORS:
        rr, cc = r + dr, c + dc
        if 0 <= rr < rows and 0 <= cc < cols:
            yield rr, cc


def _plan_actions(grid: List[List[str]]):
    rows = len(grid)
    cols = len(grid[0]) if rows else 0
    to_open: set[Tuple[int, int]] = set()
    to_flag: set[Tuple[int, int]] = set()

    for r in range(rows):
        for c in range(cols):
            value = grid[r][c]
            if value not in {"0", "1", "2", "3", "4", "5", "6", "7", "8"}:
                continue
            adjacent = list(_iter_neighbors(r, c, rows, cols))
            covered = [
                (rr, cc)
                for rr, cc in adjacent
                if grid[rr][cc] in {"covered", "unknown"}
            ]
            flagged = sum(1 for rr, cc in adjacent if grid[rr][cc] == "flag")
            number = int(value)

            if covered and number - flagged == len(covered):
                to_flag.update(covered)
            if covered and flagged == number:
                to_open.update(
                    (rr, cc) for (rr, cc) in covered if (rr, cc) not in to_flag
                )

    return list(to_open), list(to_flag)


def _execute_actions(opens: List[Tuple[int, int]], flags: List[Tuple[int, int]], sleep_ms: int = 40):
    for r, c in flags:
        x, y = _rc_to_xy(r, c)
        if _guard_coordinates(x, y):
            pyautogui.click(x, y, button="right")
            time.sleep(sleep_ms / 1000)
    for r, c in opens:
        x, y = _rc_to_xy(r, c)
        if _guard_coordinates(x, y):
            pyautogui.click(x, y)
            time.sleep(sleep_ms / 1000)


@app.post("/step_solve")
def step_solve():
    grid = _detect_grid()
    opens, flags = _plan_actions(grid)
    _execute_actions(opens, flags)
    return {"ok": True, "opens": opens, "flags": flags}


@app.post("/autoplay")
def autoplay():
    payload = request.get_json(silent=True) or {}
    max_steps = int(payload.get("max_steps", 50))
    sleep_ms = int(payload.get("sleep_ms", 80))

    steps: List[Dict[str, List[Tuple[int, int]]]] = []
    for _ in range(max_steps):
        grid = _detect_grid()
        opens, flags = _plan_actions(grid)
        if not opens and not flags:
            break
        _execute_actions(opens, flags, sleep_ms=sleep_ms)
        steps.append({"opens": opens, "flags": flags})

    return {"ok": True, "steps": len(steps), "ops": steps}


@app.get("/templates/<path:filename>")
def get_template(filename: str):
    return send_from_directory(TEMPLATE_DIR, filename)


# ======== Debug Overlay（視覺化格線與裁切區域） ========

def _draw_grid_overlay(
    bgr: np.ndarray, draw_centers: bool = True, draw_crops: bool = False
) -> np.ndarray:
    """
    在棋盤影像上畫出：
    - 綠色格線（使用浮點步進 + round 的邊界）
    - 可選：紅點中心、藍色中心裁切90%的方框
    備註：bgr 需是 _grab_board_bgr() 取得的子圖（大小=CONFIG寬高）
    """
    img = bgr.copy()
    xs_abs, ys_abs = _grid_boundaries()
    rel_xs = [int(x - CONFIG["left"]) for x in xs_abs]
    rel_ys = [int(y - CONFIG["top"]) for y in ys_abs]

    for x in rel_xs:
        cv2.line(img, (x, 0), (x, CONFIG["height"]), (0, 255, 0), 1)
    for y in rel_ys:
        cv2.line(img, (0, y), (CONFIG["width"], y), (0, 255, 0), 1)

    if draw_centers or draw_crops:
        rows, cols = CONFIG["rows"], CONFIG["cols"]
        for r in range(rows):
            for c in range(cols):
                x0, x1 = rel_xs[c], rel_xs[c + 1]
                y0, y1 = rel_ys[r], rel_ys[r + 1]
                cx = (x0 + x1) // 2
                cy = (y0 + y1) // 2
                if draw_centers:
                    cv2.circle(img, (cx, cy), 2, (0, 0, 255), -1)
                if draw_crops:
                    w = x1 - x0
                    h = y1 - y0
                    cw = int(w * 0.9)
                    ch = int(h * 0.9)
                    x_start = cx - cw // 2
                    y_start = cy - ch // 2
                    x_end = x_start + cw
                    y_end = y_start + ch
                    cv2.rectangle(
                        img, (x_start, y_start), (x_end, y_end), (255, 0, 0), 1
                    )
    return img


@app.get("/debug_overlay")
def debug_overlay_save():
    bgr = _grab_board_bgr()
    overlay = _draw_grid_overlay(bgr, draw_centers=True, draw_crops=True)
    out_path = os.path.join(APP_DIR, "debug_overlay.png")
    cv2.imwrite(out_path, overlay)
    return {"ok": True, "saved": out_path}


@app.get("/debug_overlay_view")
def debug_overlay_view():
    bgr = _grab_board_bgr()
    overlay = _draw_grid_overlay(bgr, draw_centers=True, draw_crops=True)
    ok, buf = cv2.imencode(".png", overlay)
    if not ok:
        return {"ok": False, "msg": "encode failed"}, 500
    return send_file(io.BytesIO(buf.tobytes()), mimetype="image/png")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=False, threaded=False)


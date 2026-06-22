#!/usr/bin/env python3
"""Local desktop simulator for Reflex Console.

Runs with Python 3 and Tkinter only. It is a UI/test-flow harness; it does not
attempt to emulate ESP32 timing, touch hardware, Preferences, or TFT_eSPI.
"""

from __future__ import annotations

import math
import json
import random
import statistics
import time
import tkinter as tk
import tkinter.font as tkfont
from dataclasses import dataclass, field
from pathlib import Path

WIDTH = HEIGHT = 128
SCALE = 4
WAIT = "#181d22"
WHITE = "#ffffff"
CYAN = "#00d8e7"
GREEN = "#22d86d"
RED = "#ff4d57"
YELLOW = "#ffd347"
BLUE = "#287dff"
GREY = "#a9b3bc"


@dataclass
class Result:
    median: int = 0
    spread: float = 0.0
    lapses: int = 0
    false_starts: int = 0
    correct: int = 0
    attempts: int = 0
    score: int = 0
    timing_bias: int = 0


@dataclass
class Profile:
    quick_sessions: int = 0
    quick_median: float = 0.0
    quick_spread: float = 0.0
    best_median: int = 0
    sessions: int = 0
    scores: list[int] = field(default_factory=list)
    last: Result = field(default_factory=Result)


class ReflexSimulator:
    """State-machine simulator with keyboard replacements for badge inputs."""

    menu_items = ["Quick Test", "Focus Test", "Choice Test", "Rhythm Test", "Stats", "Settings"]

    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("Reflex Console Simulator")
        self.root.configure(bg="#101317")
        self.canvas = tk.Canvas(self.root, width=WIDTH * SCALE, height=HEIGHT * SCALE,
                                highlightthickness=0, bg=WAIT)
        self.canvas.grid(row=0, column=0, padx=16, pady=(16, 8))
        self.help = tk.Label(
            self.root,
            text="↑/↓ menu  •  Enter/Space select  •  Backspace back  •  M menu  •  Choice: ← or Enter",
            fg="#c9d1d9", bg="#101317", font=("TkDefaultFont", 10),
        )
        self.help.grid(row=1, column=0, padx=16, pady=(0, 16))
        self.root.bind("<Key>", self.on_key)
        self.root.focus_force()

        self.profile = Profile()
        self.state = "boot"
        self.menu_index = 0
        self.setting_index = 0
        self.quick_trials = 10
        self.lapse_ms = 500
        self.test_length_s = 60
        self.sound_on = True
        self.led_on = True
        self.settings_path = Path(__file__).with_name("reflex_console_sim_settings.json")
        self.load_settings()
        self.deadline = 0.0
        self.stimulus_at = 0.0
        self.test_started = 0.0
        self.samples: list[int] = []
        self.false_starts = 0
        self.lapses = 0
        self.wrong = 0
        self.trial = 0
        self.event_count = 0
        self.choice_left = False
        self.rhythm_errors: list[int] = []
        self.beat_at = 0.0
        self.feedback = ""
        self.feedback_color = WHITE
        self.render()
        self.root.after(1800, self.show_menu)

    def run(self) -> None:
        self.root.mainloop()

    def load_settings(self) -> None:
        """Load simulator settings without making the UI depend on a file."""
        try:
            saved = json.loads(self.settings_path.read_text(encoding="utf-8"))
            self.sound_on = bool(saved.get("sound_on", self.sound_on))
            self.led_on = bool(saved.get("led_on", self.led_on))
            self.test_length_s = int(saved.get("test_length_s", self.test_length_s))
            self.quick_trials = int(saved.get("quick_trials", self.quick_trials))
            self.lapse_ms = int(saved.get("lapse_ms", self.lapse_ms))
        except (OSError, ValueError, TypeError):
            pass

    def save_settings(self) -> None:
        saved = {
            "sound_on": self.sound_on,
            "led_on": self.led_on,
            "test_length_s": self.test_length_s,
            "quick_trials": self.quick_trials,
            "lapse_ms": self.lapse_ms,
        }
        try:
            self.settings_path.write_text(json.dumps(saved, indent=2) + "\n", encoding="utf-8")
        except OSError:
            # The simulator remains usable in a read-only directory.
            pass

    # Drawing ---------------------------------------------------------------
    def rect(self, x: int, y: int, w: int, h: int, color: str) -> None:
        self.canvas.create_rectangle(x * SCALE, y * SCALE, (x + w) * SCALE,
                                     (y + h) * SCALE, fill=color, outline=color)

    def text(self, value: str, y: int, size: int = 1, color: str = WHITE,
             center: bool = True) -> None:
        # Tk's monospace font is wider than TFT_eSPI's bitmap font. Reduce it
        # until it fits the same 128-pixel virtual display area.
        font_size = 6 * size * SCALE
        available_width = (122 if center else 120) * SCALE
        font = tkfont.Font(family="DejaVu Sans Mono", size=font_size, weight="bold")
        while font.measure(value) > available_width and font_size > 8:
            font_size -= 1
            font = tkfont.Font(family="DejaVu Sans Mono", size=font_size, weight="bold")
        self.canvas.create_text((WIDTH // 2 if center else 3) * SCALE, y * SCALE,
                                text=value, fill=color, anchor="n" if center else "nw",
                                font=font)

    def header(self, title: str, color: str = CYAN) -> None:
        self.rect(0, 0, 128, 14, WAIT)
        self.rect(0, 13, 128, 1, color)
        self.text(title, 3, 1, color, center=False)

    def metric(self, label: str, value: str, y: int, color: str = WHITE) -> None:
        self.text(label, y, 1, GREY, center=False)
        self.canvas.create_text(123 * SCALE, y * SCALE, text=value, fill=color, anchor="ne",
                                font=("DejaVu Sans Mono", 7 * SCALE, "bold"))

    def render(self) -> None:
        self.canvas.delete("all")
        self.rect(0, 0, WIDTH, HEIGHT, WAIT)

        if self.state == "boot":
            self.text("Reflex Console", 32, 2, CYAN)
            self.text("Personal performance", 62, 1)
            self.text("tracker", 72, 1)
            self.text("SIMULATOR", 108, 1, GREY)
        elif self.state == "menu":
            self.header("REFLEX CONSOLE")
            for i, item in enumerate(self.menu_items):
                y = 20 + i * 17
                if i == self.menu_index:
                    self.rect(3, y - 2, 122, 14, CYAN)
                    self.text(item, y, 1, "#081316", center=False)
                else:
                    self.text(item, y, 1, WHITE, center=False)
        elif self.state.endswith("_intro"):
            self.draw_intro()
        elif self.state in {"quick_wait", "focus_wait", "choice_wait"}:
            self.text("WAIT", 48, 3, GREY)
            self.text("Stay ready", 88, 1)
        elif self.state in {"quick_go", "focus_go"}:
            self.rect(0, 0, 128, 128, GREEN)
            self.text("GO", 44, 4, "#081316")
        elif self.state == "choice_go":
            color = BLUE if self.choice_left else RED
            self.rect(0, 0, 128, 128, color)
            self.text("LEFT" if self.choice_left else "RIGHT", 44, 2)
            self.text("← BACK" if self.choice_left else "ENTER", 77, 1)
        elif self.state == "rhythm_running":
            self.header("RHYTHM")
            self.text("TAP", 40, 3, CYAN)
            self.text(f"Beat {self.trial} / 24", 90, 1)
        elif self.state == "feedback":
            self.text(self.feedback, 45, 2, self.feedback_color)
        elif self.state == "stats":
            self.draw_stats()
        elif self.state == "settings":
            self.draw_settings()
        elif self.state == "summary":
            self.draw_summary()

    def draw_intro(self) -> None:
        name = self.state.replace("_intro", "").upper() + " TEST"
        self.header(name)
        messages = {
            "quick_intro": ("Wait for GREEN.", "Press when it appears."),
            "focus_intro": ("Respond to each", "unpredictable GO."),
            "choice_intro": ("BLUE = BACK", "RED = ENTER"),
            "rhythm_intro": ("Tap with the beat", "24 beats at 100 BPM"),
        }
        first, second = messages[self.state]
        self.text(first, 42, 1)
        self.text(second, 60, 1)
        self.text("ENTER to begin", 102, 1, CYAN)

    def draw_stats(self) -> None:
        self.header("STATS")
        self.metric("Last score", str(self.profile.last.score), 22, CYAN)
        self.metric("Best simple", f"{self.profile.best_median} ms", 38, GREEN)
        baseline = "--" if not self.profile.quick_sessions else f"{self.profile.quick_median:.0f} ms"
        self.metric("Baseline", baseline, 54)
        self.metric("Sessions", str(self.profile.sessions), 70)
        recent = ",".join(str(x) for x in self.profile.scores[-5:]) or "--"
        self.metric("Last 5", recent, 86, YELLOW)
        self.text("BACK: menu", 112, 1, GREY)

    def draw_settings(self) -> None:
        self.header("SETTINGS")
        entries = [
            ("Sound", "ON" if self.sound_on else "OFF"),
            ("LED", "ON" if self.led_on else "OFF"),
            ("Test length", f"{self.test_length_s}s"),
            ("Quick trials", str(self.quick_trials)),
            ("Lapse threshold", f"{self.lapse_ms}ms"),
            ("Reset stats", ""),
        ]
        for i, (label, value) in enumerate(entries):
            y = 18 + i * 16
            if i == self.setting_index:
                self.rect(2, y - 1, 124, 12, CYAN)
                label_color = "#081316"
            else:
                label_color = WHITE
            self.text(label, y, 1, label_color, center=False)
            if value:
                self.canvas.create_text(123 * SCALE, y * SCALE, text=value, fill=label_color,
                                        anchor="ne", font=("DejaVu Sans Mono", 7 * SCALE, "bold"))

    def draw_summary(self) -> None:
        result = self.profile.last
        self.header("SESSION SUMMARY")
        self.metric("Median", f"{result.median} ms", 24, CYAN)
        self.metric("Spread", f"{result.spread:.0f} ms", 40)
        self.metric("Lapses", str(result.lapses), 56, YELLOW)
        self.metric("False starts", str(result.false_starts), 72, RED)
        if self.profile.quick_sessions < 5:
            self.text(f"Baseline: {self.profile.quick_sessions}/5", 94, 1, YELLOW)
        else:
            self.text(f"Readiness {result.score}", 94, 1, GREEN)
        self.text("BACK: menu", 113, 1, GREY)

    # State transitions ----------------------------------------------------
    def show_menu(self) -> None:
        self.state = "menu"
        self.render()

    def start_test(self, kind: str) -> None:
        self.samples.clear()
        self.rhythm_errors.clear()
        self.false_starts = self.lapses = self.wrong = self.trial = self.event_count = 0
        self.test_started = time.monotonic()
        if kind == "quick":
            self.schedule_wait("quick_wait", 1.5, 5.0)
        elif kind == "focus":
            self.schedule_wait("focus_wait", 1.0, 2.5)
            self.root.after(100, self.focus_timeout)
        elif kind == "choice":
            self.schedule_wait("choice_wait", 1.0, 2.4)
        else:
            self.state = "rhythm_running"
            self.next_beat = time.monotonic() + 0.6
            self.root.after(20, self.rhythm_tick)
            self.render()

    def schedule_wait(self, state: str, low: float, high: float) -> None:
        self.state = state
        self.render()
        self.deadline = time.monotonic() + random.uniform(low, high)
        self.root.after(max(1, int((self.deadline - time.monotonic()) * 1000)), self.show_stimulus)

    def show_stimulus(self) -> None:
        if self.state == "quick_wait":
            self.state = "quick_go"
        elif self.state == "focus_wait":
            self.state = "focus_go"
        elif self.state == "choice_wait":
            self.choice_left = bool(random.getrandbits(1))
            self.state = "choice_go"
        else:
            return
        self.stimulus_at = time.monotonic()
        self.render()
        self.root.after(1500, self.miss_stimulus)

    def miss_stimulus(self) -> None:
        if self.state not in {"quick_go", "focus_go", "choice_go"}:
            return
        self.lapses += 1
        if self.state == "quick_go":
            self.advance_quick()
        elif self.state == "focus_go":
            self.schedule_wait("focus_wait", 0.9, 2.6)
        else:
            self.event_count += 1
            self.advance_choice()

    def focus_timeout(self) -> None:
        if self.state.startswith("focus_") and time.monotonic() - self.test_started >= self.test_length_s:
            self.finish("focus")
        elif self.state.startswith("focus_"):
            self.root.after(100, self.focus_timeout)

    def rhythm_tick(self) -> None:
        if self.state != "rhythm_running":
            return
        now = time.monotonic()
        if now >= self.next_beat:
            self.trial += 1
            self.beat_at = self.next_beat
            self.next_beat += 0.6
            self.render()
            if self.trial >= 24:
                self.root.after(600, lambda: self.finish("rhythm"))
                return
        self.root.after(10, self.rhythm_tick)

    def advance_quick(self) -> None:
        self.trial += 1
        if self.trial >= self.quick_trials:
            self.finish("quick")
        else:
            self.schedule_wait("quick_wait", 1.2, 3.5)

    def advance_choice(self) -> None:
        if self.event_count >= 10:
            self.finish("choice")
        else:
            self.schedule_wait("choice_wait", 0.8, 2.0)

    def feedback_then_advance(self, text: str, color: str) -> None:
        self.state = "feedback"
        self.feedback, self.feedback_color = text, color
        self.render()
        self.root.after(650, self.advance_quick)

    def finish(self, kind: str) -> None:
        median = int(statistics.median(self.samples)) if self.samples else 0
        spread = statistics.pstdev(self.samples) if len(self.samples) > 1 else 0.0
        result = Result(median=median, spread=spread, lapses=self.lapses,
                        false_starts=self.false_starts, correct=len(self.samples),
                        attempts=len(self.samples) + self.wrong)

        if kind == "quick":
            if self.profile.quick_sessions >= 5 and median:
                result.score = self.readiness(result)
            self.profile.quick_sessions += 1
            weight = 1.0 / self.profile.quick_sessions if self.profile.quick_sessions <= 5 else 0.10
            self.profile.quick_median += (median - self.profile.quick_median) * weight
            self.profile.quick_spread += (spread - self.profile.quick_spread) * weight
            if median and (not self.profile.best_median or median < self.profile.best_median):
                self.profile.best_median = median
        elif kind == "choice":
            accuracy = result.correct / result.attempts if result.attempts else 0.0
            result.score = max(0, min(100, round(accuracy * 55 + (45000 / median if median else 0) * 0.45)))
        elif kind == "rhythm":
            result.timing_bias = round(statistics.mean(self.rhythm_errors)) if self.rhythm_errors else 0
            result.score = max(0, min(100, 100 - abs(result.timing_bias) // 3))

        self.profile.last = result
        self.profile.sessions += 1
        self.profile.scores = (self.profile.scores + [result.score])[-10:]
        self.state = "summary"
        self.render()

    def readiness(self, result: Result) -> int:
        if not self.profile.quick_median or not result.median:
            return 0
        reaction = self.profile.quick_median / result.median * 40
        consistency = self.profile.quick_spread / (result.spread + 1) * 25
        lapses = (1 - result.lapses / 10) * 20
        starts = (1 - result.false_starts / 10) * 10
        return max(0, min(100, round(reaction + consistency + lapses + starts + 5)))

    # Input -----------------------------------------------------------------
    def on_key(self, event: tk.Event) -> None:
        key = event.keysym.lower()
        if key == "m":
            self.show_menu()
            return
        if key == "backspace":
            self.show_menu()
            return

        if self.state == "menu":
            if key == "up":
                self.menu_index = (self.menu_index - 1) % len(self.menu_items)
            elif key == "down":
                self.menu_index = (self.menu_index + 1) % len(self.menu_items)
            elif key in {"return", "space"}:
                selected = self.menu_items[self.menu_index]
                target = {"Quick Test": "quick_intro", "Focus Test": "focus_intro",
                          "Choice Test": "choice_intro", "Rhythm Test": "rhythm_intro",
                          "Stats": "stats", "Settings": "settings"}[selected]
                self.state = target
            self.render()
            return

        if self.state.endswith("_intro") and key in {"return", "space"}:
            self.start_test(self.state.removesuffix("_intro"))
            return

        if self.state in {"quick_wait", "focus_wait", "choice_wait"} and key in {"return", "space", "left", "right"}:
            self.false_starts += 1
            if self.state == "quick_wait":
                self.feedback_then_advance("FALSE START", RED)
            else:
                self.schedule_wait(self.state, 0.9, 2.2)
            return

        if self.state in {"quick_go", "focus_go"} and key in {"return", "space"}:
            reaction = round((time.monotonic() - self.stimulus_at) * 1000)
            self.samples.append(reaction)
            if reaction > self.lapse_ms:
                self.lapses += 1
            if self.state == "quick_go":
                self.feedback_then_advance(f"{reaction} ms", YELLOW if reaction > self.lapse_ms else GREEN)
            else:
                self.schedule_wait("focus_wait", 0.8, 2.2)
            return

        if self.state == "choice_go":
            is_left = key == "left"
            is_right = key in {"return", "space", "right"}
            if is_left or is_right:
                if (self.choice_left and is_left) or (not self.choice_left and is_right):
                    self.samples.append(round((time.monotonic() - self.stimulus_at) * 1000))
                else:
                    self.wrong += 1
                self.event_count += 1
                self.advance_choice()
            return

        if self.state == "rhythm_running" and key in {"return", "space"}:
            # A tap before beat one has no timing reference and should not be scored.
            if self.trial == 0:
                return
            self.rhythm_errors.append(round((time.monotonic() - self.beat_at) * 1000))
            return

        if self.state == "settings":
            if key == "up":
                self.setting_index = (self.setting_index - 1) % 6
            elif key == "down":
                self.setting_index = (self.setting_index + 1) % 6
            elif key in {"left", "right", "return", "space"}:
                if self.setting_index == 0:
                    self.sound_on = not self.sound_on
                elif self.setting_index == 1:
                    self.led_on = not self.led_on
                elif self.setting_index == 2:
                    self.test_length_s = {30: 60, 60: 120, 120: 30}[self.test_length_s]
                elif self.setting_index == 3:
                    self.quick_trials = {5: 10, 10: 20, 20: 5}[self.quick_trials]
                elif self.setting_index == 4:
                    self.lapse_ms = {500: 650, 650: 800, 800: 500}[self.lapse_ms]
                else:
                    self.profile = Profile()
                self.save_settings()
            self.render()


if __name__ == "__main__":
    ReflexSimulator().run()

#!/usr/bin/env python3
"""Interactive desktop emulator for the PocketLab OS 128x128 TFT interface.

The emulator mirrors the firmware's app states and UI with synthetic GPIO data.
It uses Python's standard-library Tkinter only; no ESP32 hardware is emulated.
"""

from __future__ import annotations

import json
import math
import random
import time
import tkinter as tk
import tkinter.font as tkfont
from dataclasses import asdict, dataclass
from pathlib import Path

WIDTH = HEIGHT = 128
SCALE = 4
BLACK = "#000000"
DARK = "#303030"
WHITE = "#ffffff"
LIGHT = "#d6d6d6"
GREY = "#777777"
CYAN = "#00d8e7"
GREEN = "#20d060"
RED = "#ef3038"
YELLOW = "#ffd13b"
ORANGE = "#ff8c20"
BLUE = "#285fc7"
MAROON = "#780018"

ANALOG_PINS = [32, 36, 39]
LOGIC_PINS = [32, 33, 36, 39]
MONITOR_PINS = [9, 12, 14, 27, 32, 33, 34, 35, 36, 39]
UI_PINS = {12, 14, 27, 33, 34, 35}
ADC_PINS = {32, 33, 34, 35, 36, 39}


@dataclass
class Settings:
    sound_on: bool = True
    led_feedback: bool = True
    rotation: int = 0
    brightness: int = 255
    joystick_deadzone: int = 700
    touch_threshold: int = 35
    last_app: int = 0


class PocketLabSimulator:
    apps = ["Sensor Lab", "Scope", "Logic Probe", "Pin Monitor",
            "Tone Tool", "I/O Tester", "Settings", "About"]

    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("PocketLab OS Emulator — 128×128")
        self.root.configure(bg="#11151a")
        self.root.resizable(False, False)
        self.canvas = tk.Canvas(
            self.root, width=WIDTH * SCALE, height=HEIGHT * SCALE,
            bg=BLACK, highlightthickness=1, highlightbackground="#3c4650",
        )
        self.canvas.grid(row=0, column=0, columnspan=4, padx=18, pady=(18, 8))
        self.status = tk.Label(
            self.root,
            text="↑ ↓ ← → joystick   Enter/Space select   Backspace back   M menu",
            fg="#cbd3da", bg="#11151a", font=("TkDefaultFont", 10),
        )
        self.status.grid(row=1, column=0, columnspan=4, pady=(0, 8))
        for column, (label, event) in enumerate([
            ("SELECT", "select"), ("BACK", "back"), ("ENTER", "enter"), ("MENU", "menu")
        ]):
            tk.Button(
                self.root, text=label, command=lambda e=event: self.handle(e),
                width=9, relief="flat", bg="#27313b", fg=WHITE,
                activebackground="#3a5065", activeforeground=WHITE,
            ).grid(row=2, column=column, padx=4, pady=(0, 16))
        self.root.bind("<Key>", self.on_key)
        self.root.focus_force()

        self.settings_path = Path(__file__).with_name("pocketlab_os_sim_settings.json")
        self.settings = Settings()
        self.load_settings()
        self.app = "launcher"
        self.selected = self.settings.last_app
        self.last_tick = time.monotonic()
        self.phase = 0.0

        self.pin_index = 0
        self.digital_mode = False
        self.threshold = 2048
        self.raw = self.filtered = 0
        self.minimum, self.maximum = 4095, 0
        self.sensor_samples = [0] * 56

        self.scope_samples = [0] * 96
        self.scope_paused = False
        self.scope_auto = True
        self.scope_manual_top = 4095
        self.scope_min, self.scope_max = 4095, 0
        self.scope_sum = self.scope_count = 0
        self.scope_period_ms = 0

        self.logic_index = 0
        self.logic_active_high = True
        self.logic_state = False
        self.logic_previous = False
        self.logic_rising = self.logic_falling = 0
        self.logic_high_started = time.monotonic()
        self.logic_pulse_us = 0

        self.monitor_page = 0
        self.tone_frequency = 1000
        self.tone_duty = 50
        self.tone_field = 0
        self.tone_playing = self.tone_sweeping = False
        self.io_selected = 0
        self.led_on = False
        self.settings_selected = 0
        self.toast = ""
        self.toast_until = 0.0

        self.render()
        self.root.after(50, self.tick)

    # Persistence ---------------------------------------------------------
    def load_settings(self) -> None:
        try:
            values = json.loads(self.settings_path.read_text(encoding="utf-8"))
            allowed = Settings.__dataclass_fields__
            self.settings = Settings(**{k: v for k, v in values.items() if k in allowed})
        except (OSError, ValueError, TypeError):
            pass

    def save_settings(self) -> None:
        try:
            self.settings_path.write_text(json.dumps(asdict(self.settings), indent=2) + "\n", encoding="utf-8")
        except OSError:
            pass

    # Scaled TFT primitives ----------------------------------------------
    def shade(self, color: str) -> str:
        if color == BLACK:
            return color
        factor = max(0.08, self.settings.brightness / 255.0)
        rgb = tuple(int(int(color[i:i + 2], 16) * factor) for i in (1, 3, 5))
        return "#%02x%02x%02x" % rgb

    def rect(self, x: int, y: int, w: int, h: int, color: str, outline: str | None = None) -> None:
        self.canvas.create_rectangle(
            x * SCALE, y * SCALE, (x + w) * SCALE, (y + h) * SCALE,
            fill=self.shade(color), outline=self.shade(outline or color), width=SCALE if outline else 0,
        )

    def line(self, x1: int, y1: int, x2: int, y2: int, color: str, width: int = 1) -> None:
        self.canvas.create_line(x1 * SCALE, y1 * SCALE, x2 * SCALE, y2 * SCALE,
                                fill=self.shade(color), width=max(1, width * SCALE))

    def text(self, value: str, x: int, y: int, color: str = WHITE, size: int = 1,
             anchor: str = "nw", max_width: int | None = None) -> None:
        font_size = 6 * size * SCALE
        font = tkfont.Font(family="DejaVu Sans Mono", size=font_size, weight="bold")
        width = (max_width or 122) * SCALE
        while font.measure(value) > width and font_size > 7:
            font_size -= 1
            font = tkfont.Font(family="DejaVu Sans Mono", size=font_size, weight="bold")
        self.canvas.create_text(x * SCALE, y * SCALE, text=value, fill=self.shade(color),
                                anchor=anchor, font=font)

    def centered(self, value: str, y: int, color: str = WHITE, size: int = 1) -> None:
        self.text(value, 64, y, color, size, "n", 124)

    def header(self, title: str, right: str = "") -> None:
        self.rect(0, 0, 128, 14, DARK)
        self.text(title, 3, 3, WHITE)
        if right:
            self.text(right, 125, 3, WHITE, anchor="ne", max_width=60)

    def footer(self, value: str) -> None:
        self.rect(0, 116, 128, 12, DARK)
        self.text(value, 64, 118, LIGHT, anchor="n", max_width=126)

    def metric(self, label: str, value: str, y: int, color: str = CYAN) -> None:
        self.text(label, 3, y, LIGHT, max_width=58)
        self.text(value, 125, y, color, anchor="ne", max_width=82)

    def warning(self, value: str) -> None:
        self.rect(0, 104, 128, 12, MAROON)
        self.text(value, 64, 106, YELLOW, anchor="n", max_width=126)

    def menu(self, entries: list[str], selected: int, top: int = 0) -> None:
        for row, item in enumerate(entries[top:top + 7]):
            index = top + row
            y = 16 + row * 14
            if index == selected:
                self.rect(2, y, 124, 12, BLUE)
                self.text(item, 6, y + 2, WHITE)
            else:
                self.text(item, 6, y + 2, LIGHT)

    # Data models ---------------------------------------------------------
    def analog_value(self, pin: int) -> int:
        offsets = {32: 0.0, 36: 1.6, 39: 3.1}
        wave = 2048 + 1350 * math.sin(self.phase * (1.0 + (pin % 5) * 0.08) + offsets.get(pin, 0))
        return max(0, min(4095, int(wave + random.uniform(-90, 90))))

    def reset_sensor(self) -> None:
        self.minimum, self.maximum = 4095, 0
        self.sensor_samples = [0] * 56

    def reset_scope(self) -> None:
        self.scope_samples = [0] * 96
        self.scope_min, self.scope_max = 4095, 0
        self.scope_sum = self.scope_count = 0
        self.scope_period_ms = 0

    def enter_app(self, index: int) -> None:
        self.app = self.apps[index]
        self.settings.last_app = index
        self.save_settings()
        if self.app == "Sensor Lab":
            self.pin_index, self.digital_mode, self.filtered = 0, False, 0
            self.reset_sensor()
        elif self.app == "Scope":
            self.pin_index, self.scope_paused, self.scope_auto = 0, False, True
            self.reset_scope()
        elif self.app == "Logic Probe":
            self.logic_index = 0
            self.logic_active_high = True
            self.logic_rising = self.logic_falling = self.logic_pulse_us = 0
        elif self.app == "Pin Monitor":
            self.monitor_page = 0
        elif self.app == "Tone Tool":
            self.tone_frequency, self.tone_duty, self.tone_field = 1000, 50, 0
            self.tone_playing = self.tone_sweeping = False
        elif self.app == "I/O Tester":
            self.io_selected, self.led_on = 0, False
        elif self.app == "Settings":
            self.settings_selected = 0

    def go_home(self) -> None:
        self.tone_playing = self.tone_sweeping = False
        self.app = "launcher"

    def tick(self) -> None:
        now = time.monotonic()
        dt = now - self.last_tick
        self.last_tick = now
        self.phase += dt * 4.0

        if self.app == "Sensor Lab":
            value = self.analog_value(ANALOG_PINS[self.pin_index])
            self.raw = 4095 if self.digital_mode and value >= self.threshold else (0 if self.digital_mode else value)
            self.filtered = self.raw if not self.filtered else (self.filtered * 3 + self.raw) // 4
            self.minimum, self.maximum = min(self.minimum, self.raw), max(self.maximum, self.raw)
            self.sensor_samples = self.sensor_samples[1:] + [self.filtered]
        elif self.app == "Scope" and not self.scope_paused:
            value = self.analog_value(ANALOG_PINS[self.pin_index])
            self.scope_samples = self.scope_samples[1:] + [value]
            self.scope_min, self.scope_max = min(self.scope_min, value), max(self.scope_max, value)
            self.scope_sum += value
            self.scope_count += 1
            frequency = (4.0 * (1.0 + (ANALOG_PINS[self.pin_index] % 5) * 0.08)) / (2 * math.pi)
            self.scope_period_ms = int(1000 / frequency) if frequency else 0
        elif self.app == "Logic Probe":
            current = math.sin(self.phase * 1.8 + self.logic_index) >= 0
            if current != self.logic_previous:
                edge = time.monotonic()
                if current:
                    self.logic_rising += 1
                    self.logic_high_started = edge
                else:
                    self.logic_falling += 1
                    self.logic_pulse_us = int((edge - self.logic_high_started) * 1_000_000)
                self.logic_previous = current
            self.logic_state = current
        elif self.app == "Tone Tool" and self.tone_sweeping:
            self.tone_frequency += 50
            if self.tone_frequency > 3000:
                self.tone_frequency = 250

        self.render()
        self.root.after(50, self.tick)

    # Screen renderers ----------------------------------------------------
    def render(self) -> None:
        self.canvas.delete("all")
        self.rect(0, 0, 128, 128, BLACK)
        if self.settings.brightness == 0:
            return
        renderers = {
            "launcher": self.draw_launcher, "Sensor Lab": self.draw_sensor,
            "Scope": self.draw_scope, "Logic Probe": self.draw_logic,
            "Pin Monitor": self.draw_monitor, "Tone Tool": self.draw_tone,
            "I/O Tester": self.draw_io, "Settings": self.draw_settings,
            "About": self.draw_about,
        }
        renderers[self.app]()
        if self.toast and time.monotonic() < self.toast_until:
            self.rect(14, 48, 100, 28, DARK, LIGHT)
            self.centered(self.toast, 56, YELLOW)

    def draw_launcher(self) -> None:
        self.header("PocketLab OS", "HOME")
        top = self.selected - 6 if self.selected > 6 else 0
        self.menu(self.apps, self.selected, top)
        self.footer("UP/DN NAV  RIGHT/ENTER OPEN")

    def draw_sensor(self) -> None:
        self.header("Sensor Lab", "DIG" if self.digital_mode else "ANLG")
        self.metric("Input", f"GPIO {ANALOG_PINS[self.pin_index]}", 17)
        self.metric("Raw", str(self.raw), 29)
        self.metric("Voltage", f"{self.raw * 3.3 / 4095:.2f} V", 41)
        self.metric("Filter", f"{self.filtered} [{self.minimum}..{self.maximum}]", 53)
        state = "HIGH" if self.filtered >= self.threshold else "LOW"
        self.metric("Threshold", f"T:{self.threshold} {state}", 65, GREEN if state == "HIGH" else ORANGE)
        self.rect(2, 78, 124, 27, BLACK, DARK)
        for i in range(1, len(self.sensor_samples)):
            y1 = 103 - self.sensor_samples[i - 1] * 23 // 4095
            y2 = 103 - self.sensor_samples[i] * 23 // 4095
            self.line(3 + (i - 1) * 2, y1, 3 + i * 2, y2, CYAN)
        self.footer("L/R PIN  SEL MODE  MENU CLR")

    def draw_scope(self) -> None:
        self.header("Scope", "PAUSE" if self.scope_paused else "LIVE")
        self.rect(1, 16, 126, 74, BLACK, DARK)
        for x in range(21, 127, 20):
            self.line(x, 17, x, 89, DARK)
        for y in range(34, 90, 18):
            self.line(2, y, 126, y, DARK)
        low = self.scope_min if self.scope_auto and self.scope_max > self.scope_min else 0
        high = self.scope_max if self.scope_auto and self.scope_max > self.scope_min else self.scope_manual_top
        high = max(high, low + 1)
        for i in range(1, len(self.scope_samples)):
            y1 = max(17, min(88, 88 - (self.scope_samples[i - 1] - low) * 68 // (high - low)))
            y2 = max(17, min(88, 88 - (self.scope_samples[i] - low) * 68 // (high - low)))
            self.line(1 + i, y1, 2 + i, y2, GREEN)
        self.metric("Input", f"GPIO{ANALOG_PINS[self.pin_index]}  {'AUTO' if self.scope_auto else 'MAN'}", 93)
        average = self.scope_sum // self.scope_count if self.scope_count else 0
        self.metric("Min/Max", f"{self.scope_min}/{self.scope_max} avg:{average}", 104)
        freq = f"~{1000 // self.scope_period_ms} Hz" if self.scope_period_ms else "measuring"
        self.metric("Freq", freq, 115, YELLOW)
        self.footer("L/R PIN SEL PAUSE MENU SCALE")

    def draw_logic(self) -> None:
        logical = self.logic_state if self.logic_active_high else not self.logic_state
        self.header("Logic Probe", "HIGH" if logical else "LOW")
        self.metric("Input", f"GPIO {LOGIC_PINS[self.logic_index]}", 20)
        self.rect(20, 35, 88, 25, GREEN if logical else RED)
        self.centered("HIGH" if logical else "LOW", 41, BLACK, 2)
        self.metric("Rise/Fall", f"{self.logic_rising} / {self.logic_falling}", 68)
        self.metric("Last pulse", f"{self.logic_pulse_us} us", 80)
        mode = "Active HIGH" if self.logic_active_high else "Active LOW"
        self.metric("Mode", f"{mode} (raw:{'HIGH' if self.logic_state else 'LOW'})", 92)
        self.warning("Polling only: pulses can be missed")
        self.footer("L/R PIN SEL POLARITY MENU RESET")

    def draw_monitor(self) -> None:
        self.header("Pin Monitor", "2/2" if self.monitor_page else "1/2")
        start = self.monitor_page * 5
        for row, pin in enumerate(MONITOR_PINS[start:start + 5]):
            value = self.analog_value(pin) if pin in ADC_PINS else 4095 if math.sin(self.phase + pin) > 0 else 0
            state = "HIGH" if value >= 2048 else "LOW"
            detail = f"{state} A:{value}" if pin in ADC_PINS else state
            self.metric(f"GPIO {pin}", detail, 20 + row * 16, ORANGE if pin in UI_PINS else CYAN)
        self.warning("Do not drive reserved pins")
        self.footer("L/R PAGE  BACK HOME")

    def draw_tone(self) -> None:
        self.header("Tone Tool", "ON" if self.tone_playing else "OFF")
        self.metric("Frequency", f"{self.tone_frequency} Hz{' <' if self.tone_field == 0 else ''}", 25)
        self.metric("Duty", f"{self.tone_duty}%{' <' if self.tone_field == 1 else ''}", 40)
        self.rect(12, 58, 104, 11, BLACK, DARK)
        self.rect(13, 59, int(102 * self.tone_duty / 100), 9, GREEN)
        mode = "SWEEP" if self.tone_sweeping else "CONTINUOUS" if self.tone_playing else "STOPPED"
        self.metric("Mode", mode, 77, YELLOW)
        self.centered("LEDC GPIO 9", 94, LIGHT)
        self.footer("UP/DN EDIT SEL ON/OFF MENU SWEEP")

    def draw_io(self) -> None:
        entries = ["LED output", "Buzzer beep", "Joystick raw", "Touch diagnostics"]
        self.header("I/O Tester")
        self.menu(entries, self.io_selected)
        x = int(2048 + 1700 * math.sin(self.phase * .4))
        y = int(2048 + 1700 * math.cos(self.phase * .35))
        self.centered(f"LED:{'ON' if self.led_on else 'OFF'} X:{x} Y:{y}", 83, CYAN)
        self.centered("Touch input: simulated", 96, GREY)
        self.footer("UP/DN NAV ENTER RUN")

    def draw_settings(self) -> None:
        s = self.settings
        entries = [
            ("Sound", "ON" if s.sound_on else "OFF"),
            ("LED feedback", "ON" if s.led_feedback else "OFF"),
            ("Rotation", str(s.rotation)), ("Brightness", str(s.brightness)),
            ("Joy deadzone", str(s.joystick_deadzone)),
            ("Touch threshold", str(s.touch_threshold)), ("Reset settings", "ENTER"),
        ]
        self.header("Settings")
        for i, (label, value) in enumerate(entries):
            y = 17 + i * 14
            if i == self.settings_selected:
                self.rect(1, y, 126, 12, BLUE)
                self.text(label, 4, y + 2, WHITE, max_width=86)
                self.text(value, 124, y + 2, WHITE, anchor="ne", max_width=55)
            else:
                self.text(label, 4, y + 2, LIGHT, max_width=86)
                self.text(value, 124, y + 2, LIGHT, anchor="ne", max_width=55)
        self.footer("UP/DN NAV L/R CHANGE ENTER")

    def draw_about(self) -> None:
        self.header("About")
        self.centered("PocketLab OS", 20, CYAN, 2)
        self.centered("Lightweight app launcher", 43, LIGHT)
        self.centered("for ESP32 badges", 55, LIGHT)
        self.metric("Version", "0.1.0", 73)
        self.metric("Board", "CUHSP 2021", 85)
        self.metric("Arduino core", "3.x (emulated)", 97)
        self.centered("PYTHON EMULATOR", 109, GREY)
        self.footer("BACK: HOME")

    # Input ---------------------------------------------------------------
    def on_key(self, event: tk.Event) -> None:
        key = event.keysym.lower()
        mapping = {
            "up": "up", "down": "down", "left": "left", "right": "right",
            "return": "enter", "space": "select", "backspace": "back", "escape": "back", "m": "menu",
        }
        if key in mapping:
            self.handle(mapping[key])

    def handle(self, event: str) -> None:
        if event == "back":
            if self.app != "launcher":
                self.go_home()
            return
        if self.app == "launcher":
            if event == "up": self.selected = max(0, self.selected - 1)
            elif event == "down": self.selected = min(len(self.apps) - 1, self.selected + 1)
            elif event in {"right", "enter", "select"}: self.enter_app(self.selected)
        elif self.app == "Sensor Lab": self.sensor_input(event)
        elif self.app == "Scope": self.scope_input(event)
        elif self.app == "Logic Probe": self.logic_input(event)
        elif self.app == "Pin Monitor" and event in {"left", "right"}: self.monitor_page ^= 1
        elif self.app == "Tone Tool": self.tone_input(event)
        elif self.app == "I/O Tester": self.io_input(event)
        elif self.app == "Settings": self.settings_input(event)
        self.render()

    def sensor_input(self, event: str) -> None:
        if event == "left": self.pin_index = max(0, self.pin_index - 1)
        elif event == "right": self.pin_index = min(len(ANALOG_PINS) - 1, self.pin_index + 1)
        elif event == "up": self.threshold = min(4095, self.threshold + 100)
        elif event == "down": self.threshold = max(0, self.threshold - 100)
        elif event in {"enter", "select"}: self.digital_mode = not self.digital_mode
        elif event == "menu": self.reset_sensor()

    def scope_input(self, event: str) -> None:
        if event == "left": self.pin_index = max(0, self.pin_index - 1); self.reset_scope()
        elif event == "right": self.pin_index = min(len(ANALOG_PINS) - 1, self.pin_index + 1); self.reset_scope()
        elif event in {"enter", "select"}: self.scope_paused = not self.scope_paused
        elif event == "menu": self.scope_auto = not self.scope_auto
        elif not self.scope_auto and event == "up": self.scope_manual_top = min(4095, self.scope_manual_top + 256)
        elif not self.scope_auto and event == "down": self.scope_manual_top = max(512, self.scope_manual_top - 256)

    def logic_input(self, event: str) -> None:
        if event == "left": self.logic_index = max(0, self.logic_index - 1)
        elif event == "right": self.logic_index = min(len(LOGIC_PINS) - 1, self.logic_index + 1)
        elif event in {"enter", "select"}: self.logic_active_high = not self.logic_active_high
        elif event == "menu": self.logic_rising = self.logic_falling = self.logic_pulse_us = 0

    def tone_input(self, event: str) -> None:
        if event in {"left", "right"}: self.tone_field ^= 1
        elif event == "up":
            if self.tone_field == 0: self.tone_frequency = min(5000, self.tone_frequency + 50)
            else: self.tone_duty = min(95, self.tone_duty + 5)
        elif event == "down":
            if self.tone_field == 0: self.tone_frequency = max(100, self.tone_frequency - 50)
            else: self.tone_duty = max(5, self.tone_duty - 5)
        elif event in {"enter", "select"}:
            self.tone_playing = not self.tone_playing
            self.tone_sweeping = False
        elif event == "menu":
            self.tone_sweeping = not self.tone_sweeping
            self.tone_playing = self.tone_sweeping

    def io_input(self, event: str) -> None:
        if event == "up": self.io_selected = max(0, self.io_selected - 1)
        elif event == "down": self.io_selected = min(3, self.io_selected + 1)
        elif event in {"enter", "select"}:
            if self.io_selected == 0: self.led_on = not self.led_on
            elif self.io_selected == 1:
                self.toast, self.toast_until = "BEEP 1300 Hz", time.monotonic() + .55
                if self.settings.sound_on: self.root.bell()
            elif self.io_selected == 2: self.toast, self.toast_until = "JOYSTICK CENTERED", time.monotonic() + .7
            else: self.toast, self.toast_until = "TOUCH OK", time.monotonic() + .7

    def settings_input(self, event: str) -> None:
        if event == "up": self.settings_selected = max(0, self.settings_selected - 1); return
        if event == "down": self.settings_selected = min(6, self.settings_selected + 1); return
        direction = -1 if event == "left" else 1
        if event not in {"left", "right", "enter", "select"}: return
        s, i = self.settings, self.settings_selected
        if i == 0: s.sound_on = not s.sound_on
        elif i == 1: s.led_feedback = not s.led_feedback
        elif i == 2: s.rotation = (s.rotation + direction) % 4
        elif i == 3: s.brightness = max(0, min(255, s.brightness + direction * 16))
        elif i == 4: s.joystick_deadzone = max(100, min(1800, s.joystick_deadzone + direction * 50))
        elif i == 5: s.touch_threshold = max(5, min(100, s.touch_threshold + direction * 2))
        elif i == 6 and event in {"enter", "select"}: self.settings = Settings()
        self.save_settings()

    def run(self) -> None:
        self.root.mainloop()


if __name__ == "__main__":
    PocketLabSimulator().run()

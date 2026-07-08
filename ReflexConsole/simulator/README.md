# Reflex Console Simulator (DEPRECATED)

This is a local Tkinter test harness for the handheld UI. It renders a scaled 128×128 display, uses the same test-state vocabulary, and needs no web server or third-party packages.

Run it on Raspberry Pi OS or a desktop Linux/macOS system with Python 3 and Tkinter:

```bash
python3 simulator/reflex_console_sim.py
```

Controls:

- Arrow up/down: menu and settings navigation
- Enter or Space: select and standard test response
- Left arrow: Choice Test left/blue response
- Backspace: return to the main menu
- M: return to the main menu

The simulator is for validating flow and timing behavior before uploading firmware. It does not emulate capacitive touch, real LED/buzzer output, or ESP32 Preferences. Its settings persist locally in `reflex_console_sim_settings.json` next to the script.

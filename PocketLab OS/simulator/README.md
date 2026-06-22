# PocketLab OS Python Emulator

This standard-library Tkinter application renders PocketLab OS as a scaled, pixel-addressed **128×128 display**. It mirrors the launcher, all eight apps, their major controls, persistent settings, and live sensor/probe states using synthetic data.

It follows the sibling `ReflexConsole/simulator` desktop-harness pattern. It does not emulate ESP32 electrical behavior, ADC accuracy, TFT_eSPI timing, LEDC audio, or real GPIO.

## Run

From the PocketLab OS project directory:

```bash
python3 simulator/pocketlab_os_sim.py
```

Tkinter is included with most Python desktop installations. On Debian/Raspberry Pi OS, install it if necessary:

```bash
sudo apt install python3-tk
```

## Controls

- Arrow keys: joystick directions
- Enter: Enter/start
- Space: Select
- Backspace or Escape: Back/Home
- M: Menu/shift action
- On-window buttons: Select, Back, Enter, Menu touch controls

Settings persist to `simulator/pocketlab_os_sim_settings.json`, which is generated at runtime and should not be committed.

## Simulated behavior

- Sensor Lab and Scope generate distinct noisy waveforms for GPIO 32, 36, and 39.
- Logic Probe generates a changing digital square wave and edge/pulse measurements.
- Pin Monitor produces live digital and ADC-like readings.
- Tone Tool models frequency, duty, continuous, and sweep states. I/O Tester's beep uses the desktop bell when sound is enabled.
- Brightness scales rendered colors; zero blanks the virtual TFT.

The emulator is intended for UI, navigation, and state-machine validation before flashing the badge. Hardware validation still requires the ESP32.

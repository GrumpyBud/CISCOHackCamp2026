# CUHSP / Offensive Summit ESP32 Badge Pin and Built-In Hardware Reference

Reference for the `stinky-fish/cuhsp-2021` ESP32 badge board.

Repo: <https://gitlab.com/stinky-fish/cuhsp-2021>

This file focuses on hardware that is built into the badge PCB or directly documented by the repo tutorials. The 37-in-1 sensor kit is external; the repo package list mentions it but does not enumerate every individual module in that kit.

## High-level board notes

- Board: 2020-2021 Offensive Summit Badge / OS-2020-Badge-REV0.
- Main MCU: ESP32-WROVER / ESP32-WROOM-32-class module.
- Wireless: Wi-Fi, Bluetooth, and BLE are available through the ESP32.
- Logic level: ESP32 GPIO is 3.3 V. Do not feed 5 V signals directly into GPIO.
- Screen: 1.44 inch 128 x 128 TFT LCD, ST7735 controller.
- Included external kit items from repo package list:
  - 37-in-1 sensor kit
  - breadboard/component kit
  - passive/active buzzer modules may be in the kit depending on what you received
  - joystick module used by repo tutorial

## Quick Arduino constants

```cpp
// Built-in / badge-supported hardware
constexpr int LED1_PIN = 22;

// TFT display, ST7735 128x128
constexpr int TFT_SCLK_PIN = 18;
constexpr int TFT_MOSI_PIN = 23;
constexpr int TFT_RST_PIN  = 25;
constexpr int TFT_DC_PIN   = 26;
constexpr int TFT_CS_PIN   = 19;
constexpr int TFT_BL_PIN   = 5;

// Capacitive touch pads
constexpr int TOUCH_S0_PIN = 4;
constexpr int TOUCH_S2_PIN = 2;
constexpr int TOUCH_S3_PIN = 15;
constexpr int TOUCH_S4_PIN = 13;
constexpr int TOUCH_S5_PIN = 12;
constexpr int TOUCH_S6_PIN = 14;
constexpr int TOUCH_S7_PIN = 27;
constexpr int TOUCH_S8_PIN = 33; // repo notes possible Arduino issue; GPIO32 may be needed in some cases

// Joystick tutorial pins, external joystick module
constexpr int JOY_X_PIN = 34; // TP34, ADC input-only
constexpr int JOY_Y_PIN = 35; // TP35, ADC input-only

// Passive buzzer tutorial pin, external buzzer module
constexpr int BUZZER_PIN = 9; // TP9 in repo tutorial; see caution below
```

## Built-in LED

| Name | Schematic part/net | GPIO | Test point | Arduino use | Notes |
|---|---:|---:|---:|---|---|
| LED1 | D1 / LED1 | GPIO22 | TP22 | `pinMode(22, OUTPUT); digitalWrite(22, HIGH/LOW);` | Repo LED tutorial confirms LED1 is on IO22 and TP22. |

## Capacitive touch pads

Use `touchRead(GPIO_NUMBER)` in Arduino.

| Pad | Net name | GPIO / port | Arduino constant | Notes |
|---|---:|---:|---:|---|
| S0 | TOUCH0 | GPIO4 | `4` | Capacitive pad. |
| S2 | TOUCH2 / repo table typo says TOUCH1 | GPIO2 | `2` | Capacitive pad. GPIO2 is also an ESP32 strapping pin, so avoid weird external pullups/pulldowns on boot. |
| S3 | TOUCH3 | GPIO15 | `15` | Capacitive pad. GPIO15 is also a strapping/JTAG-related pin. |
| S4 | TOUCH4 | GPIO13 | `13` | Capacitive pad. |
| S5 | TOUCH5 | GPIO12 | `12` | Capacitive pad. GPIO12 is a strapping pin. |
| S6 | TOUCH6 | GPIO14 | `14` | Capacitive pad. |
| S7 | TOUCH7 | GPIO27 | `27` | Capacitive pad. |
| S8 | TOUCH8 | GPIO33 | `33` | Repo tutorial says GPIO33, with a note that GPIO32 may be needed for some modules/Arduino bug cases. |

The repo tutorial's example threshold says values below about `20` indicated pressed on one board, while values above about `36` indicated not pressed. Treat this as a starting point only; calibrate your own board.

Example:

```cpp
const int S0 = 4;
const int TOUCH_THRESHOLD = 20;

void loop() {
  if (touchRead(S0) < TOUCH_THRESHOLD) {
    // S0 is being touched
  }
}
```

## TFT display connector P2

The badge display is a SPI ST7735 TFT. The repo screen tutorial maps P2 like this:

| Display pin | Name | Meaning | ESP32 GPIO |
|---:|---|---|---:|
| 1 | GND | ground | none |
| 2 | VCC | 3.3 V power | none |
| 3 | SCL | SPI clock | GPIO18 |
| 4 | SDA | SPI MOSI/data to display | GPIO23 |
| 5 | RES | TFT reset | GPIO25 |
| 6 | DC | data/command select | GPIO26 |
| 7 | CS | chip select | GPIO19 |
| 8 | BL | backlight | GPIO5 |

Recommended `TFT_eSPI` setup lines:

```cpp
#define ST7735_DRIVER
#define TFT_RGB_ORDER TFT_BGR
#define TFT_WIDTH  128
#define TFT_HEIGHT 128
#define ST7735_GREENTAB // or ST7735_GREENTAB128 depending on library/version/display behavior

#define TFT_MOSI 23
#define TFT_SCLK 18
#define TFT_CS   19
#define TFT_DC   26
#define TFT_RST  25
#define TFT_BL   5

#define SPI_FREQUENCY 27000000
#define SPI_READ_FREQUENCY 20000000
```

Do not define `TOUCH_CS` for this badge unless you add a separate TFT touch controller. The PCB cap-sense pads are ESP32 touch inputs, not TFT_eSPI touchscreen inputs.

## Joystick module from repo tutorial

The joystick is not built into the badge PCB; it is an external module wired to test points.

| Joystick signal | Badge test point | GPIO | Arduino read | Notes |
|---|---:|---:|---|---|
| VRx | TP34 | GPIO34 | `analogRead(34)` | ADC1 input-only pin. |
| VRy | TP35 | GPIO35 | `analogRead(35)` | ADC1 input-only pin. |
| VCC | 3.3 V | none | none | Use 3.3 V for ESP32-safe output range. |
| GND | GND | none | none | Common ground required. |

Example:

```cpp
void loop() {
  int x = analogRead(34);
  int y = analogRead(35);
}
```

## External passive buzzer from repo tutorial

The buzzer is not built into the badge PCB; the repo uses a passive buzzer from the kit and wires it to TP9.

| Buzzer signal | Badge test point | GPIO | Notes |
|---|---:|---:|---|
| signal | TP9 | GPIO9 | Repo buzzer tutorial chooses IO9 / TP9. Use caution: ESP32 GPIO6-GPIO11 are usually connected to SPI flash on many modules. If TP9 causes boot/upload instability, use a safer free GPIO instead, such as GPIO21 or GPIO32 if available and not otherwise used. |
| GND | GND | none | Common ground. |

For Arduino-ESP32 3.x, do not use old removed LEDC calls like `ledcSetup()` or `ledcAttachPin()`. Use the current pin-based LEDC API for your installed core version.

## Battery / power hardware

| Hardware | Repo/schematic detail | Notes |
|---|---|---|
| 18650 Li-ion battery | Included in package contents | Powers badge when P3 switch selects battery. |
| Adafruit Micro Lipo USB-C charger | Included in package contents and mounted at P5 | Charges the 18650 battery from USB. |
| 3.3 V regulator | TC1262-3.3VDBTR, 500 mA shown in schematic | ESP32 and GPIO are 3.3 V. |
| P3 power switch | Selects 5 V/Off vs battery according to tutorial | If no USB/serial 5 V source is connected, 5 V/Off position turns board off. |

## Analog input / oscilloscope tutorial pin

| Use | Test point | GPIO | Notes |
|---|---:|---:|---|
| Simple oscilloscope ADC input | TP34 | GPIO34 | Repo simple oscilloscope example reads `analogRead(34)`. GPIO34 is input-only, which is fine for ADC. |

The simple oscilloscope tutorial explicitly warns that a 5 V signal, such as a 555 timer output, must be divided down because the badge cannot handle more than about 3.33 V on an input.

## Common exposed test points and GPIOs

These are useful for breadboard projects. Verify the physical pad label before soldering.

| Test point | ESP32 signal / GPIO | Good for | Avoid / cautions |
|---:|---|---|---|
| TP0 | GPIO0 | boot/program strap only | Do not use casually; affects bootloader mode. |
| TP1 | RXD0 / GPIO3 | UART RX / programming | Used for flashing/debug serial. |
| TP2 | GPIO2 / TOUCH2 | touch/digital/ADC2 | Strapping pin; be careful with boot pulls. |
| TP3 | TXD0 / GPIO1 | UART TX / programming | Used for flashing/debug serial. |
| TP4 | GPIO4 / TOUCH0 | touch/digital/ADC2 | Used by cap-sense S0. |
| TP5 | GPIO5 | TFT backlight | Reserved if screen backlight is used. Strapping pin. |
| TP9 | GPIO9 | repo buzzer tutorial | Usually flash-related on many ESP32 modules; use cautiously. |
| TP12 | GPIO12 / TOUCH5 | touch/digital/ADC2 | Strapping pin; used by cap-sense S5. |
| TP13 | GPIO13 / TOUCH4 | touch/digital/ADC2 | Used by cap-sense S4; JTAG-related. |
| TP14 | GPIO14 / TOUCH6 | touch/digital/ADC2 | Used by cap-sense S6; JTAG-related. |
| TP15 | GPIO15 / TOUCH3 | touch/digital/ADC2 | Strapping/JTAG; used by cap-sense S3. |
| TP16 | GPIO16 | digital I/O | Often PSRAM-related on WROVER-class modules; verify before using. |
| TP17 | GPIO17 | digital I/O | Often PSRAM-related on WROVER-class modules; verify before using. |
| TP18 | GPIO18 | TFT SPI clock | Reserved for screen. |
| TP19 | GPIO19 | TFT chip select | Reserved for screen. |
| TP21 | GPIO21 | good general I/O / possible I2C | Good candidate for SDA/SCL if physically accessible. |
| TP22 | GPIO22 / LED1 | onboard LED | Reserved if using LED1. |
| TP23 | GPIO23 | TFT MOSI/SDA | Reserved for screen. |
| TP25 | GPIO25 | TFT reset | Reserved for screen. |
| TP26 | GPIO26 | TFT DC | Reserved for screen. |
| TP27 | GPIO27 / TOUCH7 | touch/digital/ADC2 | Used by cap-sense S7. |
| TP32 | GPIO32 | ADC1/digital/touch-capable family | Good candidate for I2C/SCL or analog. |
| TP33 | GPIO33 / TOUCH8 | ADC1/touch/digital | Used by cap-sense S8. |
| TP34 | GPIO34 | analog input | Input-only; joystick X / scope input. |
| TP35 | GPIO35 | analog input | Input-only; joystick Y. |
| TP36 | GPIO36 / SENSOR_VP | analog input | Input-only; not usable for I2C SDA/SCL output. |
| TP39 | GPIO39 / SENSOR_VN | analog input | Input-only; no internal pullups/pulldowns. |
| TP40 | EN | reset/enable | Not GPIO; do not use as I2C/SCL. |
| TP50 | RTS/autoreset area | programming/autoreset | Not a normal GPIO project pin. |

## Pin-selection advice for add-on sensors

Good starting choices for an MPU-6050 or other I2C module:

```cpp
constexpr int I2C_SDA_PIN = 21; // TP21
constexpr int I2C_SCL_PIN = 32; // TP32
Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
```

Do not use:

- GPIO36 / TP36 for SDA or SCL. It is input-only.
- GPIO34 / TP34 or GPIO35 / TP35 for SDA or SCL. They are input-only.
- TP40 for SCL. TP40 is EN, not GPIO.
- TFT pins if the screen is connected and active: GPIO18, 19, 23, 25, 26, 5.
- GPIO6-GPIO11 unless you know exactly what the module/schematic is doing; Espressif notes they are usually connected to SPI flash.

## What is not built in

The badge repo/schematic does not show built-in versions of these sensors:

- MPU-6050 / accelerometer / gyro
- magnetometer / compass
- temperature sensor, aside from ESP32 internal temperature-like features not exposed as a project sensor
- ultrasonic sensor
- PIR sensor
- microphone/sound sensor
- light sensor
- RFID reader

Those are external breadboard modules if present in your sensor kit.

## Sources used

- Main repo README: <https://gitlab.com/stinky-fish/cuhsp-2021/-/raw/master/Readme.md>
- Package contents: <https://gitlab.com/stinky-fish/cuhsp-2021/-/raw/master/Package%20Contents/readme.md>
- Badge schematic PDF: <https://gitlab.com/stinky-fish/cuhsp-2021/-/raw/master/Schematic/OS-2020-Badge-REV0-Schematic.PDF>
- LED tutorial: <https://gitlab.com/stinky-fish/cuhsp-2021/-/raw/master/Tutorials/LED-Blink-Tutorial.md>
- Screen text tutorial: <https://gitlab.com/stinky-fish/cuhsp-2021/-/raw/master/Tutorials/Screen-Text-Tutorial.md>
- Touch button tutorial: <https://gitlab.com/stinky-fish/cuhsp-2021/-/raw/master/Tutorials/Touch-Button-Tutorial.md>
- Joystick tutorial: <https://gitlab.com/stinky-fish/cuhsp-2021/-/raw/master/Tutorials/Joystick-Tutorial.md>
- Buzzer tutorial: <https://gitlab.com/stinky-fish/cuhsp-2021/-/raw/master/Tutorials/Buzzer-tutorial.md>
- Battery tutorial: <https://gitlab.com/stinky-fish/cuhsp-2021/-/raw/master/Tutorials/Battery-Tutorial.md>
- Simple oscilloscope tutorial: <https://gitlab.com/stinky-fish/cuhsp-2021/-/raw/master/Tutorials/simple_oscilloscope.md>
- ESP32 GPIO restrictions: <https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/gpio.html>

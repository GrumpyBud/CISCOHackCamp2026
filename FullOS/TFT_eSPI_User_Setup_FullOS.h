// Copy this file over TFT_eSPI/User_Setup.h, or select it from User_Setup_Select.h.
#define USER_SETUP_INFO "FullOS CUHSP 2021 badge"

#define ST7735_DRIVER
#define TFT_WIDTH 128
#define TFT_HEIGHT 128
#define ST7735_GREENTAB
#define TFT_RGB_ORDER TFT_BGR

#define TFT_MOSI 23
#define TFT_SCLK 18
#define TFT_CS   19
#define TFT_DC   26
#define TFT_RST  25
#define TFT_BL   5
#define TFT_BACKLIGHT_ON HIGH

#define SPI_FREQUENCY 27000000
#define SPI_READ_FREQUENCY 20000000

#define LOAD_GLCD
#define LOAD_FONT2
#define LOAD_FONT4

#pragma once
#include <Arduino.h>

enum class InputEventType : uint8_t { None, Up, Down, Left, Right, Select, Back, Enter, Menu, LongPress };
struct InputEvent { InputEventType type = InputEventType::None; };

class App {
 public:
  virtual ~App() = default;
  virtual const char* name() const = 0;
  virtual void onEnter() = 0;
  virtual void onExit() = 0;
  virtual void update(uint32_t nowMs) = 0;
  virtual void draw() = 0;
  virtual void handleInput(const InputEvent& event) = 0;
};

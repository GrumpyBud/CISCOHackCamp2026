#pragma once
#include "AppSupport.h"
class AboutApp : public AppSupport {
 public:
  using AppSupport::AppSupport;
  const char* name() const override { return "About"; }
  void onEnter() override { needsDraw_ = true; }
  void update(uint32_t) override {}
  void draw() override;
  void handleInput(const InputEvent&) override {}
};

package com.radar.scan.controllers;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/")
public class HomeController {

    @GetMapping
    public String home() {
        return "redirect:/radar.html";
    }
    
    @GetMapping("/3d")
    public String radar3d() {
        return "redirect:/radar3d.html";
    }
}

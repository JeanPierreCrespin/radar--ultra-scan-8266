package com.radar.scan.controllers;

import com.radar.scan.entities.RadarData;
import com.radar.scan.services.RadarDataService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/radar")
public class RadarDataController {

    @Autowired
    private RadarDataService radarDataService;

    @PostMapping
    public ResponseEntity<RadarData> addRadarData(@RequestBody RadarData radarData) {
        try{
            RadarData radarData1 = radarDataService.saveRadarData(radarData);
            return  ResponseEntity.ok(radarData1);
        }catch(Exception e){
            return ResponseEntity.badRequest().build();
        }
    }
}

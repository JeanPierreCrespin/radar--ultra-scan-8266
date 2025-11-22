package com.radar.scan.services;

import com.radar.scan.entities.RadarData;
import com.radar.scan.repositories.RadarDataRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class RadarDataService {

    @Autowired
    private RadarDataRepository radarDataRepository;

    public RadarData saveRadarData(RadarData radarData) {
        if(radarData.getId() == null){
            throw  new RuntimeException("ID invalido");
        }
        if(radarData.getDistance() == null){
            throw  new RuntimeException("Distance invalido");
        }

        if(radarData.getAngle() == null){
            throw  new RuntimeException("Angle invalido");
        }

       return radarDataRepository.save(radarData);
    }
}

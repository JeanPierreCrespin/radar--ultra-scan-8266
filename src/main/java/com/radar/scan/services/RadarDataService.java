package com.radar.scan.services;

import com.radar.scan.entities.RadarData;
import com.radar.scan.repositories.RadarDataRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Service
public class RadarDataService {

    @Autowired
    private RadarDataRepository radarDataRepository;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

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

        // Guardar en base de datos
        RadarData savedData = radarDataRepository.save(radarData);
        
        // Enviar por WebSocket a todos los clientes conectados
        messagingTemplate.convertAndSend("/topic/radar", savedData);
        
        return savedData;
    }
}

package com.radar.scan.entities;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import lombok.Data;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity(name = "radar_data")
@Data
@Getter
@Setter
@NoArgsConstructor
public class RadarData {

    @Id
    private String id;
    private Double distance;
    private Double angle;
}

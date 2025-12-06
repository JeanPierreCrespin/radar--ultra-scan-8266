package com.radar.scan.entities;


import lombok.Data;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

//@Entity(name = "radar_data")
@Data
@Getter
@Setter
@NoArgsConstructor
public class RadarData {

    private String id;
    private Double distance;
    private Double angle;
}

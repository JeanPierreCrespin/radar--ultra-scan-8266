package com.radar.scan.repositories;

import com.radar.scan.entities.RadarData;
import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface RadarDataRepository extends CrudRepository<RadarData, String> {
}

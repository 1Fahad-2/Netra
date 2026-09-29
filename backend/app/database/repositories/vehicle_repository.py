"""
MachineMind — Vehicle Repository
Encapsulates CRUD operations and deterministic prototype seeding for HEMM vehicles.
"""

from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database.models import Vehicle


class VehicleRepository:
    """Data access repository for Vehicle models."""

    @staticmethod
    def get_all(db: Session) -> List[Vehicle]:
        """Returns all registered vehicles ordered by vehicle_id."""
        stmt = select(Vehicle).order_by(Vehicle.vehicle_id)
        return list(db.scalars(stmt).all())

    @staticmethod
    def get_by_id(db: Session, vehicle_id: str) -> Optional[Vehicle]:
        """Returns vehicle by its unique string vehicle_id (e.g. 'HEMM-01')."""
        stmt = select(Vehicle).where(Vehicle.vehicle_id == vehicle_id)
        return db.scalars(stmt).first()

    @staticmethod
    def count(db: Session) -> int:
        """Returns total count of registered vehicles."""
        return len(VehicleRepository.get_all(db))

    @staticmethod
    def seed_prototypes(db: Session) -> List[Vehicle]:
        """
        Deterministically seeds exactly two prototype vehicles:
        - HEMM-01: 100T Dumper (Following)
        - HEMM-02: 100T Dumper (Lead)
        Enforces zero fleet inflation (never seeds any third vehicle).
        """
        prototypes = [
            {
                "vehicle_id": "HEMM-01",
                "vehicle_type": "100T DUMPER (LEAD)",
                "status": "ACTIVE",
                "data_provenance": "SIMULATED",
            },
            {
                "vehicle_id": "HEMM-02",
                "vehicle_type": "100T DUMPER (TRAILING)",
                "status": "ACTIVE",
                "data_provenance": "SIMULATED",
            },
        ]

        seeded_vehicles = []
        for proto in prototypes:
            existing = VehicleRepository.get_by_id(db, proto["vehicle_id"])
            if existing is None:
                new_veh = Vehicle(
                    vehicle_id=proto["vehicle_id"],
                    vehicle_type=proto["vehicle_type"],
                    status=proto["status"],
                    data_provenance=proto["data_provenance"],
                )
                db.add(new_veh)
                seeded_vehicles.append(new_veh)
            else:
                seeded_vehicles.append(existing)

        db.commit()
        for v in seeded_vehicles:
            db.refresh(v)

        return seeded_vehicles

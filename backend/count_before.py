from app.database.connection import engine
from sqlalchemy import text
with engine.connect() as conn:
    cnt = conn.execute(text('SELECT COUNT(*) FROM telemetry_events')).scalar()
    print('COUNT BEFORE:', cnt)

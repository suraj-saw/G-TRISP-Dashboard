import traceback
import sys
from sqlalchemy import text
from app.database import engine

try:
    with engine.connect() as conn:
        res = conn.execute(text('SELECT COUNT(*) FROM gujarat_roads')).fetchone()
        print('Total roads:', res[0])
except Exception as e:
    print('Error:', e)
    traceback.print_exc()

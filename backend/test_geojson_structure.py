import json

try:
    with open('data/Gujarat_Roads.geojson', 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    if isinstance(data, dict) and data.get('type') == 'FeatureCollection':
        features = data.get('features', [])
        print(f"File is a FeatureCollection with {len(features)} features.")
    else:
        print("File is not a FeatureCollection.")
except Exception as e:
    print(f"Error: {e}")

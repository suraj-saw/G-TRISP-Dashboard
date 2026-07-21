import json
import traceback

try:
    with open('data/Gujarat_Roads.geojson', 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    props = data['features'][0]['properties']
    geom_type = data['features'][0]['geometry']['type']
    
    with open('test_output.txt', 'w') as out:
        out.write(f"Properties: {props}\nGeometry Type: {geom_type}\n")
except Exception as e:
    with open('test_output.txt', 'w') as out:
        out.write(f"Error: {e}\n{traceback.format_exc()}\n")

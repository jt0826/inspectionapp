import os, json

candidates = [
    os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'src', 'config', 'db.json')),
    os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'config', 'db.json')),
    os.path.normpath(os.path.join(os.path.dirname(__file__), 'config', 'db.json')),
]
found = None
for p in candidates:
    if os.path.exists(p):
        found = p
        break
print('Candidates:', candidates)
if not found:
    print('No db.json found')
else:
    print('Found db.json at', found)
    with open(found, 'r') as f:
        cfg = json.load(f)
    print('DB config:', json.dumps(cfg, indent=2))
    print('Inspection table (legacy key):', cfg.get('Inspection', cfg.get('InspectionItems')))
    print('InspectionData:', cfg.get('InspectionData'))
    print('VenueRoomData:', cfg.get('VenueRoomData'))

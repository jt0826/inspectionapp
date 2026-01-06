import os, sys
# ensure lambda package path is importable without using the reserved word 'lambda' as a top-level package
base = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
if base not in sys.path:
    sys.path.insert(0, base)
from schemas.db import validate_inspection_metadata, validate_inspection_item, validate_inspection_image

sample_meta = {
    'inspection_id': 'inspection_abc123',
    'venue_id': 'venue_1',
    'inspector_name': 'Alex',
    'status': 'in-progress'
}

sample_item = {
    'inspection_id': 'inspection_abc123',
    'room_id': 'room_1',
    'item_id': 'item_1',
    'name': 'Fire extinguisher',
    'status': 'pass'
}

sample_image = {
    'inspection_id': 'inspection_abc123',
    'room_id': 'room_1',
    'item_id': 'item_1',
    'image_id': 'photo_001',
    's3Key': 'venue-1/inspection_abc123/photo_001.jpg'
}

print('Validating meta...')
print(validate_inspection_metadata(sample_meta))
print('Validating item...')
print(validate_inspection_item(sample_item))
print('Validating image...')
print(validate_inspection_image(sample_image))

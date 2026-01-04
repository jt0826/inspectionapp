import json
from dashboard import lambda_handler


def test_dashboard_empty(monkeypatch):
    event = {'httpMethod': 'POST', 'body': json.dumps({})}

    # monkeypatch the scan helpers to return predictable data
    monkeypatch.setattr('dashboard._get_inspections', lambda: [])
    monkeypatch.setattr('dashboard._get_venues', lambda: [])
    monkeypatch.setattr('dashboard._count_images', lambda: 0)

    resp = lambda_handler(event, None)
    assert resp['statusCode'] == 200
    body = json.loads(resp['body'])
    assert body['metrics']['totalInspections'] == 0
    assert body['metrics']['ongoing'] == 0
    assert body['metrics']['completed'] == 0
    assert body['metrics']['imagesCount'] == 0


def test_dashboard_with_data(monkeypatch):
    # create fake inspections matching the API response format
    now = '2026-01-01T12:00:00Z'
    items = [
        {
            'inspection_id': 'i1',
            'status': 'completed',
            'completedAt': now,
            'totals': {'total': 3, 'pass': 2, 'fail': 1, 'na': 0, 'pending': 0},
            'venueName': 'V1',
            'venueId': 'v1',
            'inspectorName': 'Inspector A',
            'timestamp': '2026-01-01T10:00:00Z'
        },
        {
            'inspection_id': 'i2',
            'status': 'in-progress',
            'timestamp': now,
            'totals': {'total': 2, 'pass': 1, 'fail': 0, 'na': 0, 'pending': 1},
            'venueName': 'V1',
            'venueId': 'v1',
            'inspectorName': 'Inspector B'
        },
    ]
    
    # Mock venues
    venues = [
        {'venueId': 'v1', 'name': 'V1', 'rooms': [
            {'roomId': 'R1', 'items': [{'itemId': 'item1'}, {'itemId': 'item2'}, {'itemId': 'item3'}]},
            {'roomId': 'R2', 'items': [{'itemId': 'item4'}, {'itemId': 'item5'}]}
        ]}
    ]
    
    monkeypatch.setattr('dashboard._get_inspections', lambda: items)
    monkeypatch.setattr('dashboard._get_venues', lambda: venues)
    monkeypatch.setattr('dashboard._count_images', lambda: 5)

    resp = lambda_handler({'httpMethod': 'POST', 'body': json.dumps({'days': 7})}, None)
    assert resp['statusCode'] == 200
    body = json.loads(resp['body'])
    assert body['metrics']['totalInspections'] == 2
    assert body['metrics']['ongoing'] == 1
    assert body['metrics']['completed'] == 1
    assert body['metrics']['imagesCount'] == 5
    assert isinstance(body['recentCompleted'], list) and len(body['recentCompleted']) == 7

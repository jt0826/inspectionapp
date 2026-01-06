from .utils import build_response
from boto3 import resource


def handle_get_inspection(event_body: dict, debug):
    inspection_id = event_body.get('inspection_id') or (event_body.get('inspection') or {}).get('inspection_id') or (event_body.get('inspection') or {}).get('id')
    if not inspection_id:
        return build_response(400, {'message': 'inspection_id is required for get_inspection'})

    room_filter = event_body.get('roomId') or event_body.get('room_id') or None

    try:
        client = resource('dynamodb')
        table = client.Table('InspectionItems')
        from boto3.dynamodb.conditions import Key
        resp = table.query(KeyConditionExpression=Key('inspection_id').eq(inspection_id))
        items = resp.get('Items', [])
        if room_filter:
            items = [it for it in items if it.get('roomId') == room_filter]
        return build_response(200, {'items': items})
    except Exception as e:
        debug(f'Failed to query inspection: {e}')
        return build_response(500, {'message': 'Failed to query inspection', 'error': str(e)})
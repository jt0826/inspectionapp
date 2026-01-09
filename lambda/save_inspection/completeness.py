import boto3

TABLE_NAME = 'InspectionItems'
VENUE_ROOM_TABLE = 'VenueRooms'

dynamodb = boto3.resource('dynamodb')


def _convert_decimal(val):
    """Convert Decimal to int for JSON serialization."""
    from decimal import Decimal
    if isinstance(val, Decimal):
        return int(val) if val % 1 == 0 else float(val)
    return val


def check_inspection_complete(inspection_id: str, venue_id: str, debug=None):
    # load venue rooms/items
    vtable = dynamodb.Table(VENUE_ROOM_TABLE)
    vresp = vtable.get_item(Key={'venueId': venue_id})
    venue = vresp.get('Item') or {}
    rooms = venue.get('rooms') or []
    expected = []
    for r in rooms:
        rid = r.get('roomId') or r.get('id')
        for it in r.get('items', []):
            iid = it.get('itemId') or it.get('id')
            if rid and iid:
                expected.append((rid, iid))

    total_expected = len(expected)
    if total_expected == 0:
        if debug:
            debug(f"check_inspection_complete: inspection={inspection_id}, venue={venue_id}, no expected items found")
        return {'complete': False, 'reason': 'no expected items found', 'total_expected': 0}

    # Discover pk attr
    client = boto3.client('dynamodb')
    desc = client.describe_table(TableName=TABLE_NAME)
    key_schema = desc.get('Table', {}).get('KeySchema', [])
    pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')

    from boto3.dynamodb.conditions import Key
    table = dynamodb.Table(TABLE_NAME)
    resp = table.query(KeyConditionExpression=Key(pk_attr).eq(inspection_id))
    items = resp.get('Items', []) or []

    status_map = {}
    pass_count = 0
    for it in items:
        roomid = it.get('roomId')
        itemid = it.get('itemId')
        status = (it.get('status') or '').lower()
        if roomid and itemid:
            status_map[(roomid, itemid)] = status
            if status == 'pass':
                pass_count += 1

    missing = []
    for (r, i) in expected:
        st = status_map.get((r, i))
        if st != 'pass':
            missing.append({'roomId': r, 'itemId': i, 'found': st})
            if debug:
                debug(f"check_inspection_complete: inspection={inspection_id}, venue={venue_id}, expected_total={total_expected}, non_pass_found={{'roomId': r, 'itemId': i, 'status': st}}, pass_count={pass_count}")
            return {'complete': False, 'missing': missing, 'total_expected': _convert_decimal(total_expected), 'completed_count': _convert_decimal(pass_count)}

    if debug:
        debug(f"check_inspection_complete: inspection={inspection_id}, venue={venue_id}, all expected items PASS, total_expected={total_expected}, pass_count={pass_count}")
    return {'complete': True, 'missing': [], 'total_expected': _convert_decimal(total_expected), 'completed_count': _convert_decimal(pass_count)}
from .utils import build_response
from boto3 import resource, client


def handle_get_inspection_summary(event_body: dict, debug):
    inspection_id = event_body.get('inspection_id') or (event_body.get('inspection') or {}).get('inspection_id') or (event_body.get('inspection') or {}).get('id')
    if not inspection_id:
        return build_response(400, {'message': 'inspection_id is required for get_inspection_summary'})

    try:
        ddb_client = client('dynamodb')
        desc = ddb_client.describe_table(TableName='InspectionItems')
        key_schema = desc.get('Table', {}).get('KeySchema', [])
        pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')
        sk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'RANGE'), None)
    except Exception as e:
        debug(f'Failed to describe table for summary: {e}')
        pk_attr = 'inspection_id'
        sk_attr = None

    try:
        table = resource('dynamodb').Table('InspectionItems')
        from boto3.dynamodb.conditions import Key
        resp = table.query(KeyConditionExpression=Key(pk_attr).eq(inspection_id))
        items = resp.get('Items', [])

        totals = {'pass': 0, 'fail': 0, 'na': 0, 'pending': 0, 'total': 0}
        by_room = {}
        for it in items:
            if sk_attr and it.get(sk_attr) == '__meta__':
                continue
            item_id = it.get('itemId') or it.get('item') or it.get('ItemId')
            if not item_id:
                continue
            status = (it.get('status') or 'pending').lower()
            rid = it.get('roomId') or it.get('room_id') or it.get('room') or ''
            totals['total'] += 1
            if status == 'pass':
                totals['pass'] += 1
            elif status == 'fail':
                totals['fail'] += 1
            elif status == 'na':
                totals['na'] += 1
            else:
                totals['pending'] += 1

            if rid:
                br = by_room.setdefault(rid, {'pass': 0, 'fail': 0, 'na': 0, 'pending': 0, 'total': 0})
                br['total'] += 1
                if status == 'pass':
                    br['pass'] += 1
                elif status == 'fail':
                    br['fail'] += 1
                elif status == 'na':
                    br['na'] += 1
                else:
                    br['pending'] += 1

        return build_response(200, {'inspection_id': inspection_id, 'totals': totals, 'byRoom': by_room})
    except Exception as e:
        debug(f'Failed to compute inspection summary: {e}')
        return build_response(500, {'message': 'Failed to compute summary', 'error': str(e)})
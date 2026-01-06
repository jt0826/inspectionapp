from .utils import build_response
from boto3 import client


def handle_list_inspections(event_body: dict, debug):
    try:
        ddb = client('dynamodb')
        desc = ddb.describe_table(TableName='InspectionItems')
        key_schema = desc.get('Table', {}).get('KeySchema', [])
        pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')
        sk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'RANGE'), None)
    except Exception:
        pk_attr = 'inspection_id'
        sk_attr = None

    from boto3 import resource
    try:
        # Read canonical inspection summaries from InspectionMetadata table
        table = resource('dynamodb').Table('InspectionMetadata')
        resp = table.scan()
        items = resp.get('Items', [])
        inspections_list = []
        for it in items:
            # Normalize keys to canonical API shape (camelCase)
            comp = it.get('completedAt') or it.get('completed_at') or None
            row = {
                'inspection_id': it.get('inspection_id') or it.get('inspectionId') or it.get('id'),
                'venueId': it.get('venueId') or it.get('venue_id') or it.get('venueId'),
                'roomId': it.get('roomId') or it.get('room_id'),
                'createdBy': it.get('createdBy') or it.get('created_by'),
                'createdAt': it.get('createdAt') or it.get('created_at'),
                'updatedAt': it.get('updatedAt') or it.get('updated_at'),
                'venueName': it.get('venueName') or it.get('venue_name') or None,
                'status': it.get('status', 'in-progress'),
                # Include any server-provided totals/byRoom if present to avoid client recompute
                'totals': it.get('totals') or None,
                'byRoom': it.get('byRoom') or it.get('by_room') or None,
            }
            if comp is not None:
                row['completedAt'] = comp
            inspections_list.append(row)
        return build_response(200, {'inspections': inspections_list})
    except Exception as e:
        debug(f'Failed to list inspections from InspectionMetadata: {e}')
        return build_response(500, {'message': 'Failed to list inspections', 'error': str(e)})
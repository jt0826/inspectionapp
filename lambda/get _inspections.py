import json
import boto3
from datetime import datetime, timezone


def _parse_iso_to_aware(val):
    """Parse an ISO date string and return a timezone-aware datetime.
    If input is naive, assume UTC."""
    if not val:
        return None
    try:
        dt = datetime.fromisoformat(str(val))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None
import traceback

# CORS/header configuration
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Content-Type': 'application/json'
}

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
table_name = 'InspectionData'  # Replace with your table name
table = dynamodb.Table(table_name)


def _try_parse_date(val):
    if not val:
        return None
    if isinstance(val, str):
        try:
            dt = datetime.fromisoformat(val)
            # If the stored datetime is naive, assume it was UTC and mark it as such so
            # the frontend receives an ISO string with explicit timezone information.
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except Exception:
            return val
    return val


def lambda_handler(event, context):
    try:
        # Log the incoming event for debugging
        print('Received event:', json.dumps(event))

        # Support POST body with action or simple GET request
        body = {}
        if event.get('body'):
            try:
                body = json.loads(event['body'])
            except Exception:
                body = event['body'] or {}

        action = body.get('action') if isinstance(body, dict) else None

        # LIST_INSPECTIONS: return inspection metadata from InspectionData
        if not action or action == 'list_inspections':
            # Scan the table with pagination (use strongly-consistent reads so list reflects recent writes)
            items = []
            try:
                resp = table.scan(ConsistentRead=True)
                items.extend(resp.get('Items', []) or [])
                while 'LastEvaluatedKey' in resp:
                    resp = table.scan(ExclusiveStartKey=resp['LastEvaluatedKey'], ConsistentRead=True)
                    items.extend(resp.get('Items', []) or [])
            except Exception as e:
                print('Failed to scan InspectionData:', e)
                print(traceback.format_exc())
                return {
                    'statusCode': 500,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'message': 'Failed to scan InspectionData table', 'error': str(e)})
                }

            inspections = []
            for it in items:
                created = _try_parse_date(it.get('createdAt') or it.get('created_at') or None)
                updated = _try_parse_date(it.get('updatedAt') or it.get('updated_at') or None)
                inspector = it.get('inspectorName') or it.get('createdBy') or it.get('created_by') or None

                obj = {
                    'inspection_id': it.get('inspection_id') or it.get('inspectionId') or it.get('id'),
                    'createdAt': created,
                    'venueId': it.get('venueId') or it.get('venue_id') or None,
                    'venueName': it.get('venueName') or it.get('venue_name') or None,
                    'venue_name': it.get('venue_name') or it.get('venueName') or None,
                    'roomId': it.get('roomId') or it.get('room_id') or None,
                    'roomName': it.get('roomName') or it.get('room_name') or None,
                    'completedAt': _try_parse_date(it.get('completedAt') or it.get('completed_at') or None),
                    'status': (it.get('status') or '').lower() if it.get('status') else None,
                    'raw': it
                }

                # include creator and inspector display names if present on the item
                obj['createdBy'] = it.get('createdBy') or it.get('created_by') or it.get('inspectorName') or None
                obj['inspectorName'] = it.get('inspectorName') or it.get('createdBy') or it.get('created_by') or None

                if updated:
                    obj['updatedAt'] = updated
                # prefer explicit updatedBy field if present, otherwise fall back to inspectorName
                obj['updatedBy'] = it.get('updatedBy') or inspector or None

                inspections.append(obj)

            return {
                'statusCode': 200,
                'headers': CORS_HEADERS,
                'body': json.dumps({'inspections': inspections})
            }

        # GET_INSPECTION: return raw items for a given inspection id
        if action == 'get_inspection':
            inspection_id = body.get('inspection_id') or (body.get('inspection') or {}).get('inspection_id') or (body.get('inspection') or {}).get('id')
            if not inspection_id:
                return {
                    'statusCode': 400,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'message': 'inspection_id is required for get_inspection'})
                }

            try:
                insp_table = dynamodb.Table('Inspection')
                client = boto3.client('dynamodb')
                desc = client.describe_table(TableName='Inspection')
                key_schema = desc.get('Table', {}).get('KeySchema', [])
                pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')

                from boto3.dynamodb.conditions import Key
                # Use a strongly-consistent read so recent writes are visible immediately
                resp = insp_table.query(KeyConditionExpression=Key(pk_attr).eq(inspection_id), ConsistentRead=True)
                items = resp.get('Items', [])

                # Normalize date fields to timezone-aware ISO strings so clients render consistent local times
                for it in items:
                    for k in ('createdAt', 'created_at', 'updatedAt', 'updated_at', 'completedAt', 'completed_at'):
                        if it.get(k):
                            dt = _parse_iso_to_aware(it.get(k))
                            if dt:
                                it[k] = dt.isoformat()

                return {
                    'statusCode': 200,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'items': items})
                }
            except Exception as e:
                print('Failed to query Inspection table for get_inspection:', e)
                print(traceback.format_exc())
                return {
                    'statusCode': 500,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'message': 'Failed to query Inspection table', 'error': str(e)})
                }

        # GET_INSPECTION_SUMMARY: compute totals and byRoom for an inspection
        if action == 'get_inspection_summary':
            inspection_id = body.get('inspection_id') or (body.get('inspection') or {}).get('inspection_id') or (body.get('inspection') or {}).get('id')
            if not inspection_id:
                return {
                    'statusCode': 400,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'message': 'inspection_id is required for get_inspection_summary'})
                }

            try:
                insp_table = dynamodb.Table('Inspection')
                client = boto3.client('dynamodb')
                desc = client.describe_table(TableName='Inspection')
                key_schema = desc.get('Table', {}).get('KeySchema', [])
                pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')

                from boto3.dynamodb.conditions import Key
                # Use a strongly-consistent read so recent writes are visible immediately
                resp = insp_table.query(KeyConditionExpression=Key(pk_attr).eq(inspection_id), ConsistentRead=True)
                items = resp.get('Items', [])

                totals = {'pass': 0, 'fail': 0, 'na': 0, 'pending': 0, 'total': 0}
                by_room = {}
                latest_ts = None
                latest_by = None
                for it in items:
                    # ignore meta rows
                    if 'sk' in it and it.get('sk') == '__meta__':
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

                    ts_raw = it.get('updatedAt') or it.get('updated_at') or it.get('createdAt') or it.get('created_at')
                    if ts_raw:
                        dt = _parse_iso_to_aware(ts_raw)
                        if dt:
                            # Normalize to ISO with offset for consistency
                            ts = dt.isoformat()
                            if not latest_ts:
                                latest_ts = ts
                                latest_by = it.get('inspectorName') or it.get('createdBy') or it.get('inspector_name') or it.get('created_by') or None
                            else:
                                ldt = _parse_iso_to_aware(latest_ts)
                                if ldt is None or dt > ldt:
                                    latest_ts = ts
                                    latest_by = it.get('inspectorName') or it.get('createdBy') or it.get('inspector_name') or it.get('created_by') or None

                return {
                    'statusCode': 200,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'inspection_id': inspection_id, 'totals': totals, 'byRoom': by_room, 'lastUpdated': latest_ts, 'lastUpdatedBy': latest_by})
                }
            except Exception as e:
                print('Failed to compute inspection summary in get_inspections:', e)
                print(traceback.format_exc())
                return {
                    'statusCode': 500,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'message': 'Failed to compute summary', 'error': str(e)})
                }

        # CHECK_INSPECTION_COMPLETE: compare against venue definition
        if action == 'check_inspection_complete':
            inspection_id = body.get('inspection_id') or (body.get('inspection') or {}).get('inspection_id') or (body.get('inspection') or {}).get('id')
            venue_id = body.get('venueId') or body.get('venue_id') or (body.get('inspection') or {}).get('venueId')
            if not inspection_id or not venue_id:
                return {
                    'statusCode': 400,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'message': 'inspection_id and venueId required'})
                }
            try:
                # load venue rooms/items
                vtable = dynamodb.Table('VenueRoomData')
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
                    return {
                        'statusCode': 200,
                        'headers': CORS_HEADERS,
                        'body': json.dumps({'complete': False, 'reason': 'no expected items found', 'total_expected': 0})
                    }

                insp_table = dynamodb.Table('Inspection')
                client = boto3.client('dynamodb')
                desc = client.describe_table(TableName='Inspection')
                key_schema = desc.get('Table', {}).get('KeySchema', [])
                pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')

                from boto3.dynamodb.conditions import Key
                # Use a strongly-consistent read so recent writes are visible immediately
                resp = insp_table.query(KeyConditionExpression=Key(pk_attr).eq(inspection_id), ConsistentRead=True)
                items = resp.get('Items', [])
                present = set()
                for it in items:
                    roomid = it.get('roomId')
                    itemid = it.get('itemId')
                    status = it.get('status')
                    if status == 'pass':
                        present.add((roomid, itemid))

                missing = [ {'roomId': r, 'itemId': i} for (r,i) in expected if (r,i) not in present ]
                return {
                    'statusCode': 200,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'complete': len(missing) == 0, 'missing': missing, 'total_expected': total_expected, 'completed_count': total_expected - len(missing)})
                }
            except Exception as e:
                print('Failed to check completion in get_inspections:', e)
                print(traceback.format_exc())
                return {
                    'statusCode': 500,
                    'headers': CORS_HEADERS,
                    'body': json.dumps({'message': 'Failed to check completion', 'error': str(e)})
                }

        # Unknown action
        return {
            'statusCode': 400,
            'headers': CORS_HEADERS,
            'body': json.dumps({'message': 'Unsupported action', 'action': action})
        }

    except Exception as e:
        print('get_inspections lambda error:', e)
        try:
            print('Event body for debugging:', json.dumps(event.get('body') or ''))
        except Exception:
            print('Event body (non-json):', str(event.get('body')))
        print(traceback.format_exc())
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'message': 'Internal server error', 'error': str(e)})
        }
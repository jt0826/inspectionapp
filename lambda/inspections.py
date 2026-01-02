import json
import boto3
from datetime import datetime

TABLE_NAME = 'Inspection'
CORS_HEADERS = {
    'Access-Control-Allow-Origin': 'http://localhost:3000',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
    'Content-Type': 'application/json'
}

dynamodb = boto3.resource('dynamodb')

def build_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(body)
    }


def lambda_handler(event, context):
    method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method')
    if method == 'OPTIONS':
        return build_response(204, {})

    try:
        body = {}
        if event.get('body'):
            try:
                body = json.loads(event['body'])
            except Exception:
                body = event['body'] or {}

        # If body contains nested JSON string in 'body', try to parse it
        if isinstance(body, dict) and isinstance(body.get('body'), str):
            try:
                nested = json.loads(body['body'])
                for k, v in nested.items():
                    if k not in body:
                        body[k] = v
            except Exception:
                pass

        action = body.get('action') or body.get('Action')
        print('action:', action)

        table = dynamodb.Table(TABLE_NAME)

        # Helper: check completion for an inspection against venue definition
        def check_inspection_complete(inspection_id, venue_id):
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
                return {'complete': False, 'reason': 'no expected items found', 'total_expected': 0}

            # Discover pk attr
            client = boto3.client('dynamodb')
            desc = client.describe_table(TableName=TABLE_NAME)
            key_schema = desc.get('Table', {}).get('KeySchema', [])
            pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')

            from boto3.dynamodb.conditions import Key
            resp = table.query(KeyConditionExpression=Key(pk_attr).eq(inspection_id))
            items = resp.get('Items', [])
            present = set()
            for it in items:
                roomid = it.get('roomId')
                itemid = it.get('itemId')
                status = it.get('status')
                # Only count an item as present when it is a PASS — completion requires every expected item to be PASS
                if status == 'pass':
                    present.add((roomid, itemid))

            missing = [ {'roomId': r, 'itemId': i} for (r,i) in expected if (r,i) not in present ]
            return {'complete': len(missing) == 0, 'missing': missing, 'total_expected': total_expected, 'completed_count': total_expected - len(missing)}

        if action == 'save_inspection':
            ins = body.get('inspection') or body
            # support both id and inspection_id
            inspection_id = ins.get('inspection_id') or ins.get('id')
            room_id = ins.get('roomId') or ins.get('room_id')
            items = ins.get('items') or []

            if not inspection_id:
                return build_response(400, {'message': 'inspection_id is required'})

            now = datetime.utcnow().isoformat()
            # Discover table key schema to ensure we write the correct attribute names
            client = boto3.client('dynamodb')
            try:
                desc = client.describe_table(TableName=TABLE_NAME)
                key_schema = desc.get('Table', {}).get('KeySchema', [])
                print('Table key schema:', key_schema)
                pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')
                sk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'RANGE'), None)
            except Exception as e:
                print('Failed to describe table:', e)
                # fallback to expected names
                pk_attr = 'inspection_id'
                sk_attr = None

            # If no items were provided, write a meta record so the inspection can be resumed later
            if len(items) == 0:
                try:
                    key = {pk_attr: inspection_id}
                    if sk_attr:
                        key[sk_attr] = '__meta__'
                    item = {pk_attr: inspection_id, 'createdAt': ins.get('timestamp', now), 'updatedAt': now, 'inspectorName': ins.get('inspectorName'), 'venueId': ins.get('venueId'), 'venueName': ins.get('venueName'), 'roomId': room_id, 'roomName': ins.get('roomName'), 'status': ins.get('status') or 'in-progress'}
                    if sk_attr:
                        item[sk_attr] = '__meta__'
                    table.put_item(Item=item)

                    # Upsert into InspectionData and return it so frontend has consistent metadata
                    insp_data_row = None
                    try:
                        insp_data_table = dynamodb.Table('InspectionData')
                        insp_data_table.put_item(Item={
                            'inspection_id': inspection_id,
                            'createdAt': item.get('createdAt'),
                            'updatedAt': now,
                            'inspectorName': item.get('inspectorName'),
                            'venueId': item.get('venueId'),
                            'venueName': item.get('venueName'),
                            'roomId': item.get('roomId'),
                            'roomName': item.get('roomName'),
                            'status': item.get('status') or 'in-progress',
                        })
                        try:
                            resp_meta = insp_data_table.get_item(Key={'inspection_id': inspection_id})
                            insp_data_row = resp_meta.get('Item')
                        except Exception:
                            insp_data_row = None
                    except Exception as e:
                        print('Failed to upsert InspectionData meta on save_inspection(meta):', e)

                    return build_response(200, {'message': 'Saved (meta)', 'inspection_id': inspection_id, 'inspectionData': insp_data_row})
                except Exception as e:
                    print('Failed to save inspection meta:', e)
                    return build_response(500, {'message': 'Failed to save inspection meta', 'error': str(e)})

            # allow saving even a single item at a time (upsert semantics)

            written = 0
            # Use update_item per entry to preserve createdAt and avoid duplicates
            for it in items:
                item_id = it.get('itemId') or it.get('id')
                if not item_id:
                    # skip malformed
                    continue

                key = {pk_attr: inspection_id}
                if sk_attr:
                    key[sk_attr] = f"{room_id}#{item_id}"

                expr_vals = {
                    ':updatedAt': now,
                    ':inspectorName': ins.get('inspectorName'),
                    ':venueId': ins.get('venueId'),
                    ':venueName': ins.get('venueName'),
                    ':roomId': room_id,
                    ':roomName': ins.get('roomName'),
                    ':itemId': item_id,
                    ':itemName': it.get('itemName') or it.get('name') or '',
                    ':status': it.get('status'),
                    ':comments': it.get('notes') or it.get('comments') or '',
                    ':createdAt': ins.get('timestamp', now),
                }

                # Only update the attributes we care about to avoid creating unintended duplicates
                update_expr = ('SET updatedAt = :updatedAt, createdAt = if_not_exists(createdAt, :createdAt), '
                               '#s = :status, comments = :comments, inspectorName = :inspectorName, '
                               'venueId = :venueId, venueName = :venueName, roomId = :roomId, roomName = :roomName, '
                               'itemId = :itemId, itemName = :itemName')
                try:
                    resp = table.update_item(
                        Key=key,
                        UpdateExpression=update_expr,
                        ExpressionAttributeValues=expr_vals,
                        ExpressionAttributeNames={'#s': 'status'},
                        ReturnValues='ALL_NEW'
                    )
                    print('Upserted item:', resp.get('Attributes'))
                    written += 1
                except Exception as e:
                    print('Failed to upsert item in batch:', e)
                    # return an error rather than falling back to put_item which could mask issues
                    return build_response(500, {'message': 'Failed to save inspection items', 'error': str(e)})

            # After saving, optionally check completeness if venueId present
            try:
                if ins.get('venueId'):
                    completeness = None
                    try:
                        completeness = check_inspection_complete(inspection_id, ins.get('venueId'))
                    except Exception as e:
                        print('Failed to check completeness after save:', e)
                    # If fully complete (all PASS), mark the inspection meta as completed so it no longer appears as ongoing
                    try:
                        if completeness and completeness.get('complete') == True:
                            meta_key = {pk_attr: inspection_id}
                            if sk_attr:
                                meta_key[sk_attr] = '__meta__'
                            table.update_item(
                                Key=meta_key,
                                UpdateExpression='SET #s = :s, updatedAt = :u',
                                ExpressionAttributeNames={'#s': 'status'},
                                ExpressionAttributeValues={':s': 'completed', ':u': now}
                            )
                    except Exception as e:
                        print('Failed to mark meta as completed:', e)

                    return build_response(200, {'message': 'Saved', 'written': written, 'complete': completeness})
            except Exception:
                pass

            return build_response(200, {'message': 'Saved', 'written': written})
        # Save a single item (upsert) - allows saving anytime
        if action == 'save_item':
            ins = body.get('inspection') or body
            inspection_id = ins.get('inspection_id') or ins.get('id')
            room_id = ins.get('roomId') or ins.get('room_id')
            item_id = (ins.get('itemId') or ins.get('id') or (ins.get('item') or {}).get('itemId'))
            status = ins.get('status') or (ins.get('item') or {}).get('status')
            comments = ins.get('comments') or ins.get('notes') or (ins.get('item') or {}).get('notes') or ''

            if not inspection_id or not room_id or not item_id:
                return build_response(400, {'message': 'inspection_id, roomId, and itemId are required for save_item'})

            now = datetime.utcnow().isoformat()
            client = boto3.client('dynamodb')
            try:
                desc = client.describe_table(TableName=TABLE_NAME)
                key_schema = desc.get('Table', {}).get('KeySchema', [])
                pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')
                sk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'RANGE'), None)
            except Exception as e:
                print('Failed to describe table for save_item:', e)
                pk_attr = 'inspection_id'
                sk_attr = None

            record = {
                pk_attr: inspection_id,
                'createdAt': ins.get('timestamp', now),
                'inspectorName': ins.get('inspectorName') or (ins.get('item') or {}).get('inspectorName'),
                'venueId': ins.get('venueId'),
                'venueName': ins.get('venueName'),
                'roomId': room_id,
                'roomName': ins.get('roomName') or (ins.get('item') or {}).get('roomName'),
                'itemId': item_id,
                'itemName': ins.get('itemName') or (ins.get('item') or {}).get('itemName') or '',
                'status': status,
                'comments': comments,
            }
            if sk_attr:
                record[sk_attr] = f"{room_id}#{item_id}"

            try:
                # Prefer update_item to preserve createdAt
                key = {pk_attr: inspection_id}
                if sk_attr:
                    key[sk_attr] = f"{room_id}#{item_id}"
                now = datetime.utcnow().isoformat()
                # Update only the relevant attributes for an existing item (upsert semantics)
                update_expr = ('SET updatedAt = :now, createdAt = if_not_exists(createdAt, :createdAt), '
                               '#s = :status, comments = :comments, inspectorName = :inspectorName, '
                               'venueId = :venueId, venueName = :venueName, roomId = :roomId, roomName = :roomName, '
                               'itemId = :itemId, itemName = :itemName')
                expr_vals = {
                    ':now': now,
                    ':inspectorName': ins.get('inspectorName') or (ins.get('item') or {}).get('inspectorName'),
                    ':venueId': ins.get('venueId'),
                    ':venueName': ins.get('venueName'),
                    ':roomId': room_id,
                    ':roomName': ins.get('roomName') or (ins.get('item') or {}).get('roomName'),
                    ':itemId': item_id,
                    ':itemName': ins.get('itemName') or (ins.get('item') or {}).get('itemName') or '',
                    ':status': status,
                    ':comments': comments,
                    ':createdAt': ins.get('timestamp', now),
                }
                try:
                    resp = table.update_item(
                        Key=key,
                        UpdateExpression=update_expr,
                        ExpressionAttributeValues=expr_vals,
                        ExpressionAttributeNames={'#s': 'status'},
                        ReturnValues='ALL_NEW'
                    )
                    record = resp.get('Attributes')
                except Exception as e:
                    print('Failed to upsert single item:', e)
                    return build_response(500, {'message': 'Failed to save item', 'error': str(e)})

                # After single-item save, check completeness and mark meta completed if fully PASS
                try:
                    c = check_inspection_complete(inspection_id, ins.get('venueId') or ins.get('venue_id') or ins.get('venueId'))
                    if c and c.get('complete'):
                        try:
                            meta_key = {pk_attr: inspection_id}
                            if sk_attr:
                                meta_key[sk_attr] = '__meta__'
                            table.update_item(
                                Key=meta_key,
                                UpdateExpression='SET #s = :s, updatedAt = :u',
                                ExpressionAttributeNames={'#s': 'status'},
                                ExpressionAttributeValues={':s': 'completed', ':u': now}
                            )
                        except Exception as e:
                            print('Failed to mark meta as completed after save_item:', e)
                except Exception as e:
                    print('Failed to check completeness after save_item:', e)

                # Update/fetch InspectionData for quick frontend listing
                insp_data_row = None
                try:
                    insp_data_table = dynamodb.Table('InspectionData')
                    insp_data_table.update_item(
                        Key={'inspection_id': inspection_id},
                        UpdateExpression='SET updatedAt = :u, inspectorName = :n, venueId = :v, venueName = :vn, roomId = :r, roomName = :rn',
                        ExpressionAttributeValues={':u': now, ':n': ins.get('inspectorName') or (ins.get('item') or {}).get('inspectorName'), ':v': ins.get('venueId'), ':vn': ins.get('venueName'), ':r': room_id, ':rn': ins.get('roomName') or (ins.get('item') or {}).get('roomName')}
                    )
                    try:
                        resp_meta = insp_data_table.get_item(Key={'inspection_id': inspection_id})
                        insp_data_row = resp_meta.get('Item')
                    except Exception:
                        insp_data_row = None
                except Exception as e:
                    print('Failed to update/fetch InspectionData after save_item:', e)

                return build_response(200, {'message': 'Saved item', 'item': record, 'inspectionData': insp_data_row})
            except Exception as e:
                print('Failed to save single item:', e)
                return build_response(500, {'message': 'Failed to save item', 'error': str(e)})

        # Create an inspection meta record (so drafts can be resumed)
        if action == 'create_inspection':
            ins = body.get('inspection') or body
            inspection_id = ins.get('inspection_id') or ins.get('id')
            if not inspection_id:
                return build_response(400, {'message': 'inspection_id is required'})
            client = boto3.client('dynamodb')
            try:
                desc = client.describe_table(TableName=TABLE_NAME)
                key_schema = desc.get('Table', {}).get('KeySchema', [])
                pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')
                sk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'RANGE'), None)
            except Exception as e:
                print('Failed to describe table for create_inspection:', e)
                pk_attr = 'inspection_id'
                sk_attr = None
            try:
                now = datetime.utcnow().isoformat()
                item = {pk_attr: inspection_id, 'createdAt': ins.get('timestamp', now), 'updatedAt': now, 'inspectorName': ins.get('inspectorName'), 'venueId': ins.get('venueId'), 'venueName': ins.get('venueName'), 'roomId': ins.get('roomId'), 'roomName': ins.get('roomName'), 'status': ins.get('status') or 'in-progress'}
                if sk_attr:
                    item[sk_attr] = '__meta__'
                table.put_item(Item=item)

                # Also create/update InspectionData table for this inspection and return it
                insp_data_row = None
                try:
                    insp_data_table = dynamodb.Table('InspectionData')
                    insp_data_table.put_item(Item={
                        'inspection_id': inspection_id,
                        'createdAt': item.get('createdAt'),
                        'updatedAt': now,
                        'inspectorName': item.get('inspectorName'),
                        'venueId': item.get('venueId'),
                        'venueName': item.get('venueName'),
                        'roomId': item.get('roomId'),
                        'roomName': item.get('roomName'),
                        'status': item.get('status') or 'in-progress',
                    })
                    try:
                        resp_meta = insp_data_table.get_item(Key={'inspection_id': inspection_id})
                        insp_data_row = resp_meta.get('Item')
                    except Exception:
                        insp_data_row = None
                except Exception as e:
                    print('Failed to upsert InspectionData meta on create_inspection:', e)

                return build_response(200, {'message': 'Created', 'inspection_id': inspection_id, 'inspectionData': insp_data_row})
            except Exception as e:
                print('Failed to create inspection meta:', e)
                return build_response(500, {'message': 'Failed to create inspection', 'error': str(e)})

        # List inspections (meta rows) so UI can resume drafts
        if action == 'list_inspections':
            try:
                resp = table.scan()
                items = resp.get('Items', [])
                inspections_list = []
                # discover key schema
                client = boto3.client('dynamodb')
                try:
                    desc = client.describe_table(TableName=TABLE_NAME)
                    key_schema = desc.get('Table', {}).get('KeySchema', [])
                    pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')
                    sk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'RANGE'), None)
                except Exception:
                    pk_attr = 'inspection_id'
                    sk_attr = None

                for it in items:
                    is_meta = False
                    if sk_attr and it.get(sk_attr) == '__meta__':
                        is_meta = True
                    if not it.get('itemId'):
                        is_meta = True
                    if is_meta and it.get(pk_attr):
                        inspections_list.append({'inspection_id': it.get(pk_attr), 'venueId': it.get('venueId'), 'roomId': it.get('roomId'), 'inspectorName': it.get('inspectorName'), 'createdAt': it.get('createdAt'), 'updatedAt': it.get('updatedAt'), 'status': it.get('status', 'in-progress')})
                return build_response(200, {'inspections': inspections_list})
            except Exception as e:
                print('Failed to list inspections:', e)
                return build_response(500, {'message': 'Failed to list inspections', 'error': str(e)})

        # Read an inspection by inspection id (optionally filter by room)
        if action == 'get_inspection':
            inspection_id = body.get('inspection_id') or (body.get('inspection') or {}).get('inspection_id') or (body.get('inspection') or {}).get('id')
            if not inspection_id:
                return build_response(400, {'message': 'inspection_id is required for get_inspection'})

            room_filter = body.get('roomId') or body.get('room_id') or None

            client = boto3.client('dynamodb')
            try:
                desc = client.describe_table(TableName=TABLE_NAME)
                key_schema = desc.get('Table', {}).get('KeySchema', [])
                pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')
            except Exception as e: 
                print('Failed to describe table for get_inspection:', e)
                pk_attr = 'inspection_id'

            try:
                from boto3.dynamodb.conditions import Key
                resp = table.query(KeyConditionExpression=Key(pk_attr).eq(inspection_id))
                items = resp.get('Items', [])
                if room_filter:
                    items = [it for it in items if it.get('roomId') == room_filter]
                return build_response(200, {'items': items})
            except Exception as e:
                print('Failed to query inspection:', e)
                return build_response(500, {'message': 'Failed to query inspection', 'error': str(e)})

        # Summary: aggregate counts for an inspection (overall + per-room)
        if action == 'get_inspection_summary':
            inspection_id = body.get('inspection_id') or (body.get('inspection') or {}).get('inspection_id') or (body.get('inspection') or {}).get('id')
            if not inspection_id:
                return build_response(400, {'message': 'inspection_id is required for get_inspection_summary'})

            try:
                # discover pk/sk names
                desc = boto3.client('dynamodb').describe_table(TableName=TABLE_NAME)
                key_schema = desc.get('Table', {}).get('KeySchema', [])
                pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')
                sk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'RANGE'), None)
            except Exception as e:
                print('Failed to describe table for summary:', e)
                pk_attr = 'inspection_id'
                sk_attr = None

            try:
                from boto3.dynamodb.conditions import Key
                resp = table.query(KeyConditionExpression=Key(pk_attr).eq(inspection_id))
                items = resp.get('Items', [])

                totals = {'pass': 0, 'fail': 0, 'na': 0, 'pending': 0, 'total': 0}
                by_room = {}
                for it in items:
                    # ignore meta rows
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
                print('Failed to compute inspection summary:', e)
                return build_response(500, {'message': 'Failed to compute summary', 'error': str(e)})

        # Check whether an inspection is complete compared to venue definition
        if action == 'check_inspection_complete':
            inspection_id = body.get('inspection_id') or (body.get('inspection') or {}).get('inspection_id') or (body.get('inspection') or {}).get('id')
            venue_id = body.get('venueId') or body.get('venue_id') or (body.get('inspection') or {}).get('venueId')
            if not inspection_id or not venue_id:
                return build_response(400, {'message': 'inspection_id and venueId required'})
            try:
                result = check_inspection_complete(inspection_id, venue_id)
                return build_response(200, result)
            except Exception as e:
                print('Failed to check completion:', e)
                return build_response(500, {'message': 'Failed to check completion', 'error': str(e)})

        # Delete all items & meta rows for an inspection
        if action == 'delete_inspection':
            inspection_id = body.get('inspection_id') or (body.get('inspection') or {}).get('inspection_id') or (body.get('inspection') or {}).get('id')
            if not inspection_id:
                return build_response(400, {'message': 'inspection_id is required for delete_inspection'})
            try:
                client = boto3.client('dynamodb')
                desc = client.describe_table(TableName=TABLE_NAME)
                key_schema = desc.get('Table', {}).get('KeySchema', [])
                pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')
                sk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'RANGE'), None)
            except Exception as e:
                print('Failed to describe table for delete_inspection:', e)
                pk_attr = 'inspection_id'
                sk_attr = None

            try:
                from boto3.dynamodb.conditions import Key
                # First, query all items for this inspection id
                resp = table.query(KeyConditionExpression=Key(pk_attr).eq(inspection_id))
                total_found = 0
                deleted = 0

                def _delete_items_from_response(resp_block):
                    nonlocal deleted, total_found
                    items_block = resp_block.get('Items', [])
                    total_found += len(items_block)
                    if not items_block:
                        return
                    with table.batch_writer() as batch:
                        for it in items_block:
                            key = {pk_attr: inspection_id}
                            if sk_attr and it.get(sk_attr) is not None:
                                key[sk_attr] = it.get(sk_attr)
                            try:
                                batch.delete_item(Key=key)
                                deleted += 1
                            except Exception as e:
                                print('Failed to queue delete for item:', e, it)

                _delete_items_from_response(resp)

                # If there are more pages, continue deleting
                while resp.get('LastEvaluatedKey'):
                    resp = table.query(KeyConditionExpression=Key(pk_attr).eq(inspection_id), ExclusiveStartKey=resp.get('LastEvaluatedKey'))
                    _delete_items_from_response(resp)

                # After deletes, double-check remaining items
                remaining = 0
                try:
                    resp_check = table.query(KeyConditionExpression=Key(pk_attr).eq(inspection_id))
                    remaining = len(resp_check.get('Items', []))
                except Exception as e:
                    print('Failed to verify remaining items after delete:', e)

                # If nothing was found via Key query, attempt a targeted scan fallback (best-effort) to find items where attributes match
                scan_fallback_count = 0
                scan_items = []
                if total_found == 0 and deleted == 0:
                    try:
                        from boto3.dynamodb.conditions import Attr
                        # Look for common attribute names that might hold the inspection id
                        filt = Attr(pk_attr).eq(inspection_id) | Attr('inspection_id').eq(inspection_id) | Attr('id').eq(inspection_id)
                        resp_scan = table.scan(FilterExpression=filt)
                        scan_items = resp_scan.get('Items', [])
                        scan_fallback_count = len(scan_items)
                        while 'LastEvaluatedKey' in resp_scan:
                            resp_scan = table.scan(ExclusiveStartKey=resp_scan['LastEvaluatedKey'], FilterExpression=filt)
                            scan_items.extend(resp_scan.get('Items', []))
                            scan_fallback_count = len(scan_items)

                        if scan_fallback_count > 0:
                            with table.batch_writer() as batch:
                                for it in scan_items:
                                    key = {pk_attr: it.get(pk_attr) or it.get('inspection_id') or it.get('id')}
                                    if sk_attr and it.get(sk_attr) is not None:
                                        key[sk_attr] = it.get(sk_attr)
                                    try:
                                        batch.delete_item(Key=key)
                                        deleted += 1
                                    except Exception as e:
                                        print('Failed to queue delete for scan-fallback item:', e, it)
                    except Exception as e:
                        print('Scan fallback failed:', e)

                # Best-effort: ensure the inspection meta row is removed from the Inspection table as well
                meta_deleted = False
                try:
                    # If the table has a sort key, the meta row is stored at sk='__meta__'
                    if sk_attr:
                        meta_key = {pk_attr: inspection_id}
                        meta_key[sk_attr] = '__meta__'
                        try:
                            resp_meta = table.delete_item(Key=meta_key, ReturnValues='ALL_OLD')
                            meta_deleted = resp_meta.get('Attributes') is not None
                        except Exception as e:
                            print('Failed to delete meta row by sk_attr:', e)
                    else:
                        # If no sort key, fetch the item and if it looks like a meta row (no itemId), delete it
                        try:
                            resp_get = table.get_item(Key={pk_attr: inspection_id})
                            meta_item = resp_get.get('Item')
                            if meta_item and not meta_item.get('itemId'):
                                resp_meta = table.delete_item(Key={pk_attr: inspection_id}, ReturnValues='ALL_OLD')
                                meta_deleted = resp_meta.get('Attributes') is not None
                        except Exception as e:
                            print('Failed to detect/delete meta row for pk-only table:', e)
                except Exception as e:
                    print('Meta deletion attempt failed:', e)

                # Also attempt to delete any metadata in a separate InspectionData table (best-effort)
                insp_data_deleted = False
                try:
                    insp_data_table = dynamodb.Table('InspectionData')
                    try:
                        resp_del = insp_data_table.delete_item(Key={'inspection_id': inspection_id})
                        # If delete_item returns attributes, assume deletion occurred
                        insp_data_deleted = resp_del.get('Attributes') is not None
                        print('Deleted inspection metadata from InspectionData:', resp_del)
                    except Exception as e:
                        print('No InspectionData item removed or failed:', e)
                except Exception as e:
                    print('InspectionData table not present or deletion failed:', e)

                # Return structured info plus what action was received for debugging
                return build_response(200, {
                    'message': 'Deleted',
                    'deleted': deleted,
                    'found': total_found,
                    'remaining': remaining,
                    'scanFallbackFound': scan_fallback_count,
                    'metaDeleted': meta_deleted,
                    'inspectionDataDeleted': insp_data_deleted,
                    'receivedAction': action,
                    'receivedBody': body
                })
            except Exception as e:
                print('Failed to delete inspection rows:', e)
                return build_response(500, {'message': 'Failed to delete inspection', 'error': str(e)})

        # 'add_recent' feature removed — no-op (recent-list is deprecated)
        if action == 'add_recent':
            return build_response(400, {'message': 'add_recent removed'})

        # 'get_recent' feature removed — not supported
        if action == 'get_recent':
            return build_response(400, {'message': 'get_recent removed'})

        # Not implemented: get_inspection, list_inspections, etc.
        return build_response(400, {'message': 'Unsupported action'})

    except Exception as e:
        print('Error in inspections lambda:', e)
        return build_response(500, {'message': 'Internal server error', 'error': str(e)})
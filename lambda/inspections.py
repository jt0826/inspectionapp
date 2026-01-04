import json
import boto3
from datetime import datetime, timezone, timedelta

TABLE_NAME = 'Inspection'

def _now_local_iso():
    # Return ISO8601 timestamp in local timezone (GMT+8)
    return datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=8))).isoformat()
CORS_HEADERS = {
    # Allow all origins by default to avoid CORS blocking from mobile browsers; lock this down in production
    'Access-Control-Allow-Origin': '*',
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


# NOTE: Use local timezone (GMT+8) timestamps for createdAt/updatedAt to match user locale
# _now_local_iso() returns an ISO8601 string with +08:00 offset


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

        # small helpers to be tolerant of different payload shapes
        def _coalesce(*vals):
            for v in vals:
                if v is not None and v != '':
                    return v
            return None

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

            now = _now_local_iso()
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
                    # Prefer explicit createdBy/inspectorName, fall back to updatedBy if provided
                    created_by = _coalesce(ins.get('createdBy'), ins.get('inspectorName'), ins.get('updatedBy'))
                    venue_id_val = _coalesce(ins.get('venueId'), ins.get('venue_id'), (ins.get('venue') or {}).get('id'))
                    venue_name_val = _coalesce(ins.get('venueName'), ins.get('venue_name'), (ins.get('venue') or {}).get('name'))
                    # meta rows should NOT include room fields; inspections can span multiple rooms
                    room_id_val = None

                    # If venue id missing for meta save, try to resolve by name as above
                    if not venue_id_val and venue_name_val:
                        try:
                            vtable = dynamodb.Table('VenueRoomData')
                            vresp = vtable.scan()
                            found = [it for it in (vresp.get('Items') or []) if (it.get('name') or '').lower() == (venue_name_val or '').lower()]
                            if found:
                                venue_id_val = found[0].get('venueId') or found[0].get('id')
                                print('Resolved meta venue_id by name:', venue_id_val)
                        except Exception as e:
                            print('Failed to resolve meta venue id by name:', e)

                    print('Saving meta for inspection:', inspection_id, 'resolved venueId:', venue_id_val, 'venueName:', venue_name_val, 'roomId:', room_id_val)

                    # Load existing meta (if any) to avoid overwriting fields with null when client omits them
                    existing_meta = None
                    try:
                        get_key = {pk_attr: inspection_id}
                        if sk_attr:
                            get_key[sk_attr] = '__meta__'
                        resp_get = table.get_item(Key=get_key)
                        existing_meta = resp_get.get('Item') or {}
                    except Exception:
                        existing_meta = None

                    merged_created_at = existing_meta.get('createdAt') if existing_meta and existing_meta.get('createdAt') else now
                    merged_created_by = existing_meta.get('createdBy') if existing_meta and existing_meta.get('createdBy') else created_by
                    merged_venue_id = existing_meta.get('venueId') if existing_meta and (existing_meta.get('venueId') is not None) else venue_id_val
                    merged_venue_name = existing_meta.get('venueName') if existing_meta and (existing_meta.get('venueName') is not None) else venue_name_val

                    item = {pk_attr: inspection_id, 'createdAt': merged_created_at, 'updatedAt': now, 'createdBy': merged_created_by, 'updatedBy': ins.get('updatedBy') or merged_created_by, 'venueId': merged_venue_id, 'venueName': merged_venue_name, 'venue_name': merged_venue_name, 'status': ins.get('status') or (existing_meta.get('status') if existing_meta else 'in-progress')}
                    if sk_attr:
                        item[sk_attr] = '__meta__'

                    # Persist the merged meta row using put_item to ensure a full canonical meta exists
                    try:
                        table.put_item(Item=item)
                    except Exception as e:
                        print('Failed to put meta item after merge:', e)

                    # Upsert into InspectionData and return it so frontend has consistent metadata
                    insp_data_row = None
                    try:
                        insp_data_table = dynamodb.Table('InspectionData')
                        # Merge with existing InspectionData to avoid wiping venue fields
                        try:
                            resp_meta = insp_data_table.get_item(Key={'inspection_id': inspection_id})
                            existing_data = resp_meta.get('Item') or {}
                        except Exception:
                            existing_data = {}

                        insp_data_item = {
                            'inspection_id': inspection_id,
                            'createdAt': existing_data.get('createdAt') or item.get('createdAt'),
                            'updatedAt': now,
                            'createdBy': existing_data.get('createdBy') or item.get('createdBy'),
                            'updatedBy': item.get('updatedBy'),
                            'inspectorName': existing_data.get('inspectorName') or item.get('createdBy'),
                            'venueId': existing_data.get('venueId') if existing_data.get('venueId') is not None else item.get('venueId'),
                            'venueName': existing_data.get('venueName') if existing_data.get('venueName') is not None else item.get('venueName'),
                            'venue_name': existing_data.get('venue_name') if existing_data.get('venue_name') is not None else item.get('venue_name'),
                            'status': item.get('status') or existing_data.get('status') or 'in-progress',
                        }

                        insp_data_table.put_item(Item=insp_data_item)

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

                # Build update expression dynamically to avoid overwriting existing values with nulls
                expr_vals = {
                    ':updatedAt': now,
                    ':inspectorName': ins.get('inspectorName'),
                    ':roomId': room_id,
                    ':roomName': ins.get('roomName') or (ins.get('item') or {}).get('roomName'),
                    ':itemId': item_id,
                    ':itemName': it.get('itemName') or it.get('name') or '',
                    ':status': it.get('status'),
                    ':comments': it.get('notes') or it.get('comments') or '',
                    ':createdAt': now,
                }

                update_parts = [
                    'updatedAt = :updatedAt',
                    'createdAt = if_not_exists(createdAt, :createdAt)',
                    '#s = :status',
                    'comments = :comments',
                    'inspectorName = :inspectorName',
                    'roomId = :roomId',
                    'roomName = :roomName',
                    'itemId = :itemId',
                    'itemName = :itemName',
                ]

                # Only include venue fields when present to avoid nulling existing values
                if ins.get('venueId') is not None:
                    update_parts.insert(5, 'venueId = :venueId')
                    expr_vals[':venueId'] = ins.get('venueId')
                if ins.get('venueName') is not None:
                    update_parts.insert(6, 'venueName = :venueName')
                    expr_vals[':venueName'] = ins.get('venueName')

                update_expr = 'SET ' + ', '.join(update_parts)
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
            completeness = None
            try:
                if ins.get('venueId'):
                    try:
                        completeness = check_inspection_complete(inspection_id, ins.get('venueId'))
                    except Exception as e:
                        print('Failed to check completeness after save:', e)

                    # If fully complete (all PASS), mark the inspection meta as completed so it no longer appears as ongoing
                    if completeness and completeness.get('complete') == True:
                        try:
                            meta_key = {pk_attr: inspection_id}
                            if sk_attr:
                                meta_key[sk_attr] = '__meta__'
                            table.update_item(
                                Key=meta_key,
                                UpdateExpression='SET #s = :s, updatedAt = :u, completedAt = :c, updatedBy = :ub',
                                ExpressionAttributeNames={'#s': 'status'},
                                ExpressionAttributeValues={':s': 'completed', ':u': now, ':c': now, ':ub': ins.get('inspectorName') or ins.get('updatedBy') or ins.get('createdBy')}
                            )
                        except Exception as e:
                            print('Failed to update meta status after save:', e)

                        # Also update InspectionData status to reflect completion
                        try:
                            insp_data_table = dynamodb.Table('InspectionData')
                            insp_data_table.update_item(
                                Key={'inspection_id': inspection_id},
                                UpdateExpression='SET #s = :s, updatedAt = :u, completedAt = :c, updatedBy = :ub',
                                ExpressionAttributeNames={'#s': 'status'},
                                ExpressionAttributeValues={':s': 'completed', ':u': now, ':c': now, ':ub': ins.get('inspectorName') or ins.get('createdBy')}
                            )
                        except Exception as e:
                            print('Failed to update InspectionData status after save:', e)
            except Exception as e:
                print('Failed to mark meta as completed:', e)

            # Ensure InspectionData exists/updated for this inspection and return it
            insp_data_row = None
            try:
                insp_data_table = dynamodb.Table('InspectionData')
                resp_meta = insp_data_table.get_item(Key={'inspection_id': inspection_id})
                insp_data_row = resp_meta.get('Item')
            except Exception:
                insp_data_row = None

            return build_response(200, {'message': 'Saved', 'written': written, 'complete': completeness, 'inspectionData': insp_data_row})

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

            now = _now_local_iso()
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
                'createdAt': now,
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
                # Prefer update_item to preserve createdAt and avoid overwriting venue fields with null
                key = {pk_attr: inspection_id}
                if sk_attr:
                    key[sk_attr] = f"{room_id}#{item_id}"
                now = _now_local_iso()

                expr_vals = {
                    ':now': now,
                    ':inspectorName': ins.get('inspectorName') or (ins.get('item') or {}).get('inspectorName'),
                    ':roomId': room_id,
                    ':roomName': ins.get('roomName') or (ins.get('item') or {}).get('roomName'),
                    ':itemId': item_id,
                    ':itemName': ins.get('itemName') or (ins.get('item') or {}).get('itemName') or '',
                    ':status': status,
                    ':comments': comments,
                    ':createdAt': now,
                }

                update_parts = [
                    'updatedAt = :now',
                    'createdAt = if_not_exists(createdAt, :createdAt)',
                    '#s = :status',
                    'comments = :comments',
                    'inspectorName = :inspectorName',
                    'roomId = :roomId',
                    'roomName = :roomName',
                    'itemId = :itemId',
                    'itemName = :itemName',
                ]

                # Only include venue fields when present to avoid nulling existing values
                if ins.get('venueId') is not None:
                    update_parts.insert(5, 'venueId = :venueId')
                    expr_vals[':venueId'] = ins.get('venueId')
                if ins.get('venueName') is not None:
                    update_parts.insert(6, 'venueName = :venueName')
                    expr_vals[':venueName'] = ins.get('venueName')

                update_expr = 'SET ' + ', '.join(update_parts)
                try:
                    resp = table.update_item(
                        Key=key,
                        UpdateExpression=update_expr,
                        ExpressionAttributeValues=expr_vals,
                        ExpressionAttributeNames={'#s': 'status'},
                        ReturnValues='ALL_NEW'
                    )
                    record = resp.get('Attributes')

                    # Keep InspectionData metadata current for quick listing (set updatedBy and venue_name)
                    try:
                        insp_data_table = dynamodb.Table('InspectionData')
                        # Update InspectionData without overwriting venue info unless provided in payload
                        id_vals = {':u': now, ':ub': ins.get('inspectorName') or ins.get('updatedBy') or (ins.get('item') or {}).get('inspectorName'), ':n': ins.get('inspectorName') or (ins.get('item') or {}).get('inspectorName')}
                        update_parts = ['updatedAt = :u', 'updatedBy = :ub', 'inspectorName = :n']
                        if ins.get('venueId') is not None:
                            update_parts.append('venueId = :v')
                            id_vals[':v'] = ins.get('venueId')
                        if ins.get('venueName') is not None:
                            update_parts.append('venueName = :vn')
                            id_vals[':vn'] = ins.get('venueName')
                            id_vals[':vn2'] = ins.get('venueName') or ins.get('venue_name')
                        print('InspectionData update (save_item):', update_parts, 'vals:', {k: (v if k in [':u',':ub',':n'] else '...') for k,v in id_vals.items()})
                        insp_data_table.update_item(
                            Key={'inspection_id': inspection_id},
                            UpdateExpression='SET ' + ', '.join(update_parts),
                            ExpressionAttributeValues=id_vals
                        )
                    except Exception as e:
                        print('Failed to update InspectionData on save_item:', e)
                except Exception as e:
                    print('Failed to upsert single item:', e)
                    return build_response(500, {'message': 'Failed to save item', 'error': str(e)})

                # After single-item save, check completeness and mark meta completed if fully PASS
                meta_completed = False
                try:
                    c = check_inspection_complete(inspection_id, ins.get('venueId') or ins.get('venue_id') or ins.get('venueId'))
                    if c and c.get('complete'):
                        meta_completed = True
                        try:
                            meta_key = {pk_attr: inspection_id}
                            if sk_attr:
                                meta_key[sk_attr] = '__meta__'
                            table.update_item(
                                Key=meta_key,
                                UpdateExpression='SET #s = :s, updatedAt = :u, completedAt = :c, updatedBy = :ub',
                                ExpressionAttributeNames={'#s': 'status'},
                                ExpressionAttributeValues={':s': 'completed', ':u': now, ':c': now, ':ub': ins.get('inspectorName') or ins.get('updatedBy') or ins.get('createdBy')}
                            )
                        except Exception as e:
                            print('Failed to mark meta as completed after save_item:', e)
                except Exception as e:
                    print('Failed to check completeness after save_item:', e)

                # Update/fetch InspectionData for quick frontend listing
                insp_data_row = None
                try:
                    insp_data_table = dynamodb.Table('InspectionData')
                    # Build InspectionData update dynamically to avoid nulling venue fields
                    expr_vals = {':u': now, ':ub': ins.get('inspectorName') or ins.get('updatedBy') or (ins.get('item') or {}).get('inspectorName'), ':n': ins.get('inspectorName') or (ins.get('item') or {}).get('inspectorName')}
                    update_parts = ['updatedAt = :u', 'updatedBy = :ub', 'inspectorName = :n']
                    if ins.get('venueId') is not None:
                        update_parts.append('venueId = :v')
                        expr_vals[':v'] = ins.get('venueId')
                    if ins.get('venueName') is not None:
                        update_parts.append('venueName = :vn')
                        expr_vals[':vn'] = ins.get('venueName')
                    if meta_completed:
                        update_parts.append('completedAt = :c')
                        expr_vals[':c'] = now
                    print('InspectionData update (post-save):', update_parts, 'vals keys:', list(expr_vals.keys()))
                    insp_data_table.update_item(
                        Key={'inspection_id': inspection_id},
                        UpdateExpression='SET ' + ', '.join(update_parts),
                        ExpressionAttributeValues=expr_vals
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
                now = _now_local_iso()
                # Prefer explicit createdBy/inspectorName, fall back to updatedBy if provided
                created_by = _coalesce(ins.get('createdBy'), ins.get('inspectorName'), ins.get('updatedBy'))
                venue_id_val = _coalesce(ins.get('venueId'), ins.get('venue_id'), (ins.get('venue') or {}).get('id'))
                venue_name_val = _coalesce(ins.get('venueName'), ins.get('venue_name'), (ins.get('venue') or {}).get('name'))
                # meta rows should NOT include room fields; inspections can span multiple rooms
                room_id_val = None
                # If venue id isn't provided but we have a venue name, try to resolve the id server-side
                if not venue_id_val and venue_name_val:
                    try:
                        vtable = dynamodb.Table('VenueRoomData')
                        # Scan the table and do a simple name match in Python to avoid relying on Expr imports
                        vresp = vtable.scan()
                        found_items = [it for it in (vresp.get('Items') or []) if (it.get('name') or '').lower() == (venue_name_val or '').lower()]
                        if found_items:
                            venue_id_val = found_items[0].get('venueId') or found_items[0].get('id')
                            print('Resolved venue_id by name:', venue_id_val)
                    except Exception as e:
                        print('Failed to resolve venue id by name:', e)
                print('create_inspection resolved fields:', {'venueId': venue_id_val, 'venueName': venue_name_val, 'roomId': room_id_val})

                item = {pk_attr: inspection_id, 'createdAt': now, 'updatedAt': now, 'createdBy': created_by, 'updatedBy': ins.get('updatedBy') or created_by, 'venueId': venue_id_val, 'venueName': venue_name_val, 'venue_name': venue_name_val, 'status': ins.get('status') or 'in-progress', 'completedAt': ins.get('completedAt') or None} 
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
                        'createdBy': item.get('createdBy'),
                        'updatedBy': item.get('updatedBy'),
                        'inspectorName': item.get('inspectorName') or item.get('createdBy'),
                        'venueId': item.get('venueId'),
                        'venueName': item.get('venueName'),
                        'venue_name': item.get('venue_name'),
                        'status': item.get('status') or 'in-progress',
                        'completedAt': item.get('completedAt')
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
                        # Provide both createdBy (and created_by) and inspectorName.
                        # inspectorName will prefer an explicit inspectorName and fall back to createdBy so the frontend can reliably show the author.
                        inspections_list.append({
                            'inspection_id': it.get(pk_attr),
                            'venueId': it.get('venueId'),
                            'roomId': it.get('roomId'),
                            'createdBy': it.get('createdBy') or it.get('created_by') or it.get('inspectorName'),
                            'inspectorName': it.get('inspectorName') or it.get('createdBy') or it.get('created_by') or '',
                            'createdAt': it.get('createdAt'),
                            'updatedAt': it.get('updatedAt'),
                            'completedAt': it.get('completedAt') or it.get('completed_at') or None,
                            'venue_name': it.get('venue_name') or it.get('venueName') or None,
                            'status': it.get('status', 'in-progress')
                        })
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
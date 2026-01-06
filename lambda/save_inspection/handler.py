from .utils import build_response, _now_local_iso
from .metadata import read_inspection_metadata, update_inspection_metadata
from .completeness import check_inspection_complete


def handle_save_inspection(event_body: dict, debug):
    ins = event_body.get('inspection') or event_body
    inspection_id = ins.get('inspection_id') or ins.get('id')
    room_id = ins.get('roomId') or ins.get('room_id')
    items = ins.get('items') or []

    if not inspection_id:
        return build_response(400, {'message': 'inspection_id is required'})

    now = _now_local_iso()

    # If no items were provided, do a metadata upsert
    if len(items) == 0:
        try:
            # Merge existing meta
            k, existing_data = read_inspection_metadata(inspection_id)
            existing_data = existing_data or {}
            created_by = ins.get('createdBy') or ins.get('inspectorName') or ins.get('updatedBy')
            venue_id_val = ins.get('venueId') or ins.get('venue_id') or (ins.get('venue') or {}).get('id')
            venue_name_val = ins.get('venueName') or ins.get('venue_name') or (ins.get('venue') or {}).get('name')
            insp_data_item = {
                'inspection_id': inspection_id,
                'inspectionId': inspection_id,
                'createdAt': existing_data.get('createdAt') or now,
                'updatedAt': now,
                'createdBy': existing_data.get('createdBy') or created_by,
                'updatedBy': ins.get('updatedBy') or existing_data.get('createdBy') or created_by,
                'inspectorName': existing_data.get('inspectorName') or created_by,
                'venueId': existing_data.get('venueId') if existing_data.get('venueId') is not None else venue_id_val,
                'venueName': existing_data.get('venueName') if existing_data.get('venueName') is not None else venue_name_val,
                'venue_name': existing_data.get('venue_name') if existing_data.get('venue_name') is not None else venue_name_val,
                'status': ins.get('status') or (existing_data.get('status') if existing_data else 'in-progress'),
            }
            from boto3 import resource
            ddb = resource('dynamodb')
            t = ddb.Table('InspectionMetadata')
            t.put_item(Item=insp_data_item)
            k, insp_data_row = read_inspection_metadata(inspection_id)
        except Exception as e:
            debug(f'Failed to upsert InspectionData meta on save_inspection(meta): {e}')
            return build_response(500, {'message': 'Failed to save inspection meta', 'error': str(e), 'debug': [str(e)]})

        return build_response(200, {'message': 'Saved (meta)', 'inspection_id': inspection_id, 'inspectionData': insp_data_row})

    # otherwise persist items (batch upsert semantics)
    from boto3 import client, resource
    ddb = resource('dynamodb')
    table = ddb.Table('InspectionItems')

    # Discover table key schema so we can write correct Key attributes
    try:
        ddb_client = client('dynamodb')
        desc = ddb_client.describe_table(TableName='InspectionItems')
        key_schema = desc.get('Table', {}).get('KeySchema', [])
        pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')
        sk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'RANGE'), None)
    except Exception as e:
        debug(f'Failed to discover InspectionItems key schema: {e}')
        pk_attr = 'inspection_id'
        sk_attr = None

    debug(f'save_inspection: using table key pk_attr={pk_attr} sk_attr={sk_attr}')

    written = 0
    # Use one action timestamp for all items in this save_inspection call
    action_ts = now
    for it in items:
        item_id = it.get('itemId') or it.get('id')
        if not item_id:
            continue
        # build update expression
        expr_vals = {
            ':updatedAt': action_ts,
            ':inspectorName': ins.get('inspectorName'),
            ':roomId': room_id,
            ':roomName': ins.get('roomName') or (ins.get('item') or {}).get('roomName'),
            ':itemId': item_id,
            ':itemName': it.get('itemName') or it.get('name') or '',
            ':status': it.get('status'),
            ':comments': it.get('notes') or it.get('comments') or '',
            ':createdAt': action_ts,
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
        if ins.get('venueId') is not None:
            update_parts.insert(5, 'venueId = :venueId')
            expr_vals[':venueId'] = ins.get('venueId')
        if ins.get('venueName') is not None:
            update_parts.insert(6, 'venueName = :venueName')
            expr_vals[':venueName'] = ins.get('venueName')

        update_expr = 'SET ' + ', '.join(update_parts)
        try:
            # Attempt multiple key shapes (composite room#item, room-only, item-only, pk-only)
            last_exc = None
            wrote = False
            key_shapes = []
            if sk_attr:
                # prefer the historical composite form first
                key_shapes.append({sk_attr: f"{room_id}#{item_id}"})
                key_shapes.append({sk_attr: room_id})
                key_shapes.append({sk_attr: item_id})
            # finally try PK-only
            key_shapes.append({})

            for sk_part in key_shapes:
                key = {pk_attr: inspection_id}
                key.update(sk_part)
                try:
                    debug(f'save_inspection: attempting update with Key={key}')
                    resp = table.update_item(
                        Key=key,
                        UpdateExpression=update_expr,
                        ExpressionAttributeValues=expr_vals,
                        ExpressionAttributeNames={'#s': 'status'},
                        ReturnValues='ALL_NEW'
                    )
                    wrote = True
                    written += 1
                    break
                except Exception as e:
                    last_exc = e
                    debug(f'save_inspection: update attempt failed for Key={key}: {e}')

            if not wrote:
                # no successful update attempts
                raise last_exc
        except Exception as e:
            debug(f'Failed to upsert item in batch: {e}')
            return build_response(500, {'message': 'Failed to save inspection items', 'error': str(e), 'debug': [str(e)]})

    # After saving items, update inspection-level metadata (updatedAt/updatedBy) before checking completeness
    try:
        meta_update_vals = {':u': action_ts, ':ub': ins.get('inspectorName') or ins.get('createdBy')}
        if ins.get('venueId') is not None:
            meta_update_vals[':v'] = ins.get('venueId')
        if ins.get('venueName') is not None:
            meta_update_vals[':vn'] = ins.get('venueName')
        debug(f"save_inspection: updating inspection metadata(updatedAt) for inspection={inspection_id} vals_keys={list(meta_update_vals.keys())}")
        update_inspection_metadata(inspection_id, 'SET updatedAt = :u, updatedBy = :ub' + (', venueId = :v' if ':v' in meta_update_vals else '') + (', venueName = :vn' if ':vn' in meta_update_vals else ''), meta_update_vals, debug=debug)
    except Exception as e:
        debug(f'Failed to update InspectionData updatedAt on save: {e}')

    # After updating metadata, check completeness only as part of full Save
    completeness = None
    try:
        if ins.get('venueId'):
            provided_non_pass = any(((it.get('status') or '').lower() != 'pass') for it in items)
            debug(f"save_inspection: inspection={inspection_id}, provided_items={len(items)}, provided_non_pass={provided_non_pass}")
            if provided_non_pass:
                completeness = {'complete': False, 'reason': 'non-pass item in provided payload'}
                debug(f"save_inspection: skipping server completeness check for inspection={inspection_id} due to non-pass in payload")
            else:
                completeness = check_inspection_complete(inspection_id, ins.get('venueId'), debug=debug)
    except Exception as e:
        debug(f'Failed to check completeness after save: {e}')

    debug(f"save_inspection: completeness result for inspection={inspection_id}: {completeness}")
    if completeness and completeness.get('complete') == True:
        try:
            updated = update_inspection_metadata(inspection_id, 'SET #s = :s, updatedAt = :u, completedAt = :c, updatedBy = :ub', {':s': 'completed', ':u': now, ':c': now, ':ub': ins.get('inspectorName') or ins.get('createdBy')}, debug=debug)
            debug(f"save_inspection: update_inspection_metadata returned: {updated} for inspection={inspection_id}")
            k, meta_after_update = read_inspection_metadata(inspection_id)
            debug(f"save_inspection: metadata after completion update for inspection={inspection_id}: key={k}, meta={meta_after_update}")
        except Exception as e:
            debug(f'Failed to update InspectionData status after save: {e}')

    # Return final inspectionData
    k, meta_after = read_inspection_metadata(inspection_id)
    return build_response(200, {'message': 'Saved', 'written': written, 'complete': completeness, 'inspectionData': meta_after})
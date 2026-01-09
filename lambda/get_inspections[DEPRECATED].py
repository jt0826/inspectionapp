""" 
⚠️ DEPRECATED: This Lambda handler is being phased out.

Use save_inspection/list_inspections.py instead, which:
- Uses partition-limit-enrich pattern (98% fewer DB queries)
- Returns only completed/ongoing arrays (no duplication)
- Eliminates payload bloat (no 'raw' field)
- Leverages cached totals/byRoom from InspectionMetadata

This file remains for backward compatibility and will be removed in a future release.
Routing should point to API.inspectionsQuery → save_inspection Lambda.
"""

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

# Limit for completed items to return on Home page to reduce payload and improve load times
MAX_HOME_COMPLETED = 6

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
# Canonical table names (metadata vs items)
TABLE_INSPECTION_METADATA = 'InspectionMetadata'
TABLE_INSPECTION_ITEMS = 'InspectionItems'
TABLE_VENUE_ROOMS = 'VenueRooms'

# Use metadata table for listing
table = dynamodb.Table(TABLE_INSPECTION_METADATA)


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
    # this lambda function has been deprecated in favor of save_inspection/list_inspections.py
        
                                    
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

                        # LIST_INSPECTIONS: return inspection metadata from InspectionMetadata
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
                                # Prefer metadata updatedBy or createdBy as the canonical author; do not propagate deprecated inspectorName
                                author = it.get('updatedBy') or it.get('createdBy') or it.get('created_by') or None

                                comp = _try_parse_date(it.get('completedAt') or it.get('completed_at') or None)
                                obj = {
                                    'inspection_id': it.get('inspection_id') or it.get('inspectionId') or it.get('id'),
                                    'createdAt': created,
                                    'venueId': it.get('venueId') or it.get('venue_id') or None,
                                    'venueName': it.get('venueName') or it.get('venue_name') or None,
                                    'roomId': it.get('roomId') or it.get('room_id') or None,
                                    'roomName': it.get('roomName') or it.get('room_name') or None,
                                    'status': (it.get('status') or '').lower() if it.get('status') else None,
                                }
                                # only include completedAt when the value is present (avoid null in payloads)
                                if comp is not None:
                                    obj['completedAt'] = comp

                                # include creator display name (canonical) - no deprecated inspectorName
                                obj['createdBy'] = it.get('createdBy') or it.get('created_by') or None

                                # set metadata-updated fields from the metadata row if present
                                if updated:
                                    obj['updatedAt'] = updated
                                obj['updatedBy'] = it.get('updatedBy') or None

                                inspections.append(obj)

                            # Enrich each inspection with computed totals (pass/fail/na/pending/total) and updatedAt info
                            try:
                                insp_table = dynamodb.Table(TABLE_INSPECTION_ITEMS)
                                client = boto3.client('dynamodb')
                                desc = client.describe_table(TableName=TABLE_INSPECTION_ITEMS)
                                key_schema = desc.get('Table', {}).get('KeySchema', [])
                                pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')

                                from boto3.dynamodb.conditions import Key
                                for obj in inspections:
                                    try:
                                        iid = obj.get('inspection_id')
                                        if not iid:
                                            obj['totals'] = {'pass': 0, 'fail': 0, 'na': 0, 'pending': 0, 'total': 0}
                                            obj['byRoom'] = {}
                                            continue

                                        resp2 = insp_table.query(KeyConditionExpression=Key(pk_attr).eq(iid), ConsistentRead=True)
                                        items2 = resp2.get('Items', [])

                                        totals = {'pass': 0, 'fail': 0, 'na': 0, 'pending': 0, 'total': 0}
                                        by_room = {}
                                        latest_ts = None
                                        latest_by = None
                                        for it2 in items2:
                                            # ignore meta rows
                                            if 'sk' in it2 and it2.get('sk') == '__meta__':
                                                continue
                                            item_id = it2.get('itemId') or it2.get('item') or it2.get('ItemId')
                                            if not item_id:
                                                # Attempt to parse itemId from sort-key-like attributes
                                                for k, v in (it2.items()):
                                                    if isinstance(v, str) and '#' in v:
                                                        parts = v.split('#')
                                                        if len(parts) >= 2:
                                                            item_id = parts[-1]
                                                            break
                                            if not item_id:
                                                continue
                                            status = (it2.get('status') or 'pending').lower()
                                            rid = it2.get('roomId') or it2.get('room_id') or it2.get('room') or ''

                                            # If roomId missing, try to infer it from any attribute that looks like 'roomId#itemId'
                                            if not rid:
                                                for k, v in (it2.items()):
                                                    if isinstance(v, str) and '#' in v:
                                                        parts = v.split('#')
                                                        if len(parts) >= 2:
                                                            rid = parts[0]
                                                            # Log a helpful debug to identify items missing explicit roomId
                                                            print('Inferred roomId from attribute', k, 'for inspection', iid, 'item', item_id, '->', rid)
                                                            break

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

                                            ts_raw = it2.get('updatedAt') or it2.get('updated_at') or it2.get('createdAt') or it2.get('created_at')
                                            if ts_raw:
                                                dt = _parse_iso_to_aware(ts_raw)
                                                if dt:
                                                    ts = dt.isoformat()
                                                    if not latest_ts:
                                                        latest_ts = ts
                                                        # Prefer explicit updatedBy, then createdBy; inspectorName is deprecated and not used
                                                        latest_by = it2.get('updatedBy') or it2.get('createdBy') or it2.get('updated_by') or it2.get('created_by') or None
                                                    else:
                                                        ldt = _parse_iso_to_aware(latest_ts)
                                                        if ldt is None or dt > ldt:
                                                            latest_ts = ts
                                                            latest_by = it2.get('updatedBy') or it2.get('createdBy') or it2.get('updated_by') or it2.get('created_by') or None

                                        # Enrich totals with expected venue item counts and ensure per-room defaults (match RoomList.tsx behavior)
                                        try:
                                            venue_id = obj.get('venueId') or obj.get('venue_id') or None
                                            if venue_id:
                                                vtable = dynamodb.Table(TABLE_VENUE_ROOMS)
                                                vresp = vtable.get_item(Key={'venueId': venue_id})
                                                venue = vresp.get('Item') or {}
                                                rooms = venue.get('rooms') or []
                                                expected_total = sum(((r.get('items') or []) and len(r.get('items') or [])) or 0 for r in rooms)
                                                known = (totals.get('pass', 0) or 0) + (totals.get('fail', 0) or 0) + (totals.get('na', 0) or 0)
                                                # If there are no known items saved, pending should equal expected_total (all items pending)
                                                if known == 0:
                                                    totals['pending'] = expected_total
                                                    totals['total'] = expected_total
                                                else:
                                                    totals['pending'] = max(0, expected_total - known)
                                                    totals['total'] = known + totals['pending']

                                                # Ensure per-room breakdown entries exist so clients can render per-room badges
                                                try:
                                                    for r in rooms:
                                                        rid = r.get('roomId') or r.get('id')
                                                        if not rid:
                                                            continue
                                                        expected_n = len(r.get('items') or [])
                                                        existing = by_room.get(rid)
                                                        if not existing:
                                                            # no known items for this room -> all pending
                                                            by_room[rid] = {'pass': 0, 'fail': 0, 'na': 0, 'pending': expected_n, 'total': expected_n}
                                                        else:
                                                            # fill pending for partially-known rooms
                                                            known_room = (existing.get('pass',0) or 0) + (existing.get('fail',0) or 0) + (existing.get('na',0) or 0)
                                                            if expected_n > known_room:
                                                                existing['pending'] = expected_n - known_room
                                                                existing['total'] = known_room + existing['pending']
                                                except Exception as e2:
                                                    print('Failed to fill per-room defaults for inspection', obj.get('inspection_id'), e2)
                                        except Exception as e:
                                            print('Failed to enrich totals with venue data for inspection', obj.get('inspection_id'), e)

                                        # Debug: log computed by_room keys and sample items to diagnose missing per-room breakdown
                                        try:
                                            if not by_room:
                                                # If no by_room, print a small sample of raw item records so we can spot missing room ids
                                                sample = items2[:5] if isinstance(items2, list) else items2
                                                print('No byRoom computed for inspection', iid, 'totals=', totals, 'items_sample=', sample)
                                            else:
                                                print('Computed byRoom for inspection', iid, 'byRoom_keys=', list(by_room.keys()), 'byRoom=', by_room)
                                        except Exception as e:
                                            print('Error logging by_room debug info for inspection', iid, e)

                                        obj['totals'] = totals
                                        obj['byRoom'] = by_room
                                        # Only override metadata-updatedAt/updatedBy with item-derived values if we actually found a latest_ts
                                        try:
                                            if latest_ts:
                                                meta_dt = _parse_iso_to_aware(obj.get('updatedAt'))
                                                latest_dt = _parse_iso_to_aware(latest_ts)
                                                if meta_dt is None or (latest_dt and latest_dt > meta_dt):
                                                    obj['updatedAt'] = latest_ts
                                                    obj['updatedBy'] = latest_by or obj.get('updatedBy')
                                        except Exception:
                                            # Fallback to item-derived values on any parsing error
                                            if latest_ts:
                                                obj['updatedAt'] = latest_ts
                                                obj['updatedBy'] = latest_by or obj.get('updatedBy')
                                    except Exception as e:
                                        print('Failed to compute summary for inspection', obj.get('inspection_id'), e)
                            except Exception as e:
                                print('Failed to enrich inspections with summaries:', e)

                            # Partition inspections by status into ongoing and completed (status field determines grouping)
                            completed = [obj for obj in inspections if (obj.get('status') or '').lower() == 'completed']
                            ongoing = [obj for obj in inspections if (obj.get('status') or '').lower() != 'completed']

                            # Debug: log presence of byRoom across partitions
                            try:
                                comp_missing = [i for i in completed if i and not (i.get('byRoom') and len(i.get('byRoom'))>0)]
                                ong_missing = [i for i in ongoing if i and not (i.get('byRoom') and len(i.get('byRoom'))>0)]
                                print('Partitioned counts: inspections=', len(inspections), 'completed=', len(completed), 'ongoing=', len(ongoing), 'completed_missing_byroom=', len(comp_missing), 'ongoing_missing_byroom=', len(ong_missing))
                            except Exception as e:
                                print('Failed to log partitioned byRoom debug info', e)

                            # Sort completed by most-recent completion/updated/created timestamp and limit result to MAX_HOME_COMPLETED to reduce payload
                            def _get_sort_ts(o):
                                for key in ('completedAt', 'completed_at', 'updatedAt', 'updated_at', 'createdAt', 'created_at'):
                                    v = o.get(key)
                                    if v:
                                        dt = _parse_iso_to_aware(v)
                                        if dt:
                                            return dt.timestamp()
                                return 0

                            # Support client-requested completed limit: use body.completed_limit or body.completedLimit
                            completed_limit_raw = None
                            try:
                                if isinstance(body, dict):
                                    completed_limit_raw = body.get('completed_limit') if 'completed_limit' in body else body.get('completedLimit')
                            except Exception:
                                completed_limit_raw = None

                            try:
                                if completed_limit_raw is None:
                                    limit = MAX_HOME_COMPLETED
                                else:
                                    try:
                                        limit = int(completed_limit_raw)
                                    except Exception:
                                        limit = MAX_HOME_COMPLETED

                                completed_sorted = sorted(completed, key=_get_sort_ts, reverse=True)
                                if limit > 0:
                                    completed_limited = completed_sorted[:limit]
                                else:
                                    # non-positive limit (0 or negative) means no limit -> return all
                                    completed_limited = completed_sorted
                            except Exception:
                                # fallback: return full list (best-effort)
                                completed_limited = completed

                            # Only return partitioned arrays (completed and ongoing). The top-level 'inspections' array
                            # previously duplicated this data and caused clients to parse entries twice.
                            return {
                                'statusCode': 200,
                                'headers': CORS_HEADERS,
                                'body': json.dumps({'completed': completed_limited, 'ongoing': ongoing})
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
                                insp_table = dynamodb.Table(TABLE_INSPECTION_ITEMS)
                                client = boto3.client('dynamodb')
                                desc = client.describe_table(TableName=TABLE_INSPECTION_ITEMS)
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
                                insp_table = dynamodb.Table(TABLE_INSPECTION_ITEMS)
                                client = boto3.client('dynamodb')
                                desc = client.describe_table(TableName=TABLE_INSPECTION_ITEMS)
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

                                # If by_room is empty, try to enrich per-room defaults from the venue linked to this inspection (fallback)
                                try:
                                    if not by_room:
                                        meta_table = dynamodb.Table(TABLE_INSPECTION_METADATA)
                                        try:
                                            meta_resp = meta_table.get_item(Key={'inspection_id': inspection_id})
                                            meta = meta_resp.get('Item') or {}
                                            meta_venue_id = meta.get('venueId') or meta.get('venue_id') or None
                                        except Exception:
                                            meta_venue_id = None

                                        if meta_venue_id:
                                            vtable = dynamodb.Table(TABLE_VENUE_ROOMS)
                                            try:
                                                vresp = vtable.get_item(Key={'venueId': meta_venue_id})
                                                venue = vresp.get('Item') or {}
                                                rooms = venue.get('rooms') or []
                                                for r in rooms:
                                                    rid = r.get('roomId') or r.get('id')
                                                    if not rid:
                                                        continue
                                                    n = len(r.get('items') or [])
                                                    # make default per-room: all pending
                                                    by_room[rid] = {'pass': 0, 'fail': 0, 'na': 0, 'pending': n, 'total': n}
                                            except Exception as e:
                                                print('Failed to enrich byRoom from venue for inspection', inspection_id, e)
                                except Exception as e:
                                    print('Failed to attempt byRoom enrichment for inspection', inspection_id, e)

                                return {
                                    'statusCode': 200,
                                    'headers': CORS_HEADERS,
                                    'body': json.dumps({'inspection_id': inspection_id, 'totals': totals, 'byRoom': by_room, 'updatedAt': latest_ts, 'updatedBy': latest_by})
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
                                vtable = dynamodb.Table(TABLE_VENUE_ROOMS)
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

                                insp_table = dynamodb.Table(TABLE_INSPECTION_ITEMS)
                                client = boto3.client('dynamodb')
                                desc = client.describe_table(TableName=TABLE_INSPECTION_ITEMS)
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
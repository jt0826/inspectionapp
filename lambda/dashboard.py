import json
import os
try:
    import boto3
    from boto3.dynamodb.conditions import Key
except Exception:
    boto3 = None
    Key = None
from datetime import datetime, timedelta, timezone

# Config (use same table names as other lambdas)
INSPECTION_TABLE = os.environ.get('INSPECTION_TABLE', 'InspectionData')
IMAGE_TABLE = os.environ.get('IMAGE_TABLE', 'InspectionImages')
INSPECTIONS_DETAIL_TABLE = 'Inspection'  # Detailed inspection items
VENUE_ROOM_TABLE = 'VenueRoomData'  # Venue and room definitions
REGION = os.environ.get('AWS_REGION', 'ap-southeast-1')

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
    'Content-Type': 'application/json'
}


# Initialize boto3 resources when available (tests may import without boto3 installed)
dynamodb = None
ins_table = None
img_table = None
ins_detail_table = None
venue_table = None
if boto3:
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    ins_table = dynamodb.Table(INSPECTION_TABLE)
    img_table = dynamodb.Table(IMAGE_TABLE)
    ins_detail_table = dynamodb.Table(INSPECTIONS_DETAIL_TABLE)
    venue_table = dynamodb.Table(VENUE_ROOM_TABLE)


def build_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(body)
    }


# Helper: get inspections from the existing API (with aggregated totals)
def _get_inspections():
    items = []
    if not dynamodb:
        return items
    try:
        # Call the inspections-query endpoint via direct lambda invocation or table query
        # For now, use direct table query to get inspection metadata
        inspection_table = dynamodb.Table('Inspection')
        
        # Get all meta rows (which contain aggregated totals)
        resp = inspection_table.scan()
        all_items = resp.get('Items', [])
        while 'LastEvaluatedKey' in resp:
            resp = inspection_table.scan(ExclusiveStartKey=resp['LastEvaluatedKey'])
            all_items.extend(resp.get('Items', []))
        
        # Filter for meta rows only (rows without itemId, or with SK='__meta__')
        for item in all_items:
            # Meta rows don't have itemId
            if not item.get('itemId'):
                # Get corresponding metadata from InspectionData for totals
                inspection_id = item.get('inspection_id')
                if inspection_id:
                    try:
                        meta_resp = ins_table.get_item(Key={'inspection_id': inspection_id})
                        meta_data = meta_resp.get('Item', {})
                        # Merge metadata with inspection record
                        merged = {**item, **meta_data}
                        items.append(merged)
                    except Exception:
                        items.append(item)
                else:
                    items.append(item)
        
        # If no items found from Inspection table, fallback to InspectionData
        if not items:
            resp = ins_table.scan(ProjectionExpression='inspection_id, status, totals, completedAt, timestamp, updatedAt, venueName, venue_name, inspectorName, inspector_name, created_by, createdBy, updatedBy, updated_by, venueId, venue_id, byRoom')
            items.extend(resp.get('Items', []))
            while 'LastEvaluatedKey' in resp:
                resp = ins_table.scan(ExclusiveStartKey=resp['LastEvaluatedKey'], ProjectionExpression='inspection_id, status, totals, completedAt, timestamp, updatedAt, venueName, venue_name, inspectorName, inspector_name, created_by, createdBy, updatedBy, updated_by, venueId, venue_id, byRoom')
                items.extend(resp.get('Items', []))
    except Exception as e:
        print('Error getting inspections:', e)
    return items


# Helper: get venue room definitions for expected item counts
def _get_venues():
    venues = []
    if not venue_table:
        return venues
    try:
        resp = venue_table.scan()
        venues.extend(resp.get('Items', []))
        while 'LastEvaluatedKey' in resp:
            resp = venue_table.scan(ExclusiveStartKey=resp['LastEvaluatedKey'])
            venues.extend(resp.get('Items', []))
    except Exception as e:
        print('Error scanning venue table:', e)
    return venues


# Helper: count image records in the images table (fast scan with projection)
def _count_images():
    count = 0
    try:
        resp = img_table.scan(ProjectionExpression='imageId')
        count += len(resp.get('Items', []))
        while 'LastEvaluatedKey' in resp:
            resp = img_table.scan(ExclusiveStartKey=resp['LastEvaluatedKey'], ProjectionExpression='imageId')
            count += len(resp.get('Items', []))
    except Exception as e:
        print('Error counting images table:', e)
    return count


def lambda_handler(event, context):
    # Support preflight
    method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method')
    if method == 'OPTIONS':
        return build_response(204, {})

    try:
        # allow GET query param or POST body
        params = {}
        if method == 'GET':
            params = event.get('queryStringParameters') or {}
        else:
            body = event.get('body')
            if body:
                try:
                    params = json.loads(body)
                except Exception:
                    params = body if isinstance(body, dict) else {}

        days = int(params.get('days', 7))
        if days <= 0 or days > 365:
            days = 7

        # 1) Get inspections with aggregated totals from InspectionData
        inspections = _get_inspections()  # Already includes totals and byRoom data
        venues = _get_venues()  # VenueRoomData (venue definitions)

        # Build venue lookup for expected item counts
        venue_lookup = {}
        for v in venues:
            vid = v.get('venueId') or v.get('id')
            if vid:
                rooms = v.get('rooms') or []
                total_expected = sum(len(r.get('items', [])) for r in rooms)
                venue_lookup[vid] = {
                    'name': v.get('name') or v.get('venueName'),
                    'rooms': rooms,
                    'expectedItems': total_expected
                }

        # Count unique inspections to avoid duplicates
        total_inspections = len({str(it.get('inspection_id') or it.get('id') or '') for it in inspections})
        ongoing = 0
        completed_items = []
        total_items = 0
        total_fails = 0
        
        # Aggregate by venue and inspector for detailed analytics
        venue_stats = {}
        inspector_stats = {}

        for it in inspections:
            status = str(it.get('status') or '').lower()
            inspection_id = it.get('inspection_id') or it.get('id')
            if status == 'completed' or it.get('completedAt'):
                completed_items.append(it)
            else:
                ongoing += 1

            # Use totals field from API (already aggregated)
            t = it.get('totals') or None
            if t and isinstance(t, dict):
                total_items += int(t.get('total') or 0)
                total_fails += int(t.get('fail') or 0)
                
                # Track per-venue stats
                venue_id = it.get('venueId') or it.get('venue_id')
                venue_name = str(it.get('venueName') or it.get('venue_name') or venue_lookup.get(venue_id, {}).get('name') or 'Unknown')
                if venue_name not in venue_stats:
                    venue_stats[venue_name] = {'total': 0, 'pass': 0, 'fail': 0, 'inspections': 0, 'venueId': venue_id, 'expectedItems': venue_lookup.get(venue_id, {}).get('expectedItems', 0)}
                venue_stats[venue_name]['total'] += int(t.get('total') or 0)
                venue_stats[venue_name]['pass'] += int(t.get('pass') or 0)
                venue_stats[venue_name]['fail'] += int(t.get('fail') or 0)
                venue_stats[venue_name]['inspections'] += 1
            
                # Track per-inspector stats (only for completed)
                if status == 'completed' or it.get('completedAt'):
                    inspector_name = str(it.get('inspectorName') or it.get('inspector_name') or it.get('created_by') or it.get('createdBy') or it.get('updatedBy') or it.get('updated_by') or 'Unknown')
                    if inspector_name not in inspector_stats:
                        inspector_stats[inspector_name] = {'completed': 0, 'total': 0, 'pass': 0, 'times': []}
                    inspector_stats[inspector_name]['completed'] += 1
                    inspector_stats[inspector_name]['total'] += int(t.get('total') or 0)
                    inspector_stats[inspector_name]['pass'] += int(t.get('pass') or 0)
                    
                    # Calculate completion time
                    created = it.get('timestamp') or it.get('createdAt') or it.get('created_at')
                    completed = it.get('completedAt') or it.get('completed_at')
                    if created and completed:
                        try:
                            c_ts = datetime.fromisoformat(str(created).replace('Z', '+00:00')) if isinstance(created, str) else datetime.utcfromtimestamp(float(created)).replace(tzinfo=timezone.utc)
                            f_ts = datetime.fromisoformat(str(completed).replace('Z', '+00:00')) if isinstance(completed, str) else datetime.utcfromtimestamp(float(completed)).replace(tzinfo=timezone.utc)
                            if c_ts.tzinfo is None:
                                c_ts = c_ts.replace(tzinfo=timezone.utc)
                            if f_ts.tzinfo is None:
                                f_ts = f_ts.replace(tzinfo=timezone.utc)
                            hours = (f_ts - c_ts).total_seconds() / 3600
                            if 0 < hours < 168:  # reasonable range (1 week max)
                                inspector_stats[inspector_name]['times'].append(hours)
                        except Exception:
                            pass


        # Build recent days array
        now = datetime.now(timezone.utc)
        bucket = [0] * days
        for ci in completed_items:
            ts_raw = ci.get('completedAt') or ci.get('timestamp') or ci.get('updatedAt') or None
            if not ts_raw:
                continue
            try:
                if isinstance(ts_raw, str):
                    ts = datetime.fromisoformat(ts_raw.replace('Z', '+00:00'))
                else:
                    ts = datetime.utcfromtimestamp(float(ts_raw)).replace(tzinfo=timezone.utc)
            except Exception:
                try:
                    ts = datetime.fromisoformat(str(ts_raw))
                except Exception:
                    continue
            # normalize to UTC-aware then compute day diff
            try:
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                diff = (now - ts).days
            except Exception:
                continue
            if 0 <= diff < days:
                bucket[days - 1 - diff] += 1

        fail_rate = (total_fails / total_items) if total_items > 0 else None

        # count images
        images_count = _count_images()

        # Top recent completed (limit 10) - sort by completedAt desc
        recent_sorted = sorted(completed_items, key=lambda x: x.get('completedAt') or x.get('timestamp') or '', reverse=True)[:10]
        recent_simple = [{'inspection_id': r.get('inspection_id') or r.get('id'), 'venueName': r.get('venueName') or r.get('venue_name') or None, 'roomName': r.get('roomName') or r.get('room_name') or None, 'completedAt': r.get('completedAt') or r.get('timestamp')} for r in recent_sorted]

        # Build venue analytics for charts with expected item context
        top_venues = sorted([{
            'venue': k,
            'venueId': v.get('venueId'),
            'inspections': v['inspections'],
            'failRate': v['fail'] / v['total'] if v['total'] > 0 else 0,
            'totalFails': v['fail'],
            'totalItems': v['total'],
            'expectedItems': v.get('expectedItems', 0),
            'completionRate': (v['total'] / (v.get('expectedItems') * v['inspections'])) if (v.get('expectedItems', 0) > 0 and v['inspections'] > 0) else None
        } for k, v in venue_stats.items()], key=lambda x: x['failRate'], reverse=True)[:10]
        
        # Build inspector performance for charts
        inspector_perf = []
        for name, stats in inspector_stats.items():
            avg_time = sum(stats['times']) / len(stats['times']) if stats['times'] else 0
            inspector_perf.append({
                'inspector': name,
                'completed': stats['completed'],
                'passRate': stats['pass'] / stats['total'] if stats['total'] > 0 else 0,
                'avgTimeHours': round(avg_time, 1)
            })
        inspector_perf = sorted(inspector_perf, key=lambda x: x['completed'], reverse=True)[:10]
        
        # Build extended time series (last 30 days) for trends
        extended_bucket = [0] * 30
        quality_bucket = []  # pass rate per day
        for ci in completed_items:
            ts_raw = ci.get('completedAt') or ci.get('timestamp') or ci.get('updatedAt') or None
            if not ts_raw:
                continue
            try:
                if isinstance(ts_raw, str):
                    ts = datetime.fromisoformat(ts_raw.replace('Z', '+00:00'))
                else:
                    ts = datetime.utcfromtimestamp(float(ts_raw)).replace(tzinfo=timezone.utc)
            except Exception:
                try:
                    ts = datetime.fromisoformat(str(ts_raw))
                except Exception:
                    continue
            try:
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                diff = (now - ts).days
            except Exception:
                continue
            if 0 <= diff < 30:
                extended_bucket[29 - diff] += 1

        result = {
            'metrics': {
                'totalInspections': total_inspections,
                'ongoing': ongoing,
                'completed': len(completed_items),
                'failRate': fail_rate,
                'imagesCount': images_count
            },
            'recentCompleted': bucket,
            'recentInspections': recent_simple,
            'venueAnalytics': top_venues,
            'inspectorPerformance': inspector_perf,
            'completionTrend30d': extended_bucket
        }

        return build_response(200, result)

    except Exception as e:
        print('Error in dashboard lambda:', e)
        return build_response(500, {'message': 'Internal server error', 'error': str(e)})

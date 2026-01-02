# This lambda handles creating, updating, retrieving, and deleting venues.
import json
import boto3
import uuid
from datetime import datetime, timezone, timedelta

TABLE_NAME = 'VenueRoomData'
def _now_local_iso():
    # Return ISO8601 timestamp in local timezone (GMT+8)
    return datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=8))).isoformat()
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,PUT',
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

        # Log incoming body for debugging
        print('create_venue received body:', body)

        # Safety: if body contains nested JSON string in 'body', try to parse it
        if isinstance(body, dict) and isinstance(body.get('body'), str):
            try:
                nested = json.loads(body['body'])
                print('Parsed nested body:', nested)
                # merge keys (top-level action/venue preferred if present)
                for k, v in nested.items():
                    if k not in body:
                        body[k] = v
            except Exception:
                pass

        table = dynamodb.Table(TABLE_NAME)

        # If using single-endpoint style, expect { action: 'create_venue'|'update_venue'|'get_venues', venue: {...} }
        action = body.get('action') or body.get('Action')
        print('action:', action)
        if action == 'get_venues':
            # Delegate to scan behavior (same code as get_venues lambda)
            resp = table.scan()
            items = resp.get('Items', [])
            while 'LastEvaluatedKey' in resp:
                resp = table.scan(ExclusiveStartKey=resp['LastEvaluatedKey'])
                items.extend(resp.get('Items', []))
            return build_response(200, {'venues': items})

        # Delete a venue by ID
        if action == 'delete_venue':
            venue_id = body.get('venueId') or (body.get('venue') or {}).get('venueId')
            print('delete_venue id:', venue_id)
            if not venue_id:
                return build_response(400, {'message': 'venueId is required for delete_venue'})
            try:
                resp = table.delete_item(Key={'venueId': venue_id}, ReturnValues='ALL_OLD')
                deleted = resp.get('Attributes')
                if not deleted:
                    return build_response(404, {'message': 'Venue not found', 'venueId': venue_id})

                # Cascade delete: remove all inspections related to this venue from the Inspection table
                try:
                    insp_table = dynamodb.Table('Inspection')
                    client = boto3.client('dynamodb')
                    # We'll scan for items with matching venueId and delete them in batches
                    from boto3.dynamodb.conditions import Attr
                    resp_scan = insp_table.scan(FilterExpression=Attr('venueId').eq(venue_id))
                    insp_items = resp_scan.get('Items', [])
                    while 'LastEvaluatedKey' in resp_scan:
                        resp_scan = insp_table.scan(ExclusiveStartKey=resp_scan['LastEvaluatedKey'], FilterExpression=Attr('venueId').eq(venue_id))
                        insp_items.extend(resp_scan.get('Items', []))

                    deleted_ins = 0
                    if len(insp_items) > 0:
                        # discover key schema for inspection table
                        try:
                            desc = client.describe_table(TableName='Inspection')
                            key_schema = desc.get('Table', {}).get('KeySchema', [])
                            pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')
                            sk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'RANGE'), None)
                        except Exception:
                            pk_attr = 'inspection_id'
                            sk_attr = None

                        with insp_table.batch_writer() as batch:
                            for it in insp_items:
                                key = {pk_attr: it.get(pk_attr)}
                                if sk_attr and it.get(sk_attr) is not None:
                                    key[sk_attr] = it.get(sk_attr)
                                try:
                                    batch.delete_item(Key=key)
                                    deleted_ins += 1
                                except Exception as e:
                                    print('Failed to queue delete for inspection item during venue delete:', e, it)

                    print(f'Deleted {deleted_ins} inspection rows related to venue {venue_id}')

                    # Best-effort: also delete any metadata rows in InspectionData table with matching venueId
                    try:
                        insp_data_table = dynamodb.Table('InspectionData')
                        resp_scan2 = insp_data_table.scan(FilterExpression=Attr('venueId').eq(venue_id))
                        data_items = resp_scan2.get('Items', [])
                        deleted_meta = 0
                        while 'LastEvaluatedKey' in resp_scan2:
                            resp_scan2 = insp_data_table.scan(ExclusiveStartKey=resp_scan2['LastEvaluatedKey'], FilterExpression=Attr('venueId').eq(venue_id))
                            data_items.extend(resp_scan2.get('Items', []))

                        if len(data_items) > 0:
                            with insp_data_table.batch_writer() as batch2:
                                for dit in data_items:
                                    try:
                                        batch2.delete_item(Key={'inspection_id': dit.get('inspection_id')})
                                        deleted_meta += 1
                                    except Exception as e:
                                        print('Failed to delete InspectionData item during venue delete:', e, dit)
                        print(f'Deleted {deleted_meta} InspectionData rows related to venue {venue_id}')
                    except Exception as e:
                        print('Failed to delete InspectionData rows during venue delete:', e)
                except Exception as e:
                    print('Failed to cascade-delete inspections for venue:', e)

                return build_response(200, {'message': 'Deleted', 'venue': deleted})
            except Exception as e:
                print('Error deleting venue:', e)
                return build_response(500, {'message': 'Internal server error deleting venue', 'error': str(e)})

        if action not in (None, 'create_venue', 'update_venue'):
            # For backwards compatibility allow direct create payload
            pass

        venue_payload = body.get('venue') if action else body
        # If venue_payload is a JSON string, parse it
        if isinstance(venue_payload, str):
            try:
                venue_payload = json.loads(venue_payload)
            except Exception:
                pass

        print('venue_payload:', venue_payload)

        # Validate required fields
        name = venue_payload.get('name') if venue_payload else None
        address = venue_payload.get('address') if venue_payload else None
        if not name or not address:
            return build_response(400, {'message': 'name and address are required', 'what_we_saw': venue_payload})

        venue_id = venue_payload.get('venueId') or f"v-{str(uuid.uuid4())[:8]}"
        now = _now_local_iso()

        item = {
            'venueId': venue_id,
            'name': name,
            'address': address,
            'createdAt': venue_payload.get('createdAt', now),
            'updatedAt': venue_payload.get('updatedAt', now),
            'createdBy': venue_payload.get('createdBy', 'Unknown'),
            'rooms': venue_payload.get('rooms', [])
        }

        table = dynamodb.Table(TABLE_NAME)

        if action == 'update_venue' and venue_payload.get('venueId'):
            # Overwrite / upsert the venue
            table.put_item(Item=item)
            return build_response(200, {'message': 'Updated', 'venue': item})

        # Default: create
        table.put_item(Item=item)

        return build_response(200, {'message': 'Created', 'venue': item})

    except Exception as e:
        print('Error creating venue:', e)
        return build_response(500, {'message': 'Internal server error', 'error': str(e)})
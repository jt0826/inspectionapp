import json
import boto3
import uuid
from datetime import datetime

TABLE_NAME = 'VenueRoomData'
CORS_HEADERS = {
    'Access-Control-Allow-Origin': 'http://localhost:3000',
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
                # TODO: delete related inspections if you have a separate table (not implemented here)
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
        now = datetime.utcnow().isoformat()

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
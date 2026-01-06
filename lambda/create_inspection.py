import json
import boto3
from datetime import datetime, timezone, timedelta

# Optional validation via pydantic models
try:
    from .schemas.db import validate_inspection_metadata
except Exception:
    def validate_inspection_metadata(p):
        return p

# Hardcoded canonical table names (backend stable)
TABLE_INSPECTION_ITEMS = 'InspectionItems'
INSPECTION_DATA_TABLE = 'InspectionMetadata'
# Legacy compatibility
TABLE_NAME = TABLE_INSPECTION_ITEMS

def _now_local_iso():
    # Return ISO8601 timestamp in local timezone (GMT+8)
    return datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=8))).isoformat()
CORS_HEADERS = {
    # Allow all origins by default to avoid CORS blocking from mobile browsers; lock this down in production
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,PUT',
    'Content-Type': 'application/json'
}

dynamodb = boto3.resource('dynamodb')

# Helper to read InspectionMetadata robustly using common key names
def _read_inspection_metadata(iid):
    try:
        insp_table = dynamodb.Table(INSPECTION_DATA_TABLE)
        for k in ('inspection_id', 'inspectionId'):
            try:
                resp = insp_table.get_item(Key={k: iid})
                item = resp.get('Item')
                if item is not None:
                    return (k, item)
            except Exception:
                pass
        return (None, None)
    except Exception:
        return (None, None)

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
        print('create_inspection received body:', body)

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

        # Create an inspection: accept payload shaped like VenueSelection.create_inspection
        if action == 'create_inspection':
            ins = body.get('inspection') or body
            inspection_id = ins.get('inspection_id') or ins.get('id')
            if not inspection_id:
                return build_response(400, {'message': 'inspection_id is required for create_inspection'})

            # Validate metadata shape
            try:
                validated = validate_inspection_metadata(ins)
            except Exception as e:
                print('Validation error for create_inspection:', e)
                validated = None
            if validated is None:
                return build_response(400, {'message': 'invalid inspection payload'})

            # Validate inspection_id format (client-supplied)
            try:
                from .utils.id_utils import validate_id
            except Exception:
                def validate_id(v, p):
                    return (True, 'ok') if (isinstance(v, str) and v.startswith(p + '_')) else (False, f'id must start with {p}_')
            ok, msg = validate_id(inspection_id, 'inspection')
            if not ok:
                return build_response(400, {'message': 'invalid inspection_id', 'error': msg, 'inspection_id': inspection_id})

            # Discover table key schema for Inspection table (to decide sk name)
            try:
                client = boto3.client('dynamodb')
                desc = client.describe_table(TableName=TABLE_INSPECTION_ITEMS)
                key_schema = desc.get('Table', {}).get('KeySchema', [])
                pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')
                sk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'RANGE'), None)
            except Exception:
                pk_attr = 'inspection_id'
                sk_attr = None

            try:
                now = _now_local_iso()
                # Prefer explicit createdBy, fallback to updatedBy or 'Unknown' (do not use inspectorName)
                created_by = ins.get('createdBy') or ins.get('updatedBy') or 'Unknown'
                venue_id_val = ins.get('venueId') or ins.get('venue_id') or (ins.get('venue') or {}).get('id')
                venue_name_val = ins.get('venueName') or ins.get('venue_name') or (ins.get('venue') or {}).get('name')

                # Build meta item for Inspection table (do not include deprecated 'inspectorName' or duplicate 'venue_name')
                meta_item = {pk_attr: inspection_id, 'createdAt': now, 'updatedAt': now, 'createdBy': created_by, 'updatedBy': ins.get('updatedBy') or created_by, 'venueId': venue_id_val, 'venueName': venue_name_val, 'status': ins.get('status') or 'in-progress', 'completedAt': ins.get('completedAt') or None}
                if sk_attr:
                    meta_item[sk_attr] = '__meta__'

                # Note: Previously we wrote a '__meta__' row into the InspectionItems table. We no longer persist meta rows
                # alongside items; instead we maintain canonical metadata in the InspectionMetadata table only.
                insp_data_row = None
                try:
                    insp_data_table = dynamodb.Table(INSPECTION_DATA_TABLE)
                    # Write the canonical metadata row (use camelCase primary fields only)
                    insp_data_table.put_item(Item={
                        'inspection_id': inspection_id,
                        'inspectionId': inspection_id,
                        'createdAt': meta_item.get('createdAt'),
                        'updatedAt': now,
                        'createdBy': meta_item.get('createdBy'),
                        'updatedBy': meta_item.get('updatedBy'),
                        'venueId': meta_item.get('venueId'),
                        'venueName': meta_item.get('venueName'),
                        'status': meta_item.get('status') or 'in-progress',
                        'completedAt': meta_item.get('completedAt')
                    })
                    try:
                        k, insp_data_row = _read_inspection_metadata(inspection_id)
                    except Exception as e:
                        print('InspectionData get_item error:', e)
                        insp_data_row = None
                except Exception as e:
                    print('Failed to upsert InspectionData meta on create_inspection:', e)

                return build_response(200, {'message': 'Created', 'inspection_id': inspection_id, 'inspectionData': insp_data_row})
            except Exception as e:
                print('Failed to create inspection meta:', e)
                return build_response(500, {'message': 'Failed to create inspection', 'error': str(e)})

        # For this lambda we only support create_inspection action; other actions are not supported here
        return build_response(400, {'message': 'Unsupported action for create_inspection lambda', 'action': action})

    except Exception as e:
        print('Error creating inspection:', e)
        return build_response(500, {'message': 'Internal server error', 'error': str(e)})
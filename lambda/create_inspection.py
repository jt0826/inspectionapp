import json
import boto3
import uuid
from datetime import datetime, timezone, timedelta

TABLE_NAME = 'Inspection'

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

            # Discover table key schema for Inspection table (to decide sk name)
            try:
                client = boto3.client('dynamodb')
                desc = client.describe_table(TableName='Inspection')
                key_schema = desc.get('Table', {}).get('KeySchema', [])
                pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')
                sk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'RANGE'), None)
            except Exception:
                pk_attr = 'inspection_id'
                sk_attr = None

            try:
                now = _now_local_iso()
                created_by = ins.get('createdBy') or ins.get('inspectorName') or ins.get('updatedBy') or 'Unknown'
                venue_id_val = ins.get('venueId') or ins.get('venue_id') or (ins.get('venue') or {}).get('id')
                venue_name_val = ins.get('venueName') or ins.get('venue_name') or (ins.get('venue') or {}).get('name')

                # Build meta item for Inspection table
                meta_item = {pk_attr: inspection_id, 'createdAt': now, 'updatedAt': now, 'createdBy': created_by, 'updatedBy': ins.get('updatedBy') or created_by, 'inspectorName': ins.get('inspectorName') or created_by, 'venueId': venue_id_val, 'venueName': venue_name_val, 'venue_name': venue_name_val, 'status': ins.get('status') or 'in-progress', 'completedAt': ins.get('completedAt') or None}
                if sk_attr:
                    meta_item[sk_attr] = '__meta__'

                insp_table = dynamodb.Table('Inspection')
                insp_table.put_item(Item=meta_item)

                # Upsert into InspectionData for quick listing
                insp_data_row = None
                try:
                    insp_data_table = dynamodb.Table('InspectionData')
                    insp_data_table.put_item(Item={
                        'inspection_id': inspection_id,
                        'createdAt': meta_item.get('createdAt'),
                        'updatedAt': now,
                        'createdBy': meta_item.get('createdBy'),
                        'updatedBy': meta_item.get('updatedBy'),
                        'inspectorName': meta_item.get('inspectorName'),
                        'venueId': meta_item.get('venueId'),
                        'venueName': meta_item.get('venueName'),
                        'venue_name': meta_item.get('venue_name'),
                        'status': meta_item.get('status') or 'in-progress',
                        'completedAt': meta_item.get('completedAt')
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

        # For this lambda we only support create_inspection action; other actions are not supported here
        return build_response(400, {'message': 'Unsupported action for create_inspection lambda', 'action': action})

    except Exception as e:
        print('Error creating inspection:', e)
        return build_response(500, {'message': 'Internal server error', 'error': str(e)})
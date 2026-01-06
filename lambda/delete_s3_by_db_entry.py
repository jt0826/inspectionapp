import json
import os
import boto3
from boto3.dynamodb.conditions import Key, Attr

# Config
TABLE_NAME = 'InspectionImages'
BUCKET_NAME = 'inspectionappimages'
REGION = 'ap-southeast-1'

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Content-Type': 'application/json'
}

s3 = boto3.client('s3', region_name=REGION)
dynamodb = boto3.resource('dynamodb', region_name=REGION)


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

        inspection_id = body.get('inspectionId')
        room_id = body.get('roomId')
        item_id = body.get('itemId')
        image_id = body.get('imageId')
        s3_key_param = body.get('s3Key')

        if not inspection_id or not room_id or not item_id or (not image_id and not s3_key_param):
            return build_response(400, {'message': 'inspectionId, roomId, itemId and (imageId or s3Key) are required'})

        table = dynamodb.Table(TABLE_NAME)
        s3_key = None
        found_sort_key = None

        # Discover InspectionImages key schema (PK & optional SK)
        try:
            client = boto3.client('dynamodb')
            desc = client.describe_table(TableName=TABLE_NAME)
            key_schema = desc.get('Table', {}).get('KeySchema', [])
            pk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'HASH'), 'inspection_id')
            sk_attr = next((k['AttributeName'] for k in key_schema if k['KeyType'] == 'RANGE'), None)
        except Exception as e:
            print('Failed to describe table for delete_s3_by_db_entry:', e)
            pk_attr = 'inspection_id'
            sk_attr = 'room_id#item_id#image_id'

        # Try to resolve by imageId first (prefer exact match)
        if image_id:
            sort_key = f"{room_id}#{item_id}#{image_id}"

            # Try querying using several candidate PK/SK attribute names to handle naming variations
            pk_candidates = [pk_attr, 'inspectionId']
            sk_candidates = [sk_attr, 'roomId#itemId#imageId']
            query_succeeded = False
            last_exc = None
            for p in pk_candidates:
                for s in sk_candidates:
                    if not s:
                        continue
                    try:
                        resp = table.query(KeyConditionExpression=Key(p).eq(inspection_id), FilterExpression=Attr(s).eq(sort_key))
                        items = resp.get('Items') or []
                        if len(items) > 0:
                            item = items[0]
                            s3_key = item.get('s3Key')
                            found_sort_key = item.get(s) or sort_key
                            found_sk_attr = s
                            query_succeeded = True
                            break
                    except Exception as e:
                        last_exc = e
                        # try next candidate
                        continue
                if query_succeeded:
                    break

            if not query_succeeded:
                # As a last resort, try get_item with common SK names
                tried = False
                for name in ('room_id#item_id#image_id', 'roomId#itemId#imageId'):
                    for p in pk_candidates:
                        try:
                            resp = table.get_item(Key={p: inspection_id, name: sort_key})
                            item = resp.get('Item')
                            if item:
                                s3_key = item.get('s3Key')
                                found_sort_key = sort_key
                                found_sk_attr = name
                                tried = True
                                break
                        except Exception as _e:
                            last_exc = _e
                            continue
                    if tried:
                        break

                if not tried and not query_succeeded:
                    print('Image metadata not found; last err:', last_exc)
                    return build_response(404, {'message': 'Image metadata not found'})

            if not s3_key:
                return build_response(400, {'message': 's3Key missing in metadata'})

        else:
            # try to find the DB entry by s3Key
            try:
                pk_candidates = [pk_attr, 'inspectionId', 'inspection_id']
                query_found = False
                for p in pk_candidates:
                    try:
                        resp = table.query(KeyConditionExpression=Key(p).eq(inspection_id), FilterExpression=Attr('s3Key').eq(s3_key_param))
                        items = resp.get('Items') or []
                        if len(items) > 0:
                            item = items[0]
                            s3_key = item.get('s3Key')
                            # Determine sort key name if present
                            if sk_attr and item.get(sk_attr):
                                found_sort_key = item.get(sk_attr)
                                found_sk_attr = sk_attr
                            else:
                                found_sort_key = item.get('room_id#item_id#image_id') or item.get('roomId#itemId#imageId')
                                found_sk_attr = 'room_id#item_id#image_id' if item.get('room_id#item_id#image_id') else 'roomId#itemId#imageId'
                            query_found = True
                            break
                    except Exception:
                        continue

                if not query_found:
                    # fall back to deleting provided s3Key directly
                    s3_key = s3_key_param
            except Exception as e:
                print('Error querying DB for s3Key:', e)
                return build_response(500, {'message': 'DB query failed', 'error': str(e)})

        # Delete object
        try:
            s3.delete_object(Bucket=BUCKET_NAME, Key=s3_key)
        except Exception as e:
            print('Error deleting S3 object:', e)
            return build_response(500, {'message': 'Failed to delete object from S3', 'error': str(e)})

        return build_response(200, {'message': 'Deleted from S3', 's3Key': s3_key, 'sortKey': found_sort_key})

    except Exception as e:
        print('Error in delete_s3_by_db_entry:', e)
        return build_response(500, {'message': 'Internal server error', 'error': str(e)})
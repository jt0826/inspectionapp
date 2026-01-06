import json
import boto3
from datetime import datetime, timezone, timedelta

# Table names are hardcoded below (stable in this deployment)


# Hardcoded canonical table names (backend stable)
TABLE_VENUE_ROOMS = 'VenueRooms'
INSPECTION_DATA_TABLE = 'InspectionMetadata'
TABLE_NAME = TABLE_VENUE_ROOMS
BUCKET_NAME = 'inspectionappimages'

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

                # Cascade delete: remove all inspections, their items, and any images/metadata related to this venue
                try:
                    TABLE_INSPECTION_ITEMS = 'InspectionItems'
                    TABLE_INSPECTION_IMAGES = 'InspectionImages'

                    insp_items_table = dynamodb.Table(TABLE_INSPECTION_ITEMS)
                    insp_meta_table = dynamodb.Table(INSPECTION_DATA_TABLE)
                    images_table = dynamodb.Table(TABLE_INSPECTION_IMAGES)
                    client = boto3.client('dynamodb')
                    s3_client = boto3.client('s3')

                    from boto3.dynamodb.conditions import Attr, Key

                    # 1) Find all inspection IDs from InspectionMetadata that reference this venue
                    inspection_ids = []
                    try:
                        scan_kwargs = {'FilterExpression': Attr('venueId').eq(venue_id)}
                        resp = insp_meta_table.scan(**scan_kwargs)
                        meta_items = resp.get('Items', [])
                        while 'LastEvaluatedKey' in resp:
                            resp = insp_meta_table.scan(ExclusiveStartKey=resp['LastEvaluatedKey'], **scan_kwargs)
                            meta_items.extend(resp.get('Items', []) or [])
                        for m in meta_items:
                            iid = m.get('inspection_id') or m.get('inspectionId') or m.get('id')
                            if iid:
                                inspection_ids.append(iid)
                    except Exception as e:
                        print('Failed to scan InspectionMetadata for venueId:', e)

                    # 2) Delete metadata rows for those inspections (best-effort)
                    deleted_meta = 0
                    try:
                        # determine metadata table key name
                        try:
                            desc_meta = client.describe_table(TableName=INSPECTION_DATA_TABLE)
                            meta_key_schema = desc_meta.get('Table', {}).get('KeySchema', [])
                            meta_pk = next((k['AttributeName'] for k in meta_key_schema if k['KeyType'] == 'HASH'), 'inspection_id')
                        except Exception:
                            meta_pk = 'inspection_id'

                        if inspection_ids:
                            with insp_meta_table.batch_writer() as b:
                                for iid in inspection_ids:
                                    try:
                                        b.delete_item(Key={meta_pk: iid})
                                        deleted_meta += 1
                                    except Exception as e:
                                        print('Failed to delete metadata row for inspection', iid, e)
                    except Exception as e:
                        print('Failed to delete inspection metadata rows:', e)

                    # 3) For each inspection, delete InspectionItems rows (query by partition key where possible)
                    deleted_items = 0
                    try:
                        # discover items table key schema
                        try:
                            desc_items = client.describe_table(TableName=TABLE_INSPECTION_ITEMS)
                            item_key_schema = desc_items.get('Table', {}).get('KeySchema', [])
                            items_pk = next((k['AttributeName'] for k in item_key_schema if k['KeyType'] == 'HASH'), 'inspection_id')
                            items_sk = next((k['AttributeName'] for k in item_key_schema if k['KeyType'] == 'RANGE'), None)
                        except Exception:
                            items_pk = 'inspection_id'
                            items_sk = None

                        for iid in inspection_ids:
                            # try query by partition key
                            try:
                                resp_q = insp_items_table.query(KeyConditionExpression=Key(items_pk).eq(iid), ConsistentRead=True)
                                items = resp_q.get('Items', [])
                                while 'LastEvaluatedKey' in resp_q:
                                    resp_q = insp_items_table.query(KeyConditionExpression=Key(items_pk).eq(iid), ExclusiveStartKey=resp_q['LastEvaluatedKey'], ConsistentRead=True)
                                    items.extend(resp_q.get('Items', []) or [])
                            except Exception:
                                # fallback to scan filter
                                try:
                                    resp_s = insp_items_table.scan(FilterExpression=Attr('inspection_id').eq(iid))
                                    items = resp_s.get('Items', [])
                                    while 'LastEvaluatedKey' in resp_s:
                                        resp_s = insp_items_table.scan(ExclusiveStartKey=resp_s['LastEvaluatedKey'], FilterExpression=Attr('inspection_id').eq(iid))
                                        items.extend(resp_s.get('Items', []) or [])
                                except Exception as e:
                                    print('Failed to list inspection items for', iid, e)
                                    items = []

                            if items:
                                with insp_items_table.batch_writer() as b:
                                    for it in items:
                                        try:
                                            key = {items_pk: it.get(items_pk) or iid}
                                            if items_sk and it.get(items_sk) is not None:
                                                key[items_sk] = it.get(items_sk)
                                            b.delete_item(Key=key)
                                            deleted_items += 1
                                        except Exception as e:
                                            print('Failed to queue delete for inspection item during venue delete:', e, it)

                    except Exception as e:
                        print('Failed to delete inspection items for venue:', e)

                    # 4) Delete image metadata rows from InspectionImages and remove S3 objects
                    deleted_image_rows = 0
                    deleted_s3_objects = 0
                    try:
                        # determine images table key schema
                        try:
                            desc_imgs = client.describe_table(TableName=TABLE_INSPECTION_IMAGES)
                            img_key_schema = desc_imgs.get('Table', {}).get('KeySchema', [])
                            imgs_pk = next((k['AttributeName'] for k in img_key_schema if k['KeyType'] == 'HASH'), 'inspectionId')
                            imgs_sk = next((k['AttributeName'] for k in img_key_schema if k['KeyType'] == 'RANGE'), None)
                        except Exception:
                            imgs_pk = 'inspectionId'
                            imgs_sk = None

                        s3_delete_keys = []

                        # If we have inspection_ids from metadata, use them
                        ids_to_scan = inspection_ids if inspection_ids else []

                        # If no inspection ids found, fall back to scanning images table for venueId
                        if not ids_to_scan:
                            try:
                                resp_imgs_scan = images_table.scan(FilterExpression=Attr('venueId').eq(venue_id))
                                imgs = resp_imgs_scan.get('Items', [])
                                while 'LastEvaluatedKey' in resp_imgs_scan:
                                    resp_imgs_scan = images_table.scan(ExclusiveStartKey=resp_imgs_scan['LastEvaluatedKey'], FilterExpression=Attr('venueId').eq(venue_id))
                                    imgs.extend(resp_imgs_scan.get('Items', []) or [])
                                # delete rows and collect s3 keys
                                with images_table.batch_writer() as b:
                                    for img in imgs:
                                        try:
                                            key = {imgs_pk: img.get(imgs_pk)}
                                            if imgs_sk and img.get(imgs_sk) is not None:
                                                key[imgs_sk] = img.get(imgs_sk)
                                            b.delete_item(Key=key)
                                            deleted_image_rows += 1
                                            s3k = img.get('s3Key') or img.get('s3_key') or img.get('filename')
                                            if s3k:
                                                s3_delete_keys.append(s3k)
                                        except Exception as e:
                                            print('Failed to delete image DB row:', e, img)
                            except Exception as e:
                                print('Failed to scan InspectionImages by venueId:', e)
                        else:
                            # Query images by inspection id and delete
                            for iid in ids_to_scan:
                                try:
                                    resp_imgs = images_table.query(KeyConditionExpression=Key(imgs_pk).eq(iid))
                                    imgs = resp_imgs.get('Items', [])
                                    while 'LastEvaluatedKey' in resp_imgs:
                                        resp_imgs = images_table.query(KeyConditionExpression=Key(imgs_pk).eq(iid), ExclusiveStartKey=resp_imgs['LastEvaluatedKey'])
                                        imgs.extend(resp_imgs.get('Items', []) or [])
                                    with images_table.batch_writer() as b:
                                        for img in imgs:
                                            try:
                                                key = {imgs_pk: img.get(imgs_pk) or iid}
                                                if imgs_sk and img.get(imgs_sk) is not None:
                                                    key[imgs_sk] = img.get(imgs_sk)
                                                b.delete_item(Key=key)
                                                deleted_image_rows += 1
                                                s3k = img.get('s3Key') or img.get('s3_key') or img.get('filename')
                                                if s3k:
                                                    s3_delete_keys.append(s3k)
                                            except Exception as e:
                                                print('Failed to delete image DB row:', e, img)
                                except Exception as e:
                                    print('Failed to query images for inspection', iid, e)

                        # Bulk delete S3 objects in reasonable chunks
                        if s3_delete_keys:
                            def chunks(lst, n):
                                for i in range(0, len(lst), n):
                                    yield lst[i:i + n]
                            for chunk in chunks(s3_delete_keys, 1000):
                                try:
                                    resp = s3_client.delete_objects(Bucket=BUCKET_NAME, Delete={'Objects': [{'Key': k} for k in chunk]})
                                    deleted = resp.get('Deleted', [])
                                    deleted_s3_objects += len(deleted)
                                except Exception as e:
                                    print('Failed to delete some S3 objects during venue delete:', e) 
                    except Exception as e:
                        print('Failed to delete image metadata or S3 objects for venue:', e)

                    print(f'Deleted {deleted_items} item rows, {deleted_meta} metadata rows, {deleted_image_rows} image rows and {deleted_s3_objects} S3 objects for venue {venue_id}')

                    # Prepare summary to return to caller for UI messaging
                    try:
                        summary = {
                            'inspections_found': len(inspection_ids) if inspection_ids is not None else 0,
                            'deleted_items': deleted_items,
                            'deleted_metadata': deleted_meta,
                            'deleted_image_rows': deleted_image_rows,
                            'deleted_s3_objects': deleted_s3_objects,
                        }
                    except Exception:
                        summary = {
                            'inspections_found': len(inspection_ids) if inspection_ids is not None else 0,
                            'deleted_items': deleted_items,
                            'deleted_metadata': deleted_meta,
                            'deleted_image_rows': deleted_image_rows,
                            'deleted_s3_objects': deleted_s3_objects,
                        }

                except Exception as e:
                    print('Failed to cascade-delete inspections for venue:', e)
                    summary = {
                        'inspections_found': len(inspection_ids) if inspection_ids is not None else 0,
                        'deleted_items': deleted_items,
                        'deleted_metadata': deleted_meta,
                        'deleted_image_rows': deleted_image_rows,
                        'deleted_s3_objects': deleted_s3_objects,
                        'error': str(e)
                    }

                return build_response(200, {'message': 'Deleted', 'venue': deleted, 'summary': summary})
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

        # Require a client-supplied, well-formed venueId (no server generation)
        venue_id = venue_payload.get('venueId') or (venue_payload.get('venue') or {}).get('venueId')
        if not venue_id:
            return build_response(400, {'message': 'venueId is required and must be a well-formed id (prefix: venue_...)'})

        try:
            from .utils.id_utils import validate_id
        except Exception:
            # Fallback simple validator if import fails
            def validate_id(v, p):
                return (True, 'ok') if (isinstance(v, str) and v.startswith(p + '_')) else (False, f'id must start with {p}_')

        ok, msg = validate_id(venue_id, 'venue')
        if not ok:
            return build_response(400, {'message': 'invalid venueId', 'error': msg, 'venueId': venue_id})

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
import json
import boto3
from boto3.dynamodb.conditions import Key

# Config
IMAGE_TABLE = 'InspectionImages'
DATA_TABLE = 'InspectionData'
BUCKET_NAME = 'testapp2608'
REGION = 'ap-southeast-1'

s3 = boto3.client('s3', region_name=REGION)
dynamodb = boto3.resource('dynamodb', region_name=REGION)
images_table = dynamodb.Table(IMAGE_TABLE)
data_table = dynamodb.Table(DATA_TABLE)

# Common CORS headers (restrict origin to your frontend in production)
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",   # or "*" for dev
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET,DELETE",
    "Content-Type": "application/json"
}


def build_response(status_code: int, body: dict):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body)
    }


def _query_images_for_inspection(inspection_id: str):
    items = []
    try:
        resp = images_table.query(KeyConditionExpression=Key('inspection_id').eq(inspection_id))
        items.extend(resp.get('Items', []))
        # handle pagination
        while 'LastEvaluatedKey' in resp:
            resp = images_table.query(KeyConditionExpression=Key('inspection_id').eq(inspection_id), ExclusiveStartKey=resp['LastEvaluatedKey'])
            items.extend(resp.get('Items', []))
    except Exception as e:
        print('Error querying images for inspection:', e)
    return items


def _batch_delete_s3(keys):
    # keys: list of s3 keys
    results = {'deleted': [], 'failed': []}
    # Delete in batches of 1000 (S3 limit)
    for i in range(0, len(keys), 1000):
        batch = keys[i:i+1000]
        try:
            resp = s3.delete_objects(Bucket=BUCKET_NAME, Delete={'Objects': [{'Key': k} for k in batch]})
            deleted = resp.get('Deleted', [])
            errors = resp.get('Errors', [])
            results['deleted'].extend([d.get('Key') for d in deleted])
            for err in errors:
                results['failed'].append({'Key': err.get('Key'), 'Code': err.get('Code'), 'Message': err.get('Message')})
        except Exception as e:
            print('S3 delete_objects failed for batch:', e)
            for k in batch:
                results['failed'].append({'Key': k, 'Message': str(e)})
    return results


def _delete_image_db_record(inspection_id, sort_key):
    try:
        images_table.delete_item(Key={'inspection_id': inspection_id, 'room_id#item_id#image_id': sort_key})
        return True
    except Exception as e:
        print('Failed to delete image DB record', sort_key, e)
        return False


def lambda_handler(event, context):
    print("Event:", json.dumps(event))  # CloudWatch debug

    # Handle preflight
    method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method")
    if method == "OPTIONS":
        return build_response(204, {})

    try:
        # Parse body (API Gateway proxy may pass raw string)
        body = {}
        if event.get("body"):
            try:
                body = json.loads(event["body"])
            except Exception:
                body = event["body"] or {}

        inspection_id = (
            body.get('inspection_id') or 
            body.get('inspection-id') or 
            body.get('inspectionId') or 
            (event.get('queryStringParameters') or {}).get('inspection_id')
        )

        cascade = bool(body.get('cascade'))

        if not inspection_id:
            return build_response(400, {
                "message": "inspection_id is required",
                "what_lambda_saw": body
            })

        summary = {'inspection_id': inspection_id, 'deletedImages': 0, 'imageFailures': [], 'inspectionDeleted': False}

        if cascade:
            # 1) list images
            images = _query_images_for_inspection(inspection_id)
            s3_keys = [it.get('s3Key') for it in images if it.get('s3Key')]
            sort_keys = [it.get('room_id#item_id#image_id') for it in images if it.get('room_id#item_id#image_id')]

            # 2) delete s3 objects in batches
            if s3_keys:
                s3_res = _batch_delete_s3(s3_keys)
                deleted = s3_res.get('deleted', [])
                failed = s3_res.get('failed', [])
                summary['deletedImages'] = len(deleted)
                if failed:
                    for f in failed:
                        summary['imageFailures'].append({'s3Key': f.get('Key'), 'reason': f.get('Message') or f.get('Code')})

            # 3) delete DB image records (best-effort)
            for sk in sort_keys:
                ok = _delete_image_db_record(inspection_id, sk)
                if not ok:
                    summary['imageFailures'].append({'sortKey': sk, 'reason': 'db-delete-failed'})

        # Finally, delete the inspection record(s) from InspectionData table
        try:
            resp = data_table.delete_item(Key={'inspection_id': inspection_id})
            print("Dynamo delete response:", resp)  # debug
            summary['inspectionDeleted'] = True
        except Exception as e:
            print('Failed to delete inspection record', e)
            return build_response(500, { 'message': 'Failed to delete inspection record', 'error': str(e), 'summary': summary })

        return build_response(200, {'message': 'Deleted', 'summary': summary})

    except Exception as e:
        print("Error deleting inspection:", str(e))
        return build_response(500, {"message": "Internal server error", "error": str(e)})
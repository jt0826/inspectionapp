import json
import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('InspectionData')  # update if needed

# Common CORS headers (restrict origin to your frontend in production)
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "http://localhost:3000",   # or "*" for dev
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

        if not inspection_id:
            return build_response(400, {
                "message": "inspection_id is required",
                "what_lambda_saw": body
            })

        # Perform delete
        resp = table.delete_item(Key={'inspection_id': inspection_id})
        print("Dynamo delete response:", resp)  # debug

        return build_response(200, {"message": "Deleted", "inspection_id": inspection_id})

    except Exception as e:
        print("Error deleting inspection:", str(e))
        return build_response(500, {"message": "Internal server error", "error": str(e)})
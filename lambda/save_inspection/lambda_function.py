from .handler import handle_save_inspection
from .list_inspections import handle_list_inspections
from .get_inspection import handle_get_inspection
from .summary import handle_get_inspection_summary
from .completeness import check_inspection_complete

def lambda_handler(event, context):
    # Provide a small wrapper that exposes the same contract as previous lambda
    # Ensure json is available in all code paths (used in error handling)
    import json
    body = {}
    if event.get('body'):
        try:
            body = json.loads(event.get('body') or '{}')
        except Exception:
            # If body is not JSON, keep raw body or default to {}
            body = event.get('body') or {}

    # Provide debug function collector for inner handler
    debug_msgs = []
    def debug(msg):
        try:
            s = str(msg)
        except Exception:
            s = repr(msg)
        print(s)
        debug_msgs.append(s)

    action = body.get('action') or body.get('Action')
    debug(f"lambda_function: received action={action}")

    try:
        if action == 'save_inspection':
            resp = handle_save_inspection(body, debug)
        elif action == 'list_inspections':
            resp = handle_list_inspections(body, debug)
        elif action == 'get_inspection':
            resp = handle_get_inspection(body, debug)
        elif action == 'get_inspection_summary':
            resp = handle_get_inspection_summary(body, debug)
        elif action == 'check_inspection_complete':
            result = check_inspection_complete(body.get('inspection_id') or (body.get('inspection') or {}).get('inspection_id') or (body.get('inspection') or {}).get('id'), body.get('venueId') or body.get('venue_id') or (body.get('inspection') or {}).get('venueId'), debug=debug)
            if isinstance(result, dict):
                result['debug'] = debug_msgs
            resp = {'statusCode': 200, 'headers': {}, 'body': json.dumps(result)}
        else:
            resp = {'statusCode': 400, 'headers': {}, 'body': json.dumps({'message': 'Unsupported action', 'debug': debug_msgs})}
    except Exception as e:
        debug(f"lambda handler dispatch failed: {e}")
        # Build a safe error body; if json.dumps fails for any reason, fall back to a minimal body
        try:
            resp = {'statusCode': 500, 'headers': {}, 'body': json.dumps({'message': 'Internal server error', 'error': str(e), 'debug': debug_msgs})}
        except Exception:
            resp = {'statusCode': 500, 'headers': {}, 'body': json.dumps({'message': 'Internal server error'})}

    # If the response body is JSON stringified, attach debug messages
    try:
        import json
        if isinstance(resp, dict) and 'body' in resp:
            body_json = json.loads(resp['body']) if isinstance(resp['body'], str) else resp['body']
            if isinstance(body_json, dict):
                body_json['debug'] = debug_msgs
                resp['body'] = json.dumps(body_json)
    except Exception:
        pass

    return resp

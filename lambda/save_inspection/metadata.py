from typing import Tuple, Any
import boto3

dynamodb = boto3.resource('dynamodb')
INSPECTION_DATA_TABLE = 'InspectionMetadata'


def read_inspection_metadata(iid: str) -> Tuple[str, Any]:
    insp_table = dynamodb.Table(INSPECTION_DATA_TABLE)
    for k in ('inspectionId', 'inspection_id'):
        try:
            resp = insp_table.get_item(Key={k: iid})
            item = resp.get('Item')
            if item is not None:
                return (k, item)
        except Exception:
            pass
    return (None, None)


def update_inspection_metadata(iid: str, update_expr: str, expr_vals: dict, debug=None) -> bool:
    insp_table = dynamodb.Table(INSPECTION_DATA_TABLE)
    expr_names = None
    if update_expr and '#s' in update_expr:
        expr_names = {'#s': 'status'}
    success = False
    last_err = None
    for k in ('inspectionId', 'inspection_id'):
        try:
            kwargs = {
                'Key': {k: iid},
                'UpdateExpression': update_expr,
                'ExpressionAttributeValues': expr_vals
            }
            if expr_names:
                kwargs['ExpressionAttributeNames'] = expr_names
            resp = insp_table.update_item(**kwargs)
            if debug:
                debug(f"update_inspection_metadata: success key={k}, inspection={iid}")
            success = True
            break
        except Exception as e:
            last_err = e
            if debug:
                debug(f"update_inspection_metadata: failed key={k}, inspection={iid}, err={e}")
            continue
    if not success and debug:
        debug(f"update_inspection_metadata: all attempts failed for inspection={iid}, last_err={last_err}")
    return success
